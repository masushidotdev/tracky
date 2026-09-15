# 0014: Keep confirmed in-plan transfers neutral across booking months

Status: accepted

## Decision

A confirmed transfer whose outgoing and incoming cash accounts both belong to
the same Plan is one movement inside that Plan perimeter, even when the bank
books its legs in different calendar months.

Plan reconstructs historical liquidity from a normalized movement:

- the transferred principal contributes zero;
- the signed difference between the outgoing and incoming amounts is attributed
  on the outgoing booking date;
- that difference appears as Unplanned activity, because it is a real fee or
  unexplained transfer delta rather than money crossing the Plan perimeter.

Transfers with an unmatched leg, a counterpart outside the Plan, a different
currency, or a card account retain their existing treatment. Card transfers
continue through the dedicated statement-payment and card-borrowing rules.

## Why

Summing only the transfer legs booked inside one month makes a 31 July debit and
3 August credit look like two perimeter transfers. In August the incoming leg
was consequently labelled "Transfers to excluded accounts" even though both
accounts belonged to the Plan.

Loading the confirmed match is more authoritative than inferring the perimeter
from the selected month's rows. Normalizing the principal also prevents a
temporary provider booking delay from changing Ready to Assign. Preserving the
signed amount difference keeps the liquidity identity falsifiable and ensures a
bank fee does not disappear with the neutral principal.

## Consequences

- Both month summaries and their drill-down rows resolve confirmed counterparts
  outside the selected month.
- The normalized liquidity movement, bucket activity, and out-of-plan list use
  the same resolution so their totals continue to reconcile.
- A fee-bearing in-plan transfer can create Unplanned activity for the fee, with
  the outgoing transaction as its audit row.
- Regression coverage must include both months of a cash-to-cash transfer and a
  non-zero amount delta.
