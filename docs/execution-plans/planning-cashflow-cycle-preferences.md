# Planning Cashflow Cycle Preferences

Status: implemented.

## Assumptions

- Planning uses one user-wide cycle preference.
- Balance projection includes known future outflows only.
- Running balance is shown in Planning future cashflow only, not in historical
  transactions.
- Missing balances and currency mismatches keep payment rows visible but omit
  projected balances.
- Monthly preferences use the anchor date day as the cycle start day and always
  project one monthly cycle at a time.

## Phases

1. Add persisted planning preferences and cycle-window calculation.
2. Add a planning cashflow view that reuses the existing future cashflow read
   model and enriches account groups with projected balances.
3. Replace the Planning cashflow list/calendar default with a cycle ledger
   table and a preference dialog.
4. Cover cycle, projection, auth, and cross-user behavior with Convex tests.
5. Fix the monthly preference form so the numeric field is interpreted as the
   day of month, not as "every N months"; normalize existing monthly
   preferences with widened counts when reading cashflow.
6. Replace amount-only reconciliation with persisted occurrence payments,
   explicit merchant learning, conservative automatic matching, and
   occurrence-scoped Planning actions.

## Current Verification Evidence

- `npx vitest run convex/planning-cashflow.test.ts convex/planning-math.test.ts`
  passed with the monthly count regression covered.
- `npm run lint` passed.
- `npm run build` passed. Build still reports existing Vite warnings about
  `vite-tsconfig-paths`, unresolved Geist font URLs, and large chunks.
- Regression coverage verifies that the July 11, 18, and 25 allowance
  occurrences remain unpaid with example allowance transactions on June 27 and July 4 and
  an unrelated 21.96 EUR transaction on July 6.
- Occurrence tests cover explicit linking and merchant learning, automatic
  early payment, ambiguous and incompatible candidates, recurring
  payment/reopen behavior, and one-time money-box lifecycle behavior.
