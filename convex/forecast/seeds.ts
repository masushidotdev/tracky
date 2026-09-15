import { v } from 'convex/values';

import { query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { latestBookedBalance } from '../banking/balances';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const MAX_ACCOUNTS = 100;
const MAX_FACILITIES = 50;
const MAX_INSTALLMENT_PLANS = 200;
const MAX_TRANSACTIONS_PER_DIRECTION = 5_000;

type SeedContext = QueryCtx | MutationCtx;
type MissingFacilityField = 'rate' | 'payment' | 'currency';

function completeMonthWindow() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 12, 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function dominantCurrency(accounts: ReadonlyArray<Doc<'financialAccounts'>>) {
  const counts = new Map<string, number>();
  for (const account of accounts) {
    const currency = account.currency.trim().toUpperCase();
    if (currency) counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return (
    [...counts.entries()].sort(
      ([leftCurrency, leftCount], [rightCurrency, rightCount]) =>
        rightCount - leftCount || leftCurrency.localeCompare(rightCurrency),
    )[0]?.[0] ?? 'EUR'
  );
}

function accountDefaults(accountType: string | undefined) {
  switch (accountType?.toUpperCase()) {
    case 'INVS':
      return { kind: 'investment' as const, growthAnnualPct: 7 };
    case 'ASST':
      return { kind: 'otherAsset' as const, growthAnnualPct: 3 };
    case 'SVGS':
      return { kind: 'cash' as const, growthAnnualPct: 2 };
    case 'CACC':
    default:
      return { kind: 'cash' as const, growthAnnualPct: 0 };
  }
}

function monthlyAverage(transactions: ReadonlyArray<Doc<'transactions'>>) {
  const totals = new Map<string, bigint>();
  for (const transaction of transactions) {
    const month = transaction.bookingDate.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0n) + transaction.amount.amountMinor);
  }
  if (totals.size === 0) return { amountMinor: 0n, months: 0 };
  const total = [...totals.values()].reduce((sum, amountMinor) => sum + amountMinor, 0n);
  return { amountMinor: total / BigInt(totals.size), months: totals.size };
}

async function loadTransactions(
  ctx: SeedContext,
  userId: string,
  direction: 'CRDT' | 'DBIT',
  currency: string,
  startDate: string,
  endDate: string,
) {
  const rows = await ctx.db
    .query('transactions')
    .withIndex('by_userId_and_direction_and_bookingDate', (q) =>
      q.eq('userId', userId).eq('direction', direction).gte('bookingDate', startDate).lt('bookingDate', endDate),
    )
    .take(MAX_TRANSACTIONS_PER_DIRECTION);
  return rows.filter(
    (row) =>
      row.status === 'BOOK' &&
      row.amount.currency.toUpperCase() === currency &&
      row.classificationKind !== 'transfer' &&
      row.classificationKind !== 'internal',
  );
}

async function profileIncomeName(ctx: SeedContext, userId: string) {
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_authUserId', (q) => q.eq('authUserId', userId))
    .unique();
  return profile?.name?.trim() || profile?.firstName?.trim() || 'Income';
}

