# Legacy card installment balance migration

Status: Complete

## Goal

Repair active installment plans created before manual card conversion began
moving their principal out of the card balance. Each eligible plan removes at
most its remaining principal from the current card debt, without ever making
the balance positive.

## Assumptions

- Money is stored as `bigint` minor units and this repair accepts EUR only.
- Eligible facilities use a card-backed type and link to a manual `CARD`
  account; provider-managed balances remain authoritative and untouched.
- `outstandingAmount` is the plan principal still duplicated in the legacy card
  balance.
- The correction marker belongs to the installment plan. New manual-card
  conversions write it in the normal path, while the migration writes the same
  marker after inspecting a legacy plan.
- The existing Plan snapshot invalidation helper receives the plan start date,
  the prior balance reference date, and the correction date.

## Phases

1. Widen the installment-plan schema with optional correction marker fields and
   write them for new manual-card conversions.
2. Add a paginated internal migration that processes installment plans,
   corrects only eligible manual cards, caps balances at zero, records separate
   corrected/already-corrected counts, and invalidates affected snapshots.
3. Cover the real availability regression, a second run, provider cards, the
   zero cap, and the no-plan case with `convex-test`.
4. Prove the primary test fails when the balance correction is neutralized,
   then run lint, the complete test suite, and the production build.

## Current Verification Evidence

- Focused verification: `2 passed (2)` files, `15 passed (15)` tests.
- Mutation check with the balance addition neutralized: the primary migration
  test failed with `Received: -120000n`, `Expected: 0n`.
- `pnpm lint`: exit 0 (`tsc` and ESLint, zero errors and zero warnings from
  either checker).
- `pnpm test`: `95 passed (95)` files, `766 passed (766)` tests.
- `pnpm build`: exit 0, `✓ built in 2.34s`; the existing
  `vite-tsconfig-paths` deprecation and unresolved Geist runtime-font notices
  remain.
