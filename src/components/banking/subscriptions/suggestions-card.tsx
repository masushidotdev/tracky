import { TagIcon } from 'lucide-react';

import type { Transaction } from './helpers';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { TruncatedText } from '@/components/app/truncated-text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

export function SuggestionsCard({
  suggestions,
  isPending,
  onConfirm,
  onReject,
}: {
  suggestions: Array<Transaction> | undefined;
  isPending: (key?: string) => boolean;
  onConfirm: (transaction: Transaction) => void;
  onReject: (transaction: Transaction) => void;
}) {
  const { intlLocale, t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('subscriptions.suggestions.title')}</CardTitle>
        <CardDescription>{t('subscriptions.suggestions.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {suggestions === undefined ? <ListSkeleton rows={2} /> : null}
        {suggestions?.length === 0 ? (
          <EmptyState
            className="p-6"
            icon={TagIcon}
            title={t('subscriptions.suggestions.emptyTitle')}
            hint={t('subscriptions.suggestions.empty')}
          />
        ) : null}
        {suggestions?.map((transaction) => {
          const confirmKey = `subscription-suggestion-confirm:${transaction._id}`;
          const rejectKey = `subscription-suggestion-reject:${transaction._id}`;
          const pending = isPending(confirmKey) || isPending(rejectKey);

          return (
            <Card key={transaction._id} size="sm" className="shadow-none">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <CardContent className="flex min-w-0 flex-1 flex-col gap-2">
                  <TruncatedText
                    className="font-medium"
                    value={transaction.counterpartyName ?? transaction.description}
                  />
                  <div className="text-sm text-muted-foreground">
                    {t('subscriptions.suggestions.meta', {
                      amount: formatMoney(transaction.amount, intlLocale),
                      confidence: Math.round((transaction.classificationConfidence ?? 0) * 100),
                      date: transaction.bookingDate,
                    })}
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2 px-4 pb-4 sm:justify-end">
                  <Button size="sm" disabled={pending} onClick={() => onConfirm(transaction)}>
                    {isPending(confirmKey) ? <Spinner data-icon="inline-start" /> : null}
                    {t('transactions.confirm')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => onReject(transaction)}>
                    {isPending(rejectKey) ? <Spinner data-icon="inline-start" /> : null}
                    {t('transactions.reject')}
                  </Button>
                </CardFooter>
              </div>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}
