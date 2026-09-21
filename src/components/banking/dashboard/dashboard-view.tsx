import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import type { BalanceHistoryDatum } from '@/components/banking/charts/balance-history-chart';
import type { PlanProgressDatum } from '@/components/banking/dashboard/dashboard-plan-buckets';
import type { CashflowDatum } from '@/components/banking/charts/cashflow-projection-chart';
import type { SpendingDatum } from '@/components/banking/charts/spending-by-category-chart';
import type { UpcomingPaymentDatum } from '@/components/banking/dashboard/upcoming-payments-card';
import type { Money } from '@/lib/money';
import { AccountSelect } from '@/components/app/account-select';
import { BalanceHistoryChart } from '@/components/banking/charts/balance-history-chart';
import { PlanProgressChart } from '@/components/banking/charts/plan-progress-chart';
import { CashflowProjectionChart } from '@/components/banking/charts/cashflow-projection-chart';
import { SpendingByCategoryChart } from '@/components/banking/charts/spending-by-category-chart';
import {
  DASHBOARD_PLAN_BUCKET_LIMIT,
  dashboardPlanBuckets,
} from '@/components/banking/dashboard/dashboard-plan-buckets';
import { KpiRow } from '@/components/banking/dashboard/kpi-row';
import { RecentTransactionsCard } from '@/components/banking/dashboard/recent-transactions-card';
import { UpcomingPaymentsCard } from '@/components/banking/dashboard/upcoming-payments-card';
import { Input } from '@/components/ui/input';
import { accountLabel } from '@/lib/accounts';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { categoryDisplayName } from '@/lib/categories';
import { currentPeriod } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { currencyFractionDigits } from '@/lib/money';
import { Route } from '@/routes/_authenticated/_app/app/index';

function moneyToMajor(money: Money) {
  return Number(money.amountMinor) / 10 ** currencyFractionDigits(money.currency);
}

