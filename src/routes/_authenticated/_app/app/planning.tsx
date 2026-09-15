import { createFileRoute } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { PlanningPanel } from '@/components/banking/planning-panel';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/planning')({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useI18n();

  return (
    <AppPage title={t('planning.title')} description={t('planning.description')}>
      <PanelErrorBoundary>
        <PlanningPanel />
      </PanelErrorBoundary>
    </AppPage>
  );
}
