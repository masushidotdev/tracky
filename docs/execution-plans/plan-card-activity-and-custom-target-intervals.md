# Plan card activity and custom target intervals

Status: implemented and verified.

## Scope

- Make card payment bucket activity explain both covered card purchases and statement payments without conflating them.
- Add optional custom target repeat intervals in months or years while preserving legacy targets that do not store an interval.

## Assumptions

- Money remains represented as `bigint` minor units and plan currency remains EUR.
- Covered purchase rows are derived from the same monthly allocation that produces `coveredCardSpendMinor`.
- A legacy repeating custom target without interval fields keeps its current annual due-date rollover and funding behaviour.
- New interval fields are stored only as a valid pair: a positive integer count and `month` or `year`.

## Phases

1. Add load-bearing read-model and target-math tests.
2. Carry transaction-level covered purchase allocations through the monthly computation and expose typed activity rows.
3. Render covered purchases and statement payments in separate activity sections with a coherent combined total.
4. Add schema, mutation, read-model, math, form, and bilingual i18n support for custom repeat intervals.
5. Mutation-check each correction by temporarily removing it and confirming its regression test fails.
6. Run lint, the full test suite, and the production build.

## Current Verification Evidence

- Targeted backend regression run: 3 files and 117 tests passed.
- Mutation checks: disabling covered-purchase inclusion produced 3 expected failures; disabling interval-aware funding produced 2; forcing annual due-date steps produced 2; restoring a single-step rollover produced 1. All temporary changes were restored.
- `pnpm lint`: TypeScript and ESLint passed.
- `pnpm test`: 94 files and 741 tests passed (733 existing + 8 new).
- `pnpm build`: client and SSR production bundles completed, `✓ built in 1.76s`; the existing Vite tsconfig-paths and unresolved Geist runtime-font warnings remain.
