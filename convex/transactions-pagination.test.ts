/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/subscriptionDetection.ts',
  './banking/transactions.ts',
  './lib/*.ts',
]);

function createTest() {
  return convexTest(schema, modules);
}

type TestHarness = ReturnType<typeof createTest>;
type ListTransactionsForUserArgs = {
  userId: string;
  paginationOpts: {
    numItems: number;
    cursor: string | null;
  };
  search?: string;
  accountId?: Id<'financialAccounts'>;
  classificationKind?: 'expense' | 'income' | 'transfer' | 'uncategorized';
  direction?: 'DBIT' | 'CRDT';
  status?: 'BOOK' | 'PDNG';
  categoryId?: Id<'categories'>;
  fromDate?: string;
  toDate?: string;
  sortField?: 'bookingDate' | 'amount';
  sortDirection?: 'asc' | 'desc';
};

function isoDate(offsetDays: number) {
  const date = new Date(Date.UTC(2026, 0, 1 + offsetDays));
  return date.toISOString().slice(0, 10);
}

async function seedTransactions(
  t: TestHarness,
  userId: string,
  count: number,
  descriptionForIndex: (index: number) => string,
) {
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
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'account_test',
      name: 'Main account',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });

    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: `tx_${index}`,
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: BigInt(100 + index),
          currency: 'EUR',
        },
        bookingDate: isoDate(index),
        description: descriptionForIndex(index),
        classificationKind: 'expense',
        classificationSource: 'system',
        importedAtMs: now,
        updatedAtMs: now,
      });
    }
  });
}

async function seedClassifiableTransaction(t: TestHarness) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 0, 1);
    const userId = 'user_test';
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
      providerAccountId: 'account_classification',
      name: 'Main account',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const categoryId = await ctx.db.insert('categories', {
      userId,
      name: 'Groceries',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const otherUserCategoryId = await ctx.db.insert('categories', {
      userId: 'other_user',
      name: 'Other groceries',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const transactionId = await ctx.db.insert('transactions', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'mock',
      dedupeKey: 'tx_classification',
      status: 'BOOK',
      direction: 'DBIT',
      amount: {
        amountMinor: 1234n,
        currency: 'EUR',
      },
      bookingDate: '2026-01-10',
      description: 'Grocery store',
      classificationKind: 'uncategorized',
      classificationSource: 'provider',
      importedAtMs: now,
      updatedAtMs: now,
    });

    return { categoryId, otherUserCategoryId, transactionId, userId };
  });
}

async function seedMatchedTransferFixture(t: TestHarness) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 0, 1);
    const userId = 'user_test';
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
      providerAccountId: 'source_account',
      name: 'Checking',
      alias: 'Acme Bank',
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
      providerAccountId: 'destination_account',
      name: 'Acme Personal',
      alias: 'Travel card',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const outgoingTransactionId = await ctx.db.insert('transactions', {
      userId,
      accountId: sourceAccountId,
      providerConnectionId,
      provider: 'mock',
      dedupeKey: 'outgoing_transfer',
      status: 'BOOK',
      direction: 'DBIT',
      amount: {
        amountMinor: 80000n,
        currency: 'EUR',
      },
      bookingDate: '2026-01-10',
      description: 'Top up Acme wallet',
      classificationKind: 'transfer',
      classificationSource: 'system',
      importedAtMs: now,
      updatedAtMs: now,
    });
    const incomingTransactionId = await ctx.db.insert('transactions', {
      userId,
      accountId: destinationAccountId,
      providerConnectionId,
      provider: 'mock',
      dedupeKey: 'incoming_transfer',
      status: 'BOOK',
      direction: 'CRDT',
      amount: {
        amountMinor: 76000n,
        currency: 'EUR',
      },
      bookingDate: '2026-01-11',
      description: 'Apple Pay Top-Up',
      classificationKind: 'transfer',
      classificationSource: 'system',
      importedAtMs: now,
      updatedAtMs: now,
    });
    const transferMatchId = await ctx.db.insert('transferMatches', {
      userId,
      outgoingTransactionId,
      incomingTransactionId,
      status: 'confirmed',
      amountDelta: {
        amountMinor: 4000n,
        currency: 'EUR',
      },
      feeAmount: {
        amountMinor: 4000n,
        currency: 'EUR',
      },
      confidence: 0.9,
      source: 'system',
      createdAtMs: now,
      updatedAtMs: now,
    });

    await ctx.db.patch('transactions', outgoingTransactionId, { transferMatchId });
    await ctx.db.patch('transactions', incomingTransactionId, { transferMatchId });

    return {
      destinationAccountId,
      incomingTransactionId,
      outgoingTransactionId,
      sourceAccountId,
      transferMatchId,
      userId,
    };
  });
}

