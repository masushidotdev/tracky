# CSV Import Wizard

## Sub-features

- 4-step client-parsed CSV import wizard at `/app/import` (`src/components/banking/import/csv-import-wizard.tsx`):
  1. `UploadStep`: parses CSV locally in the browser (`#csvFile` input accepting `.csv,text/csv`).
  2. `ColumnMappingStep`: selects destination manual account, optional category, signed vs split debit/credit mode, date/description/amount columns, and date format.
  3. `PreviewStep`: displays row-by-row `valid` / `duplicate` / `error` badges and counts before any server write.
  4. `ImportProgressStep`: batches valid rows via `importManualTransactionsBatch` (`BATCH_SIZE = 100`) with deduplication.

## How to get to it (user POV)

1. Ensure at least one manual account exists (see `accounts-and-loans.md`).
2. Navigate to `/app/import` (or via Accounts / import link).
3. Upload a `.csv` file -> map columns -> inspect preview -> click Import -> view imported transactions in `/app/transactions`.

## Driving it with Playwright / curl

Requires `npm run dev` on `http://localhost:3000` with authenticated session and at least one manual account.

1. Generate a temporary synthetic CSV in `/tmp/tracky-sample.csv`:
   ```csv
   Date,Description,Amount
   2026-11-01,Test Coffee,-4.50
   2026-11-02,Salary,2500.00
   ```
2. Navigate to `http://localhost:3000/app/import`.
3. Attach file to `input#csvFile` (`page.locator('#csvFile').setInputFiles('/tmp/tracky-sample.csv')`).
4. Verify alert shows `tracky-sample.csv`, click `Continue` (`t('import.continue')`).
5. On mapping step, confirm manual account is selected and `Date` / `Description` / `Amount` are auto-guessed; click Continue.
6. On preview step, assert `2` valid rows badge and `0` errors; click Import button.
7. Wait for completion summary (`imported: 2`), then navigate to `/app/transactions` and verify `Test Coffee` and `Salary` appear.
8. Re-upload the same CSV to verify deduplication marks both rows as `duplicate` (`validCount === 0` disables Import button).

## Gotchas

- If the user has zero `provider === 'manual'` accounts, `CsvImportWizard` blocks mapping with an empty state prompting to create a manual account first (`ManualAccountDialog`).
- Bank-synced accounts are excluded from CSV import targets (`account.provider === 'manual'` filter in `CsvImportWizard`).
