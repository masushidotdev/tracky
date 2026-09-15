import { CalendarClockIcon } from 'lucide-react';

import { SubscriptionCard } from './subscription-card';
import { urgencyVariant } from './helpers';
import type { Account, Subscription } from './helpers';
import { EmptyState } from '@/components/app/empty-state';
import { PanelSkeleton } from '@/components/app/skeletons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { accountLabel } from '@/lib/accounts';
import { useI18n } from '@/lib/i18n';

export function UpcomingCard({
  accountsById,
  subscriptions,
}: {
  accountsById: Map<string, Account>;
  subscriptions: Array<Subscription> | undefined;
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('subscriptions.upcoming.title')}</CardTitle>
        <CardDescription>{t('subscriptions.upcoming.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {subscriptions === undefined ? (
          <>
            <PanelSkeleton rows={3} />
            <PanelSkeleton rows={3} />
          </>
        ) : null}
        {subscriptions?.length === 0 ? (
          <EmptyState
            className="p-8"
            icon={CalendarClockIcon}
            title={t('subscriptions.upcoming.emptyTitle')}
            hint={t('subscriptions.upcoming.empty')}
          />
        ) : null}
        {subscriptions?.map((subscription) => {
          const urgency = urgencyVariant(subscription, t);
          const accountName = accountLabel(
            subscription.accountId ? accountsById.get(subscription.accountId) : null,
            t('subscriptions.noDebitAccount'),
          );
          const merchantName = subscription.merchantName ?? subscription.description ?? t('subscriptions.noMerchant');

          return (
            <SubscriptionCard
              key={subscription._id}
              accountName={accountName}
              merchantName={merchantName}
              subscription={subscription}
              urgencyBadge={urgency.badge}
              variant="upcoming"
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
