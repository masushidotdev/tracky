import { ReceiptTextIcon } from 'lucide-react';

import type { ReportCategoryOption, ReportSegmentSelection, ReportTransaction } from './types';
import { Amount } from '@/components/app/amount';
import { DetailSheet } from '@/components/app/detail-sheet';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Button } from '@/components/ui/button';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export function ReportTransactionsSheet({
  categories,
  hasMore,
  loading,
  loadingMore,
  onLoadMore,
  onOpenChange,
  open,
  rows,
  selection,
}: {
  categories: Array<ReportCategoryOption> | undefined;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  rows: Array<ReportTransaction>;
  selection: ReportSegmentSelection | null;
}) {
  const { intlLocale, t } = useI18n();
  const categoryNames = new Map(categories?.map((category) => [category.id, category.label]) ?? []);

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={selection?.label ?? t('reports.transactions.title')}
      description={selection ? t('reports.transactions.description', { currency: selection.currency }) : undefined}
      footer={
        hasMore ? (
          <Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('reports.transactions.loadMore')}
          </Button>
        ) : undefined
      }
    >
      {loading && rows.length === 0 ? <ListSkeleton rows={6} /> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState
          className="min-h-64 border-0"
          icon={ReceiptTextIcon}
          title={t('reports.transactions.empty')}
          hint={t('reports.transactions.emptyHint')}
        />
      ) : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {rows.map((row) => (
            <li key={row._id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.counterpartyName ?? row.description}</p>
                    {row.counterpartyName ? (
                      <p className="truncate text-xs text-muted-foreground">{row.description}</p>
                    ) : null}
                  </div>
                  <Amount
                    money={row.amount}
                    variant="signed"
                    direction={row.direction}
                    className="shrink-0 text-sm"
                    sensitive={false}
                  />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>{formatIsoDate(row.bookingDate, intlLocale)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {row.categoryId
                      ? (categoryNames.get(row.categoryId) ?? t('reports.transactions.unknownCategory'))
                      : t('reports.transactions.uncategorized')}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </DetailSheet>
  );
}
