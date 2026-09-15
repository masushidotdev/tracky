# Accounts Connect-Bank Sheet

Status: implemented.

## Assumptions

- Connecting a bank is an occasional action and should not load Enable Banking data until requested.
- Import history is secondary to account management and can load on first expansion.

## Phases

1. Move the connect-bank form into a large on-demand detail sheet from the accounts page header.
2. Keep provider connection status first, account and connection management next, and credit facilities directly after.
3. Place import history last in a closed collapsible section with its query skipped until first open.

## Current Verification Evidence

- `pnpm lint` passed with zero warnings.
- `pnpm test` passed: 20 files and 138 tests.
- `pnpm build` passed with existing Vite notices about `vite-tsconfig-paths`, unresolved Geist font URLs, and a large client chunk.
