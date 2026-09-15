/// <reference types="vite/client" />

import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { components } from './_generated/api';
import schema from './schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './userSettings.ts']);

type SettingsView = {
  userId: string;
  planTier: 'free' | 'pro';
  notifications: {
    billReminderLeadDays: Array<number>;
    emailEnabled: boolean;
    telegramEnabled: boolean;
  };
  createdAtMs?: number;
  updatedAtMs?: number;
  deletionRequestedAtMs?: number;
};

const getMySettings = makeFunctionReference<'query', Record<string, never>, SettingsView>(
  'userSettings:getMySettings',
);
const updateNotificationPreferences = makeFunctionReference<
  'mutation',
  {
    billReminderLeadDays: Array<number>;
    emailEnabled: boolean;
    telegramEnabled: boolean;
  },
  SettingsView
>('userSettings:updateNotificationPreferences');
const requestAccountDeletion = makeFunctionReference<'mutation', Record<string, never>, number>(
  'userSettings:requestAccountDeletion',
);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

async function seedAuthUser(t: ReturnType<typeof createTest>, userId: string) {
  const timestamp = '2026-07-16T08:00:00.000Z';
  await t.mutation(components.workOSAuthKit.lib.onWebhookEvent, {
    apiKey: 'sk_test',
    event: {
      id: `evt_${userId}`,
      createdAt: timestamp,
      event: 'user.created',
      data: {
        object: 'user',
        id: userId,
        email: `${userId}@example.com`,
        firstName: 'Settings',
        lastName: 'User',
        emailVerified: true,
        profilePictureUrl: null,
        lastSignInAt: null,
        externalId: null,
        metadata: {},
        locale: 'en-US',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
  });
}

describe('user settings', () => {
  test('returns notification and plan defaults without creating a document', async () => {
    const t = createTest();
    await seedAuthUser(t, 'user_defaults');
    const settings = await t.withIdentity({ subject: 'user_defaults' }).query(getMySettings, {});

    expect(settings).toMatchObject({
      userId: 'user_defaults',
      planTier: 'free',
      notifications: {
        billReminderLeadDays: [3],
        emailEnabled: false,
        telegramEnabled: false,
      },
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query('userSettings').withIndex('by_userId').take(10)).toHaveLength(0);
    });
  });

  test('upserts preferences, dedupes and sorts lead days, and preserves shared settings fields', async () => {
    const t = createTest();
    const userId = 'user_upsert';
    await seedAuthUser(t, userId);
    const now = Date.UTC(2026, 6, 16);
    await t.run(async (ctx) => {
      await ctx.db.insert('userSettings', {
        userId,
        planTier: 'pro',
        planUpdatedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const asUser = t.withIdentity({ subject: userId });
    const first = await asUser.mutation(updateNotificationPreferences, {
      billReminderLeadDays: [7, 1, 3, 1],
      emailEnabled: true,
      telegramEnabled: false,
    });
    const second = await asUser.mutation(updateNotificationPreferences, {
      billReminderLeadDays: [],
      emailEnabled: false,
      telegramEnabled: true,
    });

    expect(first.planTier).toBe('pro');
    expect(first.notifications.billReminderLeadDays).toEqual([1, 3, 7]);
    expect(second.notifications).toEqual({
      billReminderLeadDays: [],
      emailEnabled: false,
      telegramEnabled: true,
    });
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .take(10);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.planTier).toBe('pro');
      expect(rows[0]?.planUpdatedAtMs).toBe(now);
      expect(rows[0]?.createdAtMs).toBe(now);
    });
  });

  test.each([
    [[0, 1, 2, 3, 4], 'more than 4'],
    [[-1], 'from 0 to 30'],
    [[31], 'from 0 to 30'],
    [[1.5], 'from 0 to 30'],
  ] as const)('rejects invalid lead days %j', async (billReminderLeadDays, errorText) => {
    const t = createTest();
    await seedAuthUser(t, 'user_invalid');
    await expect(
      t.withIdentity({ subject: 'user_invalid' }).mutation(updateNotificationPreferences, {
        billReminderLeadDays: [...billReminderLeadDays],
        emailEnabled: false,
        telegramEnabled: false,
      }),
    ).rejects.toThrow(errorText);
  });

  test('requires authentication for reads and writes', async () => {
    const t = createTest();
    await expect(t.query(getMySettings, {})).rejects.toThrow('Unauthorized');
    await expect(
      t.mutation(updateNotificationPreferences, {
        billReminderLeadDays: [3],
        emailEnabled: false,
        telegramEnabled: false,
      }),
    ).rejects.toThrow('Unauthorized');
    await expect(t.mutation(requestAccountDeletion, {})).rejects.toThrow('Unauthorized');
  });

  test('records an account deletion request once and exposes it through settings', async () => {
    const t = createTest();
    await seedAuthUser(t, 'user_deletion');
    const asUser = t.withIdentity({ subject: 'user_deletion' });

    const first = await asUser.mutation(requestAccountDeletion, {});
    const second = await asUser.mutation(requestAccountDeletion, {});
    const settings = await asUser.query(getMySettings, {});

    expect(second).toBe(first);
    expect(settings.deletionRequestedAtMs).toBe(first);
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', 'user_deletion'))
        .take(2);
      expect(rows).toHaveLength(1);
    });
  });
});
