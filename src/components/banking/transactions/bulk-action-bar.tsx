import * as React from 'react';
import { createPortal } from 'react-dom';
import { EyeIcon, EyeOffIcon, MoreHorizontalIcon, TagIcon, XIcon } from 'lucide-react';

import { TagPicker } from './tag-picker';
import type { TransactionRow } from './columns';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { CategoryPicker } from '@/components/categories/category-picker';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type BulkActionLabels = {
  categorize: string;
  chooseTags: string;
  addTags: string;
  removeTags: string;
  hide: string;
  unhide: string;
  more: string;
  clear: string;
  selected: string;
  limit: string;
  classify: string;
  markExpense: string;
  markIncome: string;
  markInternal: string;
  markTransfer: string;
  unlinkTransfer: string;
  unlinkMoneyBox: string;
  deleteManual: string;
};

export type BulkActions = {
  onCategorize: (transactions: Array<TransactionRow>, categoryId: Id<'categories'> | null) => void;
  onTags: (mode: 'add' | 'remove') => void;
  onHidden: (transactions: Array<TransactionRow>, hidden: boolean) => void;
  onMarkExpense: (transactions: Array<TransactionRow>) => void;
  onMarkIncome: (transactions: Array<TransactionRow>) => void;
  onMarkInternal: (transactions: Array<TransactionRow>) => void;
  onMarkTransfer: (transactions: Array<TransactionRow>) => void;
  onUnlinkTransfer: (transactions: Array<TransactionRow>) => void;
  onUnlinkMoneyBox: (transactions: Array<TransactionRow>) => void;
  onDeleteManual: (transactions: Array<TransactionRow>) => void;
};

/**
 * Floats over the table's content area, never the sidebar, and only while rows are selected. Actions
 * that cannot apply to the selection stay visible and disabled: a menu whose entries appear and
 * vanish with the selection is harder to learn than one that says why an entry is off.
 */
export function BulkActionBar({
  actions,
  bulkTagIds,
  categories,
  containerRef,
  labels,
  limitExceeded,
  onBulkTagIdsChange,
  onClear,
  tags,
  transactions,
}: {
  actions: BulkActions;
  bulkTagIds: Array<Id<'transactionTags'>>;
  categories: Array<Doc<'categories'>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  labels: BulkActionLabels;
  limitExceeded: boolean;
  onBulkTagIdsChange: (tagIds: Array<Id<'transactionTags'>>) => void;
  onClear: () => void;
  tags: Array<Doc<'transactionTags'>> | undefined;
  transactions: Array<TransactionRow>;
}) {
  const count = transactions.length;
  const hasTransfers = transactions.some((transaction) => transaction.transferPresentation?.matchId);
  const hasMoneyBoxes = transactions.some((transaction) => transaction.transferPresentation?.moneyBoxId);
  const hasManual = transactions.some((transaction) => transaction.provider === 'manual');
  const [containerBounds, setContainerBounds] = React.useState<{ left: number; width: number } | null>(null);
  const updatePosition = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { left, width } = container.getBoundingClientRect();
    setContainerBounds((current) =>
      current?.left === left && current.width === width ? current : { left, width },
    );
  }, [containerRef]);

  React.useEffect(() => {
    if (count === 0) return;

    const container = containerRef.current;
    if (!container) return;

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(container);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [containerRef, count, updatePosition]);

  if (count === 0 || !containerBounds || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed bottom-4 z-50 flex justify-center px-4"
      style={{ left: containerBounds.left, width: containerBounds.width }}
    >
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-full border bg-popover/95 px-3 py-2 shadow-lg ring-1 ring-foreground/5 backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 rounded-full"
          aria-label={labels.clear}
          onClick={onClear}
        >
          <XIcon className="size-3.5" />
          <span className="text-sm font-medium">{labels.selected}</span>
        </Button>
        <span className="h-5 w-px bg-border" aria-hidden />
        {/* The picker fills its container, so it is boxed to the width the bar can spare. */}
        <div className="w-44">
          <CategoryPicker
            categories={categories}
            category={null}
            triggerLabel={labels.categorize}
            onValueChange={(categoryId) => actions.onCategorize(transactions, categoryId)}
          />
        </div>
        <TagPicker
          allowCreate={false}
          tags={tags}
          selectedTagIds={bulkTagIds}
          onChange={onBulkTagIdsChange}
          triggerLabel={labels.chooseTags}
          maxSelected={100}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={bulkTagIds.length === 0 || limitExceeded}
          onClick={() => actions.onTags('add')}
        >
          <TagIcon className="size-3.5" />
          {labels.addTags}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={limitExceeded}
          onClick={() => actions.onHidden(transactions, true)}
        >
          <EyeOffIcon className="size-3.5" />
          {labels.hide}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={limitExceeded}>
              <MoreHorizontalIcon className="size-3.5" />
              {labels.more}
            </Button>
          </DropdownMenuTrigger>
          {/* Upwards: the bar already sits against the bottom edge. */}
          <DropdownMenuContent align="end" side="top">
            <DropdownMenuItem disabled={bulkTagIds.length === 0} onClick={() => actions.onTags('remove')}>
              {labels.removeTags}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onHidden(transactions, false)}>
              <EyeIcon />
              {labels.unhide}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{labels.classify}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => actions.onMarkExpense(transactions)}>{labels.markExpense}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onMarkIncome(transactions)}>{labels.markIncome}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onMarkInternal(transactions)}>
              {labels.markInternal}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onMarkTransfer(transactions)}>
              {labels.markTransfer}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!hasTransfers} onClick={() => actions.onUnlinkTransfer(transactions)}>
              {labels.unlinkTransfer}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasMoneyBoxes} onClick={() => actions.onUnlinkMoneyBox(transactions)}>
              {labels.unlinkMoneyBox}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!hasManual}
              onClick={() => actions.onDeleteManual(transactions)}
            >
              {labels.deleteManual}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {limitExceeded ? <span className="px-1 text-xs text-destructive">{labels.limit}</span> : null}
      </div>
    </div>,
    document.body,
  );
}
