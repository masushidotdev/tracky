# Decision 0003: Harness Engineering Practices

Status: active.

Tracky follows the harness-engineering approach described by OpenAI for
agent-first development: humans define intent and review outcomes, while the
repository provides the durable context, boundaries, and feedback loops that
let agents make reliable progress.

Reference: https://openai.com/it-IT/index/harness-engineering/

## Practices

- `AGENTS.md` remains a short project map, not a complete manual. Durable
  domain knowledge belongs in `docs/`.
- `docs/README.md` is the index for repository-readable product, architecture,
  decision, and execution-plan context.
- Long-running product work keeps an execution plan in
  `docs/execution-plans/` with current assumptions and verification evidence.
- Repeated architectural decisions are captured as numbered records in
  `docs/decisions/`.
- Important constraints should be enforced mechanically when practical. Current
  examples include Convex public auth invariants, no client-supplied user ids,
  no runtime database filters, and this documentation index invariant.
- Agent-readable UI and backend behavior should be verified through runnable
  commands, tests, browser checks, or explicit evidence in execution plans
  before a task is treated as complete.

## Local Invariants

- Every durable Markdown document under `docs/`, except `docs/README.md`, must
  be listed in the README index.
- Every decision record must include a status line.
- Every execution plan must include status and verification sections.
- Broad architecture, product, and verification context should be updated in
  docs instead of relying on chat history.
