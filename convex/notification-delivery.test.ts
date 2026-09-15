/// <reference types="vite/client" />

import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderNotificationText } from './lib/notificationMessages';
import schema from './schema';
import type { Doc, Id } from './_generated/dataModel';

const modules = import.meta.glob([
  './_generated/*.js',
  './notificationDelivery.ts',
  './analyst/telegramActions.ts',
]);

type DeliveryContext = {
  notification: Doc<'notifications'>;
  userSettings: Doc<'userSettings'> | null;
  userProfile: Doc<'userProfiles'> | null;
  telegramLink: Doc<'telegramLinks'> | null;
};

const getDeliveryContext = makeFunctionReference<
  'query',
  { notificationId: Id<'notifications'> },
  DeliveryContext | null
>('notificationDelivery:getDeliveryContext');
const markDelivered = makeFunctionReference<
  'mutation',
  { notificationId: Id<'notifications'>; channel: 'email' | 'telegram' },
  { updated: boolean; deliveredAtMs: number | null }
>('notificationDelivery:markDelivered');
const deliverNotifications = makeFunctionReference<
  'action',
  { notificationIds: Array<Id<'notifications'>> },
  null
>('notificationDelivery:deliverNotifications');

function createTest() {
  return convexTest(schema, modules);
}

async function seedNotification(
  t: ReturnType<typeof createTest>,
  input: {
    userId: string;
    type?: Doc<'notifications'>['type'];
    emailEnabled?: boolean;
    telegramEnabled?: boolean;
    withProfile?: boolean;
    withTelegramLink?: boolean;
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 16, 8);
    if (input.emailEnabled !== undefined || input.telegramEnabled !== undefined) {
      await ctx.db.insert('userSettings', {
        userId: input.userId,
        notifications: {
          billReminderLeadDays: [3],
          emailEnabled: input.emailEnabled ?? false,
          telegramEnabled: input.telegramEnabled ?? false,
        },
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
    if (input.withProfile) {
      await ctx.db.insert('userProfiles', {
        authUserId: input.userId,
        email: 'verified@example.com',
        emailVerified: true,
        locale: 'it-IT',
        status: 'active',
        createdAtMs: now,
        updatedAtMs: now,
        lastSyncedAtMs: now,
      });
    }
    if (input.withTelegramLink) {
      await ctx.db.insert('telegramLinks', {
        userId: input.userId,
        chatId: `chat_${input.userId}`,
        verifiedAtMs: now,
        locale: 'it',
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
    return await ctx.db.insert('notifications', {
      userId: input.userId,
      type: input.type ?? 'billReminder',
      severity: 'info',
      titleKey: 'notifications.billReminder.title',
      bodyKey: 'notifications.billReminder.body',
      params: { name: 'Electricity', amount: '82.40', currency: 'EUR', date: '2026-07-19' },
      dedupeKey: `test:${input.userId}:${input.type ?? 'billReminder'}`,
      createdAtMs: now,
    });
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe('notification delivery', () => {
  test('loads notification, preferences, localized profile, and verified Telegram link', async () => {
    const t = createTest();
    const notificationId = await seedNotification(t, {
      userId: 'user_context',
      emailEnabled: true,
      telegramEnabled: true,
      withProfile: true,
      withTelegramLink: true,
    });

    const context = await t.query(getDeliveryContext, { notificationId });
    expect(context).toMatchObject({
      notification: { _id: notificationId, userId: 'user_context', type: 'billReminder' },
      userSettings: {
        notifications: { billReminderLeadDays: [3], emailEnabled: true, telegramEnabled: true },
      },
      userProfile: { email: 'verified@example.com', emailVerified: true, locale: 'it-IT' },
      telegramLink: { chatId: 'chat_user_context' },
    });
  });

  test('marks each delivery channel exactly once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
    const t = createTest();
    const notificationId = await seedNotification(t, { userId: 'user_mark' });

    const firstEmail = await t.mutation(markDelivered, { notificationId, channel: 'email' });
    vi.advanceTimersByTime(60_000);
    const secondEmail = await t.mutation(markDelivered, { notificationId, channel: 'email' });
    const firstTelegram = await t.mutation(markDelivered, { notificationId, channel: 'telegram' });
    vi.advanceTimersByTime(60_000);
    const secondTelegram = await t.mutation(markDelivered, { notificationId, channel: 'telegram' });

    expect(firstEmail.updated).toBe(true);
    expect(secondEmail).toEqual({ updated: false, deliveredAtMs: firstEmail.deliveredAtMs });
    expect(firstTelegram.updated).toBe(true);
    expect(secondTelegram).toEqual({ updated: false, deliveredAtMs: firstTelegram.deliveredAtMs });
    const notification = await t.run(async (ctx) => await ctx.db.get('notifications', notificationId));
    expect(notification?.emailDeliveredAtMs).toBe(firstEmail.deliveredAtMs);
    expect(notification?.telegramDeliveredAtMs).toBe(firstTelegram.deliveredAtMs);
  });

  test('skips non-deliverable notification types and opted-out users without external calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const t = createTest();
    const nonDeliverableId = await seedNotification(t, {
      userId: 'user_sync',
      type: 'syncFailed',
      emailEnabled: true,
      telegramEnabled: true,
      withProfile: true,
      withTelegramLink: true,
    });
    const optedOutId = await seedNotification(t, {
      userId: 'user_opted_out',
      emailEnabled: false,
      telegramEnabled: false,
      withProfile: true,
      withTelegramLink: true,
    });

    await t.action(deliverNotifications, { notificationIds: [nonDeliverableId, optedOutId] });

    expect(fetchMock).not.toHaveBeenCalled();
    await t.run(async (ctx) => {
      for (const notificationId of [nonDeliverableId, optedOutId]) {
        const notification = await ctx.db.get('notifications', notificationId);
        expect(notification?.emailDeliveredAtMs).toBeUndefined();
        expect(notification?.telegramDeliveredAtMs).toBeUndefined();
      }
    });
  });

  test('sends Telegram at the action boundary and records delivery only after success', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'telegram_test_token';
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const t = createTest();
    const notificationId = await seedNotification(t, {
      userId: 'user_telegram',
      emailEnabled: false,
      telegramEnabled: true,
      withProfile: true,
      withTelegramLink: true,
    });

    await t.action(deliverNotifications, { notificationIds: [notificationId] });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/bottelegram_test_token/sendMessage');
    expect(request.body).toContain('Bolletta in scadenza');
    const notification = await t.run(async (ctx) => await ctx.db.get('notifications', notificationId));
    expect(notification?.telegramDeliveredAtMs).toEqual(expect.any(Number));
    expect(notification?.emailDeliveredAtMs).toBeUndefined();
  });

  test('renders EN and IT templates with parameter interpolation', () => {
    const params = { name: 'Rent', amount: '950.00', currency: 'EUR', date: '2026-08-01' };
    expect(
      renderNotificationText(
        'notifications.billReminder.title',
        'notifications.billReminder.body',
        params,
        'en',
      ),
    ).toEqual({
      title: 'Bill due soon',
      body: 'Rent of 950.00 EUR is due on 2026-08-01.',
    });
    expect(
      renderNotificationText(
        'notifications.billReminder.title',
        'notifications.billReminder.body',
        params,
        'it',
      ),
    ).toEqual({
      title: 'Bolletta in scadenza',
      body: 'Rent di 950.00 EUR scade il 2026-08-01.',
    });
  });
});
