# 0011: Scheduled transactions are materialised

Status: accepted.

## Decision

A one-off future movement is a real `transactions` row with `status: "SCHD"`.
It is not a projection assembled only at read time. On a manual account the row
moves to `BOOK` when its date arrives; the daily promotion mutation applies the
balance delta exactly once at that transition.

A linked account accepts a manual transaction only as `SCHD`, never as `BOOK`.
Its booked balance and movements belong to the bank. The scheduled row waits for
the imported transaction and does not change the provider balance.

Reconciliation keeps the imported booked row, carries the user's category,
classification, memo, and tags where the imported row has none, and deletes the
scheduled row. The provider row survives because a later sync would re-upsert it;
keeping both rows would leave a permanent double-counting hazard.

## Why

Materialisation gives a one-off schedule one row identity for display, editing,
filtering, and reconciliation. Materialising every occurrence of a recurring rule
would instead duplicate the planning schedule and flood an account register, so
the ledger projects only that rule's next unpaid occurrence. The projection uses
the same column geometry but has an explicit client discriminator, no selectable
transaction identity, and only occurrence-aware actions.

This is safe only when consumers distinguish intent from fact. Balance-facing
Plan liquidity, dashboards, and Safe to spend are anchored to
`accountBalances`, and Plan activity already requires booked transactions, so a
scheduled row does not move cash or activity before promotion.

The implementation found three consumers that did not filter status and had to
be closed in the same change:

- Reports and `reportsCore`;
- `getSpendingByCategory`;
- instalment-repayment linking through `isRepaymentLinkableTransaction`.

Every future transaction consumer must check those three leak classes: reporting
aggregation, category spending aggregation, and repayment or settlement linking.
Transfer candidate generation and subscription detection also exclude `SCHD`:
the former could assert that money moved, while the latter could fabricate a
cadence occurrence.

## Consequences

- The ledger renders materialised one-off schedules and the next unpaid
  occurrence of each recurring planning rule in the same band, sorted by date.
  Projected occurrences are client-only, cannot be selected or counted, and can
  only be marked paid by rule id and due date or opened in Cash Flow.
- One-off scheduled rows keep their full transaction behavior, including
  reconciliation, editing, filtering, and promotion when due. The default ledger
  lifts them into the scheduled band, but an explicit `SCHD` status filter also
  keeps them in the paginated table result.
- One-off scheduled rows can feed Cash Flow and Safe to spend as explicit future
  commitments without affecting current balances.
- Manual-account promotion must remain idempotent and must apply the skipped
  balance delta when, and only when, status changes to `BOOK`.
- Queries over `transactions` must choose deliberately whether `SCHD` is part of
  their domain instead of assuming every stored row is booked money.
