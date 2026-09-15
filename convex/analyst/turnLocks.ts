import { ConvexError, v } from 'convex/values';

import { internalMutation } from '../_generated/server';
import type { MutationCtx } from '../_generated/server';

const TURN_LOCK_TTL_MS = 15 * 60 * 1000;

export async function claimAnalystTurn(ctx: MutationCtx, userId: string, threadId: string) {
  const now = Date.now();
  const existing = await ctx.db
    .query('analystTurnLocks')
    .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
    .unique();

  if (existing && existing.expiresAtMs > now) {
    throw new ConvexError('Analyst response already in progress');
  }
  if (existing) await ctx.db.delete('analystTurnLocks', existing._id);

  return await ctx.db.insert('analystTurnLocks', {
    userId,
    threadId,
    expiresAtMs: now + TURN_LOCK_TTL_MS,
    createdAtMs: now,
  });
}

export const releaseAnalystTurn = internalMutation({
  args: {
    turnLockId: v.id('analystTurnLocks'),
    userId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    const lock = await ctx.db.get('analystTurnLocks', args.turnLockId);
    if (lock && lock.userId === args.userId && lock.threadId === args.threadId) {
      await ctx.db.delete('analystTurnLocks', lock._id);
    }
    return null;
  },
});
