import { createFileRoute } from '@tanstack/react-router';

import { AccountsOverview } from '@/components/banking/accounts/accounts-view';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';

export const Route = createFileRoute('/_authenticated/_app/app/settings/accounts')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PanelErrorBoundary>
      <AccountsOverview section="accounts" />
    </PanelErrorBoundary>
  );
}
