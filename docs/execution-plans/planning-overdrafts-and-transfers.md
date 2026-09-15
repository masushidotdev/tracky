# Planning Overdraft Availability And Transfers

Status: implemented.

## Assumptions

- Account balance remains the imported ledger balance.
- Projected available balance adds the total active same-currency overdraft
  limit linked to the account.
- Planning warnings use projected available balance, while the ledger balance
  remains visible separately.
- Planned transfers are app-owned projections, not synthetic bank
  transactions.
- Planned transfers use one date and one currency in v1 and are completed or
  cancelled manually.

## Phases

1. Add dedicated planned-transfer persistence and authenticated mutations.
2. Generate paired source/destination cashflow rows without counting internal
   transfers as obligations.
3. Enrich account projections with overdraft-backed available balances.
4. Add Planning forms, editing, status actions, availability columns, and
   localized labels.
5. Cover availability, transfer projection, totals, validation, and ownership
   with Convex tests.

## Current Verification Evidence

- `npx vitest run convex/planning-cashflow.test.ts` passed with 32 tests.
- `npm test` passed with 127 tests.
- `npm run lint` passed.
- `npm run build` passed with existing Vite warnings about
  `vite-tsconfig-paths`, unresolved Geist font URLs, and large chunks.
