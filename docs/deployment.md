# Deployment

Tracky deploys as a Cloudflare Worker frontend backed by a Convex deployment.
The reference setup below mirrors the developer's staging environment; replace
every `<...>` placeholder with your own values.

## Topology

| Piece | Value |
| --- | --- |
| Frontend | Cloudflare Worker `<your-worker-name>` |
| URL | `https://<your-worker-name>.<your-account>.workers.dev` |
| Backend | Convex deployment `<your-convex-deployment>` |
| Auth | WorkOS environment (Staging for development) |
| Gate | Cloudflare Access, one-time PIN, allowed-email policy |

For a personal staging setup, a public URL gated to a single developer works
well. It is not a production launch — there is no WorkOS Production
environment, no Convex production deployment, and no data migration unless you
create them.

## Wrangler environment

`wrangler.jsonc` defines a `staging` environment. **Both the build and the
deploy must run with `CLOUDFLARE_ENV=staging`** — without it, Vite emits a
config for the top-level name and Wrangler would create a second, unwanted
Worker. The `deploy` npm script sets it for both steps.

`@cloudflare/vite-plugin` runs the SSR environment on workerd in `vite dev`
too, so local development and the deployed Worker resolve server-side env vars
the same way. Server secrets come from `.dev.vars` locally (gitignored,
mirrors the Worker secrets) and from Worker secrets once deployed.
`process.env` is populated because `nodejs_compat` is on and the compatibility
date is past 2025-04-01.

## Deploy

Every push to `main` can trigger Workers Builds, connected to your repository,
which runs:

- build: `npx convex deploy --cmd 'npm run build'`
- deploy: `npx wrangler deploy`

with two build variables: `CLOUDFLARE_ENV=staging` and the encrypted
`CONVEX_DEPLOY_KEY` (a deploy token scoped to the deployment, created with
`npx convex deployment token create`).

The package manager is npm and `package-lock.json` is the only lockfile on
purpose: Workers Builds picks its package manager by looking for lockfiles, and
a second one would silently change how the remote build installs dependencies.

`convex deploy --cmd` pushes Convex functions to the deployment and injects
`VITE_CONVEX_URL` into the client build, so the deployed frontend can never
drift from the backend functions it expects. Only `main` is built by default;
enable preview deployments only if each preview gets its own backend, because
a preview branch sharing one backend would talk to the same data.

Manual deploy from a checkout: `npm run deploy`.

## Configuration

Worker secrets (`wrangler secret put`, `CLOUDFLARE_ENV=staging`):
`WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_REDIRECT_URI`,
`WORKOS_COOKIE_PASSWORD`. The cookie password should differ from the local one.

WorkOS redirect URIs, homepage, and CORS origins are declared in `convex.json`
under `authKit.dev.configure` and applied by `npx convex dev`. Both
`http://localhost:3000` and the Worker URL are listed, so local development and
the deployed app work at the same time.

`RESEND_WEBHOOK_SECRET` is mandatory on the Convex deployment for Resend delivery
updates. Set it with `npx convex env set RESEND_WEBHOOK_SECRET <whsec_...>` using
the signing secret from the Resend webhook endpoint. If missing or blank,
`POST /resend-webhook` returns 503 and email delivery states never update.
Invalid webhook signatures return 401.

## Access gate

Set the Worker URL (and any preview URL pattern) to **Restricted** in the
Worker's Domains tab, which creates a Cloudflare Access self-hosted
application for each. An allowlist policy (for example a single email via
one-time PIN) stops visitors at the edge before the Worker runs. Signing in
then takes two steps: Access first, then WorkOS.

No inbound webhook hits the frontend (Enable Banking, Resend, Telegram, and
WorkOS all call the `.convex.site` domain), so the gate breaks nothing.

## Shared-backend caveat

Do not share one Convex deployment between local development and a deployed
app with real data: a `npx convex dev` republishes functions to whatever
backend it targets. For non-trivial work use a worktree —
`scripts/init-worktree.sh` provisions a dedicated dev deployment per worktree —
so the shared deployment changes only through pushes to `main`.
