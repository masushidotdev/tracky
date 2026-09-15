# Enable Banking transaction mapping audit

Status: implemented.

## Goal

Capture the real transaction shapes returned for every linked account, make the
provider-to-domain mapping explicit, and populate transaction counterparties
consistently without leaking raw financial data into source control.

## Assumptions

- Enable Banking remains isolated behind the existing provider boundary.
- Raw diagnostic responses are sensitive and stay under the Git-ignored
  `diagnostics/enable-banking/` directory with owner-only file permissions.
- A versioned report may describe response shapes and field coverage, but must
  not contain account identifiers, transaction identifiers, names, amounts, or
  remittance text copied from live data.
- Both active and paused Enable Banking accounts are useful for the mapping
  audit. The diagnostic fetch must not change account sync state.

## Phases

1. Capture account details, balances, and all paginated `BOOK` and `PDNG`
   transaction responses for every linked provider account.
2. Inventory field shapes and coverage by institution, direction, status, and
   bank transaction code; isolate one telecom-invoice example.
3. Define and test deterministic description/counterparty mapping precedence,
   including structured-party fields and conservative remittance fallbacks.
4. Run a complete import sync for every enabled account, verify the persisted
   transaction, and record validation evidence.

## Current Verification Evidence

- Raw capture created for six Enable Banking accounts across three example institutions, including paused accounts, balances, booked
  transactions, pending transactions, pagination, and provider errors.
- Mapping audit recorded in `docs/enable-banking-transaction-shapes.md`.
- Targeted import tests cover structured parties, multiline transfers,
  labeled remittance, narrative transfers/direct debits/card payments,
  conservative null behavior, and stored-data backfill.
- Joint and personal example imports succeeded after deployment. Two institutions
  reached ASPSP daily rate limits and retain scheduled backoff.
- Stored-data backfill updated the missing-counterparty rows without touching
  sync status.
- The telecom-invoice transaction was queried after import and has
  `counterpartyName = Acme Telecom` while preserving its null provider
  transaction ID and non-null provider entry reference.
