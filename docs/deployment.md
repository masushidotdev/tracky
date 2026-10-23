# Deployment

Tracky deploys as a Cloudflare Worker frontend backed by a Convex deployment.
Two environments exist: staging (gated) and production (public). Production is deployed automatically by Cloudflare Workers Builds after a push or merge to GitHub `main`; staging is not part of this release path. See
`decisions/0018-deploy-environments.md` for why.

`wrangler.jsonc` is tracked and contains the Worker configuration; environment secrets remain outside Git.

## Topology

| Piece    | Staging                                                     | Production                               |
| -------- | ----------------------------------------------------------- | ---------------------------------------- |
| Frontend | Worker `tracky-oos-staging`                                 | Top-level Worker `tracky-oos`            |
| URL      | `https://tracky-oos-staging.masushi.workers.dev`            | `https://trytracky.app`                  |
| Backend  | Convex dev `dev:woozy-antelope-583` (shared with local dev) | Convex production deployment             |
| Auth     | WorkOS dev env (`authKit.dev` profile)                      | WorkOS prod env (`authKit.prod` profile) |
| Gate     | Cloudflare Access, one-time PIN, allowed-email policy       | Public                                   |

`convex.json` holds `authKit.dev` (localhost + staging URL) and `authKit.prod`
(`https://trytracky.app`, `environmentType: production`). No `preview` profile:
preview deployments stay off until each gets its own backend.

## Wrangler environment