async function seedUnmatchedTransferFixture(t: TestHarness) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 0, 1);
    const userId = 'user_test';
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
      providerAccountId: 'solo_transfer_account',
      name: 'Solo account',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const transactionId = await ctx.db.insert('transactions', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'mock',
      dedupeKey: 'solo_transfer',
      status: 'BOOK',
      direction: 'DBIT',
      amount: {
        amountMinor: 12000n,
        currency: 'EUR',
      },
      bookingDate: '2026-01-12',
      description: 'Manual transfer',
      classificationKind: 'transfer',
      classificationSource: 'user',
      importedAtMs: now,
      updatedAtMs: now,
    });

    return { accountId, transactionId, userId };
  });
}

async function collectTransactionPages(t: TestHarness, args: ListTransactionsForUserArgs) {
  const collectedIds = new Set<string>();
  const pageLengths: Array<number> = [];
  let cursor: string | null = args.paginationOpts.cursor;
  let isDone = false;

  while (!isDone) {
    const result: {
      page: Array<{ _id: string }>;
      continueCursor: string;
      isDone: boolean;
    } = await t.query(internal.banking.transactions.listTransactionsForUser, {
      ...args,
      paginationOpts: {
        ...args.paginationOpts,
        cursor,
      },
    });

    pageLengths.push(result.page.length);
    for (const transaction of result.page) {
      collectedIds.add(transaction._id);
    }

    cursor = result.continueCursor;
    isDone = result.isDone;
  }

  return { collectedIds, pageLengths };
}

describe('transaction cursor pagination', () => {
  test('continues beyond two pages using Convex continueCursor values', async () => {
    const t = createTest();
    const userId = 'user_test';
    await seedTransactions(t, userId, 61, (index) => `Transaction ${index}`);

    const { collectedIds, pageLengths } = await collectTransactionPages(t, {
      userId,
      paginationOpts: {
        numItems: 20,
        cursor: null,
      },
      sortField: 'bookingDate',
      sortDirection: 'desc',
    });

    expect(pageLengths).toEqual([20, 20, 20, 1]);
    expect(collectedIds.size).toBe(61);
  });

  test('fills pages when secondary filters skip non-matching cursor results', async () => {
    const t = createTest();
    const userId = 'user_test';
    await seedTransactions(t, userId, 50, (index) => (index % 2 === 0 ? `Needle transaction ${index}` : `Other ${index}`));

    const { collectedIds, pageLengths } = await collectTransactionPages(t, {
      userId,
      paginationOpts: {
        numItems: 10,
        cursor: null,
      },
      search: 'needle',
      sortField: 'bookingDate',
      sortDirection: 'desc',
    });

    expect(pageLengths).toEqual([10, 10, 5]);
    expect(collectedIds.size).toBe(25);
  });
});

