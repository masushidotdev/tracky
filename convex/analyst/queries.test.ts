/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import { describe, expect, test, vi } from 'vitest';
import schema from '../schema';
import { insertPlannedExpense, insertPlannedTransfer } from '../plannedTransactionsTestHelpers';
import { analystFunctionRefs } from './functionRefs';
import type { Id } from '../_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const discoveredModules = import.meta.glob([
  '../_generated/*.js',
  './queries.ts',
  '../banking/*.ts',
  '../lib/*.ts',
]);
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, loader]) => [
    path.startsWith('../') ? `./${path.slice(3)}` : `./analyst/${path.slice(2)}`,
    loader,
  ]),
);

function createTest() {
  return convexTest(schema, modules);
}

const getLongTermBaselineForUser = makeFunctionReference<
  'query',
  { userId: string; currency?: string },
  {
    currency: string;
    liquidMinor: bigint;
    investedMinor: bigint;
    monthlyIncomeMinor: bigint;
    monthlyExpensesMinor: bigint;
  }
>('analyst/queries:getLongTermBaselineForUser');

type Seeded = {
  accountId: Id<'financialAccounts'>;
  hiddenAccountId: Id<'financialAccounts'>;
  categoryId: Id<'categories'>;
};

async function seedBase(t: ReturnType<typeof createTest>): Promise<Seeded> {
  return await t.run(async (ctx) => {
    const userId = 'user_analyst';
    const now = Date.UTC(2026, 6, 1);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock bank',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      name: 'Main account',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const hiddenAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      name: 'Hidden account',
      hidden: true,
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
    return { accountId, hiddenAccountId, categoryId };
  });
}

async function insertTransaction(
  t: ReturnType<typeof createTest>,
  seeded: Seeded,
  input: { id: string; amount: bigint; kind: 'expense' | 'transfer' | 'internal'; date?: string },
) {
  await t.run(async (ctx) => {
    const account = await ctx.db.get('financialAccounts', seeded.accountId);
    await ctx.db.insert('transactions', {
      userId: 'user_analyst',
      accountId: seeded.accountId,
      providerConnectionId: account!.providerConnectionId as Id<'providerConnections'>,
      provider: 'mock',
      providerTransactionId: input.id,
      dedupeKey: input.id,
      status: 'BOOK',
      direction: 'DBIT',
      amount: { amountMinor: input.amount, currency: 'EUR' },
      bookingDate: input.date ?? '2026-07-10',
      description: input.id,
      classificationKind: input.kind,
      classificationSource: 'system',
      categoryId: input.kind === 'expense' ? seeded.categoryId : undefined,
      importedAtMs: Date.UTC(2026, 6, 10),
      updatedAtMs: Date.UTC(2026, 6, 10),
    });
  });
}

