# Execution Plan: jev Decision Layer

Status: implemented (all 5 phases + E1-E3 in code, tests green, docs pending user review).

## Scope

Ratified plan Q1-Q8: OpenRouter endpoint reuse, tier budgets, badge-only
write-guard, source reuse, import caps, PII minimization, version pinning,
extras 1-3 in / 4-6 out.

## Implementation (this change)

- Phase 0: `convex/lib/jev.ts` (client, timeout 8s, retry 429/529 only, zod-less
  shape validation, IBAN redaction), `convex/lib/jevThresholds.ts` (v1),
  `LIMITS.jevDecisionsDaily` (free 50 / pro 500), `userSettings.jevTriageUsage`.
- Phase 1: `convex/banking/transferArbitration.ts` (request/arbitrate/apply,
  `jevAutoConfirmGate`), band hook in `transferCandidates.ts`, UC6
  `requestPlanningPairArbitration` sharing the gate.
- Phase 2: `convex/banking/importTriage.ts` (residue-only, routeTriage, budget
  mutations, suggest-never-overwrites), `convex/analyst/memoryDedup.ts`
  (pre-embedding duplicate gate).
- Phase 3: `convex/analyst/proactive/jevGates.ts` (question sets + pure routers),
  UC4 gate in `detectSpendingAnomaliesForUser` with `jevNotify/jevSeverity`
  persisted via `persistAnomalyNotifications`, E1 skip in
  `generateMonthlyReportForUser`, E2 driver in `computeHealthScoreForUser`.
- Phase 4: `convex/banking/subscriptionSentinel.ts` (series >= 3, advisory note,
  never auto-cancel).
- Phase 5: `convex/analyst/writeGuard.ts` (badge-only, blast radius in code,
  fail-closed to confirm).
- Generated types: `convex/_generated/api.d.ts` manually extended for the 7 new
  modules (canonical regeneration on next `npx convex dev` push).

## Verification

- New tests: `lib/jev.test.ts` (5), `transfer-arbitration.test.ts` (3),
  `import-triage.test.ts` (2), `jev-gates.test.ts` (2), `write-guard.test.ts`
  (1) — 13 total.
- `npx vitest run`: 122 files, 957 tests, all passing.
- `npx tsc -p convex/tsconfig.json --noEmit`: clean.
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

- Enablement wiring: call `requestRowTriage` from CSV/bank import residue paths
  with tier budget lookup; call `requestSentinelReview` from subscription
  detection; surface write-guard badges + sentinel verdicts in UI.
- User docs EN/IT for the new behaviors when enabled.
- Threshold tuning from production telemetry; re-pin model on upgrade.