async function seedFilterMatrixFixture(t: TestHarness) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 0, 1);
    const userId = 'user_test';
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountIds: Array<Id<'financialAccounts'>> = [];
    for (const providerAccountId of ['matrix_account_a', 'matrix_account_b']) {
      accountIds.push(
        await ctx.db.insert('financialAccounts', {
          userId,
          providerConnectionId,
          provider: 'mock',
          providerAccountId,
          name: providerAccountId,
          currency: 'EUR',
          status: 'active',
          syncEnabled: true,
          createdAtMs: now,
          updatedAtMs: now,
        }),
      );
    }
    const categoryId = await ctx.db.insert('categories', {
      userId,
      name: 'Groceries',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });

    const directions = ['DBIT', 'CRDT'] as const;
    const statuses = ['BOOK', 'PDNG'] as const;
    const kinds = ['expense', 'income'] as const;
    const transactionIds: Array<Id<'transactions'>> = [];
    for (let index = 0; index < 48; index += 1) {
      transactionIds.push(
        await ctx.db.insert('transactions', {
          userId,
          accountId: accountIds[index % 2],
          providerConnectionId,
          provider: 'mock',
          dedupeKey: `matrix_tx_${index}`,
          status: statuses[Math.floor(index / 2) % 2],
          direction: directions[Math.floor(index / 4) % 2],
          amount: {
            amountMinor: BigInt(100 + index),
            currency: 'EUR',
          },
          bookingDate: isoDate(index),
          description: index % 3 === 0 ? `Needle purchase ${index}` : `Other purchase ${index}`,
          classificationKind: kinds[Math.floor(index / 8) % 2],
          classificationSource: 'system',
          categoryId: index % 2 === 0 ? categoryId : undefined,
          importedAtMs: now,
          updatedAtMs: now,
        }),
      );
    }

    return { accountIds, categoryId, transactionIds, userId };
  });
}

describe('transaction filter combinations', () => {
  test('paginates account + date range filters without multiple paginated queries', async () => {
    const t = createTest();
    const fixture = await seedFilterMatrixFixture(t);

    const { collectedIds, pageLengths } = await collectTransactionPages(t, {
      userId: fixture.userId,
      accountId: fixture.accountIds[0],
      fromDate: isoDate(8),
      toDate: isoDate(31),
      paginationOpts: {
        numItems: 5,
        cursor: null,
      },
      sortField: 'bookingDate',
      sortDirection: 'desc',
    });

    // Account A holds the even indexes; dates 8..31 inclusive → indexes 8, 10, ..., 30.
    expect(collectedIds.size).toBe(12);
    expect(pageLengths.slice(0, -1).every((length) => length === 5)).toBe(true);
  });

  test('date range boundaries are inclusive', async () => {
    const t = createTest();
    const fixture = await seedFilterMatrixFixture(t);

    const result = await t.query(internal.banking.transactions.listTransactionsForUser, {
      userId: fixture.userId,
      fromDate: isoDate(10),
      toDate: isoDate(10),
      paginationOpts: {
        numItems: 20,
        cursor: null,
      },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].bookingDate).toBe(isoDate(10));
  });

  test('every single filter works alone', async () => {
    const t = createTest();
    const fixture = await seedFilterMatrixFixture(t);
    const paginationOpts = { numItems: 100, cursor: null };
    const base = { userId: fixture.userId, paginationOpts };

    const byAccount = await t.query(internal.banking.transactions.listTransactionsForUser, {
      ...base,
      accountId: fixture.accountIds[1],
    });
    const byKind = await t.query(internal.banking.transactions.listTransactionsForUser, {
      ...base,
      classificationKind: 'income',
    });
    const byDirection = await t.query(internal.banking.transactions.listTransactionsForUser, {
      ...base,
      direction: 'CRDT',
    });
    const byStatus = await t.query(internal.banking.transactions.listTransactionsForUser, {
      ...base,
      status: 'PDNG',
    });
    const byCategory = await t.query(internal.banking.transactions.listTransactionsForUser, {
      ...base,
      categoryId: fixture.categoryId,
    });
    const bySearch = await t.query(internal.banking.transactions.listTransactionsForUser, {
      ...base,
      search: 'needle',
    });

    expect(byAccount.page).toHaveLength(24);
    expect(byKind.page).toHaveLength(24);
    expect(byDirection.page).toHaveLength(24);
    expect(byStatus.page).toHaveLength(24);
    expect(byCategory.page).toHaveLength(24);
    expect(bySearch.page).toHaveLength(16);
  });

  test('all filters combined return the exact intersection', async () => {
    const t = createTest();
    const fixture = await seedFilterMatrixFixture(t);

    const { collectedIds } = await collectTransactionPages(t, {
      userId: fixture.userId,
      accountId: fixture.accountIds[0],
      classificationKind: 'expense',
      direction: 'DBIT',
      status: 'BOOK',
      categoryId: fixture.categoryId,
      fromDate: isoDate(0),
      toDate: isoDate(47),
      search: 'needle',
      paginationOpts: {
        numItems: 3,
        cursor: null,
      },
      sortField: 'bookingDate',
      sortDirection: 'desc',
    });

    // Account A (even index) + BOOK (index/2 even) + DBIT (index/4 even) +
    // expense (index/8 even) + category (even index) + needle (index % 3 === 0)
    // → indexes 0, 6, 18, 24, 30, 36, 42 restricted to DBIT+BOOK+expense blocks: 0, 6, 18, 36, 42.
    const expectedIndexes = Array.from({ length: 48 }, (_, index) => index).filter(
      (index) =>
        index % 2 === 0 &&
        Math.floor(index / 2) % 2 === 0 &&
        Math.floor(index / 4) % 2 === 0 &&
        Math.floor(index / 8) % 2 === 0 &&
        index % 3 === 0,
    );
    expect(collectedIds.size).toBe(expectedIndexes.length);
    for (const index of expectedIndexes) {
      expect(collectedIds.has(fixture.transactionIds[index])).toBe(true);
    }
  });
});

