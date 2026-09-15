import { ConvexError, v } from 'convex/values';
import { internalMutation, mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { categoryRuleMatches, mergeCategoryRuleTagIds } from './categoryRuleCore';
import { categorySupportsKind } from './categoryTaxonomy';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const matchFieldValidator = v.union(v.literal('merchant'), v.literal('description'));
const matchTypeValidator = v.union(v.literal('contains'), v.literal('equals'), v.literal('prefix'));

async function assertRuleCategory(ctx: MutationCtx, userId: string, categoryId: Doc<'categories'>['_id']) {
  const category = await ctx.db.get('categories', categoryId);
  if (!category || category.userId !== userId || !categorySupportsKind(category, 'expense')) {
    throw new ConvexError('Expense category not found');
  }
}

async function validateRuleTagIds(
  ctx: MutationCtx,
  userId: string,
  tagIds: Array<Doc<'transactionTags'>['_id']> | undefined,
) {
  if (tagIds === undefined) {
    return undefined;
  }

  const uniqueTagIds = [...new Set(tagIds)];
  if (uniqueTagIds.length > 10) {
    throw new ConvexError('A category rule can add at most 10 tags');
  }
  for (const tagId of uniqueTagIds) {
    const tag = await ctx.db.get('transactionTags', tagId);
    if (!tag || tag.userId !== userId) {
      throw new ConvexError('Transaction tag not found');
    }
  }
  return uniqueTagIds;
}

async function applyRuleToExistingForUserCore(
  ctx: MutationCtx,
  args: {
    userId: string;
    ruleId: Doc<'categoryRules'>['_id'];
    limit?: number;
  },
) {
  const rule = await ctx.db.get('categoryRules', args.ruleId);
  if (!rule || rule.userId !== args.userId) {
    throw new ConvexError('Category rule not found');
  }

  await assertRuleCategory(ctx, args.userId, rule.categoryId);
  const limit = Math.min(args.limit ?? 100, 200);
  const transactions = await ctx.db
    .query('transactions')
    .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', args.userId))
    .order('desc')
    .take(limit);
  let applied = 0;
  let scanned = 0;
  const now = Date.now();
  const affectedDates: Array<string | undefined> = [];

  for (const transaction of transactions) {
    scanned += 1;
    if (
      transaction.direction !== 'DBIT' ||
      transaction.classificationSource === 'user' ||
      transaction.classificationKind === 'transfer' ||
      transaction.classificationKind === 'internal' ||
      !categoryRuleMatches(rule, transaction)
    ) {
      continue;
    }

    await ctx.db.patch('transactions', transaction._id, {
      classificationKind: 'expense',
      classificationSource: 'rule',
      classificationConfidence: 1,
      categoryId: rule.categoryId,
      ...(rule.addTagIds !== undefined
        ? { tagIds: mergeCategoryRuleTagIds(transaction.tagIds, rule.addTagIds) }
        : {}),
      ...(rule.hideFromReports !== undefined ? { hiddenFromReports: rule.hideFromReports } : {}),
      updatedAtMs: now,
    });
    affectedDates.push(transaction.bookingDate);
    applied += 1;
  }

  await invalidatePlanSnapshots(ctx, args.userId, affectedDates);
  return { applied, scanned };
}

export const listRules = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);
    const rules = await ctx.db
      .query('categoryRules')
      .withIndex('by_userId_and_priority', (q) => q.eq('userId', user.id))
      .take(limit);
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(200);
    const categoryById = new Map(categories.map((category) => [category._id, category]));

    return rules.map((rule) => ({
      ...rule,
      category: categoryById.get(rule.categoryId) ?? null,
    }));
  },
});

