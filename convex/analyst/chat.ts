import {
  abortStream,
  createThread as createAgentThread,
  getThreadMetadata,
  listUIMessages,
  saveMessage,
  syncStreams,
  updateThreadMetadata,
  vStreamArgs,
} from '@convex-dev/agent';
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { components } from '../_generated/api';
import { mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { makeAnalystAgent } from './agent';
import { APPROVAL_DENIED_REASON, APPROVAL_GRANTED_REASON, approvalBatchState } from './approvalBatch';
import { analystFunctionRefs } from './functionRefs';
import { DEFAULT_MODEL, modelIdValidator } from './models';
import { analystRateLimiter, dailyLimitNameForTier } from './rateLimits';
import { claimAnalystTurn } from './turnLocks';
import type { MutationCtx, QueryCtx } from '../_generated/server';

async function authorizeThreadAccess(ctx: QueryCtx | MutationCtx, threadId: string, userId: string) {
  const thread = await getThreadMetadata(ctx, components.agent, { threadId });
  if (thread.userId !== userId) throw new ConvexError('Thread not found');
  return thread;
}

export const createThread = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    const user = await requireAuthUser(ctx);
    return await createAgentThread(ctx, components.agent, { userId: user.id });
  },
});

export const listThreads = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId: user.id,
      order: 'desc',
      paginationOpts: args.paginationOpts,
    });
  },
});

export const listThreadMessages = query({
  args: { threadId: v.string(), paginationOpts: paginationOptsValidator, streamArgs: vStreamArgs },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    await authorizeThreadAccess(ctx, args.threadId, user.id);
    return {
      ...(await listUIMessages(ctx, components.agent, {
        threadId: args.threadId,
        paginationOpts: args.paginationOpts,
      })),
      streams: await syncStreams(ctx, components.agent, {
        threadId: args.threadId,
        streamArgs: args.streamArgs,
      }),
    };
  },
});

export const sendMessage = mutation({
  args: { threadId: v.string(), prompt: v.string(), modelId: modelIdValidator, locale: v.string() },
  handler: async (ctx, args): Promise<{ messageId: string }> => {
    const user = await requireAuthUser(ctx);
    await authorizeThreadAccess(ctx, args.threadId, user.id);
    await analystRateLimiter.limit(ctx, 'analystBurst', { key: user.id, throws: true });
    const entitlements = await ctx.runQuery(analystFunctionRefs.entitlementsForUser, { userId: user.id });
    await analystRateLimiter.limit(ctx, dailyLimitNameForTier(entitlements.tier), { key: user.id, throws: true });
    const existing = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: { cursor: null, numItems: 1 },
    });
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      userId: user.id,
      prompt: args.prompt,
    });
    const turnLockId = await claimAnalystTurn(ctx, user.id, args.threadId);
    await ctx.scheduler.runAfter(0, analystFunctionRefs.streamReply, {
      threadId: args.threadId,
      userId: user.id,
      promptMessageId: messageId,
      modelId: args.modelId,
      locale: args.locale,
      turnLockId,
      memoryQuery: args.prompt.slice(0, 1_000),
    });
    if (existing.page.length === 0) {
      await ctx.scheduler.runAfter(0, analystFunctionRefs.generateTitle, {
        threadId: args.threadId,
        userId: user.id,
        firstMessage: args.prompt,
      });
    }
    return { messageId };
  },
});

export const respondToApproval = mutation({
  args: {
    threadId: v.string(),
    approvalId: v.string(),
    approve: v.boolean(),
    modelId: modelIdValidator,
    locale: v.string(),
  },
  handler: async (ctx, args): Promise<{ messageId: string }> => {
    const user = await requireAuthUser(ctx);
    await authorizeThreadAccess(ctx, args.threadId, user.id);
    const agent = makeAnalystAgent(args.modelId, args.locale);
    const { messageId } = args.approve
      ? await agent.approveToolCall(ctx, {
          threadId: args.threadId,
          approvalId: args.approvalId,
          reason: APPROVAL_GRANTED_REASON,
        })
      : await agent.denyToolCall(ctx, {
          threadId: args.threadId,
          approvalId: args.approvalId,
          reason: APPROVAL_DENIED_REASON,
        });
    const recentMessages = await agent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: { cursor: null, numItems: 100 },
    });
    const batch = approvalBatchState(recentMessages.page, args.approvalId);
    if (batch.pendingCount > 0) return { messageId };

    const turnLockId = await claimAnalystTurn(ctx, user.id, args.threadId);
    await ctx.scheduler.runAfter(0, analystFunctionRefs.streamReply, {
      threadId: args.threadId,
      userId: user.id,
      promptMessageId: messageId,
      modelId: args.modelId,
      locale: args.locale,
      turnLockId,
      approvalContinuation: batch,
    });
    return { messageId };
  },
});

export const renameThread = mutation({
  args: { threadId: v.string(), title: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const user = await requireAuthUser(ctx);
    await authorizeThreadAccess(ctx, args.threadId, user.id);
    await updateThreadMetadata(ctx, components.agent, {
      threadId: args.threadId,
      patch: { title: args.title.trim().slice(0, 60) },
    });
    return null;
  },
});

export const deleteThread = mutation({
  args: { threadId: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const user = await requireAuthUser(ctx);
    await authorizeThreadAccess(ctx, args.threadId, user.id);
    const agent = makeAnalystAgent(DEFAULT_MODEL, 'en');
    await agent.deleteThreadAsync(ctx, { threadId: args.threadId });
    return null;
  },
});

export const stopStreaming = mutation({
  args: { threadId: v.string(), order: v.number() },
  handler: async (ctx, args): Promise<boolean> => {
    const user = await requireAuthUser(ctx);
    await authorizeThreadAccess(ctx, args.threadId, user.id);
    return await abortStream(ctx, components.agent, {
      threadId: args.threadId,
      order: args.order,
      reason: 'Stopped by user',
    });
  },
});
