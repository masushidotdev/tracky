# Monarch Parity Roadmap (M1–M4)

Status: implemented — all four phases landed in the working tree on 2026-07-20; not yet committed.
Owner: coding agents (claudex implementation, Claude spec/review/verification).

## Goal

Close the highest-value feature gaps against Monarch Money's Product & Feature Guides (help.monarch.com, category 32460945233812; all sections fetched and analyzed via the Zendesk API on 2026-07-19), prioritized as: Reports & Cash Flow, Forecasting, Goals 3.0, transaction enrichment. Follow-up to `pmf-gap-analysis-roadmap.md` (F1–F7).

## Phases

- **M1 — Reports & Cash Flow (historical analytics)**: `/app/reports` with Cash Flow / Spending / Income tabs, Breakdown (Sankey via d3-sankey, donut, horizontal bar) and Trends (grouped/stacked bars) modes, date presets + custom range, account/category/tag/amount filters, per-currency summary with savings rate, drill-down transactions sheet, saved reports (max 20), client-side CSV export, Analyst `getSpendingReport` tool. Backend: `convex/banking/reportsCore.ts` (pure), `reports.ts`, `savedReports.ts`; UI: `src/components/banking/reports/`.
- **M2 — Forecasting**: see `forecasting.md` (dedicated plan, FC1–FC12; Pro-gated `/app/forecast`, per-account engine, nine life-event kinds, multi-scenario + compare, Analyst unification with the legacy FIRE core deleted).
- **M3 — Goals 3.0**: `/app/goals` with Save up (money boxes: withdrawals/spend-from-goal via `moneyBoxContributions.kind`, on-track/ahead/behind projection with optional growth rate in `buildMoneyBoxFundingPlan`, settings mutation) and Pay down (facility payoff schedules, debt-free date, avalanche/snowball/planned calculator with extra-monthly and lump-sum simulation on `debtPayoffCore`). Backend: `convex/banking/planning.ts`, `planningMath.ts`, `payDown.ts`; UI: `src/components/banking/goals/`.
- **M4 — Transaction enrichment**: `transactionTags` table + `tagIds`/`hiddenFromReports`/`note` on transactions; tag CRUD + per-transaction and bulk meta mutations (`convex/banking/transactionMeta.ts`); category rules extended with add-tags/hide actions applied across manual/provider/CSV import paths; reports exclude hidden rows and filter by tags (saved reports persist tag filters); UI in transaction detail/table/bulk actions, rule form, reports filter bar.

Out of scope (deliberate): investment holdings/securities, credit score, Bill Sync, business tracking/Schedule C, household collaboration, flex/group budgeting, FX conversion, transaction splits/attachments/review status.

## Current Verification Evidence

- 2026-07-19: plan approved (user decisions: Forecasting Pro-gated; M4 in scope; goals in a new `/app/goals` route). Shared schema/validators/entitlements pre-steps landed by the reviewing agent before each wave; all implementation waves executed by nested claudex sessions with strict per-file ownership.
- 2026-07-20: all phases implemented across 6 waves (3 parallel backend, then UI waves). Final combined verification: `npm run test` → 76 files, 507 tests passed; `npm run lint` (tsc + eslint, zero warnings) green; `npm run build` green with 40 user-docs pages validated (new EN/IT pages: reports, forecasting, goals; transactions/reports pages extended).
- Known limits recorded: money-box withdrawal transaction linking has backend support but no UI picker; `invalidEvents.reason` strings are backend-English; pre-existing npm audit findings (workos authkit, hono/ws via convex) are unrelated to this work.
