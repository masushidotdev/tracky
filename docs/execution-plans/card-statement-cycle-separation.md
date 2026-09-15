# Card statement cycle separation

Status: Complete

## Goal

Keep a linked card's total unpaid debt separate from the amount accrued in its
currently open statement, prevent an unpaid closed statement from being
scheduled a second time, and repair the affected example-card cycles without changing
the card balance before the real settlement.

## Assumptions

- A linked card derives total usage from its latest booked balance.
- Closing a statement schedules cash flow but does not settle card debt or free
  credit capacity.
- Current statement usage is `max(total used - scheduled unpaid statements, 0)`.
- The earliest open cycle owns the next manual close, its month label, and its
  due date; the wall-clock month is only a fallback when no open cycle exists.
- The repair must fail if the facility, manual card balance, cancelled
  cycles, currency, or empty later rollover differs from the expected state.
- The repair keeps the example-card balance at its observed value, restores the
  August statement at the observed amount and due date, reopens September at
  zero, and removes only the empty October rollover.
- When equal installment amounts undershoot principal because of minor-unit
  rounding, the shortfall belongs to the final installment and remains visible
  in the repayment residual until then.

## Phases

1. Centralize the unscheduled-card-usage calculation and reuse it in Planning,
   facility reads, and statement closing.
2. Show the earliest open cycle and net current amount in the credit UI, and
   disable closing when that amount is zero.
3. Make a close without an explicit month target the earliest open cycle.
4. Add an internal, idempotent, fail-closed repair for the inspected manual-card
   state and apply it only to the example-card facility.
5. Amend bilingual user documentation and add regression coverage for
   consecutive statements, cycle targeting, migration safety, and live state.
6. Carry a minor-unit principal shortfall into the final installment across
   facility summaries, schedules, Planning, and the repayment mutation.

## Current Verification Evidence

- Focused regression suite: 5 files and 39 tests passed, covering statement
  separation, cycle repair, installment conversion, credit math, and UI helper
  rounding.
- Full Vitest suite: 110 files and 886 tests passed.
- `npm run lint` completed successfully.
- `npm run build` completed successfully. Vite still reports the existing
  tsconfig-paths deprecation and runtime-resolved Geist font notices.
- `git diff --check` completed successfully.
- The scoped example-card repair was run against the fixture data and
  returned `repaired: false`: the August scheduled statement,
  zero-value September open cycle, and absence of the empty October rollover
  were already in the corrected state, so the idempotent repair made no writes.
- Reads confirmed total card usage matches the statement amount, current
  unscheduled statement usage is zero, and the August statement remains
  scheduled for the Example Bank account.