export const createRule = mutation({
  args: {
    matchField: matchFieldValidator,
    matchType: matchTypeValidator,
    pattern: v.string(),
    categoryId: v.id('categories'),
    addTagIds: v.optional(v.array(v.id('transactionTags'))),
    hideFromReports: v.optional(v.boolean()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const pattern = args.pattern.trim();
    if (!pattern) {
      throw new ConvexError('Rule pattern is required');
    }

    await assertRuleCategory(ctx, user.id, args.categoryId);
    const addTagIds = await validateRuleTagIds(ctx, user.id, args.addTagIds);
    const existingRules = await ctx.db
      .query('categoryRules')
      .withIndex('by_userId_and_priority', (q) => q.eq('userId', user.id))
      .take(200);
    const nextPriority =
      args.priority ??
      (existingRules.length === 0 ? 100 : Math.max(...existingRules.map((rule) => rule.priority)) + 100);
    const now = Date.now();

    return await ctx.db.insert('categoryRules', {
      userId: user.id,
      matchField: args.matchField,
      matchType: args.matchType,
      pattern,
      categoryId: args.categoryId,
      addTagIds,
      hideFromReports: args.hideFromReports,
      enabled: true,
      priority: nextPriority,
      createdAtMs: now,
      updatedAtMs: now,
    });
  },
});

export const updateRule = mutation({
  args: {
    ruleId: v.id('categoryRules'),
    matchField: v.optional(matchFieldValidator),
    matchType: v.optional(matchTypeValidator),
    pattern: v.optional(v.string()),
    categoryId: v.optional(v.id('categories')),
    addTagIds: v.optional(v.array(v.id('transactionTags'))),
    hideFromReports: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const rule = await ctx.db.get('categoryRules', args.ruleId);
    if (!rule || rule.userId !== user.id) {
      throw new ConvexError('Category rule not found');
    }

    const pattern = args.pattern?.trim();
    if (args.pattern !== undefined && !pattern) {
      throw new ConvexError('Rule pattern is required');
    }
    if (args.categoryId !== undefined) {
      await assertRuleCategory(ctx, user.id, args.categoryId);
    }
    const addTagIds = await validateRuleTagIds(ctx, user.id, args.addTagIds);

    await ctx.db.patch('categoryRules', rule._id, {
      ...(args.matchField !== undefined ? { matchField: args.matchField } : {}),
      ...(args.matchType !== undefined ? { matchType: args.matchType } : {}),
      ...(pattern !== undefined ? { pattern } : {}),
      ...(args.categoryId !== undefined ? { categoryId: args.categoryId } : {}),
      ...(addTagIds !== undefined ? { addTagIds } : {}),
      ...(args.hideFromReports !== undefined ? { hideFromReports: args.hideFromReports } : {}),
      updatedAtMs: Date.now(),
    });
    return rule._id;
  },
});

export const setRuleEnabled = mutation({
  args: {
    ruleId: v.id('categoryRules'),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const rule = await ctx.db.get('categoryRules', args.ruleId);
    if (!rule || rule.userId !== user.id) {
      throw new ConvexError('Category rule not found');
    }

    await ctx.db.patch('categoryRules', rule._id, {
      enabled: args.enabled,
      updatedAtMs: Date.now(),
    });
    return rule._id;
  },
});

export const updateRulePriority = mutation({
  args: {
    ruleId: v.id('categoryRules'),
    priority: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const rule = await ctx.db.get('categoryRules', args.ruleId);
    if (!rule || rule.userId !== user.id) {
      throw new ConvexError('Category rule not found');
    }

    await ctx.db.patch('categoryRules', rule._id, {
      priority: args.priority,
      updatedAtMs: Date.now(),
    });
    return rule._id;
  },
});

export const deleteRule = mutation({
  args: {
    ruleId: v.id('categoryRules'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const rule = await ctx.db.get('categoryRules', args.ruleId);
    if (!rule || rule.userId !== user.id) {
      throw new ConvexError('Category rule not found');
    }

    await ctx.db.delete('categoryRules', rule._id);
    return rule._id;
  },
});

export const applyRuleToExisting = mutation({
  args: {
    ruleId: v.id('categoryRules'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await applyRuleToExistingForUserCore(ctx, { userId: user.id, ...args });
  },
});

export const applyRuleToExistingForUser = internalMutation({
  args: {
    userId: v.string(),
    ruleId: v.id('categoryRules'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await applyRuleToExistingForUserCore(ctx, args);
  },
});
