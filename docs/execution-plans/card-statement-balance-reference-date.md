# Card statement balance reference-date correction

Status: Complete

## Goal

Prevent an explicitly registered card-statement payment from changing a manual
card balance when the payment is already covered by that balance's
`referenceDate`, preview the effect before confirmation, reject statement
registrations that would make a card balance positive, and repair legacy
double-counted balances.

## Assumptions

- All statement-registration amounts are integer EUR minor units.
- A manual card's latest preferred booked balance is the authoritative starting
  point for both the preview and the mutation.
- A missing `referenceDate` preserves the legacy delta behavior.
- Provider-backed cards receive balances only from their provider.
- Legacy synthetic statement legs are identified by
  `providerMetadata.trackySyntheticKind === "cardStatementSettlement"`.
- A repair is recorded on the synthetic transaction metadata so rerunning the
  migration cannot apply the same correction twice.

## Phases

1. Add load-bearing Convex tests for reference-date ordering, missing dates,
   provider cards, the positive-balance guard, candidate previews, and
   migration idempotence.
2. Centralize statement balance-impact calculation and let the synthetic manual
   leg opt out of its usual balance delta.
3. Expose the impact from the candidates query and render localized English and
   Italian guidance in the card bucket inspector.
4. Add the paginated one-time migration and invalidate plan snapshots from the
   affected dates.
5. Mutation-check each correction by temporarily disabling it and observing its
   dedicated test fail, then run lint, the full test suite, and the production
   build.

## Current Verification Evidence

- Targeted regression tests: `3 passed (3)` files, `27 passed (27)` tests.
- Mutation checks: the dedicated tests failed after independently disabling
  reference-date suppression, dated and undated legacy balance updates, the
  provider-managed preview, the positive-balance guard, migration correction,
  migration idempotence, and free positive manual-balance entry; every
  temporary change was restored.
- `pnpm lint`: exit 0.
- `pnpm test`: `93 passed (93)` files, `716 passed (716)` tests.
- `pnpm build`: exit 0, `✓ built in 2.00s`; existing Vite
  `vite-tsconfig-paths` and unresolved Geist runtime-font warnings remain.
