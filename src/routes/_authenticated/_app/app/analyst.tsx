import { createFileRoute } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { AnalystView } from '@/components/banking/analyst/analyst-view';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/analyst')({
  validateSearch: (search): { thread?: string } => ({
    thread: typeof search.thread === 'string' ? search.thread : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useI18n();
  const search = Route.useSearch();

  return (
    <AppPage title={t('analyst.title')} description={t('analyst.description')}>
      <PanelErrorBoundary>
        <AnalystView threadId={search.thread} />
      </PanelErrorBoundary>
    </AppPage>
  );
}
