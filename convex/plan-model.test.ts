/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, components } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './migrations.ts', './banking/*.ts', './lib/*.ts']);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthKitUser(t: TestHarness, userId: string) {
  const timestamp = '2026-07-21T00:00:00.000Z';
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

async function setPlanTier(t: TestHarness, userId: string, planTier: 'free' | 'pro') {
  await t.run(async (ctx) => {
    const now = Date.now();
    const settings = await ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique();
    if (settings) {
      await ctx.db.patch('userSettings', settings._id, { planTier, planUpdatedAtMs: now, updatedAtMs: now });
    } else {
      await ctx.db.insert('userSettings', {
        userId,
        planTier,
        planUpdatedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
  });
}

async function seedCategory(
  t: TestHarness,
  userId: string,
  name: string,
  options: { budgetEligible?: boolean; systemKey?: string } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert('categories', {
      userId,
      name,
      systemKey: options.systemKey,
      kind: 'expense',
      applicableKinds: ['expense'],
      budgetEligible: options.budgetEligible ?? true,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedPlanAccount(
  t: TestHarness,
  userId: string,
  balanceMinor: bigint,
  overrides: {
    accountType?: string;
    currency?: string;
    status?: 'active' | 'paused' | 'reauthorizationRequired';
    name?: string;
    alias?: string;
    hidden?: boolean;
  } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'manual',
      status: 'active',
      displayName: 'Manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'manual',
      name: overrides.name ?? 'Current account',
      alias: overrides.alias,
      hidden: overrides.hidden,
      accountType: overrides.accountType ?? 'CACC',
      currency: overrides.currency ?? 'EUR',
      status: overrides.status ?? 'active',
      syncEnabled: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('accountBalances', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'manual',
      balanceType: 'closingBooked',
      amount: { amountMinor: balanceMinor, currency: overrides.currency ?? 'EUR' },
      fetchedAtMs: now,
    });
    return { accountId, providerConnectionId };
  });
}

async function createPlanFixture(
  t: TestHarness,
  userId: string,
  name = 'Main plan',
  accountIds: Array<Id<'financialAccounts'>> = [],
) {
  const asUser = t.withIdentity({ subject: userId });
  const { planId } = await asUser.mutation(api.banking.plan.createPlan, {
    name,
    currency: 'EUR',
    accountIds,
  });
  return { asUser, planId };
}

async function bucketRows(t: TestHarness, planId: Id<'plans'>) {
  return await t.run(async (ctx) =>
    ctx.db
      .query('planBuckets')
      .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
      .take(100),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('plan model', () => {
  test('bootstraps one bucket per eligible category plus Unplanned and is idempotent by name', async () => {
    const t = createTest();
    const userId = 'plan_bootstrap_user';
    await seedAuthKitUser(t, userId);
    await seedCategory(t, userId, 'Housing', { systemKey: 'expense:housing' });
    await seedCategory(t, userId, 'Groceries', { systemKey: 'expense:groceries' });
    await seedCategory(t, userId, 'Salary', { budgetEligible: false });
    const { asUser, planId } = await createPlanFixture(t, userId);
    const repeated = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Main plan',
      currency: 'EUR',
      accountIds: [],
    });

    const result = await t.run(async (ctx) => ({
      plan: await ctx.db.get('plans', planId),
      plans: await ctx.db
        .query('plans')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .take(10),
      groups: await ctx.db
        .query('planGroups')
        .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(20),
      buckets: await ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(20),
      mappings: await ctx.db
        .query('planBucketCategories')
        .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', planId))
        .take(20),
    }));

    expect(repeated).toEqual({ planId, keptAccountIds: [], droppedAccounts: [] });
    expect(result.plans).toHaveLength(1);
    expect(result.plan).toMatchObject({ currency: 'EUR', isDefault: true });
    expect(result.plan).not.toHaveProperty('openingCarryMinor');
    expect(result.groups).toHaveLength(9);
    expect(result.groups[0]).toMatchObject({ name: 'Card payments', sortOrder: 0 });
    expect(result.groups[1]).toMatchObject({ name: 'Instalments', sortOrder: 1000 });
    expect(result.buckets.filter((bucket) => !bucket.isUnplanned)).toHaveLength(2);
    expect(result.buckets.filter((bucket) => bucket.isUnplanned)).toHaveLength(1);
    expect(result.mappings).toHaveLength(2);
  });

  test('records today as the effective origin of a new plan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_start_date_user';
    await seedAuthKitUser(t, userId);
    const { planId } = await createPlanFixture(t, userId);

    expect(await t.run((ctx) => ctx.db.get('plans', planId))).toMatchObject({
      startPeriod: '2026-07',
      startDate: '2026-07-24',
    });
  });

  test('restarts from today without changing buckets, targets, or assignments and schedules reconstruction', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_restart_origin_user';
    await seedAuthKitUser(t, userId);
    await seedCategory(t, userId, 'Groceries');
    const { accountId } = await seedPlanAccount(t, userId, 100_000n);
    const { asUser, planId } = await createPlanFixture(t, userId, 'Main plan', [accountId]);
    const bucket = (await bucketRows(t, planId)).find((candidate) => !candidate.isUnplanned)!;
    await t.run((ctx) =>
      ctx.db.patch('plans', planId, {
        startPeriod: '2026-05',
        startDate: '2026-05-01',
      }),
    );
    await asUser.mutation(api.banking.plan.setAssigned, {
      planId,
      bucketId: bucket._id,
      period: '2026-07',
      amountMinor: 12_345n,
    });
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: bucket._id,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 20_000n,
      repeats: true,
    });
    const snapshotId = await t.run((ctx) =>
      ctx.db.insert('planMonthSnapshots', {
        planId,
        userId,
        period: '2026-05',
        entries: [],
        computedAtMs: Date.now(),
      }),
    );
    const before = await t.run(async (ctx) => ({
      groups: await ctx.db
        .query('planGroups')
        .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(100),
      buckets: await ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(100),
      assignments: await ctx.db
        .query('planAssignments')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
        .take(100),
      targets: await ctx.db
        .query('planTargets')
        .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', planId))
        .take(100),
      scheduledIds: (await ctx.db.system.query('_scheduled_functions').collect()).map((job) => job._id),
    }));

    const result = await asUser.mutation(api.banking.plan.restartPlanFromToday, { planId });
    const scheduledIds = new Set(before.scheduledIds);
    const after = await t.run(async (ctx) => ({
      plan: await ctx.db.get('plans', planId),
      snapshot: await ctx.db.get('planMonthSnapshots', snapshotId),
      groups: await ctx.db
        .query('planGroups')
        .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(100),
      buckets: await ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(100),
      assignments: await ctx.db
        .query('planAssignments')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
        .take(100),
      targets: await ctx.db
        .query('planTargets')
        .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', planId))
        .take(100),
      newJobs: (await ctx.db.system.query('_scheduled_functions').collect()).filter(
        (job) => !scheduledIds.has(job._id),
      ),
    }));

    expect(result).toEqual({
      planId,
      startDate: '2026-07-24',
      startPeriod: '2026-07',
      deletedSnapshots: 1,
    });
    expect(after.plan).toMatchObject({ startDate: '2026-07-24', startPeriod: '2026-07' });
    expect(after.snapshot).toBeNull();
    expect(after.groups).toEqual(before.groups);
    expect(after.buckets).toEqual(before.buckets);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.targets).toEqual(before.targets);
    expect(after.newJobs).toHaveLength(1);
    expect(JSON.stringify(after.newJobs[0].args)).toContain(planId);

    // A plan's real origin is the day it was created, which is rarely the day the user gets round
    // to correcting it, so the date can be named instead of assumed to be today.
    const named = await asUser.mutation(api.banking.plan.restartPlanFromToday, {
      planId,
      startDate: '2026-07-21',
    });
    expect(named).toMatchObject({ startDate: '2026-07-21', startPeriod: '2026-07' });
    await expect(
      asUser.mutation(api.banking.plan.restartPlanFromToday, { planId, startDate: '2026-13-01' }),
    ).rejects.toThrow('Start date must use YYYY-MM-DD format');
    await expect(
      asUser.mutation(api.banking.plan.restartPlanFromToday, { planId, startDate: '2026-08-01' }),
    ).rejects.toThrow('A plan cannot start in the future');
  });

  test('adds a newly created category to the active plan and keeps its activity out of Unplanned', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_new_category_user';
    await seedAuthKitUser(t, userId);
    const account = await seedPlanAccount(t, userId, 7_500n);
    const { asUser, planId } = await createPlanFixture(t, userId, 'Main plan', [account.accountId]);

    const categoryId = await asUser.mutation(api.banking.categories.createCategory, {
      name: 'Pet care',
      kind: 'expense',
      applicableKinds: ['expense'],
      color: '#7c3aed',
      icon: 'paw-print',
      budgetEligible: true,
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('transactions', {
        userId,
        accountId: account.accountId,
        providerConnectionId: account.providerConnectionId,
        provider: 'manual',
        dedupeKey: 'pet-care-expense',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 2_500n, currency: 'EUR' },
        bookingDate: '2026-07-23',
        description: 'Vet visit',
        classificationKind: 'expense',
        classificationSource: 'user',
        categoryId,
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const bucket = month.groups.flatMap((group) => group.buckets).find((candidate) => candidate.name === 'Pet care');
    const group = month.groups.find((candidate) => candidate.buckets.some((included) => included.name === 'Pet care'));

    expect(group?.name).toBe('Other');
    expect(bucket).toMatchObject({
      name: 'Pet care',
      categoryIds: [categoryId],
      activityMinor: -2_500n,
      availableMinor: -2_500n,
    });
    expect(month.unplanned.categoryIds).toEqual([]);
    expect(month.unplanned.activityMinor).toBe(0n);
  });

  test('creates a category without a plan and does not create plan rows', async () => {
    const t = createTest();
    const userId = 'plan_new_category_without_plan_user';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const categoryId = await asUser.mutation(api.banking.categories.createCategory, {
      name: 'Pet care',
      kind: 'expense',
      budgetEligible: true,
    });

    const result = await t.run(async (ctx) => ({
      category: await ctx.db.get('categories', categoryId),
      buckets: await ctx.db
        .query('planBuckets')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .take(10),
      mappings: await ctx.db
        .query('planBucketCategories')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .take(10),
    }));

    expect(result.category).toMatchObject({ name: 'Pet care', budgetEligible: true });
    expect(result.buckets).toEqual([]);
    expect(result.mappings).toEqual([]);
  });

  test('ensures a plan bucket for a category idempotently', async () => {
    const t = createTest();
    const userId = 'plan_new_category_idempotent_user';
    await seedAuthKitUser(t, userId);
    const { asUser, planId } = await createPlanFixture(t, userId);
    const categoryId = await asUser.mutation(api.banking.categories.createCategory, {
      name: 'Pet care',
      kind: 'expense',
      budgetEligible: true,
    });

    const { ensurePlanBucketForCategory } = await import('./banking/plan');
    const ensured = await t.run(async (ctx) => {
      const category = await ctx.db.get('categories', categoryId);
      if (!category) throw new Error('Category not found');
      const first = await ensurePlanBucketForCategory(ctx, userId, category);
      const second = await ensurePlanBucketForCategory(ctx, userId, category);
      return { first, second };
    });
    const result = await t.run(async (ctx) => ({
      buckets: await ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(10),
      mappings: await ctx.db
        .query('planBucketCategories')
        .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', planId).eq('categoryId', categoryId))
        .take(10),
    }));

    expect(ensured.first).toBe(ensured.second);
    expect(result.buckets.map((bucket) => bucket.name).sort()).toEqual(['Pet care', 'Unplanned']);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({ bucketId: ensured.first, categoryId });
  });

  test('does not add a non-budget-eligible category to the active plan', async () => {
    const t = createTest();
    const userId = 'plan_new_ineligible_category_user';
    await seedAuthKitUser(t, userId);
    const { asUser, planId } = await createPlanFixture(t, userId);

    const categoryId = await asUser.mutation(api.banking.categories.createCategory, {
      name: 'Salary adjustment',
      kind: 'income',
      budgetEligible: false,
    });
    const result = await t.run(async (ctx) => ({
      buckets: await ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(10),
      mapping: await ctx.db
        .query('planBucketCategories')
        .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', planId).eq('categoryId', categoryId))
        .unique(),
    }));

    expect(result.buckets.map((bucket) => bucket.name)).toEqual(['Unplanned']);
    expect(result.mapping).toBeNull();
  });

  test('allows the first plan on free and requires Pro for additional plans', async () => {
    const t = createTest();
    const userId = 'plan_tier_user';
    await seedAuthKitUser(t, userId);
    await setPlanTier(t, userId, 'free');
    const asUser = t.withIdentity({ subject: userId });

    const first = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Main plan',
      currency: 'EUR',
      accountIds: [],
    });
    await expect(
      asUser.mutation(api.banking.plan.createPlan, {
        name: 'Free extra',
        currency: 'EUR',
        accountIds: [],
      }),
    ).rejects.toThrow('Multiple plans require the Pro tier');

    await setPlanTier(t, userId, 'pro');
    const second = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Pro extra',
      currency: 'EUR',
      accountIds: [],
    });
    const plans = await t.run(async (ctx) =>
      ctx.db
        .query('plans')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .take(10),
    );

    expect(second.planId).not.toBe(first.planId);
    expect(plans.map((plan) => plan._id)).toEqual(expect.arrayContaining([first.planId, second.planId]));
    expect(plans).toHaveLength(2);
  });

  test('moves a category between buckets without duplicating its plan mapping', async () => {
    const t = createTest();
    const userId = 'plan_partition_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries', { systemKey: 'expense:groceries' });
    const { asUser, planId } = await createPlanFixture(t, userId);
    const groups = await t.run(async (ctx) =>
      ctx.db
        .query('planGroups')
        .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(20),
    );
    const targetBucketId = await asUser.mutation(api.banking.plan.createBucket, {
      planId,
      groupId: groups.find((group) => group.name !== 'Card payments' && group.name !== 'Instalments')!._id,
      name: 'Food together',
    });
    const createdCategoryMapping = await t.run(async (ctx) =>
      ctx.db
        .query('planBucketCategories')
        .withIndex('by_bucketId', (q) => q.eq('bucketId', targetBucketId))
        .unique(),
    );

    await asUser.mutation(api.banking.plan.mapCategoriesToBucket, {
      bucketId: targetBucketId,
      categoryIds: [groceriesId],
    });

    const result = await t.run(async (ctx) => ({
      groceriesMappings: await ctx.db
        .query('planBucketCategories')
        .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', planId).eq('categoryId', groceriesId))
        .take(10),
      createdCategoryMapping: createdCategoryMapping
        ? await ctx.db.get('planBucketCategories', createdCategoryMapping._id)
        : null,
      unplanned: (
        await ctx.db
          .query('planBuckets')
          .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
          .take(100)
      ).find((bucket) => bucket.isUnplanned),
    }));

    expect(result.groceriesMappings).toHaveLength(1);
    expect(result.groceriesMappings[0]?.bucketId).toBe(targetBucketId);
    expect(result.createdCategoryMapping?.bucketId).toBe(result.unplanned?._id);
  });

  test('adds a category to an existing bucket without removing its current categories', async () => {
    const t = createTest();
    const userId = 'plan_add_to_bucket_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries', { systemKey: 'expense:groceries' });
    const { asUser, planId } = await createPlanFixture(t, userId);
    const petCareId = await seedCategory(t, userId, 'Pet care');
    const groceriesMapping = await t.run(async (ctx) =>
      ctx.db
        .query('planBucketCategories')
        .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', planId).eq('categoryId', groceriesId))
        .unique(),
    );
    if (!groceriesMapping) throw new Error('Groceries mapping not found');

    await asUser.mutation(api.banking.plan.mapCategoriesToBucket, {
      bucketId: groceriesMapping.bucketId,
      categoryIds: [groceriesId, petCareId],
    });

    const mappings = await t.run(async (ctx) =>
      ctx.db
        .query('planBucketCategories')
        .withIndex('by_bucketId', (q) => q.eq('bucketId', groceriesMapping.bucketId))
        .take(10),
    );
    expect(mappings.map((mapping) => mapping.categoryId).sort()).toEqual([groceriesId, petCareId].sort());
    expect(mappings).toHaveLength(2);
  });

  test('moves buckets to the fallback group when deleting their group', async () => {
    const t = createTest();
    const userId = 'plan_delete_group_user';
    await seedAuthKitUser(t, userId);
    const { asUser, planId } = await createPlanFixture(t, userId);
    const sourceGroupId = await asUser.mutation(api.banking.plan.createGroup, { planId, name: 'Temporary' });
    const firstBucketId = await asUser.mutation(api.banking.plan.createBucket, {
      planId,
      groupId: sourceGroupId,
      name: 'First moved',
    });
    const secondBucketId = await asUser.mutation(api.banking.plan.createBucket, {
      planId,
      groupId: sourceGroupId,
      name: 'Second moved',
    });
    const fallback = await t.run(async (ctx) =>
      (
        await ctx.db
          .query('planGroups')
          .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', planId))
          .take(20)
      ).find((group) => group.name === 'Other'),
    );
    if (!fallback) throw new Error('Fallback group not found');

    await asUser.mutation(api.banking.plan.deleteGroup, { groupId: sourceGroupId });

    const result = await t.run(async (ctx) => ({
      deletedGroup: await ctx.db.get('planGroups', sourceGroupId),
      movedBuckets: await Promise.all([
        ctx.db.get('planBuckets', firstBucketId),
        ctx.db.get('planBuckets', secondBucketId),
      ]),
    }));
    expect(result.deletedGroup).toBeNull();
    expect(result.movedBuckets).toMatchObject([
      { _id: firstBucketId, groupId: fallback._id },
      { _id: secondBucketId, groupId: fallback._id },
    ]);
  });

  test('returns mapped categories to Unplanned when deleting a bucket', async () => {
    const t = createTest();
    const userId = 'plan_delete_bucket_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const { asUser, planId } = await createPlanFixture(t, userId);
    const buckets = await bucketRows(t, planId);
    const categoryBucket = buckets.find((bucket) => !bucket.isUnplanned)!;
    const unplanned = buckets.find((bucket) => bucket.isUnplanned)!;
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: categoryBucket._id,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 10_000n,
      repeats: true,
    });

    await asUser.mutation(api.banking.plan.deleteBucket, { bucketId: categoryBucket._id });

    const result = await t.run(async (ctx) => ({
      deletedBucket: await ctx.db.get('planBuckets', categoryBucket._id),
      mapping: await ctx.db
        .query('planBucketCategories')
        .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', planId).eq('categoryId', categoryId))
        .unique(),
      target: await ctx.db
        .query('planTargets')
        .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', planId).eq('bucketId', categoryBucket._id))
        .unique(),
    }));
    expect(result.deletedBucket).toBeNull();
    expect(result.mapping?.bucketId).toBe(unplanned._id);
    expect(result.target).toBeNull();
  });

  test('renormalizes group and bucket order in steps of 1000', async () => {
    const t = createTest();
    const userId = 'plan_reorder_user';
    await seedAuthKitUser(t, userId);
    await seedCategory(t, userId, 'One');
    await seedCategory(t, userId, 'Two');
    const { asUser, planId } = await createPlanFixture(t, userId);
    const targetGroupId = await asUser.mutation(api.banking.plan.createGroup, { planId, name: 'Moved' });
    const groups = await t.run(async (ctx) =>
      ctx.db
        .query('planGroups')
        .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(20),
    );
    const normalBuckets = (await bucketRows(t, planId)).filter((bucket) => !bucket.isUnplanned);
    const cardPaymentsGroup = groups.find((group) => group.name === 'Card payments')!;
    const installmentsGroup = groups.find((group) => group.name === 'Instalments')!;
    const reversedGroups = [...groups].reverse();
    const expectedGroupOrder = [
      cardPaymentsGroup,
      installmentsGroup,
      ...reversedGroups.filter((group) => group._id !== cardPaymentsGroup._id && group._id !== installmentsGroup._id),
    ];

    await asUser.mutation(api.banking.plan.reorderPlan, {
      groups: reversedGroups.map((group, index) => ({ id: group._id, sortOrder: index })),
      buckets: [
        { id: normalBuckets[1]._id, groupId: targetGroupId, sortOrder: 10 },
        { id: normalBuckets[0]._id, groupId: targetGroupId, sortOrder: 20 },
      ],
    });

    const reordered = await t.run(async (ctx) => ({
      groups: await ctx.db
        .query('planGroups')
        .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(20),
      buckets: await ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId).eq('groupId', targetGroupId))
        .take(20),
    }));

    expect(reordered.groups.map((group) => group._id)).toEqual(expectedGroupOrder.map((group) => group._id));
    expect(reordered.groups.map((group) => group.sortOrder)).toEqual(
      expectedGroupOrder.map((_, index) => index * 1000),
    );
    expect(reordered.buckets.map((bucket) => bucket._id)).toEqual([normalBuckets[1]._id, normalBuckets[0]._id]);
    expect(reordered.buckets.map((bucket) => bucket.sortOrder)).toEqual([1000, 2000]);
  });

  test('upserts assignments and deletes the row when assigned becomes zero', async () => {
    const t = createTest();
    const userId = 'plan_assignment_user';
    await seedAuthKitUser(t, userId);
    await seedCategory(t, userId, 'Groceries');
    const { asUser, planId } = await createPlanFixture(t, userId);
    const bucket = (await bucketRows(t, planId)).find((candidate) => !candidate.isUnplanned)!;

    const firstId = await asUser.mutation(api.banking.plan.setAssigned, {
      planId,
      bucketId: bucket._id,
      period: '2026-07',
      amountMinor: 40_000n,
    });
    const secondId = await asUser.mutation(api.banking.plan.setAssigned, {
      planId,
      bucketId: bucket._id,
      period: '2026-07',
      amountMinor: -5_000n,
    });
    const updated = await t.run(async (ctx) =>
      ctx.db
        .query('planAssignments')
        .withIndex('by_planId_and_period_and_bucketId', (q) =>
          q.eq('planId', planId).eq('period', '2026-07').eq('bucketId', bucket._id),
        )
        .unique(),
    );
    await asUser.mutation(api.banking.plan.setAssigned, {
      planId,
      bucketId: bucket._id,
      period: '2026-07',
      amountMinor: 0n,
    });
    const deleted = await t.run(async (ctx) =>
      ctx.db
        .query('planAssignments')
        .withIndex('by_planId_and_period_and_bucketId', (q) =>
          q.eq('planId', planId).eq('period', '2026-07').eq('bucketId', bucket._id),
        )
        .unique(),
    );

    expect(secondId).toBe(firstId);
    expect(updated).toMatchObject({ assignedMinor: -5_000n, currency: 'EUR' });
    expect(deleted).toBeNull();
  });

  test('upserts, snoozes, validates, and clears one target per bucket', async () => {
    const t = createTest();
    const userId = 'plan_target_user';
    await seedAuthKitUser(t, userId);
    await seedCategory(t, userId, 'Holiday');
    const { asUser, planId } = await createPlanFixture(t, userId);
    const bucket = (await bucketRows(t, planId)).find((candidate) => !candidate.isUnplanned)!;

    const targetId = await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: bucket._id,
      cadence: 'custom',
      behaviour: 'balanceBy',
      amountMinor: 120_000n,
      dueDate: '2026-12-15',
      repeats: false,
    });
    const updatedId = await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: bucket._id,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 10_000n,
      dayOfMonth: 28,
      repeats: true,
    });
    await asUser.mutation(api.banking.plan.snoozeTarget, {
      bucketId: bucket._id,
      period: '2026-07',
      snoozed: true,
    });
    const stored = await t.run(async (ctx) =>
      ctx.db
        .query('planTargets')
        .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', planId).eq('bucketId', bucket._id))
        .unique(),
    );

    expect(updatedId).toBe(targetId);
    expect(stored).toMatchObject({
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 10_000n,
      currency: 'EUR',
      snoozedPeriods: ['2026-07'],
    });
    await expect(
      asUser.mutation(api.banking.plan.setTarget, {
        bucketId: bucket._id,
        cadence: 'monthly',
        behaviour: 'balanceBy',
        amountMinor: 10_000n,
        repeats: false,
      }),
    ).rejects.toThrow('Balance-by targets must use custom cadence and cannot repeat');

    await asUser.mutation(api.banking.plan.clearTarget, { bucketId: bucket._id });
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('planTargets')
          .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', planId).eq('bucketId', bucket._id))
          .unique(),
      ),
    ).toBeNull();
  });

  test('stores and validates an optional custom target repeat interval', async () => {
    const t = createTest();
    const userId = 'plan_target_repeat_interval_user';
    await seedAuthKitUser(t, userId);
    await seedCategory(t, userId, 'Insurance');
    const { asUser, planId } = await createPlanFixture(t, userId);
    const bucket = (await bucketRows(t, planId)).find((candidate) => !candidate.isUnplanned)!;

    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: bucket._id,
      cadence: 'custom',
      behaviour: 'refill',
      amountMinor: 60_000n,
      dueDate: '2026-12-15',
      repeats: true,
      repeatIntervalCount: 6,
      repeatIntervalUnit: 'month',
    });
    const stored = await t.run(async (ctx) =>
      ctx.db
        .query('planTargets')
        .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', planId).eq('bucketId', bucket._id))
        .unique(),
    );

    expect(stored).toMatchObject({
      repeatIntervalCount: 6,
      repeatIntervalUnit: 'month',
    });
    await expect(
      asUser.mutation(api.banking.plan.setTarget, {
        bucketId: bucket._id,
        cadence: 'custom',
        behaviour: 'refill',
        amountMinor: 60_000n,
        dueDate: '2026-12-15',
        repeats: true,
        repeatIntervalCount: 0,
        repeatIntervalUnit: 'month',
      }),
    ).rejects.toThrow('Custom target repeat interval requires a positive integer on a repeating custom target');
  });

  test('moves money atomically between assignment rows', async () => {
    const t = createTest();
    const userId = 'plan_move_money_user';
    await seedAuthKitUser(t, userId);
    await seedCategory(t, userId, 'One');
    await seedCategory(t, userId, 'Two');
    const { asUser, planId } = await createPlanFixture(t, userId);
    const buckets = (await bucketRows(t, planId)).filter((bucket) => !bucket.isUnplanned);
    await asUser.mutation(api.banking.plan.setAssigned, {
      planId,
      bucketId: buckets[0]._id,
      period: '2026-07',
      amountMinor: 1_000n,
    });
    await asUser.mutation(api.banking.plan.setAssigned, {
      planId,
      bucketId: buckets[1]._id,
      period: '2026-07',
      amountMinor: 200n,
    });

    await asUser.mutation(api.banking.plan.moveMoney, {
      planId,
      period: '2026-07',
      fromBucketId: buckets[0]._id,
      toBucketId: buckets[1]._id,
      amountMinor: 300n,
    });
    await setPlanTier(t, userId, 'pro');
    const { planId: otherPlanId } = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Other plan',
      currency: 'EUR',
      accountIds: [],
    });
    const otherBucket = (await bucketRows(t, otherPlanId)).find((bucket) => !bucket.isUnplanned)!;
    await expect(
      asUser.mutation(api.banking.plan.moveMoney, {
        planId,
        period: '2026-07',
        fromBucketId: buckets[0]._id,
        toBucketId: otherBucket._id,
        amountMinor: 100n,
      }),
    ).rejects.toThrow('Plan bucket not found');

    const assignments = await t.run(async (ctx) =>
      ctx.db
        .query('planAssignments')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId).eq('period', '2026-07'))
        .take(10),
    );
    expect(assignments.find((row) => row.bucketId === buckets[0]._id)?.assignedMinor).toBe(700n);
    expect(assignments.find((row) => row.bucketId === buckets[1]._id)?.assignedMinor).toBe(500n);
  });

  test('deletes a plan and all of its children in scheduled batches', async () => {
    const t = createTest();
    const userId = 'plan_delete_user';
    await seedAuthKitUser(t, userId);
    await seedCategory(t, userId, 'Groceries');
    const { asUser, planId } = await createPlanFixture(t, userId);
    const bucket = (await bucketRows(t, planId)).find((candidate) => !candidate.isUnplanned)!;
    await asUser.mutation(api.banking.plan.setAssigned, {
      planId,
      bucketId: bucket._id,
      period: '2026-07',
      amountMinor: 10_000n,
    });
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: bucket._id,
      cadence: 'monthly',
      behaviour: 'refill',
      amountMinor: 15_000n,
      repeats: true,
    });

    vi.useFakeTimers();
    await asUser.mutation(api.banking.plan.deletePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const remaining = await t.run(async (ctx) => ({
      plan: await ctx.db.get('plans', planId),
      groups: await ctx.db
        .query('planGroups')
        .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(10),
      buckets: await ctx.db
        .query('planBuckets')
        .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
        .take(10),
      mappings: await ctx.db
        .query('planBucketCategories')
        .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', planId))
        .take(10),
      assignments: await ctx.db
        .query('planAssignments')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
        .take(10),
      targets: await ctx.db
        .query('planTargets')
        .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', planId))
        .take(10),
    }));
    expect(remaining).toEqual({ plan: null, groups: [], buckets: [], mappings: [], assignments: [], targets: [] });
  });

  test('archives categories out of the default picker while keeping them readable', async () => {
    const t = createTest();
    const userId = 'plan_archive_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Unused category');
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.banking.plan.archiveCategory, { categoryId, archived: true });

    const visible = await asUser.query(api.banking.categories.listCategories, {});
    const includingArchived = await asUser.query(api.banking.categories.listCategories, { includeArchived: true });
    const stored = await t.run(async (ctx) => ctx.db.get('categories', categoryId));
    expect(visible.map((category) => category._id)).not.toContain(categoryId);
    expect(includingArchived.map((category) => category._id)).toContain(categoryId);
    expect(stored).toMatchObject({ _id: categoryId, archived: true });
  });

  test('changes the accounts a plan covers after it was created', async () => {
    const t = createTest();
    const userId = 'plan_accounts_user';
    await seedAuthKitUser(t, userId);
    const cash = await seedPlanAccount(t, userId, 100_00n);
    const savings = await seedPlanAccount(t, userId, 50_00n, { accountType: 'SVGS' });
    const { asUser, planId } = await createPlanFixture(t, userId, 'Main plan', [cash.accountId]);

    const result = await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [cash.accountId, savings.accountId],
    });

    expect(result.droppedAccounts).toEqual([]);
    expect(result.accountIds).toEqual([cash.accountId, savings.accountId]);
    const plan = await t.run(async (ctx) => ctx.db.get('plans', planId));
    expect(plan?.accountIds).toEqual([cash.accountId, savings.accountId]);
  });

  test('reconciles card payment buckets when the plan perimeter changes', async () => {
    const t = createTest();
    const userId = 'plan_card_perimeter_user';
    await seedAuthKitUser(t, userId);
    const cash = await seedPlanAccount(t, userId, 100_00n);
    const card = await seedPlanAccount(t, userId, -25_00n, {
      accountType: 'CARD',
      name: 'Provider card',
      alias: 'Daily card',
    });
    const { asUser, planId } = await createPlanFixture(t, userId, 'Main plan', [cash.accountId]);

    await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [cash.accountId, card.accountId],
    });
    const addedBuckets = await bucketRows(t, planId);
    const cardBucket = addedBuckets.find((bucket) => bucket.cardAccountId === card.accountId);
    expect(cardBucket).toMatchObject({ name: 'Daily card', hidden: false, isUnplanned: false });
    const cardGroup = await t.run(async (ctx) => ctx.db.get('planGroups', cardBucket!.groupId));
    expect(cardGroup).toMatchObject({ name: 'Card payments', sortOrder: 0 });

    const assignmentId = await asUser.mutation(api.banking.plan.setAssigned, {
      planId,
      bucketId: cardBucket!._id,
      period: '2026-07',
      amountMinor: 10_00n,
    });
    await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [cash.accountId],
    });

    const removed = await t.run(async (ctx) => {
      const bucket = await ctx.db.get('planBuckets', cardBucket!._id);
      return {
        bucket,
        assignment: await ctx.db.get('planAssignments', assignmentId!),
        group: bucket ? await ctx.db.get('planGroups', bucket.groupId) : null,
      };
    });
    expect(removed.bucket).toMatchObject({ _id: cardBucket!._id, name: 'Daily card' });
    expect(removed.bucket).not.toHaveProperty('cardAccountId');
    expect(removed.assignment).toMatchObject({ _id: assignmentId, bucketId: cardBucket!._id, assignedMinor: 10_00n });
    expect(removed.group?.name).not.toBe('Card payments');
  });

  test('protects card payment buckets as system buckets', async () => {
    const t = createTest();
    const userId = 'plan_card_system_bucket_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const cash = await seedPlanAccount(t, userId, 100_00n);
    const card = await seedPlanAccount(t, userId, -25_00n, { accountType: 'CARD', name: 'Card' });
    const { asUser, planId } = await createPlanFixture(t, userId, 'Main plan', [cash.accountId, card.accountId]);
    const cardBucket = (await bucketRows(t, planId)).find((bucket) => bucket.cardAccountId === card.accountId)!;

    await expect(
      asUser.mutation(api.banking.plan.renameBucket, { bucketId: cardBucket._id, name: 'Renamed' }),
    ).rejects.toThrow('Card payment buckets cannot be renamed');
    await expect(
      asUser.mutation(api.banking.plan.hideBucket, { bucketId: cardBucket._id, hidden: true }),
    ).rejects.toThrow('Card payment buckets cannot be hidden');
    await expect(asUser.mutation(api.banking.plan.deleteBucket, { bucketId: cardBucket._id })).rejects.toThrow(
      'Card payment buckets cannot be deleted',
    );
    await expect(
      asUser.mutation(api.banking.plan.mapCategoriesToBucket, { bucketId: cardBucket._id, categoryIds: [categoryId] }),
    ).rejects.toThrow('Card payment buckets cannot map categories');
    const targetId = await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: cardBucket._id,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 10_00n,
      repeats: true,
    });
    expect(await t.run(async (ctx) => ctx.db.get('planTargets', targetId))).toMatchObject({
      bucketId: cardBucket._id,
      amountMinor: 10_00n,
    });
  });

  test('reports accounts a plan cannot cover instead of silently keeping them', async () => {
    const t = createTest();
    const userId = 'plan_accounts_dropped_user';
    await seedAuthKitUser(t, userId);
    const cash = await seedPlanAccount(t, userId, 100_00n);
    const foreign = await seedPlanAccount(t, userId, 100_00n, { currency: 'USD' });
    const paused = await seedPlanAccount(t, userId, 100_00n, { status: 'paused' });
    const investment = await seedPlanAccount(t, userId, 100_00n, { accountType: 'INVS' });
    const { asUser, planId } = await createPlanFixture(t, userId, 'Main plan', [cash.accountId]);

    const result = await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [cash.accountId, foreign.accountId, paused.accountId, investment.accountId],
    });

    expect(result.accountIds).toEqual([cash.accountId]);
    expect(result.droppedAccounts).toEqual([
      { accountId: foreign.accountId, reason: 'currencyMismatch' },
      { accountId: paused.accountId, reason: 'inactive' },
      { accountId: investment.accountId, reason: 'ineligibleType' },
    ]);
    const plan = await t.run(async (ctx) => ctx.db.get('plans', planId));
    expect(plan?.accountIds).toEqual([cash.accountId]);
  });

  test('drops hidden accounts from the plan perimeter', async () => {
    const t = createTest();
    const userId = 'plan_hidden_account_user';
    await seedAuthKitUser(t, userId);
    const cash = await seedPlanAccount(t, userId, 100_00n);
    const hidden = await seedPlanAccount(t, userId, 50_00n, { hidden: true, name: 'Hidden account' });
    const { asUser, planId } = await createPlanFixture(t, userId, 'Main plan', [cash.accountId]);

    const result = await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [cash.accountId, hidden.accountId],
    });

    expect(result.accountIds).toEqual([cash.accountId]);
    expect(result.droppedAccounts).toEqual([{ accountId: hidden.accountId, reason: 'hidden' }]);
  });

  test('lists a hidden plan member so it can be removed', async () => {
    const t = createTest();
    const userId = 'plan_hidden_member_user';
    await seedAuthKitUser(t, userId);
    const cash = await seedPlanAccount(t, userId, 100_00n, { name: 'Cash' });
    const hidden = await seedPlanAccount(t, userId, 50_00n, { name: 'Hidden member' });
    const { asUser, planId } = await createPlanFixture(t, userId, 'Main plan', [cash.accountId, hidden.accountId]);
    await t.run(async (ctx) => ctx.db.patch('financialAccounts', hidden.accountId, { hidden: true }));

    const options = await asUser.query(api.banking.accounts.listAccounts, {
      status: 'active',
      limit: 200,
      includeIds: [cash.accountId, hidden.accountId],
    });
    expect(options.find((account) => account._id === hidden.accountId)).toMatchObject({ hidden: true });

    const result = await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [cash.accountId],
    });
    expect(result.accountIds).toEqual([cash.accountId]);
    expect(await t.run(async (ctx) => ctx.db.get('plans', planId))).toMatchObject({ accountIds: [cash.accountId] });
  });

  test('keeps an existing paused or reauthorization-required account until the user removes it', async () => {
    const t = createTest();
    const userId = 'plan_frozen_member_user';
    await seedAuthKitUser(t, userId);
    const cash = await seedPlanAccount(t, userId, 100_00n, { name: 'Cash' });
    const frozen = await seedPlanAccount(t, userId, 50_00n, { name: 'Frozen provider account' });
    const { asUser, planId } = await createPlanFixture(t, userId, 'Main plan', [cash.accountId, frozen.accountId]);
    await t.run(async (ctx) =>
      ctx.db.patch('financialAccounts', frozen.accountId, { status: 'reauthorizationRequired', syncEnabled: false }),
    );

    const options = await asUser.query(api.banking.accounts.listAccounts, {
      status: 'active',
      limit: 200,
      includeIds: [cash.accountId, frozen.accountId],
    });
    expect(options.find((account) => account._id === frozen.accountId)).toMatchObject({
      status: 'reauthorizationRequired',
    });

    const result = await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [cash.accountId, frozen.accountId],
    });
    expect(result.accountIds).toEqual([cash.accountId, frozen.accountId]);
    expect(result.droppedAccounts).toEqual([]);
  });

  test('lists eligible accounts that are outside every plan', async () => {
    const t = createTest();
    const userId = 'plan_outside_accounts_user';
    await seedAuthKitUser(t, userId);
    const included = await seedPlanAccount(t, userId, 100_00n, { name: 'Included' });
    const outsideCash = await seedPlanAccount(t, userId, 50_00n, { name: 'Nicky Allowances' });
    const outsideCard = await seedPlanAccount(t, userId, -10_00n, { accountType: 'CARD', name: 'Outside card' });
    await seedPlanAccount(t, userId, 10_00n, { hidden: true, name: 'Hidden' });
    await seedPlanAccount(t, userId, 10_00n, { status: 'paused', name: 'Paused' });
    await seedPlanAccount(t, userId, 10_00n, { currency: 'USD', name: 'Dollars' });
    await seedPlanAccount(t, userId, 10_00n, { accountType: 'INVS', name: 'Investments' });
    const { asUser } = await createPlanFixture(t, userId, 'Main plan', [included.accountId]);

    const outside = await asUser.query(api.banking.accounts.listEligibleAccountsOutsidePlans, {});

    expect(outside.map((account) => account._id)).toEqual([outsideCash.accountId, outsideCard.accountId]);
  });

  test('refuses to leave a plan without any account and refuses accounts of other users', async () => {
    const t = createTest();
    const userId = 'plan_accounts_guard_user';
    const otherUserId = 'plan_accounts_other_user';
    await seedAuthKitUser(t, userId);
    await seedAuthKitUser(t, otherUserId);
    const cash = await seedPlanAccount(t, userId, 100_00n);
    const foreign = await seedPlanAccount(t, userId, 100_00n, { currency: 'USD' });
    const otherAccount = await seedPlanAccount(t, otherUserId, 100_00n);
    const { asUser, planId } = await createPlanFixture(t, userId, 'Main plan', [cash.accountId]);

    await expect(asUser.mutation(api.banking.plan.updatePlanAccounts, { planId, accountIds: [] })).rejects.toThrow(
      'A plan needs at least one account',
    );
    // Every requested account was dropped, which leaves the same empty perimeter.
    await expect(
      asUser.mutation(api.banking.plan.updatePlanAccounts, { planId, accountIds: [foreign.accountId] }),
    ).rejects.toThrow('A plan needs at least one account');
    await expect(
      asUser.mutation(api.banking.plan.updatePlanAccounts, { planId, accountIds: [otherAccount.accountId] }),
    ).rejects.toThrow('Account not found');

    const plan = await t.run(async (ctx) => ctx.db.get('plans', planId));
    expect(plan?.accountIds).toEqual([cash.accountId]);
  });
});
