# syntax=docker/dockerfile:1

FROM node:22.23.4-bookworm-slim AS deps
WORKDIR /app

ENV DO_NOT_TRACK=1 \
    NO_UPDATE_NOTIFIER=1 \
    npm_config_update_notifier=false

COPY package.json package-lock.json ./
COPY scripts/check-node-version.mjs ./scripts/check-node-version.mjs

# Validate pinned Node version explicitly, then install exact lockfile tree
# without running root lifecycle scripts (e.g. `prepare` git hook setup).
RUN node scripts/check-node-version.mjs && \
    npm ci --ignore-scripts --no-audit --no-fund

# One-shot deployer stage: pushes Convex schema/functions and syncs env vars
# to the self-hosted Convex backend.
FROM deps AS deployer
WORKDIR /app

ENV CONVEX_DISABLE_TELEMETRY=1 \
    DO_NOT_TRACK=1 \
    NO_UPDATE_NOTIFIER=1

COPY convex.json tsconfig.json ./
COPY convex ./convex
COPY scripts ./scripts
COPY docker/convex-deploy.sh ./docker/convex-deploy.sh

RUN chmod 0755 /app/docker/convex-deploy.sh && \
    chown -R node:node /app/convex

USER node
ENTRYPOINT ["/app/docker/convex-deploy.sh"]

# Build stage: compiles the TanStack Start + Cloudflare Worker bundle for self-host.
FROM deps AS builder
WORKDIR /app

ARG VITE_CONVEX_URL=http://127.0.0.1:3210
ARG VITE_ANALYST_ENABLED=false
ARG APP_PUBLIC_URL=localhost:3000

# Force selfhost Wrangler environment and disable all PostHog/telemetry capture.
ENV CLOUDFLARE_ENV=selfhost \
    VITE_CONVEX_URL=${VITE_CONVEX_URL} \
    VITE_ANALYST_ENABLED=${VITE_ANALYST_ENABLED} \
    APP_PUBLIC_URL=${APP_PUBLIC_URL} \
    VITE_POSTHOG_ENABLED=false \
    WRANGLER_SEND_METRICS=false \
    WRANGLER_SEND_ERROR_REPORTS=false \
    WRANGLER_HIDE_BANNER=true \
    DO_NOT_TRACK=1 \
    NO_UPDATE_NOTIFIER=1

COPY . .

RUN unset VITE_POSTHOG_KEY VITE_POSTHOG_API_HOST VITE_POSTHOG_ENV VITE_POSTHOG_REPLAY_SAMPLE POSTHOG_API_KEY POSTHOG_PROJECT_ID POSTHOG_HOST && \
    npm run build && \
    node -e "const fs = require('node:fs'); const p = 'dist/server/wrangler.json'; const cfg = JSON.parse(fs.readFileSync(p, 'utf8')); cfg.vars = { ...(cfg.vars || {}), ENVIRONMENT: 'selfhost', APP_PUBLIC_URL: process.env.APP_PUBLIC_URL || 'localhost:3000' }; fs.writeFileSync(p, JSON.stringify(cfg));"

# Minimal runtime dependency stage: installs only the exact pinned wrangler
# version from package-lock.json so the runtime image stays lean.
FROM node:22.23.4-bookworm-slim AS runtime-deps
WORKDIR /runtime-deps

ENV DO_NOT_TRACK=1 \
    NO_UPDATE_NOTIFIER=1 \
    npm_config_update_notifier=false

COPY package-lock.json ./

RUN WRANGLER_VERSION=$(node -p "require('./package-lock.json').packages['node_modules/wrangler'].version") && \
    npm init -y >/dev/null && \
    npm install --no-audit --no-fund --omit=dev "wrangler@${WRANGLER_VERSION}" && \
    rm -f package.json package-lock.json && \
    npm cache clean --force

# Production self-host runtime stage: runs the built Worker locally on workerd
# via Wrangler's local runtime as a non-root user.
FROM node:22.23.4-bookworm-slim AS runtime
WORKDIR /app

# workerd requires system CA certificates for outbound TLS (e.g. WorkOS AuthKit).
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    WRANGLER_SEND_METRICS=false \
    WRANGLER_SEND_ERROR_REPORTS=false \
    WRANGLER_HIDE_BANNER=true \
    WRANGLER_NO_SKILLS_UPDATE_PROMPTS=true \
    WRANGLER_CI_DISABLE_CONFIG_WATCHING=true \
    X_LOCAL_EXPLORER=false \
    DO_NOT_TRACK=1 \
    NO_UPDATE_NOTIFIER=1 \
    npm_config_update_notifier=false

COPY --from=runtime-deps /runtime-deps/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod 0755 /app/docker/entrypoint.sh && \
    mkdir -p /tmp/wrangler-state /app/dist/server/.wrangler && \
    chown -R node:node /tmp/wrangler-state /app/dist/server/.wrangler

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/app/docker/entrypoint.sh"]
