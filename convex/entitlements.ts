import { v } from 'convex/values';
import { internalQuery, query } from './_generated/server';
import { requireAuthUser } from './auth';
import { entitlementsForTier, resolveTier } from './lib/entitlements';
import type { QueryCtx } from './_generated/server';

async function settingsForUser(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query('userSettings')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
}

export const getMyEntitlements = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const settings = await settingsForUser(ctx, user.id);
    return entitlementsForTier(resolveTier(settings));
  },
});

export const getEntitlementsForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const settings = await settingsForUser(ctx, args.userId);
    return entitlementsForTier(resolveTier(settings));
  },
});
