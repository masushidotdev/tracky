import { ConvexError, v } from 'convex/values';

import { internalQuery, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { absoluteMinorUnits } from '../lib/money';
import { reportGranularityValidator, reportGroupByValidator, reportTabValidator } from '../lib/validators';
import { aggregateTransactionsForReport, resolveGroup } from './reportsCore';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import type { ReportLookups, ReportOptions } from './reportsCore';

const TRANSACTION_PAGE_SIZE = 1000;
const MAX_REPORT_ROWS = 25_000;
const MAX_TRANSACTION_PAGE_SIZE = 100;
const MAX_REPORT_CATEGORIES = 500;
const MAX_REPORT_ACCOUNTS = 200;
const MAX_PLAN_LOOKUP_ROWS = 500;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const reportFilterArgs = {
  tab: reportTabValidator,
  dateFrom: v.string(),
  dateTo: v.string(),
  accountIds: v.optional(v.array(v.id('financialAccounts'))),
  categoryIds: v.optional(v.array(v.id('categories'))),
  tagIds: v.optional(v.array(v.id('transactionTags'))),
  amountMinMinor: v.optional(v.int64()),
  amountMaxMinor: v.optional(v.int64()),
};

const reportArgs = {
  ...reportFilterArgs,
  groupBy: reportGroupByValidator,
  granularity: reportGranularityValidator,
};

type ReportFilters = {
  tab: ReportOptions['tab'];
  dateFrom: string;
  dateTo: string;
  accountIds?: Array<Id<'financialAccounts'>>;
  categoryIds?: Array<Id<'categories'>>;
  tagIds?: Array<Id<'transactionTags'>>;
  amountMinMinor?: bigint;
  amountMaxMinor?: bigint;
};

type ReportArgs = ReportFilters & Pick<ReportOptions, 'groupBy' | 'granularity'>;

function assertIsoDate(value: string, field: 'dateFrom' | 'dateTo') {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new ConvexError(`${field} must use YYYY-MM-DD format`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ConvexError(`${field} must be a valid date`);
  }
}

function validateDateRange(dateFrom: string, dateTo: string) {
  assertIsoDate(dateFrom, 'dateFrom');
  assertIsoDate(dateTo, 'dateTo');
  if (dateFrom > dateTo) {
    throw new ConvexError('dateFrom must be on or before dateTo');
  }
}

function nextIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function assertOwnedAccounts(ctx: QueryCtx, userId: string, accountIds?: Array<Id<'financialAccounts'>>) {
  if (!accountIds) {
    return;
  }

  for (const accountId of accountIds) {
    const account = await ctx.db.get('financialAccounts', accountId);
    if (!account || account.userId !== userId) {
      throw new ConvexError('Account not found');
    }
  }
}

async function assertOwnedTags(ctx: QueryCtx, userId: string, tagIds?: Array<Id<'transactionTags'>>) {
  if (!tagIds) {
    return;
  }

  for (const tagId of tagIds) {
    const tag = await ctx.db.get('transactionTags', tagId);
    if (!tag || tag.userId !== userId) {
      throw new ConvexError('Transaction tag not found');
    }
  }
}

function transactionMatchesFilters(
  transaction: Doc<'transactions'>,
  accountIds: Set<Id<'financialAccounts'>> | null,
  categoryIds: Set<Id<'categories'>> | null,
  tagIds: Set<Id<'transactionTags'>> | null,
  amountMinMinor: bigint | undefined,
  amountMaxMinor: bigint | undefined,
) {
  if (transaction.hiddenFromReports === true) {
    return false;
  }
  // A scheduled row records money the user intends to move, not money that
  // moved: reporting it would inflate every total it lands in.
  if (transaction.status === 'SCHD') {
    return false;
  }
  if (accountIds && !accountIds.has(transaction.accountId)) {
    return false;
  }
  if (categoryIds && (!transaction.categoryId || !categoryIds.has(transaction.categoryId))) {
    return false;
  }
  if (tagIds && !transaction.tagIds?.some((tagId) => tagIds.has(tagId))) {
    return false;
  }

  const magnitude = absoluteMinorUnits(transaction.amount.amountMinor);
  if (amountMinMinor !== undefined && magnitude < amountMinMinor) {
    return false;
  }
  if (amountMaxMinor !== undefined && magnitude > amountMaxMinor) {
    return false;
  }
  return true;
}

function transactionMatchesTab(transaction: Doc<'transactions'>, tab: ReportOptions['tab']) {
  if (transaction.classificationKind === 'transfer' || transaction.classificationKind === 'internal') {
    return false;
  }
  if (tab === 'spending') {
    return transaction.direction === 'DBIT';
  }
  if (tab === 'income') {
    return transaction.direction === 'CRDT';
  }
  return true;
}

async function validateReportFilters(ctx: QueryCtx, userId: string, args: ReportFilters) {
  validateDateRange(args.dateFrom, args.dateTo);
  if (
    args.amountMinMinor !== undefined &&
    args.amountMaxMinor !== undefined &&
    args.amountMinMinor > args.amountMaxMinor
  ) {
    throw new ConvexError('amountMinMinor must be less than or equal to amountMaxMinor');
  }
  await assertOwnedAccounts(ctx, userId, args.accountIds);
  await assertOwnedTags(ctx, userId, args.tagIds);
}

async function loadTransactionsInRange(
  ctx: QueryCtx,
  userId: string,
  dateFrom: string,
  dateTo: string,
  order: 'asc' | 'desc' = 'asc',
) {
  const dateToExclusive = nextIsoDate(dateTo);
  const rows: Array<Doc<'transactions'>> = [];
  let cursor: string | null = null;
  let truncated = false;

  while (rows.length < MAX_REPORT_ROWS) {
    const result = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_bookingDate', (q) =>
        q.eq('userId', userId).gte('bookingDate', dateFrom).lt('bookingDate', dateToExclusive),
      )
      .order(order)
      .paginate({ cursor, numItems: TRANSACTION_PAGE_SIZE });
    const remaining = MAX_REPORT_ROWS - rows.length;
    rows.push(...result.page.slice(0, remaining));

    if (result.page.length > remaining || (!result.isDone && rows.length === MAX_REPORT_ROWS)) {
      truncated = true;
      break;
    }
    if (result.isDone) {
      break;
    }
    cursor = result.continueCursor;
  }

  return { rows, truncated };
}

