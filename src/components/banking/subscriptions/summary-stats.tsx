import { Link } from '@tanstack/react-router';
import { WalletCardsIcon } from 'lucide-react';

import type { Money } from '@/lib/money';
import { Amount } from '@/components/app/amount';
import { StatCard, StatCardGroup } from '@/components/app/stat-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/lib/i18n';

export function SummaryStats({
  activeCount,
  reviewCount,
  monthlyTotals,
}: {
  activeCount: number | undefined;
  reviewCount: number | undefined;
  monthlyTotals: Array<Money> | undefined;
}) {
  const { t } = useI18n();

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{t('subscriptions.summary.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subscriptions.summary.description')}</p>
      </div>
      <StatCardGroup className="lg:grid-cols-3">
        <StatCard
          label={t('subscriptions.summary.active')}
          value={activeCount === undefined ? <Skeleton className="h-8 w-16" /> : activeCount}
        />
        <StatCard
          label={t('subscriptions.summary.toReview')}
          value={reviewCount === undefined ? <Skeleton className="h-8 w-16" /> : reviewCount}
        />
        <StatCard
          label={t('subscriptions.summary.monthlyRunRate')}
          value={
            monthlyTotals === undefined ? (
              <Skeleton className="h-8 w-32" />
            ) : monthlyTotals.length === 0 ? (
              <span className="text-sm text-muted-foreground">{t('subscriptions.summary.noSpend')}</span>
            ) : (
              <span className="flex flex-wrap gap-2">
                {monthlyTotals.map((total) => (
                  <Amount key={total.currency} money={total} />
                ))}
              </span>
            )
          }
          action={
            <Button asChild className="w-full">
              <Link to="/app/subscriptions/create">
                <WalletCardsIcon data-icon="inline-start" />
                {t('subscriptions.create')}
              </Link>
            </Button>
          }
        />
      </StatCardGroup>
    </section>
  );
}
