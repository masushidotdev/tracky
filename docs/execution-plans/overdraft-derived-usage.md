# Derived overdraft usage

Status: implemented.

## Assumptions

- Active account-overdraft usage is the negative portion of the linked account's latest preferred balance.
- Legacy unlinked or otherwise non-derivable overdrafts continue to expose their stored `usedAmount` until they are edited and linked.
- `linkedAccountId` remains optional in the schema; create and update mutations enforce the stronger overdraft invariant.
- No migration or changes to dashboard net worth and planning projections are required.

## Phases

1. Extract the shared effective overdraft usage helper and use it in credit and analyst reads.
2. Enforce linked-account ownership and currency invariants in credit facility mutations.
3. Remove overdraft usage entry from the credit UI and require linked accounts in create/edit forms.
4. Add focused Convex tests and run lint, tests, and build verification.

## Current Verification Evidence

- `npm test -- convex/overdraft-usage.test.ts` passed with 1 file and 3 tests.
- `npm run lint` passed (`tsc` and ESLint, zero warnings).
- `npm test` passed with 45 files and 259 tests after indexing this plan in `docs/README.md`.
- `npm run build` passed; existing Vite plugin, font-resolution, and chunk-size notices remain.
