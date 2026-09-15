import * as React from 'react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { CalendarClockIcon, ChevronDown, ChevronRight, EyeOffIcon, Repeat2Icon, XIcon } from 'lucide-react';

import { BulkActionBar } from './bulk-action-bar';
import { parseFilterQuery, suggestFor } from './filter-query';
import type { BulkActionLabels } from './bulk-action-bar';
import type { FilterQueryContext } from './filter-query';
import type { TransactionRow } from './columns';
import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  OnChangeFn,
  Row,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
import { TagBadge } from '@/components/app/tag-badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { accountLabel } from '@/lib/accounts';
import { categoryDisplayName } from '@/lib/categories';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export type DataTableLabels = {
  account: string;
  actions: string;
  category: string;
  classification: string;
  clearFilters: string;
  columns: string;
  filterPlaceholder: string;
  filterNoSuggestions: string;
  description: string;
  date: string;
  inflow: string;
  memo: string;
  outflow: string;
  payee: string;
  select: string;
  destination: string;
  feeDelta: string;
  loading: string;
  netTransfer: string;
  noResults: string;
  page: string;
  pageSize: string;
  previous: string;
  next: string;
  rowsSelected: string;
  scanCapped: string;
  scheduledTitle: string;
  scheduledCount: string;
  scheduledCollapse: string;
  scheduledExpand: string;
  source: string;
  transferDetails: string;
  unknownDestination: string;
  unknownSource: string;
};

type DataTableProps = {
  accounts: Array<Doc<'financialAccounts'>>;
  categories: Array<Doc<'categories'>>;
  columns: Array<ColumnDef<TransactionRow>>;
  data: Array<TransactionRow>;
  filterContext: FilterQueryContext;
  filterQuery: string;
  isLoading: boolean;
  labels: DataTableLabels;
  onBulkCategory: (transactions: Array<TransactionRow>, categoryId: Id<'categories'> | null) => Promise<boolean>;
  onBulkClassification: (
    transactions: Array<TransactionRow>,
    classificationKind: 'expense' | 'income' | 'internal' | 'transfer',
  ) => Promise<boolean>;
  onBulkDeleteManual: (transactions: Array<TransactionRow>) => Promise<boolean>;
  onBulkHidden: (transactions: Array<TransactionRow>, hidden: boolean) => Promise<boolean>;
  onBulkTags: (
    transactions: Array<TransactionRow>,
    tagIds: Array<Id<'transactionTags'>>,
    mode: 'add' | 'remove',
  ) => Promise<boolean>;
  onBulkUnlinkMoneyBox: (transactions: Array<TransactionRow>) => Promise<boolean>;
  onBulkUnlinkTransfer: (transactions: Array<TransactionRow>) => Promise<boolean>;
  onFilterQueryChange: (query: string) => void;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRowClick: (row: TransactionRow) => void;
  onScheduledRowClick?: (row: TransactionRow) => void;
  onSortingChange: OnChangeFn<SortingState>;
  pageIndex: number;
  pageSize: number;
  /**
   * Rows the server still counts but the ledger hides — today only the scheduled ones, which are
   * lifted into their own band. Page navigation has to follow the unfiltered positions, or the last
   * page of a page-boundary-straddling result becomes unreachable.
   */
  paginationCount?: number;
  /** Editor row for a new entry, rendered inside this table so it inherits the column geometry. */
  renderInlineEditorRows?: (columns: Array<Column<TransactionRow, unknown>>) => React.ReactNode;
  renderInlineEditorCard?: () => React.ReactNode;
  editingScheduledRowId?: string;
  renderScheduledInlineEditorRows?: (columns: Array<Column<TransactionRow, unknown>>) => React.ReactNode;
  renderScheduledInlineEditorCard?: () => React.ReactNode;
  scanCapped: boolean;
  scanLimit: number;
  scheduledRows?: Array<TransactionRow>;
  sorting: SortingState;
  scopeAccountId?: Id<'financialAccounts'>;
  tags: Array<Doc<'transactionTags'>> | undefined;
  totalCount: number;
};

const TRANSACTIONS_COLUMN_SIZING_KEY = 'tracky.transactions.columnSizing';
const ACCOUNT_COLUMN_SIZING_KEY = 'tracky.account.columnSizing';

