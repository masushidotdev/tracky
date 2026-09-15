# Money Box Account Accruals

Status: Complete

## Goal

Give money boxes dedicated create/edit and contribution flows, optionally associate them with financial accounts, and show informational monthly accrual actions in each associated account's cashflow table.

## Assumptions and Invariants

- Money remains integer minor units plus a currency code; account association requires an exact currency match.
- Money-box accrual rows are informational actions. They never enter account cashflow items, totals, projected balances, balance tooltips, or aggregate projections.
- Contributions may be recorded manually or linked to an owned imported transaction through the existing contribution mutation.
- Only active money boxes are editable; archived boxes can be reactivated through the status mutation.

## Implementation Phases

1. Extend money-box persistence, account/currency validation, editing, status transitions, and cycle contribution aggregation.
2. Add dedicated money-box create/edit and contribution dialogs, section creation actions, and expense-to-money-box actions.
3. Redesign money-box cards and add dateless accrual rows after account closing balances.
4. Add backend regression coverage and update both translation catalogs and durable documentation.

## Current Verification Evidence

- `pnpm lint`: TypeScript and ESLint completed with zero warnings.
- `pnpm test`: 20 test files passed; 151 tests passed.
- `pnpm build`: client and SSR production builds completed successfully.
- Regression coverage verifies account ownership/currency validation, association clearing, edit/status rules, cycle-window contribution sums, unassociated boxes, and unchanged account items/projected balances.
