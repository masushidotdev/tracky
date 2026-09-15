import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { LandmarkIcon } from 'lucide-react';

import { AccountsOverview } from '@/components/banking/accounts/accounts-view';
import { BankConnectionStatus } from '@/components/banking/accounts/bank-connection-status';
import { ConnectBankForm } from '@/components/banking/connect-bank-panel';
import { PanelErrorBoundary } from '@/components/banking/panel-error-boundary';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseBankConnectionSearch } from '@/lib/bank-connection-search';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/settings/bank-connections')({
  validateSearch: parseBankConnectionSearch,
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  const { t } = useI18n();
  const [connectBankOpen, setConnectBankOpen] = React.useState(false);

  return (
    <PanelErrorBoundary>
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Button type="button" variant="default" onClick={() => setConnectBankOpen(true)}>
            <LandmarkIcon data-icon="inline-start" />
            {t('connect.title')}
          </Button>
        </div>
        {search.bankConnectionState ? (
          <BankConnectionStatus state={search.bankConnectionState} fallbackStatus={search.bankConnectionStatus} />
        ) : null}
        <AccountsOverview section="connections" />
        <Dialog open={connectBankOpen} onOpenChange={setConnectBankOpen}>
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden sm:max-w-2xl">
            <DialogHeader className="shrink-0 pr-8">
              <DialogTitle>{t('connect.title')}</DialogTitle>
              <DialogDescription>{t('connect.description')}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">{connectBankOpen ? <ConnectBankForm /> : null}</div>
          </DialogContent>
        </Dialog>
      </div>
    </PanelErrorBoundary>
  );
}
