# Custom category management and transaction picker

Status: implemented.

## Goal

Give users one complete place to create, edit, and delete their own categories,
while keeping system defaults immutable, and replace the long transaction
category select with a visual, searchable picker.

## Assumptions

- Category management belongs in Settings because it changes user-level
  taxonomy rather than a single budget or transaction.
- A custom category exposes name, primary kind, compatible kinds, icon, color,
  and budget eligibility.
- Deleting an in-use category must not leave dangling references.
- System categories remain visible in transaction selection but cannot be
  edited or deleted.

## Phases

1. Add authenticated custom-category list, update, and delete APIs.
2. Clean linked records in bounded scheduled batches before final deletion.
3. Add a Settings card and shared create/edit dialog with icon and color
   pickers.
4. Replace the transaction table select with a fixed-height, searchable,
   scrollable visual popover.
5. Add English and Italian copy, backend tests, and visual verification.

## Current Verification Evidence

- `npm run lint` passes.
- `npm test -- --run` passes: 64 files and 406 tests.
- `npm run build` completes successfully; only the pre-existing Vite/font
  warnings remain.
- `git diff --check` passes.
- Browser verification covered the Settings empty state, the create/edit
  dialog at a constrained viewport height, and the transaction category
  popover. No browser console errors were reported.
- `migrations:seedDefaultCategories` processed the active user after the final
  taxonomy update, aligning the current database with default icon, color,
  compatibility, and system-key metadata.
