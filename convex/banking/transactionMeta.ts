import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const MAX_TAGS_PER_USER = 50;
const MAX_TAGS_PER_TRANSACTION = 10;
const MAX_BULK_TRANSACTIONS = 100;
const MAX_BULK_TAG_IDS = 100;

function validateTagName(value: string) {
  const name = value.trim();
  if (name.length < 1 || name.length > 30) {
    throw new ConvexError('Tag name must be between 1 and 30 characters');
  }
  return name;
}

function validateTagColor(color: string | undefined) {
  if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(color)) {
    throw new ConvexError('Tag color must use #rrggbb format');
  }
  return color;
}

async function getOwnedTag(ctx: MutationCtx, userId: string, tagId: Id<'transactionTags'>) {
  const tag = await ctx.db.get('transactionTags', tagId);
  if (!tag || tag.userId !== userId) {
    throw new ConvexError('Transaction tag not found');
  }
  return tag;
}

async function getOwnedTransaction(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  transactionId: Id<'transactions'>,
) {
  const transaction = await ctx.db.get('transactions', transactionId);
  if (!transaction || transaction.userId !== userId) {
    throw new ConvexError('Transaction not found');
  }
  return transaction;
}

async function assertUniqueTagName(
  ctx: MutationCtx,
  userId: string,
  name: string,
  excludedTagId?: Id<'transactionTags'>,
) {
  const exactMatch = await ctx.db
    .query('transactionTags')
    .withIndex('by_userId_and_name', (q) => q.eq('userId', userId).eq('name', name))
    .first();
  if (exactMatch && exactMatch._id !== excludedTagId) {
    throw new ConvexError('A tag with this name already exists');
  }

  const normalizedName = name.toLocaleLowerCase();
  const tags = await ctx.db
    .query('transactionTags')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(100);
  if (tags.some((tag) => tag._id !== excludedTagId && tag.name.toLocaleLowerCase() === normalizedName)) {
    throw new ConvexError('A tag with this name already exists');
  }
  return tags;
}

async function assertOwnedTags(ctx: MutationCtx, userId: string, tagIds: Array<Id<'transactionTags'>>) {
  for (const tagId of tagIds) {
    await getOwnedTag(ctx, userId, tagId);
  }
}

function dedupeIds<T extends string>(ids: Array<T>) {
  return [...new Set(ids)];
}

export const listTags = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    return await ctx.db
      .query('transactionTags')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(100);
  },
});

export const createTag = mutation({
  args: {
    name: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const name = validateTagName(args.name);
    const color = validateTagColor(args.color);
    const tags = await assertUniqueTagName(ctx, user.id, name);
    if (tags.length >= MAX_TAGS_PER_USER) {
      throw new ConvexError('At most 50 transaction tags can be created');
    }

    const now = Date.now();
    return await ctx.db.insert('transactionTags', {
      userId: user.id,
      name,
      color,
      createdAtMs: now,
      updatedAtMs: now,
    });
  },
});

export const renameTag = mutation({
  args: {
    tagId: v.id('transactionTags'),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const tag = await getOwnedTag(ctx, user.id, args.tagId);
    const name = validateTagName(args.name);
    await assertUniqueTagName(ctx, user.id, name, tag._id);
    await ctx.db.patch('transactionTags', tag._id, { name, updatedAtMs: Date.now() });
    return tag._id;
  },
});

export const setTagColor = mutation({
  args: {
    tagId: v.id('transactionTags'),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const tag = await getOwnedTag(ctx, user.id, args.tagId);
    await ctx.db.patch('transactionTags', tag._id, {
      color: validateTagColor(args.color),
      updatedAtMs: Date.now(),
    });
    return tag._id;
  },
});

