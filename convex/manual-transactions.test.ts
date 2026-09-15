/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
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

const userId = 'user_test';

async function seedFixture(t: TestHarness) {
  await seedAuthKitUser(t, userId);
  const asUser = t.withIdentity({ subject: userId });
  const cardAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
    name: 'Acme Flex',
    accountType: 'CARD',
    currency: 'EUR',
  });

  const seeded = await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const groceriesCategoryId = await ctx.db.insert('categories', {
      userId,
      name: 'Groceries',
      systemKey: 'expense:groceries',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const topUpCategoryId = await ctx.db.insert('categories', {
      userId,
      name: 'Top-Up',
      systemKey: 'transfer:topup',
      kind: 'transfer',
      budgetEligible: false,
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
    const importedAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'acme_personal',
      name: 'Acme Personal',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { groceriesCategoryId, topUpCategoryId, importedAccountId, providerConnectionId };
  });

  return { asUser, cardAccountId, ...seeded };
}

async function latestBalanceMinor(t: TestHarness, accountId: Id<'financialAccounts'>) {
  return await t.run(async (ctx) => {
    const snapshots = await ctx.db
      .query('accountBalances')
      .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', accountId))
      .order('desc')
      .take(1);
    return snapshots[0]?.amount.amountMinor;
  });
}

describe('createManualTransaction', () => {
  test('creates categorized movements and keeps the balance snapshots in step', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const purchaseId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 4550n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Acme Groceries',
      note: '  Weekly groceries  ',
      categoryId: fixture.groceriesCategoryId,
    });

    const purchase = await t.run(async (ctx) => await ctx.db.get('transactions', purchaseId));
    expect(purchase).toMatchObject({
      provider: 'manual',
      status: 'BOOK',
      classificationKind: 'expense',
      classificationSource: 'user',
      categoryId: fixture.groceriesCategoryId,
      note: 'Weekly groceries',
    });
    expect(purchase?.dedupeKey.startsWith('manual|')).toBe(true);
    expect(await latestBalanceMinor(t, fixture.cardAccountId)).toBe(-4550n);

    await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'CRDT',
      amount: { amountMinor: 1000n, currency: 'EUR' },
      bookingDate: '2026-07-11',
      description: 'Refund',
    });
    expect(await latestBalanceMinor(t, fixture.cardAccountId)).toBe(-3550n);
  });

  test('applies category rule tags and report visibility to a new manual transaction', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const tagId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const insertedTagId = await ctx.db.insert('transactionTags', {
        userId,
        name: 'Recurring',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('categoryRules', {
        userId,
        matchField: 'merchant',
        matchType: 'contains',
        pattern: 'acme superstore',
        categoryId: fixture.groceriesCategoryId,
        addTagIds: [insertedTagId],
        hideFromReports: true,
        enabled: true,
        priority: 10,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return insertedTagId;
    });

    const transactionId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 4550n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Card purchase',
      counterpartyName: 'Acme Superstore',
    });
    const transaction = await t.run(async (ctx) => await ctx.db.get('transactions', transactionId));

    expect(transaction).toMatchObject({
      categoryId: fixture.groceriesCategoryId,
      classificationKind: 'expense',
      classificationSource: 'rule',
      tagIds: [tagId],
      hiddenFromReports: true,
    });
  });

  test('derives the classification from a transfer-kind category', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const topUpId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 5000n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Apple Pay Top-Up',
      categoryId: fixture.topUpCategoryId,
    });

    const topUp = await t.run(async (ctx) => await ctx.db.get('transactions', topUpId));
    expect(topUp?.classificationKind).toBe('transfer');
  });

  test('an internal opening adjustment stays out of spending stats', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 80000n, currency: 'EUR' },
      bookingDate: '2026-07-01',
      description: 'Saldo iniziale carta',
      classificationKind: 'internal',
    });

    const spending = await fixture.asUser.query(api.banking.transactions.getSpendingByCategory, {
      period: '2026-07',
    });
    expect(spending).toHaveLength(0);
    expect(await latestBalanceMinor(t, fixture.cardAccountId)).toBe(-80000n);
  });

  test('auto-creates a transfer match against an imported opposite leg', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 10);
      await ctx.db.insert('transactions', {
        userId,
        accountId: fixture.importedAccountId,
        providerConnectionId: fixture.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'acme_topup',
        status: 'BOOK',
        direction: 'CRDT',
        amount: { amountMinor: 5000n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'Apple Pay Top-Up by *4242',
        classificationKind: 'income',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    const cardLegId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 5000n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Acme Top-up',
    });

    const cardLeg = await t.run(async (ctx) => await ctx.db.get('transactions', cardLegId));
    expect(cardLeg?.transferMatchId).toBeDefined();
    expect(cardLeg?.classificationKind).toBe('transfer');
  });

  test('rejects non-manual accounts and invalid input', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
        accountId: fixture.importedAccountId,
        direction: 'DBIT',
        amount: { amountMinor: 100n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'Nope',
      }),
    ).rejects.toThrow('Only manual accounts accept manual transactions');
    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
        accountId: fixture.cardAccountId,
        direction: 'DBIT',
        amount: { amountMinor: 0n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'Zero',
      }),
    ).rejects.toThrow('Amount must be greater than zero');
    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
        accountId: fixture.cardAccountId,
        direction: 'DBIT',
        amount: { amountMinor: 100n, currency: 'USD' },
        bookingDate: '2026-07-10',
        description: 'Wrong currency',
      }),
    ).rejects.toThrow('Amount currency must match the account currency');
  });
});

