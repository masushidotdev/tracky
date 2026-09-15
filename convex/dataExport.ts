import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireAuthUser } from './auth';
import type { Doc, Id } from './_generated/dataModel';

const DAY_MS = 24 * 60 * 60 * 1_000;
const EXPORT_RETENTION_MS = 7 * DAY_MS;
const EXPORT_PAGE_SIZE = 100;
const CLEANUP_BATCH_SIZE = 100;

const exportStatusValidator = v.union(
  v.literal('queued'),
  v.literal('running'),
  v.literal('completed'),
  v.literal('failed'),
);

const exportTableValidator = v.union(
  v.literal('financialAccounts'),
  v.literal('accountBalances'),
  v.literal('transactions'),
  v.literal('categories'),
  v.literal('categoryRules'),
  v.literal('plans'),
  v.literal('planGroups'),
  v.literal('planBuckets'),
  v.literal('planBucketCategories'),
  v.literal('planAssignments'),
  v.literal('planTargets'),
  v.literal('subscriptions'),
  v.literal('plannedExpenses'),
  v.literal('plannedExpenseOccurrencePayments'),
  v.literal('moneyBoxes'),
  v.literal('moneyBoxContributions'),
  v.literal('creditFacilities'),
  v.literal('plannedTransfers'),
  v.literal('notifications'),
  v.literal('agentMemories'),
  v.literal('userSettings'),
);

type ExportTable =
  | 'financialAccounts'
  | 'accountBalances'
  | 'transactions'
  | 'categories'
  | 'categoryRules'
  | 'plans'
  | 'planGroups'
  | 'planBuckets'
  | 'planBucketCategories'
  | 'planAssignments'
  | 'planTargets'
  | 'subscriptions'
  | 'plannedExpenses'
  | 'plannedExpenseOccurrencePayments'
  | 'moneyBoxes'
  | 'moneyBoxContributions'
  | 'creditFacilities'
  | 'plannedTransfers'
  | 'notifications'
  | 'agentMemories'
  | 'userSettings';

const EXPORT_TABLES: ReadonlyArray<ExportTable> = [
  'financialAccounts',
  'accountBalances',
  'transactions',
  'categories',
  'categoryRules',
  'plans',
  'planGroups',
  'planBuckets',
  'planBucketCategories',
  'planAssignments',
  'planTargets',
  // planMonthSnapshots is a derived cache, including deprecated compatibility fields; exporting it
  // would add stale, non-recoverable data instead of user-owned source records.
  'subscriptions',
  'plannedExpenses',
  'plannedExpenseOccurrencePayments',
  'moneyBoxes',
  'moneyBoxContributions',
  'creditFacilities',
  'plannedTransfers',
  'notifications',
  'agentMemories',
  'userSettings',
];

type ExportPage = {
  page: Array<unknown>;
  isDone: boolean;
  continueCursor: string;
};

function withoutFields<T extends object>(value: T, fields: ReadonlyArray<keyof T>) {
  const result = { ...value } as Record<PropertyKey, unknown>;
  for (const field of fields) Reflect.deleteProperty(result, field);
  return result;
}

function plannedExpenseExportRow(row: Doc<'plannedTransactions'>) {
  return withoutFields(row, [
    'kind',
    'fromAccountId',
    'fromCreditFacilityId',
    'toAccountId',
    'completedTransferMatchId',
    'completedAtMs',
  ]);
}

function plannedTransferExportRow(row: Doc<'plannedTransactions'>) {
  if (row.kind !== 'transfer' || !row.toAccountId || row.status === 'funding') {
    throw new ConvexError('Invalid planned transfer');
  }
  const transfer = withoutFields(row, [
    'dueDate',
    'kind',
    'direction',
    'accountId',
    'source',
    'recurrenceInterval',
    'recurrenceIntervalCount',
    'categoryId',
    'subscriptionId',
    'moneyBoxId',
    'latestTransactionId',
    'reconciliationMerchantKey',
  ]);
  return {
    ...transfer,
    scheduledDate: row.dueDate,
    status: row.status === 'paid' ? 'completed' : row.status,
  };
}

function occurrencePaymentExportRow(row: Doc<'plannedExpenseOccurrencePayments'>) {
  const payment = withoutFields(row, ['plannedTransactionId']);
  return {
    ...payment,
    ...(row.plannedTransactionId ? { plannedExpenseId: row.plannedTransactionId } : {}),
  };
}

function moneyBoxExportRow(row: Doc<'moneyBoxes'>) {
  const moneyBox = withoutFields(row, ['plannedTransactionId']);
  return {
    ...moneyBox,
    ...(row.plannedTransactionId ? { plannedExpenseId: row.plannedTransactionId } : {}),
  };
}

