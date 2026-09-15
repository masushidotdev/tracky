import { makeFunctionReference } from 'convex/server';
import type { PaginationOptions } from 'convex/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { ForecastResult } from '../forecast/forecastCore';
import type { Entitlements } from '../lib/entitlements';
import type { SelectableModel } from './models';

type Money = { amountMinor: bigint; currency: string };

export const analystFunctionRefs = {
  entitlementsForUser: makeFunctionReference<'query', { userId: string }, Entitlements>(
    'entitlements:getEntitlementsForUser',
  ),
  streamReply: makeFunctionReference<
    'action',
    {
      threadId: string;
      userId: string;
      promptMessageId: string;
      modelId: SelectableModel;
      locale: string;
      turnLockId: Id<'analystTurnLocks'>;
      memoryQuery?: string;
      approvalContinuation?: {
        requestCount: number;
        approvedCount: number;
        deniedCount: number;
        pendingCount: number;
      };
    },
    null
  >('analyst/stream:streamReply'),
  releaseAnalystTurn: makeFunctionReference<
    'mutation',
    { turnLockId: Id<'analystTurnLocks'>; userId: string; threadId: string },
    null
  >('analyst/turnLocks:releaseAnalystTurn'),
  generateTitle: makeFunctionReference<'action', { threadId: string; userId: string; firstMessage: string }, null>(
    'analyst/titles:generateTitle',
  ),
  accountsOverviewForUser: makeFunctionReference<
    'query',
    { userId: string },
    {
      accounts: Array<{
        account: Doc<'financialAccounts'>;
        latestBalance: Doc<'accountBalances'> | null;
      }>;
      totals: Array<Money>;
    }
  >('analyst/queries:accountsOverviewForUser'),
  spendingByCategoryForUser: makeFunctionReference<
    'query',
    { userId: string; period?: string; monthsBack?: number; accountId?: Id<'financialAccounts'> },
    unknown
  >('analyst/queries:spendingByCategoryForUser'),
  spendingReportForUser: makeFunctionReference<
    'query',
    {
      userId: string;
      tab: 'cashflow' | 'spending' | 'income';
      groupBy: 'category' | 'categoryGroup' | 'counterparty' | 'account';
      granularity: 'month' | 'quarter' | 'year';
      dateFrom: string;
      dateTo: string;
    },
    {
      summary: Array<{
        currency: string;
        incomeMinor: bigint;
        expensesMinor: bigint;
        netMinor: bigint;
        savingsRatePct: number;
      }>;
      series: Array<{
        period: string;
        currency: string;
        groups: Array<{
          key: string;
          label: string;
          incomeMinor: bigint;
          expensesMinor: bigint;
        }>;
      }>;
      breakdown: Array<{
        key: string;
        label: string;
        currency: string;
        incomeMinor: bigint;
        expensesMinor: bigint;
        totalMinor: bigint;
      }>;
      truncated: boolean;
    }
  >('banking/reports:getReportForUser'),
  planWithProgressForUser: makeFunctionReference<
    'query',
    { userId: string; period?: string },
    | {
        plan: { id: Id<'plans'>; name: string; currency: string };
        period: string;
        readyToAssignMinor: bigint;
        totals: {
          assignedMinor: bigint;
          activityMinor: bigint;
          availableMinor: bigint;
          neededMinor: bigint;
          underfundedMinor: bigint;
        };
        buckets: Array<{
          bucketId: Id<'planBuckets'>;
          name: string;
          hidden: boolean;
          groupId: Id<'planGroups'> | null;
          groupName: string | null;
          assignedMinor: bigint;
          activityMinor: bigint;
          availableMinor: bigint;
          neededMinor: bigint;
          underfundedMinor: bigint;
          snoozed: boolean;
          status: 'funded' | 'underfunded' | 'overspent' | 'overfunded';
        }>;
        truncated: boolean;
      }
    | null
  >('analyst/queries:planWithProgressForUser'),
  moneyBoxesForUser: makeFunctionReference<'query', { userId: string }, unknown>('analyst/queries:moneyBoxesForUser'),
  moneyBoxOptimizationInputsForUser: makeFunctionReference<
    'query',
    { userId: string; currency: string },
    {
      excludedCurrencies: Array<string>;
      moneyBoxes: Array<{
        id: string;
        name: string;
        targetDate: string;
        currency: string;
        remainingMinor: bigint;
        monthlyRequiredMinor: bigint;
        fundingStatus: 'covered' | 'behind' | 'dueSoon' | 'onTrack';
      }>;
    }
  >('analyst/queries:moneyBoxOptimizationInputsForUser'),
  creditFacilitiesForUser: makeFunctionReference<
    'query',
    { userId: string; includePlans?: boolean; includeCycles?: boolean },
    unknown
  >('analyst/queries:creditFacilitiesForUser'),
  subscriptionsForUser: makeFunctionReference<
    'query',
    { userId: string; status?: 'active' | 'paused' | 'ended' },
    unknown
  >('analyst/queries:subscriptionsForUser'),
  plannedItemsForUser: makeFunctionReference<
    'query',
    {
      userId: string;
      status?: 'planned' | 'funding' | 'paid' | 'cancelled' | 'completed';
      dateFrom?: string;
      dateTo?: string;
    },
    unknown
  >('analyst/queries:plannedItemsForUser'),
  listTransactionsForUser: makeFunctionReference<
    'query',
    {
      userId: string;
      paginationOpts: PaginationOptions;
      accountId?: Id<'financialAccounts'>;
      categoryId?: Id<'categories'>;
      classificationKind?: 'income' | 'expense' | 'subscription' | 'transfer' | 'internal' | 'uncategorized';
      direction?: 'CRDT' | 'DBIT';
      fromDate?: string;
      toDate?: string;
      search?: string;
      sortField?: 'bookingDate' | 'amount';
      sortDirection?: 'asc' | 'desc';
    },
    {
      page: Array<unknown>;
      isDone: boolean;
      continueCursor: string;
      splitCursor?: string | null;
      pageStatus?: string | null;
    }
  >('banking/transactions:listTransactionsForUser'),
  getFutureCashflowForUser: makeFunctionReference<
    'query',
    { userId: string; monthsAhead?: number; limit?: number; asOfDate?: string; horizonDate?: string },
    {
      asOfDate: string;
      horizonDate: string;
      upcomingItems: Array<{
        title: string;
        dueDate: string;
        amount: Money;
        direction: 'inflow' | 'outflow';
      }>;
      upcomingItemsByAccount: Array<{
        accountId: string;
        items: Array<{
          key: string;
          title: string;
          dueDate: string;
          amount: Money;
          direction: 'inflow' | 'outflow';
          occurrencePayment?: unknown;
        }>;
      }>;
    }
  >('banking/planning:getFutureCashflowForUser'),
  getPlanningCashflowViewForUser: makeFunctionReference<
    'query',
    { userId: string; cycleOffset?: number; limit?: number; asOfDate?: string },
    {
      cycleStartDate: string;
      cycleEndDate: string;
      aggregateSeries: Array<{ date: string; projectedBalanceAfter: Money }>;
      accountGroups: Array<{
        items: Array<{
          dueDate: string;
          amount: Money;
          direction: 'inflow' | 'outflow';
        }>;
      }>;
    }
  >('banking/planning:getPlanningCashflowViewForUser'),
  longTermBaselineForUser: makeFunctionReference<
    'query',
    { userId: string; currency?: string },
    {
      currency: string;
      liquidMinor: bigint;
      investedMinor: bigint;
      monthlyIncomeMinor: bigint;
      monthlyExpensesMinor: bigint;
    }
  >('analyst/queries:getLongTermBaselineForUser'),
  forecastProjectionForUser: makeFunctionReference<
    'query',
    { userId: string; scenarioId?: Id<'forecastScenarios'> },
    | { upgradeRequired: true }
    | { needsOnboarding: true }
    | {
        scenario: {
          id: Id<'forecastScenarios'>;
          name: string;
          icon?: string;
          color?: string;
          sortOrder: number;
          currency: string;
          inflationAnnualPct: number;
          endAge: number;
        };
        projection: ForecastResult;
        excludedAccounts: Array<{ name: string; reason: string }>;
        excludedFacilities: Array<{ name: string; reason: string }>;
        events: ForecastResult['events'];
        invalidEvents: Array<{ reason: string }>;
      }
  >('forecast/projection:getProjectionForUser'),
  safeToSpendForUser: makeFunctionReference<
    'query',
    { userId: string; asOfDate?: string; accountId?: Id<'financialAccounts'> },
    Array<{
      currency: string;
      availableCash: Money;
      committedOutflows: Money;
      moneyBoxFunding: Money;
      expectedIncome: Money;
      safeToSpend: Money;
      safeToSpendWithIncome: Money;
      cycleStartDate: string;
      cycleEndDate: string;
      daysRemaining: number;
      perDay: Money;
      topUpcoming: Array<{
        name: string;
        dueDate: string;
        amount: Money;
        kind: 'plannedExpense' | 'subscription' | 'creditInstallment' | 'creditStatement';
      }>;
    }>
  >('banking/safeToSpend:getSafeToSpendForUser'),
  setPlanAssignedForAgent: makeFunctionReference<
    'mutation',
    { userId: string; bucketName: string; period?: string; amount: Money },
    Id<'planAssignments'> | null
  >('analyst/writes:setPlanAssignedForAgent'),
  setPlanTargetForAgent: makeFunctionReference<
    'mutation',
    {
      userId: string;
      bucketName: string;
      cadence: 'weekly' | 'monthly' | 'yearly' | 'custom';
      behaviour: 'setAside' | 'refill' | 'balanceBy';
      amount: Money;
      dueDate?: string;
      dayOfMonth?: number;
      dayOfWeek?: number;
      repeats: boolean;
    },
    Id<'planTargets'>
  >('analyst/writes:setPlanTargetForAgent'),
  createMoneyBoxForAgent: makeFunctionReference<
    'mutation',
    {
      userId: string;
      name: string;
      targetAmount: Money;
      savedAmount?: Money;
      targetDate: string;
      accountName?: string;
    },
    Id<'moneyBoxes'>
  >('analyst/writes:createMoneyBoxForAgent'),
  createPlannedExpenseForAgent: makeFunctionReference<
    'mutation',
    {
      userId: string;
      name: string;
      description?: string;
      amount: Money;
      direction?: 'inflow' | 'outflow';
      dueDate: string;
      recurrenceInterval?: 'day' | 'week' | 'month' | 'year';
      recurrenceIntervalCount?: number;
      categoryName?: string;
      createMoneyBox?: boolean;
      accountName?: string;
    },
    { plannedExpenseId: Id<'plannedTransactions'>; moneyBoxId: Id<'moneyBoxes'> | null }
  >('analyst/writes:createPlannedExpenseForAgent'),
  bulkRecategorizeForAgent: makeFunctionReference<
    'mutation',
    {
      userId: string;
      changes: Array<{
        transactionId: Id<'transactions'>;
        classificationKind: 'income' | 'expense' | 'subscription' | 'transfer' | 'internal' | 'uncategorized';
        categoryName?: string;
      }>;
    },
    { updatedCount: number }
  >('analyst/writes:bulkRecategorizeForAgent'),
  debtInputsForUser: makeFunctionReference<
    'query',
    { userId: string; currency?: string },
    {
      requiresCurrency: boolean;
      currencies: Array<string>;
      currency?: string | null;
      debts: Array<{
        id: string;
        name: string;
        balanceMinor: bigint;
        annualRateBps: number;
        minimumPaymentMinor: bigint;
        currency: string;
      }>;
    }
  >('analyst/proactive/queries:debtInputsForUser'),
  latestHealthScoreForUser: makeFunctionReference<
    'query',
    { userId: string; asOfDate: string; currency?: string },
    {
      computedAtDate: string;
      currency: string;
      score: number;
      components: {
        savingsRate: number;
        budgetAdherence: number;
        debtLoad: number;
        liquidityMonths: number;
        subscriptionLoad: number;
      };
    } | null
  >('analyst/proactive/queries:latestHealthScoreForUser'),
  getDetectedAnomaliesForUser: makeFunctionReference<
    'query',
    { userId: string; period: string; limit?: number },
    Array<{
      severity: 'info' | 'warning' | 'critical';
      label: string;
      currency: string;
      amount: number | null;
      baseline: number | null;
      percentAboveBaseline: number | null;
      period: string;
      detectedAtMs: number;
    }>
  >('analyst/proactive/queries:getDetectedAnomaliesForUser'),
  upsertMemoryForUser: makeFunctionReference<
    'mutation',
    {
      userId: string;
      kind: 'fact' | 'preference' | 'goal';
      content: string;
      sourceThreadId?: string;
      embedding: Array<number>;
    },
    Id<'agentMemories'>
  >('analyst/memoryStore:upsertMemoryForUser'),
  hydrateMemoriesForUser: makeFunctionReference<
    'query',
    { userId: string; memoryIds: Array<Id<'agentMemories'>> },
    Array<{ id: Id<'agentMemories'>; kind: 'fact' | 'preference' | 'goal'; content: string }>
  >('analyst/memoryStore:hydrateMemoriesForUser'),
};