describe('transaction transfer presentation', () => {
  test('returns one neutral row for a confirmed matched transfer', async () => {
    const t = createTest();
    const fixture = await seedMatchedTransferFixture(t);

    const result = await t.query(internal.banking.transactions.listTransactionsForUser, {
      userId: fixture.userId,
      paginationOpts: {
        numItems: 20,
        cursor: null,
      },
      sortField: 'bookingDate',
      sortDirection: 'desc',
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].transferPresentation).toMatchObject({
      kind: 'matched',
      matchId: fixture.transferMatchId,
      sourceLabel: 'Acme Bank',
      destinationLabel: 'Travel card',
    });
    expect(result.page[0].transferPresentation?.neutralAmount.amountMinor).toBe(76000n);
    expect(result.page[0].transferPresentation?.amountDelta?.amountMinor).toBe(4000n);
    expect(result.page[0].transferPresentation?.outgoing?._id).toBe(fixture.outgoingTransactionId);
    expect(result.page[0].transferPresentation?.incoming?._id).toBe(fixture.incomingTransactionId);
  });

  test('includes a confirmed matched transfer when either side matches account or direction filters', async () => {
    const t = createTest();
    const fixture = await seedMatchedTransferFixture(t);

    const destinationAccountResult = await t.query(internal.banking.transactions.listTransactionsForUser, {
      userId: fixture.userId,
      accountId: fixture.destinationAccountId,
      paginationOpts: {
        numItems: 20,
        cursor: null,
      },
      sortField: 'bookingDate',
      sortDirection: 'desc',
    });
    const debitDirectionResult = await t.query(internal.banking.transactions.listTransactionsForUser, {
      userId: fixture.userId,
      direction: 'DBIT',
      paginationOpts: {
        numItems: 20,
        cursor: null,
      },
      sortField: 'bookingDate',
      sortDirection: 'desc',
    });
    const creditDirectionResult = await t.query(internal.banking.transactions.listTransactionsForUser, {
      userId: fixture.userId,
      direction: 'CRDT',
      paginationOpts: {
        numItems: 20,
        cursor: null,
      },
      sortField: 'bookingDate',
      sortDirection: 'desc',
    });

    expect(destinationAccountResult.page).toHaveLength(1);
    expect(destinationAccountResult.page[0].transferPresentation?.kind).toBe('matched');
    expect(debitDirectionResult.page).toHaveLength(1);
    expect(debitDirectionResult.page[0].transferPresentation?.kind).toBe('matched');
    expect(creditDirectionResult.page).toHaveLength(1);
    expect(creditDirectionResult.page[0].transferPresentation?.kind).toBe('matched');
  });

  test('returns unmatched transfer presentation when no confirmed match exists', async () => {
    const t = createTest();
    const fixture = await seedUnmatchedTransferFixture(t);

    const result = await t.query(internal.banking.transactions.listTransactionsForUser, {
      userId: fixture.userId,
      paginationOpts: {
        numItems: 20,
        cursor: null,
      },
      sortField: 'bookingDate',
      sortDirection: 'desc',
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].transferPresentation).toMatchObject({
      kind: 'unmatched',
      sourceLabel: 'Solo account',
      destinationLabel: null,
    });
    expect(result.page[0].transferPresentation?.neutralAmount.amountMinor).toBe(12000n);
  });

  test('uses a linked money box as the destination of an unmatched outgoing transfer', async () => {
    const t = createTest();
    const fixture = await seedUnmatchedTransferFixture(t);
    const moneyBoxId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const id = await ctx.db.insert('moneyBoxes', {
        userId: fixture.userId,
        name: 'Car insurance',
        targetAmount: { amountMinor: 60000n, currency: 'EUR' },
        savedAmount: { amountMinor: 12000n, currency: 'EUR' },
        targetDate: '2026-08-31',
        status: 'active',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('moneyBoxContributions', {
        userId: fixture.userId,
        moneyBoxId: id,
        amount: { amountMinor: 12000n, currency: 'EUR' },
        contributionDate: '2026-01-12',
        source: 'transaction',
        transactionId: fixture.transactionId,
        createdAtMs: now,
      });
      return id;
    });

    const result = await t.query(internal.banking.transactions.listTransactionsForUser, {
      userId: fixture.userId,
      paginationOpts: { numItems: 20, cursor: null },
      sortField: 'bookingDate',
      sortDirection: 'desc',
    });

    expect(result.page[0].transferPresentation).toMatchObject({
      kind: 'unmatched',
      sourceLabel: 'Solo account',
      destinationLabel: 'Car insurance',
      moneyBoxId,
      moneyBoxName: 'Car insurance',
    });
  });
});

