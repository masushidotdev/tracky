# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Self-hosting guide article (EN/IT)**: Added a bilingual blog article on running Tracky with Docker Compose (setup script, WorkOS requirement, first sign-up backfill, reverse proxy, upgrade, backup, no telemetry), with its own OG image and sitemap entries.
- **One-time `signup_completed` onboarding milestone**: Added idempotent `signupAtMs` tracking on `userSettings.onboardingMilestones` (`userSettings.claimSignupMilestone`) and consent-gated, self-host-silent emission in `OnboardingMilestoneFlusher` (`{ surface: 'app_bootstrap' }`) to complete the `signup -> first import -> first budget` funnel without emitting false signups for pre-existing accounts with data.
- **README status badges**: Added CI, MIT license, latest release, and GitHub stars badges to `README.md`.

## [0.1.0] - 2026-11-24

First public tagged release of Tracky, covering the initial public release (`654561d`, 2026-09-15) through PR #64.

### Added

#### Plan, Budgeting & Goals

- **Zero-based Plan**: Replaced category budgets with a zero-based Plan workflow (automatically converting existing category budgets into Plan assignments), featuring Ready to Assign, Assigned, Activity, Available, focused views (underfunded, overspent, snoozed targets, money available, hidden), an Edit Plan mode (drag-and-drop and keyboard reordering, rename/add/hide/delete, multi-row bulk actions), a multi-plan switcher in the header (Pro required for more than one plan), and post-creation account-perimeter editing.
- **Plan targets & Auto-Assign**: Added weekly, monthly, yearly, and custom bucket targets with set-aside, refill, balance-by, and monthly snooze behavior, Cost to Be Me vs. expected income, and preview-before-confirmation Auto-Assign strategies for targets, history, and resets.
- **Credit cards, instalments & money boxes in the Plan**: Modeled credit cards with YNAB-style payment buckets in a dedicated Card payments group (showing the next scheduled charge date and moving covered card spending into the payment bucket rather than subtracting card debt from Ready to Assign), added per-plan instalment buckets, enabled pairing a loan directly with an existing Plan category without creating a duplicate row, and added money-box pre-funding links.
- **Goals (`/app/goals`)**: Added savings-target cards with on-track/ahead/behind/completed status, contribution/withdrawal activity, growth/spending settings, per-currency debt payoff projections with expandable charts, and an interactive avalanche/snowball/planned-order payoff calculator.
- **Off-balance goal conversion**: Enabled one-step conversion of off-balance savings goals into real accounts (turning bank-backed contributions into transfers and manual entries into the opening balance, while blocking conversion of in-account reminder goals to avoid double counting).

#### Accounts, Loans, Credit & Assets

- **Mortgages and loans**: Updated Add Account to ask for account type first (cash, credit, mortgage, car loan, or personal loan) with balance, optional original principal, interest rate, instalment, escrow/fees, optional contractual payoff date (supporting variable-rate fixed-capital schedules), and settlement account. Added dedicated loan pages with payoff chart, remaining balance, repayment progress, paired Plan category, and payment history; sidebar Loans group; Cash Flow routing to the debited account; single-counted net worth; and bidirectional conversion between instalment contracts and loans.
- **Manual accounts & asset tracking**: Added plain Cash accounts, first-class manual credit card (`CARD`) accounts (purchase-date expenses, auto-matched transfers, derived credit-line usage, statement settlement via "Confirm charge" and "Mark as internal (liability payment)"), and manual asset accounts (`SVGS`, `INVS`, `ASST`) with balance snapshots and dedicated net-worth bucketing (`cash + assets − debts`).

#### Ledger, Cash Flow, Reports & Forecast

