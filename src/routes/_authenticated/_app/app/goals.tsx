import { createFileRoute } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { GoalsView } from '@/components/banking/goals/goals-view';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/goals')({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useI18n();

  return (
    <AppPage title={t('goals.title')} description={t('goals.description')}>
      <PanelErrorBoundary>
        <GoalsView />
      </PanelErrorBoundary>
    </AppPage>
  );
}
