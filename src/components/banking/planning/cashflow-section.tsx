import * as React from 'react';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { AccountCashflowTable } from './account-cashflow-table';
import { CashflowStats } from './cashflow-stats';
import { CycleHeader } from './cycle-header';
import { dayOfMonthFromIsoDate, formatIsoDateLabel, isoDateWithDayOfMonth } from './helpers';
import type { CashflowAccountGroup, CycleInterval, PlannedExpense, PlannedTransfer } from './helpers';
import type { Money } from '@/lib/money';
import type { Id } from '../../../../convex/_generated/dataModel';
import { EmptyState } from '@/components/app/empty-state';
import { ChartSkeleton, StatRowSkeleton } from '@/components/app/skeletons';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

export function CashflowSection({
  plannedExpenseById,
  plannedTransferById,
  onEditPlannedExpense,
  onEditPlannedTransfer,
  onCreate,
  onCreateMoneyBox,
  onRegisterContribution,
}: {
  plannedExpenseById: Map<string, PlannedExpense>;
  plannedTransferById: Map<string, PlannedTransfer>;
  onEditPlannedExpense: (expense: PlannedExpense) => void;
  onEditPlannedTransfer: (transfer: PlannedTransfer) => void;
  onCreate: (kind: 'expense' | 'transfer', accountId: Id<'financialAccounts'>) => void;
  onCreateMoneyBox: (expense: PlannedExpense) => void;
  onRegisterContribution: (
    moneyBoxId: Id<'moneyBoxes'>,
    mode: 'quick' | 'transaction',
    suggestedAmount: Money,
  ) => void;
}) {
  const { intlLocale, t } = useI18n();
  const [cashflowCycleOffset, setCashflowCycleOffset] = React.useState(0);
  const [preferencesOpen, setPreferencesOpen] = React.useState(false);
  const [preferenceInterval, setPreferenceInterval] = React.useState<CycleInterval>('month');
  const [preferenceIntervalCount, setPreferenceIntervalCount] = React.useState(1);
  const [preferenceAnchorDate, setPreferenceAnchorDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const { isPending, run } = usePendingAction();

  const { data: planningPreference } = useQuery(convexQuery(api.banking.planning.getPlanningPreference, {}));
  const { data: planningCashflow } = useQuery(
    convexQuery(api.banking.planning.getPlanningCashflowView, {
      cycleOffset: cashflowCycleOffset,
      limit: 100,
    }),
  );

  const upsertPlanningPreference = useMutation(api.banking.planning.upsertPlanningPreference);
  const setCreditFacilityUsageCycleStatus = useMutation(api.banking.credit.setCreditFacilityUsageCycleStatus);
  const setPlannedTransferStatus = useMutation(api.banking.planning.setPlannedTransferStatus);
  const deletePlannedTransferMutation = useMutation(api.banking.planning.deletePlannedTransfer);
  const updatePlannedTransferAmount = useMutation(api.banking.planning.updatePlannedTransferAmount);

  React.useEffect(() => {
    if (!planningPreference) {
      return;
    }

    setPreferenceInterval(planningPreference.cycleInterval);
    setPreferenceAnchorDate(planningPreference.anchorDate);
    setPreferenceIntervalCount(
      planningPreference.cycleInterval === 'month'
        ? dayOfMonthFromIsoDate(planningPreference.anchorDate)
        : planningPreference.cycleIntervalCount,
    );
  }, [planningPreference]);

  function changeCreditStatementStatus(usageCycleId: Id<'creditFacilityUsageCycles'>, status: 'paid' | 'cancelled') {
    void run(
      `credit-statement:${usageCycleId}`,
      async () => {
        await setCreditFacilityUsageCycleStatus({ usageCycleId, status });
      },
      {
        success: t('planning.creditStatements.statusUpdated'),
        error: t('planning.creditStatements.statusUpdateFailed'),
      },
    );
  }

  function changePlannedTransferStatus(plannedTransferId: Id<'plannedTransactions'>, status: 'completed') {
    void run(
      `planned-transfer:${plannedTransferId}`,
      async () => {
        await setPlannedTransferStatus({ plannedTransferId, status });
      },
      {
        success: t('planning.transfers.completed'),
        error: t('planning.transfers.statusFailed'),
      },
    );
  }

  function deletePlannedTransfer(plannedTransferId: Id<'plannedTransactions'>) {
    void run(
      `planned-transfer:${plannedTransferId}`,
      async () => {
        await deletePlannedTransferMutation({ plannedTransferId });
      },
      { success: t('planning.transfers.deleted'), error: t('planning.transfers.deleteFailed') },
    );
  }

  async function saveTransferAmount(plannedTransferId: Id<'plannedTransactions'>, value: string) {
    const transfer = plannedTransferById.get(plannedTransferId);
    if (!transfer) return false;
    return await run(
      `planned-transfer-amount:${plannedTransferId}`,
      async () => {
        await updatePlannedTransferAmount({
          plannedTransferId,
          amount: { amountMinor: parseMoneyMinor(value, transfer.amount.currency), currency: transfer.amount.currency },
        });
      },
      { success: t('planning.transfers.amountUpdated'), error: t('planning.transfers.amountUpdateFailed') },
    );
  }

  async function savePlanningPreference(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await run(
      'planning-preference',
      async () => {
        const anchorDate =
          preferenceInterval === 'month'
            ? isoDateWithDayOfMonth(preferenceAnchorDate, preferenceIntervalCount)
            : preferenceAnchorDate;
        await upsertPlanningPreference({
          cycleInterval: preferenceInterval,
          cycleIntervalCount: preferenceInterval === 'month' ? 1 : preferenceIntervalCount,
          anchorDate,
        });
      },
      {
        success: t('planning.preferences.saved'),
        error: t('planning.preferences.saveFailed'),
      },
    );

    if (saved) {
      setCashflowCycleOffset(0);
      setPreferencesOpen(false);
    }
  }

  function formatCycleWindow(start: string, end: string) {
    return t('planning.cashflow.cycleWindow', {
      start: formatIsoDateLabel(start, intlLocale),
      end: formatIsoDateLabel(end, intlLocale),
    });
  }

  const cycleWindow = planningCashflow
    ? formatCycleWindow(planningCashflow.cycleStartDate, planningCashflow.cycleEndDate)
    : t('planning.cashflow.loading');

  return (
    <Card>
      <CardHeader>
        <CycleHeader
          cycleOffset={cashflowCycleOffset}
          cycleWindow={cycleWindow}
          isPreferencePending={isPending('planning-preference')}
          onCurrentCycle={() => setCashflowCycleOffset(0)}
          onNextCycle={() => setCashflowCycleOffset((current) => current + 1)}
          onPreferenceAnchorDateChange={setPreferenceAnchorDate}
          onPreferenceIntervalChange={setPreferenceInterval}
          onPreferenceIntervalCountChange={setPreferenceIntervalCount}
          onPreferencesOpenChange={setPreferencesOpen}
          onPreviousCycle={() => setCashflowCycleOffset((current) => current - 1)}
          onSavePreference={savePlanningPreference}
          preferenceAnchorDate={preferenceAnchorDate}
          preferenceInterval={preferenceInterval}
          preferenceIntervalCount={preferenceIntervalCount}
          preferencesOpen={preferencesOpen}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {planningCashflow === undefined ? (
          <div className="flex flex-col gap-3">
            <StatRowSkeleton count={4} />
            <ChartSkeleton height={128} />
          </div>
        ) : (
          <>
            <CashflowStats
              firstNegativeDate={planningCashflow.firstNegativeDate}
              monthlyFundingTotals={planningCashflow.monthlyFundingTotals}
              preferenceInterval={planningCashflow.preference.cycleInterval}
              upcomingTotals={planningCashflow.upcomingTotals}
            />

            {planningCashflow.accountGroups.length === 0 ? (
              <EmptyState className="p-6" title={t('planning.cashflow.empty')} />
            ) : (
              <div className="flex flex-col gap-4">
                {planningCashflow.accountGroups.map((group: CashflowAccountGroup) => (
                    <AccountCashflowTable
                      key={group.accountId}
                      cycleOffset={cashflowCycleOffset}
                      cycleEndDate={planningCashflow.cycleEndDate}
                      cycleStartDate={planningCashflow.cycleStartDate}
                      group={group}
                      fundingRows={planningCashflow.fundingItems.filter((item) => item.accountId === group.accountId)}
                      isCreditStatementPending={(usageCycleId) =>
                        usageCycleId ? isPending(`credit-statement:${usageCycleId}`) : false
                      }
                      onCreditStatementStatusChange={changeCreditStatementStatus}
                      onCreate={onCreate}
                      onCreateMoneyBox={onCreateMoneyBox}
                      onDeletePlannedTransfer={deletePlannedTransfer}
                      onEditPlannedExpense={onEditPlannedExpense}
                      onEditPlannedTransfer={onEditPlannedTransfer}
                      onPlannedTransferStatusChange={changePlannedTransferStatus}
                      onRegisterContribution={onRegisterContribution}
                      onSaveTransferAmount={saveTransferAmount}
                      isPlannedTransferPending={(plannedTransferId) =>
                        plannedTransferId
                          ? isPending(`planned-transfer:${plannedTransferId}`) ||
                            isPending(`planned-transfer-amount:${plannedTransferId}`)
                          : false
                      }
                      plannedExpenseById={plannedExpenseById}
                      plannedTransferById={plannedTransferById}
                    />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
