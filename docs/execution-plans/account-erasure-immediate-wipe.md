# Execution Plan: Account Erasure Immediate Wipe

Status: implemented (workstreams A-H landed on t3code/clarify-account-deletion; rollout verification pending).

## Scope

Replace the request-only deletion model (decisions 0006, 0015: flag with no
consumer) with an immediate, irreversible, browser-independent wipe:

request → type-to-confirm + optional export → holding page with progress →
Convex chunked hard-delete → provider revocations (best-effort) → WorkOS user
delete last → tombstone → client signOut + redirect to unauthenticated homepage.

Decisions taken with the user (Q&A 2026-09-22/23) and their reasons:

- No grace period (immediate wipe, not 30d). Reason: user wants irreversible
  delete-now; GDPR "without undue delay" satisfied; no retention to justify.
  Supersedes the earlier 30-day grace draft discussed 2026-09-22.
- WorkOS deleted last. Reason: identity must stay valid while Convex mutations
  run under `requireAuthUser`; its DELETE is the final step. Webhook
  `user.deleted` (`convex/auth.ts:34`) stays as safety net (no-op, profile
  already hard-deleted → `markUserProfileDeleted` returns null).
- App fully usable until confirm; no read-only mode. Reason: avoids touching
  every write path; DangerZone dialog carries the irreversibility warning.
- Provider revocation failure is best-effort + logged, never blocking. Reason:
  a down provider must not strand user data or wedge the holding page on a
  spinner; sweeper retries in background.
- Export offered in the confirm dialog (download before confirm). Reason: GDPR
  portability; export blob is deleted by the wipe itself (group 1), so ordering
  is mandatory. Export-from-deletion bypasses the 1/day rate limit (or reuses a
  recent export). The user confirms they saved a selected export after opening
  the download link; the server stores that acknowledgment and checks it at the
  deletion boundary. It represents the user's confirmation, not browser proof
  of a completed download.
- Type-to-confirm (type account email to enable the delete button). Reason:
  standard for irreversible no-undo actions; replaces current double-click
  AlertDialog (`src/components/settings/danger-zone-card.tsx`).
- Browser independence: after one `deleteMyAccount` call the whole chain lives
  in the Convex scheduler; closing the tab changes nothing. Reopening shows
  holding again (`wiping`) or logs out (`done`/Unauthorized).

## Workstreams (parallelizable, dependencies noted)

### A — Schema + indices (no deps, first)

- New `accountDeletions`: `{ userId, status: wiping|done|failed, currentStep,
  requestedAtMs, attemptCount, lastError?, revocationResults?, workosDeleted }`.
  Indices `by_userId`, `by_status`.
- New `deletedUsers { userHash, deletedAtMs }` (SHA-256 of authUserId, no PII),
  index `by_deletedAtMs` (12-month tombstone retention cleanup, future).
- Add missing `by_userId` indices after Phase-0 audit: `proactiveJobs`,
  `planMonthSnapshots`, `forecastAccountAssumptions`, `forecastIncomeSources`,
  `forecastLifeEvents`, `telegramUpdates`. Strategy for rows without userId
  (`analystTurnLocks` keyed by threadId, orphan `telegramUpdates`): resolve via
  thread→user mapping / chatId of deleted links; document accepted residue only
  if non-PII.
- Keep `userSettings.deletionRequestedAtMs` optional for this release so
  `clearLegacyDeletionFlags` can migrate existing rows before a follow-up
  release removes the validator. Delete `requestAccountDeletion` /
  `cancelAccountDeletion` mutations, DangerZone pending UI, related tests.

### B — Trigger + orchestrator (deps: A)

- New `deleteMyAccount` mutation: `requireAuthUser`, optional
  `deletionExportId`, server check for a selected export and its download
  acknowledgment (even if the caller omits the ID), idempotency on existing
  `accountDeletions` row for the user (second call → `deletion_in_progress`
  error), insert `wiping` row, step 0 (mark connections `disconnected`, delete
  sync-states so crons skip the user), `scheduler.runAfter(0, beginWipe)`.
  Failed selected exports allow direct deletion; no selected export keeps the
  optional-export path valid.
- `beginWipe` action: re-check status, drive batch chain, advance `currentStep`
  per group for the holding-page progress.
- `getDeletionStatus` query: auth-only, must NOT depend on `userProfiles` (it
  is hard-deleted mid-wipe). Returns `{ status, currentStep }` or null.
