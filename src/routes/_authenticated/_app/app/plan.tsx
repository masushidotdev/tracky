import { createFileRoute } from '@tanstack/react-router';

import { AppPage } from '@/components/app/app-page';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { PlanView } from '@/components/banking/plan/plan-view';

export const Route = createFileRoute('/_authenticated/_app/app/plan')({
  component: RouteComponent,
});

function RouteComponent() {
  // No page title: the shell header already says "Plan", and the grid needs the vertical space.
  return (
    <AppPage fullHeight>
      <PanelErrorBoundary>
        <PlanView />
      </PanelErrorBoundary>
    </AppPage>
  );
}
