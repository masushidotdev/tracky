import { getThreadMetadata } from '@convex-dev/agent';
import { ConvexError, v } from 'convex/values';
import { components } from '../_generated/api';
import { internalMutation, internalQuery, mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { isAccountDeletionStarted } from '../lib/accountDeletionGuard';
import { EMBEDDING_DIMENSIONS } from './models';
import { normalizeMemoryContent } from './memoryCore';

const memoryKindValidator = v.union(v.literal('fact'), v.literal('preference'), v.literal('goal'));

export const listMyMemories = query({
  args: { kind: v.optional(memoryKindValidator) },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const memories = await ctx.db
      .query('agentMemories')
      .withIndex('by_userId_and_kind', (q) => {
        const userMemories = q.eq('userId', user.id);
        return args.kind ? userMemories.eq('kind', args.kind) : userMemories;
      })
      .order('desc')
      .take(200);

    return memories.map((memory) => ({
      _id: memory._id,
      kind: memory.kind,
      content: memory.content,
      createdAtMs: memory.createdAtMs,
    }));
  },
});

export const deleteMyMemory = mutation({
  args: { memoryId: v.id('agentMemories') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const memory = await ctx.db.get('agentMemories', args.memoryId);
    if (!memory || memory.userId !== user.id) {
      throw new ConvexError('Memory not found');
    }

    await ctx.db.delete('agentMemories', memory._id);
    return null;
  },
});

export const upsertMemoryForUser = internalMutation({
  args: {
    userId: v.string(),
    kind: memoryKindValidator,
    content: v.string(),
    sourceThreadId: v.optional(v.string()),
    embedding: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    if (await isAccountDeletionStarted(ctx, args.userId)) throw new ConvexError('deletion_in_progress');
    const content = args.content.trim();
    if (content.length === 0 || content.length > 500) throw new ConvexError('Memory content must be 1-500 characters');
    if (
      args.embedding.length !== EMBEDDING_DIMENSIONS ||
      args.embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new ConvexError('Invalid memory embedding');
    }
    if (args.sourceThreadId) {
      const thread = await getThreadMetadata(ctx, components.agent, { threadId: args.sourceThreadId });
      if (thread.userId !== args.userId) throw new ConvexError('Thread not found');
    }
    const normalizedContent = normalizeMemoryContent(content);
    const existing = await ctx.db
      .query('agentMemories')
      .withIndex('by_userId_and_kind_and_normalizedContent', (q) =>
        q.eq('userId', args.userId).eq('kind', args.kind).eq('normalizedContent', normalizedContent),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch('agentMemories', existing._id, {
        content,
        sourceThreadId: args.sourceThreadId,
        embedding: args.embedding,
        updatedAtMs: now,
      });
      return existing._id;
    }
    return await ctx.db.insert('agentMemories', {
      userId: args.userId,
      kind: args.kind,
      content,
      normalizedContent,
      sourceThreadId: args.sourceThreadId,
      embedding: args.embedding,
      createdAtMs: now,
      updatedAtMs: now,
    });
  },
});

export const hydrateMemoriesForUser = internalQuery({
  args: { userId: v.string(), memoryIds: v.array(v.id('agentMemories')) },
  handler: async (ctx, args) => {
    if (args.memoryIds.length > 5) throw new ConvexError('At most 5 memories can be hydrated');
    const memories = await Promise.all(args.memoryIds.map((memoryId) => ctx.db.get('agentMemories', memoryId)));
    return memories.flatMap((memory) =>
      memory && memory.userId === args.userId
        ? [{ id: memory._id, kind: memory.kind, content: memory.content }]
        : [],
    );
  },
});
