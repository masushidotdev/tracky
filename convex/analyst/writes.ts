import { ConvexError, v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { setAssignedForUser, setTargetForUser } from '../banking/plan';
import { currentPeriod } from '../banking/planActivity';
import { createMoneyBoxForUserCore, createPlannedExpenseForUserCore } from '../banking/planning';
import { categoryKindForClassification, categorySupportsKind } from '../banking/categoryTaxonomy';
import { buildUserClassificationPatch } from '../banking/transactions';
import { classificationKindValidator, moneyAmountValidator, recurrenceIntervalValidator } from '../lib/validators';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const targetCadenceValidator = v.union(
  v.literal('weekly'),
  v.literal('monthly'),
  v.literal('yearly'),
  v.literal('custom'),
);
const targetBehaviourValidator = v.union(v.literal('setAside'), v.literal('refill'), v.literal('balanceBy'));
const MAX_PLAN_ROWS = 500;

export function resolvePlanBucketByName<T extends Pick<Doc<'planBuckets'>, 'name'>>(
  buckets: Array<T>,
  bucketName: string,
) {
  const normalized = bucketName.trim().toLocaleLowerCase();
  const matches = buckets.filter((bucket) => bucket.name.trim().toLocaleLowerCase() === normalized);
  if (matches.length === 0) throw new ConvexError(`Plan bucket "${bucketName}" was not found`);
  if (matches.length > 1) throw new ConvexError(`Plan bucket name "${bucketName}" is ambiguous`);
  return matches[0];
}

async function activePlanBucketByName(ctx: MutationCtx, userId: string, bucketName: string) {
  const plans = await ctx.db
    .query('plans')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(MAX_PLAN_ROWS + 1);
  if (plans.length > MAX_PLAN_ROWS) throw new ConvexError('Too many plans to search');
  const plan = plans.find((candidate) => candidate.isDefault) ?? plans.at(0);
  if (!plan) throw new ConvexError('Active plan was not found');
  const buckets = await ctx.db
    .query('planBuckets')
    .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', plan._id))
    .take(MAX_PLAN_ROWS + 1);
  if (buckets.length > MAX_PLAN_ROWS) throw new ConvexError('Too many plan buckets to search');
  return { plan, bucket: resolvePlanBucketByName(buckets, bucketName) };
}

async function categoryIdByName(ctx: MutationCtx, userId: string, categoryName: string) {
  const categories = await ctx.db
    .query('categories')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(200);
  const normalized = categoryName.trim().toLocaleLowerCase();
  const category = categories.find((candidate) => candidate.name.trim().toLocaleLowerCase() === normalized);
  if (!category) throw new ConvexError(`Category "${categoryName}" was not found`);
  return category._id;
}

async function accountIdByName(ctx: MutationCtx, userId: string, accountName: string) {
  const accounts = await ctx.db
    .query('financialAccounts')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(100);
  const normalized = accountName.trim().toLocaleLowerCase();
  const matches = accounts.filter((candidate) =>
    [candidate.name, candidate.alias]
      .filter((value): value is string => typeof value === 'string')
      .some((value) => value.trim().toLocaleLowerCase() === normalized),
  );
  if (matches.length === 0) throw new ConvexError(`Account "${accountName}" was not found`);
  if (matches.length > 1) throw new ConvexError(`Account name "${accountName}" is ambiguous`);
  return matches[0]._id;
}

export const setPlanAssignedForAgent = internalMutation({
  args: {
    userId: v.string(),
    bucketName: v.string(),
    period: v.optional(v.string()),
    amount: moneyAmountValidator,
  },
  handler: async (ctx, args) => {
    const { plan, bucket } = await activePlanBucketByName(ctx, args.userId, args.bucketName);
    if (args.amount.currency !== plan.currency) {
      throw new ConvexError(`Active plan uses ${plan.currency}, not ${args.amount.currency}`);
    }
    return await setAssignedForUser(ctx, {
      userId: args.userId,
      planId: plan._id,
      bucketId: bucket._id,
      period: args.period ?? currentPeriod(),
      amountMinor: args.amount.amountMinor,
    });
  },
});

export const setPlanTargetForAgent = internalMutation({
  args: {
    userId: v.string(),
    bucketName: v.string(),
    cadence: targetCadenceValidator,
    behaviour: targetBehaviourValidator,
    amount: moneyAmountValidator,
    dueDate: v.optional(v.string()),
    dayOfMonth: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    repeats: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { plan, bucket } = await activePlanBucketByName(ctx, args.userId, args.bucketName);
    if (args.amount.currency !== plan.currency) {
      throw new ConvexError(`Active plan uses ${plan.currency}, not ${args.amount.currency}`);
    }
    return await setTargetForUser(ctx, {
      userId: args.userId,
      bucketId: bucket._id,
      cadence: args.cadence,
      behaviour: args.behaviour,
      amountMinor: args.amount.amountMinor,
      dueDate: args.dueDate,
      dayOfMonth: args.dayOfMonth,
      dayOfWeek: args.dayOfWeek,
      repeats: args.repeats,
    });
  },
});

export const createMoneyBoxForAgent = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    targetAmount: moneyAmountValidator,
    savedAmount: v.optional(moneyAmountValidator),
    targetDate: v.string(),
    accountName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const accountId = args.accountName ? await accountIdByName(ctx, args.userId, args.accountName) : undefined;
    return await createMoneyBoxForUserCore(ctx, { ...args, accountId });
  },
});