- Sweeper cron (every five minutes, `convex/crons.ts`): resume `wiping` rows
  with stale heartbeat (15 min timeout, e.g. worker crash), retry
  `failed` with backoff (`attemptCount`, `nextRetryAtMs`), retry pending
  revocations. Failed revocations are abandoned after 30 days from the
  deletion request and their completed job rows are removed. The sweeper is a
  recovery path; normal batches schedule their own continuation.

### C — Banking wipe batches (deps: A, runs parallel to D)

Leaf-first, ~100 rows/txn via `by_userId`, chain via `scheduler.runAfter(0)`:

1. `dataExports` (+ `ctx.storage.delete` blobs, try/catch), `notifications`,
   `agentMemories` (row delete removes embeddings too), `writeGuardBadges`,
   `agentReports`, `healthScoreSnapshots`, `savedReports`.
2. `telegramLinkCodes`, `telegramLinks`, then `telegramUpdates` (with userId →
   delete; without but chatId of a deleted link → scrub
   `inboundText/outboundText/userId` or delete if completed+old; anonymous
   residue → time-boxed delete via `by_status_and_updatedAtMs`).
3. Banking leaves: `accountBalances`, `transactions`, `accountSyncStates`,
   `importJobs`, `categoryRules`, `transferMatches`,
   `plannedExpenseOccurrencePayments`, `moneyBoxContributions`,
   `creditFacilityInstallmentPayments`, `creditFacilityUsageCycles`.
4. Banking core (after revocation workstream E read `sessionId`):
   `subscriptions`, `plannedTransactions`, `moneyBoxes`,
   `creditFacilityInstallmentPlans`, `creditFacilities`, `financialAccounts`,
   `categories`, `transactionTags`, `providerAuthRequests`,
   `providerConnections`.

### D — Planning/forecast/misc wipe (deps: A, parallel to C)

- `planMonthSnapshots`, `planAssignments`, `planTargets`,
  `planBucketCategories`, `planBuckets`, `planGroups`, `plans`,
  `planningPreferences`; forecast children then `forecastScenarios`;
  `proactiveJobs`, `analystTurnLocks` (per Phase-0 mapping); component tables
  (`@convex-dev/agent` threads/messages, `@convex-dev/resend` logs) per Phase-0
  audit — if not deletable via API, record as known residue in the decision doc.
- Final: hard-delete `userSettings` + `userProfiles`, insert `deletedUsers`
  tombstone, mark `wipeCompletedAtMs`.

### E — Provider revocation + WorkOS delete (deps: A; revocation before C-group-4, WorkOS after D)

- `revokeProviderConsents`: per `providerConnections` with `sessionId`, EB
  `DELETE` (endpoint verified in Phase 0; same RS256 JWT helper as
  `enableBankingRequest`, `convex/banking/enableBanking.ts:134`). Record
  `{connectionId, ok, code}` in `revocationResults`; never throw. Manual
  (session-less) connections → skip. Sweeper retries `ok:false`.
- `deleteWorkosUser`: direct `fetch DELETE .../users/{id}` with `WORKOS_API_KEY`
  (path/version verified in Phase 0); 404 = already gone → `done`. 5xx/429 →
  sweeper retry. Sets `workosDeleted`, status `done`.
- Verify existing 401 handling forces logout; else add forced-logout handler.

### F — Frontend holding flow (deps: B for API shape; UI mock parallel)

- DangerZone dialog: open the export download link, then use "I saved my export"
  to call `acknowledgeDeletionExportDownload({ exportId })`. The export list
  exposes `deletionSelected` and `deletionDownloadAcknowledgedAtMs` to restore
  this state after a refresh. Disable confirmation during a pending export
  request and until the selected export is acknowledged. Email type-to-confirm
  also gates "Delete everything".
- Confirm → `deleteMyAccount` → navigate `/app/settings/deleting` holding page
  (spinner + step progress from `currentStep`).
- Holding polls `getDeletionStatus` every 2s, no frontend timeout. Completion =
  `status==done` OR (`wiping` started AND query → Unauthorized, i.e. identity
  died before client read `done`). Then `signOut()` (`useAuth` from
  `@workos/authkit-tanstack-react-start`, cf. `src/components/nav-user.tsx:28`)
  + redirect to unauthenticated `/`.

### G — Tests (deps: B–F; write alongside)

convex-test pattern from `convex/user-settings.test.ts`:

- Double submit → second throws `deletion_in_progress`.
- Selected export → user download acknowledgment → wipe ordering, including
  omission of `deletionExportId` by a direct mutation caller. The UI also
  blocks confirmation while an export request is pending.
- Full-seed wipe: all ~45 tables + export blobs → zero residue, storage empty,
  tombstone present, profile hard-deleted.
