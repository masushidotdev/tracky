import { Link } from '@tanstack/react-router';
import { usePaginatedQuery } from 'convex/react';
import { ArrowLeftRightIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

type Transaction = Doc<'transactions'>;

const recentTransactionArgs = {
  categoryId: undefined,
  classificationKind: undefined,
  direction: undefined,
  status: undefined,
  fromDate: undefined,
  toDate: undefined,
  search: undefined,
  sortField: 'bookingDate' as const,
  sortDirection: 'desc' as const,
};

function transactionName(transaction: Transaction) {
  return transaction.description || transaction.counterpartyName || transaction.providerTransactionId;
}

export function RecentTransactionsCard({ accountId }: { accountId?: Id<'financialAccounts'> }) {
  const { intlLocale, t } = useI18n();
  const { results: transactions, status } = usePaginatedQuery(
    api.banking.transactions.listTransactions,
    { ...recentTransactionArgs, accountId },
    {
      initialNumItems: 8,
    },
  );
  const isLoading = status === 'LoadingFirstPage';

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t('dashboard.recent.title')}</CardTitle>
        <CardAction>
          <Link to="/app/transactions" className="text-sm text-muted-foreground hover:text-foreground">
            {t('dashboard.viewAll')}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? <ListSkeleton rows={8} /> : null}
        {!isLoading && transactions.length === 0 ? (
          <EmptyState
            className="min-h-56 border-0 p-0"
            icon={ArrowLeftRightIcon}
            title={t('dashboard.recent.emptyTitle')}
            hint={t('dashboard.recent.empty')}
          />
        ) : null}
        {!isLoading && transactions.length > 0 ? (
          <div className="divide-y divide-border/60">
            {transactions.map((transaction) => (
              <div key={transaction._id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{transactionName(transaction)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatIsoDate(transaction.bookingDate, intlLocale)}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-medium">
                  <Amount
                    money={transaction.amount}
                    variant="signed"
                    direction={transaction.direction}
                    sensitive={false}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
