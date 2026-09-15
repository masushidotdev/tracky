# Enable Banking transaction response shapes

Reference for the Enable Banking transaction payload shapes Tracky maps and the
counterparty/description precedence. Examples below are synthetic and use
`Example Bank` / `Acme` names; they illustrate shapes, not real accounts.

Raw payload captures, when a developer collects them, are stored locally under
`diagnostics/enable-banking/` and are excluded from Git because they contain
financial and personal data. Each run contains a `manifest.json`; every
response file records the request path and query, HTTP status, and unmodified
JSON payload. Files are created with `0600` permissions.

## Coverage

- Multiple Enable Banking accounts across example institutions, including
  paused accounts.
- Account balances and paginated `BOOK` and `PDNG` transaction requests.
- All booked transactions carry `entry_reference` and at least one
  `remittance_information` line in the observed shapes.
- None carry `transaction_id` or `merchant_category_code` in the observed
  shapes; most carry a `bank_transaction_code`; some carry multiline remittance
  information.
- Creditor/debtor account values observed in responses are objects or `null`,
  not strings. Optional fields such as agents, exchange rates, additional
  identification, and balance-after-transaction require tolerant shapes.

The Enable Banking reference defines `credit_debit_indicator`, party fields,
remittance information, transaction status, and continuation-key pagination:

- <https://enablebanking.com/docs/api/reference/>
- <https://enablebanking.com/accounts-api/>

## Observed mapping cases

1. Structured party fields
   - Debit: `creditor.name`, then `ultimate_creditor.name`.
   - Credit: `debtor.name`, then `ultimate_debtor.name`.
   - The opposite party is not used as a counterparty fallback because it is
     commonly the account owner.
2. Labeled remittance
   - Direct debit names occur between provider-specific labels (for example
     between `NOME:` and `MANDATO:` on one observed institution).
   - Incoming transfer senders occur after a sender label (for example
     `MITT.:` on one observed institution).
3. Narrative formats
   - One observed institution encodes incoming/outgoing transfer parties in
     `DA … PER` / `A … PER` narratives.
   - Direct debits encode the party between the creditor id and the mandate
     reference.
   - Card rows place the merchant descriptor after the currency and amount.
4. Multiline transfers
   - When both structured parties are null and the bank transaction code is
     `TRANSFER`, the final non-empty remittance line is the party name.
   - The synthetic telecom example uses this shape: the first line is the
     invoice description and the second line is the beneficiary
     (`Acme Telecom invoice INV-2026-0601` / `Acme Telecom`).
5. No trustworthy party
   - Bank fees, account-plan charges, statement settlements, loan repayments,
     and generic ATM notes remain without a counterparty unless a structured or
     recognized narrative party is present.

## Persistence precedence

`counterpartyName` follows this precedence:

1. direction-correct structured party;
2. direction-correct ultimate party;
3. explicit labeled remittance party;
4. recognized narrative party;
5. final line of a multiline `TRANSFER` remittance;
6. absent when none of the above is trustworthy.

Description selection remains independent: structured direction-correct party,
then the complete joined remittance, then the opposite structured party, then
the entry reference.

## Operational findings

- Balance requests succeed per linked account.
- One observed institution rejects transaction periods outside its allowed
  window. The dump tool starts from `lastBookedDate` and clamps an initial
  capture to the latest 90 days.
- Institutions may enforce daily ASPSP rate limits during import runs. The
  application sync states retain the normal six-hour retry backoff.
- A bounded database backfill populates missing counterparties without
  changing provider sync state.
- The synthetic joint-account example verifies in Convex with
  `counterpartyName` populated as `Acme Telecom`, `status = BOOK`, and the
  provider entry reference retained. The provider's `transaction_id` is truly
  null, so it remains null in the database.
