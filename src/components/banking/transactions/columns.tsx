import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2Icon,
  ExternalLinkIcon,
  EyeOffIcon,
  MoreHorizontal,
  PiggyBankIcon,
  Repeat2Icon,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import type { Column, ColumnDef } from '@tanstack/react-table';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { I18nContextValue } from '@/lib/i18n';
import { Amount } from '@/components/app/amount';
import { TagBadge } from '@/components/app/tag-badge';
import { CategoryPicker } from '@/components/categories/category-picker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { accountLabel } from '@/lib/accounts';
import { categoryDisplayName, categorySupportsKind } from '@/lib/categories';
import { formatIsoDate } from '@/lib/format';

export type PlannedOccurrenceRow = {
  plannedTransactionId: Id<'plannedTransactions'>;
  dueDate: string;
  recurrence: {
    interval: 'day' | 'week' | 'month' | 'year';
    count: number;
  };
  recurrenceLabel: string;
};

export type TransactionRow = Doc<'transactions'> & {
  account: Doc<'financialAccounts'> | null;
  category: Doc<'categories'> | null;
  plannedOccurrence?: PlannedOccurrenceRow;
  creditInstallmentAllocation?: {
    paymentCount: number;
    amount: {
      amountMinor: bigint;
      currency: string;
    };
    facilityNames: Array<string>;
    planNames: Array<string>;
  };
  transferPresentation?: {
    kind: 'matched' | 'unmatched';
    matchId?: Id<'transferMatches'>;
    moneyBoxId?: Id<'moneyBoxes'>;
    moneyBoxName?: string;
    sourceLabel: string | null;
    destinationLabel: string | null;
    neutralAmount: Doc<'transactions'>['amount'];
    amountDelta?: Doc<'transactions'>['amount'];
    feeAmount?: Doc<'transactions'>['amount'];
    outgoing?: Doc<'transactions'>;
    incoming?: Doc<'transactions'>;
    sortDate: string;
    dateLabel: string;
  };
};

type TransactionColumnLabels = {
  account: string;
  actions: string;
  category: string;
  categoryNotNeeded: string;
  categoryTransfers: string;
  categoryUncategorized: string;
  classification: string;
  copyId: string;
  creditPlans: string;
  date: string;
  deleteManual: string;
  description: string;
  editManual: string;
  expense: string;
  income: string;
  internal: string;
  hiddenFromReports: string;
  inflow: string;
  installmentPayment: string;
  memo: string;
  outflow: string;
  payee: string;
  matchTransfer: string;
  createCounterpart: string;
  unlinkTransfer: string;
  associateMoneyBox: string;
  changeMoneyBox: string;
  unlinkMoneyBox: string;
  unmatchedTransfer: string;
  transferDetails: string;
  transferPayee: string;
  unknownDestination: string;
  unknownSource: string;
  openMenu: string;
  openPlanning: string;
  plannedMarkPaid: string;
  reconcileScheduled: string;
  repeatMarker: string;
  selectAll: string;
  selectRow: string;
  subscription: string;
  tagOverflow: string;
};

export type TransactionColumnActions = {
  onAssignCategory: (transaction: Doc<'transactions'>, categoryId: Id<'categories'> | null) => void;
  onDeleteManualTransaction: (transaction: TransactionRow) => void;
  onEditManualTransaction: (transaction: TransactionRow) => void;
  onMarkExpense: (transaction: TransactionRow) => void;
  onMarkIncome: (transaction: TransactionRow) => void;
  onMarkInternal: (transaction: TransactionRow) => void;
  onMarkUnmatchedTransfer: (transaction: TransactionRow) => void;
  onMarkSubscription: (transaction: TransactionRow) => void;
  onMarkPlannedOccurrencePaid: (occurrence: PlannedOccurrenceRow) => void;
  onOpenPlanning: () => void;
  onReconcileScheduled: (transaction: TransactionRow) => void;
  onStartInstallmentMatch: (transaction: TransactionRow) => void;
  onStartTransferMatch: (transaction: TransactionRow) => void;
  onStartCounterpartTransfer: (transaction: TransactionRow) => void;
  onUnlinkTransfer: (transaction: TransactionRow) => void;
  onStartMoneyBoxAssociation: (transaction: TransactionRow) => void;
  onUnlinkMoneyBox: (transaction: TransactionRow) => void;
};

