# Decision 0015: Make account deletion requests reversible

Status: accepted

## Context

Issue #8 item 5 identified that `requestAccountDeletion` records
`userSettings.deletionRequestedAtMs`, but nothing consumes that flag. Decision
0006 deliberately keeps account deletion request-only while a full erasure
pipeline is out of scope. The settings page exposed a pending request without
any way to withdraw it.

Real erasure spans 40+ tables holding user data, banking provider connections,
and the sign-in identity. No WorkOS user-delete API call exists in this
repository. A grace-period cron would still promise deletion without performing
real erasure; waiting before changing a flag does not solve that gap.

## Decision

- Keep the request-only model and add `cancelAccountDeletion` as the minimal
  honest fix. It derives the current user through `requireAuthUser`, looks up
  settings by the user index, and clears the optional timestamp with
  `ctx.db.patch` and `undefined`, following the existing field-clearing idiom.
- Cancellation returns `null`. If the settings document or request is absent,
  it performs no write. Otherwise it removes the flag and updates `updatedAtMs`.
- Show a cancel control while a request is pending, with an in-flight disabled
  state and success/error feedback. Reactive settings remove the pending state
  after cancellation and allow a later request.
- Describe the reversible request and the absence of automatic erasure in both
  English and Italian user documentation.

## Consequences

Users can withdraw their request without changing financial data, banking
connections, or their WorkOS identity. No purge or grace-period job is added.
The erasure pipeline remains future work through the `markUserProfileDeleted`
lifecycle seam in `convex/authProfiles.ts`; that seam currently marks a profile
deleted and is not itself a purge implementation.
