/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { components } from './_generated/api';
import { aggregateTransactionsForReport } from './banking/reportsCore';
import schema from './schema';
import type { Id } from './_generated/dataModel';
import type { AggregatedReport, ReportOptions, ReportTransactionRow } from './banking/reportsCore';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './authProfiles.ts',
  './banking/reports.ts',
  './banking/reportsCore.ts',
  './lib/*.ts',
]);

type ReportQueryArgs = ReportOptions & {
  dateFrom: string;
  dateTo: string;
  accountIds?: Array<Id<'financialAccounts'>>;
  categoryIds?: Array<Id<'categories'>>;
  tagIds?: Array<Id<'transactionTags'>>;
  amountMinMinor?: bigint;
  amountMaxMinor?: bigint;
};

const getReport = makeFunctionReference<'query', ReportQueryArgs, AggregatedReport & { truncated: boolean }>(
  'banking/reports:getReport',
);

type ReportTransactionsArgs = Omit<ReportQueryArgs, 'granularity'> & {
  groupKey: string;
  cursor?: string;
  limit?: number;
};

type ReportTransactionsPage = {
  page: Array<{
    _id: Id<'transactions'>;
    bookingDate: string;
    description: string;
    counterpartyName: string | null;
    amount: { amountMinor: bigint; currency: string };
    direction: 'CRDT' | 'DBIT';
    categoryId: Id<'categories'> | null;
  }>;
  continueCursor: string | null;
};

const listReportTransactions = makeFunctionReference<'query', ReportTransactionsArgs, ReportTransactionsPage>(
  'banking/reports:listReportTransactions',
);

function reportRow(overrides: Partial<ReportTransactionRow> = {}): ReportTransactionRow {
  return {
    direction: 'DBIT',
    status: 'BOOK',
    classificationKind: 'expense',
    amount: { amountMinor: 1_000n, currency: 'EUR' },
    bookingDate: '2026-01-10',
    categoryId: null,
    counterpartyName: null,
    description: 'Purchase',
    accountId: 'main',
    ...overrides,
  };
}

const emptyLookups = {
  categories: new Map<string, { name: string; kind?: string }>(),
  categoryGroups: null,
  accounts: new Map<string, { label: string }>([['main', { label: 'Main account' }]]),
};

