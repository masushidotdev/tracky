# Execution Plan: jev Decision Layer

Status: implemented (all 5 phases + E1 + E3 in code, tests green, docs pending user review; E2 removed per review).

## Scope

Ratified plan Q1-Q8: OpenRouter endpoint reuse, tier budgets, badge-only
write-guard, source reuse, import caps, PII minimization, version pinning,
extras 1-3 in / 4-6 out.

## Implementation (this change)

- Phase 0: `convex/lib/jev.ts` (client, timeout 8s, retry 429/529 only with
  clamped retry-after, bigint-safe serialization, zod-less shape validation,
  IBAN redaction), `convex/lib/jevThresholds.ts` (v1),
  `LIMITS.jevDecisionsDaily` (free 50 / pro 500), `userSettings.jevTriageUsage`.
- Phase 1: `convex/banking/transferArbitration.ts` (request/arbitrate/apply,
  `jevAutoConfirmGate`), band hook in `transferCandidates.ts`, UC6
  `requestPlanningPairArbitration` sharing the gate; jev confirms carry system
  provenance (`confirmTransferCandidateMatch` provenance mode) on the match and
  both legs, never fake user confirms.
- Phase 2: `convex/banking/importTriage.ts` (residue-only, routeTriage, budget
  mutations, suggest-never-overwrites) wired from both import paths: CSV rows
  without kind/category/rule stay `uncategorized`; bank weak `expense:other`
  maps to `uncategorized` unless a same-merchant prior exists (subscription
  path preserved); both schedule `requestRowTriage` under tier budget.
  `convex/analyst/memoryDedup.ts` runs inline in `rememberFact` before
  `embedMemoryText` via `ctx.runAction`.
- Phase 3: `convex/analyst/proactive/jevGates.ts` (question sets + pure routers),
  UC4 gate in `detectSpendingAnomaliesForUser` with `jevNotify/jevSeverity`
  persisted via `persistAnomalyNotifications`, E1 skip in
  `generateMonthlyReportForUser` (completion outside the gate try/catch).
  E2 health-driver removed: no persistence or downstream read existed.
- Phase 4: `convex/banking/subscriptionSentinel.ts` (series from related
  directly, no anchor duplication, advisory note, never auto-cancel).
- Phase 5: `convex/analyst/writeGuard.ts` + `writeGuardBadge.ts` (badge-only,
  blast radius in code, fail-closed to confirm): `scanApprovalsForThread`
  caches pending rows post-turn, `adviseWriteBadges` fills via jev,
  `ToolConfirmation` renders from `getBadgeForApproval`; approval mandatory.
- Schema: new table `writeGuardBadges`; `userSettings.jevTriageUsage`.
- Generated types: `convex/_generated/api.d.ts` manually extended for the new
  modules (canonical regeneration on next `npx convex dev` push).

## Verification

- New tests: `lib/jev.test.ts` (6, incl. `[IBAN]` assertion + bigint-safe
  serialization), `transfer-arbitration.test.ts` (3, incl. cardinality),
  `import-triage.test.ts` (2), `jev-gates.test.ts` (2), `write-guard.test.ts`
  (1, pure router), `memory-dedup.test.ts` (3), CSV residue test + bank-import
  UC1 expectation update.
- `npx vitest run`: all passing; `npx tsc -p convex/tsconfig.json --noEmit`:
  clean; `npx eslint convex/`: zero errors.
- Fixture rule: Acme-style fake data in tests; no real names/IBANs.
- Live jev evidence (pre-code): `experiments/jev/` demos, ~$0.000024/call,
  300-750ms (gitignored, not shipped).

## Current Verification Evidence

- 2026-09-21: full suite green (122 files / 957 tests) after entitlements
  expectation update; convex project typecheck clean; root `tsc` shows only the
  pre-existing `content-collections` generated-types error.
- Open: `npx convex dev` push blocked by missing WorkOS env in the local
  backend harness (pre-existing, unrelated to jev); canonical `_generated`
  refresh deferred to a provisioned deployment.
- Open: DPA check (OpenRouter + TypeSafe) required before enabling UC1 on real
  rows; env `OPENROUTER_API_KEY` to set via `npx convex env set` per deployment.

## Follow-ups (not in this change)

- Call `requestSentinelReview` from subscription detection; surface sentinel
  verdicts in UI (badges are already rendered in `ToolConfirmation`).
- Threshold tuning from production telemetry; re-pin model on upgrade.
