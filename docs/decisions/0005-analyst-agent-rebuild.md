# Decision 0005: Convex-native Analyst Agent

Status: Accepted.

## Context

The previous Analyst used application-owned conversation tables and a read-only,
single-response flow. It could not reliably resume an in-progress answer after a
reload, expose structured tool activity, or ask the user to approve a write.

## Decision

- Use `@convex-dev/agent` as the owner of Analyst threads, messages, tool calls,
  and persisted stream deltas.
- Keep `ai` on version 6 and use the Vercel AI Gateway model IDs validated by the
  backend allowlist.
- Save stream deltas and read them with `useUIMessages(..., { stream: true })`,
  so an active response can resume after reload or on another client.
- Mark every data-writing tool with `needsApproval: true`. The client sends the
  component approval ID back to the authenticated mutation; it never executes a
  proposed write locally.
- Persist every decision in a multi-write approval step before resuming the
  model. Resume only after no approval in that step remains pending, pass an
  explicit non-execution reason for every denial, and require summaries to
  distinguish successful tool results from denied or failed writes.
- Apply fixed-window and burst rate limits before scheduling a response.
- Create Langfuse tracing only inside the Node action and make telemetry a no-op
  when its Convex environment keys are absent.
- Keep banking reads and writes behind internal user-scoped functions. Public
  Analyst functions derive the WorkOS user on the server and never accept a
  user ID from the client.
- Retire the three legacy Analyst tables through a controlled clear-then-remove
  deployment step after all application references have been removed.
- Reuse the same Agent component for interactive and autonomous work, but give
  autonomous reports a separate read-only toolset with no write tools, approval
  requests, or external web search.
- Persist every health, anomaly, subscription-review, and monthly-report unit in
  `proactiveJobs` before scheduling its action. Dedupe keys, atomic claims,
  fifteen-minute dispatch leases, bounded attempts, and `nextRunAtMs` make retry
  state recoverable even when an at-most-once scheduled action never starts. A
  mutation watchdog runs every minute and reclaims expired leases. Workers must
  atomically start/renew a still-valid token from actual start time and renew
  again around critical effects; expired or superseded tokens cannot resume.
- Treat a fresh, already-running report idempotency claim as a durable deferral,
  not an execution failure. The queue returns to pending until the claim's stale
  deadline and neutralizes the unused attempt, preventing repeated watchdog
  wakeups from exhausting the job before the report can be reclaimed.
- Claim each report atomically in `agentReports` before creating or reusing its
  Agent thread. The job queue owns retry timing; `agentReports` owns output and
  side-effect idempotency, with crashed running claims becoming reclaimable
  before the corresponding job lease is recovered.
- Give every monthly report one persisted output slot. A single mutation owns
  thread creation/reuse, pending assistant-message creation, and report
  association, including an in-transaction Agent ownership/existence check for
  any reused thread. Model generation uses `saveMessages: 'none'`; completion
  replaces the pending ID rather than appending an output.
- Keep that slot pending through intermediate retries. Terminal exhaustion must
  reconcile the Agent message, `agentReports`, and `proactiveJobs` in one nested
  mutation transaction. A report already completed wins over a late queue
  failure; otherwise the existing slot and both records become failed together.
- Page the active `userProfiles.by_status` roster in batches of 20 and carry the
  original UTC date/period through every scheduled page and per-user job.
- Keep all aggregates currency-scoped. No proactive calculation performs an
  implicit conversion or combines different currencies.
- Deliver proactive results through the existing notification table and
  idempotent dedupe pipeline. Health notifications require an absolute score
  delta of at least five points.
- Keep anomaly lookup migration-free by range-reading the existing notification
  dedupe index with the stable period prefix. Do not add a duplicated top-level
  period field merely for this query.
- Use the Resend Convex component for queued plain-text monthly-report email,
  webhook-owned delivery state, retry, batching, and cleanup. Email is optional;
  a missing/invalid recipient or sender configuration cannot undo a completed
  in-app report.
- Use the Telegram Bot API directly rather than introducing a second chat-state
  adapter. Persist update dedupe, leases, retry state, chunk progress, and the
  link between chat and owner in app tables while reusing Agent threads.
- Store only hashed, short-lived Telegram link codes. A user and a chat each
  have at most one binding and replacement requires explicit unlinking.
- Keep Telegram writes behind the existing Agent approval boundary. The bot
  cannot approve; it points the user to the same persisted web thread.
- Store explicit user-approved facts, preferences, and goals in a user-filtered
  vector index. Retrieved rows are bounded to five and delimited as untrusted
  data in the prompt. Retrieval is failure-soft.
- Keep purchase guidance and money-box optimization read-only. Keep bulk
  recategorization approval-gated and atomic after a full ownership/category
  preflight.

## Consequences

- Thread state, streaming, approval requests, and tool results share one
  Convex-native persistence model.
- UI reloads can reconnect to persisted deltas rather than restarting a model
  request.
- The Analyst can propose budgets, money boxes, and planned items without
  bypassing explicit user consent.
- The legacy Analyst rows were cleared in dependency order and the three schema
  definitions were removed on 2026-07-13; no temporary cleanup function remains.
- Query caps protect scheduled work from unbounded reads, so users with more
  than the documented transaction/category/subscription caps can receive a
  deliberately incomplete report rather than an unbounded job. Transaction
  aggregates apply the `BOOK` status inside the compound index before the cap,
  so provisional/cancelled rows cannot displace booked data.
- Resend sender-domain verification and webhook configuration remain deployment
  responsibilities, and LLM failures remain visible as bounded failed claims
  eligible for controlled retry.
- Telegram webhook registration, token validity, and end-to-end delivery remain
  deployment responsibilities. Telegram does not expose an idempotency key for
  `sendMessage`, so a crash between remote acceptance and local chunk
  acknowledgement is the one residual duplicate-delivery window.