type CreateTransactionColumnsArgs = {
  categories: Array<Doc<'categories'>>;
  intlLocale: string;
  tags: Array<Doc<'transactionTags'>>;
  translate: I18nContextValue['t'];
  labels: TransactionColumnLabels;
  actions: TransactionColumnActions;
};

function transferEndpointLabels(row: TransactionRow, labels: TransactionColumnLabels) {
  const transfer = row.transferPresentation;
  return {
    source: transfer?.sourceLabel ?? labels.unknownSource,
    destination: transfer?.destinationLabel ?? labels.unknownDestination,
  };
}

function formattedBookingDate(value: string, locale: string) {
  return formatIsoDate(value, locale);
}

function transferDateLabel(row: TransactionRow, locale: string) {
  const transfer = row.transferPresentation;
  if (!transfer) {
    return formattedBookingDate(row.bookingDate, locale);
  }

  const dates = [transfer.outgoing?.bookingDate, transfer.incoming?.bookingDate].filter((date): date is string =>
    Boolean(date),
  );
  const uniqueDates = [...new Set(dates)].sort((left, right) => left.localeCompare(right));

  if (uniqueDates.length === 0) {
    return transfer.dateLabel || formattedBookingDate(row.bookingDate, locale);
  }

  if (uniqueDates.length === 1) {
    return formattedBookingDate(uniqueDates[0], locale);
  }

  return `${formattedBookingDate(uniqueDates[0], locale)} - ${formattedBookingDate(uniqueDates[uniqueDates.length - 1], locale)}`;
}

function classificationIcon(transaction: TransactionRow, labels: TransactionColumnLabels) {
  const isTransfer = transaction.classificationKind === 'transfer' || transaction.classificationKind === 'internal';
  const isIncoming = transaction.classificationKind === 'income' || transaction.direction === 'CRDT';
  const Icon = isTransfer ? ArrowLeftRight : isIncoming ? TrendingUp : TrendingDown;
  const label =
    transaction.classificationKind === 'uncategorized'
      ? labels.categoryUncategorized
      : transaction.classificationKind === 'expense'
        ? labels.expense
        : transaction.classificationKind === 'income'
          ? labels.income
          : transaction.classificationKind === 'subscription'
            ? labels.subscription
            : transaction.classificationKind === 'internal'
              ? labels.internal
              : labels.categoryTransfers;

  return (
    <span
      className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon />
    </span>
  );
}

function transactionMetaBadges(
  transaction: TransactionRow,
  tagsById: Map<Id<'transactionTags'>, Doc<'transactionTags'>>,
  labels: TransactionColumnLabels,
) {
  const tags = (transaction.tagIds ?? [])
    .map((tagId) => tagsById.get(tagId))
    .filter((tag): tag is Doc<'transactionTags'> => Boolean(tag));
  const visibleTags = tags.slice(0, 2);
  const overflow = tags.length - visibleTags.length;

  if (visibleTags.length === 0 && !transaction.hiddenFromReports) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {visibleTags.map((tag) => (
        <TagBadge key={tag._id} tag={tag} className="h-5 max-w-28 px-1.5 text-[10px]" />
      ))}
      {overflow > 0 ? (
        <span className="text-[10px] text-muted-foreground">
          {labels.tagOverflow.replace('{count}', String(overflow))}
        </span>
      ) : null}
      {transaction.hiddenFromReports ? (
        <span title={labels.hiddenFromReports} aria-label={labels.hiddenFromReports} className="text-muted-foreground">
          <EyeOffIcon className="size-3.5" />
        </span>
      ) : null}
    </div>
  );
}

