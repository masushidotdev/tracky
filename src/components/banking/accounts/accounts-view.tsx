import * as React from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import { api } from '../../../../convex/_generated/api';
import { AccountsCard } from './accounts-card';
import { ConnectionsCard } from './connections-card';
import type { Id } from '../../../../convex/_generated/dataModel';
import { useI18n } from '@/lib/i18n';
import { usePendingAction } from '@/hooks/use-pending-action';

type AccountsOverviewProps = {
  section: 'accounts' | 'connections';
};

export function AccountsOverview({ section }: AccountsOverviewProps) {
  const { intlLocale, t } = useI18n();
  const { isPending, run } = usePendingAction();
  const showAccounts = section === 'accounts';
  const syncOverview = useQuery(api.banking.accounts.listSyncOverview, showAccounts ? { limit: 50 } : 'skip');
  const connections = useQuery(
    api.banking.accounts.listConnections,
    section === 'connections' ? { limit: 20 } : 'skip',
  );
  const moneyBoxes = useQuery(
    api.banking.planning.listMoneyBoxFundingPlans,
    showAccounts ? { status: 'active', limit: 100 } : 'skip',
  );
  const setAccountSyncEnabled = useMutation(api.banking.accounts.setAccountSyncEnabled).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.banking.accounts.listSyncOverview, { limit: 50 });
      if (!current) {
        return;
      }

      localStore.setQuery(
        api.banking.accounts.listSyncOverview,
        { limit: 50 },
        current.map((row) =>
          row.account._id === args.accountId
            ? { ...row, account: { ...row.account, syncEnabled: args.syncEnabled } }
            : row,
        ),
      );
    },
  );
  const setAccountHidden = useMutation(api.banking.accounts.setAccountHidden).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.banking.accounts.listSyncOverview, { limit: 50 });
      if (!current) {
        return;
      }

      localStore.setQuery(
        api.banking.accounts.listSyncOverview,
        { limit: 50 },
        current.map((row) =>
          row.account._id === args.accountId ? { ...row, account: { ...row.account, hidden: args.hidden } } : row,
        ),
      );
    },
  );
  const setAccountAlias = useMutation(api.banking.accounts.setAccountAlias).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.banking.accounts.listSyncOverview, { limit: 50 });
    if (!current) {
      return;
    }

    localStore.setQuery(
      api.banking.accounts.listSyncOverview,
      { limit: 50 },
      current.map((row) =>
        row.account._id === args.accountId
          ? { ...row, account: { ...row.account, alias: args.alias?.trim() || null } }
          : row,
      ),
    );
  });
  const repairDuplicateAccountIdentities = useMutation(api.banking.accounts.repairDuplicateAccountIdentities);
  const reauthorizeConnection = useAction(api.banking.enableBanking.reauthorizeConnection);
  const syncAccountNow = useAction(api.banking.enableBanking.syncAccountNow);
  const hasRequestedDuplicateRepairRef = React.useRef(false);

  React.useEffect(() => {
    if (syncOverview === undefined || hasRequestedDuplicateRepairRef.current) {
      return;
    }

    hasRequestedDuplicateRepairRef.current = true;
    void repairDuplicateAccountIdentities().catch((error) => {
      console.warn('Unable to repair duplicate account identities', error);
    });
  }, [repairDuplicateAccountIdentities, syncOverview]);

  const toggleSync = React.useCallback(
    (accountId: Id<'financialAccounts'>, syncEnabled: boolean) => {
      void run(
        `toggle:${accountId}`,
        async () => {
          await setAccountSyncEnabled({ accountId, syncEnabled });
        },
        {
          success: syncEnabled ? t('accounts.sync.resumed') : t('accounts.sync.paused'),
          error: t('accounts.sync.updateFailed'),
        },
      );
    },
    [run, setAccountSyncEnabled, t],
  );

  const refreshAccount = React.useCallback(
    (accountId: Id<'financialAccounts'>) => {
      void (async () => {
        let successMessage = t('accounts.sync.incomplete');
        const ok = await run(
          `sync:${accountId}`,
          async () => {
            const result = await syncAccountNow({ accountId });
            successMessage = result?.ok ? t('accounts.sync.completed') : t('accounts.sync.incomplete');
          },
          { error: t('accounts.sync.failed') },
        );

        if (ok) {
          toast.success(successMessage);
        }
      })();
    },
    [run, syncAccountNow, t],
  );

  const renewConsent = React.useCallback(
    (providerConnectionId: Id<'providerConnections'>) => {
      void run(
        `reauth:${providerConnectionId}`,
        async () => {
          const result = await reauthorizeConnection({ providerConnectionId });
          window.location.assign(result.url);
        },
        { error: t('accounts.connections.reconnectFailed') },
      );
    },
    [reauthorizeConnection, run, t],
  );

  const toggleAccountHidden = React.useCallback(
    (accountId: Id<'financialAccounts'>, hidden: boolean) => {
      void run(
        `visibility:${accountId}`,
        async () => {
          await setAccountHidden({ accountId, hidden });
        },
        {
          success: hidden ? t('accounts.manage.hiddenSuccess') : t('accounts.manage.shownSuccess'),
          error: t('accounts.manage.visibilityUpdateFailed'),
        },
      );
    },
    [run, setAccountHidden, t],
  );

  const updateAccountAlias = React.useCallback(
    (accountId: Id<'financialAccounts'>, alias: string) => {
      void run(
        `alias:${accountId}`,
        async () => {
          await setAccountAlias({ accountId, alias });
        },
        {
          success: t('accounts.manage.aliasSaved'),
          error: t('accounts.manage.aliasUpdateFailed'),
        },
      );
    },
    [run, setAccountAlias, t],
  );

  if (section === 'connections') {
    return (
      <ConnectionsCard
        connections={connections}
        intlLocale={intlLocale}
        isPending={isPending}
        labels={{
          countryUnknown: t('accounts.connections.countryUnknown'),
          empty: t('accounts.connections.empty'),
          lastSync: t('accounts.connections.lastSync', { date: '{date}' }),
          never: t('common.never'),
          reconnect: t('accounts.connections.reconnect'),
          reconnecting: t('accounts.connections.reconnecting'),
          title: t('accounts.connections.title'),
        }}
        onRenewConsent={renewConsent}
        t={t}
      />
    );
  }

  return (
    <AccountsCard
      intlLocale={intlLocale}
      isPending={isPending}
      labels={{
        actions: t('accounts.manage.actions'),
        addManual: t('accounts.manual.add'),
        assetsTitle: t('accounts.assets.title'),
        aliasLabel: t('accounts.manage.aliasLabel'),
        aliasPlaceholder: t('accounts.manage.aliasPlaceholder'),
        backfillFrom: t('accounts.sync.backfillFrom', { date: '{date}' }),
        balanceEmpty: t('accounts.balance.empty'),
        cancel: t('common.cancel'),
        cashTitle: t('accounts.cash.title'),
        description: t('accounts.manage.description'),
        empty: t('accounts.sync.empty'),
        hidden: t('accounts.manage.hidden'),
        hide: t('accounts.manage.hide'),
        manual: t('accounts.manual.badge'),
        manualNoSync: t('accounts.manual.noSync'),
        moneyBoxManage: t('accounts.moneyBoxes.manage'),
        moneyBoxEmpty: t('accounts.moneyBoxes.empty'),
        moneyBoxSavedOfTarget: t('accounts.moneyBoxes.savedOfTarget'),
        moneyBoxTitle: t('accounts.moneyBoxes.title'),
        moneyBoxVirtual: t('accounts.moneyBoxes.virtual'),
        never: t('common.never'),
        nextSync: t('accounts.sync.nextSync', { date: '{date}' }),
        off: t('accounts.sync.off'),
        on: t('accounts.sync.on'),
        pause: t('accounts.sync.pause'),
        reconnect: t('accounts.connections.reconnect'),
        reconnecting: t('accounts.connections.reconnecting'),
        reconnectRequired: t('accounts.sync.reconnectRequired'),
        rename: t('accounts.manage.rename'),
        resume: t('accounts.sync.resume'),
        save: t('common.save'),
        show: t('accounts.manage.show'),
        syncNow: t('accounts.sync.syncNow'),
        syncing: t('accounts.sync.syncing'),
        typeAsset: t('accounts.manual.typeAsset'),
        typeCard: t('accounts.manual.typeCard'),
        typeCash: t('accounts.manual.typeCash'),
        typeChecking: t('accounts.manual.typeChecking'),
        typeInvestment: t('accounts.manual.typeInvestment'),
        typeSavings: t('accounts.manual.typeSavings'),
        title: t('accounts.manage.title'),
        updateBalance: t('accounts.balance.update'),
        withOverdraft: t('accounts.balance.withOverdraft'),
      }}
      onRefreshAccount={refreshAccount}
      onRenewConsent={renewConsent}
      onSetAccountAlias={updateAccountAlias}
      onSetAccountHidden={toggleAccountHidden}
      onToggleSync={toggleSync}
      moneyBoxes={moneyBoxes}
      syncOverview={syncOverview}
      t={t}
    />
  );
}
