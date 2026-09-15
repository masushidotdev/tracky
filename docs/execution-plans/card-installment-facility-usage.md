# Card installment facility usage

Status: Complete

## Goal

Keep a card credit line's occupied and available amounts honest when a statement
balance is converted into installments: a manual card moves the converted debt
out of its synthetic balance, while the active installment residual continues
to occupy the facility limit.

## Assumptions

- All scenarios covered here use integer `bigint` minor units in EUR.
- Only a `cardCreditLine` linked to a `CARD` account whose provider is `manual`
  receives a synthetic balance adjustment during installment-plan creation.
- Provider-managed card balances remain read-only because their next bank sync
  is authoritative.
- Active installment occupancy is the existing scheduled repayment residual
  (`monthlyPaymentAmount × remainingInstallments`) already exposed by
  `listCreditFacilities`.
- Recording an installment payment changes the plan residual only; it never
  writes the linked card account balance.
- Plan card-debt coverage, `readyToAssignMinor`, and `unexplainedMinor` retain
  their existing accounting behavior.

## Phases

1. Extend the pure credit-facility summary helper with an optional installment
   residual while preserving the two-argument behavior.
2. Pass the active residual from `listCreditFacilities`.
3. During installment conversion, move the principal out of a linked manual
   card's synthetic balance in the same Convex transaction.
4. Add load-bearing unit and Convex tests for manual/provider conversion,
   repayments, later purchases, no-plan compatibility, and Plan invariants.
5. Run focused mutation checks, lint, the full test suite, and the production
   build without deploying or committing.

## Current Verification Evidence

- Focused verification: `2 passed (2)` files, `13 passed (13)` tests.
- Mutation check without the manual-card balance adjustment: the conversion
  invariant failed with `Received: -120000n`, `Expected: 0n`.
- Mutation check without passing installment residual to the facility summary:
  the availability invariant failed with `Received: 250000n`,
  `Expected: 130000n`.
- `pnpm lint`: exit 0 (`tsc` and ESLint, zero warnings from either checker).
- `pnpm test`: `95 passed (95)` files, `761 passed (761)` tests.
- `pnpm build`: exit 0, `✓ built in 2.40s`; the existing
  `vite-tsconfig-paths` deprecation and unresolved Geist runtime-font notices
  remain.
