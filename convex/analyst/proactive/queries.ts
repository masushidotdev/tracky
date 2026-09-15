import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { internalQuery } from '../../_generated/server';
import { absoluteMinorUnits, minorUnitFactor } from '../../lib/money';
import { latestBookedBalance } from '../../banking/balances';
import { activePlanForUser, computePlanMonthState } from '../../banking/planRead';
import { monthlyEquivalent } from '../subscriptionMath';
import type { Doc, Id } from '../../_generated/dataModel';

const MAX_TRANSACTIONS = 5_000;
const MAX_CATEGORIES = 200;
const MAX_SUBSCRIPTIONS = 200;
const MAX_CREDIT_ROWS = 200;

function addMonths(period: string, offset: number) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

function nextIsoDate(date: string) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function toMajor(amountMinor: bigint, currency: string) {
  return Number(amountMinor) / Number(minorUnitFactor(currency));
}

function normalizedMerchant(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

export const listActiveUserProfilesPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query('userProfiles')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((profile) => ({
        authUserId: profile.authUserId,
        email: profile.email,
        emailVerified: profile.emailVerified,
        locale: profile.locale,
        name: profile.name,
      })),
    };
  },
});

export const spendingSeriesForUser = internalQuery({
  args: { userId: v.string(), asOfDate: v.string() },
  handler: async (ctx, args) => {
    const currentPeriod = args.asOfDate.slice(0, 7);
    const startPeriod = addMonths(currentPeriod, -6);
    const asOfExclusive = nextIsoDate(args.asOfDate);
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_status_and_bookingDate', (q) =>
        q
          .eq('userId', args.userId)
          .eq('status', 'BOOK')
          .gte('bookingDate', `${startPeriod}-01`)
          .lt('bookingDate', asOfExclusive),
      )
      .order('desc')
      .take(MAX_TRANSACTIONS);
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .take(MAX_CATEGORIES);
    const categoryById = new Map(categories.map((category) => [category._id, category.name]));
    type Aggregate = {
      scope: 'category' | 'merchant';
      key: string;
      label: string;
      currency: string;
      amounts: Map<string, bigint>;
    };
    const groups = new Map<string, Aggregate>();

    function add(scope: Aggregate['scope'], key: string, label: string, transaction: Doc<'transactions'>) {
      const currency = transaction.amount.currency.toUpperCase();
      const groupKey = `${scope}:${currency}:${key}`;
      const existing = groups.get(groupKey) ?? { scope, key, label, currency, amounts: new Map<string, bigint>() };
      const period = transaction.bookingDate.slice(0, 7);
      existing.amounts.set(
        period,
        (existing.amounts.get(period) ?? 0n) + absoluteMinorUnits(transaction.amount.amountMinor),
      );
      groups.set(groupKey, existing);
    }

    for (const transaction of transactions) {
      if (
        transaction.direction !== 'DBIT' ||
        transaction.classificationKind === 'transfer' ||
        transaction.classificationKind === 'internal' ||
        transaction.amount.amountMinor === 0n
      ) {
        continue;
      }
      const categoryKey = transaction.categoryId ?? 'uncategorized';
      add(
        'category',
        categoryKey,
        transaction.categoryId ? (categoryById.get(transaction.categoryId) ?? 'Unknown category') : 'Uncategorized',
        transaction,
      );
      const merchantLabel = (transaction.counterpartyName || transaction.description).trim().slice(0, 120);
      const merchantKey = normalizedMerchant(merchantLabel);
      if (merchantKey) add('merchant', merchantKey, merchantLabel, transaction);
    }

    return [...groups.values()]
      .map((group) => ({
        scope: group.scope,
        key: group.key,
        label: group.label,
        currency: group.currency,
        currentPeriod,
        currentAmount: toMajor(group.amounts.get(currentPeriod) ?? 0n, group.currency),
        baseline: Array.from({ length: 6 }, (_, index) => {
          const period = addMonths(currentPeriod, index - 6);
          return { period, amount: toMajor(group.amounts.get(period) ?? 0n, group.currency) };
        }),
      }))
      .sort(
        (left, right) =>
          left.currency.localeCompare(right.currency) ||
          left.scope.localeCompare(right.scope) ||
          left.key.localeCompare(right.key),
      );
  },
});

type CurrencyHealthAccumulator = {
  inflowMinor: bigint;
  outflowMinor: bigint;
  liquidMinor: bigint;
  debtPaymentMinor: bigint;
  subscriptionMinor: bigint;
  planFundedMinor: bigint;
  planSpentMinor: bigint;
};

function healthAccumulator() : CurrencyHealthAccumulator {
  return {
    inflowMinor: 0n,
    outflowMinor: 0n,
    liquidMinor: 0n,
    debtPaymentMinor: 0n,
    subscriptionMinor: 0n,
    planFundedMinor: 0n,
    planSpentMinor: 0n,
  };
}

