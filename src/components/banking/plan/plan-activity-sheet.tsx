import { AlertTriangleIcon, ReceiptTextIcon } from 'lucide-react';

import type { PlanBucket, PlanBucketTransactions, PlanCategory, PlanOutOfPlanTransactions } from './types';
import { Amount } from '@/components/app/amount';
import { DetailSheet } from '@/components/app/detail-sheet';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatIsoDate } from '@/lib/format';
import { accountLabel } from '@/lib/accounts';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type PlanActivitySelection =
  | { type: 'bucket'; bucket: PlanBucket }
  | { type: 'outOfPlan'; label: string; totalMinor: bigint }
  | null;

function BucketActivityRows({
  categoryNames,
  rows,
  showCategory = true,
}: {
  categoryNames: Map<string, string>;
  rows: PlanBucketTransactions['rows'];
  showCategory?: boolean;
}) {
  const { intlLocale, t } = useI18n();

  return (
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
              <Amount money={row.amount} variant="signed" direction={row.direction} className="shrink-0 text-sm" />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>{formatIsoDate(row.bookingDate, intlLocale)}</span>
              {showCategory ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {row.categoryId
                      ? (categoryNames.get(row.categoryId) ?? t('plan.activity.unknownCategory'))
                      : t('plan.activity.uncategorized')}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PlanActivitySheet({
  bucketResult,
  categories,
  currency,
  onOpenChange,
  open,
  outOfPlanResult,
  selection,
}: {
  bucketResult: PlanBucketTransactions | undefined;
  categories: Array<PlanCategory>;
  currency: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  outOfPlanResult: PlanOutOfPlanTransactions | undefined;
  selection: PlanActivitySelection;
}) {
  const { intlLocale, t } = useI18n();
  const categoryNames = new Map(categories.map((category) => [category._id, category.name]));
  const result = selection?.type === 'outOfPlan' ? outOfPlanResult : bucketResult;
  const cardBucket = selection?.type === 'bucket' && selection.bucket.cardAccountId !== null;
  const totalMinor =
    selection?.type === 'outOfPlan'
      ? selection.totalMinor
      : selection?.type === 'bucket'
        ? (bucketResult?.totalMinor ??
          selection.bucket.activityMinor + (cardBucket ? selection.bucket.coveredCardSpendMinor : 0n))
        : 0n;
  const title =
    selection?.type === 'outOfPlan'
      ? selection.label
      : selection?.type === 'bucket'
        ? t('plan.activity.title', { name: selection.bucket.name })
        : t('plan.activity.fallbackTitle');
  const outOfPlan = selection?.type === 'outOfPlan';

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={title}
      description={
        outOfPlan
          ? t('plan.outOfPlan.activity.description')
          : cardBucket
            ? t('plan.activity.cardDescription')
            : t('plan.activity.description')
      }
    >
      {selection ? (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl bg-muted/60 px-4 py-3">
          <span className="text-sm text-muted-foreground">{t('plan.activity.rowTotal')}</span>
          <Amount
            money={{ amountMinor: totalMinor, currency }}
            className={cn('font-medium', totalMinor > 0n ? 'text-positive' : undefined)}
          />
        </div>
      ) : null}
      {result === undefined ? <ListSkeleton rows={6} /> : null}
      {result?.truncated ? (
        <Alert className="mb-4 border-warning/40 bg-warning/5">
          <AlertTriangleIcon className="text-warning" />
          <AlertTitle>{t('plan.activity.truncatedTitle')}</AlertTitle>
          <AlertDescription>{t('plan.activity.truncatedDescription')}</AlertDescription>
        </Alert>
      ) : null}
      {result && result.rows.length === 0 ? (
        <EmptyState
          className="min-h-64 border-0"
          icon={ReceiptTextIcon}
          title={outOfPlan ? t('plan.outOfPlan.activity.empty') : t('plan.activity.empty')}
          hint={outOfPlan ? t('plan.outOfPlan.activity.emptyHint') : t('plan.activity.emptyHint')}
        />
      ) : null}
      {selection?.type === 'bucket' && bucketResult && bucketResult.rows.length > 0 ? (
        cardBucket ? (
          <div className="flex flex-col gap-6">
            {bucketResult.rows.some((row) => row.kind === 'coveredPurchase') ? (
              <section>
                <h3 className="text-sm font-medium">{t('plan.activity.coveredPurchases')}</h3>
                <BucketActivityRows
                  categoryNames={categoryNames}
                  rows={bucketResult.rows.filter((row) => row.kind === 'coveredPurchase')}
                />
              </section>
            ) : null}
            {bucketResult.rows.some((row) => row.kind === 'payment') ? (
              <section>
                <h3 className="text-sm font-medium">{t('plan.activity.statementPayments')}</h3>
                <BucketActivityRows
                  categoryNames={categoryNames}
                  rows={bucketResult.rows.filter((row) => row.kind === 'payment')}
                  showCategory={false}
                />
              </section>
            ) : null}
          </div>
        ) : (
          <BucketActivityRows categoryNames={categoryNames} rows={bucketResult.rows} />
        )
      ) : null}
      {selection?.type === 'outOfPlan' && outOfPlanResult && outOfPlanResult.rows.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {outOfPlanResult.rows.map((row) => (
            <li key={row._id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.counterpartyName ?? row.description}</p>
                    {row.counterpartyName ? (
                      <p className="truncate text-xs text-muted-foreground">{row.description}</p>
                    ) : null}
                  </div>
                  <Amount money={row.amount} variant="signed" direction={row.direction} className="shrink-0 text-sm" />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>{formatIsoDate(row.bookingDate, intlLocale)}</span>
                  <span aria-hidden="true">·</span>
                  <span title={row.accountId}>{accountLabel(row)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </DetailSheet>
  );
}
