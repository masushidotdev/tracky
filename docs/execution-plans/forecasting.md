# Forecasting Feature — Implementation Architecture (Monarch-style, EU/single-user)

Status: in_progress — FC1–FC12 task breakdown below; schema + entitlement key landed as shared pre-step.
Owner: coding agents (claudex implementation, Claude spec/review/verification).

## Decisions (answers to design questions)

### a) Engine: new pure core, monthly internal loop, yearly output

**New `convex/forecast/forecastCore.ts`; do NOT extend `longTermProjectionCore`.**
Rationale: the state model is fundamentally different — a vector of per-account states
(each with its own growth/contribution/amortization) + typed life events + withdrawal
cascade + capital-gains gross-up vs the existing 2-bucket scalar model. Extending the
old core would break the Analyst tool contract mid-flight and produce one unreadable
function. Instead:

- Extract the scaled-bigint helpers (`roundedDivide`, `multiplyScaled`,
  `monthlyRateScaled`, `applyMonthlyRate`, `percentScaled`, `amountAtPercent`,
  `ratioPct`, `monthEndIso`, RATE_SCALE/PERCENT_SCALE) from
  `convex/analyst/longTermProjectionCore.ts` into a shared
  `convex/forecast/projectionMath.ts`; `longTermProjectionCore` imports them
  (behavior-identical refactor, protected by existing
  `convex/analyst/long-term-projection.test.ts`).
- Liabilities: export `monthlyInterest(balanceMinor, annualRateBps)` from
  `convex/analyst/proactive/debtPayoffCore.ts` and reuse it in a small
  `convex/forecast/liabilityMath.ts` (single-liability amortization step: accrue
  interest, apply fixed payment, detect payoff month, negative-amortization warning).
  Do not call `computePayoffPlan` (it is a multi-debt avalanche/snowball allocator —
  wrong shape here). `convex/banking/creditMath.ts` untouched.
- **Monthly internal loop, yearly checkpoints** (Monarch-style rows). Monthly is
  required for correct liability amortization and mid-year event starts; yearly rows
  emitted at each calendar Dec-31 plus a final partial row, so "year 1 prorated from
  today" falls out naturally (first checkpoint covers today → Dec 31).
- Determinism: same RATE_SCALE=1e12 fixed-point bigint math; accounts iterated in
  stable (sorted-by-id) order; no floats in money paths (pct inputs converted once
  to scaled bigints, mirroring the existing core).

**Engine model (`projectForecast(params, {startDate})`):**

- Inputs: currency; birthYear; endAge (default 90); inflationAnnualPct (default 3);
  accounts `[{id, kind: asset|liability, balanceMinor, growthAnnualPct,
contributionYearlyMinor?, liability?: {annualRateBps, paymentMonthlyMinor,
includedInLivingExpenses}}]`; incomeSources `[{id, name, monthlyMinor, change:
inflation|customPct(x)|fixed}]`; livingExpenses `{monthlyMinor, change}`;
  extraSavings `{growthAnnualPct (default 3), splits: [{accountId, pct}] }`;
  withdrawal `{capitalGainsTaxPct (default 26)}`; events (typed union, below).
- Monthly step: (1) grow asset balances; (2) liability step via liabilityMath —
  payment is inside living expenses while `includedInLivingExpenses` and frees into
  surplus at payoff, otherwise an explicit outflow; (3) apply per-account
  contributions (yearlyMinor/12) as transfers out of cash flow into the account;
  (4) net = income − living expenses − explicit debt payments − contributions ±
  event flows; (5) surplus → "Extra savings" virtual account (own growth rate) then
  cascade splits into real accounts; deficit → withdraw extra savings → cash
  accounts → investment accounts, grossing up investment withdrawals by
  `1/(1 − taxPct)` for capital gains (IT default 26%, simple Monarch-style model,
  no US buckets); (6) event triggers at month indexes derived from age/year, with
  amounts stated in today's money multiplied by the cumulative inflation index at
  the event start.
