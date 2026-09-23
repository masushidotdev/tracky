# Decision 0024: Immediate account erasure

Status: accepted

Supersedes the deletion-request behavior in decisions 0006 and 0015. Number
0021 in the execution plan was already used by the public marketing decision.

## Decision and reason

Confirmation starts irreversible erasure immediately. There is no grace
period: the old `deletionRequestedAtMs` flag had no consumer, so retaining it
would continue to promise deletion without performing it. The user can prepare
and download a JSON export first; this entry point bypasses the normal daily
request limit. The dialog requires the signed-in email to be typed before the
delete button enables.

One authenticated mutation records a `wiping` job and schedules the first
server action. Bounded, indexed mutation batches delete export files, personal
data, Telegram updates, bank records, planning/forecast data, Analyst threads,
settings, and profile. Progress and retries are stored in `accountDeletions`;
the browser only displays progress and signs out. The first batch disconnects
providers and removes sync state and queued proactive jobs, so background work
cannot intentionally continue for this account. A daily sweeper resumes stale
jobs after 15 minutes and retries failed jobs with backoff. Normal progress is
scheduled immediately after each batch.

Enable Banking `DELETE /sessions/{session_id}` is attempted after connection
IDs have been captured and before provider connection rows are deleted. A
missing session (HTTP 404) is already revoked. Other failures are logged and
stored for retry after user deletion; they never block erasure. WorkOS
`DELETE /user_management/users/:id` runs last, after the app's user data and
profile have been removed. WorkOS 404 is treated as success; transient failures
keep a retryable job. The `user.deleted` webhook sees no profile and is a no-op.

The final app record is a SHA-256 hash of the high-entropy WorkOS user ID and
the deletion date. The tombstone is cleaned after 365 days. Completed jobs
drop the raw user ID; if consent revocation is pending, they temporarily keep
the provider session ID and retry state. A late profile webhook and normal
authenticated app calls cannot recreate data while the job or tombstone is
present.

## Verified boundaries and known residue

- [Enable Banking's API](https://enablebanking.com/docs/api/reference/) documents
  session deletion and says it closes bank consent where possible.
  [WorkOS's User Management API](https://workos.com/docs/reference/authkit/user)
  documents direct user deletion at the path above.
- `@convex-dev/agent` exposes per-user thread listing and asynchronous thread
  deletion; its own scheduled cleanup removes messages/streams. A component
  worker may still be finishing after the last app table is empty.
- `@convex-dev/resend` exposes no per-user email/event deletion API. Sent email
  metadata, recipient addresses, bodies, and webhook events in that component
  remain under its existing age-based cleanup. The app cannot truthfully claim
  zero data residue in that component until its API or integration changes.
- Previously captured opt-in PostHog events follow their separate retention
  process; this Convex wipe does not issue a PostHog person/event deletion.
- Anonymous Telegram updates with no user ID and no surviving chat link cannot
  be attributed safely to an account. Linked-chat updates are deleted before
  the link. Unattributable terminal updates are pruned after 30 days.

These boundaries are stated here and in the user documentation instead of
silently treating a provider API failure or unavailable component function as
a successful deletion.

## Rollout constraint

Old `userSettings` rows may contain `deletionRequestedAtMs`. The final schema
removes that field, so an existing deployment needs a compatibility schema
release, a bounded migration clearing the field, and then the final schema
release. Removing the validator before migrating those rows can block Convex
schema validation. Staging and production need independent migration evidence.
