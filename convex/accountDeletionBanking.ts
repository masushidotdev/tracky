import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { Id, TableNames } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

const BATCH_SIZE = 100;

// The orchestrator repeats a stage until done before moving to the next one.
// Each invocation touches at most one table and deletes no more than 100 rows.
const stageValidator = v.union(
  v.literal('personalData'),
  v.literal('telegram'),
  v.literal('bankingLeaves'),
  v.literal('bankingCore'),
);

async function removeRows<TTableName extends TableNames>(
  ctx: MutationCtx,
  table: TTableName,
  rows: Array<{ _id: Id<TTableName> }>,
) {
  for (const row of rows) await ctx.db.delete(table, row._id);
  return rows.length;
}

export const wipeBankingBatch = internalMutation({
  args: { userId: v.string(), stage: stageValidator },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, args): Promise<{ done: boolean }> => {
    const deletion = await ctx.db
      .query('accountDeletions')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique();
    if (!deletion || deletion.status !== 'wiping') throw new Error('account_deletion_not_active');

    const userId = args.userId;
    if (args.stage === 'personalData') {
      const exports = await ctx.db
        .query('dataExports')
        .withIndex('by_userId_and_requestedAtMs', (q) => q.eq('userId', userId))
        .take(BATCH_SIZE);
      if (exports.length > 0) {
        for (const row of exports) {
          if (row.storageId) {
            try {
              await ctx.storage.delete(row.storageId);
            } catch (error) {
              // A missing object is already erased. A still-present object must
              // keep its row so a retry can remove it.
              const stillPresent = await ctx.db.system.get('_storage', row.storageId);
              if (stillPresent) throw error;
            }
          }
          await ctx.db.delete('dataExports', row._id);
        }
        return { done: false };
      }
      {
        const rows = await ctx.db.query('notifications').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'notifications', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('agentMemories').withIndex('by_userId_and_kind', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'agentMemories', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('writeGuardBadges').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'writeGuardBadges', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('agentReports').withIndex('by_userId_and_period_and_kind', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'agentReports', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('healthScoreSnapshots').withIndex('by_userId_and_computedAtDate', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'healthScoreSnapshots', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('savedReports').withIndex('by_userId_and_sortOrder', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'savedReports', rows);
          return { done: false };
        }
      }
      return { done: true };
    }

    if (args.stage === 'telegram') {
      {
        const rows = await ctx.db.query('telegramLinkCodes').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'telegramLinkCodes', rows);
          return { done: false };
        }
      }
      // Keep each link until all updates for its chat are gone: historical
      // updates can have no userId, and the link is their ownership evidence.
      const link = await ctx.db
        .query('telegramLinks')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .first();
      if (link) {
        const updates = await ctx.db
          .query('telegramUpdates')
          .withIndex('by_chatId_and_status_and_updateId', (q) => q.eq('chatId', link.chatId))
          .take(BATCH_SIZE);
        if (updates.length > 0) {
          await removeRows(ctx, 'telegramUpdates', updates);
        } else {
          await ctx.db.delete('telegramLinks', link._id);
        }
        return { done: false };
      }
      {
        const rows = await ctx.db.query('telegramUpdates').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'telegramUpdates', rows);
          return { done: false };
        }
      }
      return { done: true };
    }

    if (args.stage === 'bankingLeaves') {
      {
        const rows = await ctx.db.query('accountBalances').withIndex('by_userId_and_fetchedAtMs', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'accountBalances', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('transactions').withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'transactions', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('accountSyncStates').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'accountSyncStates', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('importJobs').withIndex('by_userId_and_createdAtMs', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'importJobs', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('categoryRules').withIndex('by_userId_and_priority', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'categoryRules', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('transferMatches').withIndex('by_userId_and_status', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'transferMatches', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('plannedExpenseOccurrencePayments').withIndex('by_userId_and_dueDate', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'plannedExpenseOccurrencePayments', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('moneyBoxContributions').withIndex('by_userId_and_contributionDate', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'moneyBoxContributions', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('creditFacilityInstallmentPayments').withIndex('by_userId_and_paymentDate', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'creditFacilityInstallmentPayments', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('creditFacilityUsageCycles').withIndex('by_userId_and_status_and_dueDate', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'creditFacilityUsageCycles', rows);
          return { done: false };
        }
      }
      return { done: true };
    }

    // Provider connections and their session IDs must survive until the
    // revocation action has captured and attempted every external consent.
      {
        const rows = await ctx.db.query('subscriptions').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'subscriptions', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('plannedTransactions').withIndex('by_userId_and_dueDate', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'plannedTransactions', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('moneyBoxes').withIndex('by_userId_and_targetDate', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'moneyBoxes', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('creditFacilityInstallmentPlans').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'creditFacilityInstallmentPlans', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('creditFacilities').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'creditFacilities', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('financialAccounts').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'financialAccounts', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('categories').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'categories', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('transactionTags').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'transactionTags', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('providerAuthRequests').withIndex('by_userId_and_status', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'providerAuthRequests', rows);
          return { done: false };
        }
      }
      {
        const rows = await ctx.db.query('providerConnections').withIndex('by_userId', (q) => q.eq('userId', userId)).take(BATCH_SIZE);
        if (rows.length > 0) {
          await removeRows(ctx, 'providerConnections', rows);
          return { done: false };
        }
      }
    return { done: true };
  },
});

// Anonymous Telegram updates cannot be attributed to an erased account once
// the associated link is gone. The normal wipe removes those for every linked
// chat; this bounded retention sweep removes older, unlinked terminal rows.
export const pruneAnonymousTelegramUpdates = internalMutation({
  args: {},
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx): Promise<{ done: boolean }> => {
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const status of ['completed', 'failed'] as const) {
      const rows = await ctx.db
        .query('telegramUpdates')
        .withIndex('by_userId_and_status_and_updatedAtMs', (q) =>
          q.eq('userId', undefined).eq('status', status).lt('updatedAtMs', cutoffMs),
        )
        .take(BATCH_SIZE);
      if (rows.length > 0) {
        await removeRows(ctx, 'telegramUpdates', rows);
        return { done: false };
      }
    }
    return { done: true };
  },
});
