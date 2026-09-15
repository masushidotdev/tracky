import { createFileRoute } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { ReportsView } from '@/components/banking/reports/reports-view';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/reports')({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useI18n();

  return (
    <AppPage title={t('reports.title')} description={t('reports.description')}>
      <PanelErrorBoundary>
        <ReportsView />
      </PanelErrorBoundary>
    </AppPage>
  );
}
