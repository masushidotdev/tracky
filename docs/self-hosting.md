# Self-hosting Tracky with Docker

> Prefer Italian? Read the [Italian guide](self-hosting.it.md).

Run Tracky on your own machine or VPS with Docker Compose: the TanStack Start app backed by a self-hosted [Convex](https://convex.dev/) backend, with zero product telemetry.

## Quick start

Prerequisites: Docker 24+ with Docker Compose v2 and a free [WorkOS](https://workos.com/) account (AuthKit).

```bash
git clone https://github.com/masushidotdev/tracky.git
cd tracky
cp .env.selfhost.example .env
# Edit .env: set INSTANCE_SECRET, WORKOS_CLIENT_ID, WORKOS_API_KEY,
# WORKOS_WEBHOOK_SECRET, and WORKOS_COOKIE_PASSWORD
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000).

Generate the random secrets before starting:

```bash
openssl rand -hex 32          # -> INSTANCE_SECRET
openssl rand -base64 32       # -> WORKOS_COOKIE_PASSWORD (min 32 chars)
echo "whsec_$(openssl rand -hex 16)" # -> local/LAN WORKOS_WEBHOOK_SECRET placeholder (requires backfill; see below)
```

To also launch the optional Convex dashboard on [http://localhost:6791](http://localhost:6791):

```bash
docker compose --profile dashboard up -d
```

## What runs in containers vs. external services

### Containerised (`docker-compose.yml`)

| Service | Image / Target | Role |
| --- | --- | --- |
| `backend` | `ghcr.io/convex/convex-backend` (pinned by digest) | Self-hosted Convex API (`3210`), HTTP actions (`3211`), and SQLite + local blob storage in the `convex-data` volume. Also publishes port `3000` for `app`. |
| `convex-key` | `ghcr.io/convex/convex-backend` (one-shot) | Derives the instance admin key from `INSTANCE_NAME` and `INSTANCE_SECRET` into the private `convex-admin` volume (`0600`, uid `1000`). |
| `convex-deploy` | `Dockerfile` (`target: deployer`, one-shot) | Syncs allowlisted Convex backend environment variables and pushes Tracky's schema, components, and functions (`convex deploy --yes --skip-workos-check --typecheck=disable`). |
| `convex-backfill` | `Dockerfile` (`target: deployer`, profile `tools`, one-shot) | Admin helper that runs `auth:backfillUsers` to sync WorkOS users when incoming webhooks are unavailable. |
| `app` | `Dockerfile` (`target: runtime`) | Built TanStack Start Cloudflare Worker served locally on `workerd` via Wrangler's local runtime behind a built-in Node edge proxy on port `3000` (`network_mode: "service:backend"`). Runs as non-root `node` (uid `1000`). |
| `dashboard` | `ghcr.io/convex/convex-dashboard` (pinned by digest, profile `dashboard`) | Optional Convex web dashboard (`6791`). |

### External services

- **WorkOS AuthKit (required):** Tracky verifies WorkOS RS256 JWTs against `https://api.workos.com/sso/jwks/<WORKOS_CLIENT_ID>` (`convex/auth.config.ts`) and uses `@workos/authkit-tanstack-react-start` for sign-in and session cookies. WorkOS remains an external SaaS (free developer tier available):
  1. Create a WorkOS project/environment in [dashboard.workos.com](https://dashboard.workos.com/).
  2. Under **Redirects**, add `http://localhost:3000/callback` (or `https://<your-domain>/callback` in production).
  3. Copy `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` into `.env`.
  4. Configure `WORKOS_WEBHOOK_SECRET` and user provisioning as described in [User provisioning](#user-provisioning) below.
- **Optional integrations** (all stay disabled until their variables are set in `.env` and synced to Convex):
  - **Enable Banking:** bring your own Enable Banking app ID, PEM private key, and HTTPS callback URL (`ENABLE_BANKING_*`).
  - **AI Analyst:** set `VITE_ANALYST_ENABLED=true` (requires rebuilding `app`) plus `AI_GATEWAY_API_KEY` / `OPENROUTER_API_KEY` (and optional `LANGFUSE_*`).
  - **Email reports (Resend):** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`.
  - **Telegram bot:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`.

### User provisioning

Tracky only creates a user profile and opens the app once the user record exists in Convex's AuthKit table — a valid WorkOS JWT alone leaves sign-in retrying. That table is populated in one of two ways:

- **Internet-facing installs (recommended):** expose `CONVEX_SITE_ORIGIN` (port `3211`) over HTTPS, create a WorkOS webhook pointing to `https://<your-convex-site>/workos/webhook` subscribed to `user.created`, `user.updated`, and `user.deleted`, and paste its signing secret into `WORKOS_WEBHOOK_SECRET` in `.env`.
- **Local / LAN installs (where WorkOS cannot reach your host):** set any placeholder `whsec_...` value in `WORKOS_WEBHOOK_SECRET` so `convex-deploy` succeeds, and after each new user signs up run the backfill command once:
  ```bash
  docker compose --profile tools run --rm convex-backfill
  ```
  This invokes `auth:backfillUsers`, which lists users from the WorkOS API using `WORKOS_API_KEY` and imports them into Convex. Without the webhook, `user.updated` and `user.deleted` events will not sync automatically in this mode.

## Configuration notes

- **Build-time vs. runtime variables:** `VITE_CONVEX_URL`, `VITE_ANALYST_ENABLED`, and `APP_PUBLIC_URL` are baked into the client/Worker bundle at `docker compose build` time. Runtime secrets (`WORKOS_*`) are never baked into the image; `docker/entrypoint.sh` writes an allowlisted `.dev.vars` file (`0600`) at container start.
- **Why `app` and `convex-deploy` share `backend`'s network namespace:** `src/router.tsx` reads `VITE_CONVEX_URL` both in the browser and during SSR. Running `app` with `network_mode: "service:backend"` (and publishing port `3000` on `backend`) means `http://127.0.0.1:3210` works identically in both contexts, and `convex-deploy` reaches Convex over loopback without relying on inter-container bridge rules.
- **WorkOS auto-provisioning in `convex.json`:** `convex.json` contains an `authKit` section used by hosted Convex Cloud deploys. Self-hosted deploys pass `--skip-workos-check` and manage WorkOS credentials explicitly via `.env` and `docker/convex-deploy.sh`.

## Running behind a reverse proxy with TLS

For a public domain (for example `https://tracky.example.com`, `https://convex.example.com`, and `https://convex-site.example.com`):

1. Configure your reverse proxy (Caddy, Nginx, Traefik) to terminate TLS and forward:
   - `tracky.example.com` -> `127.0.0.1:3000`
   - `convex.example.com` -> `127.0.0.1:3210` (must proxy WebSockets / `Upgrade` headers)
   - `convex-site.example.com` -> `127.0.0.1:3211` (required for incoming webhooks: WorkOS, Enable Banking, Resend, Telegram)
2. Update `.env`:
   ```env
   APP_PUBLIC_URL=tracky.example.com
   WORKOS_REDIRECT_URI=https://tracky.example.com/callback
   VITE_CONVEX_URL=https://convex.example.com
   CONVEX_CLOUD_ORIGIN=https://convex.example.com
   CONVEX_SITE_ORIGIN=https://convex-site.example.com
   NEXT_PUBLIC_DEPLOYMENT_URL=https://convex.example.com
   DO_NOT_REQUIRE_SSL=false
   ```
3. Add `https://tracky.example.com/callback` to your WorkOS Redirect URIs (and register `https://convex-site.example.com/workos/webhook` for `WORKOS_WEBHOOK_SECRET`).
4. Rebuild and restart so the new build-time `VITE_CONVEX_URL` is embedded in the client bundle:
   ```bash
   docker compose up -d --build
   ```

## Upgrading

1. Back up the `convex-data` volume first (see below).
2. Pull the latest code and rebuild:
   ```bash
   git pull
   docker compose up -d --build
   ```
   `convex-deploy` runs automatically before `app` restarts, pushing any updated Convex schema/functions and re-syncing allowlisted env vars.

## Backups and restore

By default, Convex stores its SQLite database and uploaded blobs in the `convex-data` named Docker volume (`/convex/data`).

**Backup (stop `backend` briefly for a consistent SQLite snapshot):**

```bash
docker compose stop app backend
docker run --rm \
  -v "$(docker compose config --format json | jq -r '.name')_convex-data:/data:ro" \
  -v "$PWD:/backup" \
  debian:bookworm-slim \
  tar czf "/backup/tracky-convex-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .
docker compose start backend app
```

**Restore:**

```bash
docker compose stop app backend
docker run --rm \
  -v "$(docker compose config --format json | jq -r '.name')_convex-data:/data" \
  -v "$PWD:/backup:ro" \
  debian:bookworm-slim \
  sh -c 'rm -rf /data/* && tar xzf /backup/tracky-convex-YYYYMMDD-HHMMSS.tar.gz -C /data'
docker compose up -d
```

Keep a secure copy of `.env` (especially `INSTANCE_SECRET`, `INSTANCE_NAME`, and `WORKOS_COOKIE_PASSWORD`) alongside your backups.

## Security notes

The `app` container runs the built Cloudflare Worker on `workerd` via Wrangler's local runtime bound to loopback (`127.0.0.1:8787`), fronted by a built-in Node edge proxy on port `3000` that blocks `/cdn-cgi/*` local tooling endpoints. Ports `3210` and `3211` expose the Convex client API and HTTP actions; administrative operations require the admin key derived from `INSTANCE_SECRET`, so keep `INSTANCE_SECRET` (and the generated admin key) strictly secret. For internet-facing deployments, put all exposed endpoints behind a TLS-terminating reverse proxy and never publish the optional Convex dashboard port (`6791`) publicly.

## Limitations and telemetry

- **Runtime:** Tracky builds as a Cloudflare Worker (there is no Node HTTP server target). The self-host `app` image executes the built Worker locally on `workerd` via the pinned `wrangler dev --local` runtime behind a lightweight built-in edge proxy (`docker/edge.mjs`). It is well suited for personal/household single-node self-hosting, not multi-replica horizontal scaling.
- **Storage:** SQLite + local storage inside `convex-data` by default (single node). Upstream Convex backend also supports external Postgres (`POSTGRES_URL`), MySQL (`MYSQL_URL`), and S3 storage buckets via the optional variables listed in `.env.selfhost.example`.
- **No telemetry:**
  - PostHog analytics is hard-disabled at build time (`CLOUDFLARE_ENV=selfhost`, `VITE_POSTHOG_ENABLED=false`, no capture key/host embedded in `dist/client` or `dist/server/wrangler.json`).
  - Convex backend beacon is disabled (`DISABLE_BEACON=true`).
  - Wrangler telemetry, error reports, banner update checks, local explorer UI, and Miniflare's startup `workers.cloudflare.com/cf.json` fetch are disabled (`WRANGLER_SEND_METRICS=false`, `WRANGLER_SEND_ERROR_REPORTS=false`, `WRANGLER_HIDE_BANNER=true`, `X_LOCAL_EXPLORER=false`, `CLOUDFLARE_CF_FETCH_ENABLED=false`, `DO_NOT_TRACK=1`).
- **Convex dashboard:** When running `--profile dashboard`, retrieve the admin key to sign in via:
  ```bash
  docker compose exec backend ./generate_admin_key.sh
  ```
