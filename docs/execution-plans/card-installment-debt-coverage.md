# Card instalment debt coverage

Status: Complete

## Goal

Prevent a card-payment bucket from requesting debt that an active instalment
plan on the linked card already requests through its Instalments bucket.

## Assumptions and invariants

- Amounts remain integer minor units and only EUR plans are eligible.
- Eligible coverage comes from the positive `outstandingAmount` of active
  `creditFacilityInstallmentPlans` whose facility is linked to the card account.
- Both the outstanding amount and monthly payment must use the Plan currency.
- Gross card debt remains visible. The payload separately exposes the portion
  covered by eligible instalment outstanding.
- An explicit card-bucket target continues to override the derived card need.
- Card coverage changes only `neededMinor` and derived underfunding/status. It
  does not change activity, liquidity, `readyToAssignMinor`,
  `unexplainedMinor`, or the Ready to Assign reconciliation identity.

## Phases

1. Extend the bounded instalment-plan context with eligible outstanding grouped
   by linked account.
2. Derive card need as gross debt less instalment-covered debt, floored at zero,
   while preserving target precedence.
3. Expose the covered amount in the month payload and card-bucket inspector with
   English and Italian copy.
4. Add load-bearing regressions for full and partial coverage, new card
   spending, changing outstanding/balance, the no-plan fallback, target
   precedence, currency/status eligibility, and accounting invariants.
5. Run focused tests, `pnpm lint`, `pnpm test`, and `pnpm build`; record exact
   verification evidence.

## Current Verification Evidence

- Focused Plan read: `1 passed (1)` file, `76 passed (76)` tests.
- Load-bearing mutation: temporarily restoring the old gross-card-debt fallback
  produced `1 failed (1)` file and `7 failed | 69 passed (76)` tests; the seven
  failures were exactly the seven new regressions. Restoring the net need
  returned the file to `76 passed (76)`.
- Focused Plan read plus knowledge-base guard: `2 passed (2)` files,
  `79 passed (79)` tests.
- `pnpm lint`: exit 0.
- `pnpm test`: `94 passed (94)` files, `755 passed (755)` tests.
- `pnpm build`: exit 0, `✓ built in 2.31s`. Existing advisories remained for
  `vite-tsconfig-paths` and unresolved Geist font files.
