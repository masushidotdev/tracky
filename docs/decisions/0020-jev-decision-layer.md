# Decision 0020: jev Decision Layer

Status: active.

## Context

Tracky's deterministic heuristics (transfer windows, z-score thresholds,
recurrence day-bands, substring error maps) are correct but brittle at the
boundaries: ambiguous transfer pairs, cryptic import rows, notification fatigue,
quiet-month LLM spend, and agent writes on real money. jev (`typesafe/jev-1.13`
via OpenRouter Decisions API, Q1) returns calibrated typed decisions
(choice/score/noul) with confidences in ~300-750ms at ~$0.000024/call, output
tokens free — measured live 19/09/2026, see `experiments/jev/REPORT.md`
(gitignored discovery demos).

## Decision

- jev is advisory only: probabilities in, code thresholds out. jev never
  executes, never bypasses approval, never overrides user data.
- jev runs only in Convex `use node` actions (`convex/lib/jev.ts`), never in
  queries/mutations. Mutations persist state + `scheduler.runAfter` to actions.
- All gates are composite (probability + confidence); choice labels alone never
  decide (demo lesson: auto-confirm label with noul 0.56 on ambiguous fixtures).
- Every gate fails closed to the deterministic path on 429/529/timeout/missing key.
- Model pinned to `typesafe/jev-1.13-20260917` (Q7); thresholds versioned in
  `convex/lib/jevThresholds.ts` (JEV_THRESHOLDS_VERSION).
- Classification source reuses `system` + confidence (Q4); jev traceability via
  `jev:*` note prefixes. No new source literal, no migrations.
- Daily decision budget per tier in entitlements (`jevDecisionsDaily` free 50 /
  pro 500, Q2); import triage additionally capped at 100 rows/batch + 300/day
  (Q5). Over budget fails closed to determinism.
- State minimization (Q6): truncated descriptions, IBAN redaction, merchant keys,
  counts — never raw user ids in logs. Telemetry logs model, latency, cost,
  decision id. DPA coverage via OpenRouter + TypeSafe terms recorded here as a
  requirement before enabling import triage on real rows.
- Question instructions in English (jev's primary training language); states may
  be Italian/structured.

## Gates (phases)

1. UC2 transfer arbiter + UC6 planning-reconcile: heuristic band [0.6, 0.88) in
   `transferCandidates.ts` schedules `transferArbitration.ts`; confirm only on
   the composite gate. Zero schema change.
2. UC1 import triage (`banking/importTriage.ts`, residue-only after regex/rules)
   + E3 memory dedup (`analyst/memoryDedup.ts`, pre-embedding gate).
3. UC4 anomaly notifier gate + E1 report-skip + E2 health-driver (same proactive
   workers, `analyst/proactive/jevGates.ts`).
4. UC3 subscription sentinel (`banking/subscriptionSentinel.ts`, advisory notes,
   never auto-cancel).
5. UC5 write-guard badge-only (`analyst/writeGuard.ts`, Q3): advisory badge on
   the existing approval flow; blast radius computed in code.

## Excluded (Q8)

Telegram intent routing, rule blast-radius advisor, Enable Banking error
classifier: deferred until Phase 2-3 metrics justify them.

## Consequences

- New modules: `lib/jev.ts`, `lib/jevThresholds.ts`, `banking/transferArbitration.ts`,
  `banking/importTriage.ts`, `banking/subscriptionSentinel.ts`,
  `analyst/proactive/jevGates.ts`, `analyst/memoryDedup.ts`, `analyst/writeGuard.ts`.
- `convex/_generated/api.d.ts` updated for the new modules (manual patch; next
  `npx convex dev` push regenerates canonically).
- `userSettings.jevTriageUsage` tracks the daily triage budget.
- Tests: 13 new jev tests; full suite 957 passing.
