# 0012: One table owns planned movements

Status: accepted.

## Decision

`plannedTransactions` replaces `plannedExpenses` and `plannedTransfers` as the
stored model for movements the user expects.

The old expense table already carried a direction and therefore stored income as
well as expenses. Both tables described the same domain fact: an amount expected
on a date, optionally recurring, associated with accounts, categories,
subscriptions, money boxes, or later reconciliation.

`kind` states the financial meaning of the movement using the transaction
vocabulary: `expense`, `income`, `transfer`, or `internal`. `dueDate` absorbs the
old transfer `scheduledDate`. A transfer's old `completed` state maps to `paid`,
so the merged model does not introduce a second completion status.

The public Convex API deliberately keeps the old operation names and response
shapes. A planned transfer is still created with `scheduledDate` and is still
returned as `completed`; the backend reshapes those values at its boundary. The
frontend therefore did not move with the storage migration.

## Why

Keeping two tables made readers, reconciliation, notifications, exports, and
foreign keys branch on storage history rather than domain behavior. It also made
`plannedExpenses` a misleading name for income already stored there.

Compatibility belongs at the public boundary, not in duplicate persistence.
Retaining the existing API allowed the storage cutover to remain a backend
migration while removing the chance that old and new tables drift during a
frontend rewrite.

## Consequences

- New backend consumers read and write `plannedTransactions` and branch on
  `kind`, not on a table name.
- Legacy field names such as `plannedExpenseId` may remain in public or export
  shapes, but their IDs refer to `plannedTransactions`.
- `note` stores the user's memo separately from `description`; create writes it
  with the rule, update distinguishes set, clear, and omitted, and projections
  carry it into Cash Flow and ledger occurrence rows.
- Schema changes follow widen, backfill, cut over readers and writers together,
  move foreign keys, then narrow. Convex does not enforce references, so orphaned
  rows must be counted and handled explicitly during each backfill.
- `plannedExpenses`, `plannedTransfers`, and migration-only provenance columns
  are removed once no reader, writer, or foreign key depends on them.
