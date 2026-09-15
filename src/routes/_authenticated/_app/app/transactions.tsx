import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { isTransactionSortKey } from '@/components/banking/transactions/filter-query';
import { TransactionsView } from '@/components/banking/transactions/transactions-view';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/transactions')({
  validateSearch: (search): { q?: string; sort?: string; direction?: 'asc' | 'desc' } => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    sort: isTransactionSortKey(search.sort) ? search.sort : undefined,
    direction: search.direction === 'asc' || search.direction === 'desc' ? search.direction : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const sort = isTransactionSortKey(search.sort) ? search.sort : 'bookingDate';
  const direction = search.direction ?? 'desc';

  return (
    <AppPage title={t('transactions.title')} description={t('transactions.description')}>
      <PanelErrorBoundary>
        <TransactionsView
          filterQuery={search.q ?? ''}
          sortKey={sort}
          sortDirection={direction}
          onSearchChange={(query, nextSort, nextDirection) => {
            void navigate({
              to: '/app/transactions',
              search: {
                q: query || undefined,
                sort: nextSort === 'bookingDate' ? undefined : nextSort,
                direction: nextDirection === 'desc' ? undefined : nextDirection,
              },
              replace: true,
            });
          }}
        />
      </PanelErrorBoundary>
    </AppPage>
  );
}
