import { createFileRoute } from '@tanstack/react-router';

import { CreditFacilitiesView } from '@/components/banking/credit/credit-facilities-view';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';

export const Route = createFileRoute('/_authenticated/_app/app/settings/credit')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PanelErrorBoundary>
      <CreditFacilitiesView />
    </PanelErrorBoundary>
  );
}
