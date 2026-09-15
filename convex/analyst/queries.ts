import { ConvexError, v } from 'convex/values';
import { internalQuery } from '../_generated/server';
import { latestBookedBalance } from '../banking/balances';
import { effectiveFacilityUsedAmount } from '../banking/overdraft';
import { activePlanForUser, computePlanMonthState } from '../banking/planRead';
import { buildMoneyBoxFundingPlan } from '../banking/planningMath';
import { absoluteMinorUnits, decimalNumberToMinorUnits } from '../lib/money';
import { isAssetAccountType, isSpendableAccountType } from '../lib/accountTypes';
import { analystFunctionRefs } from './functionRefs';
import { monthlyEquivalent } from './subscriptionMath';
import { monthlyBaselineFromFutureCashflow } from './tools/simulate';
import type { Doc, Id } from '../_generated/dataModel';

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function addMonths(period: string, offset: number) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

function periodEndDate(period: string) {
  return `${addMonths(period, 1)}-01`;
}

function horizonEndDate(startMonth: string, horizonMonths: number) {
  const [year, month] = startMonth.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + horizonMonths, 0)).toISOString().slice(0, 10);
}

function medianMonthlyMinor(values: Array<number>, currency: string) {
  const ordered = values.map((value) => decimalNumberToMinorUnits(value, currency)).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return ordered[Math.floor(ordered.length / 2)] ?? 0n;
}

export const accountsOverviewForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args): Promise<unknown> => {
    const accounts = await ctx.db
      .query('financialAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .take(100);
    const visibleAccounts = accounts.filter((account) => !account.hidden);
    const totals = new Map<string, bigint>();
    const rows = [];

    for (const account of visibleAccounts) {
      const balance = await latestBookedBalance(ctx, account._id);
      if (balance) {
        totals.set(balance.amount.currency, (totals.get(balance.amount.currency) ?? 0n) + balance.amount.amountMinor);
      }
      rows.push({ account, latestBalance: balance });
    }

    return {
      accounts: rows,
      totals: [...totals].map(([currency, amountMinor]) => ({ amountMinor, currency })),
    };
  },
});

export const getLongTermBaselineForUser = internalQuery({
  args: { userId: v.string(), currency: v.optional(v.string()) },
  returns: v.object({
    currency: v.string(),
    liquidMinor: v.int64(),
    investedMinor: v.int64(),
    monthlyIncomeMinor: v.int64(),
    monthlyExpensesMinor: v.int64(),
  }),
  handler: async (ctx, args) => {
    const overview = await ctx.runQuery(analystFunctionRefs.accountsOverviewForUser, { userId: args.userId });
    const liquidAccounts = overview.accounts.filter((row) => isSpendableAccountType(row.account.accountType));
    const assetAccounts = overview.accounts.filter((row) => isAssetAccountType(row.account.accountType));
    const detectedCurrencies = [
      ...new Set(
        [...liquidAccounts, ...assetAccounts].flatMap((row) =>
          row.latestBalance ? [row.latestBalance.amount.currency.toUpperCase()] : [row.account.currency.toUpperCase()],
        ),
      ),
    ].sort();
    const currency = args.currency?.trim().toUpperCase() || detectedCurrencies.at(0) || 'EUR';
    const liquidMinor = liquidAccounts.reduce(
      (total, row) =>
        row.latestBalance?.amount.currency.toUpperCase() === currency
          ? total + row.latestBalance.amount.amountMinor
          : total,
      0n,
    );
    const investedMinor = assetAccounts.reduce(
      (total, row) =>
        row.latestBalance?.amount.currency.toUpperCase() === currency
          ? total + row.latestBalance.amount.amountMinor
          : total,
      0n,
    );
    const asOfDate = new Date().toISOString().slice(0, 10);
    const startMonth = asOfDate.slice(0, 7);
    const futureCashflow = await ctx.runQuery(analystFunctionRefs.getFutureCashflowForUser, {
      userId: args.userId,
      asOfDate,
      horizonDate: horizonEndDate(startMonth, 3),
      limit: 100,
    });
    const baseline = monthlyBaselineFromFutureCashflow(
      {
        accounts: liquidAccounts.map((row) => ({ latestBalance: row.latestBalance })),
        upcomingItemsByAccount: futureCashflow.upcomingItemsByAccount,
      },
      { startMonth, horizonMonths: 3, currency },
    );

    return {
      currency,
      liquidMinor,
      investedMinor,
      monthlyIncomeMinor: medianMonthlyMinor(
        baseline.map((month) => month.inflow),
        currency,
      ),
      monthlyExpensesMinor: medianMonthlyMinor(
        baseline.map((month) => month.outflow),
        currency,
      ),
    };
  },
});

