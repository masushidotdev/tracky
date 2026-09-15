import { createFileRoute } from '@tanstack/react-router';

import { ImportJobsSection } from '@/components/banking/accounts/import-jobs-section';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';

export const Route = createFileRoute('/_authenticated/_app/app/settings/import')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PanelErrorBoundary>
      <ImportJobsSection />
    </PanelErrorBoundary>
  );
}
