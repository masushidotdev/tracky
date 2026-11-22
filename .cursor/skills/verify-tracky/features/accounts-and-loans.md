# Accounts & Loans Creation

## Sub-features

- Sidebar `Add Account` dialog (`ManualAccountDialog` in `src/components/banking/accounts/manual-account-dialog.tsx`):
  - Step 1 type picker: Cash (`CASH`), Checking (`CACC`), Savings (`SVGS`), Credit Card (`CARD`), Mortgage (`mortgage`), Auto Loan (`autoLoan`), Personal Loan (`personalLoan`).
  - Step 2 form submission creating a manual account (`createManualAccount`) or loan facility (`createLoanAccount`).
- Accounts management list (`/app/settings/accounts`) and loan detail page (`/app/loans/$facilityId`).

## How to get to it (user POV)

1. Sign in to `/app`.
2. Click `Add Account` in the left sidebar (`AppSidebar`).
3. Choose an account type (for example `Checking` or `Mortgage`), fill the required fields, and click Save.
4. Observe the new account appear under `Cash`, `Credit`, or `Loans` in the sidebar and on `/app/settings/accounts`.

## Driving it with Playwright / curl

Requires `npm run dev` on `http://localhost:3000` with authenticated session (`/tmp/tracky-auth-state.json`).

1. Open `http://localhost:3000/app`.
2. Click `button:has-text("Add Account")` (or localized `t('accounts.addAccount')`).
3. **Manual cash/checking flow:**
   - Click the type option button containing `Checking` (or `Cash` / `Savings`).
   - Fill account name, 3-letter currency (`EUR`), optional alias, and submit.
   - Verify toast confirmation and new entry in sidebar `NavAccounts` and `/app/settings/accounts`.
4. **Loan flow (covers PR #50 behavior once merged):**
   - Requires at least one active cash/checking account to exist first (for `settlementAccountId`).
   - Click `Add Account` -> choose `Mortgage`.
   - Test empty Save -> verify validation feedback, missing-field count, and `Go to field` focus/scroll behavior with sticky dialog footer.
   - Fill name, balance, annual rate, minimum payment, settlement account, first payment date -> submit -> verify redirect/listing under `Loans` (`/app/loans/$facilityId`).

## Gotchas

- Creating a loan requires an existing cash/checking account for the settlement account selector; create a manual checking account first on an empty dev account.
- Backend mutations require an authenticated Convex identity derived from WorkOS; cannot be exercised without Convex + WorkOS dev credentials.