The local `wrangler.jsonc` defines a `staging` env. **Staging build and deploy
must run with `CLOUDFLARE_ENV=staging`** — without it, Vite emits a config for
the top-level name and Wrangler would deploy to production. The `deploy` npm
script sets it for both steps. Production deploys explicitly clear it
(`CLOUDFLARE_ENV= ` in the `deploy:prod` script — required because Workers
Builds inherits staging's `CLOUDFLARE_ENV=staging` otherwise), targeting the
top-level Worker.

`@cloudflare/vite-plugin` runs the SSR environment on workerd in `vite dev`
too, so local development and the deployed Worker resolve server-side env vars
the same way. Server secrets come from `.dev.vars` locally (gitignored,
mirrors the Worker secrets) and from Worker secrets once deployed.
`process.env` is populated because `nodejs_compat` is on and the compatibility
date is past 2025-04-01.

## Deploy

Production: push or merge the verified changes to GitHub `main`. The connected Cloudflare Workers Builds pipeline performs the build and deployment. Follow the commit's Cloudflare check and build logs through completion; do not replace this release path with a local `wrangler deploy` or `convex deploy`.

The production build must select the production Convex deploy key and the top-level `tracky-oos` Worker (`CLOUDFLARE_ENV` unset or empty). Its commands build the frontend with the selected Convex URL and publish the backend/components and Worker. Verify the actual target and Node version in the resulting build evidence. The staging configuration remains available for separate, explicitly requested testing; a production request does not deploy staging first.

The npm deploy commands below are manual recovery tools, not the normal production release trigger.

Workers Builds configurations also need the source-map uploader variables
`POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, and `POSTHOG_HOST`. Store
`POSTHOG_API_KEY` as an encrypted build variable; the project ID and host can
be ordinary build variables. The Vite build runs inside `convex deploy --cmd`,
which inherits these variables and uploads the matching source maps before
Wrangler deploys the artifact. Keep the connected-repository checkout's Git
metadata available to the build so the uploader derives both release name and
release version from the deployed commit. Manual deploys must likewise run
from the release checkout rather than from a source archive without `.git`.

Client analytics uses a separate public build variable named
`VITE_POSTHOG_KEY`; add that exact name to both Workers Builds configurations.
The remaining client-side names are `VITE_POSTHOG_ENABLED`,
`VITE_POSTHOG_API_HOST`, `VITE_POSTHOG_ENV`, and
`VITE_POSTHOG_REPLAY_SAMPLE`. Add all four names as build variables to both
Workers Builds configurations, and set `VITE_POSTHOG_ENABLED` to the literal
string `true` in each configuration. The Wrangler configuration values are runtime
variables and do not replace these build variables. Do not substitute the
upload-only `POSTHOG_API_KEY` for the public client key.

The package manager is npm and `package-lock.json` is the only lockfile on
purpose: Workers Builds picks its package manager by looking for lockfiles, and
a second one would silently change how the remote build installs dependencies.
Vite 8 requires Node 22.12.0 or later on the Node 22 line. The project pins
Node 22.23.4 in `.node-version` and `.nvmrc`; CI reads `.nvmrc`. npm engines and lifecycle checks reject older Node or another major. Workers Builds must also use 22.23.4: remove any stale `NODE_VERSION` build override or set it to the same version in both environments, then confirm the version in fresh build logs. Run
`nvm install` and `nvm use` before `npm ci` in a local checkout. Vite 8 resolves
TypeScript paths through `resolve.tsconfigPaths`, without a separate plugin.
The dependency lockfile is validated by `npm ci` with the npm 10 bundled with
Node 22. If npm 10.9.8 fails internally while running `npm audit fix` on this
tree, run that command with a Node-22-compatible npm 11 and validate the result
again with `npm ci`.

`convex deploy --cmd` pushes Convex functions to the deployment and injects
`VITE_CONVEX_URL` into the client build, so the deployed frontend can never
drift from the backend functions it expects. The production pipeline builds `main`;
enable preview deployments only if each preview gets its own backend, because
a preview branch sharing one backend would talk to the same data.

Manual deploys from a checkout: `npm run deploy` (staging),
`npm run deploy:prod` (production).

## Configuration

Worker secrets:

- staging (`CLOUDFLARE_ENV=staging wrangler secret put`):
  `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_REDIRECT_URI`
  (`https://tracky-oos-staging.masushi.workers.dev/callback`),
  `WORKOS_COOKIE_PASSWORD`.
- production (`wrangler secret put`, no env flag):
  same keys, `WORKOS_REDIRECT_URI=https://trytracky.app/callback`,
  a different cookie password.

Cookie passwords must differ per environment (and from local).

WorkOS redirect URIs, homepage, and CORS origins are declared in `convex.json`
under `authKit.dev.configure` (localhost + staging URL) and
`authKit.prod.configure` (`https://trytracky.app`), and applied by
`npx convex dev` / `npx convex deploy`. Set the staging WorkOS Client ID and
API key on the dev deployment and the production pair on the production
deployment with `npx convex env set`; with a deploy-key auth the CLI refuses
to auto-provision and fails instead, so the vars must exist first.

`RESEND_WEBHOOK_SECRET` is mandatory on the Convex deployment for Resend delivery
updates. Set it with `npx convex env set RESEND_WEBHOOK_SECRET <whsec_...>` using
the signing secret from the Resend webhook endpoint. If missing or blank,
`POST /resend-webhook` returns 503 and email delivery states never update.
Invalid webhook signatures return 401.

## Access gate

Staging only: set the staging Worker URL to **Restricted** in the Worker's
Domains tab, which creates a Cloudflare Access self-hosted application. An
allowlist policy (for example a single email via one-time PIN) stops visitors
at the edge before the Worker runs. Signing in then takes two steps: Access
first, then WorkOS. Production (`trytracky.app`) stays public.

No inbound webhook hits the frontend (Enable Banking, Resend, Telegram, and
WorkOS all call the `.convex.site` domain), so the gate breaks nothing.

## Custom domain

`trytracky.app` is attached to the top-level production Worker (Domains tab or
`wrangler deploy --domain`), with its zone on Cloudflare. The staging Worker
keeps its `workers.dev` URL.

## Shared-backend caveat

Staging shares the `dev:woozy-antelope-583` deployment with local development:
a `npx convex dev` republishes functions to whatever backend it targets. For
non-trivial work use a worktree —
`scripts/init-worktree.sh` provisions a dedicated dev deployment per worktree —
so the shared deployment changes only through pushes to `main`.

## Runtime security verification

The frontend executes in Cloudflare workerd; `compatibility_date` selects API behavior, not security patches. It deliberately remains unchanged during this dependency upgrade. Latest Wrangler/Vite packages refresh local tooling, but Cloudflare must confirm the hosted runtime's Brotli/security status. Workers Builds uses a separate Node installation selected by the repository pins and any dashboard override.

All application actions and installed components use the standard Convex runtime. `npm run security:convex-runtime` rejects Node directives and checks browser-compatible bundling before build/dev/deploy. The major-22 entry in convex.json is only a dormant fallback: it does not select a patch, and the policy prevents its use. After publishing through main, collect read-only evidence:

```sh
npx convex run --prod securityRuntime:inspect '{}'
npx convex run --prod securityRuntime:verifyCapabilities '{}'
```

Expect runtime `convex`, nodeVersion `null`, native fetch/WebCrypto, and a successful RSA signature verification with a 24-byte OAuth state and telemetrySerialized true. The telemetry probe initializes the real Langfuse/OTel packages and serializes a synthetic span in memory, without sending it. The capability probe creates an ephemeral synthetic key and makes no external calls or database changes. Development checks use an explicitly configured isolated deployment without `--prod`. Diagnostics remain internal and return no credentials. This verifies removal of the application Node execution path; it does not attest a provider-wide patch or exclude a historical compromise.

The [security audit runbook](security-audit-2026-10.md) lists the production checks and ordered credential-rotation process. Backend environment names are declared as optional strings in `convex/convex.config.ts`; application code imports `env` from `_generated/server`, with existing feature-level required-secret checks preserved. Optional declarations keep unconfigured integrations disabled.

The shadcn CLI is not installed as a project dependency. Its MIT-licensed Tailwind stylesheet is retained in `src/styles/shadcn.css` with the upstream license. Existing UI components remain authored source. Review upstream CLI advisories before invoking it separately for future component work.
