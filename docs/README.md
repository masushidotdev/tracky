# Tracky Docs

This directory is the repository-readable map for the banking and budgeting app.
Keep durable product decisions and architecture here so future Codex runs can
resume from source-controlled context instead of chat history.

## Index

- `architecture.md` - domain boundaries, backend/frontend responsibilities, and provider isolation.
- `deployment.md` - staging and production deploys, wrangler environments, secrets, custom domain, and the shared-backend caveat.
- `enable-banking-transaction-shapes.md` - sanitized live-payload audit and transaction counterparty mapping precedence.
- `decisions/0001-mvp-assumptions.md` - current MVP assumptions made after the grill-me questions.
- `decisions/0002-credit-facilities.md` - credit facilities, loan amortisation, settlement accounts, and contractual payoff rules.
- `decisions/0003-harness-engineering.md` - repository-readable harness practices and documentation invariants.
- `decisions/0004-planned-expense-occurrence-payments.md` - occurrence-scoped planned-transaction payments and conservative reconciliation.
- `decisions/0005-analyst-agent-rebuild.md` - Convex-native Analyst threads, resumable streaming, and approval-gated writes.
- `decisions/0006-data-deletion-and-export.md` - deletion-request boundaries, JSON v1 exports, and seven-day expiry.
- `decisions/0007-multi-kind-categories.md` - shared category identity, compatible transaction kinds, and localization.
- `decisions/0008-money-boxes-as-virtual-accounts.md` - money boxes as virtual account views and non-liquidity Plan reserves without double-counting balances.
- `decisions/0009-zero-based-plan.md` - zero-based Plan, global category partitioning, observed cash liquidity, card-payment revision, and legacy Budget removal.
- `decisions/0010-plan-double-counting-invariants.md` - independently attributed Plan terms, cash/card liquidity boundary, debt netting, and non-carrying reserves.
- `decisions/0011-materialised-scheduled-transactions.md` - scheduled rows as transaction records, promotion, reconciliation, and consumer status checks.
- `decisions/0012-unified-planned-transactions.md` - one stored model for planned movements with legacy API compatibility.
- `decisions/0013-loans-adopt-paired-plan-buckets.md` - paired loans reuse user Plan buckets instead of generating duplicate funding rows.
- `decisions/0014-cross-month-plan-transfers.md` - confirmed in-plan cash transfers stay neutral across booking months while their fee remains activity.
- `decisions/0015-account-deletion-cancel.md` - reversible account deletion requests without promising an unimplemented erasure pipeline.
- `decisions/0016-analyst-env-gating.md` - default-off build-time Analyst frontend gate and localized disabled route.
- `decisions/0017-default-category-seeding.md` - default category seeding at profile creation and bootstrap self-heal.
- `decisions/0018-deploy-environments.md` - shared dev/staging Convex deployment, production deployment, WorkOS profiles, Cloudflare workers, and the gitignored wrangler config.
- `decisions/0019-devtools-dev-only.md` - TanStack devtools behind a dev-only lazy gate so production builds never ship the panel.
- `decisions/plan-effective-origin.md` - effective plan origin and pre-origin liquidity reconciliation.
- `execution-plans/banking-mvp.md` - active execution plan and verification checklist.
- `execution-plans/credit-card-and-financing-planning.md` - card-cycle and financing planning implementation.
- `execution-plans/card-statement-auto-close.md` - automated card-statement closing, facility editing, and live Planning projection.
- `execution-plans/planning-cashflow-cycle-preferences.md` - planning cashflow cycle preferences and projected balances.
- `execution-plans/planning-overdrafts-and-transfers.md` - overdraft-backed availability and planned internal transfers.
- `execution-plans/planning-transfers-card-source.md` - card-funded planned transfers, inline editing, modal creation, and Planning panel updates.
- `execution-plans/planning-bank-statement-view.md` - bank-statement cashflow tables, money-box cards, and per-facility credit commitments.
- `execution-plans/money-box-accruals.md` - dedicated money-box forms, account associations, contribution actions, and informational cashflow accrual rows.
- `execution-plans/money-box-transfer-associations.md` - unmatched transfer associations, money-box destinations, virtual account rows, and contribution history.
- `execution-plans/safe-to-spend-money-box-funding.md` - cycle-stable money-box funding, contribution-aware safe-to-spend, and account scoping.
- `execution-plans/dashboard-redesign.md` - account-scoped dashboard availability, net worth, projections, and upcoming payments.
- `execution-plans/overdraft-derived-usage.md` - linked-account balance derivation and mutation/UI enforcement for overdraft usage.
- `execution-plans/account-management-hidden-accounts.md` - user-hideable accounts and the account management panel.
- `execution-plans/accounts-connect-bank-sheet.md` - on-demand bank connection and deferred import history on the accounts page.
- `execution-plans/analyst-agent-rebuild.md` - Analyst agent MVP, proactive follow-ups, and verification evidence.
- `execution-plans/user-docs-section.md` - authenticated bilingual user documentation, search, content truth, and verification.
- `execution-plans/pmf-gap-analysis-roadmap.md` - PMF report gap analysis and prioritized roadmap (CSV import, safe-to-spend, reminders, FIRE, entitlements, privacy, asset accounts).
- `execution-plans/forecasting.md` - Monarch-style per-account forecasting engine, scenarios, life events, and `/app/forecast` UI architecture.
- `execution-plans/monarch-parity-roadmap.md` - Monarch gap analysis phases M1-M4: reports, forecasting, goals 3.0, transaction tags/notes.
- `execution-plans/ynab-plan-redesign.md` - YNAB-style zero-based Plan: shared activity policy, plan buckets over the global taxonomy, targets, auto-assign, drag-and-drop.
- `execution-plans/plan-scrolling-layout.md` - viewport-bounded Plan grid and inspector scroll behavior modeled on YNAB.
- `execution-plans/plan-snapshot-cache-correctness.md` - snapshot cache rebuilds, truncated-month safety, deprecated payload removal, and mutation invalidation.
- `execution-plans/card-statement-balance-reference-date.md` - reference-date-aware card statement registration, balance previews, positive-balance guard, and legacy correction.
- `execution-plans/card-statement-cycle-separation.md` - separation of total card debt from unbilled statement usage and guarded cycle repair.
- `execution-plans/plan-installment-buckets.md` - active installment commitments as protected Plan buckets, repayment reconciliation, and due-date priority.
- `execution-plans/card-installment-debt-coverage.md` - active card-linked instalment outstanding offsets the card bucket need without changing Plan liquidity.
- `execution-plans/card-installment-facility-usage.md` - manual card-balance conversion and installment-aware facility availability.
- `execution-plans/legacy-card-installment-balance-migration.md` - idempotent repair of legacy manual-card debt still duplicated in active installment plans.
- `execution-plans/plan-money-box-buckets.md` - user-linked money boxes as non-carrying pre-funded Plan bucket reserves.
- `execution-plans/enable-banking-transaction-mapping.md` - provider response capture, mapping audit, backfill, and live sync verification.
- `execution-plans/bank-sync-dispatch-cadence.md` - frequent due-account dispatch with a separate six-hour provider cadence.
- `execution-plans/multi-kind-default-categories.md` - neutral system categories, compatibility rollout, localization, and data backfill.
- `execution-plans/custom-category-management.md` - protected custom-category editing, safe deletion, and the visual transaction picker.
- `execution-plans/transaction-row-classification-icons.md` - compact transaction classification icons and source-leg category assignment for matched transfers.
- `execution-plans/hide-balances.md` - header privacy toggle that masks balances and derived amounts everywhere except individual transaction rows.
- `execution-plans/plan-effective-start-date.md` - effective day-level Plan origin, Fresh Start action, and compatibility migration.
- `execution-plans/plan-overdraft-visibility.md` - numeric overdraft and remaining-facility visibility in the Plan header plus cash/credit overspending row semantics.
- `execution-plans/plan-card-activity-and-custom-target-intervals.md` - covered card purchase drill-down and interval-aware repeating custom targets.
- `execution-plans/system-bucket-targets-and-overdraft-progress.md` - user targets on protected card/instalment buckets plus informational overdraft progress and payoff pace.
- `execution-plans/enable-banking-sync-reliability.md` - lookback sync window for late-booked rows, future-date cursor clamp, error-state retry backoff, and the lost-transaction backfill.
- `execution-plans/navigation-ledger-loans-and-planning-consolidation.md` - executed shell, ledger, loan, scheduled-transaction, planning-storage, and money-box conversion work with live-data findings.
- `execution-plans/ledger-recurring-planned-occurrences.md` - next unpaid recurring-rule projections in the ledger without synthetic transaction behavior.
- `execution-plans/plan-cross-month-transfers.md` - cross-month confirmed cash-transfer normalization, fee attribution, and regression verification.
- `execution-plans/public-repository-governance.md` - public repository governance: branch rulesets, merge settings, fork workflow approval, and security configuration.

## Harness Notes

Durable architecture, decisions, execution plans, and verification evidence
belong in this directory so future agent runs can resume from repository state
instead of relying on chat history.

`convex/knowledge-base.test.ts` enforces that durable docs stay indexed and that
decision and execution-plan records keep explicit status metadata.