function readColumnSizing(storageKey: string): ColumnSizingState {
  if (typeof window === 'undefined') return {};

  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as ColumnSizingState) : {};
  } catch {
    return {};
  }
}

function writeColumnSizing(storageKey: string, columnSizing: ColumnSizingState) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(columnSizing));
  } catch {
    // The current session still works when storage is unavailable.
  }
}

function accountLabelById(
  accountsById: Map<Id<'financialAccounts'>, Doc<'financialAccounts'>>,
  accountId: Id<'financialAccounts'>,
) {
  const account = accountsById.get(accountId);
  return account ? accountLabel(account) : null;
}

function transactionSummary(
  accountsById: Map<Id<'financialAccounts'>, Doc<'financialAccounts'>>,
  row: TransactionRow,
  labels: DataTableLabels,
) {
  const transfer = row.transferPresentation;
  if (!transfer) {
    return {
      title: row.description,
      subtitle: row.counterpartyName,
    };
  }

  const outgoingAccount =
    transfer.sourceLabel ??
    (transfer.outgoing ? accountLabelById(accountsById, transfer.outgoing.accountId) : null) ??
    labels.unknownSource;
  const incomingAccount =
    transfer.destinationLabel ??
    (transfer.incoming ? accountLabelById(accountsById, transfer.incoming.accountId) : null) ??
    labels.unknownDestination;

  return {
    title: `${outgoingAccount} -> ${incomingAccount}`,
    subtitle: labels.transferDetails,
  };
}

