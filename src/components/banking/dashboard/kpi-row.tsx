import * as React from 'react';

import type { SafeToSpendBreakdown } from '@/components/banking/dashboard/safe-to-spend-sheet';
import type { Money } from '@/lib/money';
import { Amount } from '@/components/app/amount';
import { StatCard, StatCardGroup } from '@/components/app/stat-card';
import { SafeToSpendSheet } from '@/components/banking/dashboard/safe-to-spend-sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIsoDate } from '@/lib/format';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney, fundedProgressPercent } from '@/lib/money';

type CashTotal = {
  booked: Money;
  available: Money;
  accountCount: number;
};

type NetWorthTotal = {
  cash: Money;
  assets?: Money;
  debts: Money;
  netWorth: Money;
};

type DashboardOverview = {
  cashTotals: Array<CashTotal>;
  netWorth?: Array<NetWorthTotal> | null;
};

type PlanBucketKpi = {
  spent: Money;
  funded: Money;
  remaining: Money;
};

type UpcomingPaymentKpi = {
  amount: Money;
  dueDate: string;
  direction: 'inflow' | 'outflow';
};

function ValueSkeleton() {
  return <Skeleton className="h-8 w-28" />;
}

function sumByCurrency(items: Array<Money>) {
  const totals = new Map<string, bigint>();
  for (const item of items) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0n) + item.amountMinor);
  }
  return Array.from(totals, ([currency, amountMinor]) => ({ amountMinor, currency }));
}

