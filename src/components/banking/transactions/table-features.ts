import {
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table';

// Convex performs filtering and sorting. Register their state and UI APIs only.
export const transactionTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  rowSortingFeature,
});

export type TransactionTableFeatures = typeof transactionTableFeatures;
