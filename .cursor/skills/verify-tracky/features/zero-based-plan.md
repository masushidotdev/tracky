# Zero-Based Plan

## Sub-features

- Plan creation (`CreatePlanSheet`) binding a currency and eligible active cash/card accounts.
- Monthly grid (`/app/plan`, `PlanView`) showing `Ready to assign` (`All money assigned` / `Overassigned — reduce assignments`), category groups, buckets, activity, and assigned amounts.
- Month navigation (`Previous month`, `Back to current month`, `Next month`), `Auto-Assign` (`AutoAssignDialog`), bucket inspector, and `Plan accounts…` editor.

## How to get to it (user POV)

1. Open `Plan` in the primary sidebar (`/app/plan`).
2. If no plan exists, click `Create plan`, name it, pick currency and eligible accounts, and save.
3. Assign available funds to category buckets until `Ready to assign` reaches zero (`All money assigned`).

## Driving it with Playwright / curl

Requires `npm run dev` on `http://localhost:3000` with authenticated session and at least one funded active cash/card account.

1. Navigate to `http://localhost:3000/app/plan`.
2. If empty state (`Create your first plan`) is shown:
   - Click `button:has-text("Create plan")`.
   - Enter plan name (min 2 chars), select at least one eligible account, submit (`plan.create.success` toast).
3. Record initial `Ready to assign` amount from `PlanHeader`.
4. Add or edit a bucket assignment in `PlanGrid`, confirm `Ready to assign` decreases by the assigned amount and persists after `page.reload()`.
5. Toggle month navigation (`Next month` -> `Back to current month`) and verify month header updates cleanly.

## Gotchas

- Investment (`INVS`) and asset (`ASST`) accounts are ineligible for plans (`isPlanAccountType` in `src/components/banking/plan/plan-view.tsx`).
- Plans are single-currency; accounts in other currencies are excluded or dropped with a warning (`plan.create.droppedWarning`).
- Without an active account having positive balance (for example from CSV import or manual balance), `Ready to assign` starts at `0.00` and any positive assignment triggers `Overassigned — reduce assignments`.
