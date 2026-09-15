/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/credit.ts',
  './banking/planning.ts',
  './banking/planningMath.ts',
  './banking/creditMath.ts',
  './banking/subscriptionDetection.ts',
  './lib/*.ts',
]);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthKitUser(t: TestHarness, userId: string) {
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

async function seedMoneyBox(
  t: TestHarness,
  userId: string,
  options: { savedMinor?: bigint; targetMinor?: bigint; status?: 'active' | 'completed' } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 0, 1);
    return await ctx.db.insert('moneyBoxes', {
      userId,
      name: 'Emergency fund',
      targetAmount: { amountMinor: options.targetMinor ?? 100000n, currency: 'EUR' },
      savedAmount: { amountMinor: options.savedMinor ?? 50000n, currency: 'EUR' },
      targetDate: '2026-12-31',
      status: options.status ?? 'active',
      source: 'manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedDebitTransaction(t: TestHarness, userId: string) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 0, 1);
    const connectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId: connectionId,
      provider: 'mock',
      providerAccountId: `${userId}_checking`,
      name: 'Checking',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return await ctx.db.insert('transactions', {
      userId,
      accountId,
      providerConnectionId: connectionId,
      provider: 'mock',
      dedupeKey: `${userId}_goal_spend`,
      status: 'BOOK',
      direction: 'DBIT',
      amount: { amountMinor: 10000n, currency: 'EUR' },
      bookingDate: '2026-06-15',
      description: 'Goal-funded purchase',
      classificationKind: 'expense',
      classificationSource: 'user',
      importedAtMs: now,
      updatedAtMs: now,
    });
  });
}