function assertLookupBounded<T>(rows: Array<T>, label: string, limit: number) {
  if (rows.length > limit) throw new ConvexError(`Too many ${label} to read`);
  return rows;
}

async function loadPlanCategoryGroups(ctx: QueryCtx, userId: string): Promise<ReportLookups['categoryGroups']> {
  const plans = assertLookupBounded(
    await ctx.db
      .query('plans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(MAX_PLAN_LOOKUP_ROWS + 1),
    'plans',
    MAX_PLAN_LOOKUP_ROWS,
  );
  const plan = plans.find((candidate) => candidate.isDefault) ?? plans.at(0);
  if (!plan) return null;

  const [groups, buckets, mappings] = await Promise.all([
    ctx.db
      .query('planGroups')
      .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', plan._id))
      .take(MAX_PLAN_LOOKUP_ROWS + 1),
    ctx.db
      .query('planBuckets')
      .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', plan._id))
      .take(MAX_PLAN_LOOKUP_ROWS + 1),
    ctx.db
      .query('planBucketCategories')
      .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', plan._id))
      .take(MAX_PLAN_LOOKUP_ROWS + 1),
  ]);
  const boundedGroups = assertLookupBounded(groups, 'plan groups', MAX_PLAN_LOOKUP_ROWS);
  const boundedBuckets = assertLookupBounded(buckets, 'plan buckets', MAX_PLAN_LOOKUP_ROWS);
  const boundedMappings = assertLookupBounded(mappings, 'plan category mappings', MAX_PLAN_LOOKUP_ROWS);
  const groupById = new Map(boundedGroups.map((group) => [group._id, group]));
  const bucketById = new Map(boundedBuckets.map((bucket) => [bucket._id, bucket]));
  const categoryGroups: NonNullable<ReportLookups['categoryGroups']> = new Map();

  for (const mapping of boundedMappings) {
    const bucket = bucketById.get(mapping.bucketId);
    if (!bucket || bucket.isUnplanned) continue;
    const group = groupById.get(bucket.groupId);
    if (!group) continue;
    categoryGroups.set(mapping.categoryId, { key: group._id, label: group.name });
  }

  return categoryGroups;
}

async function loadReportLookups(
  ctx: QueryCtx,
  userId: string,
  groupBy: ReportOptions['groupBy'],
): Promise<ReportLookups> {
  const [categoryRows, accountRows, categoryGroups] = await Promise.all([
    ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(MAX_REPORT_CATEGORIES + 1),
    ctx.db
      .query('financialAccounts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(MAX_REPORT_ACCOUNTS + 1),
    groupBy === 'categoryGroup' ? loadPlanCategoryGroups(ctx, userId) : Promise.resolve(null),
  ]);
  const categories = assertLookupBounded(categoryRows, 'categories', MAX_REPORT_CATEGORIES);
  const accounts = assertLookupBounded(accountRows, 'accounts', MAX_REPORT_ACCOUNTS);

  return {
    categories: new Map(
      categories.map((category) => [
        category._id,
        {
          name: category.name,
          kind: category.kind,
        },
      ]),
    ),
    categoryGroups,
    accounts: new Map(
      accounts.map((account) => [
        account._id,
        { label: account.alias?.trim() || account.name },
      ]),
    ),
  };
}

async function reportForUser(ctx: QueryCtx, userId: string, args: ReportArgs) {
  await validateReportFilters(ctx, userId, args);

  const accountIds = args.accountIds ? new Set(args.accountIds) : null;
  const categoryIds = args.categoryIds ? new Set(args.categoryIds) : null;
  const tagIds = args.tagIds ? new Set(args.tagIds) : null;
  const [{ rows, truncated }, lookups] = await Promise.all([
    loadTransactionsInRange(ctx, userId, args.dateFrom, args.dateTo),
    loadReportLookups(ctx, userId, args.groupBy),
  ]);
  const filteredRows = rows.filter((transaction) =>
    transactionMatchesFilters(
      transaction,
      accountIds,
      categoryIds,
      tagIds,
      args.amountMinMinor,
      args.amountMaxMinor,
    ),
  );
  const report = aggregateTransactionsForReport(filteredRows, lookups, {
    tab: args.tab,
    groupBy: args.groupBy,
    granularity: args.granularity,
  });

  return { ...report, truncated };
}

export const getReport = query({
  args: { ...reportArgs },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await reportForUser(ctx, user.id, args);
  },
});

export const getReportForUser = internalQuery({
  args: { userId: v.string(), ...reportArgs },
  handler: async (ctx, args) => await reportForUser(ctx, args.userId, args),
});

export const listReportTransactions = query({
  args: {
    ...reportFilterArgs,
    groupBy: reportGroupByValidator,
    groupKey: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    await validateReportFilters(ctx, user.id, args);

    const limit = args.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TRANSACTION_PAGE_SIZE) {
      throw new ConvexError(`limit must be an integer between 1 and ${MAX_TRANSACTION_PAGE_SIZE}`);
    }
    const offset = args.cursor === undefined ? 0 : Number(args.cursor);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      (args.cursor !== undefined && String(offset) !== args.cursor)
    ) {
      throw new ConvexError('cursor is invalid');
    }
    if (!args.groupKey.trim()) {
      throw new ConvexError('groupKey is required');
    }

    const accountIds = args.accountIds ? new Set(args.accountIds) : null;
    const categoryIds = args.categoryIds ? new Set(args.categoryIds) : null;
    const tagIds = args.tagIds ? new Set(args.tagIds) : null;
    const [{ rows }, lookups] = await Promise.all([
      loadTransactionsInRange(ctx, user.id, args.dateFrom, args.dateTo, 'desc'),
      loadReportLookups(ctx, user.id, args.groupBy),
    ]);
    const matches = rows.filter(
      (transaction) =>
        transactionMatchesTab(transaction, args.tab) &&
        transactionMatchesFilters(
          transaction,
          accountIds,
          categoryIds,
          tagIds,
          args.amountMinMinor,
          args.amountMaxMinor,
        ) &&
        resolveGroup(transaction, lookups, args.groupBy).key === args.groupKey,
    );
    const page = matches.slice(offset, offset + limit).map((transaction) => ({
      _id: transaction._id,
      bookingDate: transaction.bookingDate,
      description: transaction.description,
      counterpartyName: transaction.counterpartyName ?? null,
      amount: transaction.amount,
      direction: transaction.direction,
      categoryId: transaction.categoryId ?? null,
    }));
    const nextOffset = offset + page.length;

    return {
      page,
      continueCursor: nextOffset < matches.length ? String(nextOffset) : null,
    };
  },
});
