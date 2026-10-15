import "./style.css";
import "./diagnostics.css";

const DB_KEY = "mystream-settings-v1";
const FAV_KEY = "mystream-favourites-v1";
const state = { settings: load(DB_KEY, null), favourites: load(FAV_KEY, []), data: null, tab: "live", category: "all", query: "" };

const app = document.querySelector("#app");
const esc = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function endpoint(path, parameters = {}) {
  const base = state.settings.url.replace(/\/$/, "");
  const query = new URLSearchParams({ username: state.settings.username, password: state.settings.password, ...parameters });
  return `${base}/${path}?${query}`;
}
async function api(action) {
  const response = await fetch(endpoint("player_api.php", { action }));
  if (!response.ok) throw new Error(`Servidor devolveu ${response.status}`);
  return response.json();
}
function typeFor(tab) { return tab === "live" ? "live" : tab === "series" ? "series" : "vod"; }
function streamUrl(item) {
  const kind = typeFor(state.tab);
  // IPTV panels often advertise Live channels as MPEG-TS; HLS is browser-safe.
  const ext = state.tab === "live" ? "m3u8" : (item.container_extension || "mp4");
  const base = state.settings.url.replace(/\/$/, "");
  return `${base}/${kind}/${encodeURIComponent(state.settings.username)}/${encodeURIComponent(state.settings.password)}/${item.stream_id}.${ext}`;
}
function renderSetup(error = "") {
  app.innerHTML = `<main class="setup"><section class="setup-card"><div class="brand"><span class="mark">▶</span><h1>MyStream</h1></div><p>O teu leitor IPTV privado, simples e sem contas externas.</p><form id="setup-form"><label>Endereço do servidor <input name="url" type="url" placeholder="http://exemplo.com:8080" required value="${esc(state.settings?.url)}" /></label><label>Utilizador <input name="username" autocomplete="username" required value="${esc(state.settings?.username)}" /></label><label>Palavra-passe <input name="password" type="password" autocomplete="current-password" required value="${esc(state.settings?.password)}" /></label><label>URL do proxy de compatibilidade <input name="proxyUrl" type="url" placeholder="https://proxy.exemplo.com (opcional)" value="${esc(state.settings?.proxyUrl)}" /></label><small>Usa-o quando o serviço enviar codecs incompatíveis; o proxy é o teu servidor privado.</small>${error ? `<p class="error">${esc(error)}</p>` : ""}<button>Entrar</button></form><small>Os dados ficam apenas neste browser e são enviados ao proxy apenas quando escolhes reproduzir.</small></section></main>`;
  document.querySelector("#setup-form").addEventListener("submit", connect);
}
async function connect(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.settings = Object.fromEntries(form);
  event.currentTarget.querySelector("button").textContent = "A ligar…";
  try {
    const info = await fetch(endpoint("player_api.php")).then(response => response.json());
    if (String(info?.user_info?.auth) !== "1") throw new Error("Dados de acesso inválidos.");
    save(DB_KEY, state.settings);
    await fetchData();
    render();
  } catch (error) {
    state.settings = null;
    renderSetup(error.message.includes("fetch") ? "Não foi possível contactar o servidor. Pode ser CORS, endereço incorreto ou falta de ligação." : error.message);
  }
}
async function fetchData() {
  const [liveCategories, seriesCategories, vodCategories, live, series, vod] = await Promise.all([
    api("get_live_categories"), api("get_series_categories"), api("get_vod_categories"), api("get_live_streams"), api("get_series"), api("get_vod_streams")
  ]);
  state.data = { live: { categories: liveCategories, items: live }, series: { categories: seriesCategories, items: series }, vod: { categories: vodCategories, items: vod } };
}
function render() {
  const dataset = state.data[state.tab];
  const filtered = dataset.items.filter(item => (state.category === "all" || String(item.category_id) === state.category) && item.name?.toLowerCase().includes(state.query.toLowerCase()));
  app.innerHTML = `<div class="shell"><header><div class="brand"><span class="mark">▶</span><strong>MyStream</strong></div><nav>${[["live","TV em direto"],["series","Séries"],["vod","Filmes"]].map(([id,label]) => `<button class="tab ${state.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}</nav><button class="settings" title="Definições">⚙</button></header><main><section class="toolbar"><div class="categories"><button class="chip ${state.category === "all" ? "selected" : ""}" data-category="all">Tudo</button>${dataset.categories.map(category => `<button class="chip ${state.category === String(category.category_id) ? "selected" : ""}" data-category="${category.category_id}">${esc(category.category_name)}</button>`).join("")}</div><label class="search"><span>⌕</span><input placeholder="Pesquisar" value="${esc(state.query)}" /></label></section><p class="count">${filtered.length} ${state.tab === "live" ? "canais" : state.tab === "series" ? "séries" : "filmes"}</p><section class="grid">${filtered.map(card).join("") || `<p class="empty">Não foram encontrados resultados.</p>`}</section></main></div>`;
  bindDashboard();
}
function card(item) {
  const id = String(item.stream_id || item.series_id);
  const favourite = state.favourites.includes(`${state.tab}:${id}`);
  const poster = item.stream_icon || item.cover || "";
  return `<article class="card" data-id="${id}"><div class="poster">${poster ? `<img src="${esc(poster)}" loading="lazy" alt="" />` : "<span>▶</span>"}<button class="fav ${favourite ? "on" : ""}" aria-label="Favorito" data-favourite="${id}">★</button></div><h2>${esc(item.name)}</h2></article>`;
}
function bindDashboard() {
  document.querySelectorAll("[data-tab]").forEach(button => button.onclick = () => { state.tab = button.dataset.tab; state.category = "all"; state.query = ""; render(); });
  document.querySelectorAll("[data-category]").forEach(button => button.onclick = () => { state.category = button.dataset.category; render(); });
  document.querySelector(".search input").oninput = event => { state.query = event.target.value; render(); };
  document.querySelector(".settings").onclick = () => { if (confirm("Remover a configuração guardada neste dispositivo?")) { localStorage.removeItem(DB_KEY); state.settings = null; state.data = null; renderSetup(); } };
  document.querySelectorAll(".card").forEach(node => node.onclick = event => { if (!event.target.closest(".fav")) openPlayer(node.dataset.id); });
  document.querySelectorAll("[data-favourite]").forEach(button => button.onclick = event => { event.stopPropagation(); const key = `${state.tab}:${button.dataset.favourite}`; state.favourites = state.favourites.includes(key) ? state.favourites.filter(x => x !== key) : [...state.favourites, key]; save(FAV_KEY, state.favourites); render(); });
}
async function openPlayer(id) {
  const item = state.data[state.tab].items.find(entry => String(entry.stream_id || entry.series_id) === id);
  if (state.tab === "series") { await openSeries(item); return; }
  app.insertAdjacentHTML("beforeend", `<div class="modal"><button class="close">×</button><div class="player"><video controls autoplay playsinline></video><h2>${esc(item.name)}</h2></div></div>`);
  startVideo(document.querySelector(".player video"), streamUrl(item));
  document.querySelector(".close").onclick = () => document.querySelector(".modal").remove();
}
async function openSeries(series) {
  app.insertAdjacentHTML("beforeend", `<div class="modal"><button class="close">×</button><div class="player details"><p>A carregar episódios…</p></div></div>`);
  document.querySelector(".close").onclick = () => document.querySelector(".modal").remove();
  try {
    const info = await api("get_series_info", { series_id: series.series_id });
    const seasons = Object.entries(info.episodes || {});
    document.querySelector(".details").innerHTML = `<h2>${esc(series.name)}</h2><p>${esc(info.info?.plot || "")}</p>${seasons.map(([season, episodes]) => `<section class="season"><h3>Temporada ${esc(season)}</h3>${episodes.map(episode => `<button class="episode" data-id="${esc(episode.id)}" data-ext="${esc(episode.container_extension || "mp4")}" data-title="${esc(episode.title || episode.name)}"><span>E${episode.episode_num || ""}</span>${esc(episode.title || episode.name)}</button>`).join("")}</section>`).join("") || "<p>Não há episódios disponíveis.</p>"}`;
    document.querySelectorAll(".episode").forEach(button => button.onclick = () => playEpisode(button.dataset));
  } catch { document.querySelector(".details").innerHTML = "<p>Não foi possível carregar os episódios desta série.</p>"; }
}
function playEpisode(episode) {
  const base = state.settings.url.replace(/\/$/, "");
  const url = `${base}/series/${encodeURIComponent(state.settings.username)}/${encodeURIComponent(state.settings.password)}/${episode.id}.${episode.ext}`;
  document.querySelector(".details").innerHTML = `<video controls autoplay playsinline></video><h2>${esc(episode.title)}</h2>`;
  startVideo(document.querySelector(".details video"), url);
}
async function startVideo(video, url) {
  try {
    if (state.settings.proxyUrl) url = await createTranscodedStream(url);
  } catch (error) {
    showPlaybackError(video, error.message || "Não foi possível iniciar a transcodificação privada.");
    return;
  }
  video.addEventListener("error", () => showPlaybackError(video, "O browser não conseguiu descodificar este stream. Pode ser um codec ou formato não suportado."), { once: true });
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
  } else {
    const { default: Hls } = await import("hls.js");
    if (!Hls.isSupported()) { video.src = url; return; }
    const hls = new Hls({ enableWorker: true });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        const reason = data.type === Hls.ErrorTypes.NETWORK_ERROR
          ? "O servidor aceitou a API mas bloqueou ou recusou o stream. Confirma CORS no servidor IPTV."
          : "O stream usa um formato/codec que este browser não consegue reproduzir.";
        showPlaybackError(video, reason);
      }
    });
    hls.loadSource(url);
    hls.attachMedia(video);
  }
  video.play().catch(() => {});
}
async function createTranscodedStream(source) {
  const proxy = state.settings.proxyUrl.replace(/\/$/, "");
  const response = await fetch(`${proxy}/api/streams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.playlist) throw new Error(data.error || "O proxy não conseguiu preparar este stream.");
  return `${proxy}${data.playlist}`;
}
function showPlaybackError(video, message) {
  const existing = video.parentElement.querySelector(".playback-error");
  if (!existing) video.insertAdjacentHTML("afterend", `<p class="playback-error">${esc(message)}</p>`);
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
if (!state.settings) renderSetup(); else fetchData().then(render).catch(error => { console.error(error); renderSetup("Não foi possível carregar o catálogo. Verifica a ligação e as permissões CORS do servidor."); });