export const requestDataExport = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const now = Date.now();
    const recentExports = await ctx.db
      .query('dataExports')
      .withIndex('by_userId_and_requestedAtMs', (q) => q.eq('userId', user.id))
      .order('desc')
      .take(5);

    const alreadyInProgress = recentExports.some((dataExport) =>
      dataExport.status === 'queued' || dataExport.status === 'running',
    );
    const completedRecently = recentExports.some(
      (dataExport) =>
        dataExport.status === 'completed' &&
        (dataExport.completedAtMs ?? dataExport.requestedAtMs) > now - DAY_MS,
    );
    if (alreadyInProgress || completedRecently) {
      throw new ConvexError('A data export is already available or in progress');
    }

    const exportId = await ctx.db.insert('dataExports', {
      userId: user.id,
      status: 'queued',
      format: 'json',
      requestedAtMs: now,
      expiresAtMs: now + EXPORT_RETENTION_MS,
    });
    await ctx.scheduler.runAfter(0, internal.dataExport.runDataExport, { exportId });
    return exportId;
  },
});

export const listMyDataExports = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const now = Date.now();
    const exports = await ctx.db
      .query('dataExports')
      .withIndex('by_userId_and_requestedAtMs', (q) => q.eq('userId', user.id))
      .order('desc')
      .take(10);

    return await Promise.all(
      exports.map(async (dataExport) => ({
        ...dataExport,
        downloadUrl:
          dataExport.status === 'completed' && dataExport.expiresAtMs > now && dataExport.storageId
            ? await ctx.storage.getUrl(dataExport.storageId)
            : null,
      })),
    );
  },
});

