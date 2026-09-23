import type { MutationCtx } from '../_generated/server';

/** Check the deletion fence in the same transaction as a background write. */
export async function isAccountDeletionStarted(ctx: Pick<MutationCtx, 'db'>, userId: string): Promise<boolean> {
  const active = await ctx.db.query('accountDeletions')
    .withIndex('by_userId', (q) => q.eq('userId', userId)).unique();
  if (active) return true;

  // The completed deletion row no longer retains the raw user ID.
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const userHash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return !!(await ctx.db.query('deletedUsers')
    .withIndex('by_userHash', (q) => q.eq('userHash', userHash)).unique());
}
