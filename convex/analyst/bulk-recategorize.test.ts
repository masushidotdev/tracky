/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const discoveredModules = import.meta.glob(['../_generated/*.js', './writes.ts']);
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, loader]) => [
    path.startsWith('../') ? `./${path.slice(3)}` : `./analyst/${path.slice(2)}`,
    loader,
  ]),
);

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const connectionId = await ctx.db.insert('providerConnections', {
      userId: 'user_a',
      provider: 'mock',
      status: 'active',
      displayName: 'Test',
      createdAtMs: 1,
      updatedAtMs: 1,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId: 'user_a',
      providerConnectionId: connectionId,
      provider: 'mock',
      name: 'Main',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: 1,
      updatedAtMs: 1,
    });
    const foodId = await ctx.db.insert('categories', {
      userId: 'user_a',
      name: 'Food',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: 1,
      updatedAtMs: 1,
    });
    const incomeId = await ctx.db.insert('categories', {
      userId: 'user_a',
      name: 'Salary',
      kind: 'income',
      budgetEligible: false,
      createdAtMs: 1,
      updatedAtMs: 1,
    });
    const transactionIds: Array<Id<'transactions'>> = [];
    for (const index of [1, 2]) {
      transactionIds.push(
        await ctx.db.insert('transactions', {
          userId: 'user_a',
          accountId,
          providerConnectionId: connectionId,
          provider: 'mock',
          dedupeKey: `tx-${index}`,
          status: 'BOOK',
          direction: 'DBIT',
          amount: { amountMinor: 1_000n, currency: 'EUR' },
          bookingDate: '2026-07-01',
          description: `Transaction ${index}`,
          classificationKind: 'uncategorized',
          classificationSource: 'system',
          importedAtMs: 1,
          updatedAtMs: 1,
        }),
      );
    }
    return { transactionIds, foodId, incomeId };
  });
}

describe('bulk recategorization mutation', () => {
  test('applies all validated changes with user source', async () => {
    const t = convexTest(schema, modules);
    const { transactionIds, foodId } = await seed(t);
    await t.mutation(internal.analyst.writes.bulkRecategorizeForAgent, {
      userId: 'user_a',
      changes: transactionIds.map((transactionId) => ({ transactionId, classificationKind: 'expense' as const, categoryName: 'Food' })),
    });
    await t.run(async (ctx) => {
      for (const transactionId of transactionIds) {
        const row = await ctx.db.get('transactions', transactionId);
        expect(row).toMatchObject({ categoryId: foodId, classificationKind: 'expense', classificationSource: 'user' });
      }
    });
  });

  test('prevalidates category coherence and rolls back the whole batch', async () => {
    const t = convexTest(schema, modules);
    const { transactionIds } = await seed(t);
    await expect(
      t.mutation(internal.analyst.writes.bulkRecategorizeForAgent, {
        userId: 'user_a',
        changes: [
          { transactionId: transactionIds[0], classificationKind: 'expense', categoryName: 'Food' },
          { transactionId: transactionIds[1], classificationKind: 'expense', categoryName: 'Salary' },
        ],
      }),
    ).rejects.toThrow('incompatible');
    await t.run(async (ctx) => {
      for (const transactionId of transactionIds) {
        const row = await ctx.db.get('transactions', transactionId);
        expect(row?.classificationKind).toBe('uncategorized');
        expect(row?.categoryId).toBeUndefined();
      }
    });
  });

  test('rejects a cross-user transaction before applying any change', async () => {
    const t = convexTest(schema, modules);
    const { transactionIds } = await seed(t);
    const foreignId = await t.run(async (ctx) => {
      const template = await ctx.db.get('transactions', transactionIds[0]);
      const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...fields } = template!;
      return await ctx.db.insert('transactions', {
        ...fields,
        userId: 'user_b',
        dedupeKey: 'foreign',
      });
    });
    await expect(
      t.mutation(internal.analyst.writes.bulkRecategorizeForAgent, {
        userId: 'user_a',
        changes: [
          { transactionId: transactionIds[0], classificationKind: 'expense', categoryName: 'Food' },
          { transactionId: foreignId, classificationKind: 'expense' },
        ],
      }),
    ).rejects.toThrow('Transaction not found');
    await t.run(async (ctx) => {
      expect((await ctx.db.get('transactions', transactionIds[0]))?.classificationKind).toBe('uncategorized');
    });
  });
});