export const collectExportPage = internalQuery({
  args: {
    userId: v.string(),
    table: exportTableValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    switch (args.table) {
      case 'financialAccounts':
        return await ctx.db
          .query('financialAccounts')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'accountBalances':
        return await ctx.db
          .query('accountBalances')
          .withIndex('by_userId_and_fetchedAtMs', (q) => q.eq('userId', args.userId))
          .order('desc')
          .paginate(args.paginationOpts);
      case 'transactions':
        return await ctx.db
          .query('transactions')
          .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'categories':
        return await ctx.db
          .query('categories')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'categoryRules':
        return await ctx.db
          .query('categoryRules')
          .withIndex('by_userId_and_priority', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'plans':
        return await ctx.db
          .query('plans')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'planGroups':
        return await ctx.db
          .query('planGroups')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'planBuckets':
        return await ctx.db
          .query('planBuckets')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'planBucketCategories':
        return await ctx.db
          .query('planBucketCategories')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'planAssignments':
        return await ctx.db
          .query('planAssignments')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'planTargets':
        return await ctx.db
          .query('planTargets')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'subscriptions':
        return await ctx.db
          .query('subscriptions')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'plannedExpenses': {
        const result = await ctx.db
          .query('plannedTransactions')
          .withIndex('by_userId_and_dueDate', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
        return {
          ...result,
          page: result.page
            .filter((row) => row.kind === 'expense' || row.kind === 'income')
            .map(plannedExpenseExportRow),
        };
      }
      case 'plannedExpenseOccurrencePayments': {
        const result = await ctx.db
          .query('plannedExpenseOccurrencePayments')
          .withIndex('by_userId_and_dueDate', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
        return { ...result, page: result.page.map(occurrencePaymentExportRow) };
      }
      case 'moneyBoxes': {
        const result = await ctx.db
          .query('moneyBoxes')
          .withIndex('by_userId_and_targetDate', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
        return { ...result, page: result.page.map(moneyBoxExportRow) };
      }
      case 'moneyBoxContributions':
        return await ctx.db
          .query('moneyBoxContributions')
          .withIndex('by_userId_and_contributionDate', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'creditFacilities':
        return await ctx.db
          .query('creditFacilities')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'plannedTransfers': {
        const result = await ctx.db
          .query('plannedTransactions')
          .withIndex('by_userId_and_dueDate', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
        return {
          ...result,
          page: result.page.filter((row) => row.kind === 'transfer').map(plannedTransferExportRow),
        };
      }
      case 'notifications':
        return await ctx.db
          .query('notifications')
          .withIndex('by_userId_and_createdAtMs', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
      case 'agentMemories': {
        const result = await ctx.db
          .query('agentMemories')
          .withIndex('by_userId_and_kind', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
        return {
          ...result,
          page: result.page.map((memory) => ({ kind: memory.kind, content: memory.content })),
        };
      }
      case 'userSettings':
        return await ctx.db
          .query('userSettings')
          .withIndex('by_userId', (q) => q.eq('userId', args.userId))
          .paginate(args.paginationOpts);
    }
  },
});

export const beginDataExport = internalMutation({
  args: { exportId: v.id('dataExports') },
  handler: async (ctx, args) => {
    const dataExport = await ctx.db.get('dataExports', args.exportId);
    if (!dataExport || dataExport.status !== 'queued') {
      throw new ConvexError('Data export is not queued');
    }

    await ctx.db.patch('dataExports', dataExport._id, {
      status: 'running',
      errorCode: undefined,
    });
    return { userId: dataExport.userId };
  },
});

export const completeDataExport = internalMutation({
  args: {
    exportId: v.id('dataExports'),
    storageId: v.id('_storage'),
    completedAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    const dataExport = await ctx.db.get('dataExports', args.exportId);
    if (!dataExport || dataExport.status !== 'running') {
      throw new ConvexError('Data export is not running');
    }

    await ctx.db.patch('dataExports', dataExport._id, {
      status: 'completed',
      storageId: args.storageId,
      completedAtMs: args.completedAtMs,
      errorCode: undefined,
    });
    return null;
  },
});

export const failDataExport = internalMutation({
  args: { exportId: v.id('dataExports'), errorCode: v.string() },
  handler: async (ctx, args) => {
    const dataExport = await ctx.db.get('dataExports', args.exportId);
    if (!dataExport || dataExport.status === 'completed') {
      return null;
    }

    await ctx.db.patch('dataExports', dataExport._id, {
      status: 'failed',
      errorCode: args.errorCode,
      completedAtMs: Date.now(),
    });
    return null;
  },
});

export const runDataExport = internalAction({
  args: { exportId: v.id('dataExports') },
  handler: async (ctx, args): Promise<null> => {
    let storedId: Id<'_storage'> | null = null;
    try {
      const { userId }: { userId: string } = await ctx.runMutation(internal.dataExport.beginDataExport, {
        exportId: args.exportId,
      });
      const tables: Record<string, Array<unknown>> = {};

      for (const table of EXPORT_TABLES) {
        const rows: Array<unknown> = [];
        let cursor: string | null = null;
        let isDone = false;
        while (!isDone) {
          const result: ExportPage = await ctx.runQuery(internal.dataExport.collectExportPage, {
            userId,
            table,
            paginationOpts: {
              cursor,
              numItems: EXPORT_PAGE_SIZE,
              maximumRowsRead: EXPORT_PAGE_SIZE,
            },
          });
          rows.push(...result.page);
          cursor = result.continueCursor;
          isDone = result.isDone;
        }
        tables[table] = rows;
      }

      const json = JSON.stringify(
        {
          version: 3,
          format: 'json',
          generatedAtMs: Date.now(),
          tables,
        },
        (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
        2,
      );
      storedId = await ctx.storage.store(new Blob([json], { type: 'application/json' }));
      await ctx.runMutation(internal.dataExport.completeDataExport, {
        exportId: args.exportId,
        storageId: storedId,
        completedAtMs: Date.now(),
      });
      return null;
    } catch {
      if (storedId) {
        await ctx.storage.delete(storedId);
      }
      await ctx.runMutation(internal.dataExport.failDataExport, {
        exportId: args.exportId,
        errorCode: 'export_failed',
      });
      return null;
    }
  },
});

export const listExpiredExportBatch = internalQuery({
  args: {
    status: exportStatusValidator,
    nowMs: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.trunc(args.limit), 1), CLEANUP_BATCH_SIZE);
    return await ctx.db
      .query('dataExports')
      .withIndex('by_status_and_expiresAtMs', (q) =>
        q.eq('status', args.status).lte('expiresAtMs', args.nowMs),
      )
      .take(limit);
  },
});

export const deleteExpiredExportDocs = internalMutation({
  args: {
    exportIds: v.array(v.id('dataExports')),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    let deleted = 0;
    for (const exportId of args.exportIds) {
      const dataExport = await ctx.db.get('dataExports', exportId);
      if (dataExport && dataExport.expiresAtMs <= args.nowMs) {
        await ctx.db.delete('dataExports', dataExport._id);
        deleted += 1;
      }
    }
    return deleted;
  },
});

export const cleanupExpiredExports = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const nowMs = Date.now();
    const statuses = ['queued', 'running', 'completed', 'failed'] as const;
    let deleted = 0;
    let needsAnotherBatch = false;

    for (const status of statuses) {
      const batch: Array<{ _id: Id<'dataExports'>; storageId?: Id<'_storage'> }> = await ctx.runQuery(
        internal.dataExport.listExpiredExportBatch,
        { status, nowMs, limit: CLEANUP_BATCH_SIZE },
      );
      needsAnotherBatch ||= batch.length === CLEANUP_BATCH_SIZE;
      for (const dataExport of batch) {
        if (dataExport.storageId) {
          try {
            await ctx.storage.delete(dataExport.storageId);
          } catch {
            // A missing blob is already cleaned up; the metadata row can still be removed.
          }
        }
      }
      deleted += await ctx.runMutation(internal.dataExport.deleteExpiredExportDocs, {
        exportIds: batch.map((dataExport) => dataExport._id),
        nowMs,
      });
    }

    if (needsAnotherBatch) {
      await ctx.scheduler.runAfter(0, internal.dataExport.cleanupExpiredExports, {});
    }
    return deleted;
  },
});
