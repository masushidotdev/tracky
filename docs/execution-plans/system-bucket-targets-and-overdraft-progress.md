# System-bucket targets and overdraft progress

Status: implemented and verified.

## Scope

- Allow user targets on card-payment and instalment system buckets while preserving their protected
  identity and their existing debt/repayment fallback needs.
- Add month-over-month overdraft progress and an informational monthly pace toward a user-selected
  payoff date.

## Assumptions

- Money remains represented as `bigint` EUR minor units.
- A system bucket uses its target need when a target exists; otherwise it keeps the derived card
  debt or scheduled instalment need.
- Card debt and payment due dates remain visible even when a target overrides the funding need.
- Overdraft progress is the change in the negative-liquidity stock reconstructed by
  `liquidityAtEndOfPeriod`: positive means the overdraft fell, negative means it grew.
- The payoff date belongs to `plans`, because the guidance applies to the Plan's aggregate liquidity
  perimeter rather than to one credit facility. It is optional and does not invalidate snapshots.
- The suggested monthly pace is the current real overdraft divided, with bigint ceiling, over the
  calendar months from the current month through the target month.
- Progress and pace are read-model information only. They never create a bucket or assignment and
  never enter Ready to Assign or its breakdown.

## Phases

1. Add load-bearing Convex regressions for card and instalment target precedence, unchanged
   fallbacks, payment carry, and retained system protections.
2. Add the optional Plan target date, its authenticated mutation, overdraft progress, and monthly
   pace with accounting-invariance regressions.
3. Expose target editing for system buckets and render the bilingual overdraft progress/date/pace
   controls.
4. Mutation-check every correction by temporarily disabling it and confirming its focused
   regression fails, then restore it.
5. Run `pnpm lint`, `pnpm test`, and `pnpm build` without running a Convex deployment command.

## Current Verification Evidence

- Focused restored-state run: 5 files and 135 tests passed.
- Negative controls produced the expected failures for card and instalment target permission,
  target precedence, debt/repayment fallbacks, system-bucket protection, overdraft progress, target
  persistence, monthly pace, Ready to Assign invariance, and unexplained-movement invariance.
- `pnpm lint` passed with TypeScript and ESLint reporting no errors or warnings.
- First complete suite run passed 747 of 748 tests; the only failure was this document not yet using
  the repository-required `Current Verification Evidence` heading.
- Restored complete suite: `pnpm test` passed with 94 files and 748 tests.
- `pnpm build` completed both client and server bundles with `✓ built in 1.83s`; the existing
  `vite-tsconfig-paths` recommendation and unresolved Geist font-at-build-time notices remain.
