# Account Management And Hidden Accounts

Status: implemented.

## Assumptions

- Hiding is a user preference independent of provider account status and sync.
- Hidden accounts retain imported history and remain available for management.
- Balance totals, overdraft availability, account selection, balance history,
  and planning projections exclude hidden accounts without currency conversion.

## Phases

1. Add the optional `financialAccounts.hidden` flag and authenticated,
   ownership-checked hide and alias mutations.
2. Exclude hidden accounts after bounded indexed reads in dashboard, overdraft,
   planning, account-list, and aggregate balance-history paths.
3. Consolidate sync status, balances, visibility, and inline alias controls
   into the accounts panel beside provider connections.
4. Localize the new account-management copy in English and Italian.
5. Cover hide/show aggregate behavior, overdraft exclusion, alias normalization,
   and the differing account-list/sync-overview visibility rules.

## Current Verification Evidence

- `pnpm lint` passed with zero warnings.
- `pnpm test` passed: 20 files and 138 tests.
- `pnpm build` passed with existing Vite notices about `vite-tsconfig-paths`,
  unresolved Geist font URLs, and a large client chunk.
