# Enable Banking Sync Reliability

Status: implemented.

## Assumptions

- Enable Banking transaction identifiers make repeated imports idempotent.
- Provider dates are ISO calendar dates and sync-window arithmetic is UTC-only.
- Error retries share the existing due-state dispatcher and its overall limit.

## Phases

1. Re-check a bounded seven-day transaction window without crossing the initial
   backfill boundary or producing an inverted request.
2. Keep future-dated bookings from advancing the cursor and add exponential
   backoff for failed syncs that the dispatcher can retry.
3. Add an internal ops cursor rewind and regression coverage for all repaired
   state transitions.
4. Run the targeted banking tests and repository lint.

## Current Verification Evidence

- `npx vitest run convex/banking-import.test.ts
  convex/banking-sync-cadence.test.ts convex/banking-sync-window.test.ts`
  passed: 3 files and 26 tests.
- `npm run lint` passed with zero warnings.