export function DashboardView() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const pageviewSent = React.useRef(false);
  const emptyStateSent = React.useRef(false);
  const search = Route.useSearch();
  const [period, setPeriod] = React.useState(currentPeriod);
  const accounts = useQuery(api.banking.accounts.listAccounts, { status: 'active', limit: 200 });
  const selectedAccount = accounts?.find((account) => account._id === search.account);
  const accountId = selectedAccount?._id;
  const scopeLabel = selectedAccount ? accountLabel(selectedAccount) : t('dashboard.scope.all');
  const overview = useQuery(api.banking.dashboard.getDashboardOverview, { accountId });
  const spending = useQuery(api.banking.transactions.getSpendingByCategory, { accountId, period, limit: 8 });
  const cashflow = useQuery(api.banking.planning.getPlanningCashflowView, { cycleOffset: 0, limit: 100 });
  const safeToSpend = useQuery(api.banking.safeToSpend.getSafeToSpend, { accountId });
  const activePlan = useQuery(api.banking.planRead.getActivePlan, {});
  const planMonth = useQuery(
    api.banking.planRead.getPlanMonth,
    activePlan && period >= activePlan.startPeriod ? { planId: activePlan.id, period } : 'skip',
  );
  const balanceHistory = useQuery(api.banking.accounts.getBalanceHistory, { accountId, limit: 240 });

  const spendingData = React.useMemo<Array<SpendingDatum> | undefined>(
    () =>
      spending?.map((item) => ({
        name: item.categoryName
          ? categoryDisplayName({ name: item.categoryName, systemKey: item.categorySystemKey ?? undefined }, t)
          : t('charts.category.uncategorized'),
        amount: moneyToMajor(item.amount),
        money: item.amount,
      })),
    [spending, t],
  );
  const spendingCurrency = spending?.[0]?.amount.currency ?? 'EUR';

  const selectedCashflowGroup = React.useMemo(
    () => (accountId ? cashflow?.accountGroups.find((group) => group.accountId === accountId) : undefined),
    [accountId, cashflow],
  );
  const cashflowData = React.useMemo<Array<CashflowDatum> | undefined>(() => {
    if (cashflow === undefined) {
      return undefined;
    }
    const rows = accountId
      ? selectedCashflowGroup?.items
          .filter((item) => item.projectionStatus === 'projected' && item.projectedBalanceAfter)
          .map((item) => ({ date: item.dueDate, projectedBalanceAfter: item.projectedBalanceAfter! }))
      : cashflow.aggregateSeries;
    return (
      rows?.map((item) => ({
        date: item.date,
        balance: moneyToMajor(item.projectedBalanceAfter),
        money: item.projectedBalanceAfter,
      })) ?? []
    );
  }, [accountId, cashflow, selectedCashflowGroup]);
  const cashflowCurrency =
    (accountId ? selectedCashflowGroup?.startingBalance?.currency : cashflow?.aggregateEndBalance?.currency) ?? 'EUR';
  // Distinguish loading (undefined → skeleton) from "no projection" (null → em dash).
  const projection =
    cashflow === undefined
      ? undefined
      : ((accountId ? selectedCashflowGroup?.projectedEndBalance : cashflow.aggregateEndBalance) ?? null);
  const firstNegativeDate = accountId
    ? selectedCashflowGroup?.firstNegativeDate
    : (cashflow?.aggregateFirstNegativeDate ?? cashflow?.firstNegativeDate);

  const planBuckets = React.useMemo<Array<PlanProgressDatum> | undefined>(() => {
    if (activePlan === undefined) return undefined;
    if (!activePlan || period < activePlan.startPeriod) return [];
    if (planMonth === undefined) return undefined;
    if (planMonth.truncated) return [];

    return dashboardPlanBuckets(
      planMonth.groups.flatMap((group) => (group.hidden ? [] : group.buckets)),
      activePlan.currency,
    );
  }, [activePlan, period, planMonth]);
  const planChartData = planBuckets?.slice(0, DASHBOARD_PLAN_BUCKET_LIMIT);

  const balanceData = React.useMemo<Array<BalanceHistoryDatum> | undefined>(
    () =>
      balanceHistory?.map((point) => ({
        date: point.date,
        balance: moneyToMajor(point.amount),
        money: point.amount,
      })),
    [balanceHistory],
  );
  const balanceCurrency = balanceHistory?.[0]?.amount.currency ?? 'EUR';

  const upcomingPaymentData = React.useMemo<Array<UpcomingPaymentDatum> | undefined>(() => {
    if (cashflow === undefined) {
      return undefined;
    }
    const groups = accountId ? (selectedCashflowGroup ? [selectedCashflowGroup] : []) : cashflow.accountGroups;
    return groups.flatMap((group) =>
      group.items
        .filter((item) => !item.occurrencePayment)
        .map((item) => ({
          id: item.key,
          name: item.title,
          dueDate: item.dueDate,
          amount: item.amount,
          direction: item.direction,
          source: item.source,
          account: group.account,
        })),
    );
  }, [accountId, cashflow, selectedCashflowGroup]);

  React.useEffect(() => {
    if (pageviewSent.current) return;
    pageviewSent.current = true;
    trackEvent(analyticsEvents.dashboardViewed, {});
  }, []);

  React.useEffect(() => {
    if (emptyStateSent.current) return;
    if (accounts === undefined || accounts.length > 0) return;
    emptyStateSent.current = true;
    trackEvent(analyticsEvents.onboardingEmptyStateViewed, { surface: 'dashboard' });
  }, [accounts]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <AccountSelect
          accounts={accounts ?? []}
          value={accountId ?? 'all'}
          onValueChange={(value) =>
            void navigate({
              to: '/app',
              search: (previous) => ({ ...previous, account: value === 'all' ? undefined : value }),
            })
          }
        />
        <Input
          aria-label={t('charts.dashboard.period')}
          type="month"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          className="w-full sm:w-48"
        />
      </div>
      <KpiRow
        overview={overview}
        projection={projection}
        safeToSpend={safeToSpend}
        scopeLabel={scopeLabel}
        planBuckets={planBuckets}
        upcomingPayments={upcomingPaymentData}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <SpendingByCategoryChart
          data={spendingData}
          currency={spendingCurrency}
          period={period}
          scopeLabel={scopeLabel}
        />
        <CashflowProjectionChart
          data={cashflowData}
          currency={cashflowCurrency}
          accountLabel={scopeLabel}
          firstNegativeDate={firstNegativeDate}
        />
        <PlanProgressChart data={planChartData} period={period} />
        <BalanceHistoryChart data={balanceData} currency={balanceCurrency} scopeLabel={scopeLabel} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentTransactionsCard accountId={accountId} />
        <UpcomingPaymentsCard data={upcomingPaymentData} selectedAccountId={accountId} />
      </div>
    </div>
  );
}
