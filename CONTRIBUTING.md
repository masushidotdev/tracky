# Contributing to Tracky

## Setup

```bash
npm ci
npx convex dev                      # provisions Convex + WorkOS AuthKit dev env in .env.local
npm run dev                         # ensures WORKOS_COOKIE_PASSWORD in .env.local, then starts Vite + Convex
```

`convex.json` (`authKit.dev`) auto-provisions a dev WorkOS AuthKit environment
on a Convex-managed team, configures `http://localhost:3000` redirect/CORS/homepage,
and writes `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and `WORKOS_REDIRECT_URI` into
`.env.local`. `npm run dev` runs `scripts/dev-auth-env.mjs` via `predev` to
generate a random `WORKOS_COOKIE_PASSWORD` in `.env.local` when missing (and
warns if a `.dev.vars` file exists without those keys, since Wrangler reads
`.dev.vars` instead of `.env.local` whenever `.dev.vars` is present).

To bring your own WorkOS environment instead, put `WORKOS_CLIENT_ID` and
`WORKOS_API_KEY` in `.env.local` (or copy `.env.example` to `.env.local` and
fill them in) before running `npx convex dev`.

Each contributor uses their own Convex deployment, WorkOS environment, and
(optionally) Enable Banking app. Never point a dev checkout at someone else's
backend. For parallel work, `scripts/init-worktree.sh` provisions a dedicated
Convex deployment per worktree.

## Checks

```bash
npm test        # vitest, full suite must pass
npm run lint    # tsc + ESLint, zero warnings
npm run build   # production bundles
```

CI runs the same three commands plus a secret scan on every PR.

## Fixture rule (strict)

Tests and docs use **fake Acme-style data only**:

- Banks: `Acme Bank`; accounts: `Acme Checking`, `Acme Personal (4242)`.
- People: `Alex Rivera` and similar generic names.
- Merchants: `Acme Groceries`, `Acme Telecom`, `Acme Streaming`, `Acme Market`.
- Cards: `*4242`; invoices: `INV-2026-0601` style.
- Never commit real names, IBANs, balances, bank exports, or provider payloads.
- Raw provider captures belong in gitignored `diagnostics/` (0600 files) and
  must never be force-added.

## Identity

- Commit with your GitHub noreply address
  (`<id>+<login>@users.noreply.github.com`), never a personal mailbox —
  commit emails are public on a public repository.

## Pull requests

- Keep changes focused; one concern per PR.
- Update `src/content/user-docs/en` **and** `it` when behavior changes.
- Update `docs/` (architecture, decisions, changelog) for user-visible changes.
- Changelog: maintainers add the entry at merge; contributors need not edit it.
- Docs index: `docs/README.md` must list every durable page —
  `convex/knowledge-base.test.ts` enforces this, including `Status:` lines on
  decisions and `## Current Verification Evidence` on execution plans.
- The pre-commit hook (`githooks/pre-commit`) blocks env files and PEM blocks;
  bypass with `--no-verify` only consciously.
