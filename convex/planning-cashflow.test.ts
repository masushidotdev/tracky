/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import { insertPlannedExpense, insertPlannedTransfer } from './plannedTransactionsTestHelpers';
import { reconcileImportedTransactionWithPlannedExpenses } from './banking/planningReconciliation';
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
  './banking/safeToSpend.ts',
  './banking/safeToSpendCore.ts',
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

async function seedAccountWithBalance(
  t: TestHarness,
  userId: string,
  balance: { amountMinor: bigint; currency: string } = { amountMinor: 10000n, currency: 'EUR' },
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
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
      providerAccountId: `${userId}_main`,
      name: 'Main account',
      currency: balance.currency,
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('accountBalances', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'mock',
      balanceType: 'interimAvailable',
      amount: balance,
      fetchedAtMs: now,
    });

    return { accountId, providerConnectionId };
  });
}

async function seedInstallmentRoutingFixture(
  t: TestHarness,
  userId: string,
  options: { cardLinked: boolean; withSettlementAccount?: boolean; loan?: boolean },
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const checkingAccountId = await ctx.db.insert('financialAccounts', {
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
    const cardAccountId = options.cardLinked
      ? await ctx.db.insert('financialAccounts', {
          userId,
          providerConnectionId,
          provider: 'mock',
          providerAccountId: `${userId}_card`,
          name: 'Card',
          accountType: 'CARD',
          currency: 'EUR',
          status: 'active',
          syncEnabled: true,
          createdAtMs: now,
          updatedAtMs: now,
        })
      : undefined;
    const facilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: options.cardLinked ? 'Card facility' : options.loan ? 'Mortgage' : 'Installment facility',
      facilityType: options.cardLinked ? 'cardCreditLine' : options.loan ? 'mortgage' : 'installmentCredit',
      status: 'active',
      source: 'manual',
      linkedAccountId: options.loan ? undefined : (cardAccountId ?? checkingAccountId),
      settlementAccountId: options.withSettlementAccount ? checkingAccountId : undefined,
      provider: 'manual',
      limitAmount: { amountMinor: 100_000n, currency: 'EUR' },
      usedAmount: { amountMinor: 40_000n, currency: 'EUR' },
      repaymentType: 'installmentPlan',
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('creditFacilityInstallmentPlans', {
      userId,
      creditFacilityId: facilityId,
      name: 'Purchase plan',
      principalAmount: { amountMinor: 40_000n, currency: 'EUR' },
      outstandingAmount: { amountMinor: 40_000n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 40_000n, currency: 'EUR' },
      installmentCount: 1,
      remainingInstallments: 1,
      startDate: '2026-07-15',
      nextPaymentDate: '2026-07-15',
      endDate: '2026-07-15',
      status: 'active',
      createdAtMs: now,
      updatedAtMs: now,
    });
    if (cardAccountId) {
      await insertPlannedExpense(ctx, {
        userId,
        accountId: cardAccountId,
        name: 'Card fee',
        amount: { amountMinor: 100n, currency: 'EUR' },
        dueDate: '2026-07-20',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    }

    return { cardAccountId, checkingAccountId, facilityId };
  });
}

async function seedCreditTransferMoneyBoxScenario(
  t: TestHarness,
  userId: string,
  {
    firstSavedAmount,
    secondSavedAmount = 0n,
    transactionAmount = 5000n,
  }: {
    firstSavedAmount: bigint;
    secondSavedAmount?: bigint;
    transactionAmount?: bigint;
  },
) {
  const { accountId, providerConnectionId } = await seedAccountWithBalance(t, userId);
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const firstMoneyBoxId = await ctx.db.insert('moneyBoxes', {
      userId,
      name: 'Emergency fund',
      targetAmount: { amountMinor: 100000n, currency: 'EUR' },
      savedAmount: { amountMinor: firstSavedAmount, currency: 'EUR' },
      targetDate: '2026-12-01',
      status: 'active',
      source: 'manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const secondMoneyBoxId = await ctx.db.insert('moneyBoxes', {
      userId,
      name: 'Holiday',
      targetAmount: { amountMinor: 100000n, currency: 'EUR' },
      savedAmount: { amountMinor: secondSavedAmount, currency: 'EUR' },
      targetDate: '2026-12-01',
      status: 'active',
      source: 'manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const transactionId = await ctx.db.insert('transactions', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'mock',
      dedupeKey: `${userId}_money_box_withdrawal`,
      status: 'BOOK',
      direction: 'CRDT',
      amount: { amountMinor: transactionAmount, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Transfer from pocket',
      classificationKind: 'transfer',
      classificationSource: 'user',
      importedAtMs: now,
      updatedAtMs: now,
    });

    return { firstMoneyBoxId, secondMoneyBoxId, transactionId };
  });
}

describe('money box account association', () => {
  test('rejects invalid target and saved amounts at the shared core boundary', async () => {
    const t = createTest();
    const userId = 'user_money_box_amount_validation';
    await seedAuthKitUser(t, userId);
    const mutation = t.withIdentity({ subject: userId });

    await expect(
      mutation.mutation(api.banking.planning.createMoneyBox, {
        name: 'Invalid target',
        targetAmount: { amountMinor: 0n, currency: 'EUR' },
        targetDate: '2026-12-01',
      }),
    ).rejects.toThrow('Money box target amount must be greater than zero');
    await expect(
      mutation.mutation(api.banking.planning.createMoneyBox, {
        name: 'Invalid saved amount',
        targetAmount: { amountMinor: 10000n, currency: 'EUR' },
        savedAmount: { amountMinor: -1n, currency: 'EUR' },
        targetDate: '2026-12-01',
      }),
    ).rejects.toThrow('Money box saved amount cannot be negative');
    await expect(
      mutation.mutation(api.banking.planning.createMoneyBox, {
        name: 'Currency mismatch',
        targetAmount: { amountMinor: 10000n, currency: 'EUR' },
        savedAmount: { amountMinor: 100n, currency: 'USD' },
        targetDate: '2026-12-01',
      }),
    ).rejects.toThrow('Saved amount currency must match the money box currency');
  });

  test('creates a money box for an owned account with matching currency', async () => {
    const t = createTest();
    const userId = 'user_money_box_create';
    await seedAuthKitUser(t, userId);
    const { accountId } = await seedAccountWithBalance(t, userId, { amountMinor: 10000n, currency: 'EUR' });

    const moneyBoxId = await t.withIdentity({ subject: userId }).mutation(api.banking.planning.createMoneyBox, {
      accountId,
      name: 'Holiday',
      targetAmount: { amountMinor: 120000n, currency: 'EUR' },
      targetDate: '2026-12-01',
    });

    expect((await t.run((ctx) => ctx.db.get('moneyBoxes', moneyBoxId)))?.accountId).toBe(accountId);
  });

  test('rejects account currency mismatch and another user account', async () => {
    const t = createTest();
    const userId = 'user_money_box_account_validation';
    await seedAuthKitUser(t, userId);
    const usd = await seedAccountWithBalance(t, userId, { amountMinor: 10000n, currency: 'USD' });
    const other = await seedAccountWithBalance(t, 'other_money_box_owner');
    const mutation = t.withIdentity({ subject: userId });

    await expect(
      mutation.mutation(api.banking.planning.createMoneyBox, {
        accountId: usd.accountId,
        name: 'Holiday',
        targetAmount: { amountMinor: 120000n, currency: 'EUR' },
        targetDate: '2026-12-01',
      }),
    ).rejects.toThrow('Account currency must match the money box currency');
    await expect(
      mutation.mutation(api.banking.planning.createMoneyBox, {
        accountId: other.accountId,
        name: 'Holiday',
        targetAmount: { amountMinor: 120000n, currency: 'EUR' },
        targetDate: '2026-12-01',
      }),
    ).rejects.toThrow('Account not found');
  });

  test('updates active money boxes and clears their account association', async () => {
    const t = createTest();
    const userId = 'user_money_box_update';
    await seedAuthKitUser(t, userId);
    const { accountId } = await seedAccountWithBalance(t, userId);
    const moneyBoxId = await t.run((ctx) =>
      ctx.db.insert('moneyBoxes', {
        userId,
        accountId,
        name: 'Old name',
        targetAmount: { amountMinor: 10000n, currency: 'EUR' },
        savedAmount: { amountMinor: 1000n, currency: 'EUR' },
        targetDate: '2026-10-01',
        status: 'active',
        source: 'manual',
        createdAtMs: Date.UTC(2026, 0, 1),
        updatedAtMs: Date.UTC(2026, 0, 1),
      }),
    );

    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.updateMoneyBox, {
      moneyBoxId,
      name: ' New name ',
      targetAmount: { amountMinor: 20000n, currency: 'EUR' },
      targetDate: '2026-11-01',
    });

    const updated = await t.run((ctx) => ctx.db.get('moneyBoxes', moneyBoxId));
    expect(updated).not.toHaveProperty('accountId');
    expect(updated).toMatchObject({
      name: 'New name',
      targetAmount: { amountMinor: 20000n, currency: 'EUR' },
      targetDate: '2026-11-01',
    });
  });

  test('rejects editing archived boxes and changing currency', async () => {
    const t = createTest();
    const userId = 'user_money_box_update_rejections';
    await seedAuthKitUser(t, userId);
    const moneyBoxId = await t.run((ctx) =>
      ctx.db.insert('moneyBoxes', {
        userId,
        name: 'Holiday',
        targetAmount: { amountMinor: 10000n, currency: 'EUR' },
        savedAmount: { amountMinor: 1000n, currency: 'EUR' },
        targetDate: '2026-10-01',
        status: 'active',
        source: 'manual',
        createdAtMs: Date.UTC(2026, 0, 1),
        updatedAtMs: Date.UTC(2026, 0, 1),
      }),
    );
    const mutation = t.withIdentity({ subject: userId });

    await expect(
      mutation.mutation(api.banking.planning.updateMoneyBox, {
        moneyBoxId,
        name: 'Holiday',
        targetAmount: { amountMinor: 10000n, currency: 'USD' },
        targetDate: '2026-10-01',
      }),
    ).rejects.toThrow('Money box currency cannot be changed');
    await t.run((ctx) => ctx.db.patch('moneyBoxes', moneyBoxId, { status: 'archived' }));
    await expect(
      mutation.mutation(api.banking.planning.updateMoneyBox, {
        moneyBoxId,
        name: 'Holiday',
        targetAmount: { amountMinor: 10000n, currency: 'EUR' },
        targetDate: '2026-10-01',
      }),
    ).rejects.toThrow('Only active money boxes can be edited');
  });

  test('archives and reactivates a money box', async () => {
    const t = createTest();
    const userId = 'user_money_box_status';
    await seedAuthKitUser(t, userId);
    const moneyBoxId = await t.run((ctx) =>
      ctx.db.insert('moneyBoxes', {
        userId,
        name: 'Holiday',
        targetAmount: { amountMinor: 10000n, currency: 'EUR' },
        savedAmount: { amountMinor: 1000n, currency: 'EUR' },
        targetDate: '2026-10-01',
        status: 'active',
        source: 'manual',
        createdAtMs: Date.UTC(2026, 0, 1),
        updatedAtMs: Date.UTC(2026, 0, 1),
      }),
    );
    const mutation = t.withIdentity({ subject: userId });

    await mutation.mutation(api.banking.planning.setMoneyBoxStatus, { moneyBoxId, status: 'archived' });
    expect((await t.run((ctx) => ctx.db.get('moneyBoxes', moneyBoxId)))?.status).toBe('archived');
    await mutation.mutation(api.banking.planning.setMoneyBoxStatus, { moneyBoxId, status: 'active' });
    expect((await t.run((ctx) => ctx.db.get('moneyBoxes', moneyBoxId)))?.status).toBe('active');
  });

  test('associates and reassigns an unmatched transfer without duplicating its contribution', async () => {
    const t = createTest();
    const userId = 'user_money_box_transfer';
    await seedAuthKitUser(t, userId);
    const { accountId, providerConnectionId } = await seedAccountWithBalance(t, userId);
    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const firstMoneyBoxId = await ctx.db.insert('moneyBoxes', {
        userId,
        name: 'Insurance',
        targetAmount: { amountMinor: 50000n, currency: 'EUR' },
        savedAmount: { amountMinor: 0n, currency: 'EUR' },
        targetDate: '2026-08-01',
        status: 'active',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const secondMoneyBoxId = await ctx.db.insert('moneyBoxes', {
        userId,
        name: 'Holiday',
        targetAmount: { amountMinor: 100000n, currency: 'EUR' },
        savedAmount: { amountMinor: 500n, currency: 'EUR' },
        targetDate: '2026-12-01',
        status: 'active',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const transactionId = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: 'money_box_transfer',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 12000n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'Transfer to pocket',
        classificationKind: 'transfer',
        classificationSource: 'user',
        importedAtMs: now,
        updatedAtMs: now,
      });
      return { firstMoneyBoxId, secondMoneyBoxId, transactionId };
    });
    const mutation = t.withIdentity({ subject: userId });

    await mutation.mutation(api.banking.planning.associateTransferWithMoneyBox, {
      transactionId: ids.transactionId,
      moneyBoxId: ids.firstMoneyBoxId,
    });
    await mutation.mutation(api.banking.planning.associateTransferWithMoneyBox, {
      transactionId: ids.transactionId,
      moneyBoxId: ids.secondMoneyBoxId,
    });

    const result = await t.run(async (ctx) => ({
      first: await ctx.db.get('moneyBoxes', ids.firstMoneyBoxId),
      second: await ctx.db.get('moneyBoxes', ids.secondMoneyBoxId),
      contributions: await ctx.db
        .query('moneyBoxContributions')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', ids.transactionId))
        .take(2),
    }));
    expect(result.first?.savedAmount.amountMinor).toBe(0n);
    expect(result.second?.savedAmount.amountMinor).toBe(12500n);
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0].moneyBoxId).toBe(ids.secondMoneyBoxId);
  });

  test('associates an unmatched CRDT transfer as a money box withdrawal', async () => {
    const t = createTest();
    const userId = 'user_money_box_credit_withdrawal';
    await seedAuthKitUser(t, userId);
    const ids = await seedCreditTransferMoneyBoxScenario(t, userId, { firstSavedAmount: 20000n });

    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.associateTransferWithMoneyBox, {
      transactionId: ids.transactionId,
      moneyBoxId: ids.firstMoneyBoxId,
    });

    const result = await t.run(async (ctx) => ({
      moneyBox: await ctx.db.get('moneyBoxes', ids.firstMoneyBoxId),
      contributions: await ctx.db
        .query('moneyBoxContributions')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', ids.transactionId))
        .take(2),
    }));
    expect(result.moneyBox?.savedAmount.amountMinor).toBe(15000n);
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0].amount).toEqual({ amountMinor: -5000n, currency: 'EUR' });
  });

  test('rejects a CRDT money box withdrawal that exceeds saved funds', async () => {
    const t = createTest();
    const userId = 'user_money_box_credit_insufficient';
    await seedAuthKitUser(t, userId);
    const ids = await seedCreditTransferMoneyBoxScenario(t, userId, { firstSavedAmount: 4999n });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.associateTransferWithMoneyBox, {
        transactionId: ids.transactionId,
        moneyBoxId: ids.firstMoneyBoxId,
      }),
    ).rejects.toThrow('Money box does not have enough saved funds');

    const result = await t.run(async (ctx) => ({
      moneyBox: await ctx.db.get('moneyBoxes', ids.firstMoneyBoxId),
      contributions: await ctx.db
        .query('moneyBoxContributions')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', ids.transactionId))
        .take(1),
    }));
    expect(result.moneyBox?.savedAmount.amountMinor).toBe(4999n);
    expect(result.contributions).toHaveLength(0);
  });

  test('reassociates a CRDT withdrawal by restoring the first money box and debiting the second', async () => {
    const t = createTest();
    const userId = 'user_money_box_credit_reassociation';
    await seedAuthKitUser(t, userId);
    const ids = await seedCreditTransferMoneyBoxScenario(t, userId, {
      firstSavedAmount: 15000n,
      secondSavedAmount: 12000n,
    });
    const mutation = t.withIdentity({ subject: userId });

    await mutation.mutation(api.banking.planning.associateTransferWithMoneyBox, {
      transactionId: ids.transactionId,
      moneyBoxId: ids.firstMoneyBoxId,
    });
    await mutation.mutation(api.banking.planning.associateTransferWithMoneyBox, {
      transactionId: ids.transactionId,
      moneyBoxId: ids.secondMoneyBoxId,
    });

    const result = await t.run(async (ctx) => ({
      first: await ctx.db.get('moneyBoxes', ids.firstMoneyBoxId),
      second: await ctx.db.get('moneyBoxes', ids.secondMoneyBoxId),
      contributions: await ctx.db
        .query('moneyBoxContributions')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', ids.transactionId))
        .take(2),
    }));
    expect(result.first?.savedAmount.amountMinor).toBe(15000n);
    expect(result.second?.savedAmount.amountMinor).toBe(7000n);
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0]).toMatchObject({
      moneyBoxId: ids.secondMoneyBoxId,
      amount: { amountMinor: -5000n, currency: 'EUR' },
    });
  });

  test('returns cycle contributions to date without adding cashflow rows or changing balances', async () => {
    const t = createTest();
    const userId = 'user_money_box_accrual';
    const { accountId } = await seedAccountWithBalance(t, userId, { amountMinor: 100000n, currency: 'EUR' });
    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const associatedId = await ctx.db.insert('moneyBoxes', {
        userId,
        accountId,
        name: 'Holiday',
        targetAmount: { amountMinor: 120000n, currency: 'EUR' },
        savedAmount: { amountMinor: 20000n, currency: 'EUR' },
        targetDate: '2026-12-01',
        status: 'active',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const unassociatedId = await ctx.db.insert('moneyBoxes', {
        userId,
        name: 'Buffer',
        targetAmount: { amountMinor: 60000n, currency: 'EUR' },
        savedAmount: { amountMinor: 0n, currency: 'EUR' },
        targetDate: '2026-12-01',
        status: 'active',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId: associatedId,
        amount: { amountMinor: 3000n, currency: 'EUR' },
        contributionDate: '2026-07-15',
        source: 'manual',
        createdAtMs: now,
      });
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId: associatedId,
        amount: { amountMinor: 9000n, currency: 'EUR' },
        contributionDate: '2026-06-30',
        source: 'manual',
        createdAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId,
        name: 'Rent',
        note: 'Landlord reference 42',
        amount: { amountMinor: 10000n, currency: 'EUR' },
        dueDate: '2026-07-20',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { associatedId, unassociatedId };
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-11',
      limit: 20,
    });
    const associated = view.fundingItems.find((item) => item.moneyBoxId === ids.associatedId);
    const unassociated = view.fundingItems.find((item) => item.moneyBoxId === ids.unassociatedId);
    const group = view.accountGroups.find((item) => item.accountId === accountId);

    expect(associated?.accountId).toBe(accountId);
    expect(associated?.cycleContributedAmount).toEqual({ amountMinor: 0n, currency: 'EUR' });
    expect(associated?.monthlyRequiredAmount.amountMinor).toBe(17167n);
    expect(unassociated?.accountId).toBeUndefined();
    expect(group?.items).toHaveLength(1);
    expect(group?.items[0]).toMatchObject({ source: 'plannedExpense', note: 'Landlord reference 42' });
    expect(group?.projectedEndBalance).toEqual({ amountMinor: 90000n, currency: 'EUR' });
  });
});

