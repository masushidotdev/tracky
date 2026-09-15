# 0010: Enforce double-counting invariants in the Plan

Status: accepted

## Decision

Treat every amount in the Ready to Assign breakdown as an independently
attributed accounting term. Income is the signed sum of booked movements
classified as income; it is never the remainder needed to make the panel add
up. After income, category activity, card borrowing, internal repayments,
perimeter transfers, pre-origin movement, assignments, reserves, and
overspending have been attributed, `unexplainedMinor` is the remaining
reconciliation difference and must be zero.

Use a strict perimeter rule: **cards are outside liquidity; arranged overdrafts
are inside it**. Cash-account balances contribute with their real sign, so a
negative current-account balance is already part of Plan liquidity. CARD
balances do not contribute to liquidity. Card purchases, cash drawn from a
card, payment reserves, and statement payments are represented explicitly
instead.

Derive a card payment bucket's default need from current card debt after
subtracting the outstanding amount already covered by active installment
plans. Apply the same invariant to facility availability: debt converted to
installments must leave the card balance once while the unpaid installment
residual continues to occupy the card limit. The card balance and installment
residual must never represent the same principal simultaneously.

Treat a linked money box as a present-day, pre-funded reserve for one ordinary
bucket. Its saved amount can increase that bucket's current availability
without becoming an assignment, so the target asks only for the remainder.
Because it is a stock observed again in every month, remove the reserve before
calculating the following month's carry. Carrying it would add the same saved
money again every month.

Keep overdraft guidance informational. It may show the current negative
balance, remaining facility, month-over-month progress, and a monthly pace
toward a selected payoff date, but it creates no bucket, assignment, or target
need and does not enter Ready to Assign.

## Why

A term calculated by difference can hide any attribution error. If a card
purchase, transfer, or repayment is missing or counted twice, a residual
"income" term absorbs the error and the displayed identity still balances.
That identity is therefore not sufficient evidence of correctness. Direct
income plus a separately visible zero-valued unexplained term makes
reconciliation falsifiable: an attribution bug breaks the section instead of
renaming itself as income.

The liquidity boundary determines whether setting money aside is meaningful.
Card debt sits outside cash: reserving cash in a card payment bucket prepares a
future settlement without changing the debt until payment. An arranged
overdraft sits inside the cash-account balance: reserving another amount to
repay it would count the debt twice. Cash left unassigned in an overdrawn
account already reduces that negative balance.

Installment conversion changes the repayment schedule, not the amount owed.
Without netting the installment outstanding from the card bucket, the Plan asks
for both the full card debt and every installment. Without the corresponding
facility rule, the card balance and installment residual consume the same
plafond twice. Both views must partition one obligation rather than layer two
representations of it.

Money-box funding has the opposite temporal risk. It legitimately supplements
a bucket without being a monthly assignment, but normal positive availability
carries forward. If the supplement were carried too, the same external reserve
would silently multiply across months even though the money box had not grown.

## Overdraft doctrine

For a temporary overdraft, follow the YNAB doctrine: borrowed facility is not
money to assign. Future income reduces the negative cash balance first, and
only the remainder becomes assignable. There is no separate payoff category
because money deliberately left unassigned already pays down the overdraft.

YNAB's negative-balance-offset setup — a synthetic account paired with a payoff
category — addresses a different case: someone who lives permanently in the
red and has no separate cash account from which to plan. Tracky does not
implement that setup by design. Supporting it would require an explicit
alternative perimeter model, not an exception to the temporary-overdraft
invariant.

## Consequences

- Tests for the breakdown must assert direct component values and
  `unexplainedMinor === 0`, not only that the final sum equals Ready to Assign.
- CARD accounts can belong to a Plan for activity, debt, and payment-bucket
  reconciliation without contributing their balance to liquidity.
- Cash and credit overspending remain separate: cash overspending has already
  left liquidity, while credit overspending becomes unfunded card debt.
- Card and installment system buckets may have user targets, but their derived
  fallback needs remain mutually exclusive for the same debt.
- Overdraft progress and payoff pace never create assignments or reduce
  assignable money a second time.
- A linked money-box reserve covers a target only while it is eligible and is
  never carried as though it were a prior-month assignment.
