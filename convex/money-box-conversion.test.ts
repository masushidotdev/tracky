/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, components, internal } from './_generated/api';
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
  const timestamp = '2026-08-01T00:00:00.000Z';
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

async function seedHostAccount(t: TestHarness, userId: string) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 7, 1, 12);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock bank',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: `${userId}_checking`,
      name: 'Checking',
      accountType: 'CACC',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { accountId, providerConnectionId };
  });
}

async function seedMoneyBox(
  t: TestHarness,
  args: {
    userId: string;
    accountId: Id<'financialAccounts'>;
    heldOutsideBalance?: boolean;
    savedMinor?: bigint;
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 7, 1, 12);
    return await ctx.db.insert('moneyBoxes', {
      userId: args.userId,
      accountId: args.accountId,
      name: 'Acme Pocket',
      targetAmount: { amountMinor: 20_000n, currency: 'EUR' },
      savedAmount: { amountMinor: args.savedMinor ?? 10_000n, currency: 'EUR' },
      targetDate: '2026-12-31',
      status: 'active',
      source: 'manual',
      heldOutsideBalance: args.heldOutsideBalance,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function latestBalanceMinor(t: TestHarness, accountId: Id<'financialAccounts'>) {
  return await t.run(async (ctx) => {
    const balances = await ctx.db
      .query('accountBalances')
      .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', accountId))
      .order('desc')
      .take(1);
    return balances[0]?.amount.amountMinor;
  });
}

describe('convertMoneyBoxToAccount', () => {
  test('refuses a box whose money is still included in the host account balance', async () => {
    const t = createTest();
    const userId = 'money_box_conversion_refusal_user';
    await seedAuthKitUser(t, userId);
    const host = await seedHostAccount(t, userId);
    const moneyBoxId = await seedMoneyBox(t, {
      userId,
      accountId: host.accountId,
      heldOutsideBalance: false,
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.convertMoneyBoxToAccount, {
        moneyBoxId,
        accountType: 'SVGS',
      }),
    ).rejects.toThrow('would count the same money twice');

    const stored = await t.run(async (ctx) => ({
      moneyBox: await ctx.db.get('moneyBoxes', moneyBoxId),
      manualAccounts: await ctx.db
        .query('financialAccounts')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .filter((q) => q.eq(q.field('provider'), 'manual'))
        .take(10),
    }));
    expect(stored.moneyBox).not.toBeNull();
    expect(stored.manualAccounts).toHaveLength(0);
  });

  test('moves linked activity, preserves the saved balance, and clears every money-box reference', async () => {
    const t = createTest();
    const userId = 'money_box_conversion_user';
    await seedAuthKitUser(t, userId);
    const host = await seedHostAccount(t, userId);
    const moneyBoxId = await seedMoneyBox(t, {
      userId,
      accountId: host.accountId,
      heldOutsideBalance: true,
      savedMinor: 26_223n,
    });

    const fixture = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 7, 1, 12);
      const outgoingTransactionId = await ctx.db.insert('transactions', {
        userId,
        accountId: host.accountId,
        providerConnectionId: host.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'pocket-contribution',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 4_000n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'Move to pocket',
        classificationKind: 'transfer',
        classificationSource: 'user',
        importedAtMs: now,
        updatedAtMs: now,
      });
      const incomingTransactionId = await ctx.db.insert('transactions', {
        userId,
        accountId: host.accountId,
        providerConnectionId: host.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'pocket-withdrawal',
        status: 'BOOK',
        direction: 'CRDT',
        amount: { amountMinor: 1_000n, currency: 'EUR' },
        bookingDate: '2026-07-15',
        description: 'Return from pocket',
        classificationKind: 'transfer',
        classificationSource: 'user',
        importedAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId,
        kind: 'contribution',
        amount: { amountMinor: 4_000n, currency: 'EUR' },
        contributionDate: '2026-07-10',
        source: 'transaction',
        transactionId: outgoingTransactionId,
        createdAtMs: now,
      });
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId,
        kind: 'withdrawal',
        amount: { amountMinor: 1_000n, currency: 'EUR' },
        contributionDate: '2026-07-15',
        source: 'transaction',
        transactionId: incomingTransactionId,
        createdAtMs: now,
      });
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId,
        kind: 'contribution',
        amount: { amountMinor: 23_223n, currency: 'EUR' },
        contributionDate: '2026-07-01',
        source: 'manual',
        createdAtMs: now,
      });

      const planId = await ctx.db.insert('plans', {
        userId,
        name: 'Main plan',
        currency: 'EUR',
        startPeriod: '2026-07',
        accountIds: [host.accountId],
        isDefault: true,
        sortOrder: 0,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const unrelatedAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId: host.providerConnectionId,
        provider: 'mock',
        providerAccountId: `${userId}_savings`,
        name: 'Separate savings',
        accountType: 'SVGS',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const unrelatedPlanId = await ctx.db.insert('plans', {
        userId,
        name: 'Separate plan',
        currency: 'EUR',
        startPeriod: '2026-07',
        accountIds: [unrelatedAccountId],
        isDefault: false,
        sortOrder: 1_000,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const otherCurrencyPlanId = await ctx.db.insert('plans', {
        userId,
        name: 'Dollar plan',
        currency: 'USD',
        startPeriod: '2026-07',
        accountIds: [host.accountId],
        isDefault: false,
        sortOrder: 2_000,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const groupId = await ctx.db.insert('planGroups', {
        planId,
        userId,
        name: 'Savings',
        sortOrder: 0,
        collapsed: false,
        hidden: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const bucketId = await ctx.db.insert('planBuckets', {
        planId,
        userId,
        groupId,
        name: 'Pocket reserve',
        sortOrder: 0,
        hidden: false,
        isUnplanned: false,
        moneyBoxId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('planBuckets', {
        planId,
        userId,
        groupId,
        name: 'Unplanned',
        sortOrder: 1_000,
        hidden: false,
        isUnplanned: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const plannedTransactionId = await ctx.db.insert('plannedTransactions', {
        userId,
        name: 'Pocket goal',
        amount: { amountMinor: 20_000n, currency: 'EUR' },
        dueDate: '2026-12-31',
        kind: 'expense',
        direction: 'outflow',
        status: 'funding',
        source: 'manual',
        moneyBoxId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const subscriptionId = await ctx.db.insert('subscriptions', {
        userId,
        name: 'Pocket subscription',
        amount: { amountMinor: 1_000n, currency: 'EUR' },
        interval: 'month',
        intervalCount: 1,
        status: 'active',
        startDate: '2026-07-01',
        trialPeriodDays: 0,
        source: 'manual',
        moneyBoxId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return {
        outgoingTransactionId,
        incomingTransactionId,
        planId,
        unrelatedAccountId,
        unrelatedPlanId,
        otherCurrencyPlanId,
        bucketId,
        plannedTransactionId,
        subscriptionId,
      };
    });

    const asUser = t.withIdentity({ subject: userId });
    const beforePlan = await asUser.query(api.banking.planRead.getPlanMonth, {
      planId: fixture.planId,
      period: '2026-07',
    });
    expect(beforePlan.liquidityMinor).toBe(26_223n);

    const result = await asUser.mutation(api.banking.planning.convertMoneyBoxToAccount, {
      moneyBoxId,
      accountType: 'SVGS',
      name: 'Pocket account',
    });
    const afterPlan = await asUser.query(api.banking.planRead.getPlanMonth, {
      planId: fixture.planId,
      period: '2026-07',
    });

    expect(result).toEqual({
      accountId: expect.any(String),
      planIdsAddedTo: [fixture.planId],
      legsCreated: 2,
      openingBalance: { amountMinor: 23_223n, currency: 'EUR' },
      referencesCleared: {
        moneyBoxContributions: 3,
        planBuckets: 1,
        plannedTransactions: 1,
        subscriptions: 1,
      },
    });
    expect(afterPlan.liquidityMinor).toBe(26_223n);
    expect(afterPlan.liquidityMinor).toBe(beforePlan.liquidityMinor);
    expect(await latestBalanceMinor(t, result.accountId)).toBe(26_223n);

    const stored = await t.run(async (ctx) => {
      const sourceOutgoing = await ctx.db.get('transactions', fixture.outgoingTransactionId);
      const sourceIncoming = await ctx.db.get('transactions', fixture.incomingTransactionId);
      const accountLegs = await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
          q.eq('userId', userId).eq('accountId', result.accountId),
        )
        .take(10);
      return {
        moneyBox: await ctx.db.get('moneyBoxes', moneyBoxId),
        contributions: await ctx.db
          .query('moneyBoxContributions')
          .withIndex('by_moneyBoxId_and_contributionDate', (q) => q.eq('moneyBoxId', moneyBoxId))
          .take(10),
        plan: await ctx.db.get('plans', fixture.planId),
        unrelatedPlan: await ctx.db.get('plans', fixture.unrelatedPlanId),
        otherCurrencyPlan: await ctx.db.get('plans', fixture.otherCurrencyPlanId),
        bucket: await ctx.db.get('planBuckets', fixture.bucketId),
        plannedTransaction: await ctx.db.get('plannedTransactions', fixture.plannedTransactionId),
        subscription: await ctx.db.get('subscriptions', fixture.subscriptionId),
        sourceOutgoing,
        sourceIncoming,
        accountLegs,
        outgoingMatch: sourceOutgoing?.transferMatchId
          ? await ctx.db.get('transferMatches', sourceOutgoing.transferMatchId)
          : null,
        incomingMatch: sourceIncoming?.transferMatchId
          ? await ctx.db.get('transferMatches', sourceIncoming.transferMatchId)
          : null,
      };
    });

    expect(stored.moneyBox).toBeNull();
    expect(stored.contributions).toHaveLength(0);
    expect(stored.plan?.accountIds).toEqual([host.accountId, result.accountId]);
    expect(stored.unrelatedPlan?.accountIds).toEqual([fixture.unrelatedAccountId]);
    expect(stored.otherCurrencyPlan?.accountIds).toEqual([host.accountId]);
    expect(stored.bucket?.moneyBoxId).toBeUndefined();
    expect(stored.plannedTransaction?.moneyBoxId).toBeUndefined();
    expect(stored.subscription?.moneyBoxId).toBeUndefined();
    expect(stored.sourceOutgoing?.classificationKind).toBe('transfer');
    expect(stored.sourceIncoming?.classificationKind).toBe('transfer');
    expect(stored.accountLegs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ direction: 'CRDT', amount: { amountMinor: 4_000n, currency: 'EUR' } }),
        expect.objectContaining({ direction: 'DBIT', amount: { amountMinor: 1_000n, currency: 'EUR' } }),
      ]),
    );
    expect(stored.outgoingMatch).toMatchObject({
      outgoingTransactionId: fixture.outgoingTransactionId,
      incomingTransactionId: expect.any(String),
      status: 'confirmed',
    });
    expect(stored.incomingMatch).toMatchObject({
      outgoingTransactionId: expect.any(String),
      incomingTransactionId: fixture.incomingTransactionId,
      status: 'confirmed',
    });
  });
});

describe('cleanupDanglingMoneyBoxReferences', () => {
  test('clears or deletes every dangling row and is idempotent', async () => {
    const t = createTest();
    const fixture = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 7, 1, 12);
      const userId = 'dangling_money_box_migration_user';
      const validMoneyBoxId = await ctx.db.insert('moneyBoxes', {
        userId,
        name: 'Existing box',
        targetAmount: { amountMinor: 5_000n, currency: 'EUR' },
        savedAmount: { amountMinor: 1_000n, currency: 'EUR' },
        targetDate: '2026-12-31',
        status: 'active',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const deletedMoneyBoxId = await ctx.db.insert('moneyBoxes', {
        userId,
        name: 'Deleted box',
        targetAmount: { amountMinor: 5_000n, currency: 'EUR' },
        savedAmount: { amountMinor: 1_000n, currency: 'EUR' },
        targetDate: '2026-12-31',
        status: 'active',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const planId = await ctx.db.insert('plans', {
        userId,
        name: 'Main plan',
        currency: 'EUR',
        startPeriod: '2026-08',
        accountIds: [],
        isDefault: true,
        sortOrder: 0,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const groupId = await ctx.db.insert('planGroups', {
        planId,
        userId,
        name: 'Needs',
        sortOrder: 0,
        collapsed: false,
        hidden: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const danglingBucketId = await ctx.db.insert('planBuckets', {
        planId,
        userId,
        groupId,
        name: 'Acme Allowance',
        sortOrder: 0,
        hidden: false,
        isUnplanned: false,
        moneyBoxId: deletedMoneyBoxId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const validBucketId = await ctx.db.insert('planBuckets', {
        planId,
        userId,
        groupId,
        name: 'Existing reserve',
        sortOrder: 1,
        hidden: false,
        isUnplanned: false,
        moneyBoxId: validMoneyBoxId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const danglingPlannedTransactionId = await ctx.db.insert('plannedTransactions', {
        userId,
        name: 'Allianz ULTRA Salute',
        amount: { amountMinor: 8_000n, currency: 'EUR' },
        dueDate: '2026-09-01',
        kind: 'expense',
        direction: 'outflow',
        status: 'funding',
        source: 'manual',
        moneyBoxId: deletedMoneyBoxId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const danglingSubscriptionId = await ctx.db.insert('subscriptions', {
        userId,
        name: 'Dangling subscription',
        amount: { amountMinor: 2_000n, currency: 'EUR' },
        interval: 'month',
        intervalCount: 1,
        status: 'active',
        startDate: '2026-08-01',
        trialPeriodDays: 0,
        source: 'manual',
        moneyBoxId: deletedMoneyBoxId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const danglingContributionId = await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId: deletedMoneyBoxId,
        amount: { amountMinor: 1_000n, currency: 'EUR' },
        contributionDate: '2026-08-01',
        source: 'manual',
        createdAtMs: now,
      });
      const validContributionId = await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId: validMoneyBoxId,
        amount: { amountMinor: 1_000n, currency: 'EUR' },
        contributionDate: '2026-08-01',
        source: 'manual',
        createdAtMs: now,
      });
      await ctx.db.delete('moneyBoxes', deletedMoneyBoxId);
      return {
        danglingBucketId,
        validBucketId,
        validMoneyBoxId,
        danglingPlannedTransactionId,
        danglingSubscriptionId,
        danglingContributionId,
        validContributionId,
      };
    });

    const first = await t.action(internal.migrations.cleanupDanglingMoneyBoxReferences, { batchSize: 1 });
    const second = await t.action(internal.migrations.cleanupDanglingMoneyBoxReferences, { batchSize: 1 });
    const stored = await t.run(async (ctx) => ({
      danglingBucket: await ctx.db.get('planBuckets', fixture.danglingBucketId),
      validBucket: await ctx.db.get('planBuckets', fixture.validBucketId),
      danglingPlannedTransaction: await ctx.db.get(
        'plannedTransactions',
        fixture.danglingPlannedTransactionId,
      ),
      danglingSubscription: await ctx.db.get('subscriptions', fixture.danglingSubscriptionId),
      danglingContribution: await ctx.db.get('moneyBoxContributions', fixture.danglingContributionId),
      validContribution: await ctx.db.get('moneyBoxContributions', fixture.validContributionId),
    }));

    expect(first).toEqual({
      planBuckets: { cleared: 1 },
      plannedTransactions: { cleared: 1 },
      subscriptions: { cleared: 1 },
      moneyBoxContributions: { deleted: 1 },
    });
    expect(second).toEqual({
      planBuckets: { cleared: 0 },
      plannedTransactions: { cleared: 0 },
      subscriptions: { cleared: 0 },
      moneyBoxContributions: { deleted: 0 },
    });
    expect(stored.danglingBucket?.moneyBoxId).toBeUndefined();
    expect(stored.validBucket?.moneyBoxId).toBe(fixture.validMoneyBoxId);
    expect(stored.danglingPlannedTransaction?.moneyBoxId).toBeUndefined();
    expect(stored.danglingSubscription?.moneyBoxId).toBeUndefined();
    expect(stored.danglingContribution).toBeNull();
    expect(stored.validContribution?.moneyBoxId).toBe(fixture.validMoneyBoxId);
  });
});
