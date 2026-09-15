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

async function seedAuthKitUser(t: TestHarness, userId: string) {
  const timestamp = '2026-05-01T00:00:00.000Z';
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
        firstName: 'Snapshot',
        lastName: 'Tester',
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
  accountType: 'CACC' | 'CARD' = 'CACC',
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
    return await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId: connection._id,
      provider: 'manual',
      name,
      accountType,
      currency: 'EUR',
      status: 'active',
      syncEnabled: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedPlan(t: TestHarness, userId: string, accountIds: Array<Id<'financialAccounts'>>) {
  return await t.run((ctx) =>
    ctx.db.insert('plans', {
      userId,
      name: 'Main plan',
      currency: 'EUR',
      startPeriod: '2026-05',
      accountIds,
      isDefault: true,
      sortOrder: 1000,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    }),
  );
}

async function seedSnapshot(t: TestHarness, userId: string, planId: Id<'plans'>) {
  return await t.run((ctx) =>
    ctx.db.insert('planMonthSnapshots', {
      planId,
      userId,
      period: '2026-05',
      entries: [],
      computedAtMs: Date.now(),
    }),
  );
}

async function seedMoneyBox(
  t: TestHarness,
  userId: string,
  accountId: Id<'financialAccounts'>,
  name: string,
  savedMinor = 10_000n,
) {
  return await t.run((ctx) =>
    ctx.db.insert('moneyBoxes', {
      userId,
      accountId,
      name,
      targetAmount: { amountMinor: 100_000n, currency: 'EUR' },
      savedAmount: { amountMinor: savedMinor, currency: 'EUR' },
      targetDate: '2026-12-31',
      status: 'active',
      source: 'manual',
      heldOutsideBalance: true,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    }),
  );
}

async function expectDeleted(t: TestHarness, snapshotId: Id<'planMonthSnapshots'>) {
  expect(await t.run((ctx) => ctx.db.get('planMonthSnapshots', snapshotId))).toBeNull();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Plan snapshot invalidation for money boxes and card ownership', () => {
  test('invalidates structural money-box writes with no safe effective date', async () => {
    const t = createTest();
    const userId = 'money_box_structural_snapshot_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    const planId = await seedPlan(t, userId, [accountId]);
    const asUser = t.withIdentity({ subject: userId });

    const createSnapshotId = await seedSnapshot(t, userId, planId);
    const moneyBoxId = await asUser.mutation(api.banking.planning.createMoneyBox, {
      accountId,
      name: 'Holiday',
      targetAmount: { amountMinor: 100_000n, currency: 'EUR' },
      savedAmount: { amountMinor: 10_000n, currency: 'EUR' },
      targetDate: '2026-12-31',
      heldOutsideBalance: true,
    });
    await expectDeleted(t, createSnapshotId);

    const updateSnapshotId = await seedSnapshot(t, userId, planId);
    await asUser.mutation(api.banking.planning.updateMoneyBox, {
      moneyBoxId,
      name: 'Holiday',
      targetAmount: { amountMinor: 100_000n, currency: 'EUR' },
      targetDate: '2026-12-31',
      heldOutsideBalance: false,
    });
    await expectDeleted(t, updateSnapshotId);

    const archiveSnapshotId = await seedSnapshot(t, userId, planId);
    await asUser.mutation(api.banking.planning.setMoneyBoxStatus, {
      moneyBoxId,
      status: 'archived',
    });
    await expectDeleted(t, archiveSnapshotId);
  });

  test('invalidates the dated period for contributions and withdrawals', async () => {
    const t = createTest();
    const userId = 'money_box_dated_snapshot_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    const planId = await seedPlan(t, userId, [accountId]);
    const moneyBoxId = await seedMoneyBox(t, userId, accountId, 'Emergency fund');
    const asUser = t.withIdentity({ subject: userId });

    const contributionSnapshotId = await seedSnapshot(t, userId, planId);
    await asUser.mutation(api.banking.planning.addMoneyBoxContribution, {
      moneyBoxId,
      amount: { amountMinor: 2_000n, currency: 'EUR' },
      contributionDate: '2026-05-10',
    });
    await expectDeleted(t, contributionSnapshotId);

    const withdrawalSnapshotId = await seedSnapshot(t, userId, planId);
    await asUser.mutation(api.banking.planning.registerMoneyBoxWithdrawal, {
      moneyBoxId,
      amount: { amountMinor: 1_000n, currency: 'EUR' },
      withdrawalDate: '2026-05-20',
    });
    await expectDeleted(t, withdrawalSnapshotId);
  });

  test('invalidates association, reassociation, and unlinking in the transaction month', async () => {
    const t = createTest();
    const userId = 'money_box_transfer_snapshot_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    const planId = await seedPlan(t, userId, [accountId]);
    const firstMoneyBoxId = await seedMoneyBox(t, userId, accountId, 'First');
    const secondMoneyBoxId = await seedMoneyBox(t, userId, accountId, 'Second');
    const transactionId = await t.run(async (ctx) => {
      const account = await ctx.db.get('financialAccounts', accountId);
      if (!account?.providerConnectionId) throw new Error('Transaction account setup failed');
      return await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId: account.providerConnectionId,
        provider: 'manual',
        dedupeKey: 'money_box_transfer',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 1_000n, currency: 'EUR' },
        bookingDate: '2026-05-15',
        description: 'Money box transfer',
        classificationKind: 'transfer',
        classificationSource: 'user',
        importedAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    });
    const asUser = t.withIdentity({ subject: userId });

    const associationSnapshotId = await seedSnapshot(t, userId, planId);
    await asUser.mutation(api.banking.planning.associateTransferWithMoneyBox, {
      transactionId,
      moneyBoxId: firstMoneyBoxId,
    });
    await expectDeleted(t, associationSnapshotId);

    const reassociationSnapshotId = await seedSnapshot(t, userId, planId);
    await asUser.mutation(api.banking.planning.associateTransferWithMoneyBox, {
      transactionId,
      moneyBoxId: secondMoneyBoxId,
    });
    await expectDeleted(t, reassociationSnapshotId);

    const unlinkSnapshotId = await seedSnapshot(t, userId, planId);
    await asUser.mutation(api.banking.planning.unlinkMoneyBoxContribution, { transactionId });
    await expectDeleted(t, unlinkSnapshotId);
  });

  test('invalidates cached statement ownership when a credit facility is repointed', async () => {
    const t = createTest();
    const userId = 'credit_link_snapshot_user';
    await seedAuthKitUser(t, userId);
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const firstCardId = await seedAccount(t, userId, 'First card', 'CARD');
    const secondCardId = await seedAccount(t, userId, 'Second card', 'CARD');
    const planId = await seedPlan(t, userId, [cashAccountId, firstCardId, secondCardId]);
    const snapshotId = await seedSnapshot(t, userId, planId);
    const facilityId = await t.run(async (ctx) => {
      const now = Date.now();
      const createdFacilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Card facility',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        linkedAccountId: firstCardId,
        provider: 'manual',
        limitAmount: { amountMinor: 100_000n, currency: 'EUR' },
        usedAmount: { amountMinor: 0n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const account = await ctx.db.get('financialAccounts', cashAccountId);
      if (!account?.providerConnectionId) throw new Error('Transaction account setup failed');
      const transactionId = await ctx.db.insert('transactions', {
        userId,
        accountId: cashAccountId,
        providerConnectionId: account.providerConnectionId,
        provider: 'manual',
        dedupeKey: 'statement_payment',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 5_000n, currency: 'EUR' },
        bookingDate: '2026-05-15',
        description: 'Statement payment',
        classificationKind: 'internal',
        classificationSource: 'system',
        importedAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId: createdFacilityId,
        cycleMonth: '2026-04',
        status: 'paid',
        trackedAmount: { amountMinor: 5_000n, currency: 'EUR' },
        dueDate: '2026-05-15',
        transactionId,
        paidAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return createdFacilityId;
    });

    await t.withIdentity({ subject: userId }).mutation(api.banking.credit.updateCreditFacility, {
      creditFacilityId: facilityId,
      linkedAccountId: secondCardId,
    });
    await expectDeleted(t, snapshotId);
  });
});
