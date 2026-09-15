# Multi-kind default categories

Status: implemented.

## Assumptions

- The seven requested categories are valid for expense, income, and transfer
  classifications.
- Existing default and custom categories must remain compatible during rollout.
- System category names are localized in the UI rather than rewriting stored
  financial data when the user changes language.

## Phases

1. Widen `categories` with optional `applicableKinds` and add neutral
   `category:*` defaults.
2. Make assignment, classification validation, category rules, and category
   listing understand compatibility with a legacy fallback to `kind`.
3. Add English and Italian names keyed by `systemKey` in the UI.
4. Run the idempotent paginated default-category backfill for active users.

## Current Verification Evidence

- Targeted category, import, and manual-transaction tests: 35 passed.
- Full test suite: 63 files and 400 tests passed.
- `npm run lint` passed with TypeScript and ESLint clean.
- `npm run build` completed successfully.
- The paginated Convex backfill completed on the configured deployment and
  processed one active user; the seeder is idempotent and awaited all category
  writes before returning.
