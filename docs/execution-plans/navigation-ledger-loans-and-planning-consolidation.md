# Navigation, ledger, loans, and planning consolidation

Status: implemented.

## Scope

This work reshaped the application shell and transaction ledger, introduced
loans as first-class credit facilities, materialised scheduled transactions,
consolidated planned-movement storage, and allowed eligible money boxes to become
real accounts. The phases below follow the order in which the commits landed.

## Phases

1. **Restructure navigation and add account routes.** Replace the flat sidebar
   with primary destinations, a Tools group, footer actions, and collapsible
   Cash, Credit, and Loans account groups. Add `/app/accounts/$accountId` as a
   scoped ledger route and keep account-group totals currency-safe.
2. **Rebuild the ledger presentation.** Split the signed amount into Outflow and
   Inflow, give Payee and Memo their own columns, show transfer direction, add
   fixed-layout resizing, and persist widths separately for All Accounts and an
   account detail page.
3. **Introduce the loan domain and UI.** Reuse `creditFacilities` with mortgage,
   auto-loan, and personal-loan `facilityType` values, attach an amortisation
   plan and settlement account, add loan creation and detail routes, and split
   unrelated account administration into Settings pages.
4. **Move sorting and filtering to the whole ledger.** Replace client-side page
   sorting and seven filter controls with one interactive field backed by a
   bounded 5,000-row server scan. Persist clauses, sort, and direction in the
   URL, and report when the scan cap is reached.
5. **Close loan lifecycle gaps.** Add reversible conversion from an instalment
   contract, plain Cash accounts, balloon payments, close and delete behavior,
   complete reference cleanup, one debt source for every surface, original
   principal, and loan-specific facility cards.
6. **Materialise scheduled transactions.** Store future one-off movements as
   `SCHD` transaction rows, exclude them from booked consumers, promote due rows
   on manual accounts, and reconcile linked-account schedules against imported
   rows. Render the schedule as a band inside the ledger and replace creation by
   dialog with an inline row sharing the same table geometry.
7. **Repair bank-sync completeness.** Re-read a seven-day window so transactions
   booked late still arrive, prevent future-dated rows from moving the cursor
   past today, retry failed sync states, and add an operational cursor rewind.
8. **Reconcile loans with the Plan and finish ledger actions.** Let a paired loan
   adopt the user's Plan category, fix side-panel scrolling, start projections
   from the next future instalment, accept a contractual payoff date, and move
   multi-row actions into a floating selection bar.
9. **Bring schedules into planning and merge stored planned movements.** Project
   one-off `SCHD` rows in Cash Flow and Safe to spend. Add
   `plannedTransactions`, backfill both legacy tables, widen and move foreign
   keys, cut every reader and writer over together, then remove provenance,
   `plannedExpenses`, and `plannedTransfers` in deploy-safe narrowing steps.
10. **Convert eligible money boxes and close auth gaps.** Turn a
    `heldOutsideBalance` box into a manual account, preserve transaction-backed
    activity as transfers, convert unexplained saved value into opening balance,
    clear all referrers before deleting the box, expose the action in Goals, and
    make Goals and Plan wait for authentication before querying.

## Inconsistencies and bugs found while building

### Late bank bookings were outside the sync window

The sync cursor used the newest booking date already seen. One provider can deliver a
card payment one to three days late while retaining its earlier booking date, so
once the cursor moved forward that row could never be requested. Thirteen
transactions across two accounts were missing over ninety days. A seven-day
lookback is safe because provider entry references make repeated imports
idempotent.

A future-dated provider row exposed a related failure: it advanced the cursor
past today, produced an inverted provider range and a 422 response, then remained
in an error state because the dispatcher did not retry errors. The cursor is now
clamped and failed states use backoff.

### Loan projections replayed stale instalments

The payoff curve started from stored `nextPaymentDate` even when that date had
already passed. It therefore subtracted payments already reflected in the
observed balance and reached zero years early. Projection and term recomputation
now start from the next instalment still to come.

Live mortgage data also disproved the assumption that today's balance, rate, and
instalment can always reconstruct the contract. An Italian variable-rate
mortgage can keep its capital schedule fixed at origination while changing the
instalment. The rate-based estimate was years early, so an optional contractual
payoff date now overrides it.

### Pairing a loan created two funding requests

A loan's paired category was only a label. Plan reconciliation still generated a
second bucket under `Instalments`, so one payment appeared twice and asked to be
funded twice. The paired category now adopts the instalment schedule; only an
unpaired loan receives a generated row.

### Side-panel scrolling hid form fields

The whole sheet scrolled, including its footer. A form taller than the viewport
ran below its own buttons and its last fields could not be reached. Scrolling now
belongs to the sheet body while the footer remains fixed.

### Authenticated queries ran before sign-in settled

Sidebar, header, and ledger queries could throw `Unauthorized` during render and
blank the shell or replace the ledger with an error card. The same pattern
remained later in Goals and Plan. Authenticated reads now skip until the browser
has settled authentication, and sidebar account groups have their own error
boundary.

### Money-box deletion left dangling references

Convex does not enforce document references. A box deleted through an older
dashboard path left two live dangling pointers, and the conversion path had four
referrer classes to handle: contributions, Plan buckets, planned transactions,
and subscriptions. Conversion clears borrowed references and deletes owned rows
before destroying the box; a migration repaired existing dangling values.

### Scheduled intent leaked into booked consumers

Materialising `SCHD` made status filtering mandatory. Reports,
`getSpendingByCategory`, and instalment-repayment linking had no suitable guard
and would have treated a plan as money already moved. Transfer candidate and
subscription detection needed the same exclusion to avoid asserting a movement
or fabricating a cadence occurrence.

### Ledger sort keys did not always match displayed values

