import { createFileRoute } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { CsvImportWizard } from '@/components/banking/import/csv-import-wizard';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/import')({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useI18n();
  return (
    <AppPage title={t('import.title')} description={t('import.description')}>
      <PanelErrorBoundary>
        <CsvImportWizard />
      </PanelErrorBoundary>
    </AppPage>
  );
}
