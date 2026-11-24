---
name: verify-tracky
description: Project-local verification skill for Tracky (TanStack Start web app on Cloudflare workerd + Convex + WorkOS AuthKit). Use when verifying local builds, public marketing routes, security headers, unauthenticated route guards, or end-to-end authenticated user flows (account/loan creation, CSV import, zero-based planning).
---

# Verify Tracky

Tracky is a TanStack Start React web application bundled for Cloudflare Workers (`workerd` via `@cloudflare/vite-plugin`), backed by Convex (`convex/`) and WorkOS AuthKit.

Two verification modes exist because authenticated app routes (`/app/*`) require a live Convex deployment and WorkOS AuthKit tenant credentials:

1. **Public & built-Worker mode (zero real secrets required):** verifies `npm test`, `npm run lint`, `npm run security:audit`, `npm run security:convex-runtime`, `CLOUDFLARE_ENV= npm run build`, and runs the compiled Worker locally via `wrangler dev --config dist/server/wrangler.json` with temporary synthetic `dist/server/.dev.vars` (scaffolding removed in cleanup) to verify public EN/IT routes, static assets, security headers, 404 routes, and the unauthenticated `/app` redirect.
2. **Full local stack mode (`npm run dev`, requires Convex + WorkOS secrets):** verifies authenticated end-to-end journeys (sign-in via WorkOS, `ProfileBootstrap`, manual/loan account creation, CSV import, zero-based Plan) in a real browser against `http://localhost:3000`.

**Isolation & key-safety rule:** `dev:woozy-antelope-583` is the Convex `dev` deployment (paired with the `tracky-woozy-antelope-583-dev` WorkOS environment, distinct from Staging/Production). Before any `convex` command, verify `CONVEX_DEPLOY_KEY` belongs to Tracky (`dev:woozy-antelope-583`, e.g. `export CONVEX_DEPLOY_KEY="$TRACKY_CONVEX_DEPLOY_KEY"`) and never use another project's key. Never share one `dev` Convex deployment across concurrent agents; use `scripts/init-worktree.sh` for a dedicated per-worktree dev deployment before concurrent authenticated writes, or run `wrangler dev --config dist/server/wrangler.json` on a dedicated loopback port (`4173` default, override via `TRACKY_VERIFY_PORT`) with `CLOUDFLARE_ENV=` for isolated public-Worker checks.

## Launch

### 1. Public & built-Worker mode (no external credentials)

```bash
export PATH="/path/to/node-22.23.4/bin:$PATH"   # Node >=22.23.4 <23 required (.nvmrc)
CLOUDFLARE_ENV= npm run build
```

`authkitMiddleware()` (`src/start.ts`) validates `WORKOS_CLIENT_ID` and `WORKOS_COOKIE_PASSWORD` on every SSR request. Because `dist/server/wrangler.json` sits in `dist/server/`, `wrangler dev` reads `dist/server/.dev.vars`. If neither `.dev.vars` nor `dist/server/.dev.vars` exists, seed temporary synthetic values in `dist/server/.dev.vars` (verification scaffolding only; removed in Cleanup):

```bash
# Verification scaffolding only — inside gitignored dist/, removed in cleanup
cat <<'VARS' > dist/server/.dev.vars
WORKOS_CLIENT_ID=client_synthetic_verify_00000000
WORKOS_API_KEY=sk_test_synthetic_verify_00000000
WORKOS_COOKIE_PASSWORD=synthetic_verify_cookie_password_32chars_min
WORKOS_REDIRECT_URI=http://127.0.0.1:4173/callback
VARS
```

Start the compiled Worker in `workerd` on an explicit loopback IP and port, tracking its process group:

```bash
setsid npx wrangler dev --config dist/server/wrangler.json --ip 127.0.0.1 --port 4173 >/tmp/tracky-verify-wrangler.log 2>&1 &
SERVER_PID=$!
```

**Ready condition:** `curl -sf http://127.0.0.1:4173/robots.txt` returns HTTP `200` AND `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/` returns HTTP `200` (not `500` AuthKit config error).

### 2. Full local stack (authenticated user flows)

Prerequisites (must exist before launch; cannot be fabricated):
- Node `22.23.4` (`nvm install && nvm use`, verified by `scripts/check-node-version.mjs`).
- Convex CLI auth (`CONVEX_ACCESS_TOKEN` or `~/.convex/config.json`) + `npx convex dev` (or `./scripts/init-worktree.sh` in a worktree).
- `.env.local` (for Vite/Convex: `VITE_CONVEX_URL`, `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI=http://localhost:3000/callback`) and `.dev.vars` (same WorkOS vars for `workerd`).
- Convex deployment env vars: `WORKOS_CLIENT_ID`, `WORKOS_API_KEY` (`npx convex env set ...`). Optional: `ENABLE_BANKING_*`, `AI_GATEWAY_API_KEY`, `RESEND_*`, `TELEGRAM_*`.

