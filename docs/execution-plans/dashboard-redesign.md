# Dashboard redesign

Status: implemented.

## Assumptions

- The approved dashboard redesign plan is frozen and is implemented without FX conversion or schema changes.
- Dashboard account scope is URL-backed (`?account=`); the absent parameter means all active accounts.
- Overdraft availability is derived from the linked account’s preferred booked balance.

## Phases

1. Extract shared preferred-balance and overdraft helpers.
2. Derive account-overdraft usage in credit facilities and add the dashboard overview query.
3. Add account-scoped spending and aggregate planning cashflow.
4. Wire the scoped dashboard UI, KPI cards, charts, and planning-backed payments accordion.

## Current Verification Evidence

- Added Convex tests cover derived overdraft usage, currency bucketing, net worth, account-scoped spending, and aggregate cashflow.
- `pnpm lint` passed with zero warnings.
- `pnpm test` passed with 20 files and 136 tests.
- `pnpm build` passed; existing Vite plugin, font-resolution, and chunk-size notices remain.
