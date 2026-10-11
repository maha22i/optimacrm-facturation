# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Étape 1 : dépendances de production
# PUPPETEER_SKIP_DOWNLOAD évite de télécharger un Chrome de 170 Mo dans
# node_modules : on utilise le Chromium système installé à l'étape 2.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps

ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev


# ─────────────────────────────────────────────────────────────────────────────
# Étape 2 : image d'exécution
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      ca-certificates \
      tzdata \
      wget \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3001 \
    TZ=Europe/Paris \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js ./
COPY src ./src

# Les services résolvent les chemins d'upload via path.resolve('uploads/...'),
# donc relativement au WORKDIR. Le chown transmet la propriété au volume
# nommé monté ensuite sur ce dossier.
RUN mkdir -p uploads/logos/marques uploads/import-temp uploads/documents-clients \
    && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "server.js"]
