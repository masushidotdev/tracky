<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Project Map

- `convex/` contains all backend data, HTTP endpoints, cron jobs, webhooks, and provider integrations.
- `src/` contains the TanStack Start UI and client-side route composition.
- `docs/` contains architecture, decision records, execution plans, and verification notes. Keep broad product and architecture context there instead of expanding this file.

## Working Rules

- Read `convex/_generated/ai/guidelines.md` before changing Convex code.
- Do not pass user IDs from the client for authorization. Derive the current WorkOS user server-side.
- Keep external banking integrations behind a provider boundary so Enable Banking can be replaced later.
- Store money amounts as integer minor units plus currency codes, not floating point amounts.
- Keep Convex queries bounded or paginated and backed by indexes. Avoid `.filter()` in database queries.
- Put sensitive backend behavior in internal Convex functions unless it is intentionally public.

## Worktree Bootstrap

- `scripts/init-worktree.sh` is the single bootstrap for every harness: it installs dependencies, strips inherited Convex coordinates from `.env.local`, provisions a per-worktree dev deployment (`dev/$USER-<harness>/<worktree>`), mints a scoped deploy key, pushes the functions, and sets the URL-derived environment variables. It is idempotent and refuses to touch the main checkout.
- Codex runs it from `.codex/environments/environment.toml`; Claude Code runs it through the `WorktreeCreate` hook in `.claude/settings.json`, which also seeds the gitignored files listed in `.worktreeinclude`. Cloud sessions get no worktree, so a `SessionStart` hook covers them; locally that hook is a no-op because the script skips the main checkout and already-initialized worktrees.
- Worktrees branch from the local `HEAD`, so a worktree asked for mid-session carries the commits of the branch in progress. Uncommitted changes never follow. Set `TRACKY_WORKTREE_BASE_REF=fresh` to branch from `origin/HEAD` instead.
- Without Convex credentials (`CONVEX_ACCESS_TOKEN` or `~/.convex/config.json`) the script installs dependencies and skips the deployment, so cloud sessions still start.

## Commands

- `npm run lint` runs TypeScript and ESLint.
- `npm run build` builds the TanStack Start app.
- `npm run dev` starts Convex and Vite together.
- `npm run deploy` publishes Convex functions and the Cloudflare Worker by hand;
  pushes to `main` do the same through Workers Builds. Both build and deploy
  need `CLOUDFLARE_ENV=staging`, which the script already sets. See
  `docs/deployment.md`.

## Planning And Verification

- For multi-step product work, update `docs/execution-plans/` with assumptions, phases, and verification evidence.
- When a repeated mistake or important architectural decision appears, add or update a short document under `docs/decisions/`.

## Documentation Is Part Of The Change

Every change ships with its documentation, in the same commit or the same series:

- **User documentation** in `src/content/user-docs/en` and `src/content/user-docs/it`. Both languages,
  always. A feature that behaves differently than the page describing it is a bug in the page.
- **Developer documentation** in `docs/`: `architecture.md` when boundaries or data flow move, a note
  under `docs/decisions/` when a decision constrains future work, a page under `docs/execution-plans/`
  for multi-step work. New pages must be added to the index in `docs/README.md`, which
  `convex/knowledge-base.test.ts` verifies.

Write them from what actually happened, not from the ticket: the plan as it was agreed, the decisions
taken in questions and answers along the way and the reasoning behind them, the inconsistencies found
while building, and the bugs fixed with what caused them. A decision recorded without its reason will
be reversed by the next person who meets the same trade-off.

Amend, do not append: when behaviour changes, the text describing the old behaviour is corrected or
deleted. Two pages describing the same feature differently are worse than one page missing.
