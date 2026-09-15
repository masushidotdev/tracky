import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireAuthUser } from './auth';
import {
  addRecurringInterval,
  findMatchingSubscription,
  inferCadenceForTransaction,
  linkTransactionsToSubscription,
} from './banking/subscriptionDetection';
import { decimalNumberToMinorUnits } from './lib/money';
import { metadataValidator, recurrenceIntervalValidator } from './lib/validators';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

const subscriptionStatusValidator = v.union(v.literal('active'), v.literal('paused'), v.literal('ended'));

async function assertOwnedAccount(ctx: MutationCtx, accountId: Id<'financialAccounts'>, userId: string) {
  const account = await ctx.db.get('financialAccounts', accountId);

  if (!account || account.userId !== userId) {
    throw new ConvexError('Account not found');
  }

  return account;
}

async function assertOwnedCategory(
  ctx: MutationCtx,
  categoryId: Id<'categories'> | undefined,
  userId: string,
) {
  if (!categoryId) {
    return undefined;
  }

  const category = await ctx.db.get('categories', categoryId);
  if (!category || category.userId !== userId) {
    throw new ConvexError('Category not found');
  }

  return category._id;
}

function withDerivedNextDueDate(subscription: Doc<'subscriptions'>) {
  if (subscription.nextDueDate) {
    return subscription;
  }

  const today = new Date().toISOString().slice(0, 10);
  let nextDueDate = subscription.startDate.slice(0, 10);
  for (let i = 0; i < 240 && nextDueDate < today; i += 1) {
    nextDueDate = addRecurringInterval(nextDueDate, subscription.interval, subscription.intervalCount);
  }

  return {
    ...subscription,
    nextDueDate,
  };
}

export const getSubscriptions = query({
  args: {
    status: v.optional(subscriptionStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);

    if (args.status) {
      const subscriptions = await ctx.db
        .query('subscriptions')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', args.status!))
        .take(limit);
      return subscriptions.map(withDerivedNextDueDate);
    }

    const subscriptions = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(limit);
    return subscriptions.map(withDerivedNextDueDate);
  },
});

export const listUpcomingSubscriptions = query({
  args: {
    status: v.optional(subscriptionStatusValidator),
    fromDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 20, 100);
    const subscriptions = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(200);

    return subscriptions
      .map(withDerivedNextDueDate)
      .filter((subscription) => !args.status || subscription.status === args.status)
      .filter((subscription) => !args.fromDate || !subscription.nextDueDate || subscription.nextDueDate >= args.fromDate)
      .sort((left, right) => {
        const leftDate = left.nextDueDate ?? '9999-12-31';
        const rightDate = right.nextDueDate ?? '9999-12-31';
        return leftDate.localeCompare(rightDate) || left.name.localeCompare(right.name);
      })
      .slice(0, limit);
  },
});

