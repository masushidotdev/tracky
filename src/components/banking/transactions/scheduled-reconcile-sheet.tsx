import * as React from 'react';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { DetailSheet } from '@/components/app/detail-sheet';
import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuthedQuery } from '@/hooks/use-authed-query';
import { usePendingAction } from '@/hooks/use-pending-action';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

export function ScheduledReconcileSheet({
  onOpenChange,
  transaction,
}: {
  onOpenChange: (open: boolean) => void;
  transaction: Doc<'transactions'> | null;
}) {
  const { intlLocale, t } = useI18n();
  const { isPending, run } = usePendingAction();
  const reconcileScheduledTransaction = useMutation(
    api.banking.scheduledTransactions.reconcileScheduledTransaction,
  );
  const [selectedId, setSelectedId] = React.useState<Id<'transactions'> | null>(null);

  const candidates = useAuthedQuery(
    api.banking.scheduledTransactions.listScheduledReconciliationCandidates,
    transaction ? { scheduledTransactionId: transaction._id } : 'skip',
  );

  React.useEffect(() => {
    setSelectedId(null);
  }, [transaction?._id]);

  const pendingKey = transaction ? `reconcile-scheduled:${transaction._id}` : 'reconcile-scheduled';

  const confirm = () => {
    if (!transaction || !selectedId) return;

    void run(
      pendingKey,
      async () => {
        await reconcileScheduledTransaction({
          scheduledTransactionId: transaction._id,
          bookedTransactionId: selectedId,
        });
      },
      {
        success: t('transactions.scheduled.reconciled'),
        error: t('transactions.scheduled.reconcileFailed'),
      },
    ).then((done) => {
      if (done) onOpenChange(false);
    });
  };

  return (
    <DetailSheet
      open={transaction !== null}
      onOpenChange={onOpenChange}
      title={t('transactions.scheduled.reconcileTitle')}
      description={
        transaction
          ? t('transactions.scheduled.reconcileDescription', {
              description: transaction.description,
              date: formatIsoDate(transaction.bookingDate, intlLocale),
            })
          : undefined
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={!selectedId || isPending(pendingKey)} onClick={confirm}>
            {isPending(pendingKey) ? <Spinner data-icon="inline-start" /> : null}
            {isPending(pendingKey) ? t('transactions.scheduled.confirming') : t('transactions.scheduled.confirm')}
          </Button>
        </div>
      }
    >
      {transaction ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border p-3 text-sm">
            <div className="truncate font-medium">{transaction.description}</div>
            <div className="mt-1 flex items-center gap-2">
              <Amount
                variant="signed"
                direction={transaction.direction}
                money={transaction.amount}
                sensitive={false}
              />
              <span className="text-muted-foreground">{formatIsoDate(transaction.bookingDate, intlLocale)}</span>
            </div>
          </div>

          {candidates === undefined ? (
            <p className="text-sm text-muted-foreground">{t('transactions.scheduled.candidatesLoading')}</p>
          ) : candidates.length === 0 ? (
            <EmptyState title={t('transactions.scheduled.candidatesEmpty')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {candidates.map((candidate) => {
                const selected = candidate.transactionId === selectedId;
                return (
                  <li key={candidate.transactionId}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedId(candidate.transactionId)}
                      className={cn(
                        'flex w-full items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/50',
                        selected && 'border-primary bg-muted/50',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{candidate.description}</span>
                        {candidate.counterpartyName ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {candidate.counterpartyName}
                          </span>
                        ) : null}
                        <span className="block text-xs text-muted-foreground">
                          {formatIsoDate(candidate.bookingDate, intlLocale)} ·{' '}
                          {candidate.dayDelta === 0
                            ? t('transactions.scheduled.sameDay')
                            : t('transactions.scheduled.dayDelta', { days: candidate.dayDelta })}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Amount
                          variant="signed"
                          direction={candidate.direction}
                          money={candidate.amount}
                          className="text-sm font-medium"
                          sensitive={false}
                        />
                        <span className="text-xs text-muted-foreground">
                          {candidate.amountDeltaMinor === 0n
                            ? t('transactions.scheduled.sameAmount')
                            : t('transactions.scheduled.amountDelta', {
                                amount: formatMoney(
                                  { amountMinor: candidate.amountDeltaMinor, currency: candidate.amount.currency },
                                  intlLocale,
                                ),
                              })}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">{t('transactions.scheduled.reconcileEffect')}</p>
        </div>
      ) : null}
    </DetailSheet>
  );
}
