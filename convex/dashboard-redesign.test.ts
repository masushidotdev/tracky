/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';

import { dashboardPlanBuckets } from '../src/components/banking/dashboard/dashboard-plan-buckets';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import { insertPlannedExpense } from './plannedTransactionsTestHelpers';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/accounts.ts',
  './banking/balances.ts',
  './banking/connectionHealth.ts',
  './banking/credit.ts',
  './banking/creditMath.ts',
  './banking/dashboard.ts',
  './banking/overdraft.ts',
  './banking/planning.ts',
  './banking/planningMath.ts',
  './banking/planningReconciliation.ts',
  './banking/subscriptionDetection.ts',
  './banking/transactions.ts',
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

async function seedAccount(
  t: TestHarness,
  input: { userId: string; name: string; currency?: string; balance?: bigint; accountType?: string },
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId: input.userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId: input.userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: `${input.name}_${input.userId}`,
      name: input.name,
      accountType: input.accountType,
      currency: input.currency ?? 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('accountSyncStates', {
      userId: input.userId,
      providerConnectionId,
      accountId,
      provider: 'mock',
      status: 'active',
      backfillFromDate: '2026-01-01',
      nextSyncAfterMs: now,
      syncCadenceHours: 24,
      consecutiveFailures: 0,
      updatedAtMs: now,
    });
    if (input.balance !== undefined) {
      await ctx.db.insert('accountBalances', {
        userId: input.userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'closingBooked',
        amount: { amountMinor: input.balance, currency: input.currency ?? 'EUR' },
        fetchedAtMs: now,
      });
    }
    return { accountId, providerConnectionId };
  });
}

