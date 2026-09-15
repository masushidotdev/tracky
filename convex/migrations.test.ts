/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
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

type LegacyCardInstallmentFixtureOptions = {
  userId: string;
  accountProvider?: 'manual' | 'mock';
  balanceMinor?: bigint;
  planResidualMinor?: bigint;
  includeInstallmentPlan?: boolean;
  includeSnapshot?: boolean;
};

async function seedLegacyCardInstallmentFixture(t: TestHarness, options: LegacyCardInstallmentFixtureOptions) {
  await seedAuthKitUser(t, options.userId);
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1, 12);
    const accountProvider = options.accountProvider ?? 'manual';
    const balanceMinor = options.balanceMinor ?? -120_000n;
    const planResidualMinor = options.planResidualMinor ?? 120_000n;
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId: options.userId,
      provider: accountProvider,
      status: 'active',
      displayName: accountProvider === 'manual' ? 'Manual' : 'Mock bank',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const cardAccountId = await ctx.db.insert('financialAccounts', {
      userId: options.userId,
      providerConnectionId,
      provider: accountProvider,
      providerAccountId: accountProvider === 'manual' ? undefined : `provider_card_${options.userId}`,
      name: 'Legacy installment card',
      accountType: 'CARD',
      currency: 'EUR',
      status: 'active',
      syncEnabled: accountProvider !== 'manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('accountBalances', {
      userId: options.userId,
      accountId: cardAccountId,
      providerConnectionId,
      provider: accountProvider,
      balanceType: 'closingBooked',
      amount: { amountMinor: balanceMinor, currency: 'EUR' },
      referenceDate: '2026-07-01',
      fetchedAtMs: now,
    });
    const facilityId = await ctx.db.insert('creditFacilities', {
      userId: options.userId,
      name: 'Legacy installment card',
      facilityType: 'cardCreditLine',
      status: 'active',
      source: accountProvider === 'manual' ? 'manual' : 'provider',
      linkedAccountId: cardAccountId,
      provider: accountProvider,
      limitAmount: { amountMinor: 250_000n, currency: 'EUR' },
      usedAmount: { amountMinor: 0n, currency: 'EUR' },
      repaymentType: 'statementBalance',
      createdAtMs: now,
      updatedAtMs: now,
    });

    let installmentPlanId: Id<'creditFacilityInstallmentPlans'> | undefined;
    if (options.includeInstallmentPlan ?? true) {
      installmentPlanId = await ctx.db.insert('creditFacilityInstallmentPlans', {
        userId: options.userId,
        creditFacilityId: facilityId,
        name: 'Legacy statement in 3 installments',
        principalAmount: { amountMinor: planResidualMinor, currency: 'EUR' },
        outstandingAmount: { amountMinor: planResidualMinor, currency: 'EUR' },
        monthlyPaymentAmount: { amountMinor: planResidualMinor / 3n, currency: 'EUR' },
        installmentCount: 3,
        remainingInstallments: 3,
        startDate: '2026-07-01',
        nextPaymentDate: '2026-08-01',
        endDate: '2026-10-01',
        status: 'active',
        createdAtMs: now,
        updatedAtMs: now,
      });
    }

    let snapshotId: Id<'planMonthSnapshots'> | undefined;
    if (options.includeSnapshot) {
      const planId = await ctx.db.insert('plans', {
        userId: options.userId,
        name: 'Main plan',
        currency: 'EUR',
        startPeriod: '2026-07',
        accountIds: [cardAccountId],
        isDefault: true,
        sortOrder: 0,
        createdAtMs: now,
        updatedAtMs: now,
      });
      snapshotId = await ctx.db.insert('planMonthSnapshots', {
        planId,
        userId: options.userId,
        period: '2026-07',
        entries: [],
        readyToAssignEndMinor: 0n,
        cashOverspendingMinor: 0n,
        computedAtMs: now,
      });
    }

    return { cardAccountId, facilityId, installmentPlanId, snapshotId };
  });
}

