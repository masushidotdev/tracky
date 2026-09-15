# Safe-to-spend Money-box Funding

Status: Complete

## Goal

Make “Disponibile dopo le spese” subtract only the money-box funding still due
in the current planning cycle, while keeping the Planning accrual rows and the
selected-account scope consistent with the Dashboard.

## Assumptions and invariants

- The cycle funding target is calculated from the saved amount at the start of
  the cycle, so recording a contribution does not move that cycle's target.
- Remaining cycle funding is `max(cycle target - contributions to date, 0)`.
- Future-dated contributions do not cover today's safe-to-spend requirement.
- When a linked planned expense is already a committed outflow in the same
  cycle, its money-box funding is not subtracted a second time.
- Account-scoped safe-to-spend includes only that account's cashflow and
  associated money boxes; the all-accounts view retains unassociated boxes.

## Phases

1. Extend the planning read model with a stable cycle funding target.
2. Compute safe-to-spend from per-money-box residual funding and pass the
   selected account through the Dashboard query.
3. Add regression tests for covered, partial, linked-expense, future-dated, and
   account-scoped cases.
4. Run lint, focused tests, full tests, and the production build.

## Current Verification Evidence

- `npm run lint`: TypeScript and ESLint completed with zero warnings.
- Focused regression suite: 3 files and 69 tests passed.
- `npm test`: 64 files and 406 tests passed.
- `npm run build`: client and SSR production builds completed successfully.
- Regression coverage verifies covered and partially covered money boxes,
  future-dated contributions, linked-expense de-duplication, stable cycle
  targets, and selected-account scoping.