export const deleteTag = mutation({
  args: {
    tagId: v.id('transactionTags'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const tag = await getOwnedTag(ctx, user.id, args.tagId);
    await ctx.db.delete('transactionTags', tag._id);
    // Transaction references intentionally remain. Readers resolve ids through
    // listTags and skip ids whose tag has since been deleted.
    return tag._id;
  },
});

export const setTransactionTags = mutation({
  args: {
    transactionId: v.id('transactions'),
    tagIds: v.array(v.id('transactionTags')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await getOwnedTransaction(ctx, user.id, args.transactionId);
    const tagIds = dedupeIds(args.tagIds);
    if (tagIds.length > MAX_TAGS_PER_TRANSACTION) {
      throw new ConvexError('A transaction can have at most 10 tags');
    }
    await assertOwnedTags(ctx, user.id, tagIds);
    await ctx.db.patch('transactions', transaction._id, { tagIds, updatedAtMs: Date.now() });
    return transaction._id;
  },
});

export const setTransactionHidden = mutation({
  args: {
    transactionId: v.id('transactions'),
    hidden: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await getOwnedTransaction(ctx, user.id, args.transactionId);
    await ctx.db.patch('transactions', transaction._id, {
      hiddenFromReports: args.hidden,
      updatedAtMs: Date.now(),
    });
    return transaction._id;
  },
});

export const setTransactionNote = mutation({
  args: {
    transactionId: v.id('transactions'),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await getOwnedTransaction(ctx, user.id, args.transactionId);
    const note = args.note.trim();
    if (note.length > 500) {
      throw new ConvexError('Transaction note must be at most 500 characters');
    }
    await ctx.db.patch('transactions', transaction._id, {
      note: note || undefined,
      updatedAtMs: Date.now(),
    });
    return transaction._id;
  },
});

export const bulkSetTags = mutation({
  args: {
    transactionIds: v.array(v.id('transactions')),
    addTagIds: v.optional(v.array(v.id('transactionTags'))),
    removeTagIds: v.optional(v.array(v.id('transactionTags'))),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    if (args.transactionIds.length > MAX_BULK_TRANSACTIONS) {
      throw new ConvexError('At most 100 transactions can be updated at once');
    }
    const transactionIds = dedupeIds(args.transactionIds);

    const addTagIds = dedupeIds(args.addTagIds ?? []);
    const removeTagIds = dedupeIds(args.removeTagIds ?? []);
    if (addTagIds.length > MAX_BULK_TAG_IDS || removeTagIds.length > MAX_BULK_TAG_IDS) {
      throw new ConvexError('At most 100 tag ids can be changed at once');
    }

    const transactions = [];
    for (const transactionId of transactionIds) {
      transactions.push(await getOwnedTransaction(ctx, user.id, transactionId));
    }
    await assertOwnedTags(ctx, user.id, addTagIds);

    const removeTagIdSet = new Set(removeTagIds);
    const skipped: Array<{ transactionId: Id<'transactions'>; reason: string }> = [];
    let updated = 0;
    const now = Date.now();

    for (const transaction of transactions) {
      const tagIds = dedupeIds([...(transaction.tagIds ?? []), ...addTagIds]).filter(
        (tagId) => !removeTagIdSet.has(tagId),
      );
      if (tagIds.length > MAX_TAGS_PER_TRANSACTION) {
        skipped.push({ transactionId: transaction._id, reason: 'Tag limit exceeded' });
        continue;
      }
      await ctx.db.patch('transactions', transaction._id, { tagIds, updatedAtMs: now });
      updated += 1;
    }

    return { updated, skipped };
  },
});

export const bulkSetHidden = mutation({
  args: {
    transactionIds: v.array(v.id('transactions')),
    hidden: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    if (args.transactionIds.length > MAX_BULK_TRANSACTIONS) {
      throw new ConvexError('At most 100 transactions can be updated at once');
    }
    const transactionIds = dedupeIds(args.transactionIds);

    const transactions = [];
    for (const transactionId of transactionIds) {
      transactions.push(await getOwnedTransaction(ctx, user.id, transactionId));
    }

    const now = Date.now();
    for (const transaction of transactions) {
      await ctx.db.patch('transactions', transaction._id, {
        hiddenFromReports: args.hidden,
        updatedAtMs: now,
      });
    }
    return { updated: transactions.length, skipped: [] };
  },
});