export const spendingByCategoryForUser = internalQuery({
  args: {
    userId: v.string(),
    period: v.optional(v.string()),
    monthsBack: v.optional(v.number()),
    accountId: v.optional(v.id('financialAccounts')),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const monthsBack = Math.min(Math.max(Math.floor(args.monthsBack ?? 1), 1), 6);
    const endPeriod = args.period ?? currentPeriod();
    const startPeriod = addMonths(endPeriod, -(monthsBack - 1));
    const startDate = `${startPeriod}-01`;
    const endDate = periodEndDate(endPeriod);

    if (args.accountId) {
      const account = await ctx.db.get('financialAccounts', args.accountId);
      if (!account || account.userId !== args.userId) throw new ConvexError('Account not found');
    }

    const transactions = args.accountId
      ? await ctx.db
          .query('transactions')
          .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
            q
              .eq('userId', args.userId)
              .eq('accountId', args.accountId!)
              .gte('bookingDate', startDate)
              .lt('bookingDate', endDate),
          )
          .take(2000)
      : await ctx.db
          .query('transactions')
          .withIndex('by_userId_and_bookingDate', (q) =>
            q.eq('userId', args.userId).gte('bookingDate', startDate).lt('bookingDate', endDate),
          )
          .take(2000);
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .take(200);
    const categoryById = new Map(categories.map((category) => [category._id, category]));
    const totals = new Map<
      string,
      {
        month: string;
        categoryId: Id<'categories'> | null;
        categoryName: string | null;
        amountMinor: bigint;
        currency: string;
      }
    >();

    for (const transaction of transactions) {
      if (
        transaction.direction !== 'DBIT' ||
        transaction.classificationKind === 'transfer' ||
        transaction.classificationKind === 'internal'
      )
        continue;
      const month = transaction.bookingDate.slice(0, 7);
      const key = `${month}:${transaction.categoryId ?? 'uncategorized'}:${transaction.amount.currency}`;
      const current = totals.get(key);
      const amountMinor = absoluteMinorUnits(transaction.amount.amountMinor);
      if (current) current.amountMinor += amountMinor;
      else {
        totals.set(key, {
          month,
          categoryId: transaction.categoryId ?? null,
          categoryName: transaction.categoryId ? (categoryById.get(transaction.categoryId)?.name ?? null) : null,
          amountMinor,
          currency: transaction.amount.currency,
        });
      }
    }

    return [...totals.values()].sort((left, right) =>
      left.month === right.month
        ? left.amountMinor > right.amountMinor
          ? -1
          : left.amountMinor < right.amountMinor
            ? 1
            : 0
        : left.month.localeCompare(right.month),
    );
  },
});