describe('transaction classification', () => {
  test('allows manual unmatched transfer classification', async () => {
    const t = createTest();
    const fixture = await seedClassifiableTransaction(t);

    await t.mutation(internal.banking.transactions.setClassificationForUser, {
      userId: fixture.userId,
      transactionId: fixture.transactionId,
      classificationKind: 'transfer',
    });

    const transaction = await t.run(async (ctx) => {
      return await ctx.db.get('transactions', fixture.transactionId);
    });

    expect(transaction?.classificationKind).toBe('transfer');
    expect(transaction?.classificationSource).toBe('user');
  });

  test('requires category ownership when manually classifying a transaction', async () => {
    const t = createTest();
    const fixture = await seedClassifiableTransaction(t);

    await expect(
      t.mutation(internal.banking.transactions.setClassificationForUser, {
        userId: fixture.userId,
        transactionId: fixture.transactionId,
        classificationKind: 'expense',
        categoryId: fixture.otherUserCategoryId,
      }),
    ).rejects.toThrow('Category not found');

    await t.mutation(internal.banking.transactions.setClassificationForUser, {
      userId: fixture.userId,
      transactionId: fixture.transactionId,
      classificationKind: 'expense',
      categoryId: fixture.categoryId,
    });

    const transaction = await t.run(async (ctx) => {
      return await ctx.db.get('transactions', fixture.transactionId);
    });

    expect(transaction?.classificationKind).toBe('expense');
    expect(transaction?.categoryId).toBe(fixture.categoryId);
    expect(transaction?.classificationSource).toBe('user');
  });
});