export const healthInputsForUser = internalQuery({
  args: { userId: v.string(), asOfDate: v.string() },
  handler: async (ctx, args) => {
    const currentPeriod = args.asOfDate.slice(0, 7);
    const trailingStart = `${addMonths(currentPeriod, -3)}-01`;
    const currentEnd = nextIsoDate(args.asOfDate);
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_status_and_bookingDate', (q) =>
        q
          .eq('userId', args.userId)
          .eq('status', 'BOOK')
          .gte('bookingDate', trailingStart)
          .lt('bookingDate', currentEnd),
      )
      .order('desc')
      .take(MAX_TRANSACTIONS);
    const accumulators = new Map<string, CurrencyHealthAccumulator>();
    const get = (currency: string) => {
      const normalized = currency.toUpperCase();
      const value = accumulators.get(normalized) ?? healthAccumulator();
      accumulators.set(normalized, value);
      return value;
    };

    for (const transaction of transactions) {
      if (transaction.classificationKind === 'transfer' || transaction.classificationKind === 'internal') continue;
      const amount = absoluteMinorUnits(transaction.amount.amountMinor);
      const accumulator = get(transaction.amount.currency);
      if (transaction.bookingDate < `${currentPeriod}-01`) {
        if (transaction.direction === 'CRDT') accumulator.inflowMinor += amount;
        else accumulator.outflowMinor += amount;
      }
    }

    const accounts = await ctx.db
      .query('financialAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .take(100);
    for (const account of accounts) {
      if (account.hidden) continue;
      const balance = await latestBookedBalance(ctx, account._id);
      if (balance) get(balance.amount.currency).liquidMinor += balance.amount.amountMinor;
    }

    const activePlan = await activePlanForUser(ctx, args.userId);
    if (activePlan && currentPeriod >= activePlan.startPeriod) {
      const { month, bucketStates } = await computePlanMonthState(ctx, activePlan, currentPeriod);
      if (!month.truncated) {
        const accumulator = get(activePlan.currency);
        for (const bucket of bucketStates) {
          const fundedMinor = bucket.carryInMinor + bucket.assignedMinor;
          accumulator.planFundedMinor += fundedMinor > 0n ? fundedMinor : 0n;
          accumulator.planSpentMinor += bucket.activityMinor < 0n ? -bucket.activityMinor : 0n;
        }
      }
    }

    const plans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(MAX_CREDIT_ROWS);
    for (const plan of plans) {
      get(plan.monthlyPaymentAmount.currency).debtPaymentMinor += plan.monthlyPaymentAmount.amountMinor;
    }

    const subscriptions = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(MAX_SUBSCRIPTIONS);
    for (const subscription of subscriptions) {
      const monthly = monthlyEquivalent(subscription.amount, subscription.interval, subscription.intervalCount);
      get(monthly.currency).subscriptionMinor += monthly.amountMinor;
    }

    const inputs = [...accumulators.entries()]
      .map(([currency, value]) => ({
        currency,
        monthlyIncome: toMajor(value.inflowMinor, currency) / 3,
        monthlyOutflow: toMajor(value.outflowMinor, currency) / 3,
        monthlyDebtPayments: toMajor(value.debtPaymentMinor, currency),
        liquidBalance: toMajor(value.liquidMinor, currency),
        essentialMonthlyOutflow: toMajor(value.outflowMinor, currency) / 3,
        subscriptionMonthly: toMajor(value.subscriptionMinor, currency),
        budgetAmount: toMajor(value.planFundedMinor, currency),
        budgetSpent: toMajor(value.planSpentMinor, currency),
        trailingInflow: toMajor(value.inflowMinor, currency),
      }))
      .sort((left, right) => left.currency.localeCompare(right.currency));
    const primary = [...inputs].sort(
      (left, right) =>
        right.trailingInflow - left.trailingInflow ||
        Math.abs(right.liquidBalance) - Math.abs(left.liquidBalance) ||
        left.currency.localeCompare(right.currency),
    ).at(0);
    return { primaryCurrency: primary?.currency ?? null, inputs };
  },
});

export const subscriptionReviewInputsForUser = internalQuery({
  args: { userId: v.string(), asOfDate: v.string() },
  handler: async (ctx, args) => {
    const currentPeriod = args.asOfDate.slice(0, 7);
    const startDate = `${addMonths(currentPeriod, -3)}-01`;
    const subscriptions = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(MAX_SUBSCRIPTIONS);
    const rows = [];
    for (const subscription of subscriptions) {
      const latestTransaction = subscription.latestTransactionId
        ? await ctx.db.get('transactions', subscription.latestTransactionId)
        : null;
      const ownedTransaction = latestTransaction?.userId === args.userId && latestTransaction.status === 'BOOK'
        ? latestTransaction
        : null;
      const monthly = monthlyEquivalent(subscription.amount, subscription.interval, subscription.intervalCount);
      rows.push({
        id: subscription._id,
        name: subscription.alias ?? subscription.name,
        merchantName: subscription.merchantName,
        monthlyAmount: toMajor(monthly.amountMinor, monthly.currency),
        currency: monthly.currency.toUpperCase(),
        source: subscription.source,
        latestTransactionDate: ownedTransaction?.bookingDate,
      });
    }
    const incomeTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_status_and_bookingDate', (q) =>
        q
          .eq('userId', args.userId)
          .eq('status', 'BOOK')
          .gte('bookingDate', startDate)
          .lt('bookingDate', `${currentPeriod}-01`),
      )
      .order('desc')
      .take(MAX_TRANSACTIONS);
    const incomeMinor = new Map<string, bigint>();
    for (const transaction of incomeTransactions) {
      if (
        transaction.direction !== 'CRDT' ||
        transaction.classificationKind === 'transfer' ||
        transaction.classificationKind === 'internal'
      ) {
        continue;
      }
      const currency = transaction.amount.currency.toUpperCase();
      incomeMinor.set(currency, (incomeMinor.get(currency) ?? 0n) + absoluteMinorUnits(transaction.amount.amountMinor));
    }
    return {
      subscriptions: rows,
      monthlyIncomeByCurrency: Object.fromEntries(
        [...incomeMinor].map(([currency, amount]) => [currency, toMajor(amount, currency) / 3]),
      ),
    };
  },
});