async function seedOverdraft(
  t: TestHarness,
  input: { userId: string; accountId?: Id<'financialAccounts'>; limit: bigint; used: bigint },
) {
  await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    await ctx.db.insert('creditFacilities', {
      userId: input.userId,
      name: 'Account overdraft',
      facilityType: 'accountOverdraft',
      status: 'active',
      source: 'manual',
      linkedAccountId: input.accountId,
      provider: 'manual',
      limitAmount: { amountMinor: input.limit, currency: 'EUR' },
      usedAmount: { amountMinor: input.used, currency: 'EUR' },
      repaymentType: 'onDemand',
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

describe('dashboard redesign backend', () => {
  test('ranks overspent plan buckets before underfunded and healthy buckets', () => {
    const rows = dashboardPlanBuckets(
      [
        {
          bucketId: 'healthy',
          name: 'Healthy',
          hidden: false,
          carryInMinor: 2_000n,
          assignedMinor: 8_000n,
          activityMinor: -2_000n,
          availableMinor: 8_000n,
          underfundedMinor: 0n,
        },
        {
          bucketId: 'hidden',
          name: 'Hidden overspent',
          hidden: true,
          carryInMinor: 0n,
          assignedMinor: 1_000n,
          activityMinor: -9_000n,
          availableMinor: -8_000n,
          underfundedMinor: 0n,
        },
        {
          bucketId: 'underfunded',
          name: 'Underfunded',
          hidden: false,
          carryInMinor: 1_000n,
          assignedMinor: 2_000n,
          activityMinor: -500n,
          availableMinor: 2_500n,
          underfundedMinor: 4_000n,
        },
        {
          bucketId: 'overspent',
          name: 'Overspent',
          hidden: false,
          carryInMinor: 500n,
          assignedMinor: 2_000n,
          activityMinor: -4_000n,
          availableMinor: -1_500n,
          underfundedMinor: 0n,
        },
        {
          bucketId: 'refund',
          name: 'Refund',
          hidden: false,
          carryInMinor: 1_000n,
          assignedMinor: 4_000n,
          activityMinor: 300n,
          availableMinor: 5_300n,
          underfundedMinor: 0n,
        },
      ],
      'EUR',
    );

    expect(rows).toEqual([
      {
        id: 'overspent',
        name: 'Overspent',
        spent: { amountMinor: 4_000n, currency: 'EUR' },
        funded: { amountMinor: 2_500n, currency: 'EUR' },
        remaining: { amountMinor: -1_500n, currency: 'EUR' },
      },
      {
        id: 'underfunded',
        name: 'Underfunded',
        spent: { amountMinor: 500n, currency: 'EUR' },
        funded: { amountMinor: 3_000n, currency: 'EUR' },
        remaining: { amountMinor: 2_500n, currency: 'EUR' },
      },
      {
        id: 'healthy',
        name: 'Healthy',
        spent: { amountMinor: 2_000n, currency: 'EUR' },
        funded: { amountMinor: 10_000n, currency: 'EUR' },
        remaining: { amountMinor: 8_000n, currency: 'EUR' },
      },
      {
        id: 'refund',
        name: 'Refund',
        spent: { amountMinor: 0n, currency: 'EUR' },
        funded: { amountMinor: 5_000n, currency: 'EUR' },
        remaining: { amountMinor: 5_300n, currency: 'EUR' },
      },
    ]);
  });

  test('derives linked overdraft use and dashboard availability from booked balances', async () => {
    const t = createTest();
    const userId = 'dashboard_overdraft_user';
    await seedAuthKitUser(t, userId);
    const linked = await seedAccount(t, { userId, name: 'Linked', balance: -1000n });
    await seedOverdraft(t, { userId, accountId: linked.accountId, limit: 3000n, used: 2999n });
    await seedOverdraft(t, { userId, limit: 2000n, used: 700n });

    const firstFacilities = await t
      .withIdentity({ subject: userId })
      .query(api.banking.credit.listCreditFacilities, {});
    const firstOverview = await t
      .withIdentity({ subject: userId })
      .query(api.banking.dashboard.getDashboardOverview, {});

    expect(
      firstFacilities.find((facility) => facility.linkedAccountId === linked.accountId)?.usedAmount.amountMinor,
    ).toBe(1000n);
    expect(firstOverview.accounts.find((row) => row.account._id === linked.accountId)).toMatchObject({
      available: { amountMinor: 2000n, currency: 'EUR' },
    });
    expect(firstFacilities.find((facility) => !facility.linkedAccountId)?.usedAmount.amountMinor).toBe(700n);

    await t.run(async (ctx) => {
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: linked.accountId,
        providerConnectionId: linked.providerConnectionId,
        provider: 'mock',
        balanceType: 'closingBooked',
        amount: { amountMinor: 1000n, currency: 'EUR' },
        fetchedAtMs: Date.UTC(2026, 6, 2),
      });
    });

    const secondFacilities = await t
      .withIdentity({ subject: userId })
      .query(api.banking.credit.listCreditFacilities, {});
    const secondOverview = await t
      .withIdentity({ subject: userId })
      .query(api.banking.dashboard.getDashboardOverview, {});
    expect(
      secondFacilities.find((facility) => facility.linkedAccountId === linked.accountId)?.usedAmount.amountMinor,
    ).toBe(0n);
    expect(secondOverview.accounts.find((row) => row.account._id === linked.accountId)).toMatchObject({
      available: { amountMinor: 4000n, currency: 'EUR' },
    });
  });

  test('buckets overview totals by currency and subtracts installment debt from net worth', async () => {
    const t = createTest();
    const userId = 'dashboard_overview_user';
    await seedAuthKitUser(t, userId);
    const overdraftAccount = await seedAccount(t, { userId, name: 'Over limit', balance: -4000n });
    await seedAccount(t, { userId, name: 'No overdraft', balance: 5000n });
    await seedAccount(t, { userId, name: 'Dollar', currency: 'USD', balance: 9000n });
    await seedAccount(t, { userId, name: 'No balance' });
    await seedOverdraft(t, { userId, accountId: overdraftAccount.accountId, limit: 3000n, used: 0n });

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const facilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Loan',
        facilityType: 'installmentCredit',
        status: 'active',
        source: 'manual',
        provider: 'manual',
        limitAmount: { amountMinor: 10000n, currency: 'EUR' },
        usedAmount: { amountMinor: 8000n, currency: 'EUR' },
        repaymentType: 'installmentPlan',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityInstallmentPlans', {
        userId,
        creditFacilityId: facilityId,
        name: 'Loan repayment',
        principalAmount: { amountMinor: 8000n, currency: 'EUR' },
        outstandingAmount: { amountMinor: 8000n, currency: 'EUR' },
        monthlyPaymentAmount: { amountMinor: 2000n, currency: 'EUR' },
        installmentCount: 4,
        remainingInstallments: 4,
        startDate: '2026-07-01',
        endDate: '2026-11-01',
        status: 'active',
        createdAtMs: now,
        updatedAtMs: now,
      });
      // Installment plans attached to a non-installmentPlan facility (e.g. a card
      // credit line) are still outstanding debt and must count toward net worth.
      const cardLineId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Card credit line',
        facilityType: 'additionalCardCreditLine',
        status: 'active',
        source: 'manual',
        provider: 'manual',
        limitAmount: { amountMinor: 500000n, currency: 'EUR' },
        usedAmount: { amountMinor: 3000n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityInstallmentPlans', {
        userId,
        creditFacilityId: cardLineId,
        name: 'Converted purchase',
        principalAmount: { amountMinor: 3000n, currency: 'EUR' },
        outstandingAmount: { amountMinor: 3000n, currency: 'EUR' },
        monthlyPaymentAmount: { amountMinor: 1000n, currency: 'EUR' },
        installmentCount: 3,
        remainingInstallments: 3,
        startDate: '2026-07-01',
        endDate: '2026-10-01',
        status: 'active',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId: cardLineId,
        cycleMonth: '2026-06',
        status: 'scheduled',
        trackedAmount: { amountMinor: 2000n, currency: 'EUR' },
        dueDate: '2026-07-10',
        closedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId: cardLineId,
        cycleMonth: '2026-05',
        status: 'paid',
        trackedAmount: { amountMinor: 3000n, currency: 'EUR' },
        dueDate: '2026-06-10',
        closedAtMs: now,
        paidAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const overview = await t.withIdentity({ subject: userId }).query(api.banking.dashboard.getDashboardOverview, {});
    expect(overview.cashTotals).toEqual([
      {
        booked: { amountMinor: 1000n, currency: 'EUR' },
        available: { amountMinor: 4000n, currency: 'EUR' },
        accountCount: 3,
      },
      {
        booked: { amountMinor: 9000n, currency: 'USD' },
        available: { amountMinor: 9000n, currency: 'USD' },
        accountCount: 1,
      },
    ]);
    expect(overview.accounts.find((row) => row.account._id === overdraftAccount.accountId)?.available.amountMinor).toBe(
      -1000n,
    );
    expect(overview.netWorth).toEqual([
      {
        cash: { amountMinor: 1000n, currency: 'EUR' },
        debts: { amountMinor: 13000n, currency: 'EUR' },
        netWorth: { amountMinor: -12000n, currency: 'EUR' },
      },
      {
        cash: { amountMinor: 9000n, currency: 'USD' },
        debts: { amountMinor: 0n, currency: 'USD' },
        netWorth: { amountMinor: 9000n, currency: 'USD' },
      },
    ]);
  });

  test('counts investments as assets and savings as cash in net worth', async () => {
    const t = createTest();
    const userId = 'dashboard_assets_user';
    await seedAuthKitUser(t, userId);
    await seedAccount(t, { userId, name: 'Savings', accountType: 'SVGS', balance: 20_000n });
    await seedAccount(t, { userId, name: 'Portfolio', accountType: 'INVS', balance: 75_000n });

    const overview = await t.withIdentity({ subject: userId }).query(api.banking.dashboard.getDashboardOverview, {});

    expect(overview.cashTotals).toEqual([
      {
        booked: { amountMinor: 20_000n, currency: 'EUR' },
        available: { amountMinor: 20_000n, currency: 'EUR' },
        accountCount: 1,
      },
    ]);
    expect(overview.assets).toEqual([
      {
        booked: { amountMinor: 75_000n, currency: 'EUR' },
        available: { amountMinor: 75_000n, currency: 'EUR' },
        accountCount: 1,
      },
    ]);
    expect(overview.netWorth).toEqual([
      {
        cash: { amountMinor: 20_000n, currency: 'EUR' },
        assets: { amountMinor: 75_000n, currency: 'EUR' },
        debts: { amountMinor: 0n, currency: 'EUR' },
        netWorth: { amountMinor: 95_000n, currency: 'EUR' },
      },
    ]);
  });

  test('filters category spending by the requested account', async () => {
    const t = createTest();
    const userId = 'dashboard_spending_user';
    await seedAuthKitUser(t, userId);
    const first = await seedAccount(t, { userId, name: 'First' });
    const second = await seedAccount(t, { userId, name: 'Second' });
    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const categoryId = await ctx.db.insert('categories', {
        userId,
        name: 'Groceries',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      for (const [accountId, providerConnectionId, amountMinor] of [
        [first.accountId, first.providerConnectionId, 1200n],
        [second.accountId, second.providerConnectionId, 3400n],
      ] as const) {
        await ctx.db.insert('transactions', {
          userId,
          accountId,
          providerConnectionId,
          provider: 'mock',
          dedupeKey: `${accountId}_spending`,
          status: 'BOOK',
          direction: 'DBIT',
          amount: { amountMinor, currency: 'EUR' },
          bookingDate: '2026-07-10',
          description: 'Groceries',
          classificationKind: 'expense',
          classificationSource: 'user',
          categoryId,
          importedAtMs: now,
          updatedAtMs: now,
        });
      }
    });

    const spending = await t
      .withIdentity({ subject: userId })
      .query(api.banking.transactions.getSpendingByCategory, { accountId: first.accountId, period: '2026-07' });
    expect(spending).toEqual([
      {
        categoryId: spending[0]?.categoryId,
        categoryName: 'Groceries',
        categorySystemKey: null,
        amount: { amountMinor: 1200n, currency: 'EUR' },
      },
    ]);
  });

  test('returns separate category spending entries for each currency', async () => {
    const t = createTest();
    const userId = 'dashboard_spending_currency_user';
    await seedAuthKitUser(t, userId);
    const account = await seedAccount(t, { userId, name: 'Multi-currency' });
    const categoryId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      const id = await ctx.db.insert('categories', {
        userId,
        name: 'Travel',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });

      for (const [currency, amountMinor] of [
        ['EUR', 1200n],
        ['USD', 3400n],
      ] as const) {
        await ctx.db.insert('transactions', {
          userId,
          accountId: account.accountId,
          providerConnectionId: account.providerConnectionId,
          provider: 'mock',
          dedupeKey: `travel_${currency}`,
          status: 'BOOK',
          direction: 'DBIT',
          amount: { amountMinor, currency },
          bookingDate: '2026-07-10',
          description: 'Travel',
          classificationKind: 'expense',
          classificationSource: 'user',
          categoryId: id,
          importedAtMs: now,
          updatedAtMs: now,
        });
      }

      return id;
    });

    const spending = await t
      .withIdentity({ subject: userId })
      .query(api.banking.transactions.getSpendingByCategory, { period: '2026-07' });

    expect(spending).toEqual([
      {
        categoryId,
        categoryName: 'Travel',
        categorySystemKey: null,
        amount: { amountMinor: 3400n, currency: 'USD' },
      },
      {
        categoryId,
        categoryName: 'Travel',
        categorySystemKey: null,
        amount: { amountMinor: 1200n, currency: 'EUR' },
      },
    ]);
  });

  test('builds an ordered aggregate cashflow series with its starting balance and negative date', async () => {
    const t = createTest();
    const userId = 'dashboard_cashflow_user';
    const first = await seedAccount(t, { userId, name: 'First', balance: 10000n });
    const second = await seedAccount(t, { userId, name: 'Second', balance: 20000n });
    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      for (const expense of [
        { accountId: second.accountId, name: 'Early', dueDate: '2026-07-05', amountMinor: 1000n },
        { accountId: first.accountId, name: 'Middle', dueDate: '2026-07-10', amountMinor: 2000n },
        { accountId: second.accountId, name: 'Late', dueDate: '2026-07-12', amountMinor: 28000n },
      ]) {
        await insertPlannedExpense(ctx, {
          userId,
          accountId: expense.accountId,
          name: expense.name,
          amount: { amountMinor: expense.amountMinor, currency: 'EUR' },
          dueDate: expense.dueDate,
          status: 'planned',
          source: 'manual',
          createdAtMs: now,
          updatedAtMs: now,
        });
      }
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-01',
      limit: 20,
    });
    expect(view.aggregateSeries).toEqual([
      { date: '2026-07-05', projectedBalanceAfter: { amountMinor: 29000n, currency: 'EUR' } },
      { date: '2026-07-10', projectedBalanceAfter: { amountMinor: 27000n, currency: 'EUR' } },
      { date: '2026-07-12', projectedBalanceAfter: { amountMinor: -1000n, currency: 'EUR' } },
    ]);
    expect(view.aggregateEndBalance).toEqual({ amountMinor: -1000n, currency: 'EUR' });
    expect(view.aggregateFirstNegativeDate).toBe('2026-07-12');
  });

  test('hides accounts from dashboard and planning aggregates without changing their sync state', async () => {
    const t = createTest();
    const userId = 'hidden_account_aggregate_user';
    await seedAuthKitUser(t, userId);
    const visible = await seedAccount(t, { userId, name: 'Visible', balance: 1000n });
    const hidden = await seedAccount(t, { userId, name: 'Unknown card', balance: 2000n });
    await seedOverdraft(t, { userId, accountId: hidden.accountId, limit: 3000n, used: 0n });

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      await insertPlannedExpense(ctx, {
        userId,
        accountId: visible.accountId,
        name: 'Visible payment',
        amount: { amountMinor: 500n, currency: 'EUR' },
        dueDate: '2026-07-05',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId: hidden.accountId,
        name: 'Unknown card payment',
        amount: { amountMinor: 500n, currency: 'EUR' },
        dueDate: '2026-07-05',
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await t.withIdentity({ subject: userId }).mutation(api.banking.accounts.setAccountHidden, {
      accountId: hidden.accountId,
      hidden: true,
    });

    const hiddenOverview = await t
      .withIdentity({ subject: userId })
      .query(api.banking.dashboard.getDashboardOverview, {});
    expect(hiddenOverview.cashTotals).toEqual([
      {
        booked: { amountMinor: 1000n, currency: 'EUR' },
        available: { amountMinor: 1000n, currency: 'EUR' },
        accountCount: 1,
      },
    ]);
    expect(hiddenOverview.accounts.map((row) => row.account._id)).toEqual([visible.accountId]);

    const hiddenPlanning = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-01',
      limit: 20,
    });
    expect(hiddenPlanning.aggregateEndBalance).toEqual({ amountMinor: 500n, currency: 'EUR' });

    await t.withIdentity({ subject: userId }).mutation(api.banking.accounts.setAccountHidden, {
      accountId: hidden.accountId,
      hidden: false,
    });

    const restoredOverview = await t
      .withIdentity({ subject: userId })
      .query(api.banking.dashboard.getDashboardOverview, {});
    expect(restoredOverview.cashTotals).toEqual([
      {
        booked: { amountMinor: 3000n, currency: 'EUR' },
        available: { amountMinor: 6000n, currency: 'EUR' },
        accountCount: 2,
      },
    ]);
    const restoredPlanning = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-01',
      limit: 20,
    });
    expect(restoredPlanning.aggregateEndBalance).toEqual({ amountMinor: 2000n, currency: 'EUR' });
  });

  test('manages account aliases and keeps hidden accounts in sync management only', async () => {
    const t = createTest();
    const userId = 'hidden_account_management_user';
    await seedAuthKitUser(t, userId);
    const visible = await seedAccount(t, { userId, name: 'Visible' });
    const hidden = await seedAccount(t, { userId, name: 'Unknown card' });

    await t.withIdentity({ subject: userId }).mutation(api.banking.accounts.setAccountAlias, {
      accountId: visible.accountId,
      alias: '  Daily spending  ',
    });
    let accounts = await t.withIdentity({ subject: userId }).query(api.banking.accounts.listAccounts, {});
    expect(accounts.find((account) => account._id === visible.accountId)?.alias).toBe('Daily spending');

    await t.withIdentity({ subject: userId }).mutation(api.banking.accounts.setAccountAlias, {
      accountId: visible.accountId,
      alias: '   ',
    });
    accounts = await t.withIdentity({ subject: userId }).query(api.banking.accounts.listAccounts, {});
    expect(accounts.find((account) => account._id === visible.accountId)?.alias).toBeNull();

    await t.withIdentity({ subject: userId }).mutation(api.banking.accounts.setAccountHidden, {
      accountId: hidden.accountId,
      hidden: true,
    });
    accounts = await t.withIdentity({ subject: userId }).query(api.banking.accounts.listAccounts, {});
    expect(accounts.map((account) => account._id)).toEqual([visible.accountId]);

    const syncOverview = await t.withIdentity({ subject: userId }).query(api.banking.accounts.listSyncOverview, {});
    expect(syncOverview.find((row) => row.account._id === hidden.accountId)?.account.hidden).toBe(true);
  });
});
