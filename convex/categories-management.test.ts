/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, components } from './_generated/api';
import schema from './schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './banking/*.ts', './lib/*.ts']);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

async function seedAuthKitUser(t: ReturnType<typeof createTest>, userId: string) {
  const timestamp = '2026-07-17T00:00:00.000Z';
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

afterEach(() => {
  vi.useRealTimers();
});

describe('custom category management', () => {
  test('creates, lists, and updates a category with visual and compatibility fields', async () => {
    const t = createTest();
    const userId = 'category_editor_user';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const categoryId = await asUser.mutation(api.banking.categories.createCategory, {
      name: 'Side project',
      kind: 'income',
      applicableKinds: ['income', 'transfer'],
      color: '#7c3aed',
      icon: 'briefcase',
      budgetEligible: false,
    });

    await asUser.mutation(api.banking.categories.updateCategory, {
      categoryId,
      name: 'Studio work',
      kind: 'income',
      applicableKinds: ['expense', 'income', 'transfer'],
      color: '#0d9488',
      icon: 'wrench',
      budgetEligible: true,
    });

    const categories = await asUser.query(api.banking.categories.listCustomCategories, { limit: 20 });
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({
      name: 'Studio work',
      kind: 'income',
      applicableKinds: ['expense', 'income', 'transfer'],
      color: '#0d9488',
      icon: 'wrench',
      budgetEligible: true,
    });
    expect(categories[0]?.systemKey).toBeUndefined();
  });

  test('refuses to modify or delete system categories', async () => {
    const t = createTest();
    const userId = 'protected_category_user';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const categoryId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert('categories', {
        userId,
        name: 'Groceries',
        systemKey: 'expense:groceries',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(
      asUser.mutation(api.banking.categories.updateCategory, {
        categoryId,
        name: 'Changed',
        kind: 'expense',
      }),
    ).rejects.toThrow('System categories cannot be modified');
    await expect(asUser.mutation(api.banking.categories.deleteCategory, { categoryId })).rejects.toThrow(
      'System categories cannot be deleted',
    );
  });

  test('deletes a custom category after cleaning linked records and plan mappings', async () => {
    const t = createTest();
    const userId = 'category_cleanup_user';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const fixture = await t.run(async (ctx) => {
      const now = Date.now();
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const accountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'account',
        name: 'Account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const categoryId = await ctx.db.insert('categories', {
        userId,
        name: 'Temporary',
        kind: 'expense',
        applicableKinds: ['expense'],
        color: '#dc2626',
        icon: 'circle',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const transactionId = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: 'temporary',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 1000n, currency: 'EUR' },
        bookingDate: '2026-07-17',
        description: 'Temporary expense',
        classificationKind: 'expense',
        classificationSource: 'user',
        categoryId,
        importedAtMs: now,
        updatedAtMs: now,
      });
      const ruleId = await ctx.db.insert('categoryRules', {
        userId,
        matchField: 'description',
        matchType: 'contains',
        pattern: 'temporary',
        categoryId,
        enabled: true,
        priority: 100,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const planId = await ctx.db.insert('plans', {
        userId,
        name: 'Plan',
        currency: 'EUR',
        startPeriod: '2026-07',
        accountIds: [accountId],
        isDefault: true,
        sortOrder: 1000,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const groupId = await ctx.db.insert('planGroups', {
        planId,
        userId,
        name: 'Temporary group',
        sortOrder: 1000,
        collapsed: false,
        hidden: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const bucketId = await ctx.db.insert('planBuckets', {
        planId,
        userId,
        groupId,
        name: 'Temporary bucket',
        sortOrder: 1000,
        hidden: false,
        isUnplanned: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const mappingId = await ctx.db.insert('planBucketCategories', {
        planId,
        userId,
        bucketId,
        categoryId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { categoryId, transactionId, ruleId, bucketId, mappingId };
    });

    vi.useFakeTimers();
    await asUser.mutation(api.banking.categories.deleteCategory, { categoryId: fixture.categoryId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const cleaned = await t.run(async (ctx) => ({
      category: await ctx.db.get('categories', fixture.categoryId),
      transaction: await ctx.db.get('transactions', fixture.transactionId),
      rule: await ctx.db.get('categoryRules', fixture.ruleId),
      bucket: await ctx.db.get('planBuckets', fixture.bucketId),
      mapping: await ctx.db.get('planBucketCategories', fixture.mappingId),
    }));
    expect(cleaned.category).toBeNull();
    expect(cleaned.transaction?.categoryId).toBeUndefined();
    expect(cleaned.rule).toBeNull();
    expect(cleaned.mapping).toBeNull();
    expect(cleaned.bucket).toMatchObject({ name: 'Temporary bucket', isUnplanned: false });
  });
});

describe('category rule actions', () => {
  test('creates and updates owned tag actions with a 10-tag cap', async () => {
    const t = createTest();
    const userId = 'rule_action_user';
    const otherUserId = 'rule_action_other';
    await seedAuthKitUser(t, userId);
    await seedAuthKitUser(t, otherUserId);
    const asUser = t.withIdentity({ subject: userId });
    const fixture = await t.run(async (ctx) => {
      const now = Date.now();
      const categoryId = await ctx.db.insert('categories', {
        userId,
        name: 'Rule category',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const tagIds = await Promise.all(
        Array.from({ length: 11 }, (_, index) =>
          ctx.db.insert('transactionTags', {
            userId,
            name: `Tag ${index}`,
            createdAtMs: now,
            updatedAtMs: now,
          }),
        ),
      );
      const foreignTagId = await ctx.db.insert('transactionTags', {
        userId: otherUserId,
        name: 'Foreign',
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { categoryId, foreignTagId, tagIds };
    });

    const ruleId = await asUser.mutation(api.banking.categoryRules.createRule, {
      matchField: 'description',
      matchType: 'contains',
      pattern: ' market ',
      categoryId: fixture.categoryId,
      addTagIds: [fixture.tagIds[0], fixture.tagIds[0]],
      hideFromReports: true,
    });
    await asUser.mutation(api.banking.categoryRules.updateRule, {
      ruleId,
      addTagIds: [fixture.tagIds[1]],
      hideFromReports: false,
    });
    const rule = await t.run(async (ctx) => await ctx.db.get('categoryRules', ruleId));
    expect(rule).toMatchObject({
      pattern: 'market',
      addTagIds: [fixture.tagIds[1]],
      hideFromReports: false,
    });

    await expect(
      asUser.mutation(api.banking.categoryRules.updateRule, {
        ruleId,
        addTagIds: fixture.tagIds,
      }),
    ).rejects.toThrow('at most 10 tags');
    await expect(
      asUser.mutation(api.banking.categoryRules.updateRule, {
        ruleId,
        addTagIds: [fixture.foreignTagId],
      }),
    ).rejects.toThrow('Transaction tag not found');
  });
});
