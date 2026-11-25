# Tracky

Personal finance tracker: manual and bank-synced accounts, transaction ledger,
zero-based planning, credit facilities, reports, and an AI analyst with an
optional Telegram channel.

Built on [Convex](https://convex.dev/) (database + server logic),
[TanStack Start](https://tanstack.com/start) (React frontend), and
[WorkOS AuthKit](https://authkit.com/) (authentication).

![Tracky Plan auto-assign](public/docs/plan/plan-auto-assign.jpg)

## Features

- Accounts: manual cash/card accounts plus bank sync via
  [Enable Banking](https://enablebanking.com/) (each user connects their own
  Enable Banking app and keys — see [SECURITY.md](SECURITY.md)).
- Ledger: imports, transfers, categories, CSV import, reports.
- Plan: zero-based budgeting with buckets, targets, and auto-assign.
- Credit: facilities, installments, loans, card statements.
- Analyst: Convex-native AI assistant with approval-gated writes, email
  reports, and Telegram delivery (all optional, server-side only).
- Bilingual user docs (EN/IT) in `src/content/user-docs/`.

## Prerequisites

- Node.js >=22.23.4 <23 (pinned in `.nvmrc`) and npm (npm only — `package-lock.json` is the single lockfile).
- A [Convex](https://convex.dev/) account (for Convex Cloud dev; not needed for Docker self-hosting).
- Optional for Convex Cloud dev (required for Docker self-hosting or bring-your-own auth): a [WorkOS](https://workos.com/) account (AuthKit).
- Optional: Enable Banking app, Resend key, Telegram bot, AI Gateway key.

## Quickstart

```bash
npm ci
npx convex dev                      # provisions Convex + WorkOS AuthKit dev env in .env.local
npm run dev                         # generates WORKOS_COOKIE_PASSWORD if missing, then starts Vite + Convex
```

Open [http://localhost:3000](http://localhost:3000).

**How WorkOS onboarding works in dev:** `convex.json` declares `authKit.dev`, so
`npx convex dev` automatically provisions a dev WorkOS AuthKit environment on a
Convex-managed team (or reuses `WORKOS_CLIENT_ID` / `WORKOS_API_KEY` if you
already set them), configures the `http://localhost:3000` redirect URI,
homepage, and CORS origin, and writes `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and
`WORKOS_REDIRECT_URI` to `.env.local`. When you run `npm run dev`, the `predev`
hook (`scripts/dev-auth-env.mjs`) appends a random 48-character
`WORKOS_COOKIE_PASSWORD` to `.env.local` if neither `.env.local` nor `.dev.vars`
defines one.

> **Note on `.dev.vars`:** Local SSR runs on `workerd` via `@cloudflare/vite-plugin`, which loads server secrets from `.env.local` only when `.dev.vars` does not exist. If you keep a `.dev.vars` file, copy the `WORKOS_*` keys into it (or delete `.dev.vars` to use `.env.local`); `npm run dev` warns if any `WORKOS_*` keys diverge.

**Bring your own WorkOS environment (manual fallback):** if you prefer your own
WorkOS project instead of the Convex-managed one, put `WORKOS_CLIENT_ID` and
`WORKOS_API_KEY` in `.env.local` (or set them in Convex with
`npx convex env set WORKOS_CLIENT_ID ...` and
`npx convex env set WORKOS_API_KEY ...`) before running `npx convex dev`. Convex
will reuse your environment and still configure the `http://localhost:3000`
redirect URI, homepage, and CORS origin.

Enable Banking (per user, own app and keys):

```bash
npx convex env set ENABLE_BANKING_APP_ID <your_app_id>
npx convex env set ENABLE_BANKING_PRIVATE_KEY <base64_or_escaped_pem>
npx convex env set ENABLE_BANKING_REDIRECT_URL https://<your-deployment>.convex.site/enablebanking/callback
```

Analyst AI / email / Telegram (all optional, Convex env only):

```bash
npx convex env set AI_GATEWAY_API_KEY <key>
npx convex env set RESEND_API_KEY <key>
npx convex env set TELEGRAM_BOT_TOKEN <token>
npx convex env set TELEGRAM_WEBHOOK_SECRET <random_secret_32_chars>
npx convex env set TELEGRAM_WEBHOOK_URL https://<your-deployment>.convex.site/telegram-webhook
npx convex run analyst/telegramActions:registerTelegramWebhook
```

## Self-host with Docker

Run Tracky locally or on a single-node VPS backed by a self-hosted Convex
backend (no telemetry; WorkOS AuthKit stays external):

```bash
node scripts/selfhost-setup.mjs     # or `npm run selfhost:setup` (Node 22 only, no `npm ci` needed)
docker compose up -d
```

The setup script configures your WorkOS redirect URI, homepage, CORS origin
(and optional user-sync webhook on public HTTPS installs), generates missing
secrets, and writes `.env` (`0600`). Open [http://localhost:3000](http://localhost:3000).
See the full guide — including manual `.env` configuration and reverse proxy
setup — in [docs/self-hosting.md](docs/self-hosting.md) (English) or
[docs/self-hosting.it.md](docs/self-hosting.it.md) (Italiano).

## Security: secrets handling

- Never commit `.env.local` or key material. Production secrets belong in
  Convex encrypted environment variables (`npx convex env set NAME value`).
- `npm install` runs the `prepare` script, which installs a pre-commit hook
  (`githooks/pre-commit`) blocking env files and PEM private-key blocks.
- If the Enable Banking private key is ever exposed, rotate it in the Enable
  Banking control panel immediately. See [SECURITY.md](SECURITY.md).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server + Convex |
| `npm run build` | Production build |
| `npm test` | `vitest run` (full suite) |
| `npm run lint` | `tsc` + ESLint, zero warnings |
| `npm run deploy` | Convex deploy + Cloudflare Worker deploy |
| `npm run selfhost:setup` | Interactive/CLI WorkOS + `.env` setup for Docker self-hosting |
| `npm run diagnostics:enable-banking` | Local Enable Banking payload capture (gitignored `diagnostics/`) |

## Project layout

- `convex/` — backend: schema, banking sync, planning, analyst, tests.
- `src/` — TanStack Start frontend, routes, components.
- `src/content/user-docs/` — bilingual user documentation (EN/IT).
- `docs/` — developer docs: `architecture.md`, `deployment.md`, `decisions/`.
- `scripts/` — worktree bootstrap, diagnostics.
- `githooks/` — pre-commit secret guard.

## Docs

- [docs/architecture.md](docs/architecture.md) — domain boundaries and data flow.
- [docs/deployment.md](docs/deployment.md) — Cloudflare Worker + Convex deploy.
- [docs/self-hosting.md](docs/self-hosting.md) ([Italiano](docs/self-hosting.it.md)) — Docker Compose self-hosting with self-hosted Convex.
- [docs/decisions/](docs/decisions/) — architecture decision records.
- [CONTRIBUTING.md](CONTRIBUTING.md) — dev setup and PR process.
- [SECURITY.md](SECURITY.md) — reporting, key handling, bank-sync disclaimer.

## License

MIT — see [LICENSE](LICENSE). Font: Geist Variable via Fontsource (SIL OFL).

Dependency note: `sharp` (via `@cloudflare/vite-plugin` → miniflare, dev-only)
bundles libvips prebuilds (`@img/sharp-libvips-*`, LGPL-3.0-or-later),
dynamically linked. It is not part of the shipped app bundle.