describe('money box withdrawals', () => {
  test('reduces saved amount and records a positive withdrawal row', async () => {
    const t = createTest();
    const userId = 'withdrawal_user';
    await seedAuthKitUser(t, userId);
    const moneyBoxId = await seedMoneyBox(t, userId);

    const withdrawalId = await t.withIdentity({ subject: userId }).mutation(
      api.banking.planning.registerMoneyBoxWithdrawal,
      {
        moneyBoxId,
        amount: { amountMinor: 12000n, currency: 'EUR' },
        withdrawalDate: '2026-06-15',
      },
    );

    const result = await t.run(async (ctx) => ({
      moneyBox: await ctx.db.get('moneyBoxes', moneyBoxId),
      withdrawal: await ctx.db.get('moneyBoxContributions', withdrawalId),
    }));
    expect(result.moneyBox?.savedAmount.amountMinor).toBe(38000n);
    expect(result.withdrawal).toMatchObject({
      kind: 'withdrawal',
      amount: { amountMinor: 12000n, currency: 'EUR' },
      contributionDate: '2026-06-15',
      source: 'manual',
    });
  });

  test('rejects over-withdrawals, currency mismatches, invalid dates, and foreign boxes', async () => {
    const t = createTest();
    const userId = 'withdrawal_validation_user';
    const foreignUserId = 'withdrawal_foreign_user';
    await seedAuthKitUser(t, userId);
    await seedAuthKitUser(t, foreignUserId);
    const moneyBoxId = await seedMoneyBox(t, userId, { savedMinor: 10000n });
    const foreignMoneyBoxId = await seedMoneyBox(t, foreignUserId);
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.banking.planning.registerMoneyBoxWithdrawal, {
        moneyBoxId,
        amount: { amountMinor: 10001n, currency: 'EUR' },
        withdrawalDate: '2026-06-15',
      }),
    ).rejects.toThrow('Money box does not have enough saved funds');
    await expect(
      asUser.mutation(api.banking.planning.registerMoneyBoxWithdrawal, {
        moneyBoxId,
        amount: { amountMinor: 1000n, currency: 'USD' },
        withdrawalDate: '2026-06-15',
      }),
    ).rejects.toThrow('Withdrawal currency must match');
    await expect(
      asUser.mutation(api.banking.planning.registerMoneyBoxWithdrawal, {
        moneyBoxId,
        amount: { amountMinor: 1000n, currency: 'EUR' },
        withdrawalDate: '2026-02-30',
      }),
    ).rejects.toThrow('Withdrawal date must be an ISO date');
    await expect(
      asUser.mutation(api.banking.planning.registerMoneyBoxWithdrawal, {
        moneyBoxId: foreignMoneyBoxId,
        amount: { amountMinor: 1000n, currency: 'EUR' },
        withdrawalDate: '2026-06-15',
      }),
    ).rejects.toThrow('Money box not found');
  });

  test('reopens a completed money box when withdrawal drops it below target', async () => {
    const t = createTest();
    const userId = 'withdrawal_completed_user';
    await seedAuthKitUser(t, userId);
    const moneyBoxId = await seedMoneyBox(t, userId, {
      savedMinor: 100000n,
      targetMinor: 100000n,
      status: 'completed',
    });

    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.registerMoneyBoxWithdrawal, {
      moneyBoxId,
      amount: { amountMinor: 1n, currency: 'EUR' },
      withdrawalDate: '2026-06-15',
    });

    const moneyBox = await t.run(async (ctx) => await ctx.db.get('moneyBoxes', moneyBoxId));
    expect(moneyBox).toMatchObject({
      status: 'active',
      savedAmount: { amountMinor: 99999n, currency: 'EUR' },
    });
  });

  test('validates transaction ownership, debit direction, and deduplicates links', async () => {
    const t = createTest();
    const userId = 'withdrawal_transaction_user';
    const foreignUserId = 'withdrawal_transaction_foreign';
    await seedAuthKitUser(t, userId);
    await seedAuthKitUser(t, foreignUserId);
    const moneyBoxId = await seedMoneyBox(t, userId);
    const transactionId = await seedDebitTransaction(t, userId);
    const foreignTransactionId = await seedDebitTransaction(t, foreignUserId);
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.banking.planning.registerMoneyBoxWithdrawal, {
      moneyBoxId,
      amount: { amountMinor: 10000n, currency: 'EUR' },
      withdrawalDate: '2026-06-15',
      transactionId,
    });
    await expect(
      asUser.mutation(api.banking.planning.registerMoneyBoxWithdrawal, {
        moneyBoxId,
        amount: { amountMinor: 1000n, currency: 'EUR' },
        withdrawalDate: '2026-06-16',
        transactionId,
      }),
    ).rejects.toThrow('Transaction is already linked');
    await expect(
      asUser.mutation(api.banking.planning.registerMoneyBoxWithdrawal, {
        moneyBoxId,
        amount: { amountMinor: 1000n, currency: 'EUR' },
        withdrawalDate: '2026-06-16',
        transactionId: foreignTransactionId,
      }),
    ).rejects.toThrow('Transaction not found');

    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', transactionId, { direction: 'CRDT' });
      const rows = await ctx.db
        .query('moneyBoxContributions')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', transactionId))
        .take(1);
      await ctx.db.delete('moneyBoxContributions', rows[0]._id);
    });
    await expect(
      asUser.mutation(api.banking.planning.registerMoneyBoxWithdrawal, {
        moneyBoxId,
        amount: { amountMinor: 1000n, currency: 'EUR' },
        withdrawalDate: '2026-06-16',
        transactionId,
      }),
    ).rejects.toThrow('Only debit transactions');
  });

  test('treats legacy rows as contributions and withdrawal rows as negative in aggregates', async () => {
    const t = createTest();
    const userId = 'withdrawal_aggregate_user';
    const moneyBoxId = await seedMoneyBox(t, userId, { savedMinor: 107000n, targetMinor: 200000n });
    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId,
        amount: { amountMinor: 10000n, currency: 'EUR' },
        contributionDate: '2026-06-10',
        source: 'manual',
        createdAtMs: now,
      });
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId,
        kind: 'withdrawal',
        amount: { amountMinor: 3000n, currency: 'EUR' },
        contributionDate: '2026-06-11',
        source: 'manual',
        createdAtMs: now,
      });
    });

    const view = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-06-01',
      horizonDate: '2026-12-31',
      contributionCycleStartDate: '2026-06-01',
      contributionCycleEndDate: '2026-06-30',
      contributionAsOfDate: '2026-06-30',
      limit: 10,
    });

    const item = view.fundingItems.find((fundingItem) => fundingItem.moneyBoxId === moneyBoxId);
    expect(item?.cycleContributedAmount.amountMinor).toBe(7000n);
  });

  test('updates settings and enforces growth-rate bounds', async () => {
    const t = createTest();
    const userId = 'withdrawal_settings_user';
    await seedAuthKitUser(t, userId);
    const moneyBoxId = await seedMoneyBox(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.banking.planning.setMoneyBoxSettings, {
      moneyBoxId,
      growthRatePct: 20,
      spendingReducesProgress: false,
    });
    const moneyBox = await t.run(async (ctx) => await ctx.db.get('moneyBoxes', moneyBoxId));
    expect(moneyBox).toMatchObject({ growthRatePct: 20, spendingReducesProgress: false });

    await expect(
      asUser.mutation(api.banking.planning.setMoneyBoxSettings, { moneyBoxId, growthRatePct: -0.1 }),
    ).rejects.toThrow('Growth rate must be between 0 and 20 percent');
    await expect(
      asUser.mutation(api.banking.planning.setMoneyBoxSettings, { moneyBoxId, growthRatePct: 20.1 }),
    ).rejects.toThrow('Growth rate must be between 0 and 20 percent');
  });
});
