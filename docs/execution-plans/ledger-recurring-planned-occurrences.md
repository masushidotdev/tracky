# Recurring planned occurrences in the ledger

Status: implemented.

## Scope

Show the next unpaid occurrence of every account-bound recurring
`plannedTransactions` rule in the ledger's Scheduled transactions band without
materialising another `transactions` row or changing the behavior of real `SCHD`
rows.

## Implementation

1. Add bounded recurrence-bearing indexes and a planning query for the
   authenticated user's active expense and income rules. Account-scoped ledgers
   include the account in the index; All Accounts reads the corresponding
   user/kind/status/recurrence buckets. Both paths cap every bucket and never use
   a Convex runtime `.filter()`.
2. Advance each recurrence from its anchor to the first date on or after today.
   Occurrence-payment records are read through the user/date index; paid dates
   advance the rule again so a completed occurrence does not return.
3. Return only rendering data: rule id, due date, name, description, amount,
   direction, category, account, and recurrence interval/count.
4. Adapt each result in one frontend factory to a document-shaped
   `TransactionRow` with id `planned:<ruleId>:<dueDate>`. The cast remains inside
   that factory; `plannedOccurrence` carries the real rule id, due date, and
   localized recurrence label.
5. Merge projected and materialised schedules, sort by date, and keep projections
   outside the booked table, selection, totals, and pagination. The date gets a
   repeat icon; the menu contains only Mark as paid and Open in Cash Flow. Clicking
   the row replaces that projection with the shared inline editor, prefilled from
   the rule, including its exact recurrence and category.
6. Give the inline editor explicit create and planned-rule modes. Create mode can
   call transaction or planned-item creation; planned-rule mode can call only
   `updatePlannedExpense`, and omitting, setting, or clearing `categoryId` has
   distinct mutation semantics. Cash Flow uses the same category picker in its
   planned-item edit dialog.

## Decisions and reasons

- **One occurrence per rule.** Cash Flow owns the full horizon. Expanding a weekly
  rule in the register would bury real account activity under repeated previews.
- **No synthetic server identity.** A projection is not accepted by transaction
  mutations. Mark as paid uses the existing occurrence mutation with the stored
  rule id and due date.
- **Real schedules remain materialised.** Existing `SCHD` rows keep reconciliation
  and every other transaction behavior; the projection branch is additive.
- **Paid means advance, not hide the rule.** Recurring series stay active after one
  occurrence is completed, so the query returns the next unpaid date.
- **The projected row edits the rule.** Saving may move or remove the visible
  occurrence because the row is derived again from the updated anchor and Repeat
  value. The editor says this before saving; cancel simply restores the projection.
- **Payee and description follow creation's storage mapping.** Ledger Description
  remains the rule `name`, and ledger Payee remains the rule `description`, so an
  unchanged edit round-trips both fields instead of swapping them.

## Current Verification Evidence

- `npm run lint`: clean.
- `npx vitest run convex/planning-cashflow.test.ts`: 65 tests passed, including
  weekly next-date, account scope, paid-occurrence advancement, and category
  set/clear/omitted coverage.
- `npx vitest run`: 866 tests passed. The only failures were the two known
  pre-existing cases: aggregated instalment debit in
  `plan-installments` and stored event markers in `forecast-projection`.
