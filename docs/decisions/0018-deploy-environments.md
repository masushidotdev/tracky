# 0018: Staging and production deploy environments

Status: accepted

## Decision

Release-path clarification (23 October 2026): the operator confirmed production deploys automatically from GitHub `main` through Cloudflare Workers Builds. A production release uses push/merge to `main`, without a preceding staging deploy or local deploy commands. Earlier tag/manual-production instructions were stale. The environment separation below remains relevant.

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
- `wrangler.jsonc` is tracked with the actual Worker configuration. Credentials remain in environment/secret stores. The older local-only/template decision no longer describes the repository.

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
  the Wrangler default, so `deploy:prod` only clears `CLOUDFLARE_ENV`
  (empty string selects top-level), and a custom domain attaches cleanly
  to it.
- Previously, tracking the actual Wrangler configuration was rejected in favor of a local template. The current repository tracks it; Worker names and domains are public configuration, while credentials remain secret.

## Verification

- `npm test` (incl. `convex/knowledge-base.test.ts` docs-index check), `npm run lint`.
- Staging, when separately requested: validate its isolated environment and login/callback.
- Production: verify the GitHub `main` commit, its Cloudflare build/deployment result, the Convex runtime evidence and `https://trytracky.app` responses. Full login/callback validation requires an authenticated session.
