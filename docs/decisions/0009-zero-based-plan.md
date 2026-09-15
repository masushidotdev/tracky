# 0009: Use a zero-based Plan over global transaction categories

Status: accepted

Revision note, 2026-07-29: the original implementation included negative CARD
balances in Plan liquidity and shipped without card-payment buckets. That part
of the decision was revised after real-world reconciliation exposed
double-counting paths. CARD accounts are now outside liquidity and have
payment buckets; signed cash balances, including arranged overdrafts, remain
inside. See `docs/decisions/0010-plan-double-counting-invariants.md`. The
zero-based model, global-category partition, and observed-balance anchor remain
unchanged.

## Decision

Replace monthly spending caps with a zero-based Plan. Each plan is single-currency,
selects the cash accounts that define its liquidity and the CARD accounts whose
activity and repayments it tracks, and exposes Ready to Assign plus monthly
Assigned, Activity, and Available values.

Keep transaction categories global. A `planBuckets` row is the user-facing Plan
category and maps one or more global `categories` rows through
`planBucketCategories`. Within one plan, a global category can belong to at most
one bucket. Code that resolves or moves a category reads the complete
`by_planId_and_categoryId` index range with `.unique()`, enforcing the partition
invariant and preventing Activity from being counted twice. Categories without a
normal mapping remain visible through the system Unplanned bucket.

Anchor Plan liquidity to observed account balances, not reconstructed opening
balances. Cash accounts contribute their signed preferred balance, including a
negative balance inside an arranged overdraft. CARD accounts do not contribute
to liquidity: purchases, cash advances, debt coverage, and statement payments
are reconciled through explicit breakdown terms and payment buckets. A card
limit never becomes assignable cash. No foreign-exchange conversion is
performed.

Materialize closed months in `planMonthSnapshots`, but keep a two-month stability
window live. Snapshots inside that window are ignored and removed; older writes
invalidate snapshots from the affected month forward. This lets late-arriving
bank transactions change recent months immediately without requiring an
unbounded replay from the plan start on every read.

Remove the legacy `budgets` table, its queries and mutations, the Budget route,
and `categories.parentCategoryId`. The completed migration converted eligible
legacy category budgets into Plan assignments before this removal. No alias,
shim, or deprecated read model remains.

## Why

A monthly spending cap cannot answer how much observed cash is still unassigned,
carry positive availability across months, move money between categories, or
represent target funding. A zero-based model keeps the accounting identity
between selected-account liquidity, bucket availability, and Ready to Assign.

Global categories remain the single classification attached to a transaction and
are already shared by import rules, Reports, Forecast, and the Analyst. Making
categories plan-scoped would duplicate classification and allow the same
transaction to diverge across plans. Buckets preserve per-plan grouping and
naming while the partition invariant keeps Activity exact.

Observed cash balances are the strongest available liquidity fact.
Reconstructing a starting balance from imported movements drifts when a
provider omits, delays, or duplicates transactions. Keeping CARD balances
outside liquidity prevents debt from reducing cash once as a balance and again
through its payment need. The Plan still includes card accounts to attribute
purchases and repayments without treating their provider-reported limit or
balance as cash.

The two-month live window balances correctness and bounded reads. Recent periods
are where delayed settlement and provider corrections occur most often; stable
older periods can use cached carry state and targeted invalidation.

## Consequences

- Ready to Assign and Available use integer minor units and remain currency-scoped.
- CARD balances do not enter Plan liquidity; each included card has a protected
  payment bucket for debt coverage and statement activity.
- Negative cash-account balances remain inside Plan liquidity, so overdraft
  guidance is informational rather than another payoff allocation.
- Positive Available carries forward; cash overspending reduces Ready to Assign
  instead of carrying a negative bucket balance.
- A bucket can combine global categories but cannot split one category into
  different Plan rows within the same plan.
- Hidden buckets remain part of Plan accounting; hiding is only a view choice.
- Reports resolve category groups through the active Plan's stable group and
  bucket IDs instead of category parent links.
- Recent Plan reads recompute live and may report `truncated` when bounded history
  is insufficient rather than presenting a partial total as complete.
- Data exports contain Plan source tables and exclude `planMonthSnapshots`, which
  are derived cache data.
- The old Budget model and `/app/budgets` surface are unavailable after the
  schema deployment.

## Boundary with money boxes and Goals

The Plan and money boxes both let a user set money aside for something, so the
boundary has to be stated or users run both for the same purpose and see two
different "you still owe this" numbers.

Money boxes are not redundant: they back the Goals section, the cash-flow
projection in Planning, and the safe-to-spend figure, none of which the Plan
provides. What overlaps is only the monthly accrual toward a named purpose.

The split follows the nature of the expense, not the feature:

- A **recurring bill** — service charges, insurance, road tax — returns every
  year and is part of what a month of the user's life costs, so it belongs to a
  Plan bucket with a target and must appear in Cost to Be Me. Leaving it in a
  money box makes that figure understate the true monthly cost.
- A **one-off goal** — a gift, a trip, an emergency fund — is reached and then
  spent, and is not a recurring monthly cost, so it belongs to Goals.

Running both independently for the same purpose is what to avoid: the Plan
would ask for an accrual already recorded in a money box. Since 2026-07-28, one
eligible money box can instead be linked to an ordinary bucket. Its current
saved stock pre-funds that bucket and reduces the remaining target need without
becoming an assignment or carrying into the next month a second time. See
`docs/decisions/0008-money-boxes-as-virtual-accounts.md` for why the money box
remains a virtual account rather than a second bank balance.
