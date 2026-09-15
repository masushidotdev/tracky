import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { ForecastView } from '@/components/banking/forecast/forecast-view';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/forecast')({
  validateSearch: (search): { scenario?: string; compare?: string } => ({
    scenario: typeof search.scenario === 'string' ? search.scenario : undefined,
    compare: typeof search.compare === 'string' ? search.compare : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate();

  return (
    <AppPage title={t('forecast.title')} description={t('forecast.description')}>
      <PanelErrorBoundary>
        <ForecastView
          selectedScenarioId={search.scenario}
          compareScenarioId={search.compare}
          onSearchChange={(scenario, compare) => {
            void navigate({
              to: '/app/forecast',
              search: { scenario, compare },
              replace: true,
            });
          }}
        />
      </PanelErrorBoundary>
    </AppPage>
  );
}
