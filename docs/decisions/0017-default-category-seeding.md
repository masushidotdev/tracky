# 0017: Default category seeding at profile creation

Status: accepted

## Decision

Seed the default category taxonomy in `upsertUserProfile` (convex/authProfiles.ts)
when a new `userProfiles` row is inserted, and self-heal in
`ensureCurrentUserProfile` when WorkOS data is present but the account has zero
categories.

## Why

`ensureDefaultCategoriesForUser` was reachable only from the bank-sync import
path, a manual `ensureDefaultCategories` mutation no UI called, and a one-off
`seedDefaultCategories` migration. Signup goes through the WorkOS
`user.created` event and the app-shell `ensureCurrentUserProfile` bootstrap,
neither of which seeded — so new accounts opened an empty category picker and
empty reports until their first bank sync. Seeding at profile insert fixes new
accounts; the bootstrap self-heal (one indexed `by_userId` read when healthy)
repairs accounts created before this change.

The fail-closed path stays fail-closed: when no WorkOS data exists we still
throw `WorkOS profile sync pending` without seeding, so a stale JWT cannot
provision taxonomy for a deleted or never-synced user.

## Alternatives considered

Seeding lazily in `listCategories` was rejected: queries must stay read-only
and cheap, and every category consumer would need the same guard. Seeding in
`ensureCurrentUserProfile` alone was rejected: webhook-created profiles would
still start empty for clients that never hit the bootstrap mutation.