Matched transfers displayed the earlier date of two legs but sorted on one
surviving leg, and the Payee column displayed a transfer account label while
sorting on the bank counterparty. Both sorts now use the values the row presents.
A bare day number also failed in month-first locales because it was parsed as an
invalid month; it now falls back to that day in the current month.

### Loan lifecycle and display had divergent sources

The sidebar, loan page, facility card, and net worth could show different debt
figures because some read `usedAmount` and others read the amortisation plan. A
loan also appeared as available credit and its amortisation plan appeared again
in the generic instalment list. Loan surfaces now read one outstanding-principal
source and use debt vocabulary rather than spending-capacity vocabulary.

Closing initially removed the only route to Delete, and deletion initially
missed a forecast assumption whose facility reference was nested in a
discriminated union. Delete moved to Settings > Credit, and the cascade was
re-audited by planting every reference class in a regression test.

### The planning migration exposed unenforced orphans

Live data contained occurrence payments whose legacy planned expense had been
deleted outside the app. Backfills therefore count and skip orphans rather than
assuming references exist. Convex validates stored documents against the active
schema, so foreign-key and provenance removal was staged as clear-then-drop
steps across deploys.

## Current Verification Evidence

### Browser and live-data checks recorded by the commits

- Early-auth failures were reproduced in the browser from sidebar accounts,
  notifications, and transaction queries before the shared authenticated-query
  hook was applied.
- The loan flow was exercised by creating an example mortgage at EUR 141,911.12,
  3.7%, and EUR 680 from its settlement account. The initial projection read
  August 2054 and 336 months, matching the closed-form calculation; later contract
  evidence is what required the explicit payoff date.
- Sidebar connection marks were checked against example accounts: Acme Savings
  and Acme Flex were the two manual-provider rows and therefore the only
  rows without the connected mark.
- Loan presentation was checked on example data: the auto loan left the
  generic instalment list while the ordinary phone instalment contract
  remained.
- The closed-loan deletion path was checked by deleting the test mortgage from
  Settings > Credit after the detail route had become unreachable.
- The unified filter behavior was exercised with the reference-product inputs
  `Res`, `Eat`, `24`, and `26/`; the single-field chrome was rechecked with
  `Res` after its wrapper fix.
- The sync rewind recovered all thirteen late-booked transactions identified
  by the ninety-day audit.
- Money-box conversion work inspected example data and found two dangling references
  left by the earlier deletion path.

### Browser checks against live data during the final session

These were run against the developer deployment with example data, and
are recorded here because the commits do not carry them.

- Original principal on the example mortgage: with EUR 155,260.00 entered, the page
  read Repaid EUR 13,666.70 and 8.8% of the original principal, which is the
  contract's outstanding subtracted from its financed amount to the cent. A value
  below the current balance was refused inline and nothing was stored.
- Contractual payoff date on the same mortgage: with 2052-11-01 entered, the
  payoff stat and the end of the curve moved to that date and January 2027 read
  EUR 140,105.64, consistent with five capital instalments of roughly EUR 295.
  Cleared, the estimate returned to March 2051.
- Plan adoption: after pairing, the generated loan row disappeared from
  Instalments and the user's Mortgage row under Home and bills carried the
  instalment due date. Underfunded fell from EUR 2,472.41 to EUR 1,792.41,
  exactly the EUR 680 that had been requested twice. The row's activity of
  -EUR 688.42 kept coming from its own category mappings.
- Bulk action bar: two rows selected, the bar floated over the ledger centred on
  the content and not the window, More opened upward with Unlink transfer,
  Unlink money box and Delete disabled for that selection, Escape closed the menu
  without discarding the selection. Hide from reports was applied to both rows
  and reverted.
- Scheduled row in Cash Flow: a EUR 1.00 outflow dated three weeks ahead appeared
  in the projection with the Scheduled badge in date order and inside the
  projected closing balance, then was deleted.
- Planning cutover: Cash Flow, Safe to spend and the dashboard reported the same
  figures before and after the switch to `plannedTransactions`, and again after
  the old tables were dropped. Re-running the backfill after the deploy caught
  one occurrence payment created in the meantime, which is the reason for running
  it after and not only before.
- Money-box conversion: the action is enabled on the one box marked as held
  outside the balance and disabled on the others, with the reason printed under
  the entry rather than hidden in a tooltip. No conversion was executed, because
  it cannot be undone.
- Sign-in race: Goals and Plan open on their content at first load, with no
  Unauthorized error in the console.

### Automated evidence recorded by the commits

- Loan projection, loan CRUD, conversion, cascade, Plan adoption, and Cash Flow
  routing are covered by `convex/loan-payoff.test.ts`, `convex/loans.test.ts`,
  `convex/plan-installments.test.ts`, and `convex/planning-cashflow.test.ts`.
- Scheduled status, promotion, reconciliation, reporting exclusion, and repayment
  exclusion are covered by `convex/scheduled-transactions.test.ts`,
  `convex/reports.test.ts`, and `convex/credit-repayment.test.ts`.
- Whole-ledger pagination, sorting, and filter parsing are covered by
  `convex/transactions-offset-page.test.ts` and the transaction filter tests.
- Late-booking recovery and retry state are covered by the banking import,
  cadence, and sync-window tests documented in
  `execution-plans/enable-banking-sync-reliability.md`.
- The planned-table migration had dedicated backfill and foreign-key tests for
  each widening and narrowing step; the final cleanup retains orphan handling in
  `convex/legacy-planning-cleanup.test.ts`.
- Money-box conversion and reference cleanup are covered by
  `convex/money-box-conversion.test.ts`.
- Documentation verification for this record uses
  `npx vitest run convex/knowledge-base.test.ts` and `npm run lint`.
