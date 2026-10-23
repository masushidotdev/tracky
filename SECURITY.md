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
- Every `VITE_` value is browser-visible. Only public configuration belongs there: the Convex URL, feature flags, and the PostHog project token/host. Personal API keys and provider credentials must never use this prefix.
- The pre-commit hook (`githooks/pre-commit`) blocks env files and PEM blocks;
  CI runs the same scan plus an IBAN pattern check.
- If the Enable Banking private key is ever exposed, rotate it in the Enable
  Banking control panel immediately and replace the Convex env value.
- Telegram webhook calls require the secret header; the bot accepts only
  private text messages with a linked account.

## Telemetry

The Analyst backend can send LLM traces to Langfuse, but only when
`LANGFUSE_PUBLIC_KEY` is set — otherwise Analyst telemetry is disabled. AI SDK telemetry is scoped to each generation and does not record prompt, tool input, or output bodies. Model, timing, usage, and pseudonymous user/thread identifiers can still be exported.

The browser can initialize PostHog only when explicitly configured and after usage-analytics consent. Inputs and sensitive financial elements are masked for session replay. See `docs/decisions/0022-posthog-tracking.md` for its separate retention and consent policy. Email delivery (Resend) is server-side only.

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

## Runtime patching and incident response

Use Node >=22.23.4 <23 for repository tooling; `.nvmrc`, `.node-version`, npm engines and lifecycle checks enforce the same line. CI audits the full dependency tree. An npm audit success does not attest a Node binary, managed runtime, or absence of compromise.

Convex Node actions select major 22 in `convex.json`; Convex owns the patch build. Cloudflare Workers runs workerd and Node compatibility APIs, separately from the Node machine used by Workers Builds. Neither updating npm clients nor changing a compatibility date certifies either hosted runtime's patch status.

Follow [the October 2026 audit and response runbook](docs/security-audit-2026-10.md) to verify deployed runtimes, review retained logs, rebuild from a clean checkout and rotate credentials after securing affected environments. Provider confirmation and account-level evidence are required before closing an incident.
