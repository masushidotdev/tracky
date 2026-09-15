# 0008: Money boxes are virtual accounts, not manual bank accounts

Status: accepted

Revision note, 2026-07-29: an eligible money box can now be linked to one
ordinary Plan bucket as a current, non-carrying pre-funded reserve. This does
not turn the money box into liquidity or a financial account; it only prevents
the bucket target from requesting savings already recorded there. See
`docs/decisions/0010-plan-double-counting-invariants.md`.

## Decision

Keep `moneyBoxes` as a dedicated planning entity. Present active money boxes in
the Accounts area as **virtual accounts**, but do not create matching
`financialAccounts` records while their money remains inside a host account's
reported balance.

A booked outgoing transfer can be associated with a money box through a
transaction-backed `moneyBoxContributions` record. That record is the single
source of truth for the money-box activity, saved amount, and transfer
destination label.

## Why

A manual financial account represents a real balance with its own movements.
Tracky's current money box represents an allocation target over cash that is
still held by a bank account. Treating both as the same record would count the
same cash twice, distort dashboard totals and cashflow projections, and require
synthetic counterpart transactions for every contribution.

Products such as Example Bank can model pockets as accounts because the provider
owns the underlying ledger and exposes real pocket balances. Tracky cannot
assume that behavior for every banking provider. The provider boundary may add
a real pocket/account mapping later when an API exposes one explicitly.

## Consequences

- Money boxes appear next to accounts with a clear virtual/planning label.
- Their saved amount is excluded from bank balance totals.
- A transaction-backed contribution may be moved to another money box without
  duplicating the contribution or changing the bank transaction.
- Contribution history remains available when a money box is archived.
- Converting an eligible box destroys it rather than archiving it. Manual
  contribution rows therefore disappear with the box; transaction-backed
  activity survives as the original bank transactions, paired with new manual
  counterpart legs.
- If a provider later exposes pockets as first-class accounts, an explicit
  provider mapping can link those accounts to money boxes without changing the
  generic planning model.

## Known limitation: the held-in-the-account assumption does not always hold

Observed on a live provider account during development. This model assumes a money box
is an allocation over cash **still counted by the account balance**, which is
why its saved amount is excluded from balance totals: counting both would
double count.

Provider pockets break that assumption. The provider reports the account balance
**net of** the pockets — the app showed €7.26 for the main balance while three
pockets held €168.62, and Enable Banking delivered €7.26 — and it does not
expose the pockets as accounts. So a money box mirroring a Pocket represents
money that is outside every balance Tracky can see.

The consequence is not double counting but the opposite: the Plan reads
liquidity from provider balances, so pocket money is invisible to Ready to
Assign and moving money into a Pocket looks like it left the plan perimeter.
A linked money box may pre-fund one bucket's target, but that reserve does not
become assignable cash.

`heldOutsideBalance` distinguishes the two cases:

- a money box without `heldOutsideBalance: true` is a **reminder** over cash
  already inside the host balance. It must stay virtual and cannot be converted
  to a second financial account, because that would count the same cash twice;
- a money box with `heldOutsideBalance: true` mirrors **physically separated**
  cash outside every reported balance. The Plan adds it back to liquidity while
  the box exists.

## Legitimate conversion

A box explicitly marked `heldOutsideBalance: true` may be converted to a real
manual current or savings account. Transaction-backed contributions first stop
being money-box links and become paired transfers between the original account
and the new account. Withdrawals face the opposite direction. Any remaining
saved amount, representing history entered without a bank transaction, becomes
the new account's opening balance; it is not debited from the host account,
because that cash already left the provider-reported balance.

What conversion cannot carry across is the Plan pre-funding. A box linked to a
plan bucket covers that bucket without an assignment: `prefundedByBucketId`
reads its `savedAmount`, and the bucket reads as funded. That link belongs to
the box, so destroying the box removes it and the bucket reads as short again -
the money is in a real account, but the Plan no longer treats it as set aside.
The remedy is a new box on the converted account, contributed and linked to the
same bucket, with `heldOutsideBalance` left false: the cash now sits inside a
balance the Plan already counts, and the pre-funding does not depend on that
flag.

The conversion then clears every optional money-box reference, deletes all
remaining contribution rows, and destroys the box. Before the liquidity
adjustment disappears, the new account passes through the Plan account-selection
validation and joins each same-currency Plan that already contained the box's
host account. Plans outside that perimeter remain unchanged, and affected Plan
snapshots are invalidated. The real account therefore replaces the adjustment
without changing total Plan liquidity. The box is not archived: manual
contribution history is intentionally lost, while the original bank transactions
survive as real transfer legs.
