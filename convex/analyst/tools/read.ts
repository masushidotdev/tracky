import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { moneyToMajor } from '../format';
import { analystFunctionRefs } from '../functionRefs';
import type { Doc, Id } from '../../_generated/dataModel';
import type { Tool } from 'ai';

type Money = { amountMinor: bigint; currency: string };

function requireUserId(userId: string | undefined) {
  if (!userId) throw new Error('Unauthorized');
  return userId;
}

export function normalizeOptionalId<T extends string>(value: string | undefined): T | undefined {
  const normalized = value?.trim();
  return normalized ? (normalized as T) : undefined;
}

export const getAccountsOverview: Tool = createTool({
  description: 'Get visible financial accounts, their latest balances, and totals by currency.',
  inputSchema: z.object({}),
  execute: async (ctx) => {
    const result = await ctx.runQuery(analystFunctionRefs.accountsOverviewForUser, {
      userId: requireUserId(ctx.userId),
    });
    return {
      accounts: result.accounts.slice(0, 100).map(({ account, latestBalance }) => ({
        id: account._id,
        name: account.alias ?? account.name,
        type: account.accountType ?? account.accountSubtype ?? null,
        currency: account.currency,
        status: account.status,
        balance: latestBalance ? moneyToMajor(latestBalance.amount) : null,
      })),
      totals: result.totals.map(moneyToMajor),
    };
  },
});

