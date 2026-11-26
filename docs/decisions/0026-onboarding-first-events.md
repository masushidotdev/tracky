# 0026: Onboarding first-time PostHog milestone events

Status: accepted

## Decision

Add five idempotent, client-only first-time onboarding milestone events on top of
the existing recurring analytics events (decision 0022):

- `signup_completed` (`{ surface: 'app_bootstrap' }`) — emitted once when a newly
  created account first bootstraps `/app` with analytics ready (see **Signup
  milestone** below).
- `first_csv_import_completed` (`{ row_count_bucket, surface: 'import' }`) — emitted
  once on the first CSV import batch that actually inserts rows (`imported > 0` in
  `csvImport.importManualTransactionsBatch`; all-duplicate or all-invalid batches
  with `imported === 0` do not count).
- `first_plan_created` (`{ surface: 'plan' }`) — emitted once when `plan.createPlan`
  inserts the user's first zero-based plan (the duplicate-name early return does not
  count, and `plan_bucket_created` stays separate).
- `first_transaction_created` (`{ source: 'csv' | 'manual' | 'bank' }`) — emitted
  once when the user's very first transaction is persisted from any source (`csv`,
  `manual`, or `bank`). Only the `source` enum property is allowed.
- `first_bank_account_connected` (`{ surface: 'bank-connections' }`) — emitted once
  when `providerMutations.completeEnableBankingSession` inserts the user's first
  provider-backed `financialAccounts` row.

Existing recurring events (`signup_started`, `login_completed`,
`manual_account_created`, `csv_import_started`, `csv_import_completed`,
`csv_import_failed`, `bank_connection_*`, `plan_bucket_created`) stay intact;
first-time events are purely additive.

### Client-only capture and self-hosted silence

- Capture remains 100% client-side through `trackEvent` in
  `src/lib/analytics/events.ts` (consent-gated, lazy-initialized after explicit
  opt-in). There is no `posthog-node` dependency, no server-side PostHog capture,
  and no new Convex environment variables or secrets (decisions 0022 and 0025).
- For direct client mutations (`importManualTransactionsBatch`,
  `createManualTransaction`, `createPlan`), the mutation returns a
  `milestonesEmitted` object and the calling UI invokes `trackEvent`.
- For server-originated bank flows (`completeEnableBankingSession` from the Enable
  Banking HTTP callback and `upsertTransactions` from async bank sync), the
  mutation queues a boolean under `userSettings.onboardingMilestones.pendingClientEvents`.
  An authenticated client component (`OnboardingMilestoneFlusher`) atomically claims
  and clears those booleans via `userSettings.claimPendingOnboardingMilestones` only
  when `isAnalyticsReady()` is true, ensuring single delivery across tabs and reloads.
- Self-hosted installs without `VITE_POSTHOG_ENABLED=true`, `VITE_POSTHOG_KEY`, and
  `VITE_POSTHOG_API_HOST` remain silent: `trackEvent` no-ops and
  `OnboardingMilestoneFlusher` skips the settings query, does not start a timer, and
  does not call the claim mutation. If consent is rejected, the flusher also stops
  polling and waits for a later consent change.
- Properties contain only fixed enums and `countBucket()` strings — never amounts,
  descriptions, account names, bank names, IBANs, emails, or notes.

### Idempotency: persisted flag + prior-data check (`emit` / `backfill` / `skip`)

Each milestone is governed by the pure decision rule
`shouldEmitFirstMilestone({ alreadyMarked, hadPriorData })` in
`convex/lib/onboardingMilestones.ts`:

1. `alreadyMarked === true` -> `'skip'` (do not emit, do not rewrite the timestamp).
2. `alreadyMarked === false` and `hadPriorData === true` -> `'backfill'` (persist the
   timestamp silently without emitting, so existing users who already had data before
   this rollout do not fire a fake "first" event on their next action).
