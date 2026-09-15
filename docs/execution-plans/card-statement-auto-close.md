# Card Statement Auto-Close

Status: implemented.

## Assumptions

- `creditFacilities.usedAmount` is the single source of truth for an open card statement.
- A manual close remains available for exceptions and uses the facility payment day when no due date is supplied.
- A daily sweep closes active statement-balance facilities after their boundary. With `statementDayOfMonth = 5`, July closes on July 6, so spending after the fifth accrues to the next statement. Without a statement day, a month closes on the first day of the following month.
- A zero-balance sweep advances the open month without creating a scheduled payment.

## Phases

1. Share pure statement date rules between closing, automation, and Planning.
2. Add the daily auto-close cron and editable facility limits/days.
3. Project open card usage in Planning and include scheduled statements in net-worth debt.
4. Replace the manual tracker UI with statement preview, one-click close, and inline editing.
5. Verify backend behavior and the full repository checks.

## Current Verification Evidence

- Convex tests cover default close dates, automatic close snapshots, idempotency, zero-balance rolling, planning projection replacement, net-worth statement debt, and facility edit validation.
- `pnpm lint`, `pnpm test`, and `pnpm build` are run as the final verification steps for this change.
