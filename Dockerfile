FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
RUN mkdir -p /streams
ENV PORT=8787 OUTPUT_DIR=/streams
EXPOSE 8787
CMD ["node", "server/index.js"]
