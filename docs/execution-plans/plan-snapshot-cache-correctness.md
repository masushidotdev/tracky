# Plan Snapshot Cache Correctness

Status: implemented and verified.

## Scope and assumptions

- Keep `computeMonth` accounting results unchanged.
- Treat `planMonthSnapshots` strictly as a rebuildable carry cache.
- Rebuild every plan after the accounting-logic change through an explicit, paginated one-time migration.
- Never write a truncated month, while allowing the recomputation batch and its self-scheduling chain to advance.
- Stop writing deprecated snapshot-only totals while keeping their validators optional for deployment compatibility.
- Invalidate from a dated money-box movement when a reliable date exists; invalidate every snapshot for structural money-box and linked-card changes that have no single safe start date.
- Keep the cache out of user data exports because it is derived and can contain compatibility fields from older deployments.

## Phases

1. Widen the snapshot schema and narrow new snapshot writes.
2. Add the paginated delete-and-reschedule migration.
3. Make recomputation skip truncated writes without returning early.
4. Cover every Plan-relevant money-box mutation and linked-card reassignment with invalidation.
5. Add load-bearing regression tests for migration scheduling, truncation progress, payload shape, and mutation invalidation.

## Current Verification Evidence

- `pnpm lint` passed after TypeScript and ESLint completed without diagnostics.
- `pnpm test` passed: 91 test files and 696 tests.
- `pnpm build` passed: client and server production bundles completed; Vite retained the existing `vite-tsconfig-paths` advisory and unresolved Geist font warnings.
