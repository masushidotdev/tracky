import { ConvexError, v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalMutation, mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { DEFAULT_CATEGORIES, categorySupportsKind, ensureDefaultCategoriesForUser } from './categoryTaxonomy';
import { ensurePlanBucketForCategory } from './plan';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

const categoryKindValidator = v.union(v.literal('expense'), v.literal('income'), v.literal('transfer'));
const categoryInputValidator = {
  name: v.string(),
  kind: categoryKindValidator,
  applicableKinds: v.optional(v.array(categoryKindValidator)),
  color: v.optional(v.string()),
  icon: v.optional(v.string()),
  budgetEligible: v.optional(v.boolean()),
};

type CategoryInput = {
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  applicableKinds?: Array<'expense' | 'income' | 'transfer'>;
  color?: string;
  icon?: string;
  budgetEligible?: boolean;
};

function normalizeCategoryInput(args: CategoryInput) {
  const name = args.name.trim();
  if (name.length < 2 || name.length > 60) {
    throw new ConvexError('Category name must be between 2 and 60 characters');
  }

  const applicableKinds = [...new Set(args.applicableKinds ?? [args.kind])];
  if (applicableKinds.length === 0 || !applicableKinds.includes(args.kind)) {
    throw new ConvexError('Applicable kinds must include the primary kind');
  }

  const color = args.color?.trim();
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) {
    throw new ConvexError('Category color must be a six-digit hex value');
  }

  const icon = args.icon?.trim();
  if (icon && !/^[a-z0-9-]{1,40}$/.test(icon)) {
    throw new ConvexError('Category icon is invalid');
  }

  return {
    name,
    kind: args.kind,
    applicableKinds,
    color: color || undefined,
    icon: icon || undefined,
    budgetEligible: args.budgetEligible ?? applicableKinds.includes('expense'),
  };
}

async function assertUniqueCategoryName(
  ctx: MutationCtx,
  userId: string,
  name: string,
  excludedCategoryId?: Id<'categories'>,
) {
  const categories = await ctx.db
    .query('categories')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(200);
  const normalizedName = name.toLocaleLowerCase();
  if (
    categories.some(
      (category) => category._id !== excludedCategoryId && category.name.trim().toLocaleLowerCase() === normalizedName,
    )
  ) {
    throw new ConvexError('A category with this name already exists');
  }
}

export const listCategories = query({
  args: {
    kind: v.optional(v.union(v.literal('expense'), v.literal('income'))),
    limit: v.optional(v.number()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(200);

    return categories
      .filter((category) => args.includeArchived || !category.archived)
      .filter((category) => !args.kind || categorySupportsKind(category, args.kind))
      .slice(0, limit);
  },
});

export const listCustomCategories = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(200);
    return categories.filter((category) => !category.systemKey).slice(0, Math.min(args.limit ?? 100, 200));
  },
});

export const ensureDefaultCategories = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const categoryIdsBySystemKey = await ensureDefaultCategoriesForUser(ctx, user.id);

    return {
      ensured: categoryIdsBySystemKey.size,
      expected: DEFAULT_CATEGORIES.length,
    };
  },
});

export const createCategory = mutation({
  args: categoryInputValidator,
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const input = normalizeCategoryInput(args);
    await assertUniqueCategoryName(ctx, user.id, input.name);

    const categoryId = await ctx.db.insert('categories', {
      userId: user.id,
      ...input,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    });
    const category = await ctx.db.get('categories', categoryId);
    if (!category) throw new ConvexError('Category creation failed');
    await ensurePlanBucketForCategory(ctx, user.id, category);
    return categoryId;
  },
});

export const updateCategory = mutation({
  args: {
    categoryId: v.id('categories'),
    ...categoryInputValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const category = await ctx.db.get('categories', args.categoryId);
    if (!category || category.userId !== user.id) throw new ConvexError('Category not found');
    if (category.systemKey) throw new ConvexError('System categories cannot be modified');

    const input = normalizeCategoryInput(args);
    await assertUniqueCategoryName(ctx, user.id, input.name, category._id);
    await ctx.db.patch('categories', category._id, { ...input, updatedAtMs: Date.now() });
    return category._id;
  },
});

