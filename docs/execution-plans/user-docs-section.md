# User-facing Docs section

Status: in progress  
Owner: Codex  
Last updated: 2026-07-15

## Goal

Ship bilingual, authenticated user documentation at `/app/docs/*`, separate from this developer documentation. The section covers every user-visible workflow, with deeper material for Planning, manual accounts, CARD accounts, credit facilities, statements, installments, and the calculations shown by the app.

## Decisions and assumptions

- Content lives in `src/content/user-docs/{it,en}` with identical slugs and equivalent coverage.
- Markdown/MDX is compiled at build time; only explicitly registered UI components are allowed.
- Docs search is a locale-specific static index loaded only when search is used.
- CARD account balance is the single net-worth source for CARD-linked debt; statements and installments remain cashflow schedules and are not added again.
- Documentation assets may contain only redacted or synthetic financial data.

## Phases

1. Correct the CARD/planning/net-worth invariants and currency-aware money inputs.
2. Add the typed MDX pipeline, authenticated routes, responsive reader, navigation, and full-text search.
3. Author and localize the feature/tutorial matrix.
4. Verify privacy, content parity, links, accessibility, tests, lint, build, and authenticated browser flows.

## Current Verification Evidence

- Baseline CARD/manual-account suite: 25 tests passed before implementation.
- Truth audit: 51 Convex test files and 301 tests passed on 2026-07-15.
- Currency exponent client test covers JPY, EUR, and KWD.
- Final suite: 53 test files and 309 tests passed on 2026-07-15.
- `npm run lint`, `npm run build`, and `git diff --check` pass; build generated 30 localized MDX modules in separate chunks.
- Manifest tests enforce IT/EN slug parity, unique identities, navigation order, and valid related links.
- Browser QA and media capture are pending Chrome session reconnection.
