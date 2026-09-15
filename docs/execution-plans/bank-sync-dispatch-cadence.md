# Bank sync dispatch cadence

Status: implemented and verified on the development deployment.

## Goal

Prevent a six-hour account sync cadence from degrading into an effective
twelve-hour cadence when a sync completes a few seconds after the global cron
tick.

## Assumptions

- `accountSyncStates.nextSyncAfterMs` remains the source of truth for whether an
  account may contact its provider again.
- Running the due-account dispatcher is cheap when no account is due because
  the indexed query returns no work and no provider request is made.
- The per-account cadence remains six hours to preserve existing provider rate
  limits.

## Phases

1. Separate the dispatcher interval from the per-account provider cadence.
2. Run the dispatcher every 15 minutes while retaining the six-hour account
   eligibility window.
3. Add a regression test proving the dispatcher interval is shorter than the
   account cadence and catches a just-missed due time before another full
   cadence elapses.
4. Verify tests, lint, build, deployment, and a delayed provider transaction
   catch-up.

## Current Verification Evidence

- Targeted cadence and banking-import tests: 16/16 passed.
- Full Vitest suite: 81 files and 553 tests passed.
- `npm run lint`: passed immediately after the banking implementation. A later
  rerun was blocked by a concurrent, unrelated `plan-header.tsx` type error;
  targeted ESLint for every changed banking file still passed.
- `npm run build`: passed; only existing non-blocking font-resolution and
  chunk-size warnings were emitted.
- `npx convex dev --once`: development functions deployed successfully on
  2026-07-21.
- The delayed catch-up import added the two missing booked transactions
  (`Latina Fitness S.r.l.` and `Il Nuovo Toscano`). A subsequent refresh saw
  all three booked rows in the window and imported zero duplicates.
