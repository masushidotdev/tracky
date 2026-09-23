import { AuthKit } from '@convex-dev/workos-authkit';
import { ConvexError, v } from 'convex/values';
import { components, internal } from './_generated/api';
import { internalQuery } from './_generated/server';
import { markUserProfileDeleted, syncUserProfileFromWorkosUser } from './authProfiles';
import type { AuthFunctions } from '@convex-dev/workos-authkit';
import type { DataModel } from './_generated/dataModel';

const authFunctions: AuthFunctions = internal.auth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  authFunctions,
});

type AuthKitContext = Parameters<typeof authKit.getAuthUser>[0];
export type AuthUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;

export async function requireAuthUser(ctx: AuthKitContext): Promise<AuthUser> {
  const user = await authKit.getAuthUser(ctx);

  if (!user) {
    throw new ConvexError('Unauthorized');
  }

  const deleting: boolean = await ctx.runQuery(internal.auth.isAccountDeleting, { userId: user.id });
  if (deleting) throw new ConvexError('deletion_in_progress');

  return user;
}

export const isAccountDeleting = internalQuery({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    const active = await ctx.db.query('accountDeletions')
      .withIndex('by_userId', (q) => q.eq('userId', userId)).unique();
    if (active) return true;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
    const userHash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return !!(await ctx.db.query('deletedUsers').withIndex('by_userHash', (q) => q.eq('userHash', userHash)).unique());
  },
});

export const { authKitEvent } = authKit.events({
  'user.created': async (ctx, event) => {
    await syncUserProfileFromWorkosUser(ctx, event.data);
  },
  'user.updated': async (ctx, event) => {
    await syncUserProfileFromWorkosUser(ctx, event.data);
  },
  'user.deleted': async (ctx, event) => {
    await markUserProfileDeleted(ctx, event.data.id);
  },
});

export const { backfillUsers } = authKit.utils();