- Output: `yearly: [{calendarYear, age, date, accounts: [{id, endBalanceMinor}],
netWorthMinor, annualIncomeMinor, annualExpensesMinor, annualSavingsMinor,
deflatorScaled}]` + `events: [{monthIndex, kind, label}]` markers +
  `retirement: {age, monthIndex, netWorthMinor}` + `finalNetWorthMinor` +
  `depletedMonthIndex?` + normalized assumptions echo. `deflatorScaled`
  (cumulative inflation, RATE_SCALE) lets the client render the today's-dollars
  toggle by pure division — no second engine run.
- Life-event union (discriminated `kind`): `retirement {age, expensePct,
extraYearlyExpensesMinor, incomeReductionPct}`, `pension {startAge,
monthlyBenefitMinor}`, `buyHome {year, priceMinor, mode: cash|finance,
downPaymentMinor, mortgageYears, mortgageRateBps, recurringCostsAnnualPct}`
  (creates a synthetic property asset + mortgage liability inside the run),
  `haveKid {year, monthlyCostMinor, untilAge}`, `careerBreak {startYear, endYear,
incomeReductionPct}`, `newJob {year, newMonthlyIncomeMinor}`, `otherIncome` /
  `otherExpense {startYear, amountMinor, recurring?: {intervalYears, endYear}}`,
  `endOfPlan {age}`.

### b) Schema (additive; separate child tables per Convex 1MB/array guideline)

New tables in `convex/schema.ts`:

- `forecastScenarios`: `userId`, `name`, `icon`, `color`, `sortOrder`, `currency`,
  `inflationAnnualPct`, `endAge`, `livingExpenses: {amountMonthly:
moneyAmountValidator, changeMode, customPct?}`, `extraSavings: {growthAnnualPct,
splits: v.array({accountId, pct})}` (bounded, ≤20 — safe to embed),
  `capitalGainsTaxPct`, `createdAtMs`, `updatedAtMs`.
  Indexes: `by_userId_and_sortOrder`, `by_userId`.