export async function loadForecastSeeds(ctx: SeedContext, userId: string) {
  const activeAccounts = await ctx.db
    .query('financialAccounts')
    .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
    .take(MAX_ACCOUNTS);
  const currency = dominantCurrency(activeAccounts);
  const { startDate, endDate } = completeMonthWindow();
  const [incomeTransactions, expenseTransactions, incomeName] = await Promise.all([
    loadTransactions(ctx, userId, 'CRDT', currency, startDate, endDate),
    loadTransactions(ctx, userId, 'DBIT', currency, startDate, endDate),
    profileIncomeName(ctx, userId),
  ]);
  const incomeAverage = monthlyAverage(incomeTransactions);
  const expenseAverage = monthlyAverage(expenseTransactions);

  const accounts = [];
  for (const account of activeAccounts) {
    if (account.accountType?.toUpperCase() === 'CARD' || account.currency.toUpperCase() !== currency) continue;
    const balance = await latestBookedBalance(ctx, account._id);
    const defaults = accountDefaults(account.accountType);
    accounts.push({
      accountId: account._id,
      name: account.alias?.trim() || account.name,
      accountType: account.accountType,
      kind: defaults.kind,
      balance: {
        amountMinor: balance?.amount.currency.toUpperCase() === currency ? balance.amount.amountMinor : 0n,
        currency,
      },
      included: true,
      growthAnnualPct: defaults.growthAnnualPct,
    });
  }

  const facilities = await ctx.db
    .query('creditFacilities')
    .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
    .take(MAX_FACILITIES);
  const activePlans = await ctx.db
    .query('creditFacilityInstallmentPlans')
    .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
    .take(MAX_INSTALLMENT_PLANS);
  const plansByFacility = new Map<Id<'creditFacilities'>, Array<Doc<'creditFacilityInstallmentPlans'>>>();
  for (const plan of activePlans) {
    const plans = plansByFacility.get(plan.creditFacilityId) ?? [];
    plans.push(plan);
    plansByFacility.set(plan.creditFacilityId, plans);
  }

  const liabilities = [];
  const excludedFacilities: Array<{
    creditFacilityId: Id<'creditFacilities'>;
    name: string;
    currency: string;
    missing: Array<MissingFacilityField>;
  }> = [];
  for (const facility of facilities) {
    const plans = plansByFacility.get(facility._id) ?? [];
    const facilityCurrency = (plans[0]?.outstandingAmount.currency ?? facility.usedAmount.currency).toUpperCase();
    const missing: Array<MissingFacilityField> = [];
    if (
      facility.annualNominalRateBps === undefined ||
      !Number.isInteger(facility.annualNominalRateBps) ||
      facility.annualNominalRateBps < 0
    ) {
      missing.push('rate');
    }
    if (plans.length === 0 || plans.some((plan) => plan.monthlyPaymentAmount.amountMinor <= 0n)) {
      missing.push('payment');
    }
    if (
      facilityCurrency !== currency ||
      plans.some(
        (plan) =>
          plan.outstandingAmount.currency.toUpperCase() !== currency ||
          plan.monthlyPaymentAmount.currency.toUpperCase() !== currency,
      )
    ) {
      missing.push('currency');
    }
    if (missing.length > 0) {
      excludedFacilities.push({
        creditFacilityId: facility._id,
        name: facility.name,
        currency: facilityCurrency,
        missing,
      });
      continue;
    }

    liabilities.push({
      creditFacilityId: facility._id,
      name: facility.name,
      balance: {
        amountMinor: plans.reduce((total, plan) => total + plan.outstandingAmount.amountMinor, 0n),
        currency,
      },
      annualRateBps: facility.annualNominalRateBps!,
      paymentMonthly: {
        amountMinor: plans.reduce((total, plan) => total + plan.monthlyPaymentAmount.amountMinor, 0n),
        currency,
      },
      included: true,
      includedInLivingExpenses: true,
    });
  }

  return {
    currency,
    window: { startDate, endDate },
    incomeSources: [
      {
        name: incomeName,
        amountMonthly: { amountMinor: incomeAverage.amountMinor, currency },
        changeMode: 'inflation' as const,
        sortOrder: 0,
        seededFromDefaults: incomeAverage.months === 0,
      },
    ],
    livingExpenses: {
      amountMonthly: { amountMinor: expenseAverage.amountMinor, currency },
      changeMode: 'inflation' as const,
      seededFromDefaults: expenseAverage.months === 0,
    },
    accounts,
    liabilities,
    excludedFacilities,
    historyMonths: { income: incomeAverage.months, expenses: expenseAverage.months },
  };
}

export const getForecastSeeds = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    return await loadForecastSeeds(ctx, user.id);
  },
});
