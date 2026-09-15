import { v } from 'convex/values';

import { internal } from '../_generated/api';
import { internalQuery, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { moneyAmountValidator } from '../lib/validators';
import { computeSafeToSpend } from './safeToSpendCore';
import type { SafeToSpendBreakdown, SafeToSpendPlanningView } from './safeToSpendCore';

const safeToSpendItemKindValidator = v.union(
  v.literal('plannedExpense'),
  v.literal('subscription'),
  v.literal('scheduledTransaction'),
  v.literal('creditInstallment'),
  v.literal('creditStatement'),
);

const safeToSpendBreakdownValidator = v.object({
  currency: v.string(),
  availableCash: moneyAmountValidator,
  committedOutflows: moneyAmountValidator,
  moneyBoxFunding: moneyAmountValidator,
  expectedIncome: moneyAmountValidator,
  safeToSpend: moneyAmountValidator,
  safeToSpendWithIncome: moneyAmountValidator,
  cycleStartDate: v.string(),
  cycleEndDate: v.string(),
  daysRemaining: v.number(),
  perDay: moneyAmountValidator,
  topUpcoming: v.array(
    v.object({
      name: v.string(),
      dueDate: v.string(),
      amount: moneyAmountValidator,
      kind: safeToSpendItemKindValidator,
    }),
  ),
});

const safeToSpendResultValidator = v.array(safeToSpendBreakdownValidator);

export const getSafeToSpendForUser = internalQuery({
  args: {
    userId: v.string(),
    asOfDate: v.optional(v.string()),
    accountId: v.optional(v.id('financialAccounts')),
  },
  returns: safeToSpendResultValidator,
  handler: async (ctx, args): Promise<Array<SafeToSpendBreakdown>> => {
    const view: SafeToSpendPlanningView = await ctx.runQuery(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId: args.userId,
      cycleOffset: 0,
      limit: 200,
      asOfDate: args.asOfDate,
    });
    return computeSafeToSpend(view, { accountId: args.accountId });
  },
});

export const getSafeToSpend = query({
  args: { accountId: v.optional(v.id('financialAccounts')) },
  returns: safeToSpendResultValidator,
  handler: async (ctx, args): Promise<Array<SafeToSpendBreakdown>> => {
    const user = await requireAuthUser(ctx);
    const result: Array<SafeToSpendBreakdown> = await ctx.runQuery(internal.banking.safeToSpend.getSafeToSpendForUser, {
      userId: user.id,
      accountId: args.accountId,
    });
    return result;
  },
});