const CATEGORY_CLEANUP_BATCH_SIZE = 50;

export const cleanupDeletedCategory = internalMutation({
  args: { userId: v.string(), categoryId: v.id('categories') },
  handler: async (ctx, args) => {
    const category = await ctx.db.get('categories', args.categoryId);
    if (!category || category.userId !== args.userId || category.systemKey) return null;

    const plans = await ctx.db
      .query('plans')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .take(501);
    if (plans.length > 500) throw new ConvexError('Too many plans to clean category mappings');
    const mappingsByPlan = await Promise.all(
      plans.map((plan) =>
        ctx.db
          .query('planBucketCategories')
          .withIndex('by_planId_and_categoryId', (q) =>
            q.eq('planId', plan._id).eq('categoryId', args.categoryId),
          )
          .unique(),
      ),
    );
    const planMappings = [];
    for (const mapping of mappingsByPlan) {
      if (mapping) planMappings.push(mapping);
      if (planMappings.length === CATEGORY_CLEANUP_BATCH_SIZE) break;
    }

    const [transactions, rules, subscriptions, plannedExpenses] = await Promise.all([
      ctx.db
        .query('transactions')
        .withIndex('by_userId_and_categoryId_and_bookingDate', (q) =>
          q.eq('userId', args.userId).eq('categoryId', args.categoryId),
        )
        .take(CATEGORY_CLEANUP_BATCH_SIZE),
      ctx.db
        .query('categoryRules')
        .withIndex('by_userId_and_categoryId', (q) => q.eq('userId', args.userId).eq('categoryId', args.categoryId))
        .take(CATEGORY_CLEANUP_BATCH_SIZE),
      ctx.db
        .query('subscriptions')
        .withIndex('by_userId_and_categoryId', (q) => q.eq('userId', args.userId).eq('categoryId', args.categoryId))
        .take(CATEGORY_CLEANUP_BATCH_SIZE),
      Promise.all(
        (['expense', 'income'] as const).map((kind) =>
          ctx.db
            .query('plannedTransactions')
            .withIndex('by_userId_and_kind_and_categoryId', (q) =>
              q.eq('userId', args.userId).eq('kind', kind).eq('categoryId', args.categoryId),
            )
            .take(CATEGORY_CLEANUP_BATCH_SIZE),
        ),
      ).then((rows) => rows.flat().slice(0, CATEGORY_CLEANUP_BATCH_SIZE)),
    ]);

    await Promise.all([
      ...transactions.map((transaction) => ctx.db.patch('transactions', transaction._id, { categoryId: undefined })),
      ...rules.map((rule) => ctx.db.delete('categoryRules', rule._id)),
      ...subscriptions.map((subscription) =>
        ctx.db.patch('subscriptions', subscription._id, { categoryId: undefined, updatedAtMs: Date.now() }),
      ),
      ...plannedExpenses.map((plannedExpense) =>
        ctx.db.patch('plannedTransactions', plannedExpense._id, { categoryId: undefined, updatedAtMs: Date.now() }),
      ),
      ...planMappings.map((mapping) => ctx.db.delete('planBucketCategories', mapping._id)),
    ]);
    await invalidatePlanSnapshots(
      ctx,
      args.userId,
      transactions.map((transaction) => transaction.bookingDate),
    );

    const cleanedCount =
      transactions.length + rules.length + subscriptions.length + plannedExpenses.length + planMappings.length;
    if (cleanedCount > 0) {
      await ctx.scheduler.runAfter(0, internal.banking.categories.cleanupDeletedCategory, args);
      return null;
    }

    await ctx.db.delete('categories', category._id);
    return category._id;
  },
});

export const deleteCategory = mutation({
  args: { categoryId: v.id('categories') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const category = await ctx.db.get('categories', args.categoryId);
    if (!category || category.userId !== user.id) throw new ConvexError('Category not found');
    if (category.systemKey) throw new ConvexError('System categories cannot be deleted');

    await ctx.scheduler.runAfter(0, internal.banking.categories.cleanupDeletedCategory, {
      userId: user.id,
      categoryId: category._id,
    });
    return category._id;
  },
});