export const getSubscription = query({
  args: {
    subscriptionId: v.id('subscriptions'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const subscription = await ctx.db.get('subscriptions', args.subscriptionId);

    if (!subscription || subscription.userId !== user.id) {
      throw new ConvexError('Subscription not found');
    }

    return subscription;
  },
});

export const updateSubscriptionStatus = mutation({
  args: {
    subscriptionId: v.id('subscriptions'),
    status: subscriptionStatusValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const subscription = await ctx.db.get('subscriptions', args.subscriptionId);

    if (!subscription || subscription.userId !== user.id) {
      throw new ConvexError('Subscription not found');
    }

    await ctx.db.patch('subscriptions', subscription._id, {
      status: args.status,
      updatedAtMs: Date.now(),
    });

    return subscription._id;
  },
});

export const updateSubscriptionAlias = mutation({
  args: {
    subscriptionId: v.id('subscriptions'),
    alias: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const subscription = await ctx.db.get('subscriptions', args.subscriptionId);

    if (!subscription || subscription.userId !== user.id) {
      throw new ConvexError('Subscription not found');
    }

    const normalizedAlias = (args.alias ?? '').trim();
    await ctx.db.patch('subscriptions', subscription._id, {
      alias: normalizedAlias.length > 0 ? normalizedAlias : null,
      updatedAtMs: Date.now(),
    });

    return subscription._id;
  },
});

export const updateSubscriptionAccount = mutation({
  args: {
    subscriptionId: v.id('subscriptions'),
    accountId: v.union(v.id('financialAccounts'), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const subscription = await ctx.db.get('subscriptions', args.subscriptionId);

    if (!subscription || subscription.userId !== user.id) {
      throw new ConvexError('Subscription not found');
    }

    if (args.accountId !== null) {
      await assertOwnedAccount(ctx, args.accountId, user.id);
    }

    await ctx.db.patch('subscriptions', subscription._id, {
      accountId: args.accountId,
      updatedAtMs: Date.now(),
    });

    return subscription._id;
  },
});

export const updateSubscriptionDetails = mutation({
  args: {
    subscriptionId: v.id('subscriptions'),
    alias: v.union(v.string(), v.null()),
    accountId: v.union(v.id('financialAccounts'), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const subscription = await ctx.db.get('subscriptions', args.subscriptionId);

    if (!subscription || subscription.userId !== user.id) {
      throw new ConvexError('Subscription not found');
    }

    if (args.accountId !== null) {
      await assertOwnedAccount(ctx, args.accountId, user.id);
    }

    const normalizedAlias = (args.alias ?? '').trim();
    await ctx.db.patch('subscriptions', subscription._id, {
      accountId: args.accountId,
      alias: normalizedAlias.length > 0 ? normalizedAlias : null,
      updatedAtMs: Date.now(),
    });

    return subscription._id;
  },
});

export const createSubscription = mutation({
  args: {
    name: v.string(),
    alias: v.optional(v.string()),
    merchantName: v.optional(v.string()),
    description: v.optional(v.string()),
    amountMinor: v.optional(v.int64()),
    price: v.optional(v.number()),
    currency: v.string(),
    interval: recurrenceIntervalValidator,
    intervalCount: v.number(),
    startDate: v.string(),
    nextDueDate: v.optional(v.string()),
    trialPeriodDays: v.number(),
    categoryId: v.optional(v.id('categories')),
    metadata: v.optional(metadataValidator),
    accountId: v.optional(v.union(v.id('financialAccounts'), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);

    const startDate = new Date(args.startDate);
    const now = Date.now();
    const amountMinor = args.amountMinor ?? decimalNumberToMinorUnits(args.price ?? 0, args.currency);
    if (args.accountId) {
      await assertOwnedAccount(ctx, args.accountId, user.id);
    }
    const categoryId = await assertOwnedCategory(ctx, args.categoryId, user.id);

    const subscription = await ctx.db.insert('subscriptions', {
      userId: user.id,
      name: args.name,
      alias: args.alias?.trim() ? args.alias.trim() : undefined,
      merchantName: args.merchantName,
      description: args.description,
      amount: {
        amountMinor,
        currency: args.currency,
      },
      interval: args.interval,
      intervalCount: args.intervalCount,
      startDate: startDate.toISOString(),
      nextDueDate: args.nextDueDate ?? startDate.toISOString(),
      trialPeriodDays: args.trialPeriodDays,
      status: 'active',
      source: 'manual',
      categoryId,
      metadata: args.metadata,
      createdAtMs: now,
      updatedAtMs: now,
      accountId: args.accountId ?? undefined,
    });

    return subscription;
  },
});

export const convertTransactionToSubscription = mutation({
  args: {
    transactionId: v.id('transactions'),
    name: v.optional(v.string()),
    interval: recurrenceIntervalValidator,
    intervalCount: v.number(),
    nextDueDate: v.optional(v.string()),
    categoryId: v.optional(v.id('categories')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await ctx.db.get('transactions', args.transactionId);

    if (!transaction || transaction.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }

    const now = Date.now();
    // Only the client-supplied id is attacker-controlled; the stored one was
    // validated at write time, so re-checking it could only break legacy rows.
    const requestedCategoryId = args.categoryId
      ? await assertOwnedCategory(ctx, args.categoryId, user.id)
      : undefined;
    const categoryId = requestedCategoryId ?? transaction.categoryId;
    const existingSubscription = transaction.subscriptionId
      ? await ctx.db.get('subscriptions', transaction.subscriptionId)
      : await findMatchingSubscription(ctx, transaction);
    const { cadence, relatedTransactions } = await inferCadenceForTransaction(ctx, transaction, {
      interval: args.interval,
      intervalCount: args.intervalCount,
    });
    const latestTransaction = relatedTransactions.at(-1) ?? transaction;
    const earliestTransaction = relatedTransactions[0] ?? transaction;
    const nextDueDate = args.nextDueDate ?? cadence.nextDueDate;

    let subscriptionId: Id<'subscriptions'>;
    if (existingSubscription && existingSubscription.userId === user.id) {
      subscriptionId = existingSubscription._id;
      await ctx.db.patch('subscriptions', existingSubscription._id, {
        amount: latestTransaction.amount,
        categoryId: categoryId ?? existingSubscription.categoryId,
        confidence: Math.max(existingSubscription.confidence ?? 0, cadence.confidence),
        description: transaction.description,
        interval: cadence.interval,
        intervalCount: cadence.intervalCount,
        latestTransactionId: latestTransaction._id,
        merchantName: transaction.counterpartyName ?? existingSubscription.merchantName,
        name: args.name ?? existingSubscription.name,
        nextDueDate,
        startDate:
          earliestTransaction.bookingDate < existingSubscription.startDate
            ? earliestTransaction.bookingDate
            : existingSubscription.startDate,
        status: existingSubscription.status === 'ended' ? 'active' : existingSubscription.status,
        updatedAtMs: now,
      });
    } else {
      subscriptionId = await ctx.db.insert('subscriptions', {
        userId: user.id,
        accountId: transaction.accountId,
        name: args.name ?? transaction.counterpartyName ?? transaction.description,
        merchantName: transaction.counterpartyName ?? transaction.description,
        description: transaction.description,
        amount: latestTransaction.amount,
        interval: cadence.interval,
        intervalCount: cadence.intervalCount,
        status: 'active',
        startDate: earliestTransaction.bookingDate,
        nextDueDate,
        trialPeriodDays: 0,
        source: 'transaction',
        confidence: cadence.confidence,
        categoryId,
        latestTransactionId: latestTransaction._id,
        createdAtMs: now,
        updatedAtMs: now,
      });
    }

    await linkTransactionsToSubscription(ctx, {
      categoryId,
      confidence: 1,
      subscriptionId,
      transactions: relatedTransactions,
    });

    return subscriptionId;
  },
});
