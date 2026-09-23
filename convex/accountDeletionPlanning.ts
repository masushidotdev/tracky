import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import { internalAction, internalMutation } from './_generated/server';

// Each invocation deletes at most one bounded page from the first nonempty table.
// The orchestrator repeats a stage until it returns done, then moves to the next.
export const planningWipeStage = v.union(
  v.literal('planning'),
  v.literal('forecast'),
  v.literal('misc'),
);

export const wipePlanningBatch = internalMutation({
  args: { userId: v.string(), stage: planningWipeStage },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, { userId, stage }): Promise<{ done: boolean }> => {
    if (stage === 'planning') {
      // Delete children before their parents. Every table has a by_userId index.
      const tables = [
        'planMonthSnapshots',
        'planAssignments',
        'planTargets',
        'planBucketCategories',
        'planBuckets',
        'planGroups',
        'plans',
        'planningPreferences',
      ] as const;
      for (const table of tables) {
        const rows = await ctx.db.query(table).withIndex('by_userId', (q) => q.eq('userId', userId)).take(100);
        if (rows.length === 0) continue;
        for (const row of rows) await ctx.db.delete(table, row._id);
        return { done: false };
      }
      return { done: true };
    }

    if (stage === 'forecast') {
      const tables = [
        'forecastAccountAssumptions',
        'forecastIncomeSources',
        'forecastLifeEvents',
        'forecastScenarios',
      ] as const;
      for (const table of tables) {
        const rows = await ctx.db.query(table).withIndex('by_userId', (q) => q.eq('userId', userId)).take(100);
        if (rows.length === 0) continue;
        for (const row of rows) await ctx.db.delete(table, row._id);
        return { done: false };
      }
      return { done: true };
    }

    const tables = ['proactiveJobs', 'analystTurnLocks'] as const;
    for (const table of tables) {
      const rows = await ctx.db.query(table).withIndex('by_userId', (q) => q.eq('userId', userId)).take(100);
      if (rows.length === 0) continue;
      for (const row of rows) await ctx.db.delete(table, row._id);
      return { done: false };
    }
    return { done: true };
  },
});

export const claimNextAgentThread = internalMutation({
  args: { deletionId: v.id('accountDeletions'), userId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { deletionId, userId }): Promise<string | null> => {
    const deletion = await ctx.db.get('accountDeletions', deletionId);
    if (!deletion || deletion.userId !== userId || deletion.status !== 'wiping' || deletion.currentStep !== 'agentThreads') {
      throw new Error('Account deletion is not wiping agent threads');
    }
    if (deletion.currentAgentThreadId) return deletion.currentAgentThreadId;

    const threads = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId,
      paginationOpts: { cursor: null, numItems: 1 },
    });
    if (threads.page.length === 0) return null;
    const threadId = threads.page[0]._id;
    await ctx.db.patch('accountDeletions', deletionId, { currentAgentThreadId: threadId, updatedAtMs: Date.now() });
    return threadId;
  },
});

export const clearAgentThread = internalMutation({
  args: { deletionId: v.id('accountDeletions'), userId: v.string(), threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { deletionId, userId, threadId }): Promise<null> => {
    const deletion = await ctx.db.get('accountDeletions', deletionId);
    if (!deletion || deletion.userId !== userId || deletion.status !== 'wiping' || deletion.currentStep !== 'agentThreads') {
      throw new Error('Account deletion is not wiping agent threads');
    }
    if (deletion.currentAgentThreadId !== threadId) throw new Error('Agent thread changed during wipe');
    await ctx.db.patch('accountDeletions', deletionId, { currentAgentThreadId: undefined, updatedAtMs: Date.now() });
    return null;
  },
});

// The component action drains messages and streams before this action returns.
// Saving the thread ID first makes a crash after metadata deletion recoverable:
// the next attempt can finish its remaining streams by the same ID.
export const wipeAgentThread = internalAction({
  args: { deletionId: v.id('accountDeletions'), userId: v.string() },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, { deletionId, userId }): Promise<{ done: boolean }> => {
    const threadId: string | null = await ctx.runMutation(internal.accountDeletionPlanning.claimNextAgentThread, {
      deletionId, userId,
    });
    if (threadId === null) return { done: true };
    await ctx.runAction(components.agent.threads.deleteAllForThreadIdSync, { threadId, limit: 25 });
    await ctx.runMutation(internal.accountDeletionPlanning.clearAgentThread, { deletionId, userId, threadId });
    return { done: false };
  },
});