async function balanceRows(t: TestHarness, accountId: Id<'financialAccounts'>) {
  return await t.run(async (ctx) =>
    ctx.db
      .query('accountBalances')
      .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', accountId))
      .order('desc')
      .take(10),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

test('restores external installment activity idempotently without touching other internal transactions', async () => {
  const t = createTest();
  const fixture = await t.run(async (ctx) => {
    const now = Date.UTC(2025, 0, 1);
    const userId = 'migration_user';
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
      name: 'Checking',
      accountType: 'CACC',
      currency: 'EUR',
      status: 'active',
      syncEnabled: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const externalFacilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Consumer loan',
      facilityType: 'installmentCredit',
      status: 'active',
      source: 'manual',
      linkedAccountId: accountId,
      provider: 'manual',
      limitAmount: { amountMinor: 50_000n, currency: 'EUR' },
      usedAmount: { amountMinor: 40_000n, currency: 'EUR' },
      repaymentType: 'installmentPlan',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const cardFacilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Card installments',
      facilityType: 'additionalCardCreditLine',
      status: 'active',
      source: 'manual',
      linkedAccountId: accountId,
      provider: 'manual',
      limitAmount: { amountMinor: 50_000n, currency: 'EUR' },
      usedAmount: { amountMinor: 40_000n, currency: 'EUR' },
      repaymentType: 'installmentPlan',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const externalPlanId = await ctx.db.insert('creditFacilityInstallmentPlans', {
      userId,
      creditFacilityId: externalFacilityId,
      name: 'Consumer loan',
      principalAmount: { amountMinor: 50_000n, currency: 'EUR' },
      outstandingAmount: { amountMinor: 40_000n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 10_000n, currency: 'EUR' },
      installmentCount: 5,
      remainingInstallments: 4,
      startDate: '2025-01-15',
      nextPaymentDate: '2025-02-15',
      endDate: '2025-05-15',
      status: 'active',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const cardPlanId = await ctx.db.insert('creditFacilityInstallmentPlans', {
      userId,
      creditFacilityId: cardFacilityId,
      name: 'Card installments',
      principalAmount: { amountMinor: 50_000n, currency: 'EUR' },
      outstandingAmount: { amountMinor: 40_000n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 10_000n, currency: 'EUR' },
      installmentCount: 5,
      remainingInstallments: 4,
      startDate: '2025-01-15',
      nextPaymentDate: '2025-02-15',
      endDate: '2025-05-15',
      status: 'active',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const externalTransactionId = await ctx.db.insert('transactions', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'manual',
      dedupeKey: 'external-payment',
      status: 'BOOK',
      direction: 'DBIT',
      amount: { amountMinor: 10_000n, currency: 'EUR' },
      bookingDate: '2025-01-15',
      description: 'Consumer loan payment',
      classificationKind: 'internal',
      classificationSource: 'user',
      classificationConfidence: 1,
      importedAtMs: now,
      updatedAtMs: now,
    });
    const unrelatedTransactionId = await ctx.db.insert('transactions', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'manual',
      dedupeKey: 'unrelated-internal',
      status: 'BOOK',
      direction: 'DBIT',
      amount: { amountMinor: 2_500n, currency: 'EUR' },
      bookingDate: '2025-01-20',
      description: 'Manual internal movement',
      classificationKind: 'internal',
      classificationSource: 'user',
      classificationConfidence: 1,
      importedAtMs: now,
      updatedAtMs: now,
    });
    const cardTransactionId = await ctx.db.insert('transactions', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'manual',
      dedupeKey: 'card-payment',
      status: 'BOOK',
      direction: 'DBIT',
      amount: { amountMinor: 10_000n, currency: 'EUR' },
      bookingDate: '2025-01-25',
      description: 'Card installment payment',
      classificationKind: 'internal',
      classificationSource: 'user',
      classificationConfidence: 1,
      importedAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('creditFacilityInstallmentPayments', {
      userId,
      creditFacilityId: externalFacilityId,
      installmentPlanId: externalPlanId,
      amount: { amountMinor: 10_000n, currency: 'EUR' },
      paymentDate: '2025-01-15',
      source: 'transaction',
      transactionId: externalTransactionId,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('creditFacilityInstallmentPayments', {
      userId,
      creditFacilityId: cardFacilityId,
      installmentPlanId: cardPlanId,
      amount: { amountMinor: 10_000n, currency: 'EUR' },
      paymentDate: '2025-01-25',
      source: 'transaction',
      transactionId: cardTransactionId,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const planId = await ctx.db.insert('plans', {
      userId,
      name: 'Main plan',
      currency: 'EUR',
      startPeriod: '2025-01',
      accountIds: [accountId],
      isDefault: true,
      sortOrder: 1000,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const snapshotId = await ctx.db.insert('planMonthSnapshots', {
      planId,
      userId,
      period: '2025-01',
      entries: [],
      readyToAssignEndMinor: 0n,
      cashOverspendingMinor: 0n,
      computedAtMs: now,
    });

    return { externalTransactionId, unrelatedTransactionId, cardTransactionId, snapshotId };
  });

  const first = await t.action(internal.migrations.restoreExternalInstallmentPaymentActivity, { batchSize: 1 });
  const second = await t.action(internal.migrations.restoreExternalInstallmentPaymentActivity, { batchSize: 1 });
  const result = await t.run(async (ctx) => ({
    external: await ctx.db.get('transactions', fixture.externalTransactionId),
    unrelated: await ctx.db.get('transactions', fixture.unrelatedTransactionId),
    card: await ctx.db.get('transactions', fixture.cardTransactionId),
    snapshot: await ctx.db.get('planMonthSnapshots', fixture.snapshotId),
  }));

  expect(first).toEqual({ processed: 2, changed: 1, leftAlone: 1 });
  expect(second).toEqual({ processed: 2, changed: 0, leftAlone: 2 });
  expect(result.external).toMatchObject({
    classificationKind: 'uncategorized',
    classificationSource: 'system',
  });
  expect(result.external).not.toHaveProperty('categoryId');
  expect(result.unrelated).toMatchObject({ classificationKind: 'internal', classificationSource: 'user' });
  expect(result.card).toMatchObject({ classificationKind: 'internal', classificationSource: 'user' });
  expect(result.snapshot).toBeNull();
});

test('backfills card payment groups and buckets idempotently and clears plan snapshots', async () => {
  const t = createTest();
  const fixture = await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const userId = 'card_bucket_migration_user';
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'manual',
      status: 'active',
      displayName: 'Manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const cashAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'manual',
      name: 'Checking',
      accountType: 'CACC',
      currency: 'EUR',
      status: 'active',
      syncEnabled: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const cardAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'manual',
      name: 'Provider card',
      alias: 'Daily card',
      accountType: 'CARD',
      currency: 'EUR',
      status: 'active',
      syncEnabled: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const planId = await ctx.db.insert('plans', {
      userId,
      name: 'Legacy plan',
      currency: 'EUR',
      startPeriod: '2026-05',
      accountIds: [cashAccountId, cardAccountId],
      isDefault: true,
      sortOrder: 1000,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('planGroups', {
      planId,
      userId,
      name: 'Everyday',
      sortOrder: 1000,
      collapsed: false,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const snapshotId = await ctx.db.insert('planMonthSnapshots', {
      planId,
      userId,
      period: '2026-05',
      entries: [],
      readyToAssignEndMinor: 0n,
      cashOverspendingMinor: 0n,
      computedAtMs: now,
    });
    return { planId, cardAccountId, snapshotId };
  });

  const first = await t.action(internal.migrations.backfillPlanCardPaymentBuckets, { batchSize: 1 });
  const second = await t.action(internal.migrations.backfillPlanCardPaymentBuckets, { batchSize: 1 });
  const result = await t.run(async (ctx) => ({
    groups: await ctx.db
      .query('planGroups')
      .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', fixture.planId))
      .take(10),
    buckets: await ctx.db
      .query('planBuckets')
      .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', fixture.planId))
      .take(10),
    snapshot: await ctx.db.get('planMonthSnapshots', fixture.snapshotId),
  }));

  expect(first).toEqual({
    processed: 1,
    changed: 1,
    createdGroups: 1,
    createdBuckets: 1,
    detachedBuckets: 0,
  });
  expect(second).toEqual({
    processed: 1,
    changed: 0,
    createdGroups: 0,
    createdBuckets: 0,
    detachedBuckets: 0,
  });
  expect(result.groups.filter((group) => group.name === 'Card payments')).toHaveLength(1);
  expect(result.groups[0]).toMatchObject({ name: 'Card payments', sortOrder: 0 });
  expect(result.buckets).toEqual([
    expect.objectContaining({
      cardAccountId: fixture.cardAccountId,
      name: 'Daily card',
      hidden: false,
      isUnplanned: false,
    }),
  ]);
  expect(result.snapshot).toBeNull();
});

test('rebuilds plan snapshot caches by deleting each plan and scheduling from its start period', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
  try {
    const t = createTest();
    const fixture = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = 'snapshot_logic_migration_user';
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
        name: 'Checking',
        accountType: 'CACC',
        currency: 'EUR',
        status: 'active',
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
        amount: { amountMinor: 10_000n, currency: 'EUR' },
        fetchedAtMs: now,
      });
      const planId = await ctx.db.insert('plans', {
        userId,
        name: 'Main plan',
        currency: 'EUR',
        startPeriod: '2026-05',
        accountIds: [accountId],
        isDefault: true,
        sortOrder: 1000,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const groupId = await ctx.db.insert('planGroups', {
        planId,
        userId,
        name: 'Unplanned',
        sortOrder: 0,
        collapsed: false,
        hidden: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('planBuckets', {
        planId,
        userId,
        groupId,
        name: 'Unplanned',
        sortOrder: 0,
        hidden: false,
        isUnplanned: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const snapshotId = await ctx.db.insert('planMonthSnapshots', {
        planId,
        userId,
        period: '2026-05',
        entries: [],
        readyToAssignEndMinor: 9_999n,
        cashOverspendingMinor: -1n,
        computedAtMs: now,
      });
      return { planId, snapshotId };
    });

    const result = await t.action(internal.migrations.rebuildPlanSnapshotsAfterLogicChange, { batchSize: 1 });
    expect(result).toEqual({ processed: 1, deletedSnapshots: 1 });
    expect(await t.run((ctx) => ctx.db.get('planMonthSnapshots', fixture.snapshotId))).toBeNull();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const snapshots = await t.run((ctx) =>
      ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', fixture.planId))
        .take(10),
    );
    expect(snapshots.map((snapshot) => snapshot.period)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(snapshots.every((snapshot) => snapshot.readyToAssignEndMinor === undefined)).toBe(true);
    expect(snapshots.every((snapshot) => snapshot.cashOverspendingMinor === undefined)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

test('backfills plan start dates to the first day idempotently without changing plan numbers', async () => {
  const t = createTest();
  const fixture = await t.run(async (ctx) => {
    const now = Date.UTC(2026, 4, 20);
    const userId = 'plan_start_date_migration_user';
    const planId = await ctx.db.insert('plans', {
      userId,
      name: 'Legacy plan',
      currency: 'EUR',
      startPeriod: '2026-05',
      accountIds: [],
      expectedIncomeMinor: 250_000n,
      isDefault: true,
      sortOrder: 1000,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const alreadyMigratedPlanId = await ctx.db.insert('plans', {
      userId,
      name: 'Already migrated',
      currency: 'EUR',
      startPeriod: '2026-04',
      startDate: '2026-04-17',
      accountIds: [],
      expectedIncomeMinor: 180_000n,
      isDefault: false,
      sortOrder: 2000,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const groupId = await ctx.db.insert('planGroups', {
      planId,
      userId,
      name: 'Everyday',
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
      name: 'Groceries',
      sortOrder: 1000,
      hidden: false,
      isUnplanned: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const assignmentId = await ctx.db.insert('planAssignments', {
      planId,
      userId,
      bucketId,
      period: '2026-05',
      assignedMinor: 45_000n,
      currency: 'EUR',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const targetId = await ctx.db.insert('planTargets', {
      planId,
      userId,
      bucketId,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 60_000n,
      currency: 'EUR',
      repeats: true,
      snoozedPeriods: [],
    });
    const snapshotId = await ctx.db.insert('planMonthSnapshots', {
      planId,
      userId,
      period: '2026-05',
      entries: [{ bucketId, assignedMinor: 45_000n, activityMinor: -12_000n, availableEndMinor: 33_000n }],
      computedAtMs: now,
    });
    return { planId, alreadyMigratedPlanId, assignmentId, targetId, snapshotId };
  });
  const before = await t.run(async (ctx) => ({
    assignment: await ctx.db.get('planAssignments', fixture.assignmentId),
    target: await ctx.db.get('planTargets', fixture.targetId),
    snapshot: await ctx.db.get('planMonthSnapshots', fixture.snapshotId),
  }));

  const first = await t.action(internal.migrations.backfillPlanStartDates, { batchSize: 1 });
  const second = await t.action(internal.migrations.backfillPlanStartDates, { batchSize: 1 });
  const after = await t.run(async (ctx) => ({
    plan: await ctx.db.get('plans', fixture.planId),
    alreadyMigratedPlan: await ctx.db.get('plans', fixture.alreadyMigratedPlanId),
    assignment: await ctx.db.get('planAssignments', fixture.assignmentId),
    target: await ctx.db.get('planTargets', fixture.targetId),
    snapshot: await ctx.db.get('planMonthSnapshots', fixture.snapshotId),
  }));

  expect(first).toEqual({ processed: 2, updated: 1, unchanged: 1 });
  expect(second).toEqual({ processed: 2, updated: 0, unchanged: 2 });
  expect(after.plan).toMatchObject({
    startPeriod: '2026-05',
    startDate: '2026-05-01',
    expectedIncomeMinor: 250_000n,
  });
  expect(after.alreadyMigratedPlan).toMatchObject({
    startPeriod: '2026-04',
    startDate: '2026-04-17',
    expectedIncomeMinor: 180_000n,
  });
  expect(after.assignment).toEqual(before.assignment);
  expect(after.target).toEqual(before.target);
  expect(after.snapshot).toEqual(before.snapshot);
});

test('repairs double-counted manual card statement balances idempotently and invalidates affected snapshots', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
  try {
    const t = createTest();
    const fixture = await t.run(async (ctx) => {
      const baseMs = Date.UTC(2026, 6, 27, 12);
      const userId = 'card_statement_balance_repair_user';
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'manual',
        status: 'active',
        displayName: 'Manual',
        createdAtMs: baseMs,
        updatedAtMs: baseMs,
      });
      const cardAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'manual',
        name: 'Acme Flex',
        accountType: 'CARD',
        currency: 'EUR',
        status: 'active',
        syncEnabled: false,
        createdAtMs: baseMs,
        updatedAtMs: baseMs,
      });
      const cashAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'manual',
        name: 'Checking',
        accountType: 'CACC',
        currency: 'EUR',
        status: 'active',
        syncEnabled: false,
        createdAtMs: baseMs,
        updatedAtMs: baseMs,
      });
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: cardAccountId,
        providerConnectionId,
        provider: 'manual',
        balanceType: 'closingBooked',
        amount: { amountMinor: -120_000n, currency: 'EUR' },
        referenceDate: '2026-07-27',
        fetchedAtMs: baseMs,
      });
      const outgoingTransactionId = await ctx.db.insert('transactions', {
        userId,
        accountId: cashAccountId,
        providerConnectionId,
        provider: 'manual',
        dedupeKey: 'statement-debit',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 203_193n, currency: 'EUR' },
        bookingDate: '2026-07-05',
        description: 'Card statement debit',
        classificationKind: 'transfer',
        classificationSource: 'user',
        importedAtMs: baseMs + 1,
        updatedAtMs: baseMs + 1,
      });
      const syntheticTransactionId = await ctx.db.insert('transactions', {
        userId,
        accountId: cardAccountId,
        providerConnectionId,
        provider: 'manual',
        dedupeKey: `tracky|card-statement|${outgoingTransactionId}`,
        status: 'BOOK',
        direction: 'CRDT',
        amount: { amountMinor: 203_193n, currency: 'EUR' },
        bookingDate: '2026-07-05',
        description: 'Pagamento estratto carta',
        classificationKind: 'transfer',
        classificationSource: 'user',
        providerMetadata: {
          trackySyntheticKind: 'cardStatementSettlement',
          trackyOutgoingTransactionId: outgoingTransactionId,
        },
        importedAtMs: baseMs + 1,
        updatedAtMs: baseMs + 1,
      });
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: cardAccountId,
        providerConnectionId,
        provider: 'manual',
        balanceType: 'closingBooked',
        amount: { amountMinor: 83_193n, currency: 'EUR' },
        referenceDate: '2026-07-27',
        fetchedAtMs: baseMs + 2,
      });
      const planId = await ctx.db.insert('plans', {
        userId,
        name: 'Main plan',
        currency: 'EUR',
        startPeriod: '2026-07',
        accountIds: [cashAccountId, cardAccountId],
        isDefault: true,
        sortOrder: 0,
        createdAtMs: baseMs,
        updatedAtMs: baseMs,
      });
      const snapshotId = await ctx.db.insert('planMonthSnapshots', {
        planId,
        userId,
        period: '2026-07',
        entries: [],
        readyToAssignEndMinor: 0n,
        cashOverspendingMinor: 0n,
        computedAtMs: baseMs,
      });
      return { cardAccountId, syntheticTransactionId, snapshotId };
    });

    const first = await t.action(internal.migrations.repairManualCardStatementBalanceDoubleCounts, {
      batchSize: 1,
    });
    const second = await t.action(internal.migrations.repairManualCardStatementBalanceDoubleCounts, {
      batchSize: 1,
    });
    const stored = await t.run(async (ctx) => {
      const balances = await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', fixture.cardAccountId))
        .order('desc')
        .take(10);
      return {
        balances,
        synthetic: await ctx.db.get('transactions', fixture.syntheticTransactionId),
        snapshot: await ctx.db.get('planMonthSnapshots', fixture.snapshotId),
      };
    });

    expect(first).toEqual({ processed: 2, corrected: 1, alreadyCorrected: 0, leftAlone: 1 });
    expect(second).toEqual({ processed: 2, corrected: 0, alreadyCorrected: 1, leftAlone: 1 });
    expect(stored.balances).toHaveLength(3);
    expect(stored.balances[0]).toMatchObject({
      balanceName: 'card-statement-reference-date-repair',
      amount: { amountMinor: -120_000n, currency: 'EUR' },
      referenceDate: '2026-07-27',
    });
    expect(stored.synthetic?.providerMetadata).toMatchObject({
      trackyStatementBalanceCorrectionApplied: true,
    });
    expect(stored.snapshot).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

describe('legacy manual card installment balance repair', () => {
  test('repairs a preexisting manual-card plan and restores the expected facility availability', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'legacy_manual_card_installment_repair_user';
    const fixture = await seedLegacyCardInstallmentFixture(t, {
      userId,
      includeSnapshot: true,
    });

    const result = await t.action(internal.migrations.repairLegacyManualCardInstallmentBalanceDoubleCounts, {
      batchSize: 1,
    });
    const balances = await balanceRows(t, fixture.cardAccountId);
    const stored = await t.run(async (ctx) => ({
      installmentPlan: fixture.installmentPlanId
        ? await ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId)
        : null,
      snapshot: fixture.snapshotId ? await ctx.db.get('planMonthSnapshots', fixture.snapshotId) : null,
    }));
    const asUser = t.withIdentity({ subject: userId });
    const facilities = await asUser.query(api.banking.credit.listCreditFacilities, {});
    const facility = facilities.find((candidate) => candidate._id === fixture.facilityId);

    expect(result).toEqual({ processed: 1, corrected: 1, alreadyCorrected: 0, leftAlone: 0 });
    expect(balances).toHaveLength(2);
    expect(balances[0]).toMatchObject({
      balanceName: 'legacy-card-installment-balance-repair',
      amount: { amountMinor: 0n, currency: 'EUR' },
      referenceDate: '2026-10-15',
    });
    expect(stored.installmentPlan).toMatchObject({
      outstandingAmount: { amountMinor: 120_000n, currency: 'EUR' },
      manualCardBalanceCorrectionApplied: true,
      manualCardBalanceCorrectionAppliedAtMs: Date.UTC(2026, 9, 15, 12),
    });
    expect(stored.snapshot).toBeNull();
    expect(facility?.usedAmount.amountMinor).toBe(0n);
    expect(facility?.activeInstallmentOutstanding.amountMinor).toBe(120_000n);
    expect(facility?.summary.availableAmount.amountMinor).toBe(130_000n);
  });

  test('reports an already repaired plan and does not adjust its balance a second time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    const t = createTest();
    const fixture = await seedLegacyCardInstallmentFixture(t, {
      userId: 'legacy_manual_card_installment_idempotency_user',
    });

    const first = await t.action(internal.migrations.repairLegacyManualCardInstallmentBalanceDoubleCounts, {
      batchSize: 1,
    });
    const second = await t.action(internal.migrations.repairLegacyManualCardInstallmentBalanceDoubleCounts, {
      batchSize: 1,
    });
    const balances = await balanceRows(t, fixture.cardAccountId);

    expect(first).toEqual({ processed: 1, corrected: 1, alreadyCorrected: 0, leftAlone: 0 });
    expect(second).toEqual({ processed: 1, corrected: 0, alreadyCorrected: 1, leftAlone: 0 });
    expect(balances).toHaveLength(2);
    expect(balances[0].amount.amountMinor).toBe(0n);
  });

  test('leaves a provider-managed card balance untouched', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    const t = createTest();
    const fixture = await seedLegacyCardInstallmentFixture(t, {
      userId: 'legacy_provider_card_installment_repair_user',
      accountProvider: 'mock',
    });

    const result = await t.action(internal.migrations.repairLegacyManualCardInstallmentBalanceDoubleCounts, {
      batchSize: 1,
    });
    const balances = await balanceRows(t, fixture.cardAccountId);
    const installmentPlan = await t.run(async (ctx) =>
      fixture.installmentPlanId ? ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId) : null,
    );

    expect(result).toEqual({ processed: 1, corrected: 0, alreadyCorrected: 0, leftAlone: 1 });
    expect(balances).toHaveLength(1);
    expect(balances[0].amount.amountMinor).toBe(-120_000n);
    expect(installmentPlan?.manualCardBalanceCorrectionApplied).toBeUndefined();
  });

  test('caps the correction at the current card debt so the balance never becomes positive', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    const t = createTest();
    const fixture = await seedLegacyCardInstallmentFixture(t, {
      userId: 'legacy_manual_card_installment_cap_user',
      balanceMinor: -50_000n,
      planResidualMinor: 120_000n,
    });

    const result = await t.action(internal.migrations.repairLegacyManualCardInstallmentBalanceDoubleCounts, {
      batchSize: 1,
    });
    const balances = await balanceRows(t, fixture.cardAccountId);

    expect(result).toEqual({ processed: 1, corrected: 1, alreadyCorrected: 0, leftAlone: 0 });
    expect(balances).toHaveLength(2);
    expect(balances[0].amount.amountMinor).toBe(0n);
  });

  test('does not modify a manual card when no installment plan exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    const t = createTest();
    const fixture = await seedLegacyCardInstallmentFixture(t, {
      userId: 'legacy_manual_card_without_installment_repair_user',
      includeInstallmentPlan: false,
    });

    const result = await t.action(internal.migrations.repairLegacyManualCardInstallmentBalanceDoubleCounts, {
      batchSize: 1,
    });
    const balances = await balanceRows(t, fixture.cardAccountId);

    expect(result).toEqual({ processed: 0, corrected: 0, alreadyCorrected: 0, leftAlone: 0 });
    expect(balances).toHaveLength(1);
    expect(balances[0].amount.amountMinor).toBe(-120_000n);
  });
});

describe('manual card statement cycle repair after a corrected balance', () => {
  test('restores the corrected statement, reopens the next month, removes the empty rollover, and is idempotent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T09:15:00.000Z'));
    const t = createTest();
    const fixture = await seedLegacyCardInstallmentFixture(t, {
      userId: 'manual_card_statement_cycle_repair_user',
      balanceMinor: -3191n,
      includeInstallmentPlan: false,
    });
    const cycleIds = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 8, 2, 9);
      await ctx.db.patch('creditFacilities', fixture.facilityId, { paymentDayOfMonth: 5, updatedAtMs: now });
      const statementCycleId = await ctx.db.insert('creditFacilityUsageCycles', {
        userId: 'manual_card_statement_cycle_repair_user',
        creditFacilityId: fixture.facilityId,
        cycleMonth: '2026-08',
        status: 'cancelled',
        trackedAmount: { amountMinor: 42191n, currency: 'EUR' },
        dueDate: '2026-09-05',
        closedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const nextOpenCycleId = await ctx.db.insert('creditFacilityUsageCycles', {
        userId: 'manual_card_statement_cycle_repair_user',
        creditFacilityId: fixture.facilityId,
        cycleMonth: '2026-09',
        status: 'cancelled',
        trackedAmount: { amountMinor: 3191n, currency: 'EUR' },
        dueDate: '2026-10-05',
        closedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const rolloverCycleId = await ctx.db.insert('creditFacilityUsageCycles', {
        userId: 'manual_card_statement_cycle_repair_user',
        creditFacilityId: fixture.facilityId,
        cycleMonth: '2026-10',
        status: 'open',
        trackedAmount: { amountMinor: 0n, currency: 'EUR' },
        dueDate: '2026-11-05',
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { statementCycleId, nextOpenCycleId, rolloverCycleId };
    });

    const args = {
      creditFacilityId: fixture.facilityId,
      statementCycleMonth: '2026-08',
      nextOpenCycleMonth: '2026-09',
      expectedUsedAmount: { amountMinor: 3191n, currency: 'EUR' },
    };
    const first = await t.mutation(internal.migrations.repairManualCardStatementCycleAfterBalanceCorrection, args);
    const second = await t.mutation(internal.migrations.repairManualCardStatementCycleAfterBalanceCorrection, args);
    const stored = await t.run(async (ctx) => ({
      statement: await ctx.db.get('creditFacilityUsageCycles', cycleIds.statementCycleId),
      nextOpen: await ctx.db.get('creditFacilityUsageCycles', cycleIds.nextOpenCycleId),
      rollover: await ctx.db.get('creditFacilityUsageCycles', cycleIds.rolloverCycleId),
    }));
    const facilities = await t
      .withIdentity({ subject: 'manual_card_statement_cycle_repair_user' })
      .query(api.banking.credit.listCreditFacilities, {});

    expect(first).toMatchObject({ repaired: true, removedOpenCycleIds: [cycleIds.rolloverCycleId] });
    expect(second).toMatchObject({ repaired: false, removedOpenCycleIds: [] });
    expect(stored.statement).toMatchObject({
      status: 'scheduled',
      trackedAmount: { amountMinor: 3191n, currency: 'EUR' },
      dueDate: '2026-09-05',
    });
    expect(stored.nextOpen).toMatchObject({
      status: 'open',
      trackedAmount: { amountMinor: 0n, currency: 'EUR' },
      dueDate: '2026-10-05',
    });
    expect(stored.nextOpen?.closedAtMs).toBeUndefined();
    expect(stored.rollover).toBeNull();
    expect(facilities.find((facility) => facility._id === fixture.facilityId)?.currentStatementAmount.amountMinor).toBe(
      0n,
    );
  });

  test('fails closed when the card balance changed after inspection', async () => {
    const t = createTest();
    const fixture = await seedLegacyCardInstallmentFixture(t, {
      userId: 'manual_card_statement_cycle_repair_stale_user',
      balanceMinor: -5000n,
      includeInstallmentPlan: false,
    });

    await expect(
      t.mutation(internal.migrations.repairManualCardStatementCycleAfterBalanceCorrection, {
        creditFacilityId: fixture.facilityId,
        statementCycleMonth: '2026-08',
        nextOpenCycleMonth: '2026-09',
        expectedUsedAmount: { amountMinor: 3191n, currency: 'EUR' },
      }),
    ).rejects.toThrow('Current card usage no longer matches the expected repair amount');
  });
});
