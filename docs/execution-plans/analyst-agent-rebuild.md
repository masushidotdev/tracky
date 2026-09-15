# Analyst Agent Rebuild

Status: Phases 1, 2, and 3 implemented and verified in the development deployment.

## Goal

Replace the legacy read-only Analyst with a resumable, tool-using personal
finance agent that reads the authenticated user's Tracky data and requires
explicit approval before any write.

## Phase 1 — MVP

- [x] Install and configure the Agent and rate-limiter Convex components.
- [x] Add model allowlisting, prompts, bounded user-scoped queries, read tools,
      presentation tools, simulations, and approval-gated write tools.
- [x] Persist and resume stream deltas through the Agent component.
- [x] Replace the legacy route with a Ledger Ink two-column chat experience,
      URL-addressable threads, model selection, tool states, sources, charts,
      tables, and approval controls.
- [x] Remove legacy backend/frontend code, clear the three legacy tables in
      dependency order, remove their schema definitions, and delete the
      temporary cleanup mutation.
- [x] Add unit and Convex tests, architecture records, and changelog notes.

## Phase 2 — Proactivity

- [x] Add bounded, paginated active-user dispatch for daily health scores,
      daily spending anomalies, monthly reports, and monthly subscription
      reviews.
- [x] Add currency-scoped pure cores for anomaly detection, health scoring,
      subscription review, and avalanche/snowball debt payoff.
- [x] Persist idempotent health snapshots and report claims, and deliver new
      insight types through the existing notification inbox.
- [x] Generate monthly reports in persisted Agent threads with a dedicated
      read-only toolset that excludes write tools, approval flows, and web
      search.
- [x] Queue optional plain-text monthly-report email through the Resend Convex
      component without making email the report commit point.
- [x] Register the Resend webhook and bounded component cleanup.
- [x] Replace action-local retry scheduling with a persistent deduplicated job
      queue, atomic leases, bounded attempts, and a mutation watchdog that
      recovers actions which never start or lose their runtime.
- [x] Fence late workers with start-time lease renewal and persist monthly output
      through one mutation-owned pending Agent message that retries replace.
- [x] Reconcile terminal report output, report state, and queue state atomically,
      preserving completed output and finalizing pending failure slots.

## Phase 3 — Additional channels and memory

- [x] Add two-way Telegram Bot API messaging with hashed one-time linking,
      owner-validated Agent threads, turn locking, persistent dedupe/retry state,
      bounded parsing, safe outbound chunking, and watchdog recovery.
- [x] Add user-scoped fact, preference, and goal memory with approval-gated
      capture, 1536-dimensional embeddings, top-five vector retrieval, ownership
      hydration, injection delimiters, and failure-soft chat/Telegram use.
- [x] Add an ask-before-you-buy skill that uses the existing what-if simulation
      and refuses implicit currency conversion.
- [x] Add deterministic, currency-safe, read-only money-box allocation based on
      the existing funding plans.
- [x] Add approval-gated bulk recategorization for at most 50 transactions with
      a category-name input boundary and an all-or-nothing ownership/category
      preflight.
- [x] Add the Analyst Telegram link UI, specialized memory/bulk confirmations,
      EN/IT copy, environment guidance, and Phase 3 tests.
- [x] Harden multi-write HITL continuation so one approval decision cannot
      prematurely resume generation, auto-deny sibling requests, or let a
      denied proposal be summarized as a successful write.

## Current Verification Evidence

Automated checks completed on 2026-07-13 after RUN A, RUN B, RUN C, the
RUN C durability reviews, and RUN D Phase 3:

- `pnpm exec convex codegen` passed and regenerated Agent and Resend bindings.
- `pnpm lint` passed with TypeScript and ESLint at zero warnings.
- `pnpm test` passed after live auth-profile, read-tool, and anomaly-worker hardening: 44 files and 256 tests,
  including mixed approved/denied multi-write batch coverage.
- `pnpm build` passed with the existing Vite tsconfig-paths, Geist font, and
  chunk-size notices.
- Authenticated smoke testing found that a model could send an empty optional
  account ID. Read tools now omit empty optional IDs before Convex validation,
  and the UI treats known serialized backend failures as errors while keeping
  internal validator details hidden.
- Authenticated monthly-report smoke testing found that sparse WorkOS access
  token claims could leave `userProfiles` without a recipient. Profile bootstrap
  now repairs from the server-side AuthKit component and cannot erase trusted
  email or verification fields while webhook/backfill sync is pending.
- Dev anomaly smoke testing found that detector results carried two internal
  fields beyond the strict persistence validator. The worker now projects the
  exact mutation payload and stores safe input-read versus persistence failure
  codes. A fresh dev job completed on its first attempt; redispatch retained one
  deduplicated job and the same three period notifications.
- `git diff --check` passed.
- `pnpm why ai` reports one version, `ai@6.0.224`, shared by the application and
  `@convex-dev/agent@0.6.4`.
- Dev cleanup removed two legacy messages and one conversation; production was
  already empty. All three legacy tables were verified empty before their
  schema definitions and the temporary cleanup mutation were removed.

Authenticated Phase 1 smoke verification completed on 2026-07-13:

- progressive stream deltas were observed and a reload during generation
  resumed the same persisted response;
- read-tool input/output, charts, tables, and source parts rendered in the web
  UI, including light and dark themes;
- a two-write approval batch created only the approved Dining budget and left
  the denied Transport budget absent; the final assistant summary matched the
  server-trusted outcome;
- GPT-5.6 Terra remained selected after reload and the corresponding Langfuse
  traces used that model; proactive report traces used the report's default
  Claude Fable 5 model;
- a four-tab burst produced the localized structured rate-limit message rather
  than the generic failure fallback;
- previously persisted strict-validator failures now render as failed tool
  activity while hiding internal validator details.

Phase 2 deployment smoke verification completed on 2026-07-13:

- dispatching the June 2026 monthly report twice retained one deduplicated job,
  report, thread, message, notification, and email delivery;
- the July 2026 report reused the localized monthly-report thread and produced
  its own delivered Resend entry;
- authenticated profile repair restored the verified delivery address from the
  server-side AuthKit user without overwriting trusted fields during sync lag;
- health dispatch remained idempotent, and a fresh anomaly job completed on its
  first attempt after strict payload projection; redispatch retained one job
  and did not duplicate notifications.

Phase 3 deployment smoke verification completed on 2026-07-13:

- the Telegram webhook was registered with the exact HTTPS endpoint and reports
  no pending update or delivery error;
- a one-time link associated the private chat with the authenticated user, and
  a Telegram spending question completed once in the shared web thread with a
  chunked outbound response;
- an approved harmless preference was retrieved in a later web thread;
- a denied bulk recategorization changed no transactions, an approved batch
  changed both transactions atomically, and a second approved batch restored
  both original categories.

The following destructive or externally coordinated fault-injection checks were
not performed against live data:

- forcing lease loss during a running Telegram update to exercise watchdog
  recovery and fencing; deterministic persistence tests cover the same state
  transitions because the development deployment exposes no safe operator hook
  for corrupting a live lease;
- reusing a consumed link code, moving the account to a second Telegram chat,
  and originating a write request from Telegram; these require a second chat or
  an additional user-driven message. Ownership, one-time consumption, explicit
  unlink, and web-only approval behavior are covered by Convex tests;
- Telegram-side recall of the approved memory; web recall is verified and the
  shared retrieval path is covered by tests, but Telegram had not received the
  final user-driven recall question when this evidence was recorded.
