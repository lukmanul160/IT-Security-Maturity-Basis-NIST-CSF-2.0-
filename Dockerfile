FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY frontend ./frontend
COPY scripts/prepare-vue-client.js ./scripts/prepare-vue-client.js
RUN npm run build && npm prune --omit=dev

FROM node:24-trixie-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-17 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=8000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/frontend/public ./frontend/public
COPY package.json package-lock.json ./
COPY src ./src
COPY scripts ./scripts
COPY database ./database
COPY data/csf-data.json data/privacy-data.json data/iso-27001-data.json \
     data/iso-27001-soa-data.json data/personnel-certifications-seed.json \
     data/risk-indicators.json ./data/
RUN mkdir -p upload backup data/audit-pending && chown -R node:node /app
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