export const debtInputsForUser = internalQuery({
  args: { userId: v.string(), currency: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const facilities = await ctx.db
      .query('creditFacilities')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(MAX_CREDIT_ROWS);
    const facilityById = new Map(facilities.map((facility) => [facility._id, facility]));
    const plans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(MAX_CREDIT_ROWS);
    const currencies = [
      ...new Set(plans.map((plan) => plan.outstandingAmount.currency.toUpperCase())),
    ].sort();
    const requestedCurrency = args.currency?.toUpperCase();
    if (!requestedCurrency && currencies.length > 1) {
      return { requiresCurrency: true as const, currencies, debts: [] };
    }
    const selectedCurrency = requestedCurrency ?? currencies.at(0) ?? null;
    const debts = plans
      .filter((plan) => plan.outstandingAmount.currency.toUpperCase() === selectedCurrency)
      .flatMap((plan) => {
        const facility = facilityById.get(plan.creditFacilityId);
        if (!facility || facility.userId !== args.userId) return [];
        return [{
          id: plan._id,
          name: `${facility.name}: ${plan.name}`,
          balanceMinor: plan.outstandingAmount.amountMinor,
          annualRateBps: facility.annualNominalRateBps ?? 0,
          minimumPaymentMinor: plan.monthlyPaymentAmount.amountMinor,
          currency: plan.outstandingAmount.currency.toUpperCase(),
        }];
      });
    return { requiresCurrency: false as const, currencies, currency: selectedCurrency, debts };
  },
});

export const latestMonthlyReportThreadForUser = internalQuery({
  args: { userId: v.string(), beforePeriod: v.string() },
  handler: async (ctx, args) => {
    const reports = await ctx.db
      .query('agentReports')
      .withIndex('by_userId_and_kind_and_period', (q) =>
        q.eq('userId', args.userId).eq('kind', 'monthly').lt('period', args.beforePeriod),
      )
      .order('desc')
      .take(10);
    return reports.find((report) => report.threadId)?.threadId ?? null;
  },
});

export const latestHealthScoreForUser = internalQuery({
  args: { userId: v.string(), asOfDate: v.string(), currency: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const currency = args.currency?.toUpperCase();
    if (currency) {
      return (
        await ctx.db
          .query('healthScoreSnapshots')
          .withIndex('by_userId_and_currency_and_computedAtDate', (q) =>
            q.eq('userId', args.userId).eq('currency', currency).lte('computedAtDate', args.asOfDate),
          )
          .order('desc')
          .take(1)
      )[0] ?? null;
    }
    const snapshots = await ctx.db
      .query('healthScoreSnapshots')
      .withIndex('by_userId_and_computedAtDate', (q) =>
        q.eq('userId', args.userId).lte('computedAtDate', args.asOfDate),
      )
      .order('desc')
      .take(20);
    return snapshots[0] ?? null;
  },
});

export const getDetectedAnomaliesForUser = internalQuery({
  args: { userId: v.string(), period: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 10), 1), 20);
    const prefix = `analyst:anomaly:${args.period}:`;
    const notifications = await ctx.db
      .query('notifications')
      .withIndex('by_userId_and_dedupeKey', (q) =>
        q.eq('userId', args.userId).gte('dedupeKey', prefix).lt('dedupeKey', `${prefix}\uffff`),
      )
      .take(100);
    return notifications
      .sort((left, right) => right.createdAtMs - left.createdAtMs)
      .slice(0, limit)
      .map((notification) => ({
        severity: notification.severity,
        label: typeof notification.params.label === 'string' ? notification.params.label : 'Unknown',
        currency: typeof notification.params.currency === 'string' ? notification.params.currency : 'UNKNOWN',
        amount: typeof notification.params.amount === 'number' ? notification.params.amount : null,
        baseline: typeof notification.params.baseline === 'number' ? notification.params.baseline : null,
        percentAboveBaseline:
          typeof notification.params.percent === 'number' ? notification.params.percent : null,
        period: args.period,
        detectedAtMs: notification.createdAtMs,
      }));
  },
});
