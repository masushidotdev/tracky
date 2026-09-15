import { describe, expect, test } from 'vitest';

import { toTransactionFilters } from './filter-query';
import { transactionPageRowsForTable } from './table-rows';

describe('transactionPageRowsForTable', () => {
  test('keeps scheduled rows in table data when the query explicitly filters for SCHD', () => {
    const scheduledRows = [{ id: 'scheduled', status: 'SCHD' }];
    const filters = toTransactionFilters([{ kind: 'status', value: 'SCHD' }]);

    expect(transactionPageRowsForTable(scheduledRows, filters.status)).toEqual(scheduledRows);
  });

  test('keeps scheduled rows out of the ordinary table when no status is requested', () => {
    const rows = [
      { id: 'booked', status: 'BOOK' },
      { id: 'scheduled', status: 'SCHD' },
    ];

    expect(transactionPageRowsForTable(rows, undefined)).toEqual([{ id: 'booked', status: 'BOOK' }]);
  });
});