describe('updateManualTransaction', () => {
  test('edits reprice the balance and re-derive the classification', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const transactionId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 4550n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Acme Groceries',
      categoryId: fixture.groceriesCategoryId,
    });

    await fixture.asUser.mutation(api.banking.manualTransactions.updateManualTransaction, {
      transactionId,
      direction: 'DBIT',
      amount: { amountMinor: 6000n, currency: 'EUR' },
      bookingDate: '2026-07-11',
      description: 'Acme superstore',
      categoryId: fixture.topUpCategoryId,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', transactionId));
    expect(updated).toMatchObject({
      description: 'Acme superstore',
      bookingDate: '2026-07-11',
      classificationKind: 'transfer',
      categoryId: fixture.topUpCategoryId,
    });
    expect(await latestBalanceMinor(t, fixture.cardAccountId)).toBe(-6000n);
  });

  test('blocks edits while the transaction is transfer-matched', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const transactionId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 4550n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Acme Groceries',
    });
    await t.run(async (ctx) => {
      const matchId = await ctx.db.insert('transferMatches', {
        userId,
        outgoingTransactionId: transactionId,
        incomingTransactionId: transactionId,
        status: 'confirmed',
        amountDelta: { amountMinor: 0n, currency: 'EUR' },
        source: 'user',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      await ctx.db.patch('transactions', transactionId, { transferMatchId: matchId });
    });

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.updateManualTransaction, {
        transactionId,
        direction: 'DBIT',
        amount: { amountMinor: 6000n, currency: 'EUR' },
        bookingDate: '2026-07-11',
        description: 'Acme superstore',
      }),
    ).rejects.toThrow('Unlink the transfer match before editing this transaction');
  });
});

