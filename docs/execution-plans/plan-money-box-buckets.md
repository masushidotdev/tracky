# Phase 6 — money boxes linked to plan buckets

Status: Complete

## Assumptions

- A money box can fund at most one ordinary bucket in the same plan.
- The link survives changes that make the money box temporarily ineligible; archived boxes,
  currency mismatches, and boxes backed by accounts outside the plan contribute zero.
- `savedAmount` is a present-day stock. It contributes from the current period onward and is
  independent from `heldOutsideBalance`.
- The pre-funded component is part of bucket availability, but it is removed before calculating the
  following month's carry.

## Phases

1. Add the optional `planBuckets.moneyBoxId` relationship and an authenticated link/unlink mutation.
2. Load qualifying money-box stock into plan computation, expose it separately, and preserve the
   Ready to Assign reconciliation identity.
3. Make target underfunding and Underfunded Auto-Assign account for pre-funded money.
4. Add the bucket-inspector selector, pre-funded metric, and English/Italian copy.
5. Verify focused regression tests, lint, the full Vitest suite, and the production build.

## Current Verification Evidence

- Red test trace before implementation: `6 failed (6)`.
- Targeted Plan regression tests after implementation: `6 passed (6)` files,
  `117 passed (117)` tests.
- Mutation checks: the corresponding focused test failed after independently
  disabling bucket pre-funding, the carry subtraction, the current-period
  boundary, each of the archived/currency/perimeter guards, pre-funded target
  coverage, snapshot invalidation, non-destructive unlinking, the signed panel
  adjustment, and separation from `unexplainedMinor`; every temporary mutation
  was restored and the feature file returned to `6 passed (6)`.
- `pnpm lint`: exit 0.
- `pnpm test`: `93 passed (93)` files, `707 passed (707)` tests.
- `pnpm build`: exit 0, `✓ built in 1.70s`; the existing Vite
  `vite-tsconfig-paths` deprecation notice and unresolved Geist runtime-font
  warnings remain.
