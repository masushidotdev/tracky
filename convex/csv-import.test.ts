/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
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

const userId = 'user_csv';

async function seedFixture(t: TestHarness) {
  await seedAuthKitUser(t, userId);
  const asUser = t.withIdentity({ subject: userId });
  const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
    name: 'CSV account',
    accountType: 'CACC',
    currency: 'EUR',
  });
  const ids = await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const ruleCategoryId = await ctx.db.insert('categories', {
      userId,
      name: 'Groceries',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const explicitCategoryId = await ctx.db.insert('categories', {
      userId,
      name: 'Dining',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('categoryRules', {
      userId,
      matchField: 'description',
      matchType: 'contains',
      pattern: 'market',
      categoryId: ruleCategoryId,
      enabled: true,
      priority: 100,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const importedAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      name: 'Connected account',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { explicitCategoryId, importedAccountId, ruleCategoryId };
  });
  return { accountId, asUser, ...ids };
}

function row(
  dedupeKey: string,
  overrides: Partial<{
    direction: 'CRDT' | 'DBIT';
    amount: { amountMinor: bigint; currency: string };
    bookingDate: string;
    description: string;
    categoryId: Id<'categories'>;
  }> = {},
) {
  return {
    direction: 'DBIT' as const,
    amount: { amountMinor: 250n, currency: 'EUR' },
    bookingDate: '2026-07-10',
    description: 'Market purchase',
    dedupeKey,
    ...overrides,
  };
}

describe('CSV transaction import', () => {
  test('inserts a batch and writes one aggregate balance snapshot', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const result = await fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId: fixture.accountId,
      rows: [
        row('csv|debit'),
        row('csv|credit', {
          direction: 'CRDT',
          amount: { amountMinor: 1000n, currency: 'EUR' },
          description: 'Salary',
        }),
      ],
    });

    expect(result).toEqual({ imported: 2, skippedDuplicates: 0, failed: [], triageQueued: 1 });
    const stored = await t.run(async (ctx) => {
      const transactions = await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', userId))
        .take(10);
      const balances = await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', fixture.accountId))
        .order('desc')
        .take(10);
      return { balances, transactions };
    });
    expect(stored.transactions).toHaveLength(2);
    expect(stored.balances).toHaveLength(2);
    expect(stored.balances[0]?.amount.amountMinor).toBe(750n);
  });

  test('skips pre-existing and intra-batch duplicate keys', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId: fixture.accountId,
      rows: [row('csv|existing')],
    });
    const result = await fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId: fixture.accountId,
      rows: [row('csv|existing'), row('csv|new'), row('csv|new')],
    });
    expect(result).toEqual({ imported: 1, skippedDuplicates: 2, failed: [], triageQueued: 0 });
  });

  test('preserves unmatchable rows as uncategorized residue for jev triage', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const result = await fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId: fixture.accountId,
      rows: [row('csv|cryptic', { description: 'XQZ 9917 TRN' })],
    });
    expect(result.triageQueued).toBe(1);
    const transaction = await t.run(async (ctx) =>
      ctx.db
        .query('transactions')
        .withIndex('by_accountId_and_dedupeKey', (q) =>
          q.eq('accountId', fixture.accountId).eq('dedupeKey', 'csv|cryptic'),
        )
        .unique(),
    );
    expect(transaction).toMatchObject({ classificationKind: 'uncategorized', classificationSource: 'system' });
  });

  test('reports a currency mismatch as a failed row', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const result = await fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId: fixture.accountId,
      rows: [row('csv|usd', { amount: { amountMinor: 100n, currency: 'USD' } })],
    });
    expect(result.imported).toBe(0);
    expect(result.failed).toEqual([{ index: 0, reason: 'Amount currency must match the account currency' }]);
  });

  test('uses explicit categories before rules and auto-assigns matching rules', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId: fixture.accountId,
      rows: [
        row('csv|explicit', { categoryId: fixture.explicitCategoryId }),
        row('csv|rule', { description: 'Local market' }),
      ],
    });
    const transactions = await t.run(async (ctx) =>
      ctx.db
        .query('transactions')
        .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', userId))
        .take(10),
    );
    const byKey = new Map(transactions.map((transaction) => [transaction.dedupeKey, transaction]));
    expect(byKey.get('csv|explicit')).toMatchObject({
      categoryId: fixture.explicitCategoryId,
      classificationSource: 'user',
    });
    expect(byKey.get('csv|rule')).toMatchObject({
      categoryId: fixture.ruleCategoryId,
      classificationSource: 'system',
    });
  });

  test('applies rule tags and report visibility during CSV import', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const tagId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const insertedTagId = await ctx.db.insert('transactionTags', {
        userId,
        name: 'CSV rule',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('categoryRules', {
        userId,
        matchField: 'description',
        matchType: 'contains',
        pattern: 'special import',
        categoryId: fixture.ruleCategoryId,
        addTagIds: [insertedTagId],
        hideFromReports: true,
        enabled: true,
        priority: 10,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return insertedTagId;
    });

    await fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId: fixture.accountId,
      rows: [row('csv|actions', { description: 'Special import purchase' })],
    });
    const transaction = await t.run(async (ctx) =>
      ctx.db
        .query('transactions')
        .withIndex('by_accountId_and_dedupeKey', (q) =>
          q.eq('accountId', fixture.accountId).eq('dedupeKey', 'csv|actions'),
        )
        .unique(),
    );
    expect(transaction).toMatchObject({
      categoryId: fixture.ruleCategoryId,
      tagIds: [tagId],
      hiddenFromReports: true,
    });
  });

  test('rejects connected accounts and accounts owned by another user', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await expect(
      fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
        accountId: fixture.importedAccountId,
        rows: [],
      }),
    ).rejects.toThrow('Only manual accounts accept manual transactions');

    const otherUserId = 'user_other_csv';
    await seedAuthKitUser(t, otherUserId);
    const otherAccountId = await t
      .withIdentity({ subject: otherUserId })
      .mutation(api.banking.manualAccounts.createManualAccount, {
        name: 'Other account',
        accountType: 'CACC',
        currency: 'EUR',
      });
    await expect(
      fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
        accountId: otherAccountId,
        rows: [],
      }),
    ).rejects.toThrow('Account not found');
  });

  test('rejects batches over 100 rows', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await expect(
      fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
        accountId: fixture.accountId,
        rows: Array.from({ length: 101 }, (_, index) => row(`csv|${index}`)),
      }),
    ).rejects.toThrow('At most 100 transactions');
  });

  test('findExistingDedupeKeys returns only keys stored on the target account', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await fixture.asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId: fixture.accountId,
      rows: [row('csv|present')],
    });
    const result = await fixture.asUser.query(api.banking.csvImport.findExistingDedupeKeys, {
      accountId: fixture.accountId,
      dedupeKeys: ['csv|missing', 'csv|present'],
    });
    expect(result).toEqual(['csv|present']);
  });
});
