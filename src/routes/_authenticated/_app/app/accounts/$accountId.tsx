import { useSuspenseQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LandmarkIcon } from 'lucide-react';

import { api } from '../../../../../../convex/_generated/api';
import { AppPage } from '@/components/app/app-page';
import { EmptyState } from '@/components/app/empty-state';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { isTransactionSortKey } from '@/components/banking/transactions/filter-query';
import { TransactionsView } from '@/components/banking/transactions/transactions-view';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/accounts/$accountId')({
  validateSearch: (search): { q?: string; sort?: string; direction?: 'asc' | 'desc' } => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    sort: isTransactionSortKey(search.sort) ? search.sort : undefined,
    direction: search.direction === 'asc' || search.direction === 'desc' ? search.direction : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { accountId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data: account } = useSuspenseQuery(convexQuery(api.banking.accounts.getAccount, { accountId }));
  const sort = isTransactionSortKey(search.sort) ? search.sort : 'bookingDate';
  const direction = search.direction ?? 'desc';

  if (!account) {
    return (
      <AppPage>
        <EmptyState icon={LandmarkIcon} title={t('common.notFound')} />
      </AppPage>
    );
  }

  return (
    <AppPage title={account.alias?.trim() || account.name}>
      <PanelErrorBoundary>
        <TransactionsView
          filterQuery={search.q ?? ''}
          scopeAccountId={account._id}
          sortKey={sort}
          sortDirection={direction}
          onSearchChange={(query, nextSort, nextDirection) => {
            void navigate({
              to: '/app/accounts/$accountId',
              params: { accountId },
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