- EB/WorkOS fetch mocked to fail → page still closes, sweeper retries.
- Abandoned tab (no polling) → sweeper completes headless.
- Unauthorized-after-wiping → redirect path taken.
- All new mutations reject without identity.

### H — Docs + i18n (same land, repo rule; deps: final behavior)

- `docs/decisions/0024-account-erasure-immediate-wipe.md` (Status: accepted):
  immediate wipe, order, best-effort revocations, hash tombstone, WorkOS last;
  explicitly supersedes 0006/0015 (kept, not deleted).
- User docs EN+IT `settings-and-privacy.mdx`: rewrite deletion section (amend,
  not append): what happens, immediacy, no undo, export-first, tombstone.
- i18n `src/lib/i18n.tsx` EN+IT: step labels, `deletion_in_progress`, holding
  copy, banner removal.
- CHANGELOG entry at merge.

## Phase 0 verification checklist (before coding)

- EB session/consent revoke endpoint + already-expired semantics (treat as ok).
- WorkOS user DELETE path/version; confirm no AuthKit-component helper needed
  (package absent from this checkout — direct fetch planned).
- Component table ownership: `@convex-dev/agent`, `@convex-dev/resend`
  (userId fields? orphans? delete APIs?).
- `signOut()` post-delete redirect behavior.
- Measure wipe duration on a full fixture user (holding-page step copy).

## Rollout

- Staging with fixture user → force wipe → verify WorkOS dashboard (user gone),
  EB dashboard (consents revoked), tables empty.
- Deploy compatibility schema with `deletionRequestedAtMs` optional, run
  `clearLegacyDeletionFlags` to completion in staging, and verify the old
  field is absent before repeating in production (including the Sep-21 test
  request). Remove the compatibility field in a later release after both
  migrations are verified; `cancelAccountDeletion` is already removed.
- Prod deploy; post-merge: CHANGELOG, recap 2–5 sentences, main pull
  `--ff-only`, `git status -sb` verify (repo PR rules).

## Current Verification Evidence

- 2026-09-23: workstreams A-H implemented. On Node 22, the default `npm test`
  run passed three consecutive times (127 files / 989 tests) and passed again
  after adding an ordinary-export direct-deletion regression (990 tests);
  `npm run lint`
  (tsc + eslint) and `npm run build` passed. The prior `resetAvailable` flake
  came from its test fixture inserting June transactions directly after
  assignment mutations had scheduled historical snapshots. The fixture now
  seeds those transactions first, so snapshots include both spends;
  `convex/plan-read.test.ts` passed ten consecutive focused runs on Node 22.
  Account-deletion tests cover double-submit idempotency, selected-export
  acknowledgment (including an omitted ID), failed-export fallback,
  deletion-export reuse under the daily limit, headless batch wipe with storage
  cleanup, EB failure retry, and WorkOS failure retry. Remaining rollout step:
  staging fixture wipe with WorkOS/EB dashboard checks per Rollout above.

## Review remediation (2026-09-23)

The post-implementation review found that checking authentication before an
asynchronous action was insufficient: the action could cross an erasure batch
before its later mutation wrote data. Notification upserts and email queueing,
proactive job enqueue, Telegram link-code storage, Analyst memory and approval
badge writes, import triage and plan snapshot writes, and bank authorization
request storage now check the erasure job and tombstone in the transaction that
writes. Telegram replies and notification deliveries check whether the user and
their current link remain eligible before sending each outbound chunk. An
external request that has already started cannot be recalled. App navigation
during a wipe returns to the holding page; pricing FAQs and the EN/IT privacy
guides now describe the actual irreversible flow and the email-component residue.

An Enable Banking callback can receive a `/sessions` result after erasure has
removed its authorization request. The callback now captures that otherwise
untracked session in a dedicated, bounded retry record before attempting a
compensating DELETE. This is separate from the ordinary connection revocation
list because that list can only see sessions already saved in
`providerConnections`. Recovery retries failures without restoring account
data, and removes the provider session ID on success or after 30 days.

The original headless test exercised several tables and a batch boundary, but
did not seed every app-owned table. A new schema-driven fixture now inserts one
row into each of the 45 app-owned tables and verifies that headless erasure
removes them all. Focused interleaving tests cover the discovered writers and
both immediate and retried detached-session revocation. A staging fixture
with provider dashboard checks remains a rollout verification item.

The PR CI run also exposed a timing race in the existing proactive-queue test:
enqueue scheduled its real watchdog while the test manually advanced the same
job through three leases. The test now pauses scheduled timers while exercising
those explicit watchdog calls, so a concurrent watchdog cannot consume an
attempt between assertions.
