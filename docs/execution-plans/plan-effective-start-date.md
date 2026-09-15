# Plan effective start date

Status: implemented and verified.

## Goal

Give every plan an effective ISO start date, separate from its first calendar
month, so transactions booked before the plan existed do not create bucket
activity or overspending.

## Assumptions

- Money remains anchored to current account balances.
- `startDate` stays optional during the compatibility window. A missing value
  retains the calendar-month behavior.
- Existing plans are backfilled to the first day of `startPeriod`.
- Restarting changes only the plan origin and snapshot cache. Groups, buckets,
  category mappings, targets, and assignments remain intact.

## Phases

1. Widen the plan schema and write `startDate` on new plans.
2. Exclude pre-origin transactions from bucket and out-of-plan activity, while
   reconciling their cash effect in a dedicated breakdown line.
3. Add the authenticated restart mutation and targeted snapshot rebuild.
4. Add the idempotent legacy-plan backfill.
5. Expose restart behind an explicit confirmation in the plan switcher.
6. Prove the behavior with load-bearing tests, then run lint, test, and build.

## Current Verification Evidence

- Focused Plan read/model/migration run: 3 files and 86 tests passed.
- Load-bearing mutation checks: removing the creation date, pre-origin guard,
  reconciliation term, legacy fallback, restart origin update, snapshot
  deletion, restart scheduling, migration write, bucket drill-down filter, or
  out-of-plan drill-down filter made the corresponding focused test fail.
- `pnpm lint`: TypeScript and ESLint passed without diagnostics.
- `pnpm test`: 93 files and 721 tests passed (716 existing + 5 new).
- `pnpm build`: client and SSR production bundles completed.