export const createPlannedExpenseForAgent = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    amount: moneyAmountValidator,
    direction: v.optional(v.union(v.literal('inflow'), v.literal('outflow'))),
    dueDate: v.string(),
    recurrenceInterval: v.optional(recurrenceIntervalValidator),
    recurrenceIntervalCount: v.optional(v.number()),
    categoryName: v.optional(v.string()),
    createMoneyBox: v.optional(v.boolean()),
    accountName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const categoryId = args.categoryName ? await categoryIdByName(ctx, args.userId, args.categoryName) : undefined;
    const accountId = args.accountName ? await accountIdByName(ctx, args.userId, args.accountName) : undefined;
    return await createPlannedExpenseForUserCore(ctx, { ...args, categoryId, accountId });
  },
});

export const bulkRecategorizeForAgent = internalMutation({
  args: {
    userId: v.string(),
    changes: v.array(
      v.object({
        transactionId: v.id('transactions'),
        classificationKind: classificationKindValidator,
        categoryName: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.changes.length === 0 || args.changes.length > 50) {
      throw new ConvexError('Bulk recategorization requires 1-50 changes');
    }
    const transactionIds = args.changes.map((change) => change.transactionId);
    if (new Set(transactionIds).size !== transactionIds.length) {
      throw new ConvexError('Duplicate transaction changes are not allowed');
    }
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .take(200);
    const transactions = await Promise.all(
      transactionIds.map((transactionId) => ctx.db.get('transactions', transactionId)),
    );
    const prepared = args.changes.map((change, index) => {
      const transaction = transactions[index];
      if (!transaction || transaction.userId !== args.userId) throw new ConvexError('Transaction not found');
      let categoryId: (typeof categories)[number]['_id'] | undefined;
      if (change.categoryName) {
        const normalized = change.categoryName.trim().toLocaleLowerCase();
        const matches = categories.filter((category) => category.name.trim().toLocaleLowerCase() === normalized);
        if (matches.length === 0) throw new ConvexError(`Category "${change.categoryName}" was not found`);
        if (matches.length > 1) throw new ConvexError(`Category "${change.categoryName}" is ambiguous`);
        const expectedKind = categoryKindForClassification(change.classificationKind);
        if (!expectedKind || !categorySupportsKind(matches[0], expectedKind)) {
          throw new ConvexError(`Category "${change.categoryName}" is incompatible with the classification`);
        }
        categoryId = matches[0]._id;
      }
      return { transaction, change, categoryId };
    });
    const now = Date.now();
    for (const row of prepared) {
      await ctx.db.patch(
        'transactions',
        row.transaction._id,
        buildUserClassificationPatch({
          classificationKind: row.change.classificationKind,
          categoryId: row.categoryId,
          updatedAtMs: now,
        }),
      );
    }
    return { updatedCount: prepared.length };
  },
});
