# Transaction Row Classification Icons

Status: implemented.

## Goal

Simplify transaction rows by removing classification provenance from the table,
using directional icons for classification, and keeping category assignment
available on matched transfers.

## Assumptions

- Classification provenance remains available in transaction details; only the
  table column is removed.
- A matched transfer category applies to the outgoing/source transaction. The
  incoming leg remains independently classifiable and is not silently changed.
- Existing category-picker behavior and user-defined category visuals remain
  unchanged.

## Phases

1. Replace classification badges with the same directional icon treatment used
   by planned expenses, including a transfer icon.
2. Remove the classification-source column and the transfer icon from the
   description cell.
3. Route matched-transfer category changes to the outgoing leg and preserve the
   optimistic UI update.
4. Run lint and build verification.

## Current Verification Evidence

- `npm run lint` passed: TypeScript and ESLint completed with zero warnings.
- `npm test` passed after indexing this execution plan and adding its required status metadata: 64 test files and 406 tests.
- `npm run build` passed for both client and SSR bundles. Vite retained the repository's existing advisory output for `vite-tsconfig-paths`, unresolved Geist font URLs, and the client chunk-size threshold.
