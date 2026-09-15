/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, components } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './banking/*.ts', './lib/*.ts']);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;
type UserHarness = ReturnType<TestHarness['withIdentity']>;

async function seedAuthKitUser(t: TestHarness, userId: string) {
  const timestamp = '2026-07-01T00:00:00.000Z';
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
        firstName: 'Money',
        lastName: 'Box',
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

async function seedAccount(
  t: TestHarness,
  userId: string,
  name: string,
  options: { currency?: string; balanceMinor?: bigint } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    let connection = await ctx.db
      .query('providerConnections')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    if (!connection) {
      const connectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'manual',
        status: 'active',
        displayName: 'Manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      connection = await ctx.db.get('providerConnections', connectionId);
    }
    if (!connection) throw new Error('Provider connection setup failed');
    const currency = options.currency ?? 'EUR';
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId: connection._id,
      provider: 'manual',
      name,
      accountType: 'CACC',
      currency,
      status: 'active',
      syncEnabled: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('accountBalances', {
      userId,
      accountId,
      providerConnectionId: connection._id,
      provider: 'manual',
      balanceType: 'closingBooked',
      amount: { amountMinor: options.balanceMinor ?? 0n, currency },
      fetchedAtMs: now,
    });
    return accountId;
  });
}

async function seedPlan(
  t: TestHarness,
  userId: string,
  accountIds: Array<Id<'financialAccounts'>>,
  bucketNames = ['Holiday'],
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const planId = await ctx.db.insert('plans', {
      userId,
      name: 'Main plan',
      currency: 'EUR',
      startPeriod: '2026-06',
      accountIds,
      isDefault: true,
      sortOrder: 1000,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const groupId = await ctx.db.insert('planGroups', {
      planId,
      userId,
      name: 'Savings & goals',
      sortOrder: 1000,
      collapsed: false,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const bucketIds: Array<Id<'planBuckets'>> = [];
    for (const [index, name] of bucketNames.entries()) {
      bucketIds.push(
        await ctx.db.insert('planBuckets', {
          planId,
          userId,
          groupId,
          name,
          sortOrder: (index + 1) * 1000,
          hidden: false,
          isUnplanned: false,
          createdAtMs: now,
          updatedAtMs: now,
        }),
      );
    }
    await ctx.db.insert('planBuckets', {
      planId,
      userId,
      groupId,
      name: 'Unplanned',
      sortOrder: (bucketNames.length + 1) * 1000,
      hidden: false,
      isUnplanned: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { planId, bucketIds };
  });
}

async function seedTarget(
  t: TestHarness,
  userId: string,
  planId: Id<'plans'>,
  bucketId: Id<'planBuckets'>,
  amountMinor: bigint,
) {
  return await t.run((ctx) =>
    ctx.db.insert('planTargets', {
      planId,
      userId,
      bucketId,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor,
      currency: 'EUR',
      repeats: true,
      snoozedPeriods: [],
    }),
  );
}

async function seedMoneyBox(
  t: TestHarness,
  userId: string,
  accountId: Id<'financialAccounts'>,
  options: {
    name?: string;
    savedMinor?: bigint;
    currency?: string;
    status?: 'active' | 'completed' | 'archived';
  } = {},
) {
  return await t.run((ctx) => {
    const now = Date.now();
    const currency = options.currency ?? 'EUR';
    return ctx.db.insert('moneyBoxes', {
      userId,
      accountId,
      name: options.name ?? 'Holiday',
      targetAmount: { amountMinor: 100_000n, currency },
      savedAmount: { amountMinor: options.savedMinor ?? 20_000n, currency },
      targetDate: '2026-12-31',
      status: options.status ?? 'active',
      source: 'manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function linkDirectly(
  t: TestHarness,
  bucketId: Id<'planBuckets'>,
  moneyBoxId: Id<'moneyBoxes'>,
) {
  await t.run((ctx) => ctx.db.patch('planBuckets', bucketId, { moneyBoxId }));
}

async function planMonth(asUser: UserHarness, planId: Id<'plans'>, period: string) {
  return await asUser.query(api.banking.planRead.getPlanMonth, { planId, period });
}

function bucketFor(
  month: Awaited<ReturnType<typeof planMonth>>,
  bucketId: Id<'planBuckets'>,
) {
  const bucket = month.groups.flatMap((group) => group.buckets).find((candidate) => candidate.bucketId === bucketId);
  if (!bucket) throw new Error('Expected plan bucket');
  return bucket;
}

function expectClosedPanel(month: Awaited<ReturnType<typeof planMonth>>) {
  const breakdown = month.breakdown;
  expect(breakdown.unexplainedMinor).toBe(0n);
  expect(
    breakdown.carryFromPreviousMonthMinor +
      breakdown.incomeMinor +
      breakdown.liquidityFromCardMinor +
      breakdown.uncoveredCardSpendMinor +
      breakdown.unexplainedMinor +
      breakdown.internalMinor +
      breakdown.transferNetMinor -
      breakdown.assignedMinor +
      breakdown.cashOverspendingMinor +
      breakdown.moneyBoxReserveMinor,
  ).toBe(month.readyToAssignMinor);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('money boxes linked to plan buckets', () => {
  test('adds pre-funded money to the bucket and removes it from Ready to Assign', async () => {
    const t = createTest();
    const userId = 'prefunded_ready_to_assign_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking', { balanceMinor: 100_000n });
    const { planId, bucketIds } = await seedPlan(t, userId, [accountId]);
    const [bucketId] = bucketIds;
    await seedTarget(t, userId, planId, bucketId, 30_000n);
    const moneyBoxId = await seedMoneyBox(t, userId, accountId);
    await linkDirectly(t, bucketId, moneyBoxId);

    const month = await planMonth(t.withIdentity({ subject: userId }), planId, '2026-07');
    expect(bucketFor(month, bucketId)).toMatchObject({
      moneyBoxId,
      moneyBoxName: 'Holiday',
      moneyBoxPrefundedMinor: 20_000n,
      carryInMinor: 0n,
      assignedMinor: 0n,
      availableMinor: 20_000n,
      neededMinor: 30_000n,
      underfundedMinor: 10_000n,
    });
    expect(month.readyToAssignMinor).toBe(80_000n);
    expectClosedPanel(month);
  });

  test('does not carry the pre-funded component into three consecutive months', async () => {
    const t = createTest();
    const userId = 'prefunded_three_month_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking', { balanceMinor: 100_000n });
    const { planId, bucketIds } = await seedPlan(t, userId, [accountId]);
    const [bucketId] = bucketIds;
    const moneyBoxId = await seedMoneyBox(t, userId, accountId);
    await linkDirectly(t, bucketId, moneyBoxId);
    const asUser = t.withIdentity({ subject: userId });

    for (const period of ['2026-07', '2026-08', '2026-09']) {
      const month = await planMonth(asUser, planId, period);
      expect(bucketFor(month, bucketId)).toMatchObject({
        carryInMinor: 0n,
        moneyBoxPrefundedMinor: 20_000n,
        availableMinor: 20_000n,
      });
      expect(month.readyToAssignMinor).toBe(80_000n);
      expectClosedPanel(month);
    }
  });

  test('applies no present-day money-box stock to past months', async () => {
    const t = createTest();
    const userId = 'prefunded_past_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking', { balanceMinor: 100_000n });
    const { planId, bucketIds } = await seedPlan(t, userId, [accountId]);
    const [bucketId] = bucketIds;
    await seedTarget(t, userId, planId, bucketId, 30_000n);
    const moneyBoxId = await seedMoneyBox(t, userId, accountId);
    await linkDirectly(t, bucketId, moneyBoxId);

    const month = await planMonth(t.withIdentity({ subject: userId }), planId, '2026-06');
    expect(bucketFor(month, bucketId)).toMatchObject({
      moneyBoxId,
      moneyBoxPrefundedMinor: 0n,
      availableMinor: 0n,
      underfundedMinor: 30_000n,
    });
    expect(month.readyToAssignMinor).toBe(100_000n);
    expectClosedPanel(month);
  });

  test('ignores archived, foreign-currency, and out-of-perimeter money boxes', async () => {
    const t = createTest();
    const userId = 'prefunded_ineligible_user';
    await seedAuthKitUser(t, userId);
    const includedAccountId = await seedAccount(t, userId, 'Checking', { balanceMinor: 100_000n });
    const outsideAccountId = await seedAccount(t, userId, 'Outside');
    const { planId, bucketIds } = await seedPlan(t, userId, [includedAccountId], [
      'Archived',
      'Foreign currency',
      'Outside',
    ]);
    const archivedId = await seedMoneyBox(t, userId, includedAccountId, {
      name: 'Archived',
      status: 'archived',
    });
    const foreignCurrencyId = await seedMoneyBox(t, userId, includedAccountId, {
      name: 'Foreign currency',
      currency: 'USD',
    });
    const outsideId = await seedMoneyBox(t, userId, outsideAccountId, { name: 'Outside' });
    await Promise.all([
      linkDirectly(t, bucketIds[0], archivedId),
      linkDirectly(t, bucketIds[1], foreignCurrencyId),
      linkDirectly(t, bucketIds[2], outsideId),
    ]);

    const month = await planMonth(t.withIdentity({ subject: userId }), planId, '2026-07');
    for (const bucketId of bucketIds) {
      expect(bucketFor(month, bucketId).moneyBoxPrefundedMinor).toBe(0n);
    }
    expect(month.readyToAssignMinor).toBe(100_000n);
    expectClosedPanel(month);
  });

  test('Underfunded Auto-Assign does not fund a target already covered by its money box', async () => {
    const t = createTest();
    const userId = 'prefunded_auto_assign_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking', { balanceMinor: 100_000n });
    const { planId, bucketIds } = await seedPlan(t, userId, [accountId], ['Covered', 'Needs funding']);
    await Promise.all([
      seedTarget(t, userId, planId, bucketIds[0], 20_000n),
      seedTarget(t, userId, planId, bucketIds[1], 10_000n),
    ]);
    const moneyBoxId = await seedMoneyBox(t, userId, accountId, { name: 'Covered' });
    await linkDirectly(t, bucketIds[0], moneyBoxId);
    const asUser = t.withIdentity({ subject: userId });

    const preview = await asUser.mutation(api.banking.plan.autoAssign, {
      planId,
      period: '2026-07',
      strategy: 'underfunded',
      dryRun: true,
    });
    expect(preview.rows).toMatchObject([{ bucketId: bucketIds[1], amountMinor: 10_000n }]);
    const month = await planMonth(asUser, planId, '2026-07');
    expectClosedPanel(month);
  });

  test('linking and unlinking invalidate snapshots without deleting either side or assignments', async () => {
    const t = createTest();
    const userId = 'prefunded_unlink_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking', { balanceMinor: 100_000n });
    const { planId, bucketIds } = await seedPlan(t, userId, [accountId]);
    const [bucketId] = bucketIds;
    const targetId = await seedTarget(t, userId, planId, bucketId, 20_000n);
    const moneyBoxId = await seedMoneyBox(t, userId, accountId);
    const assignmentId = await t.run((ctx) =>
      ctx.db.insert('planAssignments', {
        planId,
        userId,
        bucketId,
        period: '2026-07',
        assignedMinor: 5_000n,
        currency: 'EUR',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }),
    );
    const seedSnapshot = () =>
      t.run((ctx) =>
        ctx.db.insert('planMonthSnapshots', {
          planId,
          userId,
          period: '2026-06',
          entries: [],
          computedAtMs: Date.now(),
        }),
      );
    const asUser = t.withIdentity({ subject: userId });

    const linkSnapshotId = await seedSnapshot();
    await asUser.mutation(api.banking.plan.setBucketMoneyBox, { bucketId, moneyBoxId });
    expect(await t.run((ctx) => ctx.db.get('planMonthSnapshots', linkSnapshotId))).toBeNull();

    const unlinkSnapshotId = await seedSnapshot();
    await asUser.mutation(api.banking.plan.setBucketMoneyBox, { bucketId });
    const stored = await t.run(async (ctx) => ({
      bucket: await ctx.db.get('planBuckets', bucketId),
      moneyBox: await ctx.db.get('moneyBoxes', moneyBoxId),
      assignment: await ctx.db.get('planAssignments', assignmentId),
      target: await ctx.db.get('planTargets', targetId),
      snapshot: await ctx.db.get('planMonthSnapshots', unlinkSnapshotId),
    }));
    expect(stored.bucket?.moneyBoxId).toBeUndefined();
    expect(stored.moneyBox?._id).toBe(moneyBoxId);
    expect(stored.assignment?._id).toBe(assignmentId);
    expect(stored.target?._id).toBe(targetId);
    expect(stored.snapshot).toBeNull();
    expectClosedPanel(await planMonth(asUser, planId, '2026-07'));
  });
});