function sortButton(label: string, column: Column<TransactionRow>, align: 'left' | 'right' = 'left') {
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <Button
      variant="ghost"
      className={align === 'right' ? '-mr-3 ml-auto h-8 px-2' : '-ml-3 h-8 px-2'}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      {label}
      <Icon data-icon="inline-end" />
    </Button>
  );
}

export function createTransactionColumns({
  categories,
  intlLocale,
  tags,
  translate,
  labels,
  actions,
}: CreateTransactionColumnsArgs): Array<ColumnDef<TransactionRow>> {
  const categoriesById = new Map(categories.map((category) => [category._id, category]));
  const tagsById = new Map(tags.map((tag) => [tag._id, tag]));

  return [
    {
      id: 'select',
      size: 44,
      minSize: 44,
      maxSize: 44,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
          onClick={(event) => event.stopPropagation()}
          aria-label={labels.selectAll}
        />
      ),
      cell: ({ row }) =>
        row.original.plannedOccurrence ? null : (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
            onClick={(event) => event.stopPropagation()}
            aria-label={labels.selectRow}
          />
        ),
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    },
    {
      id: 'account',
      size: 95,
      accessorFn: (row) => accountLabel(row.account),
      header: ({ column }) => sortButton(labels.account, column),
      cell: ({ row }) => (
        <span className="block truncate text-muted-foreground">{accountLabel(row.original.account)}</span>
      ),
    },
    {
      accessorKey: 'bookingDate',
      size: 85,
      header: ({ column }) => sortButton(labels.date, column),
      cell: ({ row }) => {
        const date = transferDateLabel(row.original, intlLocale);
        const occurrence = row.original.plannedOccurrence;
        if (!occurrence) {
          return date;
        }

        const repeatLabel = labels.repeatMarker.replace('{recurrence}', occurrence.recurrenceLabel);
        return (
          <span className="flex items-center gap-1.5">
            <span>{date}</span>
            <Repeat2Icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={repeatLabel}>
              <title>{repeatLabel}</title>
            </Repeat2Icon>
          </span>
        );
      },
    },
    {
      accessorKey: 'counterpartyName',
      size: 180,
      header: ({ column }) => sortButton(labels.payee, column),
      cell: ({ row }) => {
        if (row.original.transferPresentation) {
          const { source, destination } = transferEndpointLabels(row.original, labels);
          // Name the other side of the move: money leaving shows where it went, money arriving
          // shows where it came from.
          const counterAccount = row.original.direction === 'DBIT' ? destination : source;

          return (
            <div className="flex max-w-full items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">
                {labels.transferPayee.replace('{account}', counterAccount)}
              </span>
              <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" />
            </div>
          );
        }

        return <div className="max-w-full truncate">{row.original.counterpartyName?.trim() || '—'}</div>;
      },
    },
    {
      accessorKey: 'description',
      size: 105,
      header: ({ column }) => sortButton(labels.description, column),
      cell: ({ row }) => {
        const transfer = row.original.transferPresentation;

        return (
          <div className="max-w-full">
            <div className={transfer ? 'truncate text-xs text-muted-foreground' : 'truncate font-medium'}>
              {transfer ? labels.transferDetails : row.original.description}
            </div>
            {row.original.creditInstallmentAllocation ? (
              <div className="truncate text-xs text-muted-foreground">
                {row.original.creditInstallmentAllocation.paymentCount} {labels.creditPlans} ·{' '}
                {row.original.creditInstallmentAllocation.facilityNames.join(', ')}
              </div>
            ) : null}
            {transactionMetaBadges(row.original, tagsById, labels)}
          </div>
        );
      },
    },
    {
      accessorKey: 'classificationKind',
      size: 85,
      header: ({ column }) => sortButton(labels.classification, column),
      cell: ({ row }) => classificationIcon(row.original, labels),
    },
    {
      id: 'category',
      size: 160,
      header: ({ column }) => sortButton(labels.category, column),
      cell: ({ row }) => {
        if (row.original.plannedOccurrence) {
          return row.original.category ? (
            <span className="block truncate">{categoryDisplayName(row.original.category, translate)}</span>
          ) : (
            <span className="text-muted-foreground">{labels.categoryUncategorized}</span>
          );
        }

        const categoryTarget =
          row.original.transferPresentation?.kind === 'matched'
            ? (row.original.transferPresentation.outgoing ?? row.original)
            : row.original;
        const category = categoryTarget.categoryId ? (categoriesById.get(categoryTarget.categoryId) ?? null) : null;

        // Nothing reads a transfer's category — reports and plan activity skip the row before they
        // look at it — but assigning an expense-only one flips the row to 'expense'
        // (classificationKindForCategory), and a move between your own accounts then counts as
        // spending. Reclassifying stays possible from the row menu.
        if (categoryTarget.classificationKind === 'transfer') {
          return <span className="text-muted-foreground">{labels.categoryNotNeeded}</span>;
        }

        // 'internal' is the loan/mortgage repayment case: only categories that declare 'internal'
        // keep the row internal instead of turning the repayment into fresh spending.
        const selectableCategories =
          categoryTarget.classificationKind === 'internal'
            ? categories.filter((candidate) => categorySupportsKind(candidate, 'internal'))
            : categories;

        return (
          <CategoryPicker
            categories={selectableCategories}
            category={category}
            onValueChange={(categoryId) => actions.onAssignCategory(categoryTarget, categoryId)}
          />
        );
      },
    },
    {
      accessorKey: 'note',
      size: 85,
      header: ({ column }) => sortButton(labels.memo, column),
      cell: ({ row }) => (
        <span className="block max-w-full truncate text-muted-foreground">{row.original.note?.trim() || '—'}</span>
      ),
    },
    {
      id: 'outflow',
      size: 85,
      accessorFn: (row) => (row.direction === 'DBIT' ? Number(row.amount.amountMinor) : undefined),
      header: ({ column }) => sortButton(labels.outflow, column, 'right'),
      cell: ({ row }) =>
        row.original.direction === 'DBIT' ? (
          <div className="text-right font-medium">
            <Amount
              variant="neutral"
              direction={row.original.direction}
              money={row.original.transferPresentation?.neutralAmount ?? row.original.amount}
              sensitive={false}
            />
          </div>
        ) : null,
    },
    {
      id: 'inflow',
      size: 85,
      accessorFn: (row) => (row.direction === 'CRDT' ? Number(row.amount.amountMinor) : undefined),
      header: ({ column }) => sortButton(labels.inflow, column, 'right'),
      cell: ({ row }) =>
        row.original.direction === 'CRDT' ? (
          <div className="text-right font-medium">
            <Amount
              variant="neutral"
              direction={row.original.direction}
              money={row.original.transferPresentation?.neutralAmount ?? row.original.amount}
              sensitive={false}
            />
          </div>
        ) : null,
    },
    {
      id: 'actions',
      size: 52,
      minSize: 52,
      maxSize: 52,
      enableHiding: false,
      enableResizing: false,
      cell: ({ row }) => {
        const transaction = row.original;
        const plannedOccurrence = transaction.plannedOccurrence;
        if (plannedOccurrence) {
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="size-8 p-0" onClick={(event) => event.stopPropagation()}>
                  <span className="sr-only">{labels.openMenu}</span>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{labels.actions}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => actions.onMarkPlannedOccurrencePaid(plannedOccurrence)}>
                  <CheckCircle2Icon />
                  {labels.plannedMarkPaid}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={actions.onOpenPlanning}>
                  <ExternalLinkIcon />
                  {labels.openPlanning}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        const isMatchedTransfer = transaction.transferPresentation?.kind === 'matched';

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="size-8 p-0" onClick={(event) => event.stopPropagation()}>
                <span className="sr-only">{labels.openMenu}</span>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{labels.actions}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(transaction._id)}>
                {labels.copyId}
              </DropdownMenuItem>
              {/* A scheduled row is settled by the booked one that eventually arrives, never by
                  itself: reconciling is the only action specific to it. */}
              {transaction.status === 'SCHD' ? (
                <DropdownMenuItem onClick={() => actions.onReconcileScheduled(transaction)}>
                  {labels.reconcileScheduled}
                </DropdownMenuItem>
              ) : null}
              {!isMatchedTransfer && transaction.direction === 'DBIT' ? (
                <DropdownMenuItem onClick={() => actions.onMarkSubscription(transaction)}>
                  {labels.subscription}
                </DropdownMenuItem>
              ) : null}
              {!isMatchedTransfer && transaction.direction === 'DBIT' ? (
                <DropdownMenuItem onClick={() => actions.onStartInstallmentMatch(transaction)}>
                  {labels.installmentPayment}
                </DropdownMenuItem>
              ) : null}
              {!isMatchedTransfer ? (
                <DropdownMenuItem onClick={() => actions.onStartTransferMatch(transaction)}>
                  {labels.matchTransfer}
                </DropdownMenuItem>
              ) : null}
              {/* 'internal' movements are single-leg liability repayments: the mutation
                  rejects them, so the action stays hidden instead of failing on click. */}
              {!isMatchedTransfer && transaction.classificationKind !== 'internal' ? (
                <DropdownMenuItem onClick={() => actions.onStartCounterpartTransfer(transaction)}>
                  {labels.createCounterpart}
                </DropdownMenuItem>
              ) : null}
              {isMatchedTransfer && transaction.transferPresentation?.matchId ? (
                <DropdownMenuItem onClick={() => actions.onUnlinkTransfer(transaction)}>
                  {labels.unlinkTransfer}
                </DropdownMenuItem>
              ) : null}
              {!isMatchedTransfer && transaction.classificationKind === 'transfer' ? (
                <DropdownMenuItem onClick={() => actions.onStartMoneyBoxAssociation(transaction)}>
                  <PiggyBankIcon />
                  {transaction.transferPresentation?.moneyBoxId ? labels.changeMoneyBox : labels.associateMoneyBox}
                </DropdownMenuItem>
              ) : null}
              {!isMatchedTransfer && transaction.transferPresentation?.moneyBoxId ? (
                <DropdownMenuItem onClick={() => actions.onUnlinkMoneyBox(transaction)}>
                  {labels.unlinkMoneyBox}
                </DropdownMenuItem>
              ) : null}
              {!isMatchedTransfer ? (
                <DropdownMenuItem onClick={() => actions.onMarkUnmatchedTransfer(transaction)}>
                  {labels.unmatchedTransfer}
                </DropdownMenuItem>
              ) : null}
              {!isMatchedTransfer &&
              transaction.direction === 'DBIT' &&
              transaction.classificationKind !== 'internal' ? (
                <DropdownMenuItem onClick={() => actions.onMarkInternal(transaction)}>
                  {labels.internal}
                </DropdownMenuItem>
              ) : null}
              {/* Mirrors the "mark internal" condition above. Offering these only for uncategorized
                  rows made marking a movement internal a one-way door: a mortgage payment classified
                  internal could never be turned back into the spending it actually is. */}
              {!isMatchedTransfer &&
              transaction.direction === 'DBIT' &&
              transaction.classificationKind !== 'expense' ? (
                <DropdownMenuItem onClick={() => actions.onMarkExpense(transaction)}>{labels.expense}</DropdownMenuItem>
              ) : null}
              {!isMatchedTransfer && transaction.direction === 'CRDT' && transaction.classificationKind !== 'income' ? (
                <DropdownMenuItem onClick={() => actions.onMarkIncome(transaction)}>{labels.income}</DropdownMenuItem>
              ) : null}
              {transaction.provider === 'manual' ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => actions.onEditManualTransaction(transaction)}>
                    {labels.editManual}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => actions.onDeleteManualTransaction(transaction)}
                  >
                    {labels.deleteManual}
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>{transaction.provider}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
