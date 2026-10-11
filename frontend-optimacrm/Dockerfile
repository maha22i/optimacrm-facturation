# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Étape 1 : dépendances (devDependencies incluses, requises par le build)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


# ─────────────────────────────────────────────────────────────────────────────
# Étape 2 : build
# Les variables NEXT_PUBLIC_* sont inlinées dans le bundle client au moment du
# build : elles doivent donc arriver en ARG, pas en variable d'exécution.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_CLIENT_PORTAL_URL

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL} \
    NEXT_PUBLIC_CLIENT_PORTAL_URL=${NEXT_PUBLIC_CLIENT_PORTAL_URL} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


# ─────────────────────────────────────────────────────────────────────────────
# Étape 3 : image d'exécution (sortie standalone, sans node_modules complet)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
      wget ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Europe/Paris

WORKDIR /app

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/login || exit 1

CMD ["node", "server.js"]