export function DataTable({
  accounts,
  categories,
  columns,
  data,
  filterContext,
  filterQuery,
  isLoading,
  labels,
  onBulkCategory,
  onBulkClassification,
  onBulkDeleteManual,
  onBulkHidden,
  onBulkTags,
  onBulkUnlinkMoneyBox,
  onBulkUnlinkTransfer,
  onFilterQueryChange,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  onScheduledRowClick,
  onSortingChange,
  pageIndex,
  pageSize,
  paginationCount,
  editingScheduledRowId,
  renderInlineEditorCard,
  renderInlineEditorRows,
  renderScheduledInlineEditorCard,
  renderScheduledInlineEditorRows,
  scanCapped,
  scanLimit,
  scheduledRows,
  sorting,
  scopeAccountId,
  tags,
  totalCount,
}: DataTableProps) {
  const { intlLocale, t } = useI18n();
  const columnSizingStorageKey = scopeAccountId ? ACCOUNT_COLUMN_SIZING_KEY : TRANSACTIONS_COLUMN_SIZING_KEY;
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  // Classification repeats what the payee and category already say, so it starts hidden; it stays
  // in the Columns menu for when the icon is the quickest way to spot a misfiled transfer.
  const initialColumnVisibility: VisibilityState = {
    classificationKind: false,
    ...(scopeAccountId ? { account: false } : {}),
  };
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(initialColumnVisibility);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [rowSelection, setRowSelection] = React.useState({});
  const [bulkTagIds, setBulkTagIds] = React.useState<Array<Id<'transactionTags'>>>([]);
  const accountsById = React.useMemo(() => new Map(accounts.map((account) => [account._id, account])), [accounts]);
  const tagsById = React.useMemo(() => new Map(tags?.map((tag) => [tag._id, tag]) ?? []), [tags]);
  const columnLabels = React.useMemo<Record<string, string>>(
    () => ({
      select: labels.select,
      account: labels.account,
      bookingDate: labels.date,
      counterpartyName: labels.payee,
      description: labels.description,
      classificationKind: labels.classification,
      category: labels.category,
      note: labels.memo,
      outflow: labels.outflow,
      inflow: labels.inflow,
      actions: labels.actions,
    }),
    [labels],
  );

  React.useEffect(() => {
    setColumnSizing(readColumnSizing(columnSizingStorageKey));
  }, [columnSizingStorageKey]);

  const handleColumnSizingChange = React.useCallback<OnChangeFn<ColumnSizingState>>(
    (updater) => {
      setColumnSizing((currentSizing) => {
        const nextSizing = typeof updater === 'function' ? updater(currentSizing) : updater;
        writeColumnSizing(columnSizingStorageKey, nextSizing);
        return nextSizing;
      });
    },
    [columnSizingStorageKey],
  );

  const table = useReactTable({
    data,
    columns,
    manualSorting: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    state: {
      sorting,
      columnFilters,
      columnSizing,
      columnVisibility,
      rowSelection,
    },
    onSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: handleColumnSizingChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row._id,
    getCoreRowModel: getCoreRowModel(),
  });

  // The scheduled band is part of the same ledger: same column defs, same sizing state, rendered as
  // a second <tbody> of the same <table>. A second instance only exists to build its cells — it owns
  // no selection and no pagination, so a plan can never be counted with the booked rows.
  const scheduledTable = useReactTable({
    data: scheduledRows ?? [],
    columns,
    manualSorting: true,
    enableColumnResizing: true,
    state: { columnSizing, columnVisibility },
    getRowId: (row) => row._id,
    getCoreRowModel: getCoreRowModel(),
  });
  const [scheduledOpen, setScheduledOpen] = React.useState(true);
  const hasScheduled = (scheduledRows?.length ?? 0) > 0;
  const visibleColumns = table.getVisibleLeafColumns();

  const [filterOpen, setFilterOpen] = React.useState(false);
  const parsedFilter = React.useMemo(() => parseFilterQuery(filterQuery, filterContext), [filterContext, filterQuery]);
  const suggestions = React.useMemo(
    () => suggestFor(parsedFilter.activeToken, filterContext),
    [filterContext, parsedFilter.activeToken],
  );
  const queryPrefix = filterQuery.slice(0, filterQuery.length - parsedFilter.activeToken.length);
  const pageCount = Math.max(1, Math.ceil((paginationCount ?? totalCount) / pageSize));
  const canGoPrevious = pageIndex > 0;
  const canGoNext = pageIndex + 1 < pageCount;
  const interactiveColumnIds = React.useMemo(() => new Set(['select', 'category', 'actions']), []);
  const selectedTransactions = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  const bulkLimitExceeded = selectedTransactions.length > 100;
  const hasSelectedTransactions = selectedTransactions.length > 0;
  const bulkActionLabels = React.useMemo<BulkActionLabels>(
    () => ({
      categorize: t('transactions.bulk.categorize'),
      chooseTags: t('transactions.bulk.chooseTags'),
      addTags: t('transactions.bulk.addTags'),
      removeTags: t('transactions.bulk.removeTags'),
      hide: t('transactions.bulk.hide'),
      unhide: t('transactions.bulk.unhide'),
      more: t('transactions.bulk.more'),
      clear: t('transactions.bulk.clear'),
      selected: t('transactions.bulk.selected', { count: selectedTransactions.length }),
      limit: t('transactions.bulk.limit'),
      classify: t('transactions.bulk.classify'),
      markExpense: t('transactions.action.expense'),
      markIncome: t('transactions.action.income'),
      markInternal: t('transactions.action.internal'),
      markTransfer: t('transactions.action.unmatchedTransfer'),
      unlinkTransfer: t('transactions.action.unlinkTransfer'),
      unlinkMoneyBox: t('transactions.moneyBox.unlink'),
      deleteManual: t('transactions.manual.delete'),
    }),
    [selectedTransactions.length, t],
  );

  React.useEffect(() => {
    if (!hasSelectedTransactions) return;

    const clearSelection = (event: KeyboardEvent) => {
      // A menu or popover that handled Escape already consumed it; closing it should not also throw
      // away what the user had selected.
      if (event.key === 'Escape' && !event.defaultPrevented) setRowSelection({});
    };
    window.addEventListener('keydown', clearSelection);
    return () => window.removeEventListener('keydown', clearSelection);
  }, [hasSelectedTransactions]);

  const runBulkTags = async (mode: 'add' | 'remove') => {
    if (bulkTagIds.length === 0 || bulkLimitExceeded) return;
    const succeeded = await onBulkTags(selectedTransactions, bulkTagIds, mode);
    if (succeeded) {
      setRowSelection({});
      setBulkTagIds([]);
    }
  };

  const runBulkHidden = async (transactions: Array<TransactionRow>, hidden: boolean) => {
    if (bulkLimitExceeded) return;
    const succeeded = await onBulkHidden(transactions, hidden);
    if (succeeded) setRowSelection({});
  };

  const runBulkCategory = async (transactions: Array<TransactionRow>, categoryId: Id<'categories'> | null) => {
    if (bulkLimitExceeded) return;
    const succeeded = await onBulkCategory(transactions, categoryId);
    if (succeeded) setRowSelection({});
  };

  const runBulkClassification = async (
    transactions: Array<TransactionRow>,
    classificationKind: 'expense' | 'income' | 'internal' | 'transfer',
  ) => {
    if (bulkLimitExceeded) return;
    const succeeded = await onBulkClassification(transactions, classificationKind);
    if (succeeded) setRowSelection({});
  };

  const runBulkUnlinkTransfer = async (transactions: Array<TransactionRow>) => {
    if (bulkLimitExceeded) return;
    const succeeded = await onBulkUnlinkTransfer(transactions);
    if (succeeded) setRowSelection({});
  };

  const runBulkUnlinkMoneyBox = async (transactions: Array<TransactionRow>) => {
    if (bulkLimitExceeded) return;
    const succeeded = await onBulkUnlinkMoneyBox(transactions);
    if (succeeded) setRowSelection({});
  };

  const runBulkDeleteManual = async (transactions: Array<TransactionRow>) => {
    if (bulkLimitExceeded) return;
    const succeeded = await onBulkDeleteManual(transactions);
    if (succeeded) setRowSelection({});
  };

  const renderTableRow = (
    row: Row<TransactionRow>,
    handleClick: (transaction: TransactionRow) => void,
    blankColumnIds?: Set<string>,
  ) => (
    <TableRow
      key={row.id}
      data-state={row.getIsSelected() && 'selected'}
      className="cursor-pointer transition-colors hover:bg-muted/50"
      role="button"
      tabIndex={0}
      aria-label={row.original.description}
      onClick={() => handleClick(row.original)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick(row.original);
        }
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          style={{ overflow: 'hidden', width: cell.column.getSize() }}
          onClick={
            interactiveColumnIds.has(cell.column.id) &&
            !(row.original.plannedOccurrence && cell.column.id !== 'actions')
              ? (event) => event.stopPropagation()
              : undefined
          }
        >
          {/* Kept as a cell rather than dropped, so the row still lines up column for column. */}
          {blankColumnIds?.has(cell.column.id) ? null : flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );

  const renderMobileCard = (row: Row<TransactionRow>, handleClick: (transaction: TransactionRow) => void) => {
    const summary = transactionSummary(accountsById, row.original, labels);
    const amount = row.original.transferPresentation?.neutralAmount ?? row.original.amount;
    const rowTags = (row.original.tagIds ?? [])
      .map((tagId) => tagsById.get(tagId))
      .filter((tag): tag is Doc<'transactionTags'> => Boolean(tag));
    const actionCell = row.original.plannedOccurrence
      ? row.getVisibleCells().find((cell) => cell.column.id === 'actions')
      : undefined;
    const content = (
      <>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{summary.title}</span>
          {summary.subtitle ? (
            <span className="block truncate text-xs text-muted-foreground">{summary.subtitle}</span>
          ) : null}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {formatIsoDate(row.original.bookingDate, intlLocale)}
            {row.original.plannedOccurrence ? (
              <Repeat2Icon
                className="size-3.5"
                aria-label={t('transactions.scheduled.repeatMarker', {
                  recurrence: row.original.plannedOccurrence.recurrenceLabel,
                })}
              />
            ) : null}
          </span>
          {rowTags.length > 0 || row.original.hiddenFromReports ? (
            <span className="mt-1 flex flex-wrap items-center gap-1">
              {rowTags.slice(0, 2).map((tag) => (
                <TagBadge key={tag._id} tag={tag} className="h-5 max-w-24 px-1.5 text-[10px]" />
              ))}
              {rowTags.length > 2 ? (
                <span className="text-[10px] text-muted-foreground">+{rowTags.length - 2}</span>
              ) : null}
              {row.original.hiddenFromReports ? (
                <EyeOffIcon className="size-3.5 text-muted-foreground" aria-label={t('transactions.hidden.label')} />
              ) : null}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-2">
          <Amount
            variant={row.original.transferPresentation ? 'neutral' : 'signed'}
            direction={row.original.direction}
            money={amount}
            className="text-sm font-medium"
            sensitive={false}
          />
          <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
            {row.original.category ? categoryDisplayName(row.original.category, t) : row.original.classificationKind}
          </span>
          {actionCell ? (
            <span onClick={(event) => event.stopPropagation()}>
              {flexRender(actionCell.column.columnDef.cell, actionCell.getContext())}
            </span>
          ) : null}
        </span>
      </>
    );

    if (row.original.plannedOccurrence) {
      return (
        <div
          key={row.id}
          role="button"
          tabIndex={0}
          className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-md border bg-card p-3 text-left transition-colors hover:bg-muted/50"
          onClick={() => handleClick(row.original)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleClick(row.original);
            }
          }}
        >
          {content}
        </div>
      );
    }

    return (
      <button
        key={row.id}
        type="button"
        className="flex w-full items-start justify-between gap-3 rounded-md border bg-card p-3 text-left transition-colors hover:bg-muted/50"
        onClick={() => handleClick(row.original)}
      >
        {content}
      </button>
    );
  };

  const scheduledBandButton = (
    <button
      type="button"
      className="flex w-full items-center gap-2 text-left text-sm font-medium"
      aria-expanded={scheduledOpen}
      aria-label={scheduledOpen ? labels.scheduledCollapse : labels.scheduledExpand}
      onClick={() => setScheduledOpen((current) => !current)}
    >
      {scheduledOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      <CalendarClockIcon className="size-4 text-muted-foreground" />
      {labels.scheduledTitle}
      <span className="text-xs font-normal text-muted-foreground">
        {labels.scheduledCount.replace('{count}', String(scheduledRows?.length ?? 0))}
      </span>
    </button>
  );

  const handleScheduledClick = onScheduledRowClick ?? onRowClick;
  // Bulk actions run off the booked table's selection, so a checkbox on a scheduled row would tick
  // and do nothing. The cell stays, empty, to keep the columns aligned.
  const scheduledBlankColumnIds = React.useMemo(() => new Set(['select']), []);

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start">
        <div
          className="relative min-w-0 flex-1"
          onFocus={() => setFilterOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFilterOpen(false);
          }}
        >
          {/* CommandInput already draws its own input chrome, so the wrapper stays transparent:
              a border and background here put a second box around the first. */}
          <Command
            shouldFilter={false}
            className="overflow-visible bg-transparent p-0 [&_[data-slot=command-input-wrapper]]:p-0"
          >
            <CommandInput
              placeholder={labels.filterPlaceholder}
              value={filterQuery}
              onValueChange={onFilterQueryChange}
            />
            {filterOpen && suggestions.length > 0 ? (
              <CommandList className="absolute top-full right-0 left-0 z-50 mt-1 rounded-md border bg-popover p-1 shadow-md">
                {suggestions.map((suggestion) => (
                  <CommandItem
                    key={suggestion.id}
                    value={suggestion.id}
                    onSelect={() => {
                      onFilterQueryChange(`${queryPrefix}${suggestion.insertText}, `);
                      setFilterOpen(true);
                    }}
                  >
                    {suggestion.label}
                  </CommandItem>
                ))}
              </CommandList>
            ) : filterOpen && parsedFilter.activeToken.trim() ? (
              <CommandList className="absolute top-full right-0 left-0 z-50 mt-1 rounded-md border bg-popover shadow-md">
                <CommandEmpty>{labels.filterNoSuggestions}</CommandEmpty>
              </CommandList>
            ) : null}
          </Command>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={labels.clearFilters}
          disabled={!filterQuery}
          onClick={() => onFilterQueryChange('')}
        >
          <XIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="md:ml-auto">
              {labels.columns}
              <ChevronDown data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                >
                  {columnLabels[column.id] ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Resized columns can outgrow the viewport, so the table scrolls inside its own box. */}
      <div className="hidden overflow-x-auto rounded-md border md:block">
        {/* Fixed layout makes the per-column sizes authoritative; width 100% lets them share the
            space proportionally until the total no longer fits, and only then does it scroll. */}
        <Table style={{ minWidth: table.getTotalSize(), tableLayout: 'fixed', width: '100%' }}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="relative select-none" style={{ width: header.getSize() }}>
                    {/* Plain string headers get truncated; the custom ones (sort button, right-aligned
                        totals) render as-is so their offsets are not clipped. */}
                    {header.isPlaceholder ? null : typeof header.column.columnDef.header === 'string' ? (
                      <div className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</div>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                    {header.column.getCanResize() ? (
                      <button
                        type="button"
                        aria-label={columnLabels[header.column.id] ?? header.column.id}
                        // Straddles the column border: a 1px target is unhittable in practice.
                        className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize touch-none select-none before:absolute before:inset-y-2 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border hover:before:bg-primary data-[resizing=true]:before:w-0.5 data-[resizing=true]:before:bg-primary"
                        data-resizing={header.column.getIsResizing()}
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          header.getResizeHandler()(event);
                        }}
                        onTouchStart={(event) => {
                          event.stopPropagation();
                          header.getResizeHandler()(event);
                        }}
                      />
                    ) : null}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          {renderInlineEditorRows ? (
            <TableBody className="border-b">{renderInlineEditorRows(visibleColumns)}</TableBody>
          ) : null}
          {hasScheduled ? (
            <TableBody className="border-b bg-muted/20">
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns.length}>{scheduledBandButton}</TableCell>
              </TableRow>
              {scheduledOpen
                ? scheduledTable.getRowModel().rows.map((row) =>
                    row.original._id === editingScheduledRowId && renderScheduledInlineEditorRows ? (
                      <React.Fragment key={row.id}>{renderScheduledInlineEditorRows(visibleColumns)}</React.Fragment>
                    ) : (
                      renderTableRow(row, handleScheduledClick, scheduledBlankColumnIds)
                    ),
                  )
                : null}
            </TableBody>
          ) : null}
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="h-24 text-center text-muted-foreground">
                  {labels.loading}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => renderTableRow(row, onRowClick))
            ) : (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="h-24 text-center">
                  <EmptyState title={labels.noResults} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {renderInlineEditorCard ? renderInlineEditorCard() : null}
        {hasScheduled ? (
          <div className="rounded-md border bg-muted/20 p-3">
            {scheduledBandButton}
            {scheduledOpen ? (
              <div className="mt-2 flex flex-col gap-2">
                {scheduledTable.getRowModel().rows.map((row) =>
                  row.original._id === editingScheduledRowId && renderScheduledInlineEditorCard ? (
                    <React.Fragment key={row.id}>{renderScheduledInlineEditorCard()}</React.Fragment>
                  ) : (
                    renderMobileCard(row, handleScheduledClick)
                  ),
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {isLoading ? (
          <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">{labels.loading}</div>
        ) : table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => renderMobileCard(row, onRowClick))
        ) : (
          <div className="rounded-md border p-3">
            <EmptyState title={labels.noResults} />
          </div>
        )}
      </div>

      {scanCapped ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          {labels.scanCapped.replace('{count}', String(scanLimit))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-muted-foreground">
          {labels.rowsSelected
            .replace('{selected}', String(table.getFilteredSelectedRowModel().rows.length))
            .replace('{total}', String(totalCount))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {labels.page.replace('{page}', String(pageIndex + 1)).replace('{pages}', String(pageCount))}
          </span>
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue aria-label={labels.pageSize} />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {labels.pageSize}: {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => onPageChange(pageIndex - 1)} disabled={!canGoPrevious}>
            {labels.previous}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onPageChange(pageIndex + 1)} disabled={!canGoNext}>
            {labels.next}
          </Button>
        </div>
      </div>

      <BulkActionBar
        actions={{
          onCategorize: (transactions, categoryId) => void runBulkCategory(transactions, categoryId),
          onTags: (mode) => void runBulkTags(mode),
          onHidden: (transactions, hidden) => void runBulkHidden(transactions, hidden),
          onMarkExpense: (transactions) => void runBulkClassification(transactions, 'expense'),
          onMarkIncome: (transactions) => void runBulkClassification(transactions, 'income'),
          onMarkInternal: (transactions) => void runBulkClassification(transactions, 'internal'),
          onMarkTransfer: (transactions) => void runBulkClassification(transactions, 'transfer'),
          onUnlinkTransfer: (transactions) => void runBulkUnlinkTransfer(transactions),
          onUnlinkMoneyBox: (transactions) => void runBulkUnlinkMoneyBox(transactions),
          onDeleteManual: (transactions) => void runBulkDeleteManual(transactions),
        }}
        bulkTagIds={bulkTagIds}
        categories={categories}
        containerRef={containerRef}
        labels={bulkActionLabels}
        limitExceeded={bulkLimitExceeded}
        onBulkTagIdsChange={setBulkTagIds}
        onClear={() => setRowSelection({})}
        tags={tags}
        transactions={selectedTransactions}
      />
    </div>
  );
}
