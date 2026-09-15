# Plan installment buckets

Status: Complete

## Goal

Bring active EUR installment plans into the monthly Plan as protected system
buckets, without counting a linked repayment transaction both as bucket
activity and as out-of-plan/category activity.

## Assumptions

- `creditFacilityInstallmentPlans.status === "active"` defines the live
  reconciliation perimeter; the referenced facility must belong to the same
  user.
- All Plan money remains integer minor-unit `bigint` in EUR. Installment rows
  with another currency do not contribute to an EUR Plan.
- Monthly need follows the existing installment schedule rooted at
  `nextPaymentDate`, bounded by `remainingInstallments` and `endDate`.
- Payment activity is attributed to the scheduled due month through
  `creditFacilityInstallmentPayments.scheduledDueDate`.
- A detached system bucket keeps assignments, targets, mappings, and history,
  matching the existing card-payment behavior.

## Phases

1. Widen `planBuckets` with optional `installmentPlanId` and add the protected
   `Instalments` system group.
2. Reconcile one bucket per active, owned installment plan and reuse the
   non-destructive system-bucket detach path.
3. Load scheduled installment need and actual payments into the Plan month
   calculation; route linked repayment transactions exclusively to the
   installment bucket.
4. Carry card/installment due dates into underfunded Auto-Assign priority.
5. Add an idempotent paginated backfill and chain the existing snapshot rebuild.
6. Add English/Italian presentation strings and load-bearing regression tests.

## Current Verification Evidence

- Targeted regression tests: `5 passed (5)`.
- Mutation checks: each targeted test failed after independently disabling
  bucket creation, monthly need, payment activity, linked-transaction
  exclusion, non-destructive detach, migration idempotence, snapshot rebuild
  scheduling, and system due-date priority; all temporary changes were then
  restored.
- `pnpm lint`: exit 0.
- `pnpm test`: `92 passed (92)` files, `701 passed (701)` tests.
- `pnpm build`: exit 0, `✓ built in 1.75s`; existing Vite tsconfig-paths and
  unresolved Geist runtime-font warnings remain.