- **Full-ledger sorting, unified filtering & bulk actions**: Replaced toolbar filter boxes with a single smart filter field (account, category, payee, date, amount thresholds) and full-dataset column sorting across the most recent 5,000 transactions (disclosing when that limit is exceeded), with URL-persisted state and a bottom bulk-action bar (category, tags, report visibility, classification, transfer/money-box unlinking, manual deletion, Escape to clear).
- **Scheduled transactions band & inline entry**: Added a collapsible Scheduled transactions band above booked ledger rows (including next-occurrence previews for recurring planned items and a reconciliation panel matching arriving bank transactions) and inline movement creation at the top of the ledger with "Save and add another".
- **Transfer & money-box actions**: Added "Create matching transfer" for manual counterpart legs, "Unlink transfer" (re-deriving classification and reopening settled card statement cycles), and "Unlink money box" (rolling back the saved amount so linked transfers can be deleted).
- **Transaction metadata & icons**: Added colored tags (up to 10 per transaction), 500-character private notes, hide-from-reports visibility (individually, in bulk up to 100 rows, or via categorization rules), tag filters in Reports, and searchable access to all 1,962 Lucide icons for categories (lazy-loaded beyond default suggestions).
- **Browser-side CSV import**: Added an Import page for manual accounts that parses bank CSV exports in the browser with guided column mapping, four date formats, decimal comma/point support, duplicate/error preview badges, automatic category-rule assignment, and idempotent re-imports via per-row dedupe keys.
- **Safe-to-spend & Cash Flow**: Added a per-currency Safe-to-spend dashboard KPI card (daily pace, commitment breakdown sheet, and Analyst `getSafeToSpend` tool), bank-statement-style Cash Flow tables with planned income/expenses/transfers (including transfers from card credit lines), recurring income suggestions, non-destructive suppression of booked planned items, redesigned money-box cards/dialogs, and deduplicated bill due-date reminders with configurable lead days and optional email/Telegram delivery.
- **Reports (`/app/reports`)**: Added cash-flow, spending, and income views with per-currency summaries, Sankey/breakdown/trend charts, account/category/tag/date/amount filters, transaction drill-down, saved reports, aggregated CSV export, and an Analyst read tool.
- **Pro Forecast (`/app/forecast`)**: Added multi-income onboarding, expense baseline overrides, reactive net-worth projections, nine life-event editors with chart markers and validation diagnostics, multiple customizable scenarios with two-scenario comparison and signed deltas, per-account assumptions, today's- vs. future-euros toggle, and reset-to-onboarding.

#### AI Analyst & Calibrated Advisory Layer

