# Account deletion survey and homepage return

Status: implemented and verified locally; staging verification pending

## Scope and assumptions

- The observed blank page is the WorkOS session logout endpoint after the
  erasure job has already deleted the WorkOS user. The app must clear its own
  AuthKit cookie and load `/` directly at that point.
- A reason is required before the existing export and email confirmation.
  `Other` requires 1–500 trimmed characters in a three-row text field.
- The survey is retained for 365 days with WorkOS user ID, email, and name.
  A bounded five-minute cron sweep deletes expired responses.
- PostHog receives only the reason code and a boolean for comment presence,
  under existing analytics consent. It receives no free text or contact data.

## Implementation

1. Survey screen in the deletion dialog and typed pending handoff to the
   isolated progress route.
2. Server validation and atomic insertion into `accountDeletionFeedback`
   alongside the erasure job.
3. Local session cookie removal and document navigation to the homepage after
   `done` or a previously started job whose status is no longer readable.
   Cookie cleanup runs first; only on success are completion markers removed,
   analytics identity reset, and the browser sent to `/`. A failed cleanup
   keeps the completion state with an explicit retry instead of stranding
   the session without one.
4. English and Italian interface and privacy documentation.

## Current Verification Evidence

- `npm run build` passed with Node 22.23.2. `npm run lint` passed after the
  generated content collection became available. Targeted account deletion,
  route guard, pending handoff, and documentation tests passed (25 tests).
- The first full `npm test` run exposed three fixtures that still described
  the old handoff shape or plan heading. After correcting them, the full suite
  passed: 131 files and 1014 tests. `git diff --check` passed.
- Staging: delete a disposable account with `Other`, verify one feedback row,
  no free text in PostHog, WorkOS user deletion, local cookie removal, and final
  homepage URL. Repeat with analytics consent rejected to verify no event.
- Retention: advance staging time or use a controlled expired fixture and run
  `accountDeletion:sweepDeletions`; verify only expired survey rows are removed.
