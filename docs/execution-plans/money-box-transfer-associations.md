# Money Box Transfer Associations

Status: Complete

## Goal

Let users associate an unmatched transfer with an existing money box, show the
money-box name on the appropriate side of the transfer, surface money boxes in
the Accounts area, and provide a contribution/activity history for each money
box.

## Assumptions and invariants

- Money remains integer minor units plus an ISO currency code.
- Only owned, unmatched transfer transactions can be associated.
- Outgoing (DBIT) associations are positive deposits; incoming (CRDT)
  associations are negative withdrawals and cannot reduce saved funds below
  zero.
- Transaction and money-box currencies must match.
- At most one contribution may reference a transaction.
- Reassociating a transaction moves the existing contribution and adjusts both
  money-box saved amounts atomically.
- Money boxes remain virtual planning accounts and never enter bank balance
  totals or projected cash balances.
- Existing `moneyBoxContributions` data remains valid; no backfill is required.

## Design direction

Preserve Tracky's neutral semantic palette and Geist typography. Use the
existing account-row density and money-box progress language. The distinguishing
element is a compact ledger trail: every contribution shows date, source,
transaction description, account, and signed amount in one scannable row.

## Implementation phases

1. Add authenticated association/reassociation behavior and enrich unmatched
   transfer presentation with the linked money-box destination.
2. Enrich bounded money-box contribution history with transaction/account
   context.
3. Add the transaction association dialog and activity sheet.
4. Show active money boxes as virtual accounts in Accounts without merging them
   into `financialAccounts`.
5. Add regression tests, lint, test, build, and record verification evidence.
6. Extend association to CRDT withdrawals, including prospective target-balance
   validation and reassociation coverage.

## Current Verification Evidence

- `npx vitest run planning-cashflow`: 1 file and 55 tests passed, including
  signed CRDT withdrawal, insufficient-funds, and reassociation coverage.
- `npx vitest run`: 64 files and 411 tests passed.
- `npx tsc --noEmit`: completed successfully with no diagnostics.
