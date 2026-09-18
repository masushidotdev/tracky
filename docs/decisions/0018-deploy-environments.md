# 0018: Staging and production deploy environments

Status: accepted

## Decision

Two deploy environments, one shared Convex dev deployment for dev+staging, a
Convex production deployment for prod:

- dev+staging share `dev:woozy-antelope-583` (team `tracky`, project `tracky`).
  No separate Convex staging deployment. WorkOS `authKit.dev.configure` covers
  both `http://localhost:3000` and
  `https://tracky-oos-staging.masushi.workers.dev`.
- prod uses the project's production deployment plus the
  `authKit.prod.configure` profile pinned to `https://trytracky.app`
  (`environmentType: production`, so Convex provisions a production WorkOS
  environment).
- Cloudflare: staging is the named env `tracky-oos-staging` on
  `tracky-oos-staging.masushi.workers.dev` behind Cloudflare Access;
  production is the top-level Worker `tracky-oos` serving `trytracky.app`,
  public.
- `wrangler.jsonc` holds real names locally and is gitignored; the repo tracks
  only `wrangler.jsonc.example` (sanitized, env-free template).

## Why

Convex docs recommend a separate project for stable staging, but this repo has
one developer, clean data everywhere, and no migration to protect — a shared
dev deployment is cheaper and simpler. The trap is that `npx convex dev`
republishes to its target backend, so dev and staging must never diverge on
the same deployment; the shared-backend caveat in `docs/deployment.md` covers
that.

WorkOS Staging and Production environments are fully isolated (keys, client
IDs, users, webhooks), while Convex's managed team auto-provisions per
deployment — so per-deployment `authKit` profiles (`dev` for staging traffic,
`prod` for production) give the right credentials without a second WorkOS team.

The `preview` authKit profile from #25 was removed: preview deployments stay
off, and an unused `preview` section with a `${buildEnv.APP_PUBLIC_URL}`
template would crash deploys that require the var to be set. When previews
return, they need their own backend each — one shared backend would mix data.

## Alternatives considered

- Separate Convex project for staging: rejected for now — extra deploy keys,
  env duplication, and cost with no data worth isolating. Revisit when staging
  holds real data or a second developer joins.
- `env.production` named Worker instead of top-level: rejected — top-level is
  the Wrangler default, so `deploy:prod` needs no `CLOUDFLARE_ENV`, and a
  custom domain attaches cleanly to it.
- `wrangler.jsonc` tracked with real names: rejected — public repo; real
  worker names and env blocks stay local, template stays committed.

## Verification

- `npm test` (incl. `convex/knowledge-base.test.ts` docs-index check), `npm run lint`.
- Staging: `npm run deploy` from `main`, login on staging URL, callback 200.
- Prod: Convex production deployment created, `deploy:prod` from tag, login on
  `https://trytracky.app`, callback 200.
