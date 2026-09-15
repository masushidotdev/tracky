# Planning Transfers With Card Sources

Status: implemented.

## Scope

- Model exactly one planned-transfer source: a cash account or an active card credit line.
- Include card-funded destination inflows in account cashflow and roll the charge into the appropriate projected card statement.
- Move creation into account-table dialogs, support inline amount changes, and hard-delete planned transfers.
- Present upcoming credit repayments and planned expenses in the specified compact table-oriented layouts.

## Verification Plan

1. Cover endpoint invariants, card statement projections, amount updates, deletion, and completion accounting with Convex tests.
2. Run the complete lint, test, and production-build commands.
3. Record the final command evidence below.

## Current Verification Evidence

- `pnpm lint` passed: TypeScript and ESLint completed with zero warnings.
- `pnpm test` passed: 20 test files and 145 tests.
- `pnpm build` passed: client and SSR bundles built successfully; Vite retained the repository's existing advisory output for `vite-tsconfig-paths`, unresolved Geist font URLs, and the client chunk-size threshold.
