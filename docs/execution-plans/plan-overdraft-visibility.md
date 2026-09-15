# Plan overdraft visibility

Status: implemented.

## Assumptions

- The overdraft headline uses current preferred booked balances, matching the current liquidity stock already used by the Plan.
- Card accounts are debt rather than cash and do not contribute to the account-overdraft headline.
- The overdrawn amount is the sum of negative cash-account positions in the Plan perimeter.
- Remaining overdraft credit is shown only when an active EUR `accountOverdraft` facility is linked to an overdrawn account; limits are aggregated per account and current usage comes from its negative booked position.
- Historical Plan mathematics and the Ready to Assign reconciliation remain unchanged.

## Phases

1. Expose a nullable current overdraft summary and the existing per-bucket credit overspending value in `getPlanMonth`.
2. Add a calm, numeric overdraft notice to the Plan header and split overspending copy into cash and credit shares using existing destructive and warning tones.
3. Add Convex and UI/read-model tests for facility, no-facility, no-overdraft, mixed overspending, cash-only overspending, and accounting invariants.
4. Run negative controls, lint, the complete test suite, and the production build.

## Current Verification Evidence

- Pre-change focused baseline: `pnpm vitest run convex/plan-read.test.ts src/components/banking/plan/plan-status.test.ts` passed with 2 files and 61 tests.
- Payload/status negative control: with the new payload fields and cash/credit split disabled, the focused run failed with 2 files failed, 9 tests failed, and 59 tests passed.
- Rendering negative control: with the header notice and credit-share rendering disabled, the SSR run failed with 1 file failed, 4 tests failed, and 1 test passed.
- Restored SSR verification: `pnpm vitest run src/components/banking/plan/plan-overdraft-visibility.test.tsx` passed with 1 file and 5 tests.
- `pnpm lint` passed (`tsc` and ESLint, zero errors and warnings).
- `pnpm test` passed with 94 files and 733 tests.
- `pnpm build` passed (`✓ built in 1.55s`); the existing Vite tsconfig-paths recommendation and unresolved Geist font-at-build-time notices remain.
