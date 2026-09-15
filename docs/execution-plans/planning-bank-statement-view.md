# Planning Bank Statement View

Status: implemented.

## Scope

- Present each account cashflow as a bank statement with opening and projected closing balance rows, split Out/In movement columns, and projected balance details in tooltips.
- Render active money boxes as individual cards in a responsive grid immediately below cashflow.
- Summarize upcoming credit commitments once per facility, with expandable plan detail for multi-plan facilities.
- Remove the `FundingCards` block from the cashflow panel: it duplicated the money box cards that now sit directly below it.
- Keep all data aggregation client-side and leave the Convex backend unchanged.

## Verification Plan

1. Run TypeScript and ESLint checks.
2. Run the complete automated test suite.
3. Build the client and SSR production bundles.

## Current Verification Evidence

- `pnpm lint` passed: TypeScript and ESLint completed with zero warnings.
- `pnpm test` passed: 20 test files and 145 tests.
- `pnpm build` passed: client and SSR bundles built successfully; Vite retained the repository's existing advisories for `vite-tsconfig-paths`, unresolved Geist font URLs, and the client chunk-size threshold.
