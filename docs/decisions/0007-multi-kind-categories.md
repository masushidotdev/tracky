# 0007: Multi-kind system categories

Status: accepted

## Decision

Keep `categories.kind` as the category's default and legacy transaction kind,
and add optional `applicableKinds` for categories that are valid across more
than one classification. Existing records behave as if
`applicableKinds = [kind]`.

Shared system categories use neutral keys such as `category:gift`. Categories
whose meaning is intrinsically tied to a transaction kind retain keys such as
`expense:groceries` and `income:salary`.

## Why

Creating one `Gift` row for every kind would duplicate user-visible categories,
budgets, rules, and analytics. Making `kind` itself multi-valued would be a
breaking schema change. The compatibility field preserves current data and
indexes while allowing a single category ID to be used for expenses, income,
or transfers.

When a shared category is assigned, the transaction's current compatible
classification is preserved. Its default `kind` is used only if the current
classification is not compatible.

## Localization

The database stores a stable canonical English name. The UI localizes system
category names from `systemKey`; custom user category names are displayed
verbatim.

## Custom category lifecycle

Only records without `systemKey` may be edited or deleted. These checks live in
authenticated Convex mutations and are not delegated to the UI. Deletion first
clears category references from transactions, subscriptions, planned
transactions, and child categories, removes associated rules and Plan mappings
in scheduled bounded batches, and deletes the category only after cleanup
completes.
