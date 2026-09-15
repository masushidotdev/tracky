import { createFileRoute } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { CreateSubForm } from '@/components/create-sub-form';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/subscriptions/create')({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useI18n();

  return (
    <AppPage title={t('subscriptions.form.pageTitle')} description={t('subscriptions.form.pageDescription')}>
      <PanelErrorBoundary>
        <CreateSubForm />
      </PanelErrorBoundary>
    </AppPage>
  );
}
