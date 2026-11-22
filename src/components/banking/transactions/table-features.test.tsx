// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTable } from '@tanstack/react-table';
import { expect, test } from 'vitest';
import { transactionTableFeatures } from './table-features';
import type {
  ColumnDef,
  ColumnSizingState,
  ColumnVisibilityState,
  RowSelectionState,
  SortingState,
} from '@tanstack/react-table';
import type { TransactionTableFeatures } from './table-features';

type Item = { id: string; amount: number };
const columns: Array<ColumnDef<TransactionTableFeatures, Item>> = [{ accessorKey: 'amount' }];
const initialRows: Array<Item> = [
  { id: 'a', amount: 2 },
  { id: 'b', amount: 1 },
];

test('ledger table keeps controlled state reactive and preserves server order after the v9 update', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  let latest: ReturnType<typeof useTable<TransactionTableFeatures, Item>>;
  function Harness({ data }: { data: Array<Item> }) {
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
    latest = useTable({
      features: transactionTableFeatures,
      data,
      columns,
      getRowId: (row) => row.id,
      manualSorting: true,
      enableColumnResizing: true,
      state: { rowSelection, sorting, columnSizing, columnVisibility },
      onRowSelectionChange: setRowSelection,
      onSortingChange: setSorting,
      onColumnSizingChange: setColumnSizing,
      onColumnVisibilityChange: setColumnVisibility,
    });
    return (
      <output>
        {latest.getFilteredSelectedRowModel().rows.length}:{latest.getVisibleLeafColumns().length}:
        {latest
          .getRowModel()
          .rows.map((row) => row.id)
          .join(',')}
      </output>
    );
  }
  try {
    await act(() => root.render(<Harness data={initialRows} />));
    expect(container.textContent).toBe('0:1:a,b');
    await act(() => latest.getRow('a').toggleSelected(true));
    expect(container.textContent).toBe('1:1:a,b');
    await act(() => latest.getColumn('amount')!.toggleSorting(false));
    expect(latest!.state.sorting).toEqual([{ id: 'amount', desc: false }]);
    expect(container.textContent).toBe('1:1:a,b');
    await act(() => latest.setColumnSizing({ amount: 240 }));
    expect(latest!.getColumn('amount')!.getSize()).toBe(240);
    expect(latest!.getColumn('amount')!.getCanResize()).toBe(true);
    await act(() => latest.getColumn('amount')!.toggleVisibility(false));
    expect(container.textContent).toBe('1:0:a,b');
    await act(() => root.render(<Harness data={[{ id: 'c', amount: 3 }]} />));
    expect(container.textContent).toBe('0:0:c');
  } finally {
    await act(() => root.unmount());
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  }
});