export const listTransactions: Tool = createTool({
  description: 'List the user transactions with optional account, category, date, direction, and text filters.',
  inputSchema: z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    accountId: z.string().optional(),
    categoryId: z.string().optional(),
    direction: z.enum(['inflow', 'outflow']).optional(),
    classification: z.enum(['income', 'expense', 'subscription', 'transfer', 'internal', 'uncategorized']).optional(),
    searchText: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().nullable().optional(),
  }),
  execute: async (ctx, input) => {
    const accountId = normalizeOptionalId<Id<'financialAccounts'>>(input.accountId);
    const categoryId = normalizeOptionalId<Id<'categories'>>(input.categoryId);
    const result = (await ctx.runQuery(analystFunctionRefs.listTransactionsForUser, {
      userId: requireUserId(ctx.userId),
      paginationOpts: { numItems: input.limit, cursor: input.cursor ?? null },
      ...(accountId ? { accountId } : {}),
      ...(categoryId ? { categoryId } : {}),
      direction: input.direction === 'inflow' ? 'CRDT' : input.direction === 'outflow' ? 'DBIT' : undefined,
      classificationKind: input.classification,
      fromDate: input.dateFrom,
      toDate: input.dateTo,
      search: input.searchText,
      sortField: 'bookingDate',
      sortDirection: 'desc',
    })) as {
      page: Array<Doc<'transactions'>>;
      isDone: boolean;
      continueCursor: string;
    };
    return {
      rows: result.page.slice(0, input.limit).map((transaction) => ({
        id: transaction._id,
        date: transaction.bookingDate,
        description: transaction.description,
        counterparty: transaction.counterpartyName ?? undefined,
        amount: moneyToMajor(transaction.amount).amount,
        currency: transaction.amount.currency,
        direction: transaction.direction === 'CRDT' ? 'inflow' : 'outflow',
        categoryId: transaction.categoryId,
        classification: transaction.classificationKind,
        status: transaction.status,
      })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const getSpendingByCategory: Tool = createTool({
  description: 'Aggregate debit spending by month and category, excluding transfers and internal movements.',
  inputSchema: z.object({
    period: z.string().optional(),
    monthsBack: z.number().int().min(1).max(6).optional(),
    accountId: z.string().optional(),
  }),
  execute: async (ctx, input) => {
    const accountId = normalizeOptionalId<Id<'financialAccounts'>>(input.accountId);
    const rows = (await ctx.runQuery(analystFunctionRefs.spendingByCategoryForUser, {
      userId: requireUserId(ctx.userId),
      period: input.period,
      monthsBack: input.monthsBack,
      ...(accountId ? { accountId } : {}),
    })) as Array<{
      month: string;
      categoryId: Id<'categories'> | null;
      categoryName: string | null;
      amountMinor: bigint;
      currency: string;
    }>;
    const monthGroups = new Map<string, typeof rows>();
    for (const row of rows.slice(0, 200)) {
      const key = `${row.month}:${row.currency}`;
      monthGroups.set(key, [...(monthGroups.get(key) ?? []), row]);
    }
    const currencies = [...new Set(rows.map((row) => row.currency))];
    return {
      currency: currencies.length === 1 ? currencies[0] : 'MULTI',
      months: [...monthGroups.values()].map((monthRows) => {
        const totalMinor = monthRows.reduce((total, row) => total + row.amountMinor, 0n);
        return {
          period: monthRows[0].month,
          currency: monthRows[0].currency,
          total: moneyToMajor({ amountMinor: totalMinor, currency: monthRows[0].currency }).amount,
          byCategory: monthRows.map((row) => ({
            name: row.categoryName ?? 'Uncategorized',
            spent: moneyToMajor(row).amount,
            share: totalMinor === 0n ? 0 : Number((row.amountMinor * 10_000n) / totalMinor) / 100,
          })),
        };
      }),
    };
  },
});

export const getSpendingReport: Tool = createTool({
  description: 'Get a cash-flow, spending, or income report grouped over an exact date range.',
  inputSchema: z.object({
    tab: z.enum(['cashflow', 'spending', 'income']),
    groupBy: z.enum(['category', 'categoryGroup', 'counterparty', 'account']).default('category'),
    granularity: z.enum(['month', 'quarter', 'year']).default('month'),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  execute: async (ctx, input) => {
    const report = await ctx.runQuery(analystFunctionRefs.spendingReportForUser, {
      userId: requireUserId(ctx.userId),
      ...input,
    });
    return {
      summary: report.summary.map((row) => ({
        currency: row.currency,
        income: moneyToMajor({ amountMinor: row.incomeMinor, currency: row.currency }),
        expenses: moneyToMajor({ amountMinor: row.expensesMinor, currency: row.currency }),
        net: moneyToMajor({ amountMinor: row.netMinor, currency: row.currency }),
        savingsRatePct: row.savingsRatePct,
      })),
      series: report.series.map((row) => ({
        period: row.period,
        currency: row.currency,
        groups: row.groups.map((group) => ({
          key: group.key,
          label: group.label,
          income: moneyToMajor({ amountMinor: group.incomeMinor, currency: row.currency }),
          expenses: moneyToMajor({ amountMinor: group.expensesMinor, currency: row.currency }),
        })),
      })),
      breakdown: report.breakdown.map((row) => ({
        key: row.key,
        label: row.label,
        currency: row.currency,
        income: moneyToMajor({ amountMinor: row.incomeMinor, currency: row.currency }),
        expenses: moneyToMajor({ amountMinor: row.expensesMinor, currency: row.currency }),
        total: moneyToMajor({ amountMinor: row.totalMinor, currency: row.currency }),
      })),
      truncated: report.truncated,
    };
  },
});

export const getPlanWithProgress: Tool = createTool({
  description:
    'Get the active Plan for a month with bucket assignments, signed activity, availability, target needs, underfunding, status, totals, and Ready to Assign.',
  inputSchema: z.object({ period: z.string().optional() }),
  execute: async (ctx, input) => {
    const period = input.period ?? new Date().toISOString().slice(0, 7);
    const result = await ctx.runQuery(analystFunctionRefs.planWithProgressForUser, {
      userId: requireUserId(ctx.userId),
      ...input,
    });
    if (!result) return { period, plan: null, readyToAssign: null, totals: null, buckets: [], truncated: false };
    const currency = result.plan.currency;
    const major = (amountMinor: bigint) => moneyToMajor({ amountMinor, currency }).amount;
    return {
      period: result.period,
      plan: result.plan,
      readyToAssign: major(result.readyToAssignMinor),
      totals: {
        assigned: major(result.totals.assignedMinor),
        activity: major(result.totals.activityMinor),
        available: major(result.totals.availableMinor),
        targetNeed: major(result.totals.neededMinor),
        underfunded: major(result.totals.underfundedMinor),
      },
      buckets: result.buckets.slice(0, 100).map((bucket) => ({
        id: bucket.bucketId,
        name: bucket.name,
        hidden: bucket.hidden,
        groupId: bucket.groupId,
        groupName: bucket.groupName,
        assigned: major(bucket.assignedMinor),
        activity: major(bucket.activityMinor),
        available: major(bucket.availableMinor),
        targetNeed: major(bucket.neededMinor),
        underfunded: major(bucket.underfundedMinor),
        snoozed: bucket.snoozed,
        status: bucket.status,
      })),
      truncated: result.truncated || result.buckets.length > 100,
    };
  },
});

export const getCashflowProjection: Tool = createTool({
  description: 'Get a compact planning-cycle cashflow projection with balances after each commitment.',
  inputSchema: z.object({
    cycleOffset: z.number().int().min(-24).max(24).optional(),
    horizonDate: z.string().optional(),
    asOfDate: z.string().optional(),
  }),
  execute: async (ctx, input) => {
    const userId = requireUserId(ctx.userId);
    if (input.horizonDate) {
      const summary = await ctx.runQuery(analystFunctionRefs.getFutureCashflowForUser, {
        userId,
        asOfDate: input.asOfDate,
        horizonDate: input.horizonDate,
        limit: 100,
      });
      return {
        asOfDate: summary.asOfDate,
        horizonDate: summary.horizonDate,
        rows: summary.upcomingItems.slice(0, 100).map((item) => ({
          date: item.dueDate,
          label: item.title,
          inflow: item.direction === 'inflow' ? moneyToMajor(item.amount).amount : 0,
          outflow: item.direction === 'outflow' ? moneyToMajor(item.amount).amount : 0,
          currency: item.amount.currency,
        })),
      };
    }
    const view = await ctx.runQuery(analystFunctionRefs.getPlanningCashflowViewForUser, {
      userId,
      cycleOffset: input.cycleOffset,
      asOfDate: input.asOfDate,
      limit: 100,
    });
    return {
      cycleStartDate: view.cycleStartDate,
      cycleEndDate: view.cycleEndDate,
      rows: view.aggregateSeries.slice(0, 100).map((point) => ({
        date: point.date,
        projectedBalance: moneyToMajor(point.projectedBalanceAfter).amount,
        currency: point.projectedBalanceAfter.currency,
      })),
      commitments: view.accountGroups
        .flatMap((group) => group.items)
        .slice(0, 100)
        .map((item) => ({
          date: item.dueDate,
          inflow: item.direction === 'inflow' ? moneyToMajor(item.amount).amount : 0,
          outflow: item.direction === 'outflow' ? moneyToMajor(item.amount).amount : 0,
          currency: item.amount.currency,
        })),
    };
  },
});

export const getSafeToSpend: Tool = createTool({
  description:
    'Get safe-to-spend amounts by currency for the current planning cycle, after committed bills and money-box funding.',
  inputSchema: z.object({ asOfDate: z.string().optional() }),
  execute: async (ctx, input) => {
    const rows = await ctx.runQuery(analystFunctionRefs.safeToSpendForUser, {
      userId: requireUserId(ctx.userId),
      asOfDate: input.asOfDate,
    });
    return {
      currencies: rows.map((row) => ({
        currency: row.currency,
        availableCash: moneyToMajor(row.availableCash),
        committedOutflows: moneyToMajor(row.committedOutflows),
        moneyBoxFunding: moneyToMajor(row.moneyBoxFunding),
        expectedIncome: moneyToMajor(row.expectedIncome),
        safeToSpend: moneyToMajor(row.safeToSpend),
        safeToSpendWithIncome: moneyToMajor(row.safeToSpendWithIncome),
        cycleStartDate: row.cycleStartDate,
        cycleEndDate: row.cycleEndDate,
        daysRemaining: row.daysRemaining,
        perDay: moneyToMajor(row.perDay),
        topUpcoming: row.topUpcoming.map((item) => ({
          ...item,
          amount: moneyToMajor(item.amount),
        })),
      })),
    };
  },
});

export const getMoneyBoxes: Tool = createTool({
  description: 'Get active savings money boxes and their funding plans.',
  inputSchema: z.object({}),
  execute: async (ctx) => {
    const rows = (await ctx.runQuery(analystFunctionRefs.moneyBoxesForUser, {
      userId: requireUserId(ctx.userId),
    })) as Array<{
      moneyBox: Doc<'moneyBoxes'>;
      funding: Record<string, unknown> & { remainingAmount: Money; monthlyRequiredAmount: Money };
    }>;
    return {
      moneyBoxes: rows.slice(0, 100).map(({ moneyBox, funding }) => ({
        name: moneyBox.name,
        target: moneyToMajor(moneyBox.targetAmount),
        saved: moneyToMajor(moneyBox.savedAmount),
        targetDate: moneyBox.targetDate,
        remaining: moneyToMajor(funding.remainingAmount),
        monthlyRequired: moneyToMajor(funding.monthlyRequiredAmount),
        progressPercent: funding.progressPercent,
        fundingStatus: funding.fundingStatus,
      })),
    };
  },
});

export const getCreditFacilities: Tool = createTool({
  description: 'Get active credit facilities and optionally their active installment plans and open statement cycles.',
  inputSchema: z.object({ includePlans: z.boolean().default(true), includeCycles: z.boolean().default(true) }),
  execute: async (ctx, input) => {
    const rows = (await ctx.runQuery(analystFunctionRefs.creditFacilitiesForUser, {
      userId: requireUserId(ctx.userId),
      ...input,
    })) as Array<{
      facility: Doc<'creditFacilities'>;
      plans: Array<Doc<'creditFacilityInstallmentPlans'>>;
      cycles: Array<Doc<'creditFacilityUsageCycles'>>;
    }>;
    return {
      facilities: rows.slice(0, 100).map(({ facility, plans, cycles }) => {
        const usedAmount = facility.usedAmount;
        return {
          name: facility.name,
          type: facility.facilityType,
          limit: moneyToMajor(facility.limitAmount),
          used: moneyToMajor(usedAmount),
          available: moneyToMajor({
            amountMinor: facility.limitAmount.amountMinor - usedAmount.amountMinor,
            currency: facility.limitAmount.currency,
          }),
          repaymentType: facility.repaymentType,
          plans: plans.slice(0, 20).map((plan) => ({
            name: plan.name,
            outstanding: moneyToMajor(plan.outstandingAmount),
            monthlyPayment: moneyToMajor(plan.monthlyPaymentAmount),
            remainingInstallments: plan.remainingInstallments,
            nextPaymentDate: plan.nextPaymentDate,
          })),
          openCycles: cycles.slice(0, 20).map((cycle) => ({
            month: cycle.cycleMonth,
            status: cycle.status,
            amount: moneyToMajor(cycle.trackedAmount),
            dueDate: cycle.dueDate,
          })),
        };
      }),
    };
  },
});

export const getSubscriptions: Tool = createTool({
  description: 'Get subscriptions and their normalized monthly cost.',
  inputSchema: z.object({ status: z.enum(['active', 'paused', 'ended']).optional() }),
  execute: async (ctx, input) => {
    const rows = (await ctx.runQuery(analystFunctionRefs.subscriptionsForUser, {
      userId: requireUserId(ctx.userId),
      ...input,
    })) as Array<{ subscription: Doc<'subscriptions'>; monthlyEquivalent: Money }>;
    return {
      subscriptions: rows.slice(0, 100).map(({ subscription, monthlyEquivalent }) => ({
        name: subscription.alias ?? subscription.name,
        merchant: subscription.merchantName,
        amount: moneyToMajor(subscription.amount),
        interval: subscription.interval,
        intervalCount: subscription.intervalCount,
        monthlyEquivalent: moneyToMajor(monthlyEquivalent),
        status: subscription.status,
        nextDueDate: subscription.nextDueDate,
      })),
    };
  },
});

export const getPlannedItems: Tool = createTool({
  description: 'Get planned expenses and transfers in an optional date range.',
  inputSchema: z.object({
    status: z.enum(['planned', 'funding', 'paid', 'cancelled', 'completed']).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  }),
  execute: async (ctx, input) => {
    const result = (await ctx.runQuery(analystFunctionRefs.plannedItemsForUser, {
      userId: requireUserId(ctx.userId),
      ...input,
    })) as {
      expenses: Array<Doc<'plannedTransactions'>>;
      transfers: Array<{
        name: string;
        amount: { amountMinor: bigint; currency: string };
        scheduledDate: string;
        status: 'planned' | 'completed' | 'cancelled';
      }>;
    };
    return {
      expenses: result.expenses.slice(0, 100).map((expense) => ({
        name: expense.name,
        amount: moneyToMajor(expense.amount),
        direction: expense.direction ?? 'outflow',
        dueDate: expense.dueDate,
        status: expense.status,
        recurrence: expense.recurrenceInterval
          ? { interval: expense.recurrenceInterval, count: expense.recurrenceIntervalCount ?? 1 }
          : null,
      })),
      transfers: result.transfers.slice(0, 100).map((transfer) => ({
        name: transfer.name,
        amount: moneyToMajor(transfer.amount),
        scheduledDate: transfer.scheduledDate,
        status: transfer.status,
      })),
    };
  },
});

export const getLatestHealthScore: Tool = createTool({
  description: 'Get the latest persisted financial health score, optionally for one currency.',
  inputSchema: z.object({
    asOfDate: z.string().optional(),
    currency: z
      .string()
      .regex(/^[A-Za-z]{3}$/)
      .optional(),
  }),
  execute: async (ctx, input) => {
    const asOfDate = (input.asOfDate ?? new Date().toISOString()).slice(0, 10);
    const snapshot = await ctx.runQuery(analystFunctionRefs.latestHealthScoreForUser, {
      userId: requireUserId(ctx.userId),
      asOfDate,
      currency: input.currency?.toUpperCase(),
    });
    return snapshot
      ? {
          computedAtDate: snapshot.computedAtDate,
          currency: snapshot.currency,
          score: snapshot.score,
          components: snapshot.components,
        }
      : { score: null, asOfDate, currency: input.currency?.toUpperCase() ?? null };
  },
});

export const getDetectedAnomalies: Tool = createTool({
  description: 'Get bounded spending anomalies already detected for an exact reporting period.',
  inputSchema: z.object({
    period: z.string().regex(/^\d{4}-\d{2}$/),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  execute: async (ctx, input) => ({
    period: input.period,
    anomalies: await ctx.runQuery(analystFunctionRefs.getDetectedAnomaliesForUser, {
      userId: requireUserId(ctx.userId),
      period: input.period,
      limit: input.limit,
    }),
  }),
});