- `forecastAccountAssumptions` (separate table: N accounts × M scenarios, per-row
  sheet edits shouldn't rewrite the scenario doc): `userId`, `scenarioId`,
  `target: v.union({kind:'account', accountId}, {kind:'creditFacility',
creditFacilityId})`, `included: boolean`, `growthAnnualPct?`,
  `contributionYearly?: moneyAmountValidator`, `liability?: {annualRateBps?,
paymentMonthly?: money, includedInLivingExpenses: boolean}` (null fields =
  "live from creditFacilities at projection time"). Indexes: `by_scenarioId`,
  `by_userId`.
- `forecastIncomeSources`: `userId`, `scenarioId`, `name`, `amountMonthly: money`,
  `changeMode: inflation|customPct|fixed`, `customPct?`, `sortOrder`. Index
  `by_scenarioId_and_sortOrder`.
- `forecastLifeEvents`: `userId`, `scenarioId`, `enabled: boolean`, discriminated
  `event:` union validator matching the engine union (amounts via
  moneyAmountValidator). Index `by_scenarioId`.
- `userSettings` additive field: `forecastProfile: v.optional(v.object({birthYear:
v.number(), defaultRetirementAge: v.number(), onboardingCompletedAtMs:
v.optional(v.number())}))` — birth year is user-level, not per-scenario.

**Derived at query time (never stored):** projection results, current account
balances, seeded defaults, deflators. **Stored:** only assumptions/overrides.
Compare-mode selection = client route search params, not persisted.

### c) Function surface + seeding + live refresh

`convex/forecast/scenarios.ts` (all public fns `requireAuthUser`, ownership-checked,
no userId args):

- Queries: `listScenarios` (`.withIndex(by_userId_and_sortOrder).take(50)`),
  `getScenario({scenarioId})` → scenario + accountAssumptions + incomeSources +
  lifeEvents (bounded `.take`s).
- Mutations: `initializeForecast(onboarding args)` (recomputes seeds server-side,
  applies user tweaks, creates default scenario + children; idempotent — no-op if a
  scenario exists), `updateScenario`, `duplicateScenario` (copies children),
  `deleteScenario` (batch-deletes children with `.take(n)` loops),
  `reorderScenarios`, `upsertAccountAssumption`, `upsertIncomeSource`,
  `deleteIncomeSource`, `upsertLifeEvent`, `deleteLifeEvent`,
  `updateForecastProfile`.

`convex/forecast/seeds.ts` (internal helpers, shared by onboarding prefill query +
init mutation): income sources from last 12 complete months of actual income
transactions (grouped/named), living expenses = 12-month average of expense actuals,
per-account growth defaults by accountType (SVGS 2, INVS 7, CACC 0, ASST 3, vehicle
subtype −15), liabilities seeded from `creditFacilities`
(annualNominalRateBps, installment plan monthly payments). Public query
`getForecastSeeds` for the onboarding UI prefill.

`convex/forecast/projection.ts`:

- Public query `getProjection({scenarioId})`: entitlement check first (feature key
  `forecast.scenarios` added to `convex/lib/entitlements.ts` FEATURES; return
  `{upgradeRequired: true}` shape like the FIRE tool), then loads scenario config +
  **live current balances** (reuse the accountsOverview internal helper the Analyst
  baseline uses) + live creditFacility rates/payments for null overrides, builds
  engine params, runs `projectForecast`, returns minor-unit bigints. Because it
  reads balances inside the query, Convex reactivity refreshes the projection
  whenever synced data changes — nothing to invalidate.
- Internal query `getProjectionForUser({userId, scenarioId?})` (active = lowest
  sortOrder when omitted) for the Analyst tool, registered in
  `convex/analyst/functionRefs.ts`.

Analyst tool: `convex/analyst/tools/forecast.ts` (`createTool`, pro-gated same as
longTermProjection, converts to major units for the model).

### e) Reuse vs deprecate

Single source of truth wins. Phasing: V1 leaves `longTermProjectionCore` untouched
(minus the math extraction). V2 final task rebuilds the Analyst FIRE tool on
`projectForecast` — when the user has no scenario, the tool builds a default
in-memory param set from the existing baseline query (2 synthetic accounts), so tool
behavior degrades gracefully; SWR/FIRE-target math moves into a thin adapter in the
tool. Then delete `longTermProjectionCore.ts` + its two test files (per repo policy:
delete old paths; the tool's public contract is the AI tool description, which the
adapter preserves).

## d) Task breakdown

Conventions per task: Conventional Commit, `pnpm lint && pnpm test && pnpm build`
green, convex-test/vitest files listed. IDs FC1–FC12.

### V1 — engine + schema + basic UI + one default scenario

**FC1 — shared projection math extraction** (deps: none)

- New: `convex/forecast/projectionMath.ts` (helpers + scales moved verbatim).
- Mod: `convex/analyst/longTermProjectionCore.ts` (import shared helpers),
  `convex/analyst/proactive/debtPayoffCore.ts` (export `monthlyInterest`).
- Tests: new `convex/forecast/projection-math.test.ts` (rounding, negative values,
  rate conversion edge cases); existing `long-term-projection*.test.ts`,
  `debt payoff` tests stay green unchanged.
- Accept: pure refactor, no behavior change anywhere.

**FC2 — forecastCore engine, assets + cash flow** (deps: FC1)

- New: `convex/forecast/forecastCore.ts` — types, normalization/validation, monthly
  loop with per-account growth, income sources with per-item change modes, living
  expenses + inflation, contributions, surplus → extra savings + splits, deficit
  withdrawal order + capital-gains gross-up, yearly checkpoints + deflator,
  depletion detection. No liabilities/events yet (params accepted, validated,
  engine throws "not implemented" or simply excluded from this task's surface).
- Tests: `convex/forecast/forecast-core.test.ts` — determinism, single-currency
  enforcement, prorated first year, growth compounding vs closed-form, split
  cascade sums, withdrawal order, gross-up math, deflator correctness.
- Accept: pure module (no Convex imports), all invariants asserted.

**FC3 — liabilities in engine** (deps: FC2)

- New: `convex/forecast/liabilityMath.ts`.
- Mod: `forecastCore.ts` — liability accounts amortize; `includedInLivingExpenses`
  frees payment into surplus at payoff month; payoff month reported.
- Tests: `convex/forecast/forecast-liabilities.test.ts` — amortization vs known
  schedule, payoff-frees-payment behavior, negative-amortization warning, zero-rate
  loans.

**FC4 — schema + entitlements** (deps: none, parallel with FC2)

- Mod: `convex/schema.ts` (4 tables above + userSettings.forecastProfile),
  `convex/lib/entitlements.ts` (+`forecast.scenarios` key),
  `convex/lib/validators.ts` if a shared event validator helper is cleaner.
- Tests: extend `convex/entitlements.test.ts`; `convex/forecast/forecast-schema.test.ts`
  (insert/roundtrip of each event kind via convex-test).
- Accept: additive only; `npx convex dev` typechecks.

**FC5 — seeds + scenario CRUD** (deps: FC4)

- New: `convex/forecast/seeds.ts`, `convex/forecast/scenarios.ts`.
- Mod: none outside forecast/.
- Tests: `convex/forecast/forecast-scenarios.test.ts` — seeding from fixture
  transactions/accounts/facilities, idempotent init, duplicate copies children,
  delete cascades in batches, reorder, ownership isolation (user B cannot read/edit
  user A), auth required.

**FC6 — projection query + Analyst internal ref** (deps: FC3, FC5)

- New: `convex/forecast/projection.ts`.
- Mod: `convex/analyst/functionRefs.ts` (register internal ref).
- Tests: `convex/forecast/forecast-projection.test.ts` — live-balance pickup
  (change a balance snapshot, projection changes), null-override falls back to
  creditFacility rate, free-tier gets `{upgradeRequired:true}`, pro gets result.

**FC7 — UI V1: route, onboarding, chart, sidebar, account sheet** (deps: FC6)

- New: `src/routes/_authenticated/_app/app/forecast.tsx`,
  `src/components/app/forecast/forecast-view.tsx` (container) + presentational
  children: `forecast-onboarding.tsx` (birth year, retirement age, account
  include/exclude, income confirm — from `getForecastSeeds`),
  `net-worth-chart.tsx` (recharts via `src/components/ui/chart.tsx`, event markers,
  hover tooltip), `forecast-stats-bar.tsx` (StatCard row: net worth EOY / at
  retirement / retirement age / at end), `assumptions-sidebar.tsx`,
  `account-settings-sheet.tsx` (DetailSheet), today's-vs-future toggle (client-side
  deflator division).
- Mod: `src/lib/navigation.ts` (+ `nav.forecast`, TrendingUpIcon),
  `src/lib/i18n.tsx` (EN/IT keys), upgrade gating via existing
  `src/components/app/upgrade-cta.tsx`.
- Accept: free tier sees upgrade CTA; pro completes onboarding → sees chart/stats;
  edits in sidebar/sheet reactively re-project. AppPage shell + Amount everywhere.

**FC8 — year-by-year table (Accounts / Cash Flow tabs) + docs/changelog** (deps: FC7)

- New: `src/components/app/forecast/year-table.tsx`.
- Mod: changelog, `docs/execution-plans/forecasting.md` (this plan, statused),
  user docs content collection entry.
- Accept: horizontal-scroll-safe table, per-account yearly balances tab + cash-flow
  tab (income/expenses/savings), i18n complete. **V1 ships here.**

### V2 — full life events, scenarios compare, onboarding polish, Analyst unification

**FC9 — life events: engine + CRUD + editor UI + markers/Events tab** (deps: FC8)

- Mod: `forecastCore.ts` (all event kinds incl. buyHome synthetic asset+mortgage,
  pension, retirement semantics), `scenarios.ts` (event CRUD already schema'd),
  forecast UI (+ `life-event-sheet.tsx` per-kind forms, chart markers, Events tab
  in year table).
- Tests: `convex/forecast/forecast-events.test.ts` — each kind, inflation applied
  to today's-money amounts at event start, buyHome cash vs finance, endOfPlan
  truncation, event enable/disable.

**FC10 — multiple scenarios + compare two** (deps: FC8)

- Mod: forecast UI — scenario switcher (name/icon/color), create/duplicate/
  reorder/delete, compare mode via route search params: two `getProjection` calls,
  overlay chart + stat deltas.
- Tests: component-light; backend already covered (duplicate/reorder in FC5).
- Accept: exactly-two compare, deltas at EOY/retirement/end.

**FC11 — onboarding polish** (deps: FC9)

- Mod: multi-step onboarding (income sources editor step with add/rename/split,
  expense baseline override step, retirement age visual), re-runnable from
  settings ("reset forecast").

**FC12 — Analyst on the new engine, delete old core** (deps: FC9)

- New: `convex/analyst/tools/forecast.ts` (reads active scenario via
  `getProjectionForUser`).
- Mod: rewrite `convex/analyst/tools/longTermProjection.ts` as adapter over
  `projectForecast` (default in-memory scenario from baseline when none saved;
  SWR/FIRE target computed in adapter); register forecast tool in agent toolset.
- Del: `convex/analyst/longTermProjectionCore.ts`,
  `convex/analyst/long-term-projection.test.ts` (assertions ported to adapter
  tests where still meaningful).
- Tests: `convex/analyst/forecast-tool.test.ts` + updated
  `long-term-projection-tool.test.ts`.
- Accept: single engine; Analyst FIRE answers still gated + sane on fixture data.

## Notes / risks

- Single currency per scenario (scenario.currency, seeded from primary); accounts in
  other currencies excluded at projection time with a surfaced notice — consistent
  with app-wide "per-currency, no FX".
- Projection query cost: monthly loop × 90-year horizon × ~20 accounts is trivial
  CPU; the read set (accounts + latest balances + facilities + scenario children)
  is bounded and indexed, so reactive recompute is cheap.
- `getProjection` returns bigint minors (v.int64) — client already renders via
  `<Amount>`; Analyst tool converts to major numbers like the existing tool.

## Current Verification Evidence

- 2026-07-19: architecture approved as part of the Monarch parity roadmap (plan-mode session; Explore + Plan agent design verified against code). Shared pre-step landed: `forecastScenarios`/`forecastAccountAssumptions`/`forecastIncomeSources`/`forecastLifeEvents` tables + `userSettings.forecastProfile` in `convex/schema.ts`, `forecastLifeEventValidator`/`forecastChangeModeValidator` in `convex/lib/validators.ts`, `forecast.scenarios` feature key in `convex/lib/entitlements.ts`. FC1+ implementation pending.
- 2026-07-20: FC5/FC6 completed in `convex/forecast/seeds.ts`, `scenarios.ts`, `projection.ts`, `forecast-scenarios.test.ts`, and `forecast-projection.test.ts`; 17 new API tests pass, scoped forecast + architecture verification passes 40/40, full suite passes 478/478, and `npm run lint` is green.
- 2026-07-20: FC7/FC8 completed with the Pro-gated `/app/forecast` onboarding, projection chart and stats, today/future-euros views, scenario and per-account assumption editors, year tables, navigation, EN/IT docs, and changelog; `npm run lint`, all 489 tests, and `npm run build` pass.
- 2026-07-20: FC9 completed — all nine life-event kinds implemented in `forecastCore.ts` (incl. buyHome synthetic home asset + amortizing mortgage, retirement income/expense/contribution semantics, EU pension, recurring other income/expense with per-occurrence inflation adjustment, endOfPlan truncation); `projection.ts` maps stored enabled events into the engine with per-event pre-validation (`invalidEvents` reported, not fatal) and returns chart markers. `convex/forecast/forecast-events.test.ts` added; forecast suite 54 tests green with architecture invariants.
- 2026-07-20: FC12 completed — interactive-only `getForecast` reads the active saved scenario in compact major units, `longTermProjection` now adapts the baseline and legacy input/output contract to `projectForecast`, and the legacy core plus pure-core test were deleted. Analyst + forecast + architecture verification passes 178/178, the full suite passes 507/507, `npm run lint` and FC12 Prettier checks are green, and no `longTermProjectionCore` reference remains under `convex/` or `src/`.
