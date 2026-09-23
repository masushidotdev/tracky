# Decision 0024: Immediate account erasure

Status: accepted

Supersedes the deletion-request behavior in decisions 0006 and 0015. Number
0021 in the execution plan was already used by the public marketing decision.

## Decision and reason

Confirmation starts irreversible erasure immediately. There is no grace
period: the old `deletionRequestedAtMs` flag had no consumer, so retaining it
would continue to promise deletion without performing it. The user can prepare
and download a JSON export first; this entry point bypasses the normal daily
request limit. When the user selects an export for deletion, the dialog opens
its download link and then asks the user to confirm that they saved it. That
confirmation is recorded server-side; it is a user acknowledgment, not proof
that the browser completed a download. `deleteMyAccount` accepts an optional
`deletionExportId`, but also checks any selected export on the server, so
omitting the ID cannot bypass a selected export that is queued, running, or
completed without acknowledgment. A failed selected export permits direct
deletion, and an account with no selected export can be deleted without
requesting one. The dialog also blocks deletion while an export request is
pending. The signed-in email must be typed before
the delete button enables.

Before this confirmation, a required survey asks for one fixed reason. `Other`
requires a comment of at most 500 characters. The feedback and WorkOS user ID,
email, and name are stored in a separate table in the same transaction that
creates the erasure job, then pruned after 365 days. This user-requested product
feedback exception means the statement below about the final erasure record
does not describe all retained records. The dialog and user documentation
disclose the exception. Only the reason code and presence of a comment are
sent to PostHog, and only under the existing analytics consent.

Once WorkOS has deleted the user, its logout endpoint can leave the browser on
a blank WorkOS page. The progress page therefore clears the application's
AuthKit session cookie first, and only then removes completion markers, resets
analytics identity, and loads the public homepage directly. A failed cleanup
keeps the completion state with an explicit retry so the session cookie is
not left behind without one.

One authenticated mutation records a `wiping` job and schedules the first
server action. Bounded, indexed mutation batches delete export files, personal
data, Telegram updates, bank records, planning/forecast data, Analyst threads,
settings, and profile. Progress and retries are stored in `accountDeletions`;
the browser only displays progress and clears its local session. The first batch disconnects
providers and removes sync state and queued proactive jobs, so background work
cannot intentionally continue for this account. Asynchronous writers check
the job and tombstone in their own write transaction; an earlier read or
authentication check cannot authorize a later write after its wipe batch.
Normal app queries also reject an account with an erasure job. The client must
therefore enter the isolated progress route and unmount those queries before
calling `deleteMyAccount`. Starting the mutation while Settings and the app
shell are still mounted causes their reactive queries to throw
`deletion_in_progress` and can crash the progress page even though the server
wipe succeeds. The progress route handles a failed start separately from a
server job that has entered its automatic retry cycle. The pending browser
handoff stores the confirming WorkOS user ID, so a later sign-in by another
account cannot consume it; the route guard also isolates normal screens while
the mutation is outstanding, including after browser Back. The page allows
closing the tab only after the mutation or status query confirms a server job.
A sweeper runs every five minutes and resumes jobs whose heartbeat has been
stale for 15 minutes; it
also retries failed jobs with backoff. Normal progress is scheduled
immediately after each batch.

Enable Banking `DELETE /sessions/{session_id}` is attempted after connection
IDs have been captured and before provider connection rows are deleted. A
missing session (HTTP 404) is already revoked. Other failures are logged and
stored for retry after user deletion; they never block erasure.

An Enable Banking callback can receive a newly created session after the wipe
has removed its authorization request. If saving the session then fails, the
callback records it in `detachedConsentRevocations` before attempting a
compensating DELETE. That separate retry record contains a hashed user ID and
the provider session ID, works even if the erasure job has finished, and is
removed on successful revocation or abandoned after 30 days. This boundary is
necessary because a revocation scan of saved connections cannot find a session
that was never saved. The five-minute sweep is the sole dispatcher for detached
consent retries: it moves the due time before dispatch so overlapping sweep
runs do not start duplicate provider requests. The callback still attempts the
first DELETE immediately. WorkOS `DELETE /user_management/users/:id` runs last,
after the app's user data and
profile have been removed. WorkOS 404 is treated as success; transient failures
keep a retryable job. The `user.deleted` webhook sees no profile and is a no-op.

The final erasure record is a SHA-256 hash of the high-entropy WorkOS user ID and
the deletion date. The tombstone is cleaned after 365 days. Completed jobs
drop the raw user ID; if consent revocation is pending, they temporarily keep
the provider session ID and retry state for at most 30 days from the deletion
request. After that, the retry is abandoned and the completed job is removed.
A late profile webhook and normal authenticated app calls cannot recreate data
while the job or tombstone is present.

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

Old `userSettings` rows may contain `deletionRequestedAtMs`. This release
retains it as an optional schema field so the compatibility schema and
`clearLegacyDeletionFlags` can deploy together. Run that bounded migration to
completion independently in staging and production. Remove the validator in a
follow-up release only after both migrations are verified; removing it earlier
can block Convex schema validation.