describe('aggregateTransactionsForReport', () => {
  test('buckets monthly and calculates savings rates, including zero income', () => {
    const result = aggregateTransactionsForReport(
      [
        reportRow({ direction: 'CRDT', classificationKind: 'income', amount: { amountMinor: 4_000n, currency: 'EUR' } }),
        reportRow({ amount: { amountMinor: 1_000n, currency: 'EUR' } }),
        reportRow({ bookingDate: '2026-02-02', amount: { amountMinor: 500n, currency: 'USD' } }),
      ],
      emptyLookups,
      { tab: 'cashflow', groupBy: 'account', granularity: 'month' },
    );

    expect(result.summary).toEqual([
      { currency: 'EUR', incomeMinor: 4_000n, expensesMinor: 1_000n, netMinor: 3_000n, savingsRatePct: 75 },
      { currency: 'USD', incomeMinor: 0n, expensesMinor: 500n, netMinor: -500n, savingsRatePct: 0 },
    ]);
    expect(result.series.map(({ period, currency }) => [period, currency])).toEqual([
      ['2026-01', 'EUR'],
      ['2026-02', 'USD'],
    ]);
  });

  test('leaves scheduled rows out of every total', () => {
    const result = aggregateTransactionsForReport(
      [
        reportRow({ amount: { amountMinor: 1_000n, currency: 'EUR' } }),
        reportRow({ status: 'SCHD', amount: { amountMinor: 9_000n, currency: 'EUR' } }),
      ],
      emptyLookups,
      { tab: 'spending', groupBy: 'account', granularity: 'month' },
    );

    expect(result.summary).toEqual([
      { currency: 'EUR', incomeMinor: 0n, expensesMinor: 1_000n, netMinor: -1_000n, savingsRatePct: 0 },
    ]);
    expect(result.breakdown.map((group) => group.totalMinor)).toEqual([1_000n]);
  });

  test('buckets quarters and years', () => {
    const rows = [reportRow({ bookingDate: '2026-04-01' }), reportRow({ bookingDate: '2026-12-31' })];
    expect(
      aggregateTransactionsForReport(rows, emptyLookups, {
        tab: 'spending',
        groupBy: 'account',
        granularity: 'quarter',
      }).series.map((item) => item.period),
    ).toEqual(['2026-Q2', '2026-Q4']);
    expect(
      aggregateTransactionsForReport(rows, emptyLookups, {
        tab: 'spending',
        groupBy: 'account',
        granularity: 'year',
      }).series.map((item) => item.period),
    ).toEqual(['2026']);
  });

  test('isolates currencies and excludes transfers and internal rows', () => {
    const result = aggregateTransactionsForReport(
      [
        reportRow({ amount: { amountMinor: 100n, currency: 'EUR' } }),
        reportRow({ amount: { amountMinor: 200n, currency: 'USD' } }),
        reportRow({ classificationKind: 'transfer', amount: { amountMinor: 9_000n, currency: 'EUR' } }),
        reportRow({ classificationKind: 'internal', amount: { amountMinor: 8_000n, currency: 'USD' } }),
      ],
      emptyLookups,
      { tab: 'cashflow', groupBy: 'account', granularity: 'month' },
    );

    expect(result.summary.map(({ currency, expensesMinor }) => [currency, expensesMinor])).toEqual([
      ['EUR', 100n],
      ['USD', 200n],
    ]);
  });

  test('excludes hidden rows from summary, series, and breakdowns', () => {
    const result = aggregateTransactionsForReport(
      [
        reportRow({ amount: { amountMinor: 500n, currency: 'EUR' } }),
        reportRow({ hiddenFromReports: true, amount: { amountMinor: 9_000n, currency: 'EUR' } }),
      ],
      emptyLookups,
      { tab: 'spending', groupBy: 'account', granularity: 'month' },
    );

    expect(result.summary).toMatchObject([{ expensesMinor: 500n }]);
    expect(result.series[0]?.groups).toEqual([
      { key: 'Main account', label: 'Main account', incomeMinor: 0n, expensesMinor: 500n },
    ]);
    expect(result.breakdown).toMatchObject([{ totalMinor: 500n }]);
  });

  test('falls back to the category when no plan is available', () => {
    const lookups = {
      ...emptyLookups,
      categories: new Map([['groceries', { name: 'Groceries' }]]),
    };
    const result = aggregateTransactionsForReport([reportRow({ categoryId: 'groceries' })], lookups, {
      tab: 'spending',
      groupBy: 'categoryGroup',
      granularity: 'month',
    });

    expect(result.breakdown[0]).toMatchObject({ key: 'Groceries', label: 'Groceries', expensesMinor: 1_000n });
  });

  test('uses normalized counterparties and falls back to descriptions', () => {
    const result = aggregateTransactionsForReport(
      [
        reportRow({ counterpartyName: '  ACME   Market ', description: 'ignored' }),
        reportRow({ counterpartyName: 'acme market', description: 'ignored', amount: { amountMinor: 500n, currency: 'EUR' } }),
        reportRow({ counterpartyName: null, description: '  Local   Cafe  ' }),
      ],
      emptyLookups,
      { tab: 'spending', groupBy: 'counterparty', granularity: 'month' },
    );

    expect(result.breakdown).toEqual([
      {
        key: 'acme market',
        label: 'ACME Market',
        currency: 'EUR',
        incomeMinor: 0n,
        expensesMinor: 1_500n,
        totalMinor: 1_500n,
      },
      {
        key: 'local cafe',
        label: 'Local Cafe',
        currency: 'EUR',
        incomeMinor: 0n,
        expensesMinor: 1_000n,
        totalMinor: 1_000n,
      },
    ]);
  });
});

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