describe('deleteManualTransaction', () => {
  test('deletes, restores the balance, and cascades unconfirmed candidates', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const transactionId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 4550n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Acme Groceries',
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('transferMatches', {
        userId,
        outgoingTransactionId: transactionId,
        incomingTransactionId: transactionId,
        status: 'candidate',
        amountDelta: { amountMinor: 0n, currency: 'EUR' },
        source: 'system',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    });

    await fixture.asUser.mutation(api.banking.manualTransactions.deleteManualTransaction, { transactionId });

    const { deleted, remainingMatches } = await t.run(async (ctx) => ({
      deleted: await ctx.db.get('transactions', transactionId),
      remainingMatches: await ctx.db
        .query('transferMatches')
        .withIndex('by_outgoingTransactionId', (q) => q.eq('outgoingTransactionId', transactionId))
        .take(5),
    }));
    expect(deleted).toBeNull();
    expect(remainingMatches).toHaveLength(0);
    expect(await latestBalanceMinor(t, fixture.cardAccountId)).toBe(0n);
  });

  test('unlinking the money box contribution unblocks the deletion', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const moneyBoxId = await fixture.asUser.mutation(api.banking.planning.createMoneyBox, {
      name: 'Ass. Moto',
      targetAmount: { amountMinor: 50000n, currency: 'EUR' },
      savedAmount: { amountMinor: 10000n, currency: 'EUR' },
      targetDate: '2026-12-31',
    });
    const transactionId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 3732n, currency: 'EUR' },
      bookingDate: '2026-07-24',
      description: 'Ass. Moto -> Acme Savings',
      categoryId: fixture.topUpCategoryId,
    });
    await fixture.asUser.mutation(api.banking.planning.associateTransferWithMoneyBox, {
      transactionId,
      moneyBoxId,
    });

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.deleteManualTransaction, { transactionId }),
    ).rejects.toThrow('money box contribution');

    await fixture.asUser.mutation(api.banking.planning.unlinkMoneyBoxContribution, { transactionId });

    const { contributions, moneyBox } = await t.run(async (ctx) => ({
      contributions: await ctx.db
        .query('moneyBoxContributions')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', transactionId))
        .take(2),
      moneyBox: await ctx.db.get('moneyBoxes', moneyBoxId),
    }));
    expect(contributions).toHaveLength(0);
    expect(moneyBox?.savedAmount.amountMinor).toBe(10000n);

    await fixture.asUser.mutation(api.banking.manualTransactions.deleteManualTransaction, { transactionId });
    expect(await t.run(async (ctx) => await ctx.db.get('transactions', transactionId))).toBeNull();

    await expect(
      fixture.asUser.mutation(api.banking.planning.unlinkMoneyBoxContribution, { transactionId }),
    ).rejects.toThrow('Transaction not found');
  });

  test('blocks deletion when referenced by an installment payment', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const transactionId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 4550n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Rata',
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      const creditFacilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Card',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        provider: 'manual',
        limitAmount: { amountMinor: 100000n, currency: 'EUR' },
        usedAmount: { amountMinor: 0n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const installmentPlanId = await ctx.db.insert('creditFacilityInstallmentPlans', {
        userId,
        creditFacilityId,
        name: 'Plan',
        principalAmount: { amountMinor: 10000n, currency: 'EUR' },
        outstandingAmount: { amountMinor: 10000n, currency: 'EUR' },
        monthlyPaymentAmount: { amountMinor: 1000n, currency: 'EUR' },
        installmentCount: 10,
        remainingInstallments: 10,
        startDate: '2026-07-01',
        endDate: '2027-05-01',
        status: 'active',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityInstallmentPayments', {
        userId,
        creditFacilityId,
        installmentPlanId,
        amount: { amountMinor: 4550n, currency: 'EUR' },
        paymentDate: '2026-07-10',
        source: 'transaction',
        transactionId,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.deleteManualTransaction, { transactionId }),
    ).rejects.toThrow('This transaction is linked to an installment payment');
  });

  test('rejects deleting imported transactions', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const importedTransactionId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 10);
      return await ctx.db.insert('transactions', {
        userId,
        accountId: fixture.importedAccountId,
        providerConnectionId: fixture.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'imported_row',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 100n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'Imported',
        classificationKind: 'expense',
        classificationSource: 'system',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.deleteManualTransaction, {
        transactionId: importedTransactionId,
      }),
    ).rejects.toThrow('Only manual transactions can be modified');
  });
});
