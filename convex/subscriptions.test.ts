/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { api, components } from './_generated/api';
import schema from './schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/subscriptionDetection.ts',
  './lib/*.ts',
  './subscriptions.ts',
]);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

async function seedAuthKitUser(t: ReturnType<typeof createTest>, userId: string) {
  const timestamp = '2026-01-01T00:00:00.000Z';
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
        firstName: 'Test',
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

describe('subscriptions', () => {
  test('updates display alias without changing detected identity fields', async () => {
    const t = createTest();
    const userId = 'user_subscription_alias';
    await seedAuthKitUser(t, userId);

    const subscriptionId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      return await ctx.db.insert('subscriptions', {
        userId,
        name: 'PREMIO POLIZZA 0C002/00000000042241755465 ADDEBITO PREMIO POLIZZA',
        merchantName: 'PREMIO POLIZZA 0C002/00000000042241755465 ADDEBITO PREMIO POLIZZA',
        description: 'Detected recurring insurance debit',
        amount: {
          amountMinor: -1454n,
          currency: 'EUR',
        },
        interval: 'month',
        intervalCount: 1,
        status: 'active',
        startDate: '2026-06-18',
        nextDueDate: '2026-07-18',
        trialPeriodDays: 0,
        source: 'transaction',
        confidence: 0.92,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await t.withIdentity({ subject: userId }).mutation(api.subscriptions.updateSubscriptionAlias, {
      subscriptionId,
      alias: 'Assicurazione casa',
    });

    const subscription = await t.run(async (ctx) => await ctx.db.get('subscriptions', subscriptionId));

    expect(subscription).toMatchObject({
      alias: 'Assicurazione casa',
      name: 'PREMIO POLIZZA 0C002/00000000042241755465 ADDEBITO PREMIO POLIZZA',
      merchantName: 'PREMIO POLIZZA 0C002/00000000042241755465 ADDEBITO PREMIO POLIZZA',
      source: 'transaction',
      confidence: 0.92,
    });

    await t.withIdentity({ subject: userId }).mutation(api.subscriptions.updateSubscriptionAlias, {
      subscriptionId,
      alias: '   ',
    });

    const clearedSubscription = await t.run(async (ctx) => await ctx.db.get('subscriptions', subscriptionId));

    expect(clearedSubscription?.alias).toBeNull();
    expect(clearedSubscription?.name).toBe(
      'PREMIO POLIZZA 0C002/00000000042241755465 ADDEBITO PREMIO POLIZZA',
    );
  });

  test('updates debit account only when the account belongs to the authenticated user', async () => {
    const t = createTest();
    const userId = 'user_subscription_account';
    const otherUserId = 'user_subscription_other_account';
    await seedAuthKitUser(t, userId);
    await seedAuthKitUser(t, otherUserId);

    const seeded = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const otherProviderConnectionId = await ctx.db.insert('providerConnections', {
        userId: otherUserId,
        provider: 'mock',
        status: 'active',
        displayName: 'Other mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const accountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'main',
        name: 'Main account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const otherAccountId = await ctx.db.insert('financialAccounts', {
        userId: otherUserId,
        providerConnectionId: otherProviderConnectionId,
        provider: 'mock',
        providerAccountId: 'other_main',
        name: 'Other account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const subscriptionId = await ctx.db.insert('subscriptions', {
        userId,
        name: 'Apple.com',
        merchantName: 'Apple.com',
        amount: {
          amountMinor: -999n,
          currency: 'EUR',
        },
        interval: 'month',
        intervalCount: 1,
        status: 'active',
        startDate: '2026-06-13',
        nextDueDate: '2026-07-13',
        trialPeriodDays: 0,
        source: 'transaction',
        createdAtMs: now,
        updatedAtMs: now,
      });

      return { accountId, otherAccountId, subscriptionId };
    });

    await t.withIdentity({ subject: userId }).mutation(api.subscriptions.updateSubscriptionAccount, {
      subscriptionId: seeded.subscriptionId,
      accountId: seeded.accountId,
    });

    const assignedSubscription = await t.run(async (ctx) =>
      ctx.db.get('subscriptions', seeded.subscriptionId),
    );
    expect(assignedSubscription?.accountId).toBe(seeded.accountId);

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.subscriptions.updateSubscriptionAccount, {
        subscriptionId: seeded.subscriptionId,
        accountId: seeded.otherAccountId,
      }),
    ).rejects.toThrow('Account not found');

    await t.withIdentity({ subject: userId }).mutation(api.subscriptions.updateSubscriptionAccount, {
      subscriptionId: seeded.subscriptionId,
      accountId: null,
    });

    const clearedSubscription = await t.run(async (ctx) =>
      ctx.db.get('subscriptions', seeded.subscriptionId),
    );
    expect(clearedSubscription?.accountId).toBeNull();
  });

  test('converts an imported transaction into a user-owned subscription', async () => {
    const t = createTest();
    const userId = 'user_subscription_test';
    await seedAuthKitUser(t, userId);

    const seeded = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const accountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'main',
        name: 'Main account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const categoryId = await ctx.db.insert('categories', {
        userId,
        name: 'Subscriptions',
        systemKey: 'expense:subscriptions',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const firstTransactionId = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        providerTransactionId: 'netflix_2026_05',
        dedupeKey: 'netflix_2026_05',
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: -1599n,
          currency: 'EUR',
        },
        bookingDate: '2026-05-15',
        description: 'AcmeStreaming.example',
        counterpartyName: 'AcmeStreaming.example',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
      const latestTransactionId = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        providerTransactionId: 'netflix_2026_06',
        dedupeKey: 'netflix_2026_06',
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: -1599n,
          currency: 'EUR',
        },
        bookingDate: '2026-06-15',
        description: 'AcmeStreaming.example',
        counterpartyName: 'AcmeStreaming.example',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });

      return { categoryId, firstTransactionId, latestTransactionId };
    });

    const subscriptionId = await t.withIdentity({ subject: userId }).mutation(
      api.subscriptions.convertTransactionToSubscription,
      {
        transactionId: seeded.latestTransactionId,
        name: 'Acme Streaming',
        interval: 'month',
        intervalCount: 1,
        categoryId: seeded.categoryId,
      },
    );

    const result = await t.run(async (ctx) => {
      const subscription = await ctx.db.get('subscriptions', subscriptionId);
      const firstTransaction = await ctx.db.get('transactions', seeded.firstTransactionId);
      const latestTransaction = await ctx.db.get('transactions', seeded.latestTransactionId);
      return { firstTransaction, latestTransaction, subscription };
    });

    expect(result.subscription).toMatchObject({
      userId,
      name: 'Acme Streaming',
      merchantName: 'AcmeStreaming.example',
      source: 'transaction',
      interval: 'month',
      intervalCount: 1,
      startDate: '2026-05-15',
      nextDueDate: '2026-07-15',
      latestTransactionId: seeded.latestTransactionId,
      categoryId: seeded.categoryId,
    });
    expect(result.subscription?.amount).toEqual({ amountMinor: -1599n, currency: 'EUR' });
    expect(result.firstTransaction).toMatchObject({
      classificationKind: 'subscription',
      classificationSource: 'user',
      subscriptionId,
      categoryId: seeded.categoryId,
    });
    expect(result.latestTransaction).toMatchObject({
      classificationKind: 'subscription',
      classificationSource: 'user',
      subscriptionId,
      categoryId: seeded.categoryId,
    });
  });

  test('rejects a category owned by another user', async () => {
    const t = createTest();
    const ownerUserId = 'user_subscription_category_owner';
    const intruderUserId = 'user_subscription_category_intruder';
    await seedAuthKitUser(t, ownerUserId);
    await seedAuthKitUser(t, intruderUserId);

    const ownerCategoryId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      return await ctx.db.insert('categories', {
        userId: ownerUserId,
        name: 'Owner category',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(
      t.withIdentity({ subject: intruderUserId }).mutation(api.subscriptions.createSubscription, {
        name: 'Intruder subscription',
        currency: 'EUR',
        interval: 'month',
        intervalCount: 1,
        startDate: '2026-06-15',
        trialPeriodDays: 0,
        categoryId: ownerCategoryId,
      }),
    ).rejects.toThrow('Category not found');

    const intruderTransactionId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId: intruderUserId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const accountId = await ctx.db.insert('financialAccounts', {
        userId: intruderUserId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'intruder_main',
        name: 'Intruder account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return await ctx.db.insert('transactions', {
        userId: intruderUserId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        providerTransactionId: 'intruder_netflix_2026_06',
        dedupeKey: 'intruder_netflix_2026_06',
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: -1599n,
          currency: 'EUR',
        },
        bookingDate: '2026-06-15',
        description: 'AcmeStreaming.example',
        counterpartyName: 'AcmeStreaming.example',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(
      t.withIdentity({ subject: intruderUserId }).mutation(api.subscriptions.convertTransactionToSubscription, {
        transactionId: intruderTransactionId,
        name: 'Acme Streaming',
        interval: 'month',
        intervalCount: 1,
        categoryId: ownerCategoryId,
      }),
    ).rejects.toThrow('Category not found');

    const result = await t.run(async (ctx) => {
      const transaction = await ctx.db.get('transactions', intruderTransactionId);
      const subscriptions = await ctx.db
        .query('subscriptions')
        .withIndex('by_userId', (q) => q.eq('userId', intruderUserId))
        .take(10);
      return { transaction, subscriptions };
    });

    expect(result.subscriptions).toHaveLength(0);
    expect(result.transaction).toMatchObject({
      classificationKind: 'expense',
      classificationSource: 'provider',
    });
    expect(result.transaction?.subscriptionId).toBeUndefined();
  });

  test('does not convert another user transaction into a subscription', async () => {
    const t = createTest();
    const ownerUserId = 'user_subscription_owner';
    const intruderUserId = 'user_subscription_intruder';
    await seedAuthKitUser(t, ownerUserId);
    await seedAuthKitUser(t, intruderUserId);

    const ownerTransactionId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId: ownerUserId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const accountId = await ctx.db.insert('financialAccounts', {
        userId: ownerUserId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'owner_main',
        name: 'Owner account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });

      return await ctx.db.insert('transactions', {
        userId: ownerUserId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        providerTransactionId: 'owner_netflix_2026_06',
        dedupeKey: 'owner_netflix_2026_06',
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: -1599n,
          currency: 'EUR',
        },
        bookingDate: '2026-06-15',
        description: 'AcmeStreaming.example',
        counterpartyName: 'AcmeStreaming.example',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(
      t.withIdentity({ subject: intruderUserId }).mutation(api.subscriptions.convertTransactionToSubscription, {
        transactionId: ownerTransactionId,
        name: 'Acme Streaming',
        interval: 'month',
        intervalCount: 1,
      }),
    ).rejects.toThrow('Transaction not found');

    const result = await t.run(async (ctx) => {
      const ownerTransaction = await ctx.db.get('transactions', ownerTransactionId);
      const subscriptions = await ctx.db.query('subscriptions').withIndex('by_userId', (q) => q.eq('userId', intruderUserId)).take(10);
      return { ownerTransaction, subscriptions };
    });

    expect(result.subscriptions).toHaveLength(0);
    expect(result.ownerTransaction).toMatchObject({
      classificationKind: 'expense',
      classificationSource: 'provider',
    });
    expect(result.ownerTransaction?.subscriptionId).toBeUndefined();
  });

  test('normalizes convert inputs and createSubscription name/date', async () => {
    const t = createTest();
    const userId = 'user_subscription_normalize';
    await seedAuthKitUser(t, userId);

    const transactionId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const accountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'normalize_main',
        name: 'Main account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        providerTransactionId: 'normalize_netflix_2026_06',
        dedupeKey: 'normalize_netflix_2026_06',
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: -1599n,
          currency: 'EUR',
        },
        bookingDate: '2026-06-15',
        description: 'AcmeStreaming.example',
        counterpartyName: 'AcmeStreaming.example',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    const convertArgs = { transactionId, interval: 'month' as const, intervalCount: 1 };

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.subscriptions.convertTransactionToSubscription, {
        ...convertArgs,
        name: '   ',
      }),
    ).rejects.toThrow('Subscription name must contain 1 to 80 characters');

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.subscriptions.convertTransactionToSubscription, {
        ...convertArgs,
        name: 'x'.repeat(81),
      }),
    ).rejects.toThrow('Subscription name must contain 1 to 80 characters');

    for (const nextDueDate of ['not-a-date', '2026-13-01', '2026-02-30', '2026-6-15']) {
      await expect(
        t.withIdentity({ subject: userId }).mutation(api.subscriptions.convertTransactionToSubscription, {
          ...convertArgs,
          nextDueDate,
        }),
      ).rejects.toThrow();
    }

    const subscriptionId = await t.withIdentity({ subject: userId }).mutation(
      api.subscriptions.convertTransactionToSubscription,
      {
        ...convertArgs,
        name: '  Acme Streaming  ',
        nextDueDate: ' 2026-08-15 ',
      },
    );

    const subscription = await t.run(async (ctx) => await ctx.db.get('subscriptions', subscriptionId));
    expect(subscription).toMatchObject({ name: 'Acme Streaming', nextDueDate: '2026-08-15' });

    const createdId = await t.withIdentity({ subject: userId }).mutation(api.subscriptions.createSubscription, {
      name: '  Manual Sub  ',
      currency: 'EUR',
      interval: 'month',
      intervalCount: 1,
      startDate: '2026-06-15',
      nextDueDate: '2026-07-15',
      trialPeriodDays: 0,
    });
    const created = await t.run(async (ctx) => await ctx.db.get('subscriptions', createdId));
    expect(created?.name).toBe('Manual Sub');

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.subscriptions.createSubscription, {
        name: 'x'.repeat(81),
        currency: 'EUR',
        interval: 'month',
        intervalCount: 1,
        startDate: '2026-06-15',
        trialPeriodDays: 0,
      }),
    ).rejects.toThrow('Subscription name must contain 1 to 80 characters');

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.subscriptions.createSubscription, {
        name: 'Bad date sub',
        currency: 'EUR',
        interval: 'month',
        intervalCount: 1,
        startDate: '2026-02-30',
        trialPeriodDays: 0,
      }),
    ).rejects.toThrow();

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.subscriptions.updateSubscriptionAlias, {
        subscriptionId,
        alias: 'y'.repeat(81),
      }),
    ).rejects.toThrow('at most 80 characters');
  });
});
