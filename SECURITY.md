# Security Policy

## Supported versions

Tracky is pre-1.0. Security fixes land on `main` and are noted in
[CHANGELOG.md](CHANGELOG.md). If you run a fork, keep it rebased on `main`.

## Reporting a vulnerability

Open a **private** report via GitHub Security Advisories on this repository
(`Security` tab → `Report a vulnerability`). Include:

- What is affected (endpoint, function, or file).
- Steps to reproduce or a proof of concept with **fake data only**.
- Impact assessment if known.

Do not open public issues for vulnerabilities, and never include real
credentials, bank data, or tokens in any report. Expect an initial response
within 7 days.

## Key-handling rules

- All secrets live in Convex encrypted environment variables
  (`npx convex env set NAME value`) or Cloudflare Worker secrets — never in
  git, never in `VITE_` variables, never in client code.
- Only `VITE_CONVEX_URL` is browser-visible, by design.
- The pre-commit hook (`githooks/pre-commit`) blocks env files and PEM blocks;
  CI runs the same scan plus an IBAN pattern check.
- If the Enable Banking private key is ever exposed, rotate it in the Enable
  Banking control panel immediately and replace the Convex env value.
- Telegram webhook calls require the secret header; the bot accepts only
  private text messages with a linked account.

## Telemetry

The Analyst backend can send LLM traces to Langfuse, but only when
`LANGFUSE_PUBLIC_KEY` is set — otherwise telemetry is fully disabled. No
browser analytics, error trackers, or third-party scripts ship with the app.
Email delivery (Resend) is server-side only.

## Bank-sync disclaimer (Enable Banking)

Bank sync connects **your own** Enable Banking application with **your own**
keys and consent. You are responsible for:

- Registering your app and certificate in the Enable Banking control panel.
- Keeping your private key and Convex environment secret.
- Understanding that transaction data flows through Enable Banking and your
  Convex deployment.

The maintainers never see your bank credentials. Raw provider payloads
captured locally stay in gitignored `diagnostics/` (0600) and must never be
committed or pasted into issues.
