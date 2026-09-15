# Decision 0004: Planned Transaction Occurrence Payments

Status: active.

Revision note, 2026-08-04: expense series now live in
`plannedTransactions`; the occurrence-payment policy is unchanged.

## Context

Recurring expense-kind planned transactions are series definitions, while
payment is an event that belongs to one concrete due date. Inferring payment
from account, date, direction, and a broad amount tolerance produced false
positives and marking a series paid incorrectly removed every future
occurrence.

## Decision

- Store payments in `plannedExpenseOccurrencePayments`, keyed logically by
  planned transaction and due date.
- Keep `plannedTransactions.status` for the lifecycle of the whole series.
- Manual expenses are never matched automatically until the user explicitly
  links a transaction and establishes a normalized merchant identity.
- Automatic matching requires the learned merchant, account, direction,
  currency, a strict amount tolerance, an owned occurrence window, and one
  unambiguous candidate.
- `latestTransactionId` remains suggestion provenance and is not payment proof.
- One-time expenses still close their parent planned transaction and money box
  when their only occurrence is paid.

## Consequences

- Paying one recurring occurrence does not remove later occurrences.
- Imported transactions cannot mark unrelated manual expenses paid merely
  because their amounts are similar.
- Payment provenance remains inspectable as manual, explicitly linked, or
  automatic.
- Existing manual expenses require no backfill and remain unpaid until the user
  establishes a link or marks an occurrence paid.
