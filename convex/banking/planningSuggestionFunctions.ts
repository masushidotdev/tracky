import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import { moneyAmountValidator } from '../lib/validators';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import { buildPlannedExpenseSuggestions } from './planningSuggestions';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const DEFAULT_MIN_SUGGESTION_AMOUNT_MINOR = 20000n;

async function loadSuggestions(
  ctx: QueryCtx | MutationCtx,
  args: {
    userId: string;
    limit: number;
    minAmount?: {
      amountMinor: bigint;
      currency: string;
    };
    asOfDate?: string;
    suppressExisting?: boolean;
  },
) {
  const transactions = await ctx.db
    .query('transactions')
    .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', args.userId))
    .order('desc')
    .take(400);
  const plannedExpenses = (
    await Promise.all(
      (['expense', 'income'] as const).map((kind) =>
        ctx.db
          .query('plannedTransactions')
          .withIndex('by_userId_and_kind_and_dueDate', (q) => q.eq('userId', args.userId).eq('kind', kind))
          .take(300),
      ),
    )
  )
    .flat()
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left._creationTime - right._creationTime)
    .slice(0, 300);
  const asOfDate = args.asOfDate ?? new Date().toISOString().slice(0, 10);
  const minAmountMinor = args.minAmount?.amountMinor ?? DEFAULT_MIN_SUGGESTION_AMOUNT_MINOR;
  const filteredTransactions = args.minAmount
    ? transactions.filter((transaction) => transaction.amount.currency === args.minAmount!.currency)
    : transactions;

  return buildPlannedExpenseSuggestions({
    transactions: filteredTransactions,
    existingPlannedExpenses: args.suppressExisting === false ? [] : plannedExpenses,
    limit: args.limit,
    minAmountMinor,
    asOfDate,
    nowMs: Date.now(),
  });
}

export const listForUser = internalQuery({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
    minAmount: v.optional(moneyAmountValidator),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await loadSuggestions(ctx, {
      userId: args.userId,
      limit: Math.min(args.limit ?? 10, 30),
      minAmount: args.minAmount,
      asOfDate: args.asOfDate,
    });
  },
});

export const acceptForUser = internalMutation({
  args: {
    userId: v.string(),
    suggestionKey: v.string(),
    name: v.optional(v.string()),
    createMoneyBox: v.optional(v.boolean()),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const suggestions = await loadSuggestions(ctx, {
      userId: args.userId,
      limit: 30,
      asOfDate: args.asOfDate,
      suppressExisting: false,
    });
    const suggestion = suggestions.find((item) => item.suggestionKey === args.suggestionKey);

    if (!suggestion) {
      throw new ConvexError('Planned expense suggestion not found');
    }

    const existingRows = await Promise.all(
      (['expense', 'income'] as const).map((kind) =>
        ctx.db
          .query('plannedTransactions')
          .withIndex('by_userId_and_kind_and_latestTransactionId', (q) =>
            q
              .eq('userId', args.userId)
              .eq('kind', kind)
              .eq('latestTransactionId', suggestion.latestTransactionId),
          )
          .unique(),
      ),
    );
    const existing = existingRows.find((row) => row !== null);

    if (existing) {
      return {
        plannedExpenseId: existing._id,
        moneyBoxId: existing.moneyBoxId ?? null,
      };
    }

    const now = Date.now();
    const createMoneyBox = suggestion.direction === 'outflow' && (args.createMoneyBox ?? true);
    const plannedExpenseId = await ctx.db.insert('plannedTransactions', {
      userId: args.userId,
      name: args.name?.trim() || suggestion.name,
      description: suggestion.description,
      amount: suggestion.amount,
      kind: suggestion.direction === 'inflow' ? 'income' : 'expense',
      direction: suggestion.direction,
      dueDate: suggestion.dueDate,
      recurrenceInterval: suggestion.recurrenceInterval,
      recurrenceIntervalCount: suggestion.recurrenceIntervalCount,
      status: createMoneyBox ? 'funding' : 'planned',
      source: 'suggested',
      categoryId: suggestion.categoryId,
      latestTransactionId: suggestion.latestTransactionId,
      createdAtMs: now,
      updatedAtMs: now,
    });

    let moneyBoxId = null;
    if (createMoneyBox) {
      moneyBoxId = await ctx.db.insert('moneyBoxes', {
        userId: args.userId,
        name: args.name?.trim() || suggestion.name,
        targetAmount: suggestion.amount,
        savedAmount: { amountMinor: 0n, currency: suggestion.amount.currency },
        targetDate: suggestion.dueDate,
        status: 'active',
        source: 'suggested',
        plannedTransactionId: plannedExpenseId,
        createdAtMs: now,
        updatedAtMs: now,
      });

      await ctx.db.patch('plannedTransactions', plannedExpenseId, {
        moneyBoxId,
        updatedAtMs: now,
      });
    }

    const latestTransaction = await ctx.db.get('transactions', suggestion.latestTransactionId);
    if (latestTransaction?.classificationKind === 'uncategorized') {
      await ctx.db.patch('transactions', latestTransaction._id, {
        classificationKind: suggestion.direction === 'inflow' ? 'income' : 'expense',
        classificationSource: 'user',
        classificationConfidence: 1,
        updatedAtMs: now,
      });
      await invalidatePlanSnapshots(ctx, args.userId, [latestTransaction.bookingDate]);
    }

    return { plannedExpenseId, moneyBoxId };
  },
});
