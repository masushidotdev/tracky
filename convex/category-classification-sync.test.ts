/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { api, components } from './_generated/api';
import schema from './schema';
import type { Doc, Id } from './_generated/dataModel';

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

async function seedFixture(t: TestHarness) {
  const userId = 'user_test';
  await seedAuthKitUser(t, userId);
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 2, 21);
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
      providerAccountId: 'acme_personal',
      name: 'Acme Personal',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const insertCategory = async (name: string, systemKey: string, kind: Doc<'categories'>['kind']) =>
      await ctx.db.insert('categories', {
        userId,
        name,
        systemKey,
        kind,
        budgetEligible: kind === 'expense',
        createdAtMs: now,
        updatedAtMs: now,
      });
    const topUpCategoryId = await insertCategory('Top-Up', 'transfer:topup', 'transfer');
    const groceriesCategoryId = await insertCategory('Groceries', 'expense:groceries', 'expense');
    const salaryCategoryId = await insertCategory('Salary', 'income:salary', 'income');
    const giftCategoryId = await ctx.db.insert('categories', {
      userId,
      name: 'Gift',
      systemKey: 'category:gift',
      kind: 'expense',
      applicableKinds: ['expense', 'income', 'transfer'],
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const loansCategoryId = await ctx.db.insert('categories', {
      userId,
      name: 'Loans',
      systemKey: 'expense:loans',
      kind: 'expense',
      applicableKinds: ['expense', 'internal'],
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const insertTransaction = async (input: {
      dedupeKey: string;
      direction: 'CRDT' | 'DBIT';
      description: string;
      classificationKind: Doc<'transactions'>['classificationKind'];
      classificationSource: Doc<'transactions'>['classificationSource'];
      categoryId?: Id<'categories'>;
    }) =>
      await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: input.dedupeKey,
        status: 'BOOK',
        direction: input.direction,
        amount: { amountMinor: 5000n, currency: 'EUR' },
        bookingDate: '2026-03-21',
        description: input.description,
        classificationKind: input.classificationKind,
        classificationSource: input.classificationSource,
        categoryId: input.categoryId,
        importedAtMs: now,
        updatedAtMs: now,
      });

    return {
      userId,
      topUpCategoryId,
      groceriesCategoryId,
      salaryCategoryId,
      giftCategoryId,
      loansCategoryId,
      mortgageTransactionId: await insertTransaction({
        dedupeKey: 'mutuo_rateale',
        direction: 'DBIT',
        description: 'PAG.FIN.RATEALE MUTUO 08/17709994 QUOTA',
        classificationKind: 'internal',
        classificationSource: 'user',
      }),
      topUpTransactionId: await insertTransaction({
        dedupeKey: 'apple_pay_topup',
        direction: 'CRDT',
        description: 'Apple Pay Top-Up by *4242',
        classificationKind: 'income',
        classificationSource: 'provider',
      }),
      subscriptionTransactionId: await insertTransaction({
        dedupeKey: 'netflix',
        direction: 'DBIT',
        description: 'Acme Streaming',
        classificationKind: 'subscription',
        classificationSource: 'system',
      }),
      groceriesTransactionId: await insertTransaction({
        dedupeKey: 'conad',
        direction: 'DBIT',
        description: 'Acme Groceries',
        classificationKind: 'expense',
        classificationSource: 'system',
        categoryId: groceriesCategoryId,
      }),
    };
  });
}

describe('setCategory keeps classificationKind in sync with the category kind', () => {
  test('assigning a transfer-kind category reclassifies the transaction as transfer', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.transactions.setCategory, {
      transactionId: fixture.topUpTransactionId,
      categoryId: fixture.topUpCategoryId,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.topUpTransactionId));
    expect(updated).toMatchObject({
      categoryId: fixture.topUpCategoryId,
      classificationKind: 'transfer',
      classificationSource: 'user',
      classificationConfidence: 1,
    });
  });

  test('assigning an income-kind category reclassifies the transaction as income', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.transactions.setCategory, {
      transactionId: fixture.groceriesTransactionId,
      categoryId: fixture.salaryCategoryId,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.groceriesTransactionId));
    expect(updated).toMatchObject({
      categoryId: fixture.salaryCategoryId,
      classificationKind: 'income',
      classificationSource: 'user',
    });
  });

  test('assigning a multi-kind category preserves a compatible classification', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.transactions.setCategory, {
      transactionId: fixture.topUpTransactionId,
      categoryId: fixture.giftCategoryId,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.topUpTransactionId));
    expect(updated).toMatchObject({
      categoryId: fixture.giftCategoryId,
      classificationKind: 'income',
      classificationSource: 'user',
      classificationConfidence: 1,
    });
  });

  test('assigning an expense-kind category keeps a subscription classification', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.transactions.setCategory, {
      transactionId: fixture.subscriptionTransactionId,
      categoryId: fixture.groceriesCategoryId,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.subscriptionTransactionId));
    expect(updated).toMatchObject({
      categoryId: fixture.groceriesCategoryId,
      classificationKind: 'subscription',
      classificationSource: 'user',
      classificationConfidence: 1,
    });
  });

  test('assigning the Loans category to an internal transaction keeps it internal', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.transactions.setCategory, {
      transactionId: fixture.mortgageTransactionId,
      categoryId: fixture.loansCategoryId,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.mortgageTransactionId));
    expect(updated).toMatchObject({
      categoryId: fixture.loansCategoryId,
      classificationKind: 'internal',
      classificationSource: 'user',
    });
  });

  test('assigning an expense-only category to an internal transaction reclassifies it as expense', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.transactions.setCategory, {
      transactionId: fixture.mortgageTransactionId,
      categoryId: fixture.groceriesCategoryId,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.mortgageTransactionId));
    expect(updated).toMatchObject({
      categoryId: fixture.groceriesCategoryId,
      classificationKind: 'expense',
      classificationSource: 'user',
    });
  });

  test('clearing the category keeps the current classification', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.transactions.setCategory, {
      transactionId: fixture.groceriesTransactionId,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.groceriesTransactionId));
    expect(updated?.categoryId).toBeUndefined();
    expect(updated).toMatchObject({
      classificationKind: 'expense',
      classificationSource: 'user',
      classificationConfidence: 1,
    });
  });
});

describe('setClassification drops a category incompatible with the new classification', () => {
  test('marking an expense-categorized transaction as transfer clears the expense category', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.transactions.setClassification, {
      transactionId: fixture.groceriesTransactionId,
      classificationKind: 'transfer',
      categoryId: fixture.groceriesCategoryId,
      confidence: 1,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.groceriesTransactionId));
    expect(updated?.classificationKind).toBe('transfer');
    expect(updated?.categoryId).toBeUndefined();
  });

  test('a compatible category is preserved when reclassifying', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.transactions.setClassification, {
      transactionId: fixture.groceriesTransactionId,
      classificationKind: 'subscription',
      categoryId: fixture.groceriesCategoryId,
      confidence: 1,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.groceriesTransactionId));
    expect(updated?.classificationKind).toBe('subscription');
    expect(updated?.categoryId).toBe(fixture.groceriesCategoryId);
  });

  test('a multi-kind category is preserved when reclassifying as transfer', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.transactions.setClassification, {
      transactionId: fixture.groceriesTransactionId,
      classificationKind: 'transfer',
      categoryId: fixture.giftCategoryId,
      confidence: 1,
    });

    const updated = await t.run(async (ctx) => await ctx.db.get('transactions', fixture.groceriesTransactionId));
    expect(updated).toMatchObject({
      categoryId: fixture.giftCategoryId,
      classificationKind: 'transfer',
    });
  });
});