3. `alreadyMarked === false` and `hadPriorData === false` (and the write actually
   created an item) -> `'emit'` (persist the timestamp atomically in the same Convex
   mutation and signal the client to emit once).

Timestamps (`signupAtMs`, `firstCsvImportAtMs`, `firstPlanAtMs`,
`firstTransactionAtMs`, `firstBankAccountAtMs`) live on
`userSettings.onboardingMilestones`, so they are per-user, cross-device, survive
deleting and recreating records, and are erased automatically when
`accountDeletion.eraseProfile` deletes `userSettings`.

### Signup milestone

`signup_completed` (`{ surface: 'app_bootstrap' }`) closes the top of the
`signup -> first import -> first budget` funnel (`login_completed` fires on every
login, so it cannot represent one-time account creation):

- `userSettings.claimSignupMilestone` is an authenticated, idempotent, atomic
  mutation governed by `shouldEmitSignupMilestone` (delegating to
  `shouldEmitFirstMilestone`) in `convex/lib/onboardingMilestones.ts`.
- If `userSettings.onboardingMilestones.signupAtMs` is already set, it returns
  `{ emit: false }` without writing.
- Otherwise it performs bounded indexed `.first()` checks across
  `financialAccounts`, `transactions`, and `plans`, and checks whether any earlier
  onboarding milestone timestamp (`firstCsvImportAtMs`, `firstPlanAtMs`,
  `firstTransactionAtMs`, `firstBankAccountAtMs`) is already set.
- **Existing `userSettings` row without data:** a user who has a `userSettings`
  row (for example, after saving notification preferences before accepting
  analytics consent) with no `signupAtMs`, no other onboarding milestones, and no
  financial data (`financialAccounts`, `transactions`, `plans`) is still treated
  as new and emits once; `signupAtMs` is patched onto the existing row without
  disturbing other settings fields. Any user with prior financial data or prior
  onboarding milestones gets `signupAtMs` backfilled silently (`{ emit: false }`).
- `OnboardingMilestoneFlusher` calls `claimSignupMilestone` at most once per
  session and only when `isAnalyticsReady()` is true (PostHog configured and
  consent accepted) and `settings.onboardingMilestones?.signupAtMs` is unset.
  Self-hosted installs without PostHog config skip the query, timers, and
  mutation; rejected consent never calls the mutation or polls.
- **Known limitation:** pre-existing accounts that have a settings-less,
  data-less state (or a bare `userSettings` row with no financial data and no
  prior milestones) and log in for the first time after deploy are counted as
  signups, so PostHog funnel dashboards should start from the deploy date.

## Why

The hosted-app onboarding funnel (`signup` -> first account -> first CSV import ->
first zero-based plan) needs clean, at-most-once conversion counts per user.
`localStorage` alone is neither per-user nor cross-device and would double-count
across browsers or after clearing site data; checking only current row counts without
a persisted flag would re-emit if a user deleted their first plan or transaction;
checking only a persisted flag without checking prior data would emit false "first"
events for pre-existing users on their next write. Combining an atomic server flag on
`userSettings` with a bounded, indexed prior-data check solves all three while
preserving the client-only PostHog boundary.

## Alternatives considered

- `localStorage`-only guards: rejected — breaks across devices/browsers, shared
  machines, and cleared storage.
- Server-side PostHog capture via `posthog-node` or `fetch` from Convex: rejected —
  violates decision 0022 (client-only opt-in, no Convex PostHog secrets) and decision
  0025 (no `posthog-node`).
- Separate `onboardingMilestones` table: rejected — `userSettings` is already a
  1:1 per-user document read by these flows and wiped by `convex/accountDeletion.ts`.

## Verification

- `npm test` (unit tests for `shouldEmitFirstMilestone` and
  `shouldEmitSignupMilestone`, property-builder privacy checks, flusher
  consent/self-host behavior tests, and `convex-test` integration tests for all
  five milestones and backfill paths).
- `npm run lint`, `npm run security:convex-runtime`, `npm run security:audit`.