describe('analyst queries', () => {
  test('aggregates spending by month/category and excludes transfer/internal rows', async () => {
    const t = createTest();
    const seeded = await seedBase(t);
    await insertTransaction(t, seeded, { id: 'food-1', amount: 1200n, kind: 'expense' });
    await insertTransaction(t, seeded, { id: 'food-2', amount: 800n, kind: 'expense' });
    await insertTransaction(t, seeded, { id: 'transfer', amount: 9000n, kind: 'transfer' });
    await insertTransaction(t, seeded, { id: 'internal', amount: 7000n, kind: 'internal' });

    const result = (await t.query(analystFunctionRefs.spendingByCategoryForUser, {
      userId: 'user_analyst',
      period: '2026-07',
    })) as Array<{ month: string; categoryName: string; amountMinor: bigint; currency: string }>;

    expect(result).toEqual([
      {
        month: '2026-07',
        categoryId: seeded.categoryId,
        categoryName: 'Groceries',
        amountMinor: 2000n,
        currency: 'EUR',
      },
    ]);
  });

  test('returns active Plan progress with signed activity, target need, totals, and Ready to Assign', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-20T08:00:00.000Z'));
    try {
      const t = createTest();
      const seeded = await seedBase(t);
      await insertTransaction(t, seeded, { id: 'food', amount: 2500n, kind: 'expense' });
      const fixture = await t.run(async (ctx) => {
        const now = Date.UTC(2026, 6, 1);
        const account = await ctx.db.get('financialAccounts', seeded.accountId);
        const providerConnectionId = account!.providerConnectionId as Id<'providerConnections'>;
        await ctx.db.insert('accountBalances', {
          userId: 'user_analyst',
          accountId: seeded.accountId,
          providerConnectionId,
          provider: 'mock',
          balanceType: 'closingBooked',
          amount: { amountMinor: 50_000n, currency: 'EUR' },
          fetchedAtMs: now,
        });
        const planId = await ctx.db.insert('plans', {
          userId: 'user_analyst',
          name: 'Household',
          currency: 'EUR',
          startPeriod: '2026-07',
          accountIds: [seeded.accountId],
          isDefault: true,
          sortOrder: 1000,
          createdAtMs: now,
          updatedAtMs: now,
        });
        const groupId = await ctx.db.insert('planGroups', {
          planId,
          userId: 'user_analyst',
          name: 'Everyday',
          sortOrder: 1000,
          collapsed: false,
          hidden: false,
          createdAtMs: now,
          updatedAtMs: now,
        });
        const bucketId = await ctx.db.insert('planBuckets', {
          planId,
          userId: 'user_analyst',
          groupId,
          name: 'Groceries',
          sortOrder: 1000,
          hidden: false,
          isUnplanned: false,
          createdAtMs: now,
          updatedAtMs: now,
        });
        const unplannedId = await ctx.db.insert('planBuckets', {
          planId,
          userId: 'user_analyst',
          groupId,
          name: 'Unplanned',
          sortOrder: 2000,
          hidden: false,
          isUnplanned: true,
          createdAtMs: now,
          updatedAtMs: now,
        });
        await ctx.db.insert('planBucketCategories', {
          planId,
          userId: 'user_analyst',
          bucketId,
          categoryId: seeded.categoryId,
          createdAtMs: now,
          updatedAtMs: now,
        });
        await ctx.db.insert('planAssignments', {
          planId,
          userId: 'user_analyst',
          bucketId,
          period: '2026-07',
          assignedMinor: 10_000n,
          currency: 'EUR',
          createdAtMs: now,
          updatedAtMs: now,
        });
        await ctx.db.insert('planTargets', {
          planId,
          userId: 'user_analyst',
          bucketId,
          cadence: 'monthly',
          behaviour: 'setAside',
          amountMinor: 12_000n,
          currency: 'EUR',
          dayOfMonth: 31,
          repeats: true,
          snoozedPeriods: [],
        });
        return { planId, groupId, bucketId, unplannedId };
      });

      const result = await t.query(analystFunctionRefs.planWithProgressForUser, {
        userId: 'user_analyst',
        period: '2026-07',
      });
      expect(result).toEqual({
        plan: { id: fixture.planId, name: 'Household', currency: 'EUR' },
        period: '2026-07',
        readyToAssignMinor: 42_500n,
        totals: {
          assignedMinor: 10_000n,
          activityMinor: -2_500n,
          availableMinor: 7_500n,
          neededMinor: 12_000n,
          underfundedMinor: 2_000n,
        },
        buckets: [
          {
            bucketId: fixture.bucketId,
            name: 'Groceries',
            hidden: false,
            groupId: fixture.groupId,
            groupName: 'Everyday',
            assignedMinor: 10_000n,
            activityMinor: -2_500n,
            availableMinor: 7_500n,
            neededMinor: 12_000n,
            underfundedMinor: 2_000n,
            snoozed: false,
            status: 'underfunded',
          },
          {
            bucketId: fixture.unplannedId,
            name: 'Unplanned',
            hidden: false,
            groupId: fixture.groupId,
            groupName: 'Everyday',
            assignedMinor: 0n,
            activityMinor: 0n,
            availableMinor: 0n,
            neededMinor: 0n,
            underfundedMinor: 0n,
            snoozed: false,
            status: 'funded',
          },
        ],
        truncated: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('uses the latest balance per visible account and excludes hidden accounts', async () => {
    const t = createTest();
    const seeded = await seedBase(t);
    await t.run(async (ctx) => {
      const account = await ctx.db.get('financialAccounts', seeded.accountId);
      const providerConnectionId = account!.providerConnectionId as Id<'providerConnections'>;
      for (const [accountId, amountMinor, fetchedAtMs] of [
        [seeded.accountId, 1000n, 1],
        [seeded.accountId, 2500n, 2],
        [seeded.hiddenAccountId, 9000n, 3],
      ] as const) {
        await ctx.db.insert('accountBalances', {
          userId: 'user_analyst',
          accountId,
          providerConnectionId,
          provider: 'mock',
          balanceType: 'closingBooked',
          amount: { amountMinor, currency: 'EUR' },
          fetchedAtMs,
        });
      }
    });

    const result = (await t.query(analystFunctionRefs.accountsOverviewForUser, {
      userId: 'user_analyst',
    })) as {
      accounts: Array<{ account: { _id: string }; latestBalance: { amount: { amountMinor: bigint } } }>;
      totals: Array<{ amountMinor: bigint }>;
    };
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]?.account._id).toBe(seeded.accountId);
    expect(result.accounts[0]?.latestBalance.amount.amountMinor).toBe(2500n);
    expect(result.totals).toEqual([{ amountMinor: 2500n, currency: 'EUR' }]);
  });

  test('builds a three-month long-term baseline from liquid balances and scheduled cashflow medians', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    try {
      const t = createTest();
      const seeded = await seedBase(t);
      await t.run(async (ctx) => {
        const mainAccount = await ctx.db.get('financialAccounts', seeded.accountId);
        const providerConnectionId = mainAccount!.providerConnectionId as Id<'providerConnections'>;
        const now = Date.UTC(2026, 6, 1);
        const savingsAccountId = await ctx.db.insert('financialAccounts', {
          userId: 'user_analyst',
          providerConnectionId,
          provider: 'mock',
          name: 'Savings',
          accountType: 'SVGS',
          currency: 'EUR',
          status: 'active',
          syncEnabled: true,
          createdAtMs: now,
          updatedAtMs: now,
        });
        const cardAccountId = await ctx.db.insert('financialAccounts', {
          userId: 'user_analyst',
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
        const investmentAccountId = await ctx.db.insert('financialAccounts', {
          userId: 'user_analyst',
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

        for (const [accountId, amountMinor, fetchedAtMs] of [
          [seeded.accountId, 100_000n, 1],
          [seeded.accountId, 250_000n, 2],
          [savingsAccountId, 350_000n, 3],
          [cardAccountId, 900_000n, 4],
          [investmentAccountId, 700_000n, 5],
          [seeded.hiddenAccountId, 800_000n, 6],
        ] as const) {
          await ctx.db.insert('accountBalances', {
            userId: 'user_analyst',
            accountId,
            providerConnectionId,
            provider: 'mock',
            balanceType: 'closingBooked',
            amount: { amountMinor, currency: 'EUR' },
            fetchedAtMs,
          });
        }

        for (const [name, dueDate, amountMinor, direction] of [
          ['July salary', '2026-07-10', 100_000n, 'inflow'],
          ['July bills', '2026-07-12', 40_000n, 'outflow'],
          ['August salary', '2026-08-10', 300_000n, 'inflow'],
          ['August bills', '2026-08-12', 90_000n, 'outflow'],
          ['September salary', '2026-09-10', 200_000n, 'inflow'],
          ['September bills', '2026-09-12', 50_000n, 'outflow'],
        ] as const) {
          await insertPlannedExpense(ctx, {
            userId: 'user_analyst',
            accountId: seeded.accountId,
            name,
            amount: { amountMinor, currency: 'EUR' },
            direction,
            dueDate,
            status: 'planned',
            source: 'manual',
            createdAtMs: now,
            updatedAtMs: now,
          });
        }
      });

      const result = await t.query(getLongTermBaselineForUser, {
        userId: 'user_analyst',
        currency: 'eur',
      });

      expect(result).toEqual({
        currency: 'EUR',
        liquidMinor: 600_000n,
        investedMinor: 700_000n,
        monthlyIncomeMinor: 200_000n,
        monthlyExpensesMinor: 50_000n,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not return transfers for expense-only planned item statuses', async () => {
    const t = createTest();
    const seeded = await seedBase(t);
    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      await insertPlannedExpense(ctx, {
        userId: 'user_analyst',
        accountId: seeded.accountId,
        name: 'Funded purchase',
        amount: { amountMinor: 5000n, currency: 'EUR' },
        dueDate: '2026-07-20',
        status: 'funding',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedTransfer(ctx, {
        userId: 'user_analyst',
        fromAccountId: seeded.accountId,
        toAccountId: seeded.hiddenAccountId,
        name: 'Unrelated transfer',
        amount: { amountMinor: 1000n, currency: 'EUR' },
        scheduledDate: '2026-07-21',
        status: 'planned',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const result = (await t.query(analystFunctionRefs.plannedItemsForUser, {
      userId: 'user_analyst',
      status: 'funding',
    })) as { expenses: Array<{ status: string }>; transfers: Array<unknown> };
    expect(result.expenses.map((expense) => expense.status)).toEqual(['funding']);
    expect(result.transfers).toEqual([]);
  });

  test('applies planned expense status and date ranges before the result bound', async () => {
    const t = createTest();
    const seeded = await seedBase(t);
    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      for (let index = 0; index < 250; index += 1) {
        await insertPlannedExpense(ctx, {
          userId: 'user_analyst',
          accountId: seeded.accountId,
          name: `Old expense ${index}`,
          amount: { amountMinor: 100n, currency: 'EUR' },
          dueDate: '2025-01-01',
          status: 'funding',
          source: 'manual',
          createdAtMs: now + index,
          updatedAtMs: now + index,
        });
      }
      await insertPlannedExpense(ctx, {
        userId: 'user_analyst',
        accountId: seeded.accountId,
        name: 'Target in range',
        amount: { amountMinor: 2500n, currency: 'EUR' },
        dueDate: '2026-08-15',
        status: 'funding',
        source: 'manual',
        createdAtMs: now + 1000,
        updatedAtMs: now + 1000,
      });
    });

    const result = (await t.query(analystFunctionRefs.plannedItemsForUser, {
      userId: 'user_analyst',
      status: 'funding',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    })) as { expenses: Array<{ name: string }>; transfers: Array<unknown> };

    expect(result.expenses.map((expense) => expense.name)).toEqual(['Target in range']);
    expect(result.transfers).toEqual([]);
  });
});