async function seedReportFixture(t: TestHarness) {
  const userId = 'user_reports';
  const otherUserId = 'user_reports_other';
  await seedAuthKitUser(t, userId);
  await seedAuthKitUser(t, otherUserId);
  const ids = await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const otherProviderConnectionId = await ctx.db.insert('providerConnections', {
      userId: otherUserId,
      provider: 'mock',
      status: 'active',
      displayName: 'Other mock',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const mainAccountId = await ctx.db.insert('financialAccounts', {
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
    const secondAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      name: 'Second account',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const foreignAccountId = await ctx.db.insert('financialAccounts', {
      userId: otherUserId,
      providerConnectionId: otherProviderConnectionId,
      provider: 'mock',
      name: 'Foreign account',
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
    const diningId = await ctx.db.insert('categories', {
      userId,
      name: 'Dining',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const transactions = [
      { accountId: mainAccountId, categoryId: groceriesId, direction: 'DBIT' as const, amountMinor: 500n, date: '2026-07-05' },
      { accountId: mainAccountId, categoryId: diningId, direction: 'DBIT' as const, amountMinor: 1_500n, date: '2026-07-06' },
      { accountId: secondAccountId, categoryId: groceriesId, direction: 'DBIT' as const, amountMinor: 250n, date: '2026-07-07' },
      { accountId: secondAccountId, categoryId: undefined, direction: 'CRDT' as const, amountMinor: 3_000n, date: '2026-07-31' },
    ];
    const transactionIds: Array<Id<'transactions'>> = [];
    for (const [index, transaction] of transactions.entries()) {
      transactionIds.push(await ctx.db.insert('transactions', {
        userId,
        accountId: transaction.accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: `report-${index}`,
        status: 'BOOK',
        direction: transaction.direction,
        amount: { amountMinor: transaction.amountMinor, currency: 'EUR' },
        bookingDate: transaction.date,
        description: `Transaction ${index}`,
        classificationKind: transaction.direction === 'CRDT' ? 'income' : 'expense',
        classificationSource: 'system',
        categoryId: transaction.categoryId,
        importedAtMs: now,
        updatedAtMs: now,
      }));
    }
    return { diningId, foreignAccountId, groceriesId, mainAccountId, secondAccountId, transactionIds };
  });
  return { asUser: t.withIdentity({ subject: userId }), ...ids };
}

async function seedPlanCategoryGroup(t: TestHarness, fixture: Awaited<ReturnType<typeof seedReportFixture>>) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const planId = await ctx.db.insert('plans', {
      userId: 'user_reports',
      name: 'Active plan',
      currency: 'EUR',
      startPeriod: '2026-07',
      accountIds: [fixture.mainAccountId, fixture.secondAccountId],
      isDefault: true,
      sortOrder: 1_000,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const groupId = await ctx.db.insert('planGroups', {
      planId,
      userId: 'user_reports',
      name: 'Essentials',
      sortOrder: 1_000,
      collapsed: false,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const bucketId = await ctx.db.insert('planBuckets', {
      planId,
      userId: 'user_reports',
      groupId,
      name: 'Food',
      sortOrder: 1_000,
      hidden: false,
      isUnplanned: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('planBuckets', {
      planId,
      userId: 'user_reports',
      groupId,
      name: 'Unplanned',
      sortOrder: 2_000,
      hidden: false,
      isUnplanned: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('planBucketCategories', {
      planId,
      userId: 'user_reports',
      bucketId,
      categoryId: fixture.groceriesId,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return groupId;
  });
}

const baseQueryArgs = {
  tab: 'cashflow' as const,
  groupBy: 'category' as const,
  granularity: 'month' as const,
  dateFrom: '2026-07-01',
  dateTo: '2026-07-31',
};

describe('getReport', () => {
  test('aggregates an inclusive date range and applies account, category, and amount filters', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);
    const full = await fixture.asUser.query(getReport, baseQueryArgs);
    expect(full.summary).toEqual([
      { currency: 'EUR', incomeMinor: 3_000n, expensesMinor: 2_250n, netMinor: 750n, savingsRatePct: 25 },
    ]);
    expect(full.truncated).toBe(false);

    const filtered = await fixture.asUser.query(getReport, {
      ...baseQueryArgs,
      tab: 'spending',
      accountIds: [fixture.mainAccountId],
      categoryIds: [fixture.groceriesId],
      amountMinMinor: 400n,
      amountMaxMinor: 1_000n,
    });
    expect(filtered.summary[0]).toMatchObject({ incomeMinor: 0n, expensesMinor: 500n });
    expect(filtered.breakdown).toHaveLength(1);
    expect(filtered.breakdown[0]).toMatchObject({ key: 'Groceries', totalMinor: 500n });
  });

  test('groups categories by stable active-plan group ids and leaves unmapped categories uncategorized', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);
    const groupId = await seedPlanCategoryGroup(t, fixture);
    const args = { ...baseQueryArgs, tab: 'spending' as const, groupBy: 'categoryGroup' as const };

    const beforeRename = await fixture.asUser.query(getReport, args);
    expect(beforeRename.breakdown).toEqual([
      {
        key: 'uncategorized',
        label: 'uncategorized',
        currency: 'EUR',
        incomeMinor: 0n,
        expensesMinor: 1_500n,
        totalMinor: 1_500n,
      },
      {
        key: groupId,
        label: 'Essentials',
        currency: 'EUR',
        incomeMinor: 0n,
        expensesMinor: 750n,
        totalMinor: 750n,
      },
    ]);

    await t.run(async (ctx) => {
      await ctx.db.patch('planGroups', groupId, { name: 'Household', updatedAtMs: Date.UTC(2026, 6, 2) });
    });
    const afterRename = await fixture.asUser.query(getReport, args);
    expect(afterRename.breakdown).toEqual([
      {
        key: 'uncategorized',
        label: 'uncategorized',
        currency: 'EUR',
        incomeMinor: 0n,
        expensesMinor: 1_500n,
        totalMinor: 1_500n,
      },
      {
        key: groupId,
        label: 'Household',
        currency: 'EUR',
        incomeMinor: 0n,
        expensesMinor: 750n,
        totalMinor: 750n,
      },
    ]);
    const savedSegment = await fixture.asUser.query(listReportTransactions, {
      tab: 'spending',
      groupBy: 'categoryGroup',
      dateFrom: baseQueryArgs.dateFrom,
      dateTo: baseQueryArgs.dateTo,
      groupKey: groupId,
    });
    expect(savedSegment.page.map((row) => [row.bookingDate, row.amount.amountMinor])).toEqual([
      ['2026-07-07', 250n],
      ['2026-07-05', 500n],
    ]);
  });

  test('uses category names when the user has no plan', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);

    const result = await fixture.asUser.query(getReport, {
      ...baseQueryArgs,
      tab: 'spending',
      groupBy: 'categoryGroup',
    });
    expect(result.breakdown).toEqual([
      {
        key: 'Dining',
        label: 'Dining',
        currency: 'EUR',
        incomeMinor: 0n,
        expensesMinor: 1_500n,
        totalMinor: 1_500n,
      },
      {
        key: 'Groceries',
        label: 'Groceries',
        currency: 'EUR',
        incomeMinor: 0n,
        expensesMinor: 750n,
        totalMinor: 750n,
      },
    ]);
  });

  test('filters by owned transaction tags and rejects foreign tags', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);
    const { groceriesTagId, foreignTagId } = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const createdGroceriesTagId = await ctx.db.insert('transactionTags', {
        userId: 'user_reports',
        name: 'Groceries only',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const diningTagId = await ctx.db.insert('transactionTags', {
        userId: 'user_reports',
        name: 'Dining only',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const createdForeignTagId = await ctx.db.insert('transactionTags', {
        userId: 'user_reports_other',
        name: 'Foreign',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.patch('transactions', fixture.transactionIds[0], { tagIds: [createdGroceriesTagId] });
      await ctx.db.patch('transactions', fixture.transactionIds[1], { tagIds: [diningTagId] });
      await ctx.db.patch('transactions', fixture.transactionIds[2], { tagIds: [createdGroceriesTagId, diningTagId] });
      return { groceriesTagId: createdGroceriesTagId, foreignTagId: createdForeignTagId };
    });

    const filtered = await fixture.asUser.query(getReport, {
      ...baseQueryArgs,
      tab: 'spending',
      tagIds: [groceriesTagId],
    });
    expect(filtered.summary).toMatchObject([{ incomeMinor: 0n, expensesMinor: 750n }]);
    expect(filtered.breakdown).toEqual([
      {
        key: 'Groceries',
        label: 'Groceries',
        currency: 'EUR',
        incomeMinor: 0n,
        expensesMinor: 750n,
        totalMinor: 750n,
      },
    ]);

    await expect(fixture.asUser.query(getReport, { ...baseQueryArgs, tagIds: [foreignTagId] })).rejects.toThrow(
      'Transaction tag not found',
    );
  });

  test('continues through multiple transaction pages', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);
    await t.run(async (ctx) => {
      const account = await ctx.db.get('financialAccounts', fixture.mainAccountId);
      if (!account?.providerConnectionId) {
        throw new Error('Expected provider connection');
      }
      for (let index = 0; index < 1_001; index += 1) {
        await ctx.db.insert('transactions', {
          userId: 'user_reports',
          accountId: fixture.mainAccountId,
          providerConnectionId: account.providerConnectionId,
          provider: 'mock',
          dedupeKey: `paged-report-${index}`,
          status: 'BOOK',
          direction: 'DBIT',
          amount: { amountMinor: 1n, currency: 'EUR' },
          bookingDate: '2026-07-15',
          description: `Paged transaction ${index}`,
          classificationKind: 'expense',
          classificationSource: 'system',
          importedAtMs: Date.UTC(2026, 6, 15),
          updatedAtMs: Date.UTC(2026, 6, 15),
        });
      }
    });

    const result = await fixture.asUser.query(getReport, baseQueryArgs);
    expect(result.summary[0]).toMatchObject({ incomeMinor: 3_000n, expensesMinor: 3_251n });
    expect(result.truncated).toBe(false);
  });

  test('rejects foreign accounts and unauthenticated access', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);
    await expect(
      fixture.asUser.query(getReport, { ...baseQueryArgs, accountIds: [fixture.foreignAccountId] }),
    ).rejects.toThrow('Account not found');
    await expect(t.query(getReport, baseQueryArgs)).rejects.toThrow('Unauthorized');
  });

  test('rejects malformed and reversed date ranges', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);
    await expect(fixture.asUser.query(getReport, { ...baseQueryArgs, dateFrom: '2026/07/01' })).rejects.toThrow(
      'YYYY-MM-DD',
    );
    await expect(
      fixture.asUser.query(getReport, { ...baseQueryArgs, dateFrom: '2026-08-01', dateTo: '2026-07-31' }),
    ).rejects.toThrow('dateFrom must be on or before dateTo');
  });
});

describe('listReportTransactions', () => {
  test('returns only the selected segment in descending date order', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);
    const result = await fixture.asUser.query(listReportTransactions, {
      tab: 'spending',
      groupBy: baseQueryArgs.groupBy,
      dateFrom: baseQueryArgs.dateFrom,
      dateTo: baseQueryArgs.dateTo,
      groupKey: 'Groceries',
    });

    expect(result.page.map((row) => [row.bookingDate, row.description, row.amount.amountMinor])).toEqual([
      ['2026-07-07', 'Transaction 2', 250n],
      ['2026-07-05', 'Transaction 0', 500n],
    ]);
    expect(result.page.every((row) => row.categoryId === fixture.groceriesId)).toBe(true);
    expect(result.continueCursor).toBeNull();
  });

  test('excludes hidden transactions from report aggregates and drill-down rows', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionIds[0], { hiddenFromReports: true });
    });

    const report = await fixture.asUser.query(getReport, baseQueryArgs);
    expect(report.summary).toEqual([
      { currency: 'EUR', incomeMinor: 3_000n, expensesMinor: 1_750n, netMinor: 1_250n, savingsRatePct: 41.7 },
    ]);
    expect(report.series[0]?.groups.find((group) => group.key === 'Groceries')).toMatchObject({
      expensesMinor: 250n,
    });
    expect(report.breakdown.find((group) => group.key === 'Groceries')).toMatchObject({ totalMinor: 250n });

    const transactions = await fixture.asUser.query(listReportTransactions, {
      tab: 'spending',
      groupBy: 'category',
      dateFrom: baseQueryArgs.dateFrom,
      dateTo: baseQueryArgs.dateTo,
      groupKey: 'Groceries',
    });
    expect(transactions.page.map((transaction) => transaction.description)).toEqual(['Transaction 2']);
  });

  test('excludes scheduled transactions from report aggregates and drill-down rows', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionIds[0], { status: 'SCHD' });
    });

    const report = await fixture.asUser.query(getReport, baseQueryArgs);
    expect(report.summary).toEqual([
      { currency: 'EUR', incomeMinor: 3_000n, expensesMinor: 1_750n, netMinor: 1_250n, savingsRatePct: 41.7 },
    ]);
    expect(report.breakdown.find((group) => group.key === 'Groceries')).toMatchObject({ totalMinor: 250n });

    const transactions = await fixture.asUser.query(listReportTransactions, {
      tab: 'spending',
      groupBy: 'category',
      dateFrom: baseQueryArgs.dateFrom,
      dateTo: baseQueryArgs.dateTo,
      groupKey: 'Groceries',
    });
    expect(transactions.page.map((transaction) => transaction.description)).toEqual(['Transaction 2']);
  });

  test('paginates segment transactions without duplicates', async () => {
    const t = createTest();
    const fixture = await seedReportFixture(t);
    const args = {
      tab: 'spending' as const,
      groupBy: 'category' as const,
      dateFrom: baseQueryArgs.dateFrom,
      dateTo: baseQueryArgs.dateTo,
      groupKey: 'Groceries',
      limit: 1,
    };
    const first = await fixture.asUser.query(listReportTransactions, args);
    expect(first.page).toHaveLength(1);
    expect(first.continueCursor).toBe('1');

    const second = await fixture.asUser.query(listReportTransactions, {
      ...args,
      cursor: first.continueCursor!,
    });
    expect(second.page).toHaveLength(1);
    expect(second.page[0]._id).not.toBe(first.page[0]._id);
    expect(second.continueCursor).toBeNull();
  });

  test('requires authentication', async () => {
    const t = createTest();
    await expect(
      t.query(listReportTransactions, {
        tab: 'spending',
        groupBy: 'category',
        dateFrom: baseQueryArgs.dateFrom,
        dateTo: baseQueryArgs.dateTo,
        groupKey: 'Groceries',
      }),
    ).rejects.toThrow('Unauthorized');
  });
});
