import { createFileRoute } from '@tanstack/react-router';

import { DashboardView } from '@/components/banking/dashboard/dashboard-view';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { AppPage } from '@/components/app/app-page';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/')({
  validateSearch: (search): { account?: string } => ({
    account: typeof search.account === 'string' ? search.account : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useI18n();

  return (
    <AppPage title={t('dashboard.title')} description={t('dashboard.description')}>
      <PanelErrorBoundary>
        <DashboardView />
      </PanelErrorBoundary>
    </AppPage>
  );
}
