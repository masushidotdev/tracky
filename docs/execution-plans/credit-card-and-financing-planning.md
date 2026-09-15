# Credit Card And Financing Planning

Status: implemented.

## Assumptions

- Credit card usage is tracked as one manual monthly total.
- Financing contracts require a known monthly payment in v1.
- Planning shows credit obligations as generated cashflow projections, not as
  duplicated `plannedExpenses` rows.
- Transaction-row linking targets existing installment plans only.
- Historical installments that predate Tracky setup are registered as manual
  installment payments through a controlled bulk backfill, not by directly
  editing the visual progress state.

## Phases

1. Add `creditFacilityUsageCycles`, credit-cycle mutations, and card-statement
   cashflow projection.
2. Add a guided financing-contract mutation that creates a facility and its
   active installment plan atomically.
3. Add UI controls for card month tracking, financing creation, Planning card
   statement actions, and transaction-to-installment linking.
4. Add controlled installment-payment history backfill so existing loans can be
   aligned to the current outstanding balance without imported transactions.
5. Verify Convex behavior with targeted tests, then run type/lint/build checks.

## Current Verification Evidence

- Convex tests cover card-cycle close/reset, absence of `plannedExpenses`
  materialization, cross-user protection, contract creation, and existing
  transaction installment reconciliation.
- Convex tests cover installment backfill, including residual/next-due updates
  and cross-user denial.
- `npx vitest run convex/credit-repayment.test.ts convex/planning-cashflow.test.ts`
  passed.
- `npm test` passed.
- `npm run lint` passed.
- `npm run build` passed.
