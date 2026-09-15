import { createFileRoute } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { SubscriptionsView } from '@/components/banking/subscriptions/subscriptions-view';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/subscriptions/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useI18n();

  return (
    <AppPage title={t('subscriptions.title')} description={t('subscriptions.description')}>
      <PanelErrorBoundary>
        <SubscriptionsView />
      </PanelErrorBoundary>
    </AppPage>
  );
}