Start command:

```bash
npm run dev
```

**Ready condition:** Convex prints functions ready and Vite prints `http://localhost:3000/`; `curl -sf http://localhost:3000/` returns HTTP `200`.

Note: `convex dev` may reformat `convex/_generated/api.d.ts` and `convex/_generated/server.d.ts` on startup; restore them (`git checkout -- convex/_generated/`) if your branch does not change `convex/`.

## Doctor

Run before driving any check:

```bash
# 1. Node baseline matches .nvmrc (>=22.23.4 <23)
node scripts/check-node-version.mjs

# 2. Convex standard-runtime boundary passes
npm run security:convex-runtime

# 3. Check port is owned by our PID and responds
ps -p "$SERVER_PID" -o pid,cmd=
curl -sS -o /dev/null -w "root=%{http_code}\n" "http://127.0.0.1:4173/"

# 4. If testing authenticated flows, confirm env files & Convex deployment coordinate exist (names only, never print values)
test -f .env.local && test -f .dev.vars && grep -q '^VITE_CONVEX_URL=' .env.local
```

If `root=500` in `wrangler dev`, inspect `/tmp/tracky-verify-wrangler.log` for missing `dist/server/.dev.vars` WorkOS keys.

## Drive

### Automated helper (public Worker & route verification)

Run the bundled helper (handles Doctor, Launch, HTTP/header checks, headless Chrome render check if Chrome/Chromium is present, Evidence capture, and Cleanup):

```bash
.cursor/skills/verify-tracky/scripts/verify-public.sh
```

Custom port or evidence directory:

```bash
TRACKY_VERIFY_PORT=4174 TRACKY_EVIDENCE_DIR=/tmp/tracky-verify-evidence .cursor/skills/verify-tracky/scripts/verify-public.sh
```

### Automated suite (unit, invariant, policy, lint)

```bash
npm run security:audit
npm test
npm run lint
```

### Browser / Playwright driving (authenticated flows against `http://localhost:3000`)

1. Open `http://localhost:3000/`, click the primary CTA (`Start free →` / `Open the demo →`), complete WorkOS AuthKit sign-in once, and confirm `/callback` lands on `/app` (`ProfileBootstrap` finishes provisioning the user profile). Save Playwright `storageState` to `/tmp/tracky-auth-state.json` (outside repo) for subsequent runs.
2. Follow the feature guides in [`features/README.md`](features/README.md):
   - [`features/public-marketing.md`](features/public-marketing.md)
   - [`features/auth-and-onboarding.md`](features/auth-and-onboarding.md)
   - [`features/accounts-and-loans.md`](features/accounts-and-loans.md)
   - [`features/csv-import.md`](features/csv-import.md)
   - [`features/zero-based-plan.md`](features/zero-based-plan.md)

## Evidence

Proof artifacts live in `/tmp/tracky-verify-evidence/` (or `$TRACKY_EVIDENCE_DIR`) and **must survive cleanup**:
- `summary.txt`: timestamp, git commit SHA, Node version, HTTP status codes and header assertions for `/`, `/it`, `/it/`, `/pricing`, `/faq`, `/robots.txt`, `/sitemap.xml`, `/privacy`, `/terms`, `/app` (307 redirect location), plus headless Chrome title/screenshot check if available.
- `headers-*.txt` and `home-dom.txt`: captured HTTP response headers and rendered DOM text.
- `home.png` (when Chrome/Chromium is available on the host): full-page screenshot of `/`.
- When running authenticated flows, also capture before/after screenshots of the created account, imported row count in `/app/transactions`, and updated `Ready to assign` figure in `/app/plan`.

Proof standards:
- Exercise the real built Worker (`wrangler dev --config dist/server/wrangler.json`) or real `npm run dev` stack — never mock `authkitMiddleware` or `applySecurityHeaders`.
- Verify side effects (headers on SSR responses, 307 redirect `Location` to WorkOS, Convex query/UI update after mutations), not just HTTP 200.

## Cleanup

Always kill only the process group/PID launched by the verification run and remove verification-scaffolding `dist/server/.dev.vars` only if the run created it:

```bash
if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
  kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
fi
if [ "${CREATED_DEV_VARS:-0}" = "1" ]; then
  rm -f dist/server/.dev.vars
fi
```

Note: `npm run dev` (`convex dev --start 'vite dev'`) spawns `vite dev` in its own child session, so killing only `-$SERVER_PID` can leave `vite dev` listening on `:3000`. Verify `:3000` is closed and terminate the specific `vite dev` child PIDs you started if needed. Never kill processes by name (`pkill vite`, `pkill node`) and never delete `/tmp/tracky-verify-evidence/`.

## Helpers

- `.cursor/skills/verify-tracky/scripts/verify-public.sh`: executable end-to-end public-Worker verification script. Run directly from repo root with Node `22.23.4` in `PATH`.