- **Analyst 2.0 & Telegram channel**: Built Convex-native persisted threads with resumable streaming, real financial read tools, structured charts/tables/sources, an allowlisted model picker, explicit in-chat approval for write actions, long-term FIRE wealth projections (`longTermProjection`, Pro tier), a durable two-way Telegram Bot channel with one-time linking, user-scoped vector memories, ask-before-you-buy guidance, money-box optimization, bulk recategorization, and bounded proactive automation (daily health scores, spending anomalies, monthly subscription reviews, inbox notifications, and optional plain-text email reports via Resend).
- **Calibrated `jev` decision layer**: Added a bounded advisory layer across transfer arbitration, CSV import triage, subscription monitoring (price increases and potentially forgotten recurring charges), proactive notifications/reports, memory deduplication, and write-guard advice, with confidence thresholds, daily spend caps, and deterministic fallbacks (#33).

#### Settings, Account Erasure, Analytics & Public Site

- **Settings & Free/Pro tiers (`/app/settings`)**: Added profile overview, Free/Pro plan scaffolding (20/day free vs. 100/day Pro Analyst messages; core features unlimited on Free), notification preferences, Telegram linking, Analyst memory management, and daily full JSON data exports (7-day download links).
- **Immediate irreversible account erasure**: Added immediate account deletion from Settings (#47), replacing the earlier cancellable deletion-request flow (#17), with a required exit-reason survey (#51), optional data export first, email confirmation, server-side progress that continues after closing the browser, bounded deletion of financial and Analyst data, best-effort bank-consent revocation, WorkOS sign-in deletion last, a temporary hashed tombstone record, and automatic session cleanup with redirect home (#51).
- **Opt-in PostHog product analytics & error tracking**: Added client-only, EU-hosted PostHog product analytics gated behind an explicit **Accept** consent banner and controllable anytime from Settings → **Usage analytics** (#35), enabled it in production Worker variables (#45), added consent-gated PostHog error tracking with build-time source-map upload and cleanup (#53), and added idempotent first-time onboarding milestone events (`first_csv_import_completed`, `first_plan_created`, `first_transaction_created`, `first_bank_account_connected`) with silent backfill for existing accounts and no-op behavior when analytics is unconfigured (#63).
- **Public marketing site, SEO & branding**: Added bilingual public marketing and SEO pages in English and Italian (`/it/`) covering features, pricing, FAQs, guides, audiences, comparisons, and open-source hosting, with localized metadata, canonical/hreflang tags, JSON-LD, sitemap generation, and page-specific Open Graph assets (#34, #39), plus a unified navigation logo/symbol, multi-format favicons, and a web app manifest (#54).
- **Cloudflare Worker & multi-environment deployment**: Configured Cloudflare Worker deployment with staging (`workers.dev`, gated) and production (`trytracky.app`) environments, separate Convex and WorkOS profiles, Worker observability, and automatic production deploys on push to `main` (#25, #27, #28, #29, #30, #32).

### Changed

- **Authenticated UI redesign ("Ledger ink")**: Redesigned `/app` with warm-paper light and graphite dark surfaces, semantic financial colors, tabular numerals (`Amount`), unified `AppPage` layout, `⌘K` command palette, responsive detail sheets/drawers, loading skeletons, and pending spinners; focused Dashboard as a summary overview.
- **Sidebar organization**: Grouped primary views (Dashboard, Plan, Reports, All Accounts, Cash Flow), moved Forecast/Goals/Subscriptions into a collapsible Tools group, moved Settings/Get Help/Search/Analyst to the footer, added collapsible Cash/Credit/Loans account groups with per-currency totals and single-account ledgers, and renamed Transactions → All Accounts, Future planning → Cash Flow, and Docs → Get Help.
- **Ledger & scheduled transaction semantics**: Split transaction amounts into separate Outflow and Inflow columns with dedicated Payee and Memo columns, transfer counterpart labels, and persisted per-view column widths. Future-dated entries are now saved as scheduled without moving balances or entering reports/cadence until booked, and linked accounts accept scheduled entries that reconcile onto arriving bank rows.
- **Plan month summary transparency**: Replaced residual income calculation with direct summing of income-classified inflows, surfacing an explicit "Unexplained movement" line alongside card cash advances, card credit spending, and cash vs. card overspending.
- **AI Analyst opt-in gating**: Gated the AI Analyst behind `VITE_ANALYST_ENABLED=true` (off by default); when disabled, sidebar and command-palette entries remain hidden and `/app/analyst` shows a localized disabled screen (#22).
- **Category/classification sync & cashflow continuity**: Assigning a category now keeps transaction classification in sync with the category's kind (and vice versa), and Planning future cycles start from the prior cycle's projected ending balance rather than the latest bank snapshot.
- **Backend & Analyst reliability**: Reduced Analyst recovery crons (proactive jobs and Telegram updates) from every minute to every five minutes to lower database I/O; discarded empty optional IDs and sanitized errors in Analyst read tools; waited for all decisions in multi-write approval continuations; tightened proactive anomaly persistence contracts; repaired authenticated profile fields from WorkOS AuthKit during webhook lag; consolidated planned expenses and transfers into `plannedTransactions`; and decomposed large UI panels into shared primitives and presentational modules.

### Fixed

#### Accounts, Loans, Credit & Bank Sync

- **Loan creation validation & scrolling**: Kept the account creation dialog footer visible while scrolling and highlighted missing required loan fields with a remaining count and a "Go to field" jump/focus action (#50).
- **Loan & instalment schedules**: Started loan projections from the next upcoming instalment rather than a past due date, honored custom first payment dates when computing instalment end dates, routed card-linked instalment outflows in Cash Flow to the settlement account, allowed choosing which instalment a linked payment settles (with >15-day mismatch warnings), accepted explicitly linked SDD recurring loan debits, and fixed linking single or multi-plan card instalment debits from the ledger.
- **Overdrafts & balances**: Stopped arranged overdraft limits from inflating balances across the app by using the accounting position everywhere and showing overdraft availability separately; aligned Cash Flow negative-balance warnings to the accounting position; fixed same-millisecond manual balance snapshot ordering; and unified multi-balance selection across Forecast, Analyst, and proactive jobs.
- **Account hygiene & bank sync**: Excluded manual accounts from duplicate-account repair on the Accounts page; fixed nicknamed bankless accounts displaying `undefined` in Cash Flow and pickers; widened bank sync to re-check the past seven days with automatic retry on sync errors; made Enable Banking OAuth callbacks idempotent and serialized via atomic claim (#15); and disabled "Connect a bank" with an inline note when Enable Banking is unconfigured without leaking environment variable names (#24).

#### Plan, Ledger, Forecast, Reports & Subscriptions

- **Plan math & perimeter integrity**: Stopped negative bucket overspending from inflating Ready to Assign; excluded non-plan account spending from plan buckets; resolved card debt and statement-transfer summary discrepancies; preserved assignment history when removing a card from a plan; surfaced hidden, unassigned, and paused accounts cleanly; added card statement registration from payment buckets; fixed historical snapshot rebuilds and cache invalidation; kept external financing instalments as category spending while keeping card-backed instalments internal; computed plan liquidity from latest preferred balances walking backwards up to 12 months; and fixed pre-Plan budget activity/alert accounting.
- **Plan UI & ledger workflows**: Fixed saved target cadence/behavior dropdowns rendering blank on first open and prevented plan refreshes from interrupting edits; allowed internal movements to be marked as spending again; allowed incoming unmatched transfers to associate with a money box as a withdrawal; included future-dated one-off transactions in Cash Flow and Safe to spend; and fixed side panels scrolling forms underneath their own action buttons.
- **Forecast, Reports, Subscriptions & `jev`**: Supported overdrawn current accounts in Forecast projections; validated scenario icons (max 8 characters) and colors (`#rrggbb` or chart palette tokens) on save (#16); normalized and validated subscription names (max 80 characters) and real `YYYY-MM-DD` dates (#20); stopped writing `jev` classification telemetry strings into user transaction memo fields (#37); and fixed Reports queries exceeding Convex's single-pagination-call limit using bounded indexed iteration (#55).

#### Auth, Erasure, Assets & Build

- **Auth bootstrap & query gating**: Waited for WorkOS AuthKit profile sync before mounting protected app queries, with automatic retry and localized fallback (#49, #52), waited for sign-in settlement on Goals, Plan, sidebar, and transactions views, and isolated sidebar query errors.
- **Default category seeding**: Seeded default categories when creating new profiles and automatically repaired existing category-less accounts at sign-in (#23).
- **Account deletion isolation**: Navigated to an isolated deletion-progress route outside the app shell before invoking erasure so reactive app queries do not crash with `deletion_in_progress` (#48).
- **Fonts, devtools, charts & OG build**: Self-hosted Geist Variable (`/fonts/*.woff2`) to prevent production 404s (#46); gated TanStack Devtools behind a dev-only `React.lazy` import (#31); fixed production chart crashes (`TypeError: n is not a function`) via Vite/Rolldown upgrade; fixed the Analyst model picker opening upward in the composer; and made Open Graph image generation hermetic in CI when `OG_BASE_URL` is absent unless `--force` is passed (#38).

### Security

- **Convex Node runtime containment**: Removed all application Convex Node actions after production inspection observed an unpatched managed Node executor (#56). Banking RS256 JWT signing now uses Web Crypto (preserving existing PEM key compatibility and 192-bit OAuth state), Analyst Langfuse telemetry exports OTLP JSON over bounded native HTTPS `fetch`, a pre-build/dev/deploy gate rejects Node directives and verifies standard-runtime bundle compatibility, and internal read-only probes validate deployed crypto and telemetry capabilities without customer data.
- **Node baseline, headers & telemetry privacy**: Required patched Node `>=22.23.4 <23` for local and CI tooling, removed the vulnerable shadcn CLI dependency while retaining its licensed CSS, added CI security auditing (`npm run security:audit`), protected dynamic responses against caching/framing and stack disclosure, suppressed OAuth referrers, constrained banking credential destinations and redirects, and excluded financial prompt/tool/response bodies from optional Analyst telemetry while preserving per-generation attribution with AI SDK 7 (#55).
- **Webhook verification & HTTP headers**: Enforced Resend webhook signature verification before delegation (#13) and added `X-Content-Type-Options: nosniff` across all Convex HTTP routes plus `CSP frame-ancestors 'none'`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer` on the Enable Banking callback page (#19).
- **CodeQL, markdown safety & secret scanning**: Resolved CodeQL alerts by removing modulo bias from Telegram link-code generation (`byte & 31`) and scoping CI workflow permissions to `contents: read` (#21); added regression tests confirming Streamdown neutralizes untrusted markdown links (`javascript:`, `data:`, `vbscript:`) and raw HTML in Analyst messages while moving CI to Node 22 (#14); and hardened CI and pre-commit secret scanning plus GitHub noreply commit hygiene (#18).
- **Authorization, CSV safety & audit remediation**: Rejected foreign `categoryId` values in `createSubscription` and `convertTransactionToSubscription`; neutralized CSV formula injection in report exports by prefixing leading `=`, `+`, `-`, `@`, tab, and carriage-return characters with an apostrophe; and resolved `undici`, `hono`, and `minimatch` npm audit advisories in CI without weakening audit checks (#62).

### Documentation

- Corrected `.env.local.example` references to `.env.example` across `README.md`, `CONTRIBUTING.md`, and English/Italian open-source pages, and recorded local `verify-tracky` verification lessons (#64), building on the project-local `verify-tracky` verification skill (#62).
- Added practical Plan walkthroughs and feature documentation in both English and Italian (`src/content/user-docs/en` and `it`), along with architecture, deployment, and decision records under `docs/`.
- Replaced real observed account figures in repository execution plans and decision records with synthetic example fixtures.

### Dependencies

- Added weekly Dependabot updates and updated dependency families across Node 22-compatible releases, including `streamdown` `2.5.0` → `2.6.0` (#11), `vite` `8.1.5` → `8.3.0` (#9), broad Node 22 updates (#26), security and major framework upgrades including AI SDK 7, Convex components, TanStack, and React (#55), `@cloudflare/vite-plugin`, `wrangler`, `hono`, and ESLint/minimatch security updates (#62), and `svix` `2.8.0` → `2.10.0` (#57).

[Unreleased]: https://github.com/masushidotdev/tracky/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/masushidotdev/tracky/releases/tag/v0.1.0
