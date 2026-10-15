import cors from "cors";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".streams");
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
const STREAM_ORIGINS = (process.env.STREAM_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
const sessions = new Map();
const app = express();

app.use(cors({ origin(origin, callback) {
  if (!origin || !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  return callback(new Error("Origin não autorizado"));
}}));
app.use(express.json({ limit: "8kb" }));

function isApprovedSource(source) {
  try { return STREAM_ORIGINS.includes(new URL(source).origin); } catch { return false; }
}
async function stopSession(id) {
  const session = sessions.get(id);
  if (!session) return;
  session.process.kill("SIGTERM");
  sessions.delete(id);
  await fs.rm(path.join(OUTPUT_DIR, id), { recursive: true, force: true });
}
app.post("/api/streams", async (request, response) => {
  const { source } = request.body || {};
  if (typeof source !== "string" || !isApprovedSource(source)) {
    return response.status(400).json({ error: "Origem não autorizada. Configure STREAM_ORIGINS." });
  }
  const id = crypto.randomBytes(18).toString("hex");
  const directory = path.join(OUTPUT_DIR, id);
  await fs.mkdir(directory, { recursive: true });
  const playlist = path.join(directory, "index.m3u8");
  const process = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "warning", "-i", source,
    "-map", "0:v:0?", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast",
    "-tune", "zerolatency", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ac", "2",
    "-f", "hls", "-hls_time", "4", "-hls_list_size", "8", "-hls_flags", "delete_segments+append_list+independent_segments",
    "-hls_segment_filename", path.join(directory, "segment%05d.ts"), playlist
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const session = { process, createdAt: Date.now() };
  sessions.set(id, session);
  process.stderr.on("data", chunk => console.warn(`[ffmpeg:${id.slice(0, 6)}] ${chunk.toString().trim()}`));
  process.on("exit", () => sessions.delete(id));
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try { await fs.access(playlist); break; } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  try { await fs.access(playlist); }
  catch { await stopSession(id); return response.status(502).json({ error: "FFmpeg não conseguiu abrir o stream de origem." }); }
  return response.status(201).json({ id, playlist: `/hls/${id}/index.m3u8` });
});
app.use("/hls", express.static(OUTPUT_DIR, { setHeaders(response) { response.setHeader("Cache-Control", "no-store"); } }));
app.get("/health", (_request, response) => response.json({ ok: true, sessions: sessions.size }));
setInterval(() => { const limit = Date.now() - 60 * 60 * 1000; for (const [id, session] of sessions) if (session.createdAt < limit) stopSession(id).catch(console.error); }, 10 * 60 * 1000).unref();
await fs.mkdir(OUTPUT_DIR, { recursive: true });
app.listen(PORT, () => console.log(`MyStream transcoder listening on :${PORT}`));
