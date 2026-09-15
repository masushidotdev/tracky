# Decision 0002: Credit Facilities And Installment Lines

Status: active.

## Context

Tracky must support full tracking for current accounts, cards, overdrafts,
card limits, additional credit lines, loans, and installment facilities. Some
bank products expose separate credit lines on the same card/account. Example Bank
Flexia Linea Premium is the reference example: a card can have both the normal
card credit line and an additional line that is repaid through installment
plans.

## Decision

- Credit capacity is modeled in `creditFacilities`, not as account balance.
- A facility can be an account overdraft, card credit line, additional card
  credit line, installment credit, mortgage, auto loan, personal loan, or other
  manual facility.
- Mortgages, auto loans, and personal loans are `creditFacilities` distinguished
  by `facilityType`. Their amortisation schedule is a
  `creditFacilityInstallmentPlans` row, and `settlementAccountId` identifies the
  cash account debited for each instalment.
- Loans do not create a parallel debt model. One outstanding principal must have
  one representation so net worth, facility summaries, and Planning cannot
  count the balance and its repayment schedule twice.
- A facility can optionally link to an imported `financialAccounts` row but
  stays app-owned/manual when providers do not expose it.
- Facility summaries expose limit, used amount, available amount,
  utilization, active installment plan count, and active installment debt.
- Every use that creates a repayment schedule is represented by
  `creditFacilityInstallmentPlans`.
- Historical installments that were paid before the plan was configured in
  Tracky are represented by `creditFacilityInstallmentPayments` with
  `source: manual`, created through a bounded bulk backfill action. We do not
  directly patch progress counters without payment rows.
- Planning reads active installment plans as future obligations by generating
  bounded upcoming-payment schedules. These repayment obligations are visible
  beside money boxes but are not money boxes themselves.
- Monthly credit card usage is tracked through `creditFacilityUsageCycles`.
  Open cycles hold the manually tracked current-month usage; closing a cycle
  turns it into a scheduled card-statement obligation for Planning and opens
  the next cycle at zero.
- Closed card-statement cycles and installment schedules are generated Planning
  projections, not `plannedTransactions` rows. `plannedTransactions` remains the
  persisted model for manual, suggested, and subscription-backed expected
  movements.
- Budget spending must not treat credit limit as available cash.

## Loan projection rule

A projection starts from the next instalment that is still due, never from a
stored date that has already passed. Replaying an overdue instalment would reduce
today's observed balance a second time and make the projected payoff too early.

A loan may store the payoff date stated by its contract. That date wins over the
rate-based estimate because live Italian variable-rate mortgage data showed that
the lender can keep the capital schedule fixed at origination while changing the
instalment. Amortising today's balance at today's rate therefore produced a date
years earlier than the contract.

## Consequences

- Users can track a 3,000 EUR overdraft, a card plafond, and a 1,000 EUR
  additional card line as separate capacities even if the banking provider
  exposes only one card/account feed.
- Provider imports can later reconcile card statement debits or installment
  payments against manually configured facilities without changing the
  normalized account/transaction tables.
- The UI can warn about high utilization or over-limit states without
  distorting liquidity calculations.
- The UI can surface upcoming installment repayments immediately after a manual
  plan is created, even before the provider exposes the repayment transaction.
- Credit-card statement balances can be planned before the bank debit arrives,
  while the imported debit can still be reconciled separately when it appears.
- Backfilled installment history updates outstanding debt, remaining
  installments, facility usage, and future Planning projections through the same
  repayment model used by imported transactions.
- Mortgage and loan balances participate in net worth as liabilities while
  remaining outside Plan liquidity. Their instalments route to the configured
  settlement account without introducing a second principal balance.
- Loan pages, payoff curves, and generated instalments use the contractual payoff
  date when present; otherwise they use the bounded amortisation projection from
  the next future instalment.