describe('ledger planned occurrences', () => {
  test('returns only the next occurrence of a weekly rule', async () => {
    const t = createTest();
    const userId = 'user_ledger_weekly_occurrence';
    const { accountId } = await seedAccountWithBalance(t, userId);
    const plannedTransactionId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      return await insertPlannedExpense(ctx, {
        userId,
        accountId,
        name: 'Weekly groceries',
        description: 'Saturday shop',
        note: 'Use the market voucher',
        amount: { amountMinor: 8500n, currency: 'EUR' },
        dueDate: '2026-07-04',
        recurrenceInterval: 'week',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const occurrences = await t.query(internal.banking.planning.listNextLedgerPlannedOccurrencesForUser, {
      userId,
      asOfDate: '2026-07-08',
    });

    expect(occurrences).toEqual([
      expect.objectContaining({
        plannedTransactionId,
        accountId,
        dueDate: '2026-07-11',
        note: 'Use the market voucher',
        recurrence: { interval: 'week', count: 1 },
      }),
    ]);
  });

  test('keeps an account-scoped ledger to rules on that account', async () => {
    const t = createTest();
    const userId = 'user_ledger_scoped_occurrences';
    const first = await seedAccountWithBalance(t, userId);
    const second = await seedAccountWithBalance(t, userId);
    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const firstRuleId = await insertPlannedExpense(ctx, {
        userId,
        accountId: first.accountId,
        name: 'First account rent',
        amount: { amountMinor: 100000n, currency: 'EUR' },
        dueDate: '2026-07-10',
        recurrenceInterval: 'month',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const secondRuleId = await insertPlannedExpense(ctx, {
        userId,
        accountId: second.accountId,
        name: 'Second account rent',
        amount: { amountMinor: 90000n, currency: 'EUR' },
        dueDate: '2026-07-09',
        recurrenceInterval: 'month',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { firstRuleId, secondRuleId };
    });

    const occurrences = await t.query(internal.banking.planning.listNextLedgerPlannedOccurrencesForUser, {
      userId,
      accountId: first.accountId,
      asOfDate: '2026-07-08',
    });

    expect(occurrences.map((occurrence) => occurrence.plannedTransactionId)).toEqual([ids.firstRuleId]);
    expect(occurrences.map((occurrence) => occurrence.plannedTransactionId)).not.toContain(ids.secondRuleId);
  });

  test('advances past an occurrence already recorded as paid', async () => {
    const t = createTest();
    const userId = 'user_ledger_paid_occurrence';
    const { accountId } = await seedAccountWithBalance(t, userId);
    const plannedTransactionId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const ruleId = await insertPlannedExpense(ctx, {
        userId,
        accountId,
        name: 'Weekly allowance',
        amount: { amountMinor: 2000n, currency: 'EUR' },
        dueDate: '2026-07-08',
        recurrenceInterval: 'week',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('plannedExpenseOccurrencePayments', {
        userId,
        plannedTransactionId: ruleId,
        dueDate: '2026-07-08',
        status: 'paid',
        source: 'manual',
        paidAtMs: now,
        updatedAtMs: now,
      });
      return ruleId;
    });

    const occurrences = await t.query(internal.banking.planning.listNextLedgerPlannedOccurrencesForUser, {
      userId,
      asOfDate: '2026-07-08',
    });

    expect(occurrences).toEqual([
      expect.objectContaining({
        plannedTransactionId,
        dueDate: '2026-07-15',
      }),
    ]);
    expect(occurrences.some((occurrence) => occurrence.dueDate === '2026-07-08')).toBe(false);
  });
});

describe('future cashflow summary', () => {
  test('includes one-off scheduled transactions in cashflow and safe to spend', async () => {
    const t = createTest();
    const userId = 'user_scheduled_transaction_cashflow';
    const { accountId, providerConnectionId } = await seedAccountWithBalance(t, userId);
    const { scheduledOutflowId, scheduledInflowId } = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const outflowId = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: 'scheduled_utility_bill',
        status: 'SCHD',
        direction: 'DBIT',
        amount: { amountMinor: 2500n, currency: 'EUR' },
        bookingDate: '2026-07-15',
        description: 'Utility bill',
        counterpartyName: 'Energy supplier',
        classificationKind: 'expense',
        classificationSource: 'user',
        importedAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: 'booked_utility_bill',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 1000n, currency: 'EUR' },
        bookingDate: '2026-06-30',
        description: 'Past utility bill',
        classificationKind: 'expense',
        classificationSource: 'user',
        importedAtMs: now,
        updatedAtMs: now,
      });
      const inflowId = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: 'scheduled_refund',
        status: 'SCHD',
        direction: 'CRDT',
        amount: { amountMinor: -4000n, currency: 'EUR' },
        bookingDate: '2026-07-20',
        description: 'Scheduled refund',
        classificationKind: 'income',
        classificationSource: 'user',
        importedAtMs: now,
        updatedAtMs: now,
      });
      return { scheduledOutflowId: outflowId, scheduledInflowId: inflowId };
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 10,
    });
    const scheduledItems = summary.upcomingItems.filter((item) => item.source === 'scheduledTransaction');

    expect(scheduledItems).toHaveLength(2);
    expect(scheduledItems.find((item) => item.transactionId === scheduledOutflowId)).toMatchObject({
      key: `scheduled:${scheduledOutflowId}`,
      source: 'scheduledTransaction',
      direction: 'outflow',
      dueDate: '2026-07-15',
      amount: { amountMinor: 2500n, currency: 'EUR' },
      transactionId: scheduledOutflowId,
    });
    expect(scheduledItems.find((item) => item.transactionId === scheduledInflowId)).toMatchObject({
      key: `scheduled:${scheduledInflowId}`,
      source: 'scheduledTransaction',
      direction: 'inflow',
      dueDate: '2026-07-20',
      amount: { amountMinor: 4000n, currency: 'EUR' },
      transactionId: scheduledInflowId,
    });
    expect(summary.upcomingItems.some((item) => item.title === 'Past utility bill')).toBe(false);

    const [safeToSpend] = await t.query(internal.banking.safeToSpend.getSafeToSpendForUser, {
      userId,
      asOfDate: '2026-07-01',
    });

    expect(safeToSpend.committedOutflows).toEqual({ amountMinor: 2500n, currency: 'EUR' });
    expect(safeToSpend.expectedIncome).toEqual({ amountMinor: 4000n, currency: 'EUR' });
    expect(safeToSpend.safeToSpend).toEqual({ amountMinor: 7500n, currency: 'EUR' });
    expect(safeToSpend.safeToSpendWithIncome).toEqual({ amountMinor: 11500n, currency: 'EUR' });
    expect(safeToSpend.topUpcoming).toEqual([
      {
        name: 'Utility bill',
        dueDate: '2026-07-15',
        amount: { amountMinor: 2500n, currency: 'EUR' },
        kind: 'scheduledTransaction',
      },
    ]);
  });

  test('combines planned expenses, subscriptions, credit installments, and monthly money-box funding', async () => {
    const t = createTest();
    const userId = 'user_test';

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const creditFacilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Acme Flex',
        facilityType: 'additionalCardCreditLine',
        status: 'active',
        source: 'manual',
        provider: 'manual',
        limitAmount: {
          amountMinor: 100000n,
          currency: 'EUR',
        },
        usedAmount: {
          amountMinor: 20000n,
          currency: 'EUR',
        },
        repaymentType: 'installmentPlan',
        createdAtMs: now,
        updatedAtMs: now,
      });

      await insertPlannedExpense(ctx, {
        userId,
        name: 'Annual insurance',
        amount: {
          amountMinor: 72000n,
          currency: 'EUR',
        },
        dueDate: '2026-08-10',
        status: 'funding',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('subscriptions', {
        userId,
        name: 'Acme Streaming',
        merchantName: 'Acme Streaming',
        amount: {
          amountMinor: 1299n,
          currency: 'EUR',
        },
        interval: 'month',
        intervalCount: 1,
        status: 'active',
        startDate: '2026-01-15',
        nextDueDate: '2026-06-15',
        trialPeriodDays: 0,
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityInstallmentPlans', {
        userId,
        creditFacilityId,
        name: 'Sofa purchase',
        principalAmount: {
          amountMinor: 20000n,
          currency: 'EUR',
        },
        outstandingAmount: {
          amountMinor: 20000n,
          currency: 'EUR',
        },
        monthlyPaymentAmount: {
          amountMinor: 10000n,
          currency: 'EUR',
        },
        installmentCount: 2,
        remainingInstallments: 2,
        startDate: '2026-06-01',
        nextPaymentDate: '2026-07-01',
        endDate: '2026-08-01',
        status: 'active',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('moneyBoxes', {
        userId,
        name: 'Annual insurance',
        targetAmount: {
          amountMinor: 72000n,
          currency: 'EUR',
        },
        savedAmount: {
          amountMinor: 12000n,
          currency: 'EUR',
        },
        targetDate: '2026-08-10',
        status: 'active',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-06-01',
      monthsAhead: 3,
      limit: 10,
    });

    expect(summary.horizonDate).toBe('2026-09-01');
    expect(summary.upcomingTotals).toEqual([
      {
        amountMinor: 95897n,
        currency: 'EUR',
      },
    ]);
    expect(summary.monthlyFundingTotals).toEqual([
      {
        amountMinor: 20000n,
        currency: 'EUR',
      },
    ]);
    expect(summary.upcomingItems.map((item) => item.source)).toEqual([
      'subscription',
      'creditInstallment',
      'subscription',
      'creditInstallment',
      'plannedExpense',
      'subscription',
    ]);
    expect(summary.fundingItems[0]?.name).toBe('Annual insurance');
    expect(summary.fundingItems[0]?.monthlyRequiredAmount.amountMinor).toBe(20000n);
    expect(summary.fundingItems[0]?.fundingStatus).toBe('behind');
  });

  test('groups credit installments by facility and due date in future cashflow', async () => {
    const t = createTest();
    const userId = 'user_test';

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const creditFacilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Acme Flex Line Premium',
        facilityType: 'additionalCardCreditLine',
        status: 'active',
        source: 'manual',
        provider: 'manual',
        limitAmount: {
          amountMinor: 500000n,
          currency: 'EUR',
        },
        usedAmount: {
          amountMinor: 15370n,
          currency: 'EUR',
        },
        repaymentType: 'installmentPlan',
        createdAtMs: now,
        updatedAtMs: now,
      });

      for (const plan of [
        { name: 'Wise', amountMinor: 6183n },
        { name: 'TransferWise', amountMinor: 3091n },
        { name: 'Wise subscription', amountMinor: 6096n },
      ]) {
        await ctx.db.insert('creditFacilityInstallmentPlans', {
          userId,
          creditFacilityId,
          name: plan.name,
          principalAmount: {
            amountMinor: plan.amountMinor,
            currency: 'EUR',
          },
          outstandingAmount: {
            amountMinor: plan.amountMinor,
            currency: 'EUR',
          },
          monthlyPaymentAmount: {
            amountMinor: plan.amountMinor,
            currency: 'EUR',
          },
          installmentCount: 3,
          remainingInstallments: 3,
          startDate: '2026-06-05',
          nextPaymentDate: '2026-07-05',
          endDate: '2026-10-05',
          status: 'active',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 10,
    });

    expect(summary.upcomingItems).toHaveLength(1);
    expect(summary.upcomingItems[0]?.title).toBe('Acme Flex Line Premium');
    expect(summary.upcomingItems[0]?.amount.amountMinor).toBe(15370n);
    expect(summary.upcomingItems[0]?.creditPlanCount).toBe(3);
    expect(summary.upcomingItems[0]?.creditInstallmentDetails?.map((detail) => detail.amount.amountMinor).sort()).toEqual([
      3091n,
      6096n,
      6183n,
    ]);
  });

  test('routes CARD-linked installments to the settlement account group', async () => {
    const t = createTest();
    const userId = 'card_installment_settlement_user';
    const ids = await seedInstallmentRoutingFixture(t, userId, {
      cardLinked: true,
      withSettlementAccount: true,
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 10,
    });
    const settlementGroup = summary.upcomingItemsByAccount.find(
      (group) => group.accountId === ids.checkingAccountId,
    );
    const cardGroup = summary.upcomingItemsByAccount.find((group) => group.accountId === ids.cardAccountId);

    expect(settlementGroup?.items).toMatchObject([
      {
        source: 'creditInstallment',
        creditFacilityId: ids.facilityId,
        amount: { amountMinor: 40_000n, currency: 'EUR' },
      },
    ]);
    expect(cardGroup).toBeDefined();
    expect(cardGroup?.items.some((item) => item.source === 'creditInstallment')).toBe(false);
  });

  test('routes loan installments to the settlement account and not the unknown group', async () => {
    const t = createTest();
    const userId = 'loan_installment_settlement_user';
    const ids = await seedInstallmentRoutingFixture(t, userId, {
      cardLinked: false,
      loan: true,
      withSettlementAccount: true,
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 10,
    });
    const settlementGroup = summary.upcomingItemsByAccount.find(
      (group) => group.accountId === ids.checkingAccountId,
    );
    const unknownGroup = summary.upcomingItemsByAccount.find((group) => group.accountId === 'unknown');

    expect(settlementGroup?.items).toMatchObject([
      {
        source: 'creditInstallment',
        creditFacilityId: ids.facilityId,
        amount: { amountMinor: 40_000n, currency: 'EUR' },
      },
    ]);
    expect(
      unknownGroup?.items.some(
        (item) => item.source === 'creditInstallment' && item.creditFacilityId === ids.facilityId,
      ) ?? false,
    ).toBe(false);
  });

  test('routes CARD-linked installments without a settlement account to the unknown group', async () => {
    const t = createTest();
    const userId = 'card_installment_unknown_user';
    const ids = await seedInstallmentRoutingFixture(t, userId, { cardLinked: true });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 10,
    });
    const unknownGroup = summary.upcomingItemsByAccount.find((group) => group.accountId === 'unknown');

    expect(unknownGroup?.items).toMatchObject([
      {
        source: 'creditInstallment',
        creditFacilityId: ids.facilityId,
        amount: { amountMinor: 40_000n, currency: 'EUR' },
      },
    ]);
  });

  test('keeps non-card installments on their linked account group', async () => {
    const t = createTest();
    const userId = 'linked_installment_user';
    const ids = await seedInstallmentRoutingFixture(t, userId, { cardLinked: false });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 10,
    });
    const linkedGroup = summary.upcomingItemsByAccount.find((group) => group.accountId === ids.checkingAccountId);

    expect(linkedGroup?.items).toMatchObject([
      {
        source: 'creditInstallment',
        creditFacilityId: ids.facilityId,
        amount: { amountMinor: 40_000n, currency: 'EUR' },
      },
    ]);
  });

  test('includes closed credit card statement cycles as scheduled cashflow', async () => {
    const t = createTest();
    const userId = 'user_test';

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'checking_account',
        name: 'Checking',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const creditFacilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Acme Flex',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        linkedAccountId: seededAccountId,
        provider: 'manual',
        limitAmount: {
          amountMinor: 300000n,
          currency: 'EUR',
        },
        usedAmount: {
          amountMinor: 0n,
          currency: 'EUR',
        },
        repaymentType: 'statementBalance',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId,
        cycleMonth: '2026-06',
        status: 'scheduled',
        trackedAmount: {
          amountMinor: 45670n,
          currency: 'EUR',
        },
        dueDate: '2026-07-10',
        closedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 10,
    });

    expect(summary.upcomingItems).toHaveLength(1);
    expect(summary.upcomingItems[0]).toMatchObject({
      source: 'creditStatement',
      title: 'Acme Flex',
      dueDate: '2026-07-10',
      creditCycleMonth: '2026-06',
    });
    expect(summary.upcomingTotals).toEqual([
      {
        amountMinor: 45670n,
        currency: 'EUR',
      },
    ]);
  });

  test('projects open card usage and replaces it with the scheduled statement without double counting', async () => {
    const t = createTest();
    const userId = 'card_projection_user';
    const { accountId } = await seedAccountWithBalance(t, userId);
    const now = new Date();
    const cycleMonth = now.toISOString().slice(0, 7);
    const dueMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
    const dueDate = `${dueMonth}-15`;
    const facilityId = await t.run(async (ctx) =>
      await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Projection card',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        linkedAccountId: accountId,
        provider: 'manual',
        limitAmount: { amountMinor: 100000n, currency: 'EUR' },
        usedAmount: { amountMinor: 12345n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        paymentDayOfMonth: 15,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }),
    );

    const projection = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: `${dueMonth}-01`,
      horizonDate: `${dueMonth}-28`,
      limit: 10,
    });
    expect(projection.upcomingItems).toMatchObject([
      { key: `creditStatementProjection:${facilityId}:${dueDate}`, source: 'creditStatement', dueDate, amount: { amountMinor: 12345n, currency: 'EUR' } },
    ]);

    await t.run(async (ctx) => {
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId: facilityId,
        cycleMonth,
        status: 'scheduled',
        trackedAmount: { amountMinor: 12345n, currency: 'EUR' },
        dueDate,
        closedAtMs: Date.now(),
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    });
    const scheduled = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: `${dueMonth}-01`,
      horizonDate: `${dueMonth}-28`,
      limit: 10,
    });
    expect(scheduled.upcomingItems).toHaveLength(1);
    expect(scheduled.upcomingItems[0]?.key).toMatch(/^creditStatement:/);
    expect(scheduled.upcomingTotals).toEqual([{ amountMinor: 12345n, currency: 'EUR' }]);
  });

  test('does not project statement usage for overdrafts or additional card credit lines', async () => {
    const t = createTest();
    const userId = 'card_projection_types_user';
    const { accountId } = await seedAccountWithBalance(t, userId);
    const now = new Date();
    const dueMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
    await t.run(async (ctx) => {
      for (const facilityType of ['accountOverdraft', 'additionalCardCreditLine'] as const) {
        await ctx.db.insert('creditFacilities', {
          userId,
          name: `No projection ${facilityType}`,
          facilityType,
          status: 'active',
          source: 'manual',
          linkedAccountId: accountId,
          provider: 'manual',
          limitAmount: { amountMinor: 300000n, currency: 'EUR' },
          usedAmount: { amountMinor: 55555n, currency: 'EUR' },
          repaymentType: 'statementBalance',
          paymentDayOfMonth: 15,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        });
      }
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: `${dueMonth}-01`,
      horizonDate: `${dueMonth}-28`,
      limit: 10,
    });
    expect(summary.upcomingItems).toHaveLength(0);

    const swept = await t.mutation(internal.banking.credit.autoCloseDueUsageCycles, {});
    expect(swept.closed).toBe(0);
  });

  test('expands weekly planned expenses across the monthly horizon and account groups', async () => {
    const t = createTest();
    const userId = 'user_test';

    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'acme-personal',
        name: 'Acme Personal',
        alias: 'Personal',
        institutionName: 'Acme Bank',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });

      await insertPlannedExpense(ctx, {
          userId,
          accountId: seededAccountId,
        name: 'Weekly allowance',
        amount: {
          amountMinor: 2000n,
          currency: 'EUR',
        },
        dueDate: '2026-06-28',
        recurrenceInterval: 'week',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });

      return { accountId: seededAccountId };
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      monthsAhead: 1,
      limit: 20,
    });

    const weeklyItems = summary.upcomingItems.filter((item) => item.title === 'Weekly allowance');

    expect(weeklyItems.map((item) => item.dueDate)).toEqual([
      '2026-07-05',
      '2026-07-12',
      '2026-07-19',
      '2026-07-26',
    ]);
    expect(summary.upcomingTotals).toEqual([
      {
        amountMinor: 8000n,
        currency: 'EUR',
      },
    ]);

    const accountGroup = summary.upcomingItemsByAccount.find((group) => group.accountId === ids.accountId);
    expect(accountGroup?.items.map((item) => item.dueDate)).toEqual([
      '2026-07-05',
      '2026-07-12',
      '2026-07-19',
      '2026-07-26',
    ]);
    expect(accountGroup?.totals).toEqual([
      {
        amountMinor: 8000n,
        currency: 'EUR',
      },
    ]);
  });

  test('includes the first fixed Saturday occurrence when the weekly series starts tomorrow', async () => {
    const t = createTest();
    const userId = 'user_test';

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 3);

      await insertPlannedExpense(ctx, {
        userId,
        name: 'Weekly taxes transfer',
        amount: {
          amountMinor: 42247n,
          currency: 'EUR',
        },
        dueDate: '2026-07-04',
        recurrenceInterval: 'week',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-03',
      horizonDate: '2026-07-31',
      limit: 20,
    });

    const weeklyItems = summary.upcomingItems.filter((item) => item.title === 'Weekly taxes transfer');

    expect(weeklyItems.map((item) => item.dueDate)).toEqual([
      '2026-07-04',
      '2026-07-11',
      '2026-07-18',
      '2026-07-25',
    ]);
  });

  test('resumes fixed Saturday planned expenses that started before the monthly horizon', async () => {
    const t = createTest();
    const userId = 'user_test';

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 5, 20);

      await insertPlannedExpense(ctx, {
        userId,
        name: 'Weekly tax reserve',
        amount: {
          amountMinor: 42247n,
          currency: 'EUR',
        },
        dueDate: '2026-06-20',
        recurrenceInterval: 'week',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 20,
    });

    const weeklyItems = summary.upcomingItems.filter((item) => item.title === 'Weekly tax reserve');

    expect(weeklyItems.map((item) => item.dueDate)).toEqual([
      '2026-07-04',
      '2026-07-11',
      '2026-07-18',
      '2026-07-25',
    ]);
  });

  test('uses an explicit calendar month horizon without including the next month', async () => {
    const t = createTest();
    const userId = 'user_test';

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);

      await ctx.db.insert('subscriptions', {
        userId,
        name: 'Acme Telecom',
        merchantName: 'Acme Telecom',
        amount: {
          amountMinor: 2895n,
          currency: 'EUR',
        },
        interval: 'month',
        intervalCount: 1,
        status: 'active',
        startDate: '2026-07-01',
        nextDueDate: '2026-07-01',
        trialPeriodDays: 0,
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        name: 'Insurance',
        amount: {
          amountMinor: 1454n,
          currency: 'EUR',
        },
        dueDate: '2026-07-20',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 10,
    });

    expect(summary.horizonDate).toBe('2026-07-31');
    expect(summary.upcomingItems.map((item) => `${item.title}:${item.dueDate}`)).toEqual([
      'Acme Telecom:2026-07-01',
      'Insurance:2026-07-20',
    ]);
  });

  test('excludes paid planned expenses and completed money boxes from active planning', async () => {
    const t = createTest();
    const userId = 'user_test';

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);

      await insertPlannedExpense(ctx, {
        userId,
        name: 'Paid condominium installment',
        amount: {
          amountMinor: 42890n,
          currency: 'EUR',
        },
        dueDate: '2026-07-01',
        status: 'paid',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });

      await ctx.db.insert('moneyBoxes', {
        userId,
        name: 'Paid condominium installment',
        targetAmount: {
          amountMinor: 42890n,
          currency: 'EUR',
        },
        savedAmount: {
          amountMinor: 42890n,
          currency: 'EUR',
        },
        targetDate: '2026-07-01',
        status: 'completed',
        source: 'plannedExpense',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 10,
    });

    expect(summary.upcomingItems).toEqual([]);
    expect(summary.fundingItems).toEqual([]);
  });

  test('does not infer payment for an unlearned manual outflow', async () => {
    const t = createTest();
    const userId = 'user_reconciled_outflow';
    const ids = await seedAccountWithBalance(t, userId);

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 6);
      await insertPlannedExpense(ctx, {
        userId,
        accountId: ids.accountId,
        name: 'Rent',
        amount: {
          amountMinor: 3000n,
          currency: 'EUR',
        },
        dueDate: '2026-07-09',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('transactions', {
        userId,
        accountId: ids.accountId,
        providerConnectionId: ids.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'rent_paid_early',
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: 3000n,
          currency: 'EUR',
        },
        bookingDate: '2026-07-04',
        description: 'Rent',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-06',
      horizonDate: '2026-07-31',
      limit: 10,
    });
    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === ids.accountId);

    expect(summary.upcomingItems[0]?.occurrencePayment).toBeUndefined();
    expect(summary.upcomingTotals).toEqual([{ amountMinor: 3000n, currency: 'EUR' }]);
    expect(summary.upcomingItemsByAccount[0]?.totals).toEqual([{ amountMinor: 3000n, currency: 'EUR' }]);
    expect(group?.projectedEndBalance?.amountMinor).toBe(7000n);
    expect(group?.items[0]?.projectedBalanceAfter?.amountMinor).toBe(7000n);
  });

  test('does not infer payment for an unlearned manual inflow', async () => {
    const t = createTest();
    const userId = 'user_reconciled_inflow';
    const ids = await seedAccountWithBalance(t, userId);

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 6);
      await insertPlannedExpense(ctx, {
        userId,
        accountId: ids.accountId,
        name: 'Salary',
        amount: {
          amountMinor: 5000n,
          currency: 'EUR',
        },
        direction: 'inflow',
        dueDate: '2026-07-09',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('transactions', {
        userId,
        accountId: ids.accountId,
        providerConnectionId: ids.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'salary_paid_early',
        status: 'BOOK',
        direction: 'CRDT',
        amount: {
          amountMinor: 5000n,
          currency: 'EUR',
        },
        bookingDate: '2026-07-04',
        description: 'Salary',
        classificationKind: 'income',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === ids.accountId);

    expect(group?.items[0]?.occurrencePayment).toBeUndefined();
    expect(group?.projectedEndBalance?.amountMinor).toBe(15000n);
    expect(group?.items[0]?.projectedBalanceAfter?.amountMinor).toBe(15000n);
  });

  test('does not infer recurring payments before a merchant is learned', async () => {
    const t = createTest();
    const userId = 'user_reconciled_recurring';
    const ids = await seedAccountWithBalance(t, userId);

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 6);
      await insertPlannedExpense(ctx, {
        userId,
        accountId: ids.accountId,
        name: 'Weekly allowance',
        amount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        dueDate: '2026-07-09',
        recurrenceInterval: 'week',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('transactions', {
        userId,
        accountId: ids.accountId,
        providerConnectionId: ids.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'allowance_paid_early',
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        bookingDate: '2026-07-04',
        description: 'Weekly allowance',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === ids.accountId);

    expect(group?.items.map((item) => Boolean(item.occurrencePayment))).toEqual([false, false, false, false]);
    expect(group?.totals).toEqual([{ amountMinor: 4000n, currency: 'EUR' }]);
    expect(group?.items.map((item) => item.projectedBalanceAfter?.amountMinor)).toEqual([
      9000n,
      8000n,
      7000n,
      6000n,
    ]);
  });

  test('keeps the real July allowance occurrences unpaid without an explicitly learned merchant', async () => {
    const t = createTest();
    const userId = 'user_recurring_previous_occurrences';
    const ids = await seedAccountWithBalance(t, userId);

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 8);
      await insertPlannedExpense(ctx, {
        userId,
        accountId: ids.accountId,
        name: 'Acme Allowance',
        amount: {
          amountMinor: 2000n,
          currency: 'EUR',
        },
        dueDate: '2026-07-11',
        recurrenceInterval: 'week',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });

      for (const transaction of [
        { bookingDate: '2026-06-27', amountMinor: 2000n, merchant: 'Alex Rivera' },
        { bookingDate: '2026-07-04', amountMinor: 2000n, merchant: 'Alex Rivera' },
        { bookingDate: '2026-07-06', amountMinor: 2196n, merchant: 'Anthropic Claude' },
      ]) {
        await ctx.db.insert('transactions', {
          userId,
          accountId: ids.accountId,
          providerConnectionId: ids.providerConnectionId,
          provider: 'mock',
          dedupeKey: `${transaction.merchant}_${transaction.bookingDate}`,
          status: 'BOOK',
          direction: 'DBIT',
          amount: {
            amountMinor: transaction.amountMinor,
            currency: 'EUR',
          },
          bookingDate: transaction.bookingDate,
          description: transaction.merchant,
          counterpartyName: transaction.merchant,
          classificationKind: 'expense',
          classificationSource: 'provider',
          importedAtMs: now,
          updatedAtMs: now,
        });
      }
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-08',
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === ids.accountId);

    expect(group?.items.map((item) => item.dueDate)).toEqual([
      '2026-07-11',
      '2026-07-18',
      '2026-07-25',
    ]);
    expect(group?.items.map((item) => item.occurrencePayment)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(group?.totals).toEqual([{ amountMinor: 6000n, currency: 'EUR' }]);
    expect(group?.items.map((item) => item.projectedBalanceAfter?.amountMinor)).toEqual([
      8000n,
      6000n,
      4000n,
    ]);
  });

  test('learns a merchant from an explicit link and automatically pays only the owned future occurrence', async () => {
    const t = createTest();
    const userId = 'user_occurrence_learning';
    await seedAuthKitUser(t, userId);
    const ids = await seedAccountWithBalance(t, userId);
    const seeded = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 8);
      const plannedExpenseId = await insertPlannedExpense(ctx, {
        userId,
        accountId: ids.accountId,
        name: 'Acme Allowance',
        amount: { amountMinor: 2000n, currency: 'EUR' },
        dueDate: '2026-07-04',
        recurrenceInterval: 'week',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const linkedTransactionId = await ctx.db.insert('transactions', {
        userId,
        accountId: ids.accountId,
        providerConnectionId: ids.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'acme_2026-07-04',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 2000n, currency: 'EUR' },
        bookingDate: '2026-07-04',
        description: 'Alex Rivera',
        counterpartyName: 'Alex Rivera',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('transactions', {
        userId,
        accountId: ids.accountId,
        providerConnectionId: ids.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'anthropic_2026-07-03',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 2196n, currency: 'EUR' },
        bookingDate: '2026-07-03',
        description: 'Anthropic Claude',
        counterpartyName: 'Anthropic Claude',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
      return { plannedExpenseId, linkedTransactionId };
    });

    const candidates = await t
      .withIdentity({ subject: userId })
      .query(api.banking.planning.listPlannedExpensePaymentCandidates, {
        plannedExpenseId: seeded.plannedExpenseId,
        dueDate: '2026-07-04',
        limit: 20,
      });
    expect(candidates.map((transaction) => transaction._id)).toEqual([seeded.linkedTransactionId]);

    await t.withIdentity({ subject: userId }).mutation(
      api.banking.planning.linkPlannedExpenseOccurrenceTransaction,
      {
        plannedExpenseId: seeded.plannedExpenseId,
        dueDate: '2026-07-04',
        transactionId: seeded.linkedTransactionId,
      },
    );

    const automaticTransactionId = await t.run(async (ctx) => {
      const expense = await ctx.db.get('plannedTransactions', seeded.plannedExpenseId);
      expect(expense?.reconciliationMerchantKey).toBe('alexrivera');

      const now = Date.UTC(2026, 6, 8);
      const transactionId = await ctx.db.insert('transactions', {
        userId,
        accountId: ids.accountId,
        providerConnectionId: ids.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'acme_2026-07-08',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 2000n, currency: 'EUR' },
        bookingDate: '2026-07-08',
        description: 'Alex Rivera',
        counterpartyName: 'Alex Rivera',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
      const paymentId = await reconcileImportedTransactionWithPlannedExpenses(ctx, transactionId);
      expect(paymentId).toBeTruthy();
      expect(await reconcileImportedTransactionWithPlannedExpenses(ctx, transactionId)).toBe(paymentId);
      return transactionId;
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-08',
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === ids.accountId);

    expect(group?.items.map((item) => item.dueDate)).toEqual([
      '2026-07-11',
      '2026-07-18',
      '2026-07-25',
    ]);
    expect(group?.items.map((item) => item.occurrencePayment)).toEqual([
      { source: 'automatic', transactionId: automaticTransactionId },
      undefined,
      undefined,
    ]);
    expect(group?.totals).toEqual([{ amountMinor: 4000n, currency: 'EUR' }]);
  });

  test('does not automatically pay ambiguous, wrong-merchant, or incompatible learned expenses', async () => {
    const t = createTest();
    const userId = 'user_conservative_automatic_matching';
    const ids = await seedAccountWithBalance(t, userId);

    const transactionIds = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 8);
      for (const name of ['First allowance', 'Second allowance']) {
        await insertPlannedExpense(ctx, {
          userId,
          accountId: ids.accountId,
          name,
          amount: { amountMinor: 2000n, currency: 'EUR' },
          dueDate: '2026-07-11',
          recurrenceInterval: 'week',
          recurrenceIntervalCount: 1,
          status: 'planned',
          source: 'manual',
          reconciliationMerchantKey: 'alexrivera',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }

      const transactions = [
        { key: 'ambiguous', merchant: 'Alex Rivera', amountMinor: 2000n, classificationKind: 'expense' as const, status: 'BOOK' as const },
        { key: 'wrong_merchant', merchant: 'Anthropic Claude', amountMinor: 2000n, classificationKind: 'expense' as const, status: 'BOOK' as const },
        { key: 'wrong_amount', merchant: 'Alex Rivera', amountMinor: 2196n, classificationKind: 'expense' as const, status: 'BOOK' as const },
        { key: 'transfer', merchant: 'Alex Rivera', amountMinor: 2000n, classificationKind: 'transfer' as const, status: 'BOOK' as const },
        { key: 'pending', merchant: 'Alex Rivera', amountMinor: 2000n, classificationKind: 'expense' as const, status: 'PDNG' as const },
      ];
      const idsToReconcile: Array<Id<'transactions'>> = [];
      for (const transaction of transactions) {
        idsToReconcile.push(
          await ctx.db.insert('transactions', {
            userId,
            accountId: ids.accountId,
            providerConnectionId: ids.providerConnectionId,
            provider: 'mock',
            dedupeKey: transaction.key,
            status: transaction.status,
            direction: 'DBIT',
            amount: { amountMinor: transaction.amountMinor, currency: 'EUR' },
            bookingDate: '2026-07-08',
            description: transaction.merchant,
            counterpartyName: transaction.merchant,
            classificationKind: transaction.classificationKind,
            classificationSource: 'provider',
            importedAtMs: now,
            updatedAtMs: now,
          }),
        );
      }
      return idsToReconcile;
    });

    await t.run(async (ctx) => {
      for (const transactionId of transactionIds) {
        expect(await reconcileImportedTransactionWithPlannedExpenses(ctx, transactionId)).toBeNull();
      }
      const payments = await ctx.db
        .query('plannedExpenseOccurrencePayments')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'paid'))
        .take(20);
      expect(payments).toEqual([]);
    });
  });

  test('pays and reopens one recurring occurrence without closing the series', async () => {
    const t = createTest();
    const userId = 'user_manual_occurrence_payment';
    await seedAuthKitUser(t, userId);
    const ids = await seedAccountWithBalance(t, userId);
    const plannedExpenseId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 8);
      return await insertPlannedExpense(ctx, {
        userId,
        accountId: ids.accountId,
        name: 'Weekly allowance',
        amount: { amountMinor: 2000n, currency: 'EUR' },
        dueDate: '2026-07-11',
        recurrenceInterval: 'week',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.markPlannedExpenseOccurrencePaid, {
      plannedExpenseId,
      dueDate: '2026-07-11',
    });
    let view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-08',
      limit: 10,
    });
    let group = view.accountGroups.find((candidate) => candidate.accountId === ids.accountId);
    expect(group?.items.map((item) => item.occurrencePayment?.source)).toEqual(['manual', undefined, undefined]);
    expect((await t.run((ctx) => ctx.db.get('plannedTransactions', plannedExpenseId)))?.status).toBe('planned');

    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.reopenPlannedExpenseOccurrence, {
      plannedExpenseId,
      dueDate: '2026-07-11',
    });
    view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-08',
      limit: 10,
    });
    group = view.accountGroups.find((candidate) => candidate.accountId === ids.accountId);
    expect(group?.items.map((item) => item.occurrencePayment)).toEqual([undefined, undefined, undefined]);
  });

  test('closes and reopens a one-time expense and its money box through the occurrence API', async () => {
    const t = createTest();
    const userId = 'user_single_occurrence_payment';
    await seedAuthKitUser(t, userId);
    const ids = await seedAccountWithBalance(t, userId);
    const seeded = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 8);
      const plannedExpenseId = await insertPlannedExpense(ctx, {
        userId,
        accountId: ids.accountId,
        name: 'Annual insurance',
        amount: { amountMinor: 72000n, currency: 'EUR' },
        dueDate: '2026-07-11',
        status: 'funding',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const moneyBoxId = await ctx.db.insert('moneyBoxes', {
        userId,
        name: 'Annual insurance',
        targetAmount: { amountMinor: 72000n, currency: 'EUR' },
        savedAmount: { amountMinor: 10000n, currency: 'EUR' },
        targetDate: '2026-07-11',
        status: 'active',
        source: 'plannedExpense',
        plannedTransactionId: plannedExpenseId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.patch('plannedTransactions', plannedExpenseId, { moneyBoxId });
      return { moneyBoxId, plannedExpenseId };
    });

    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.markPlannedExpenseOccurrencePaid, {
      plannedExpenseId: seeded.plannedExpenseId,
      dueDate: '2026-07-11',
    });
    let state = await t.run(async (ctx) => ({
      expense: await ctx.db.get('plannedTransactions', seeded.plannedExpenseId),
      moneyBox: await ctx.db.get('moneyBoxes', seeded.moneyBoxId),
    }));
    expect(state.expense?.status).toBe('paid');
    expect(state.moneyBox?.status).toBe('completed');
    expect(state.moneyBox?.savedAmount.amountMinor).toBe(72000n);

    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.reopenPlannedExpenseOccurrence, {
      plannedExpenseId: seeded.plannedExpenseId,
      dueDate: '2026-07-11',
    });
    state = await t.run(async (ctx) => ({
      expense: await ctx.db.get('plannedTransactions', seeded.plannedExpenseId),
      moneyBox: await ctx.db.get('moneyBoxes', seeded.moneyBoxId),
    }));
    expect(state.expense?.status).toBe('funding');
    expect(state.moneyBox?.status).toBe('active');
  });

  test('does not reconcile amount, direction, account, or lookback mismatches', async () => {
    const t = createTest();
    const userId = 'user_reconcile_no_match';
    const ids = await seedAccountWithBalance(t, userId);
    const otherIds = await seedAccountWithBalance(t, `${userId}_other`);

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 6);
      await insertPlannedExpense(ctx, {
        userId,
        accountId: ids.accountId,
        name: 'Rent',
        amount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        dueDate: '2026-07-09',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      for (const transaction of [
        { dedupeKey: 'wrong_amount', accountId: ids.accountId, providerConnectionId: ids.providerConnectionId, direction: 'DBIT' as const, amountMinor: 3000n, bookingDate: '2026-07-04' },
        { dedupeKey: 'wrong_direction', accountId: ids.accountId, providerConnectionId: ids.providerConnectionId, direction: 'CRDT' as const, amountMinor: 1000n, bookingDate: '2026-07-04' },
        { dedupeKey: 'wrong_account', accountId: otherIds.accountId, providerConnectionId: otherIds.providerConnectionId, direction: 'DBIT' as const, amountMinor: 1000n, bookingDate: '2026-07-04' },
        { dedupeKey: 'outside_lookback', accountId: ids.accountId, providerConnectionId: ids.providerConnectionId, direction: 'DBIT' as const, amountMinor: 1000n, bookingDate: '2026-06-20' },
      ]) {
        await ctx.db.insert('transactions', {
          userId,
          accountId: transaction.accountId,
          providerConnectionId: transaction.providerConnectionId,
          provider: 'mock',
          dedupeKey: transaction.dedupeKey,
          status: 'BOOK',
          direction: transaction.direction,
          amount: {
            amountMinor: transaction.amountMinor,
            currency: 'EUR',
          },
          bookingDate: transaction.bookingDate,
          description: transaction.dedupeKey,
          classificationKind: transaction.direction === 'CRDT' ? 'income' : 'expense',
          classificationSource: 'provider',
          importedAtMs: now,
          updatedAtMs: now,
        });
      }
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === ids.accountId);

    expect(group?.items[0]?.occurrencePayment).toBeUndefined();
    expect(group?.totals).toEqual([{ amountMinor: 1000n, currency: 'EUR' }]);
    expect(group?.items[0]?.projectedBalanceAfter?.amountMinor).toBe(9000n);
  });

  test('does not infer either of two identical manual planned items', async () => {
    const t = createTest();
    const userId = 'user_reconcile_single_consume';
    const ids = await seedAccountWithBalance(t, userId);

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 6);
      for (const expense of [
        { name: 'First rent', dueDate: '2026-07-09' },
        { name: 'Second rent', dueDate: '2026-07-10' },
      ]) {
        await insertPlannedExpense(ctx, {
          userId,
          accountId: ids.accountId,
          name: expense.name,
          amount: {
            amountMinor: 1000n,
            currency: 'EUR',
          },
          dueDate: expense.dueDate,
          status: 'planned',
          source: 'manual',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }
      await ctx.db.insert('transactions', {
        userId,
        accountId: ids.accountId,
        providerConnectionId: ids.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'one_rent_payment',
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        bookingDate: '2026-07-04',
        description: 'Rent',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-06',
      horizonDate: '2026-07-31',
      limit: 10,
    });

    expect(summary.upcomingItems.map((item) => Boolean(item.occurrencePayment))).toEqual([false, false]);
    expect(summary.upcomingTotals).toEqual([{ amountMinor: 2000n, currency: 'EUR' }]);
  });

  test('uses monthly calendar preference fallback when no preference is saved', async () => {
    const t = createTest();

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId: 'user_default_preference',
      asOfDate: '2026-07-06',
      limit: 10,
    });

    expect(view.preference).toEqual({
      cycleInterval: 'month',
      cycleIntervalCount: 1,
      anchorDate: '2026-07-01',
    });
    expect(view.cycleStartDate).toBe('2026-07-01');
    expect(view.asOfDate).toBe('2026-07-06');
    expect(view.cycleEndDate).toBe('2026-07-31');
  });

  test('saves and updates planning preferences through authenticated public APIs', async () => {
    const t = createTest();
    const userId = 'user_planning_preference';
    await seedAuthKitUser(t, userId);

    const firstPreferenceId = await t.withIdentity({ subject: userId }).mutation(api.banking.planning.upsertPlanningPreference, {
      cycleInterval: 'month',
      cycleIntervalCount: 1,
      anchorDate: '2026-01-26',
    });
    const secondPreferenceId = await t.withIdentity({ subject: userId }).mutation(api.banking.planning.upsertPlanningPreference, {
      cycleInterval: 'week',
      cycleIntervalCount: 2,
      anchorDate: '2026-01-09',
    });
    const preference = await t.withIdentity({ subject: userId }).query(api.banking.planning.getPlanningPreference, {});

    expect(secondPreferenceId).toBe(firstPreferenceId);
    expect(preference).toMatchObject({
      userId,
      cycleInterval: 'week',
      cycleIntervalCount: 2,
      anchorDate: '2026-01-09',
    });
  });

  test('validates planned transfer ownership, account pairing, and completion', async () => {
    const t = createTest();
    const userId = 'user_planned_transfer_owner';
    const otherUserId = 'user_planned_transfer_other';
    await seedAuthKitUser(t, userId);
    await seedAuthKitUser(t, otherUserId);

    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Owner provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const otherProviderConnectionId = await ctx.db.insert('providerConnections', {
        userId: otherUserId,
        provider: 'mock',
        status: 'active',
        displayName: 'Other provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const fromAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'owner-from',
        name: 'Owner from',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const toAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'owner-to',
        name: 'Owner to',
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
        providerAccountId: 'other-account',
        name: 'Other account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });

      return { fromAccountId, toAccountId, otherAccountId };
    });

    const transferId = await t.withIdentity({ subject: userId }).mutation(api.banking.planning.createPlannedTransfer, {
      name: 'Move funds',
      amount: {
        amountMinor: 25000n,
        currency: 'EUR',
      },
      scheduledDate: '2026-07-30',
      fromAccountId: ids.fromAccountId,
      toAccountId: ids.toAccountId,
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.createPlannedTransfer, {
        name: 'Invalid same account',
        amount: {
          amountMinor: 25000n,
          currency: 'EUR',
        },
        scheduledDate: '2026-07-30',
        fromAccountId: ids.fromAccountId,
        toAccountId: ids.fromAccountId,
      }),
    ).rejects.toThrow('Planned transfers require two different accounts');

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.createPlannedTransfer, {
        name: 'Invalid ownership',
        amount: {
          amountMinor: 25000n,
          currency: 'EUR',
        },
        scheduledDate: '2026-07-30',
        fromAccountId: ids.fromAccountId,
        toAccountId: ids.otherAccountId,
      }),
    ).rejects.toThrow('Destination account not found');

    await expect(
      t.withIdentity({ subject: otherUserId }).mutation(api.banking.planning.setPlannedTransferStatus, {
        plannedTransferId: transferId,
        status: 'completed',
      }),
    ).rejects.toThrow('Planned transfer not found');

    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.setPlannedTransferStatus, {
      plannedTransferId: transferId,
      status: 'completed',
    });

    const transfers = await t.withIdentity({ subject: userId }).query(api.banking.planning.listPlannedTransfers, {
      status: 'completed',
    });
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.completedAtMs).toBeTypeOf('number');
  });

  test('accepts only active card credit lines as planned transfer facilities', async () => {
    const t = createTest();
    const userId = 'user_card_transfer_validation';
    await seedAuthKitUser(t, userId);
    const { accountId } = await seedAccountWithBalance(t, userId);
    const facilities = await t.run(async (ctx) => {
      const base = {
        userId,
        status: 'active' as const,
        source: 'manual' as const,
        provider: 'manual' as const,
        limitAmount: { amountMinor: 100000n, currency: 'EUR' },
        usedAmount: { amountMinor: 0n, currency: 'EUR' },
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };
      const cardId = await ctx.db.insert('creditFacilities', {
        ...base,
        name: 'Active card',
        facilityType: 'cardCreditLine',
        repaymentType: 'statementBalance',
      });
      const overdraftId = await ctx.db.insert('creditFacilities', {
        ...base,
        name: 'Overdraft',
        facilityType: 'accountOverdraft',
        repaymentType: 'onDemand',
      });
      const installmentId = await ctx.db.insert('creditFacilities', {
        ...base,
        name: 'Installment credit',
        facilityType: 'installmentCredit',
        repaymentType: 'installmentPlan',
      });
      return { cardId, overdraftId, installmentId };
    });
    const validArgs = {
      name: 'Apple Pay top-up',
      amount: { amountMinor: 10000n, currency: 'EUR' },
      scheduledDate: '2026-07-20',
      toAccountId: accountId,
    };

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.createPlannedTransfer, {
        ...validArgs,
        fromCreditFacilityId: facilities.cardId,
      }),
    ).resolves.toBeDefined();
    for (const fromCreditFacilityId of [facilities.overdraftId, facilities.installmentId]) {
      await expect(
        t.withIdentity({ subject: userId }).mutation(api.banking.planning.createPlannedTransfer, {
          ...validArgs,
          fromCreditFacilityId,
        }),
      ).rejects.toThrow('Source credit facility must be an active card credit line');
    }
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.createPlannedTransfer, validArgs),
    ).rejects.toThrow('Planned transfer requires exactly one source');
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.createPlannedTransfer, {
        ...validArgs,
        fromAccountId: accountId,
        fromCreditFacilityId: facilities.cardId,
      }),
    ).rejects.toThrow('Planned transfer requires exactly one source');
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.createPlannedTransfer, {
        ...validArgs,
        fromCreditFacilityId: facilities.cardId,
        amount: { amountMinor: 10000n, currency: 'USD' },
      }),
    ).rejects.toThrow('Planned transfers across currencies are not supported yet');
  });

  test('updates, deletes, and completes planned card transfers with status guards', async () => {
    const t = createTest();
    const userId = 'user_card_transfer_mutations';
    await seedAuthKitUser(t, userId);
    const { accountId } = await seedAccountWithBalance(t, userId);
    const facilityId = await t.run(async (ctx) =>
      await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Card',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        provider: 'manual',
        limitAmount: { amountMinor: 100000n, currency: 'EUR' },
        usedAmount: { amountMinor: 5000n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }),
    );
    async function createTransfer(name: string) {
      return await t.withIdentity({ subject: userId }).mutation(api.banking.planning.createPlannedTransfer, {
        name,
        amount: { amountMinor: 10000n, currency: 'EUR' },
        scheduledDate: '2026-07-20',
        fromCreditFacilityId: facilityId,
        toAccountId: accountId,
      });
    }

    const deletedId = await createTransfer('Delete me');
    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.deletePlannedTransfer, {
      plannedTransferId: deletedId,
    });
    expect(await t.run((ctx) => ctx.db.get('plannedTransactions', deletedId))).toBeNull();

    const completedId = await createTransfer('Complete me');
    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.updatePlannedTransferAmount, {
      plannedTransferId: completedId,
      amount: { amountMinor: 12000n, currency: 'EUR' },
    });
    expect((await t.run((ctx) => ctx.db.get('plannedTransactions', completedId)))?.amount.amountMinor).toBe(12000n);
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.updatePlannedTransferAmount, {
        plannedTransferId: completedId,
        amount: { amountMinor: 0n, currency: 'EUR' },
      }),
    ).rejects.toThrow('Planned transfer amount must be positive');
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.updatePlannedTransferAmount, {
        plannedTransferId: completedId,
        amount: { amountMinor: 12000n, currency: 'USD' },
      }),
    ).rejects.toThrow('Planned transfer currency cannot be changed');
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.setPlannedTransferStatus, {
        plannedTransferId: completedId,
        status: 'cancelled',
      }),
    ).rejects.toThrow('Planned transfer status must be completed');
    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.setPlannedTransferStatus, {
      plannedTransferId: completedId,
      status: 'completed',
    });
    expect((await t.run((ctx) => ctx.db.get('creditFacilities', facilityId)))?.usedAmount.amountMinor).toBe(17000n);
    // Completing twice must not double-charge the card usedAmount.
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.setPlannedTransferStatus, {
        plannedTransferId: completedId,
        status: 'completed',
      }),
    ).rejects.toThrow('Only planned transfers can be completed');
    expect((await t.run((ctx) => ctx.db.get('creditFacilities', facilityId)))?.usedAmount.amountMinor).toBe(17000n);
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.updatePlannedTransferAmount, {
        plannedTransferId: completedId,
        amount: { amountMinor: 13000n, currency: 'EUR' },
      }),
    ).rejects.toThrow('Only planned transfers can be updated');
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.deletePlannedTransfer, {
        plannedTransferId: completedId,
      }),
    ).rejects.toThrow('Only planned transfers can be deleted');
  });

  test('flows card-source transfers into the destination and separate statement months', async () => {
    const t = createTest();
    const userId = 'user_card_transfer_cashflow';
    const { accountId } = await seedAccountWithBalance(t, userId);
    const ids = await t.run(async (ctx) => {
      const facilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Apple Pay card',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        linkedAccountId: accountId,
        provider: 'manual',
        limitAmount: { amountMinor: 100000n, currency: 'EUR' },
        usedAmount: { amountMinor: 0n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        paymentDayOfMonth: 15,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId: facilityId,
        cycleMonth: '2026-07',
        status: 'open',
        trackedAmount: { amountMinor: 0n, currency: 'EUR' },
        dueDate: '2026-08-15',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      const firstId = await insertPlannedTransfer(ctx, {
        userId,
        fromCreditFacilityId: facilityId,
        toAccountId: accountId,
        name: 'July top-up',
        amount: { amountMinor: 10000n, currency: 'EUR' },
        scheduledDate: '2026-07-20',
        status: 'planned',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      const secondId = await insertPlannedTransfer(ctx, {
        userId,
        fromCreditFacilityId: facilityId,
        toAccountId: accountId,
        name: 'August top-up',
        amount: { amountMinor: 20000n, currency: 'EUR' },
        scheduledDate: '2026-08-05',
        status: 'planned',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      return { facilityId, firstId, secondId };
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-09-30',
      limit: 20,
    });
    const destination = summary.upcomingItemsByAccount.find((group) => group.accountId === accountId);
    expect(destination?.items.filter((item) => item.source === 'plannedTransfer')).toMatchObject([
      { key: `plannedTransfer:${ids.firstId}:to`, direction: 'inflow', dueDate: '2026-07-20', subtitle: 'Apple Pay card' },
      { key: `plannedTransfer:${ids.secondId}:to`, direction: 'inflow', dueDate: '2026-08-05', subtitle: 'Apple Pay card' },
    ]);
    expect(summary.upcomingItems.some((item) => item.key.endsWith(':from'))).toBe(false);
    expect(summary.upcomingItems.filter((item) => item.key.startsWith(`creditStatementProjection:${ids.facilityId}:`))).toMatchObject([
      { dueDate: '2026-08-15', amount: { amountMinor: 10000n, currency: 'EUR' }, creditCycleMonth: '2026-07' },
      { dueDate: '2026-09-15', amount: { amountMinor: 20000n, currency: 'EUR' }, creditCycleMonth: '2026-08' },
    ]);
  });

  test('builds monthly salary-style cycles from an anchored day of month', async () => {
    const t = createTest();
    const userId = 'user_monthly_cycle';

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      await ctx.db.insert('planningPreferences', {
        userId,
        cycleInterval: 'month',
        cycleIntervalCount: 1,
        anchorDate: '2026-01-26',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const currentCycle = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });
    const nextCycle = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      cycleOffset: 1,
      limit: 10,
    });

    expect(currentCycle.cycleStartDate).toBe('2026-06-26');
    expect(currentCycle.asOfDate).toBe('2026-07-06');
    expect(currentCycle.cycleEndDate).toBe('2026-07-25');
    expect(nextCycle.cycleStartDate).toBe('2026-07-26');
    expect(nextCycle.asOfDate).toBe('2026-07-26');
    expect(nextCycle.cycleEndDate).toBe('2026-08-25');
  });

  test('chains future cycle starting balances from prior projected ending balances', async () => {
    const t = createTest();
    const userId = 'user_cycle_chaining';

    const accountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      await ctx.db.insert('planningPreferences', {
        userId,
        cycleInterval: 'month',
        cycleIntervalCount: 1,
        anchorDate: '2026-01-26',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
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
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: seededAccountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'interimAvailable',
        amount: {
          amountMinor: 10000n,
          currency: 'EUR',
        },
        fetchedAtMs: now,
      });
      for (const expense of [
        { name: 'Current cycle rent', amountMinor: 1000n, dueDate: '2026-07-10' },
        { name: 'Next cycle rent', amountMinor: 2500n, dueDate: '2026-08-01' },
      ]) {
        await insertPlannedExpense(ctx, {
          userId,
          accountId: seededAccountId,
          name: expense.name,
          amount: {
            amountMinor: expense.amountMinor,
            currency: 'EUR',
          },
          dueDate: expense.dueDate,
          status: 'planned',
          source: 'manual',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }

      return seededAccountId;
    });

    const currentCycle = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      cycleOffset: 0,
      limit: 10,
    });
    const nextCycle = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      cycleOffset: 1,
      limit: 10,
    });
    const currentGroup = currentCycle.accountGroups.find((group) => group.accountId === accountId);
    const nextGroup = nextCycle.accountGroups.find((group) => group.accountId === accountId);

    expect(currentGroup?.projectedEndBalance?.amountMinor).toBe(9000n);
    expect(nextGroup?.startingBalance?.amountMinor).toBe(9000n);
    expect(nextGroup?.items.map((item) => item.projectedBalanceAfter?.amountMinor)).toEqual([6500n]);
  });

  test('chains offset two recurring expenses and totals only the requested cycle window', async () => {
    const t = createTest();
    const userId = 'user_cycle_offset_two';

    const accountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      await ctx.db.insert('planningPreferences', {
        userId,
        cycleInterval: 'month',
        cycleIntervalCount: 1,
        anchorDate: '2026-01-26',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
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
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: seededAccountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'interimAvailable',
        amount: {
          amountMinor: 100000n,
          currency: 'EUR',
        },
        fetchedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId: seededAccountId,
        name: 'Monthly transfer',
        amount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        dueDate: '2026-07-10',
        recurrenceInterval: 'month',
        recurrenceIntervalCount: 1,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });

      return seededAccountId;
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      cycleOffset: 2,
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === accountId);

    expect(view.cycleStartDate).toBe('2026-08-26');
    expect(group?.startingBalance?.amountMinor).toBe(98000n);
    expect(group?.items.map((item) => item.dueDate)).toEqual(['2026-09-10']);
    expect(group?.items[0]?.projectedBalanceAfter?.amountMinor).toBe(97000n);
    expect(group?.totals).toEqual([{ amountMinor: 1000n, currency: 'EUR' }]);
    expect(view.upcomingTotals).toEqual([{ amountMinor: 1000n, currency: 'EUR' }]);
  });

  test('chains inflows across cycles without surfacing intermediate negative dates', async () => {
    const t = createTest();
    const userId = 'user_cycle_inflow_chaining';

    const accountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      await ctx.db.insert('planningPreferences', {
        userId,
        cycleInterval: 'month',
        cycleIntervalCount: 1,
        anchorDate: '2026-01-26',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
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
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: seededAccountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'interimAvailable',
        amount: {
          amountMinor: 10000n,
          currency: 'EUR',
        },
        fetchedAtMs: now,
      });
      for (const expense of [
        { name: 'Current overdraft', amountMinor: 15000n, dueDate: '2026-07-10', direction: 'outflow' as const },
        { name: 'Next salary', amountMinor: 10000n, dueDate: '2026-08-01', direction: 'inflow' as const },
        { name: 'Offset two bill', amountMinor: 1000n, dueDate: '2026-09-01', direction: 'outflow' as const },
      ]) {
        await insertPlannedExpense(ctx, {
          userId,
          accountId: seededAccountId,
          name: expense.name,
          amount: {
            amountMinor: expense.amountMinor,
            currency: 'EUR',
          },
          direction: expense.direction,
          dueDate: expense.dueDate,
          status: 'planned',
          source: 'manual',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }

      return seededAccountId;
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      cycleOffset: 2,
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === accountId);

    expect(group?.startingBalance?.amountMinor).toBe(5000n);
    expect(group?.items.map((item) => item.projectedBalanceAfter?.amountMinor)).toEqual([4000n]);
    expect(group?.firstNegativeDate).toBeUndefined();
    expect(view.firstNegativeDate).toBeUndefined();
  });

  test('marks future cycles currency-mismatched when a pre-window item mismatches the balance', async () => {
    const t = createTest();
    const userId = 'user_cycle_pre_window_mismatch';

    const accountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      await ctx.db.insert('planningPreferences', {
        userId,
        cycleInterval: 'month',
        cycleIntervalCount: 1,
        anchorDate: '2026-01-26',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
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
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: seededAccountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'interimAvailable',
        amount: {
          amountMinor: 10000n,
          currency: 'EUR',
        },
        fetchedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId: seededAccountId,
        name: 'USD pre-window bill',
        amount: {
          amountMinor: 1000n,
          currency: 'USD',
        },
        dueDate: '2026-07-10',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId: seededAccountId,
        name: 'EUR next bill',
        amount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        dueDate: '2026-08-01',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });

      return seededAccountId;
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      cycleOffset: 1,
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === accountId);

    expect(group?.projectionStatus).toBe('currencyMismatch');
    expect(group?.startingBalance).toBeUndefined();
    expect(group?.items[0]?.projectionStatus).toBe('currencyMismatch');
    expect(group?.items[0]?.projectedBalanceAfter).toBeUndefined();
  });

  test('normalizes monthly preferences so the count cannot widen the month window', async () => {
    const t = createTest();
    const userId = 'user_monthly_count_normalized';
    await seedAuthKitUser(t, userId);

    await t.withIdentity({ subject: userId }).mutation(api.banking.planning.upsertPlanningPreference, {
      cycleInterval: 'month',
      cycleIntervalCount: 27,
      anchorDate: '2026-06-27',
    });

    const preference = await t.withIdentity({ subject: userId }).query(api.banking.planning.getPlanningPreference, {});
    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });

    expect(preference).toMatchObject({
      cycleInterval: 'month',
      cycleIntervalCount: 1,
      anchorDate: '2026-06-27',
    });
    expect(view.preference).toEqual({
      cycleInterval: 'month',
      cycleIntervalCount: 1,
      anchorDate: '2026-06-27',
    });
    expect(view.cycleStartDate).toBe('2026-06-27');
    expect(view.asOfDate).toBe('2026-07-06');
    expect(view.cycleEndDate).toBe('2026-07-26');
  });

  test('normalizes legacy monthly preferences that already have widened counts', async () => {
    const t = createTest();
    const userId = 'user_legacy_monthly_count';

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 5, 27);
      await ctx.db.insert('planningPreferences', {
        userId,
        cycleInterval: 'month',
        cycleIntervalCount: 27,
        anchorDate: '2026-06-27',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });

    expect(view.preference).toEqual({
      cycleInterval: 'month',
      cycleIntervalCount: 1,
      anchorDate: '2026-06-27',
    });
    expect(view.cycleStartDate).toBe('2026-06-27');
    expect(view.asOfDate).toBe('2026-07-06');
    expect(view.cycleEndDate).toBe('2026-07-26');
  });

  test('navigates weekly planning cycles from the saved anchor date', async () => {
    const t = createTest();
    const userId = 'user_weekly_cycle';

    const accountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      await ctx.db.insert('planningPreferences', {
        userId,
        cycleInterval: 'week',
        cycleIntervalCount: 1,
        anchorDate: '2026-07-03',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
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
      await insertPlannedExpense(ctx, {
        userId,
        accountId: seededAccountId,
        name: 'Previous cycle bill',
        amount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        dueDate: '2026-06-29',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });

      return seededAccountId;
    });

    const currentCycle = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });
    const previousCycle = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      cycleOffset: -1,
      limit: 10,
    });

    expect(currentCycle.cycleStartDate).toBe('2026-07-03');
    expect(currentCycle.asOfDate).toBe('2026-07-06');
    expect(currentCycle.cycleEndDate).toBe('2026-07-09');
    expect(previousCycle.cycleStartDate).toBe('2026-06-26');
    expect(previousCycle.asOfDate).toBe('2026-06-26');
    expect(previousCycle.cycleEndDate).toBe('2026-07-02');
    const previousGroup = previousCycle.accountGroups.find((group) => group.accountId === accountId);
    expect(previousGroup?.projectionStatus).toBe('pastCycle');
    expect(previousGroup?.latestBalance).toBeUndefined();
    expect(previousGroup?.startingBalance).toBeUndefined();
    expect(previousGroup?.projectedEndBalance).toBeUndefined();
    expect(previousGroup?.items.map((item) => `${item.title}:${item.projectionStatus}`)).toEqual([
      'Previous cycle bill:pastCycle',
    ]);
  });

  test('projects account balances and first negative date from known outflows', async () => {
    const t = createTest();
    const userId = 'user_balance_projection';

    const accountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
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
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: seededAccountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'interimAvailable',
        amount: {
          amountMinor: 10000n,
          currency: 'EUR',
        },
        fetchedAtMs: now,
      });
      for (const expense of [
        { name: 'Rent', amountMinor: 3000n, dueDate: '2026-07-10' },
        { name: 'Insurance', amountMinor: 8000n, dueDate: '2026-07-12' },
      ]) {
        await insertPlannedExpense(ctx, {
          userId,
          accountId: seededAccountId,
          name: expense.name,
          amount: {
            amountMinor: expense.amountMinor,
            currency: 'EUR',
          },
          dueDate: expense.dueDate,
          status: 'planned',
          source: 'manual',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }

      return seededAccountId;
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === accountId);

    expect(group?.latestBalance?.amount.amountMinor).toBe(10000n);
    expect(group?.projectedEndBalance?.amountMinor).toBe(-1000n);
    expect(group?.firstNegativeDate).toBe('2026-07-12');
    expect(view.firstNegativeDate).toBe('2026-07-12');
    expect(group?.items.map((item) => item.projectedBalanceAfter?.amountMinor)).toEqual([7000n, -1000n]);
  });

  test('keeps ledger balance separate from overdraft-backed available balance', async () => {
    const t = createTest();
    const userId = 'user_overdraft_projection';

    const accountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'overdraft-account',
        name: 'Overdraft account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: seededAccountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'interimAvailable',
        amount: {
          amountMinor: -90000n,
          currency: 'EUR',
        },
        fetchedAtMs: now,
      });
      await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Account overdraft',
        facilityType: 'accountOverdraft',
        status: 'active',
        source: 'manual',
        linkedAccountId: seededAccountId,
        provider: 'manual',
        limitAmount: {
          amountMinor: 100000n,
          currency: 'EUR',
        },
        usedAmount: {
          amountMinor: 90000n,
          currency: 'EUR',
        },
        repaymentType: 'onDemand',
        createdAtMs: now,
        updatedAtMs: now,
      });
      for (const expense of [
        { name: 'Covered debit', amountMinor: 5000n, dueDate: '2026-07-10' },
        { name: 'Over-limit debit', amountMinor: 6000n, dueDate: '2026-07-12' },
      ]) {
        await insertPlannedExpense(ctx, {
          userId,
          accountId: seededAccountId,
          name: expense.name,
          amount: {
            amountMinor: expense.amountMinor,
            currency: 'EUR',
          },
          dueDate: expense.dueDate,
          status: 'planned',
          source: 'manual',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }

      return seededAccountId;
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === accountId);

    expect(group?.startingBalance?.amountMinor).toBe(-90000n);
    expect(group?.startingAvailable?.amountMinor).toBe(10000n);
    expect(group?.overdraftLimitAmount?.amountMinor).toBe(100000n);
    expect(group?.items.map((item) => item.projectedBalanceAfter?.amountMinor)).toEqual([-95000n, -101000n]);
    expect(group?.items.map((item) => item.projectedAvailableAfter?.amountMinor)).toEqual([5000n, -1000n]);
    // The overdraft still reports availability for the row tooltips, but the alarm follows the
    // accounting position: the account is in the red from the first row, not from the one that
    // exhausts the credit line.
    expect(group?.firstNegativeDate).toBe('2026-07-10');
    expect(view.firstNegativeDate).toBe('2026-07-10');
  });

  test('warns when a positive account is projected into the red inside its overdraft', async () => {
    const t = createTest();
    const userId = 'user_overdraft_absorbed_projection';

    const accountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'absorbed-overdraft-account',
        name: 'Checking with overdraft',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: seededAccountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'closingBooked',
        amount: { amountMinor: 62784n, currency: 'EUR' },
        fetchedAtMs: now,
      });
      await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Scoperto Facile 3000',
        facilityType: 'accountOverdraft',
        status: 'active',
        source: 'manual',
        linkedAccountId: seededAccountId,
        provider: 'manual',
        limitAmount: { amountMinor: 300000n, currency: 'EUR' },
        usedAmount: { amountMinor: 0n, currency: 'EUR' },
        repaymentType: 'onDemand',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId: seededAccountId,
        name: 'Mantenimento',
        amount: { amountMinor: 100000n, currency: 'EUR' },
        dueDate: '2026-07-10',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });

      return seededAccountId;
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === accountId);

    // 627,84 minus 1.000 leaves the account 372,16 in the red but still 2.627,84 inside the
    // 3.000 line, so an availability-based alarm reported nothing at all.
    expect(group?.items.at(0)?.projectedBalanceAfter?.amountMinor).toBe(-37216n);
    expect(group?.items.at(0)?.projectedAvailableAfter?.amountMinor).toBe(262784n);
    expect(group?.firstNegativeDate).toBe('2026-07-10');
    expect(view.firstNegativeDate).toBe('2026-07-10');
  });

  test('moves liquidity between accounts without counting a planned transfer as an obligation', async () => {
    const t = createTest();
    const userId = 'user_planned_transfer_projection';

    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      await ctx.db.insert('planningPreferences', {
        userId,
        cycleInterval: 'month',
        cycleIntervalCount: 1,
        anchorDate: '2026-01-26',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const sourceAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'source-account',
        name: 'Source account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const destinationAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'destination-account',
        name: 'Destination account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      for (const [accountId, amountMinor] of [
        [sourceAccountId, 0n],
        [destinationAccountId, 10000n],
      ] as const) {
        await ctx.db.insert('accountBalances', {
          userId,
          accountId,
          providerConnectionId,
          provider: 'mock',
          balanceType: 'interimAvailable',
          amount: {
            amountMinor,
            currency: 'EUR',
          },
          fetchedAtMs: now,
        });
      }
      await insertPlannedExpense(ctx, {
        userId,
        accountId: sourceAccountId,
        name: 'Salary',
        amount: {
          amountMinor: 100000n,
          currency: 'EUR',
        },
        direction: 'inflow',
        dueDate: '2026-07-27',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedTransfer(ctx, {
        userId,
        fromAccountId: sourceAccountId,
        toAccountId: destinationAccountId,
        name: 'Cover mortgage',
        amount: {
          amountMinor: 60000n,
          currency: 'EUR',
        },
        scheduledDate: '2026-07-30',
        status: 'planned',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId: destinationAccountId,
        name: 'Mortgage',
        amount: {
          amountMinor: 65000n,
          currency: 'EUR',
        },
        dueDate: '2026-08-01',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });

      return { sourceAccountId, destinationAccountId };
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-27',
      limit: 10,
    });
    const sourceGroup = view.accountGroups.find((candidate) => candidate.accountId === ids.sourceAccountId);
    const destinationGroup = view.accountGroups.find((candidate) => candidate.accountId === ids.destinationAccountId);

    expect(sourceGroup?.items.map((item) => `${item.source}:${item.direction}`)).toEqual([
      'plannedExpense:inflow',
      'plannedTransfer:outflow',
    ]);
    expect(sourceGroup?.projectedEndBalance?.amountMinor).toBe(40000n);
    expect(destinationGroup?.items.map((item) => `${item.source}:${item.direction}`)).toEqual([
      'plannedTransfer:inflow',
      'plannedExpense:outflow',
    ]);
    expect(destinationGroup?.items.map((item) => item.projectedBalanceAfter?.amountMinor)).toEqual([70000n, 5000n]);
    expect(destinationGroup?.firstNegativeDate).toBeUndefined();
    expect(view.upcomingTotals).toEqual([{ amountMinor: 65000n, currency: 'EUR' }]);
  });

  test('projects planned inflows before same-day outflows without false negative balances', async () => {
    const t = createTest();
    const userId = 'user_income_projection';

    const accountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
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
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: seededAccountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'interimAvailable',
        amount: {
          amountMinor: 10000n,
          currency: 'EUR',
        },
        fetchedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId: seededAccountId,
        name: 'Salary',
        amount: {
          amountMinor: 5000n,
          currency: 'EUR',
        },
        direction: 'inflow',
        dueDate: '2026-07-10',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId: seededAccountId,
        name: 'Rent',
        amount: {
          amountMinor: 12000n,
          currency: 'EUR',
        },
        direction: 'outflow',
        dueDate: '2026-07-10',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });

      return seededAccountId;
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });
    const group = view.accountGroups.find((candidate) => candidate.accountId === accountId);

    expect(group?.items.map((item) => `${item.title}:${item.direction}`)).toEqual(['Salary:inflow', 'Rent:outflow']);
    expect(group?.items.map((item) => item.projectedBalanceAfter?.amountMinor)).toEqual([15000n, 3000n]);
    expect(group?.projectedEndBalance?.amountMinor).toBe(3000n);
    expect(group?.firstNegativeDate).toBeUndefined();
    expect(view.firstNegativeDate).toBeUndefined();
  });

  test('excludes planned inflows from upcoming obligation totals', async () => {
    const t = createTest();
    const userId = 'user_income_totals';

    const accountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const seededAccountId = await ctx.db.insert('financialAccounts', {
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
      for (const expense of [
        { name: 'Bonus', amountMinor: 5000n, direction: 'inflow' as const },
        { name: 'Rent', amountMinor: 12000n, direction: 'outflow' as const },
      ]) {
        await insertPlannedExpense(ctx, {
          userId,
          accountId: seededAccountId,
          name: expense.name,
          amount: {
            amountMinor: expense.amountMinor,
            currency: 'EUR',
          },
          direction: expense.direction,
          dueDate: '2026-07-10',
          status: 'planned',
          source: 'manual',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }

      return seededAccountId;
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 10,
    });
    const group = summary.upcomingItemsByAccount.find((candidate) => candidate.accountId === accountId);

    expect(summary.upcomingItems.map((item) => item.direction)).toEqual(['inflow', 'outflow']);
    expect(summary.upcomingTotals).toEqual([{ amountMinor: 12000n, currency: 'EUR' }]);
    expect(group?.totals).toEqual([{ amountMinor: 12000n, currency: 'EUR' }]);
  });

  test('creates, sets, clears, and preserves planned expense categories and notes', async () => {
    const t = createTest();
    const userId = 'user_planned_expense_category';
    await seedAuthKitUser(t, userId);

    const { categoryId, plannedExpenseId } = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const insertedCategoryId = await ctx.db.insert('categories', {
        userId,
        name: 'Housing',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const insertedPlannedExpenseId = await insertPlannedExpense(ctx, {
        userId,
        name: 'Rent',
        amount: { amountMinor: 120000n, currency: 'EUR' },
        dueDate: '2026-07-10',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { categoryId: insertedCategoryId, plannedExpenseId: insertedPlannedExpenseId };
    });
    const identity = t.withIdentity({ subject: userId });
    const created = await identity.mutation(api.banking.planning.createPlannedExpense, {
      name: 'Insurance',
      note: '  Renewal quote  ',
      amount: { amountMinor: 60000n, currency: 'EUR' },
      dueDate: '2026-08-01',
    });
    expect(await t.run((ctx) => ctx.db.get('plannedTransactions', created.plannedExpenseId))).toMatchObject({
      note: 'Renewal quote',
    });
    expect(await identity.query(api.banking.planning.listPlannedExpenses, { limit: 10 })).toContainEqual(
      expect.objectContaining({ _id: created.plannedExpenseId, note: 'Renewal quote' }),
    );

    const baseUpdate = {
      plannedExpenseId,
      name: 'Rent',
      amount: { amountMinor: 120000n, currency: 'EUR' },
      dueDate: '2026-07-10',
    };

    await identity.mutation(api.banking.planning.updatePlannedExpense, {
      ...baseUpdate,
      categoryId,
      note: '  Paid by direct debit  ',
    });
    expect(await t.run((ctx) => ctx.db.get('plannedTransactions', plannedExpenseId))).toMatchObject({
      categoryId,
      note: 'Paid by direct debit',
    });

    await identity.mutation(api.banking.planning.updatePlannedExpense, {
      ...baseUpdate,
      name: 'Monthly rent',
    });
    expect(await t.run((ctx) => ctx.db.get('plannedTransactions', plannedExpenseId))).toMatchObject({
      name: 'Monthly rent',
      categoryId,
      note: 'Paid by direct debit',
    });

    await identity.mutation(api.banking.planning.updatePlannedExpense, {
      ...baseUpdate,
      categoryId: null,
      note: null,
    });
    const cleared = await t.run((ctx) => ctx.db.get('plannedTransactions', plannedExpenseId));
    expect(cleared?.categoryId).toBeUndefined();
    expect(cleared?.note).toBeUndefined();
  });

  test('rejects planned income with money box creation', async () => {
    const t = createTest();
    const userId = 'user_income_money_box';
    await seedAuthKitUser(t, userId);

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.planning.createPlannedExpense, {
        name: 'Salary',
        amount: {
          amountMinor: 250000n,
          currency: 'EUR',
        },
        direction: 'inflow',
        dueDate: '2026-07-31',
        createMoneyBox: true,
      }),
    ).rejects.toThrow('Planned income cannot create a money box');
  });

  test('marks missing balances and currency mismatches without projecting rows', async () => {
    const t = createTest();
    const userId = 'user_projection_gaps';

    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const missingBalanceAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'missing',
        name: 'Missing balance',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const mismatchAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        providerAccountId: 'usd',
        name: 'USD balance',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: mismatchAccountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'interimAvailable',
        amount: {
          amountMinor: 10000n,
          currency: 'USD',
        },
        fetchedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId: missingBalanceAccountId,
        name: 'No balance expense',
        amount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        dueDate: '2026-07-10',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId: mismatchAccountId,
        name: 'EUR expense',
        amount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        dueDate: '2026-07-10',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });

      return { missingBalanceAccountId, mismatchAccountId };
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-06',
      limit: 10,
    });

    const missingBalanceGroup = view.accountGroups.find((group) => group.accountId === ids.missingBalanceAccountId);
    const mismatchGroup = view.accountGroups.find((group) => group.accountId === ids.mismatchAccountId);

    expect(missingBalanceGroup?.projectionStatus).toBe('missingBalance');
    expect(missingBalanceGroup?.items[0]?.projectionStatus).toBe('missingBalance');
    expect(missingBalanceGroup?.items[0]?.projectedBalanceAfter).toBeUndefined();
    expect(mismatchGroup?.projectionStatus).toBe('currencyMismatch');
    expect(mismatchGroup?.items[0]?.projectionStatus).toBe('currencyMismatch');
    expect(mismatchGroup?.items[0]?.projectedBalanceAfter).toBeUndefined();
  });

  test('keeps planning preferences and cashflow isolated by authenticated user', async () => {
    const t = createTest();
    const ownerUserId = 'user_planning_owner';
    const intruderUserId = 'user_planning_intruder';
    await seedAuthKitUser(t, ownerUserId);
    await seedAuthKitUser(t, intruderUserId);

    await t.withIdentity({ subject: ownerUserId }).mutation(api.banking.planning.upsertPlanningPreference, {
      cycleInterval: 'month',
      cycleIntervalCount: 1,
      anchorDate: '2026-01-26',
    });

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
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
        providerAccountId: 'owner-main',
        name: 'Owner account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId: ownerUserId,
        accountId,
        name: 'Owner expense',
        amount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        dueDate: '2026-07-10',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const intruderPreference = await t
      .withIdentity({ subject: intruderUserId })
      .query(api.banking.planning.getPlanningPreference, {});
    const intruderView = await t
      .withIdentity({ subject: intruderUserId })
      .query(api.banking.planning.getPlanningCashflowView, { cycleOffset: 0, limit: 10 });

    expect(intruderPreference.anchorDate.endsWith('-01')).toBe(true);
    expect(intruderView.accountGroups).toEqual([]);
  });

  test('excludes asset accounts from cashflow groups and aggregate starting balances', async () => {
    const t = createTest();
    const userId = 'user_asset_cashflow_exclusion';

    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const cashAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        name: 'Checking',
        accountType: 'CACC',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const assetAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        name: 'Portfolio',
        accountType: 'INVS',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });

      for (const [accountId, amountMinor] of [
        [cashAccountId, 10_000n],
        [assetAccountId, 90_000n],
      ] as const) {
        await ctx.db.insert('accountBalances', {
          userId,
          accountId,
          providerConnectionId,
          provider: 'mock',
          balanceType: 'closingBooked',
          amount: { amountMinor, currency: 'EUR' },
          fetchedAtMs: now,
        });
        await insertPlannedExpense(ctx, {
          userId,
          accountId,
          name: accountId === cashAccountId ? 'Cash bill' : 'Investment fee',
          amount: { amountMinor: 1_000n, currency: 'EUR' },
          dueDate: '2026-07-10',
          status: 'planned',
          source: 'manual',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }

      return { assetAccountId, cashAccountId };
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 20,
    });
    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-01',
      limit: 20,
    });

    expect(summary.upcomingItemsByAccount.map((group) => group.accountId)).toEqual([ids.cashAccountId]);
    expect(view.accountGroups.map((group) => group.accountId)).toEqual([ids.cashAccountId]);
    expect(view.aggregateEndBalance).toEqual({ amountMinor: 9_000n, currency: 'EUR' });
    expect(view.aggregateEndBalance?.amountMinor).not.toBe(99_000n);
    expect(view.accountGroups.some((group) => group.accountId === ids.assetAccountId)).toBe(false);
  });

  test('keeps CARD account groups in the cashflow view while excluding them from aggregates', async () => {
    const t = createTest();
    const userId = 'user_card_groups_stay';

    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const cashAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        name: 'Checking',
        accountType: 'CACC',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const cardAccountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'mock',
        name: 'Card',
        accountType: 'CARD',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });

      for (const [accountId, amountMinor] of [
        [cashAccountId, 10_000n],
        [cardAccountId, -4_000n],
      ] as const) {
        await ctx.db.insert('accountBalances', {
          userId,
          accountId,
          providerConnectionId,
          provider: 'mock',
          balanceType: 'closingBooked',
          amount: { amountMinor, currency: 'EUR' },
          fetchedAtMs: now,
        });
      }
      for (const [accountId, name] of [
        [cashAccountId, 'Cash bill'],
        [cardAccountId, 'Card fee'],
      ] as const) {
        await insertPlannedExpense(ctx, {
          userId,
          accountId,
          name,
          amount: { amountMinor: 1_000n, currency: 'EUR' },
          dueDate: '2026-07-10',
          status: 'planned',
          source: 'manual',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }

      return { cardAccountId, cashAccountId };
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-01',
      horizonDate: '2026-07-31',
      limit: 20,
    });
    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-01',
      limit: 20,
    });

    // The card group stays inspectable with its own rows...
    expect(summary.upcomingItemsByAccount.some((group) => group.accountId === ids.cardAccountId)).toBe(true);
    const cardGroup = view.accountGroups.find((group) => group.accountId === ids.cardAccountId);
    expect(cardGroup?.items.some((item) => item.title === 'Card fee')).toBe(true);
    // ...but its liability balance and events never leak into the aggregate
    // projection: 10 000 cash − 1 000 cash bill, ignoring the card entirely.
    expect(view.aggregateEndBalance).toEqual({ amountMinor: 9_000n, currency: 'EUR' });
  });
});
