# 0013: Loans adopt paired Plan buckets

Status: accepted.

## Decision

When a loan is paired to a Plan category, its instalment plan adopts that
category's bucket. Reconciliation sets the bucket's `installmentPlanId` instead
of generating a second row under the `Instalments` group.

An adopted bucket remains user-owned. It keeps its name, group, sort position,
target, assignments, and global-category mappings, and gains the instalment due
date and schedule. Only generated instalment buckets are locked from rename,
hide, remap, move, or delete operations.

Unpairing clears the instalment link and leaves an adopted bucket where it is. A
generated duplicate that carries no assignments, target, or mappings is deleted;
a generated row with user state is detached rather than destroying that state.

## Why

Pairing previously changed only a label. Reconciliation still generated an
instalment bucket, so the paired category and the generated row represented the
same monthly payment and both asked to be funded.

The category is the user's plan structure, while the generated row is a fallback
for an unpaired obligation. Treating the fallback as authoritative would move or
lock a category the user already organized and would discard its mappings when
the loan was later unpaired.

## Consequences

- A paired loan contributes one target need and one activity drill-down, not a
  category row plus a duplicate `Instalments` row.
- Generated rows remain protected because reconciliation owns their identity and
  placement; adopted rows remain editable because the user owns them.
- Pairing is valid only when the bucket belongs to the relevant Plan and is not
  the Unplanned row or a card-payment bucket.
- Removing a pairing releases the category without relocating it or erasing its
  history.
