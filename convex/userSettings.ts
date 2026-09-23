import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { internal } from './_generated/api';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireAuthUser } from './auth';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  billReminderLeadDays: [3],
  emailEnabled: false,
  telegramEnabled: false,
} as const;

function resolveSettings(userId: string, settings: Doc<'userSettings'> | null) {
  return {
    ...settings,
    userId,
    planTier: settings?.planTier ?? ('free' as const),
    notifications: settings?.notifications ?? {
      billReminderLeadDays: [...DEFAULT_NOTIFICATION_PREFERENCES.billReminderLeadDays],
      emailEnabled: DEFAULT_NOTIFICATION_PREFERENCES.emailEnabled,
      telegramEnabled: DEFAULT_NOTIFICATION_PREFERENCES.telegramEnabled,
    },
  };
}

async function settingsForUser(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query('userSettings')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
}

function normalizeLeadDays(leadDays: Array<number>) {
  if (leadDays.length > 4) {
    throw new ConvexError('Bill reminder lead days cannot contain more than 4 entries');
  }
  if (leadDays.some((leadDay) => !Number.isInteger(leadDay) || leadDay < 0 || leadDay > 30)) {
    throw new ConvexError('Bill reminder lead days must be integers from 0 to 30');
  }
  return [...new Set(leadDays)].sort((left, right) => left - right);
}

export const getMySettings = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    return resolveSettings(user.id, await settingsForUser(ctx, user.id));
  },
});

export const updateNotificationPreferences = mutation({
  args: {
    billReminderLeadDays: v.array(v.number()),
    emailEnabled: v.boolean(),
    telegramEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const billReminderLeadDays = normalizeLeadDays(args.billReminderLeadDays);
    const existing = await settingsForUser(ctx, user.id);
    const now = Date.now();
    const notifications = {
      billReminderLeadDays,
      emailEnabled: args.emailEnabled,
      telegramEnabled: args.telegramEnabled,
    };

    if (existing) {
      await ctx.db.patch('userSettings', existing._id, { notifications, updatedAtMs: now });
      return resolveSettings(user.id, { ...existing, notifications, updatedAtMs: now });
    }

    const settingsId = await ctx.db.insert('userSettings', {
      userId: user.id,
      notifications,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const settings = await ctx.db.get('userSettings', settingsId);
    if (!settings) {
      throw new ConvexError('Unable to save user settings');
    }
    return resolveSettings(user.id, settings);
  },
});

export const getUserSettingsForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => await settingsForUser(ctx, args.userId),
});

export const setUserPlanTier = internalMutation({
  args: {
    userId: v.string(),
    planTier: v.union(v.literal('free'), v.literal('pro')),
  },
  handler: async (ctx, args): Promise<null> => {
    const existing = await settingsForUser(ctx, args.userId);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch('userSettings', existing._id, {
        planTier: args.planTier,
        planUpdatedAtMs: now,
        updatedAtMs: now,
      });
      return null;
    }

    await ctx.db.insert('userSettings', {
      userId: args.userId,
      planTier: args.planTier,
      planUpdatedAtMs: now,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return null;
  },
});

// Rollout-only migration. Deploy this while the legacy field is still optional
// in the schema, run it to completion, then deploy the final strict schema.
export const clearLegacyDeletionFlags = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ changed: v.number(), done: v.boolean(), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db.query('userSettings').paginate(paginationOpts);
    let changed = 0;
    for (const row of page.page) {
      const legacy = row as typeof row & { deletionRequestedAtMs?: number };
      if (legacy.deletionRequestedAtMs === undefined) continue;
      const { deletionRequestedAtMs: _removed, _id, _creationTime, ...clean } = legacy;
      await ctx.db.replace('userSettings', row._id, clean);
      changed += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.userSettings.clearLegacyDeletionFlags, {
        paginationOpts: { cursor: page.continueCursor, numItems: 100 },
      });
    }
    return { changed, done: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});
