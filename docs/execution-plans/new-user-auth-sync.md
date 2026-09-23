# New-user auth sync race

Status: implemented locally; production verification pending release.

## Assumptions

- A WorkOS redirect can return a valid JWT before the AuthKit component has processed `user.created`.
- The screenshot identifies `banking/accounts:listAccounts` with request ID `cb8d2bc352818b85`.
- A JWT alone is insufficient to create or reactivate a profile, especially during account deletion.

## Implementation

1. Make `ensureCurrentUserProfile` return `null` while the AuthKit component user is absent, without changing an existing profile or seeding categories.
2. Gate the normal app shell until that mutation returns a profile ID. Retry pending sync automatically; after a prolonged delay show a manual retry. Keep the account-erasure holding route outside this gate.
3. Explain the brief setup state in both user documentation locales and amend the existing profile-seeding decision and architecture description.

## Current Verification Evidence

- The worktree `.env.local` contains a scoped `CONVEX_DEPLOY_KEY`; with it, the CLI silently prioritizes the worktree deployment over `--prod`. After clearing the variable for the read-only CLI process, `npx convex logs --prod --history 2000 --jsonl` identified production deployment `resilient-cormorant-265`.
- At 2026-09-23 20:55:58 UTC, production `authProfiles:ensureCurrentUserProfile` raised `WorkOS profile sync pending` (request `1448600c57062ec0`). Within 64 ms, `banking/accounts:listAccounts` raised `Unauthorized` for screenshot request `cb8d2bc352818b85`, followed by another `listAccounts` Unauthorized. This confirms the AuthKit component user had not arrived before normal app queries mounted.
- Focused Convex, UI, and docs checks passed (11 tests); the application build passed.
- `npm run lint` and `git diff --check` passed after the final change.
- A live production signup requires a release of the fix and is not yet verified.