export const planWithProgressForUser = internalQuery({
  args: { userId: v.string(), period: v.optional(v.string()) },
  handler: async (ctx, args): Promise<unknown> => {
    const period = args.period ?? currentPeriod();
    const plan = await activePlanForUser(ctx, args.userId);
    if (!plan) return null;
    const { rows, month, bucketStates } = await computePlanMonthState(ctx, plan, period);
    const groupById = new Map(rows.groups.map((group) => [group._id, group]));
    const stateByBucketId = new Map(bucketStates.map((state) => [state.bucketId, state]));
    const totals = bucketStates.reduce(
      (result, state) => ({
        assignedMinor: result.assignedMinor + state.assignedMinor,
        activityMinor: result.activityMinor + state.activityMinor,
        availableMinor: result.availableMinor + state.availableEndMinor,
        neededMinor: result.neededMinor + state.neededMinor,
        underfundedMinor: result.underfundedMinor + state.underfundedMinor,
      }),
      { assignedMinor: 0n, activityMinor: 0n, availableMinor: 0n, neededMinor: 0n, underfundedMinor: 0n },
    );

    return {
      plan: { id: plan._id, name: plan.name, currency: plan.currency },
      period,
      readyToAssignMinor: month.readyToAssignMinor,
      totals,
      buckets: rows.buckets.slice(0, 100).map((bucket) => {
        const state = stateByBucketId.get(bucket._id);
        if (!state) throw new ConvexError('Plan bucket computation failed');
        const group = groupById.get(bucket.groupId);
        return {
          bucketId: bucket._id,
          name: bucket.name,
          hidden: bucket.hidden || (group?.hidden ?? false),
          groupId: group?._id ?? null,
          groupName: group?.name ?? null,
          assignedMinor: state.assignedMinor,
          activityMinor: state.activityMinor,
          availableMinor: state.availableEndMinor,
          neededMinor: state.neededMinor,
          underfundedMinor: state.underfundedMinor,
          snoozed: state.snoozed,
          status: state.status,
        };
      }),
      truncated: month.truncated || rows.buckets.length > 100,
    };
  },
});

export const moneyBoxesForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args): Promise<unknown> => {
    const moneyBoxes = await ctx.db
      .query('moneyBoxes')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(100);
    return moneyBoxes.map((moneyBox) => ({
      moneyBox,
      funding: buildMoneyBoxFundingPlan({
        targetAmount: moneyBox.targetAmount,
        savedAmount: moneyBox.savedAmount,
        targetDate: moneyBox.targetDate,
        createdAtMs: moneyBox.createdAtMs,
      }),
    }));
  },
});

export const moneyBoxOptimizationInputsForUser = internalQuery({
  args: { userId: v.string(), currency: v.string() },
  handler: async (ctx, args) => {
    const currency = args.currency.toUpperCase();
    const moneyBoxes = await ctx.db
      .query('moneyBoxes')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(100);
    const excludedCurrencies = [
      ...new Set(
        moneyBoxes.map((moneyBox) => moneyBox.targetAmount.currency).filter((candidate) => candidate !== currency),
      ),
    ].sort();
    return {
      excludedCurrencies,
      moneyBoxes: moneyBoxes
        .filter((moneyBox) => moneyBox.targetAmount.currency === currency)
        .map((moneyBox) => {
          const funding = buildMoneyBoxFundingPlan({
            targetAmount: moneyBox.targetAmount,
            savedAmount: moneyBox.savedAmount,
            targetDate: moneyBox.targetDate,
            createdAtMs: moneyBox.createdAtMs,
          });
          return {
            id: moneyBox._id,
            name: moneyBox.name,
            targetDate: moneyBox.targetDate,
            currency,
            remainingMinor: funding.remainingAmount.amountMinor,
            monthlyRequiredMinor: funding.monthlyRequiredAmount.amountMinor,
            fundingStatus: funding.fundingStatus,
          };
        }),
    };
  },
});

