import { ConvexError, v } from 'convex/values';

import { query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { isAssetAccountType } from '../lib/accountTypes';
import { isLoanFacilityType } from '../lib/validators';
import { buildRemainingInstallmentRepaymentAmount } from './creditMath';
import { latestBookedBalance } from './balances';
import { availableBalance, linkedCardAccountForFacility, overdraftLimitByAccount } from './overdraft';
import type { Doc } from '../_generated/dataModel';

type MoneyAmount = {
  amountMinor: bigint;
  currency: string;
};

type CurrencyTotal = {
  booked: MoneyAmount;
  available: MoneyAmount;
  accountCount: number;
};

function addToCurrencyTotals(totals: Map<string, CurrencyTotal>, booked: MoneyAmount, available: MoneyAmount) {
  const existing = totals.get(booked.currency);
  if (existing) {
    existing.booked.amountMinor += booked.amountMinor;
    existing.available.amountMinor += available.amountMinor;
    existing.accountCount += 1;
    return;
  }

  totals.set(booked.currency, {
    booked: { ...booked },
    available: { ...available },
    accountCount: 1,
  });
}

export const getDashboardOverview = query({
  args: {
    accountId: v.optional(v.id('financialAccounts')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    let accounts: Array<Doc<'financialAccounts'>>;

    if (args.accountId) {
      const account = await ctx.db.get('financialAccounts', args.accountId);
      if (!account || account.userId !== user.id || account.status !== 'active') {
        throw new ConvexError('Account not found');
      }
      accounts = [account];
    } else {
      const activeAccounts = await ctx.db
        .query('financialAccounts')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'active'))
        .take(200);
      accounts = activeAccounts.filter((account) => !account.hidden);
    }

    const overdraftLimits = await overdraftLimitByAccount(ctx, user.id);
    const balances = await Promise.all(
      accounts.map(async (account) => (await latestBookedBalance(ctx, account._id))?.amount),
    );
    const totals = new Map<string, CurrencyTotal>();
    const assetTotals = new Map<string, CurrencyTotal>();
    const accountBalances = accounts.map((account, index) => {
      const booked = balances[index] ?? { amountMinor: 0n, currency: account.currency };
      const overdraftLimit = overdraftLimits.get(account._id);
      const available = availableBalance(booked, overdraftLimit);
      if (isAssetAccountType(account.accountType)) {
        addToCurrencyTotals(assetTotals, booked, booked);
      } else if (account.accountType !== 'CARD') {
        // CARD accounts are liabilities: their balance (negative outstanding,
        // or a provider-reported plafond) must never count as cash.
        addToCurrencyTotals(totals, booked, available);
      }
      return { account, booked, available, overdraftLimit };
    });

    let netWorth:
      | Array<{ cash: MoneyAmount; assets?: MoneyAmount; debts: MoneyAmount; netWorth: MoneyAmount }>
      | undefined;
    if (!args.accountId) {
      const facilities = await ctx.db
        .query('creditFacilities')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'active'))
        .take(200);
      const debtsByCurrency = new Map<string, bigint>();
      const cardLinkedFacilityIds = new Set<string>();
      for (const facility of facilities) {
        if (await linkedCardAccountForFacility(ctx, facility)) {
          cardLinkedFacilityIds.add(facility._id);
        }
      }

      for (const facility of facilities) {
        // A CARD-linked facility is represented entirely by the CARD account
        // balance. Its plans and statement cycles are views over that same
        // liability and must not be added again.
        if (cardLinkedFacilityIds.has(facility._id)) {
          continue;
        }
        if (isLoanFacilityType(facility.facilityType)) {
          // A loan's debt is the principal still owed, counted once. It is read from the
          // amortisation plan, the same source the loan page and the sidebar use - the facility's
          // usedAmount drifts from it as payments are recorded, and three different figures for one
          // loan is worse than any of them being slightly stale.
          const loanPlans = await ctx.db
            .query('creditFacilityInstallmentPlans')
            .withIndex('by_creditFacilityId_and_status', (q) =>
              q.eq('creditFacilityId', facility._id).eq('status', 'active'),
            )
            .take(5);
          const outstanding = loanPlans.find((plan) => plan.userId === user.id)?.outstandingAmount ?? facility.usedAmount;
          debtsByCurrency.set(
            outstanding.currency,
            (debtsByCurrency.get(outstanding.currency) ?? 0n) + outstanding.amountMinor,
          );
          continue;
        }
        // Debt = every active installment plan, whatever the facility type: card credit
        // lines can carry installment plans too (e.g. purchases converted to instalments).
        const plans = await ctx.db
          .query('creditFacilityInstallmentPlans')
          .withIndex('by_creditFacilityId_and_status', (q) => q.eq('creditFacilityId', facility._id).eq('status', 'active'))
          .take(100);
        for (const plan of plans) {
          const outstanding = buildRemainingInstallmentRepaymentAmount(plan);
          debtsByCurrency.set(
            outstanding.currency,
            (debtsByCurrency.get(outstanding.currency) ?? 0n) + outstanding.amountMinor,
          );
        }
      }

      // CARD account debt = the account's negative balance, counted once here;
      // scheduled cycles of CARD-linked facilities are skipped below so the
      // same statement liability never counts twice.
      for (const { account, booked } of accountBalances) {
        if (account.accountType !== 'CARD' || booked.amountMinor >= 0n) {
          continue;
        }
        debtsByCurrency.set(booked.currency, (debtsByCurrency.get(booked.currency) ?? 0n) - booked.amountMinor);
      }

      const scheduledStatements = await ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_userId_and_status_and_dueDate', (q) => q.eq('userId', user.id).eq('status', 'scheduled'))
        .take(200);
      for (const statement of scheduledStatements) {
        if (cardLinkedFacilityIds.has(statement.creditFacilityId)) {
          continue;
        }
        debtsByCurrency.set(
          statement.trackedAmount.currency,
          (debtsByCurrency.get(statement.trackedAmount.currency) ?? 0n) + statement.trackedAmount.amountMinor,
        );
      }

      const currencies = new Set([...totals.keys(), ...assetTotals.keys(), ...debtsByCurrency.keys()]);
      netWorth = [...currencies]
        .sort(
          (left, right) =>
            (totals.get(right)?.accountCount ?? 0) +
              (assetTotals.get(right)?.accountCount ?? 0) -
              ((totals.get(left)?.accountCount ?? 0) + (assetTotals.get(left)?.accountCount ?? 0)) ||
            left.localeCompare(right),
        )
        .map((currency) => {
          const cash = totals.get(currency)?.booked ?? { amountMinor: 0n, currency };
          const assets = assetTotals.get(currency)?.booked;
          const debts = { amountMinor: debtsByCurrency.get(currency) ?? 0n, currency };
          return {
            cash,
            ...(assets ? { assets } : {}),
            debts,
            netWorth: { amountMinor: cash.amountMinor + (assets?.amountMinor ?? 0n) - debts.amountMinor, currency },
          };
        });
    }

    return {
      // Primary currency first = the one with most accounts, matching the KPI headline.
      cashTotals: [...totals.values()].sort(
        (left, right) =>
          right.accountCount - left.accountCount || left.booked.currency.localeCompare(right.booked.currency),
      ),
      assets: [...assetTotals.values()].sort(
        (left, right) =>
          right.accountCount - left.accountCount || left.booked.currency.localeCompare(right.booked.currency),
      ),
      accounts: accountBalances,
      netWorth: netWorth ?? null,
    };
  },
});
