# Plan activity begins at an effective date

Status: implemented and verified.

## Decision

`plans.startPeriod` remains the earliest navigable month. The optional
`plans.startDate` is the effective origin inside that month.

Transactions with `bookingDate < startDate` do not contribute to category
activity, card or cash overspending, income, internal movement, transfer rows,
or drill-down lists. A missing `startDate` keeps the existing full-month
behavior.

The signed cash movement before the origin is exposed as
`beforePlanStartMinor` in the Ready to Assign breakdown. It is derived from the
same non-card, in-plan EUR movement used to reconstruct liquidity. This keeps
`unexplainedMinor` reserved for genuinely unexplained reconciliation differences
while preserving the balance anchor.

## Restart semantics

“Restart from here” sets both origins to today/current month, deletes only the
plan’s snapshots, and schedules their targeted reconstruction. It does not
delete or rewrite plan structure, targets, or assignments.

## Compatibility

New plans write today’s ISO date. The backfill writes the first day of
`startPeriod`, which is numerically equivalent to the previous calendar-month
model. Until the backfill is complete, reads treat an absent `startDate` as the
legacy behavior.
