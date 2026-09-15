<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Documentation Is Part Of The Change

Every change ships with its documentation, in the same commit or the same series:

- **User documentation** in `src/content/user-docs/en` and `src/content/user-docs/it`. Both languages,
  always. A feature that behaves differently than the page describing it is a bug in the page.
- **Developer documentation** in `docs/`: `architecture.md` when boundaries or data flow move, a note
  under `docs/decisions/` when a decision constrains future work, a page under `docs/execution-plans/`
  for multi-step work. New pages must be added to the index in `docs/README.md`, which
  `convex/knowledge-base.test.ts` verifies.

Write them from what actually happened, not from the ticket: the plan as it was agreed, the decisions
taken in questions and answers along the way and the reasoning behind them, the inconsistencies found
while building, and the bugs fixed with what caused them. A decision recorded without its reason will
be reversed by the next person who meets the same trade-off.

Amend, do not append: when behaviour changes, the text describing the old behaviour is corrected or
deleted. Two pages describing the same feature differently are worse than one page missing.