export const creditFacilitiesForUser = internalQuery({
  args: { userId: v.string(), includePlans: v.optional(v.boolean()), includeCycles: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<unknown> => {
    const facilities = await ctx.db
      .query('creditFacilities')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(100);
    const plans = args.includePlans
      ? await ctx.db
          .query('creditFacilityInstallmentPlans')
          .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
          .take(200)
      : [];
    const cycles = args.includeCycles
      ? [
          ...(await ctx.db
            .query('creditFacilityUsageCycles')
            .withIndex('by_userId_and_status_and_dueDate', (q) => q.eq('userId', args.userId).eq('status', 'open'))
            .take(200)),
          ...(await ctx.db
            .query('creditFacilityUsageCycles')
            .withIndex('by_userId_and_status_and_dueDate', (q) => q.eq('userId', args.userId).eq('status', 'scheduled'))
            .take(200)),
        ]
      : [];
    return await Promise.all(
      facilities.map(async (facility) => {
        const { usedAmount } = await effectiveFacilityUsedAmount(ctx, facility);
        return {
          facility: { ...facility, usedAmount },
          plans: plans.filter((plan) => plan.creditFacilityId === facility._id),
          cycles: cycles.filter((cycle) => cycle.creditFacilityId === facility._id),
        };
      }),
    );
  },
});

export const subscriptionsForUser = internalQuery({
  args: {
    userId: v.string(),
    status: v.optional(v.union(v.literal('active'), v.literal('paused'), v.literal('ended'))),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const subscriptions = args.status
      ? await ctx.db
          .query('subscriptions')
          .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', args.status!))
          .take(200)
      : await ctx.db
          .query('subscriptions')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .take(200);
    return subscriptions.map((subscription) => ({
      subscription,
      monthlyEquivalent: monthlyEquivalent(subscription.amount, subscription.interval, subscription.intervalCount),
    }));
  },
});

export const plannedItemsForUser = internalQuery({
  args: {
    userId: v.string(),
    status: v.optional(
      v.union(
        v.literal('planned'),
        v.literal('funding'),
        v.literal('paid'),
        v.literal('cancelled'),
        v.literal('completed'),
      ),
    ),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const expenseStatuses = ['planned', 'funding', 'paid', 'cancelled'] as const;
    const transferStatusValues = ['planned', 'completed', 'cancelled'] as const;
    const includesExpenses = !args.status || expenseStatuses.some((status) => status === args.status);
    const includesTransfers = !args.status || transferStatusValues.some((status) => status === args.status);
    const perKindLimit = includesExpenses && includesTransfers ? 100 : 200;
    const expenses: Array<Doc<'plannedTransactions'>> = [];
    if (includesExpenses) {
      for (const kind of ['expense', 'income'] as const) {
        const rows = args.status
          ? await ctx.db
              .query('plannedTransactions')
              .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) => {
                const base = q
                  .eq('userId', args.userId)
                  .eq('kind', kind)
                  .eq('status', args.status as (typeof expenseStatuses)[number]);
                if (args.dateFrom && args.dateTo)
                  return base.gte('dueDate', args.dateFrom).lte('dueDate', args.dateTo);
                if (args.dateFrom) return base.gte('dueDate', args.dateFrom);
                if (args.dateTo) return base.lte('dueDate', args.dateTo);
                return base;
              })
              .take(perKindLimit)
          : await ctx.db
              .query('plannedTransactions')
              .withIndex('by_userId_and_kind_and_dueDate', (q) => {
                const base = q.eq('userId', args.userId).eq('kind', kind);
                if (args.dateFrom && args.dateTo)
                  return base.gte('dueDate', args.dateFrom).lte('dueDate', args.dateTo);
                if (args.dateFrom) return base.gte('dueDate', args.dateFrom);
                if (args.dateTo) return base.lte('dueDate', args.dateTo);
                return base;
              })
              .take(perKindLimit);
        expenses.push(...rows);
      }
      expenses.sort(
        (left, right) => left.dueDate.localeCompare(right.dueDate) || left._creationTime - right._creationTime,
      );
      expenses.splice(perKindLimit);
    }
    const transferStatuses = args.status
      ? includesTransfers
        ? [args.status as (typeof transferStatusValues)[number]]
        : []
      : transferStatusValues;
    const transfers = [];
    for (const status of transferStatuses) {
      const remaining: number = perKindLimit - transfers.length;
      if (remaining <= 0) break;
      const storedStatus = status === 'completed' ? 'paid' : status;
      const rows = await ctx.db
        .query('plannedTransactions')
        .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) => {
          const base = q.eq('userId', args.userId).eq('kind', 'transfer').eq('status', storedStatus);
          if (args.dateFrom && args.dateTo) return base.gte('dueDate', args.dateFrom).lte('dueDate', args.dateTo);
          if (args.dateFrom) return base.gte('dueDate', args.dateFrom);
          if (args.dateTo) return base.lte('dueDate', args.dateTo);
          return base;
        })
        .take(remaining);
      transfers.push(
        ...rows.map((transfer) => ({
          ...transfer,
          scheduledDate: transfer.dueDate,
          status: transfer.status === 'paid' ? ('completed' as const) : transfer.status,
        })),
      );
    }
    return {
      expenses,
      transfers,
    };
  },
});
