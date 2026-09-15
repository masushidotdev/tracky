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
type SortField = 'bookingDate' | 'payee' | 'description' | 'category' | 'classification' | 'account' | 'note' | 'amount';
const MAX_TRANSACTION_SCAN = 5000;

async function seedSortFixture(t: TestHarness) {
  return await t.run(async (ctx) => {
    const userId = 'user_offset_page';
    const now = Date.UTC(2026, 0, 1);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const checkingId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'checking',
      name: 'Checking',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const savingsId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'savings',
      name: 'Savings',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const groceriesId = await ctx.db.insert('categories', {
      userId,
      name: 'Groceries',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const utilitiesId = await ctx.db.insert('categories', {
      userId,
      name: 'Utilities',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });

    const insert = async (input: {
      key: string;
      accountId: Id<'financialAccounts'>;
      categoryId?: Id<'categories'>;
      status: 'BOOK' | 'PDNG';
      direction: 'DBIT' | 'CRDT';
      amountMinor: bigint;
      bookingDate: string;
      description: string;
      payee?: string;
      classificationKind: 'expense' | 'income' | 'transfer';
      note?: string;
    }) =>
      await ctx.db.insert('transactions', {
        userId,
        accountId: input.accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: input.key,
        status: input.status,
        direction: input.direction,
        amount: { amountMinor: input.amountMinor, currency: 'EUR' },
        bookingDate: input.bookingDate,
        description: input.description,
        counterpartyName: input.payee,
        classificationKind: input.classificationKind,
        classificationSource: 'system',
        categoryId: input.categoryId,
        note: input.note,
        importedAtMs: now,
        updatedAtMs: now,
      });

    const alphaId = await insert({
      key: 'alpha',
      accountId: checkingId,
      categoryId: groceriesId,
      status: 'BOOK',
      direction: 'DBIT',
      amountMinor: 100n,
      bookingDate: '2026-01-02',
      description: 'Delta',
      payee: 'Bravo',
      classificationKind: 'expense',
    });
    const betaId = await insert({
      key: 'beta',
      accountId: savingsId,
      status: 'PDNG',
      direction: 'CRDT',
      amountMinor: 200n,
      bookingDate: '2026-01-01',
      description: 'Charlie',
      payee: 'Alpha',
      classificationKind: 'income',
      note: 'Zebra',
    });
    const gammaId = await insert({
      key: 'gamma',
      accountId: checkingId,
      categoryId: utilitiesId,
      status: 'BOOK',
      direction: 'DBIT',
      amountMinor: 300n,
      bookingDate: '2026-01-01',
      description: 'Alpha',
      classificationKind: 'transfer',
      note: 'Alpha',
    });

    return {
      userId,
      checkingId,
      groceriesId,
      alphaId,
      betaId,
      gammaId,
    };
  });
}

async function list(t: TestHarness, userId: string, field: SortField, direction: 'asc' | 'desc', filters = {}) {
  return await t.query(internal.banking.transactions.listTransactionsOffsetPageForUserQuery, {
    userId,
    filters,
    sort: { field, direction },
    limit: 100,
    offset: 0,
  });
}

function ids(rows: Array<{ _id: string }>) {
  return rows.map((row) => row._id);
}

describe('transaction offset page filters and sorting', () => {
  test('applies filter combinations before slicing', async () => {
    const t = createTest();
    const fixture = await seedSortFixture(t);
    const result = await list(t, fixture.userId, 'bookingDate', 'desc', {
      accountId: fixture.checkingId,
      categoryId: fixture.groceriesId,
      classificationKind: 'expense',
      status: 'BOOK',
      fromDate: '2026-01-02',
      toDate: '2026-01-02',
      amountFilters: [{ direction: 'DBIT', op: 'eq', amountMinor: 100n }],
      textFilters: [
        { field: 'payee', value: 'bra' },
        { field: 'category', value: 'gro' },
      ],
    });

    expect(ids(result.rows)).toEqual([fixture.alphaId]);
    expect(result.totalCount).toBe(1);
    expect(result.scanCapped).toBe(false);
  });

  test('slices with offset while preserving the total count', async () => {
    const t = createTest();
    const fixture = await seedSortFixture(t);
    const result = await t.query(internal.banking.transactions.listTransactionsOffsetPageForUserQuery, {
      userId: fixture.userId,
      filters: {},
      sort: { field: 'description', direction: 'asc' },
      limit: 1,
      offset: 1,
    });

    expect(ids(result.rows)).toEqual([fixture.betaId]);
    expect(result.totalCount).toBe(3);
  });

  test('sorts every field in both directions, with nulls last', async () => {
    const t = createTest();
    const fixture = await seedSortFixture(t);
    const tie = [fixture.betaId, fixture.gammaId].sort((left, right) => left.localeCompare(right));
    const checkingTie = [fixture.alphaId, fixture.gammaId].sort((left, right) => left.localeCompare(right));
    const expected: Record<SortField, { asc: Array<string>; desc: Array<string> }> = {
      bookingDate: {
        asc: [...tie, fixture.alphaId],
        desc: [fixture.alphaId, ...tie],
      },
      payee: {
        // gamma is a transfer: its payee cell reads "Transfer: <account>", so it sorts as a
        // transfer rather than as an empty payee - together with the other transfers, after the
        // ordinary payees ascending and before them descending.
        asc: [fixture.betaId, fixture.alphaId, fixture.gammaId],
        desc: [fixture.gammaId, fixture.alphaId, fixture.betaId],
      },
      description: {
        asc: [fixture.gammaId, fixture.betaId, fixture.alphaId],
        desc: [fixture.alphaId, fixture.betaId, fixture.gammaId],
      },
      category: {
        asc: [fixture.alphaId, fixture.gammaId, fixture.betaId],
        desc: [fixture.gammaId, fixture.alphaId, fixture.betaId],
      },
      classification: {
        asc: [fixture.alphaId, fixture.betaId, fixture.gammaId],
        desc: [fixture.gammaId, fixture.betaId, fixture.alphaId],
      },
      account: {
        asc: [...checkingTie, fixture.betaId],
        desc: [fixture.betaId, ...checkingTie],
      },
      note: {
        asc: [fixture.gammaId, fixture.betaId, fixture.alphaId],
        desc: [fixture.betaId, fixture.gammaId, fixture.alphaId],
      },
      amount: {
        asc: [fixture.gammaId, fixture.alphaId, fixture.betaId],
        desc: [fixture.betaId, fixture.alphaId, fixture.gammaId],
      },
    };

    for (const field of Object.keys(expected) as Array<SortField>) {
      const [ascending, descending] = await Promise.all([
        list(t, fixture.userId, field, 'asc'),
        list(t, fixture.userId, field, 'desc'),
      ]);
      expect(ids(ascending.rows), `${field} ascending`).toEqual(expected[field].asc);
      expect(ids(descending.rows), `${field} descending`).toEqual(expected[field].desc);
    }
  });

  test('uses the id as the deterministic tie-break in either direction', async () => {
    const t = createTest();
    const fixture = await seedSortFixture(t);
    const expectedTie = [fixture.betaId, fixture.gammaId].sort((left, right) => left.localeCompare(right));
    const ascending = await list(t, fixture.userId, 'bookingDate', 'asc');
    const descending = await list(t, fixture.userId, 'bookingDate', 'desc');

    expect(ids(ascending.rows).slice(0, 2)).toEqual(expectedTie);
    expect(ids(descending.rows).slice(1)).toEqual(expectedTie);
  });
});

test(
  'reports scanCapped when the most recent scan exceeds the bound',
  async () => {
    const t = createTest();
    const userId = 'user_scan_cap';
    const fixture = await t.run(async (ctx) => {
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
        providerAccountId: 'scan_cap',
        name: 'Scan cap',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { accountId, providerConnectionId, now };
    });

    const batchSize = 100;
    for (let start = 0; start < MAX_TRANSACTION_SCAN + 1; start += batchSize) {
      const end = Math.min(start + batchSize, MAX_TRANSACTION_SCAN + 1);
      await t.run(async (ctx) => {
        for (let index = start; index < end; index += 1) {
          await ctx.db.insert('transactions', {
            userId,
            accountId: fixture.accountId,
            providerConnectionId: fixture.providerConnectionId,
            provider: 'mock',
            dedupeKey: `scan_${index}`,
            status: 'BOOK',
            direction: 'DBIT',
            amount: { amountMinor: BigInt(index + 1), currency: 'EUR' },
            bookingDate: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
            description: `Transaction ${index}`,
            classificationKind: 'expense',
            classificationSource: 'system',
            importedAtMs: fixture.now,
            updatedAtMs: fixture.now,
          });
        }
      });
    }

    const result = await list(t, userId, 'bookingDate', 'desc');
    expect(result.scanCapped).toBe(true);
    expect(result.totalCount).toBe(MAX_TRANSACTION_SCAN);
  },
  60_000,
);
