import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { WalletCardsIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import { EditSubscriptionDialog } from './edit-subscription-dialog';
import { monthlyEquivalent, sumByCurrency, todayDate } from './helpers';
import { SubscriptionCard } from './subscription-card';
import { SuggestionsCard } from './suggestions-card';
import { SummaryStats } from './summary-stats';
import { UpcomingCard } from './upcoming-card';
import type { Account, Subscription, Transaction } from './helpers';
import type { Id } from '../../../../convex/_generated/dataModel';
import { EmptyState } from '@/components/app/empty-state';
import { PanelSkeleton } from '@/components/app/skeletons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { accountLabel } from '@/lib/accounts';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';

export function SubscriptionsView() {
  const { t } = useI18n();
  const [detailsDialogSubscription, setDetailsDialogSubscription] = React.useState<Subscription | null>(null);
  const [aliasValue, setAliasValue] = React.useState('');
  const [accountValue, setAccountValue] = React.useState<string>('none');
  const subscriptions = useQuery(api.subscriptions.getSubscriptions, { limit: 100 });
  const accounts = useQuery(api.banking.accounts.listAccounts, { limit: 100 });
  const upcomingSubscriptions = useQuery(api.subscriptions.listUpcomingSubscriptions, {
    status: 'active',
    fromDate: todayDate(),
    limit: 10,
  });
  const reviewSuggestions = useQuery(api.banking.transactions.listReviewSuggestions, { limit: 8 });
  const updateStatus = useMutation(api.subscriptions.updateSubscriptionStatus).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.subscriptions.getSubscriptions, { limit: 100 });
      if (!current) {
        return;
      }

      localStore.setQuery(
        api.subscriptions.getSubscriptions,
        { limit: 100 },
        current.map((subscription) =>
          subscription._id === args.subscriptionId ? { ...subscription, status: args.status } : subscription,
        ),
      );
    },
  );
  const updateDetails = useMutation(api.subscriptions.updateSubscriptionDetails);
  const convertToSubscription = useMutation(api.subscriptions.convertTransactionToSubscription);
  const rejectSubscriptionSuggestion = useMutation(api.banking.transactions.rejectSubscriptionSuggestion);
  const { isPending, run } = usePendingAction();

  const activeSubscriptions = React.useMemo(
    () => subscriptions?.filter((subscription) => subscription.status === 'active') ?? [],
    [subscriptions],
  );
  const monthlyTotals = React.useMemo(
    () => sumByCurrency(activeSubscriptions.map(monthlyEquivalent)),
    [activeSubscriptions],
  );
  const accountsById = React.useMemo(() => {
    const accountMap = new Map<Id<'financialAccounts'>, Account>();
    for (const account of accounts ?? []) {
      accountMap.set(account._id, account);
    }
    return accountMap;
  }, [accounts]);

  function changeStatus(subscription: Subscription, status: Subscription['status']) {
    void run(
      `subscription-status:${subscription._id}`,
      async () => {
        await updateStatus({ subscriptionId: subscription._id, status });
      },
      {
        success: t('subscriptions.statusUpdated'),
        error: t('subscriptions.statusUpdateFailed'),
      },
    );
  }

  function openDetailsDialog(subscription: Subscription) {
    setDetailsDialogSubscription(subscription);
    setAliasValue(subscription.alias ?? '');
    setAccountValue(subscription.accountId ?? 'none');
  }

  async function saveDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detailsDialogSubscription) {
      return;
    }

    const saved = await run(
      `subscription-details:${detailsDialogSubscription._id}`,
      async () => {
        await updateDetails({
          subscriptionId: detailsDialogSubscription._id,
          alias: aliasValue,
          accountId: accountValue === 'none' ? null : (accountValue as Id<'financialAccounts'>),
        });
      },
      {
        success: t('subscriptions.detailsUpdated'),
        error: t('subscriptions.detailsUpdateFailed'),
      },
    );

    if (saved) {
      setDetailsDialogSubscription(null);
    }
  }

  function confirmSuggestion(transaction: Transaction) {
    void run(
      `subscription-suggestion-confirm:${transaction._id}`,
      async () => {
        await convertToSubscription({
          transactionId: transaction._id,
          interval: 'month',
          intervalCount: 1,
        });
      },
      {
        success: t('subscriptions.suggestionConfirmed'),
        error: t('subscriptions.suggestionConfirmFailed'),
      },
    );
  }

  function rejectSuggestion(transaction: Transaction) {
    void run(
      `subscription-suggestion-reject:${transaction._id}`,
      async () => {
        await rejectSubscriptionSuggestion({ transactionId: transaction._id });
      },
      {
        success: t('subscriptions.suggestionRejected'),
        error: t('subscriptions.suggestionRejectFailed'),
      },
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-4">
        <SummaryStats
          activeCount={subscriptions === undefined ? undefined : activeSubscriptions.length}
          monthlyTotals={subscriptions === undefined ? undefined : monthlyTotals}
          reviewCount={reviewSuggestions?.subscriptionCandidates.length}
        />
        <SuggestionsCard
          suggestions={reviewSuggestions?.subscriptionCandidates}
          isPending={isPending}
          onConfirm={confirmSuggestion}
          onReject={rejectSuggestion}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <UpcomingCard accountsById={accountsById} subscriptions={upcomingSubscriptions} />

        <Card>
          <CardHeader>
            <CardTitle>{t('subscriptions.list.title')}</CardTitle>
            <CardDescription>{t('subscriptions.list.description')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {subscriptions === undefined ? (
              <>
                <PanelSkeleton rows={3} />
                <PanelSkeleton rows={3} />
                <PanelSkeleton rows={3} />
                <PanelSkeleton rows={3} />
              </>
            ) : null}
            {subscriptions?.length === 0 ? (
              <EmptyState
                className="col-span-full p-10"
                icon={WalletCardsIcon}
                title={t('subscriptions.emptyTitle')}
                hint={t('subscriptions.empty')}
              />
            ) : null}
            {subscriptions?.map((subscription) => {
              const accountName = accountLabel(
                subscription.accountId ? accountsById.get(subscription.accountId) : null,
                t('subscriptions.noDebitAccount'),
              );
              const merchantName =
                subscription.merchantName ?? subscription.description ?? t('subscriptions.noMerchant');

              return (
                <SubscriptionCard
                  key={subscription._id}
                  accountName={accountName}
                  isPending={isPending}
                  merchantName={merchantName}
                  subscription={subscription}
                  onEdit={openDetailsDialog}
                  onStatusChange={changeStatus}
                />
              );
            })}
          </CardContent>
        </Card>
      </div>
      <EditSubscriptionDialog
        accountValue={accountValue}
        accounts={accounts ?? []}
        aliasValue={aliasValue}
        isPending={
          detailsDialogSubscription ? isPending(`subscription-details:${detailsDialogSubscription._id}`) : false
        }
        onAccountChange={setAccountValue}
        onAliasChange={setAliasValue}
        onClose={() => setDetailsDialogSubscription(null)}
        onSubmit={saveDetails}
        subscription={detailsDialogSubscription}
      />
    </div>
  );
}
