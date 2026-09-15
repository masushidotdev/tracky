# Plan cross-month transfer reconciliation

Status: implemented and verified.

## Problem

A confirmed Example-Bank-to-Acme transfer left on 31 July and arrived on 3
August. Both cash accounts were inside the same Plan, but the August incoming
leg appeared as a positive "Transfers to excluded accounts" amount because the
Plan read model only netted transfer rows found inside the selected month.

## Assumptions

- `transferMatches` is the source of truth for confirmed transfer counterparts.
- Cash principal moving between two accounts in the same Plan is neutral.
- The signed difference between the two legs is a real liquidity change and
  must remain visible rather than becoming unexplained movement.
- Card transfers keep their existing specialized treatment.

## Phases

1. Resolve confirmed transfer matches referenced by a month's rows and load both
   transaction legs, even when the counterpart books in another month.
2. Normalize in-plan cash movements for liquidity reconstruction and month
   attribution: zero principal, outgoing-date delta.
3. Route the delta to Unplanned activity and remove both legs from the
   out-of-plan transfer total and list.
4. Add July/August regression coverage for an amount with a transfer fee, plus
   matching drill-down assertions.
5. Amend English and Italian Plan documentation and run focused tests, lint, and
   the production build.

## Current Verification Evidence

- Regression scenario: Example Bank debit of 702.47 EUR on 31 July and Acme
  credit of 700 EUR on 3 August, both accounts in the same Plan.
- July attributes only the 2.47 EUR delta to Unplanned activity; August has no
  transfer or fee activity; both out-of-plan transfer lists are empty.
- Unplanned drill-down exposes the outgoing transaction as a 2.47 EUR debit.
- Focused Plan read suite: 77 tests passed.
- Full repository suite: 109 files and 880 tests passed.
- `npm run lint`: TypeScript and ESLint passed without diagnostics.
- `npm run build`: client and SSR production bundles completed; existing Vite
  tsconfig-paths and unresolved Geist runtime-font warnings remain.
