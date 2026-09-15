import { LandmarkIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';

import { accountGroupForType } from '../../../../convex/lib/accountTypes';
import { AccountRow } from './account-row';
import { ManualAccountDialog } from './manual-account-dialog';
import { MoneyBoxAccountRows } from './money-box-account-rows';
import { UpdateBalanceDialog } from './update-balance-dialog';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { api } from '../../../../convex/_generated/api';
import type { SyncOverviewRow } from './account-row';
import type { TranslationKey } from '@/lib/i18n';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type AccountsCardProps = {
  intlLocale: string;
  isPending: (key?: string) => boolean;
  labels: React.ComponentProps<typeof AccountRow>['labels'] & {
    addManual: string;
    description: string;
    empty: string;
    title: string;
    assetsTitle: string;
    cashTitle: string;
    moneyBoxManage: string;
    moneyBoxEmpty: string;
    moneyBoxSavedOfTarget: string;
    moneyBoxTitle: string;
    moneyBoxVirtual: string;
  };
  onRefreshAccount: (accountId: Id<'financialAccounts'>) => void;
  onRenewConsent: (connectionId: Id<'providerConnections'>) => void;
  onSetAccountAlias: (accountId: Id<'financialAccounts'>, alias: string) => void;
  onSetAccountHidden: (accountId: Id<'financialAccounts'>, hidden: boolean) => void;
  onToggleSync: (accountId: Id<'financialAccounts'>, syncEnabled: boolean) => void;
  moneyBoxes: FunctionReturnType<typeof api.banking.planning.listMoneyBoxFundingPlans> | undefined;
  syncOverview: Array<SyncOverviewRow> | undefined;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

export function AccountsCard({
  intlLocale,
  isPending,
  labels,
  onRefreshAccount,
  onRenewConsent,
  onSetAccountAlias,
  onSetAccountHidden,
  onToggleSync,
  moneyBoxes,
  syncOverview,
  t,
}: AccountsCardProps) {
  const [editingAccountId, setEditingAccountId] = React.useState<Id<'financialAccounts'> | null>(null);
  const [alias, setAlias] = React.useState('');
  const [manualDialogOpen, setManualDialogOpen] = React.useState(false);
  const [balanceRow, setBalanceRow] = React.useState<SyncOverviewRow | null>(null);
  const assetRows = syncOverview?.filter((row) => accountGroupForType(row.account.accountType) === 'asset') ?? [];
  const cashRows = syncOverview?.filter((row) => accountGroupForType(row.account.accountType) !== 'asset') ?? [];

  const beginEditing = React.useCallback((row: SyncOverviewRow) => {
    setEditingAccountId(row.account._id);
    setAlias(row.account.alias ?? '');
  }, []);

  const cancelEditing = React.useCallback(() => {
    setEditingAccountId(null);
    setAlias('');
  }, []);

  const saveAlias = React.useCallback(
    (accountId: Id<'financialAccounts'>) => {
      onSetAccountAlias(accountId, alias);
      cancelEditing();
    },
    [alias, cancelEditing, onSetAccountAlias],
  );

  const renderRow = (row: SyncOverviewRow) => (
    <AccountRow
      key={row.account._id}
      intlLocale={intlLocale}
      isPending={isPending}
      alias={alias}
      isEditing={editingAccountId === row.account._id}
      labels={labels}
      onAliasChange={setAlias}
      onBeginEditing={() => beginEditing(row)}
      onCancelEditing={cancelEditing}
      onRefreshAccount={onRefreshAccount}
      onRenewConsent={onRenewConsent}
      onSaveAlias={() => saveAlias(row.account._id)}
      onSetAccountHidden={onSetAccountHidden}
      onToggleSync={onToggleSync}
      onUpdateBalance={setBalanceRow}
      row={row}
      t={t}
    />
  );

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{labels.title}</CardTitle>
            <CardDescription>{labels.description}</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setManualDialogOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            {labels.addManual}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {syncOverview === undefined || moneyBoxes === undefined ? <ListSkeleton rows={3} /> : null}
        {syncOverview?.length === 0 && moneyBoxes?.length === 0 ? (
          <EmptyState icon={LandmarkIcon} title={labels.empty} />
        ) : null}
        {syncOverview !== undefined && moneyBoxes !== undefined ? (
          <div className="flex flex-col gap-6">
            {cashRows.length > 0 ? (
              <section>
                {assetRows.length > 0 ? <h3 className="mb-2 text-sm font-medium">{labels.cashTitle}</h3> : null}
                <div className="divide-y divide-border/60">{cashRows.map(renderRow)}</div>
              </section>
            ) : null}
            {assetRows.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-medium">{labels.assetsTitle}</h3>
                <div className="divide-y divide-border/60">{assetRows.map(renderRow)}</div>
              </section>
            ) : null}
            <MoneyBoxAccountRows
              moneyBoxes={moneyBoxes}
              labels={{
                empty: labels.moneyBoxEmpty,
                manage: labels.moneyBoxManage,
                savedOfTarget: labels.moneyBoxSavedOfTarget,
                title: labels.moneyBoxTitle,
                virtual: labels.moneyBoxVirtual,
              }}
            />
          </div>
        ) : null}
      </CardContent>
      <ManualAccountDialog open={manualDialogOpen} onOpenChange={setManualDialogOpen} />
      <UpdateBalanceDialog
        open={balanceRow !== null}
        row={balanceRow}
        onOpenChange={(open) => {
          if (!open) setBalanceRow(null);
        }}
      />
    </Card>
  );
}