export function KpiRow({
  overview,
  planBuckets,
  projection,
  safeToSpend,
  scopeLabel,
  upcomingPayments,
}: {
  overview: DashboardOverview | undefined;
  planBuckets: Array<PlanBucketKpi> | undefined;
  projection: Money | null | undefined;
  safeToSpend: Array<SafeToSpendBreakdown> | undefined;
  scopeLabel: string;
  upcomingPayments: Array<UpcomingPaymentKpi> | undefined;
}) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const [safeToSpendOpen, setSafeToSpendOpen] = React.useState(false);
  const primarySafeToSpend = safeToSpend?.[0];
  const primaryCash = overview?.cashTotals[0];
  const otherCash = overview?.cashTotals.slice(1) ?? [];
  const primaryNetWorth = overview?.netWorth?.[0];
  const otherNetWorth = overview?.netWorth?.slice(1) ?? [];
  const overspentCount = planBuckets?.filter((bucket) => bucket.remaining.amountMinor < 0n).length;
  const planCurrencies = new Set(planBuckets?.map((bucket) => bucket.funded.currency) ?? []);
  const canAggregatePlan = planBuckets !== undefined && planBuckets.length > 0 && planCurrencies.size === 1;
  // Only outflows count as payments: inflows and the receiving leg of own transfers must not inflate the total.
  const upcomingOutflows = upcomingPayments?.filter((payment) => payment.direction === 'outflow');
  const upcomingTotals = upcomingOutflows
    ? sumByCurrency(upcomingOutflows.map((payment) => payment.amount))
    : undefined;
  const nextDueDate = upcomingOutflows?.map((payment) => payment.dueDate).toSorted()[0];

  const planValue = (() => {
    if (planBuckets === undefined) {
      return <ValueSkeleton />;
    }
    if (planBuckets.length === 0) {
      return '0';
    }
    if (!canAggregatePlan) {
      return t('dashboard.kpi.planCategories', { count: planBuckets.length });
    }
    const currency = planBuckets[0]?.funded.currency ?? 'EUR';
    const spent = {
      amountMinor: planBuckets.reduce((total, bucket) => total + bucket.spent.amountMinor, 0n),
      currency,
    };
    const funded = {
      amountMinor: planBuckets.reduce((total, bucket) => total + bucket.funded.amountMinor, 0n),
      currency,
    };
    // "100% of nothing" reads as if money had been assigned, so name the real situation instead.
    if (funded.amountMinor <= 0n) return t('dashboard.kpi.planUnfunded');
    return t('dashboard.kpi.planUsed', { percent: Math.round(fundedProgressPercent(spent, funded)) });
  })();

  return (
    <>
      <StatCardGroup className="xl:grid-cols-6">
        <StatCard
          label={t('dashboard.safeToSpend.title')}
          ariaLabel={t('dashboard.safeToSpend.open')}
          onClick={() => setSafeToSpendOpen(true)}
          value={
            safeToSpend === undefined ? (
              <ValueSkeleton />
            ) : primarySafeToSpend ? (
              <Amount money={primarySafeToSpend.safeToSpend} variant="balance" />
            ) : (
              '—'
            )
          }
          hint={
            safeToSpend === undefined
              ? undefined
              : primarySafeToSpend
                ? t('dashboard.safeToSpend.hint', {
                    date: formatIsoDate(primarySafeToSpend.cycleEndDate, intlLocale),
                    amount: maskValue(formatMoney(primarySafeToSpend.perDay, intlLocale)),
                  })
                : t('dashboard.safeToSpend.noData')
          }
        />
        <StatCard
          label={t('dashboard.kpi.availableCash')}
          help={t('dashboard.kpi.availableCashHelp')}
          value={
            overview === undefined ? (
              <ValueSkeleton />
            ) : primaryCash ? (
              <Amount money={primaryCash.available} variant="balance" />
            ) : (
              '0'
            )
          }
          hint={
            overview === undefined ? undefined : primaryCash ? (
              <span>
                {t('dashboard.kpi.booked')} <Amount money={primaryCash.booked} variant="balance" /> ·{' '}
                {t('dashboard.kpi.accountsCount', { count: primaryCash.accountCount })}
                {otherCash.map((total) => (
                  <span key={total.booked.currency}>
                    {' · '}
                    <Amount money={total.available} variant="balance" />
                  </span>
                ))}
              </span>
            ) : (
              t('dashboard.kpi.noAccounts')
            )
          }
        />
        <StatCard
          label={t('dashboard.kpi.netWorth')}
          help={t('dashboard.kpi.netWorthHelp')}
          value={
            overview === undefined ? (
              <ValueSkeleton />
            ) : primaryNetWorth ? (
              <Amount money={primaryNetWorth.netWorth} variant="balance" />
            ) : primaryCash ? (
              <Amount money={primaryCash.available} variant="balance" />
            ) : (
              '0'
            )
          }
          hint={
            overview === undefined ? undefined : primaryNetWorth ? (
              <span>
                {t('dashboard.kpi.cash')} <Amount money={primaryNetWorth.cash} variant="balance" />{' '}
                {primaryNetWorth.assets ? (
                  <>
                    + {t('dashboard.kpi.assets')}{' '}
                    <Amount money={primaryNetWorth.assets} variant="balance" />{' '}
                  </>
                ) : null}
                −{' '}
                {t('dashboard.kpi.debts')} <Amount money={primaryNetWorth.debts} variant="neutral" />
                {otherNetWorth.map((total) => (
                  <span key={total.netWorth.currency}>
                    {' · '}
                    <Amount money={total.netWorth} variant="balance" />
                  </span>
                ))}
              </span>
            ) : primaryCash ? (
              <span>
                {t('dashboard.kpi.booked')} <Amount money={primaryCash.booked} variant="balance" />
              </span>
            ) : undefined
          }
        />
        <StatCard
          label={t('dashboard.kpi.projected')}
          help={t('dashboard.kpi.projectedHelp')}
          value={
            projection === undefined ? (
              <ValueSkeleton />
            ) : projection ? (
              <Amount money={projection} variant="balance" />
            ) : (
              '—'
            )
          }
          hint={projection === undefined ? undefined : projection ? scopeLabel : t('dashboard.kpi.noProjection')}
        />
        <StatCard
          label={t('dashboard.kpi.plan')}
          value={planValue}
          hint={
            planBuckets === undefined
              ? undefined
              : planBuckets.length === 0
                ? t('dashboard.kpi.noPlan')
                : t('dashboard.kpi.planOverspent', { overspent: overspentCount ?? 0, total: planBuckets.length })
          }
          delta={
            planBuckets === undefined || planBuckets.length === 0
              ? undefined
              : {
                  value:
                    overspentCount && overspentCount > 0
                      ? t('dashboard.kpi.overspent', { count: overspentCount })
                      : t('dashboard.kpi.onTrack'),
                  tone: overspentCount && overspentCount > 0 ? 'negative' : 'positive',
                }
          }
        />
        <StatCard
          label={t('dashboard.kpi.upcoming')}
          value={
            upcomingPayments === undefined ? (
              <ValueSkeleton />
            ) : upcomingTotals?.length === 1 ? (
              <Amount money={upcomingTotals[0]} variant="neutral" />
            ) : upcomingTotals && upcomingTotals.length > 1 ? (
              <span className="flex flex-wrap gap-x-1.5">
                {upcomingTotals.map((total) => (
                  <Amount key={total.currency} money={total} variant="neutral" />
                ))}
              </span>
            ) : (
              '0'
            )
          }
          hint={
            upcomingOutflows === undefined
              ? undefined
              : upcomingOutflows.length === 0 || !nextDueDate
                ? t('dashboard.kpi.noUpcoming')
                : t('dashboard.kpi.upcomingHint', {
                    count: upcomingOutflows.length,
                    date: formatIsoDate(nextDueDate, intlLocale),
                  })
          }
        />
      </StatCardGroup>
      <SafeToSpendSheet breakdowns={safeToSpend} open={safeToSpendOpen} onOpenChange={setSafeToSpendOpen} />
    </>
  );
}
