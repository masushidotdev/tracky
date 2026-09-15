/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api, components } from './_generated/api';
import { computeSafeToSpend } from './banking/safeToSpendCore';
import schema from './schema';
import { insertPlannedExpense } from './plannedTransactionsTestHelpers';
import type { SafeToSpendPlanningView } from './banking/safeToSpendCore';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/balances.ts',
  './banking/creditMath.ts',
  './banking/manualAccounts.ts',
  './banking/overdraft.ts',
  './banking/planning.ts',
  './banking/planningMath.ts',
  './banking/planningReconciliation.ts',
  './banking/safeToSpend.ts',
  './banking/safeToSpendCore.ts',
  './banking/statementCycles.ts',
  './banking/subscriptionDetection.ts',
  './lib/*.ts',
]);

function planningView(overrides: Partial<SafeToSpendPlanningView> = {}): SafeToSpendPlanningView {
  return {
    asOfDate: '2026-07-10',
    cycleStartDate: '2026-07-01',
    cycleEndDate: '2026-07-12',
    monthlyFundingTotals: [],
    fundingItems: [],
    accountGroups: [],
    ...overrides,
  };
}

function projectedItem(
  overrides: Partial<SafeToSpendPlanningView['accountGroups'][number]['items'][number]> = {},
): SafeToSpendPlanningView['accountGroups'][number]['items'][number] {
  return {
    title: 'Rent',
    dueDate: '2026-07-11',
    amount: { amountMinor: 2_500n, currency: 'EUR' },
    direction: 'outflow',
    source: 'plannedExpense',
    projectionStatus: 'projected',
    ...overrides,
  };
}

function accountGroup(
  overrides: Partial<SafeToSpendPlanningView['accountGroups'][number]> = {},
): SafeToSpendPlanningView['accountGroups'][number] {
  return {
    accountId: 'account-main',
    account: { accountType: 'CACC' },
    startingBalance: { amountMinor: 10_000n, currency: 'EUR' },
    items: [],
    ...overrides,
  };
}

describe('computeSafeToSpend', () => {
  test('cash only is entirely safe to spend', () => {
    const [result] = computeSafeToSpend(planningView({ accountGroups: [accountGroup()] }));

    expect(result.safeToSpend.amountMinor).toBe(10_000n);
    expect(result.safeToSpendWithIncome.amountMinor).toBe(10_000n);
    expect(result.perDay.amountMinor).toBe(3_333n);
  });

  test('subtracts a remaining committed bill', () => {
    const [result] = computeSafeToSpend(planningView({ accountGroups: [accountGroup({ items: [projectedItem()] })] }));

    expect(result.committedOutflows.amountMinor).toBe(2_500n);
    expect(result.safeToSpend.amountMinor).toBe(7_500n);
    expect(result.topUpcoming).toEqual([
      {
        name: 'Rent',
        dueDate: '2026-07-11',
        amount: { amountMinor: 2_500n, currency: 'EUR' },
        kind: 'plannedExpense',
      },
    ]);
  });

  test('subtracts money-box funding', () => {
    const [result] = computeSafeToSpend(
      planningView({
        accountGroups: [accountGroup()],
        fundingItems: [
          {
            moneyBoxId: 'money-box',
            monthlyRequiredAmount: { amountMinor: 1_500n, currency: 'EUR' },
            cycleContributedAmount: { amountMinor: 0n, currency: 'EUR' },
          },
        ],
      }),
    );

    expect(result.moneyBoxFunding.amountMinor).toBe(1_500n);
    expect(result.safeToSpend.amountMinor).toBe(8_500n);
  });

  test('subtracts only money-box funding still due in the cycle', () => {
    const [result] = computeSafeToSpend(
      planningView({
        accountGroups: [accountGroup()],
        fundingItems: [
          {
            moneyBoxId: 'partial',
            monthlyRequiredAmount: { amountMinor: 1_500n, currency: 'EUR' },
            cycleContributedAmount: { amountMinor: 400n, currency: 'EUR' },
          },
          {
            moneyBoxId: 'covered',
            monthlyRequiredAmount: { amountMinor: 2_000n, currency: 'EUR' },
            cycleContributedAmount: { amountMinor: 2_500n, currency: 'EUR' },
          },
        ],
      }),
    );

    expect(result.moneyBoxFunding.amountMinor).toBe(1_100n);
    expect(result.safeToSpend.amountMinor).toBe(8_900n);
  });

  test('does not double count funding for a linked committed expense', () => {
    const [result] = computeSafeToSpend(
      planningView({
        accountGroups: [
          accountGroup({
            items: [projectedItem({ plannedExpenseMoneyBoxId: 'linked-box' })],
          }),
        ],
        fundingItems: [
          {
            moneyBoxId: 'linked-box',
            monthlyRequiredAmount: { amountMinor: 1_500n, currency: 'EUR' },
            cycleContributedAmount: { amountMinor: 0n, currency: 'EUR' },
          },
        ],
      }),
    );

    expect(result.committedOutflows.amountMinor).toBe(2_500n);
    expect(result.moneyBoxFunding.amountMinor).toBe(0n);
    expect(result.safeToSpend.amountMinor).toBe(7_500n);
  });

  test('scopes cash, commitments, and associated money boxes to an account', () => {
    const [result] = computeSafeToSpend(
      planningView({
        accountGroups: [
          accountGroup(),
          accountGroup({
            accountId: 'account-secondary',
            startingBalance: { amountMinor: 20_000n, currency: 'EUR' },
            items: [projectedItem({ amount: { amountMinor: 4_000n, currency: 'EUR' } })],
          }),
        ],
        fundingItems: [
          {
            moneyBoxId: 'main-box',
            accountId: 'account-main',
            monthlyRequiredAmount: { amountMinor: 1_000n, currency: 'EUR' },
            cycleContributedAmount: { amountMinor: 0n, currency: 'EUR' },
          },
          {
            moneyBoxId: 'secondary-box',
            accountId: 'account-secondary',
            monthlyRequiredAmount: { amountMinor: 2_000n, currency: 'EUR' },
            cycleContributedAmount: { amountMinor: 0n, currency: 'EUR' },
          },
        ],
      }),
      { accountId: 'account-main' },
    );

    expect(result.availableCash.amountMinor).toBe(10_000n);
    expect(result.committedOutflows.amountMinor).toBe(0n);
    expect(result.moneyBoxFunding.amountMinor).toBe(1_000n);
    expect(result.safeToSpend.amountMinor).toBe(9_000n);
  });

  test('expected inflow affects only safeToSpendWithIncome', () => {
    const [result] = computeSafeToSpend(
      planningView({
        accountGroups: [
          accountGroup({
            items: [
              projectedItem({ title: 'Salary', direction: 'inflow', amount: { amountMinor: 5_000n, currency: 'EUR' } }),
            ],
          }),
        ],
      }),
    );

    expect(result.expectedIncome.amountMinor).toBe(5_000n);
    expect(result.safeToSpend.amountMinor).toBe(10_000n);
    expect(result.safeToSpendWithIncome.amountMinor).toBe(15_000n);
  });

  test('keeps currencies isolated', () => {
    const result = computeSafeToSpend(
      planningView({
        accountGroups: [
          accountGroup({ items: [projectedItem()] }),
          accountGroup({
            startingBalance: { amountMinor: 20_000n, currency: 'USD' },
            items: [projectedItem({ amount: { amountMinor: 4_000n, currency: 'USD' } })],
          }),
        ],
      }),
    );

    expect(result.map((item) => [item.currency, item.safeToSpend.amountMinor])).toEqual([
      ['EUR', 7_500n],
      ['USD', 16_000n],
    ]);
  });

  test('negative safe-to-spend has zero per day', () => {
    const [result] = computeSafeToSpend(
      planningView({
        accountGroups: [
          accountGroup({
            startingBalance: { amountMinor: 1_000n, currency: 'EUR' },
            items: [projectedItem({ amount: { amountMinor: 2_500n, currency: 'EUR' } })],
          }),
        ],
      }),
    );

    expect(result.safeToSpend.amountMinor).toBe(-1_500n);
    expect(result.perDay.amountMinor).toBe(0n);
  });

  test('excludes paid occurrences', () => {
    const [result] = computeSafeToSpend(
      planningView({
        accountGroups: [accountGroup({ items: [projectedItem({ occurrencePayment: { source: 'manual' } })] })],
      }),
    );

    expect(result.committedOutflows.amountMinor).toBe(0n);
    expect(result.safeToSpend.amountMinor).toBe(10_000n);
    expect(result.topUpcoming).toEqual([]);
  });

  test('ignores CARD groups entirely, balance and items alike', () => {
    const [result] = computeSafeToSpend(
      planningView({
        accountGroups: [
          accountGroup(),
          accountGroup({
            account: { accountType: 'CARD' },
            startingBalance: { amountMinor: -4_000n, currency: 'EUR' },
            items: [projectedItem({ title: 'Card subscription', source: 'subscription' })],
          }),
        ],
      }),
    );

    expect(result.availableCash.amountMinor).toBe(10_000n);
    expect(result.committedOutflows.amountMinor).toBe(0n);
    expect(result.safeToSpend.amountMinor).toBe(10_000n);
    expect(result.topUpcoming).toEqual([]);
  });

  test('ignores investment account groups entirely', () => {
    const [result] = computeSafeToSpend(
      planningView({
        accountGroups: [
          accountGroup(),
          accountGroup({
            account: { accountType: 'INVS' },
            startingBalance: { amountMinor: 50_000n, currency: 'EUR' },
            items: [projectedItem({ title: 'Investment fee' })],
          }),
        ],
      }),
    );

    expect(result.availableCash.amountMinor).toBe(10_000n);
    expect(result.committedOutflows.amountMinor).toBe(0n);
    expect(result.safeToSpend.amountMinor).toBe(10_000n);
    expect(result.topUpcoming).toEqual([]);
  });

  test('returns an empty result for an empty planning view', () => {
    expect(computeSafeToSpend(planningView())).toEqual([]);
  });
});

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthKitUser(t: TestHarness, userId: string) {
  const timestamp = '2026-07-01T00:00:00.000Z';
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

describe('safe-to-spend queries', () => {
  test('returns expected minor amounts for a manual account and current-cycle expense', async () => {
    const t = createTest();
    const userId = 'user_safe_to_spend';
    await seedAuthKitUser(t, userId);
    const authenticated = t.withIdentity({ subject: userId });
    const accountId = await authenticated.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Main account',
      accountType: 'CACC',
      currency: 'EUR',
    });
    const today = new Date();
    const cycleEndDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);

    await t.run(async (ctx) => {
      const account = await ctx.db.get('financialAccounts', accountId);
      if (!account?.providerConnectionId) {
        throw new Error('Expected manual provider connection');
      }
      const now = Date.now() + 1;
      await ctx.db.insert('accountBalances', {
        userId,
        accountId,
        providerConnectionId: account.providerConnectionId,
        provider: 'manual',
        balanceType: 'closingBooked',
        amount: { amountMinor: 10_000n, currency: 'EUR' },
        referenceDate: cycleEndDate,
        fetchedAtMs: now,
      });
      await insertPlannedExpense(ctx, {
        userId,
        accountId,
        name: 'Rent',
        amount: { amountMinor: 2_500n, currency: 'EUR' },
        dueDate: cycleEndDate,
        status: 'planned',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const moneyBoxId = await ctx.db.insert('moneyBoxes', {
        userId,
        accountId,
        name: 'Covered reserve',
        targetAmount: { amountMinor: 10_000n, currency: 'EUR' },
        savedAmount: { amountMinor: 10_000n, currency: 'EUR' },
        targetDate: cycleEndDate,
        status: 'active',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId,
        amount: { amountMinor: 10_000n, currency: 'EUR' },
        contributionDate: today.toISOString().slice(0, 10),
        source: 'manual',
        createdAtMs: now,
      });
    });

    const [result] = await authenticated.query(api.banking.safeToSpend.getSafeToSpend, {});

    expect(result).toMatchObject({
      currency: 'EUR',
      availableCash: { amountMinor: 10_000n, currency: 'EUR' },
      committedOutflows: { amountMinor: 2_500n, currency: 'EUR' },
      moneyBoxFunding: { amountMinor: 0n, currency: 'EUR' },
      expectedIncome: { amountMinor: 0n, currency: 'EUR' },
      safeToSpend: { amountMinor: 7_500n, currency: 'EUR' },
      safeToSpendWithIncome: { amountMinor: 7_500n, currency: 'EUR' },
      cycleEndDate,
      topUpcoming: [{ name: 'Rent', dueDate: cycleEndDate, kind: 'plannedExpense' }],
    });
  });

  test('rejects unauthenticated access', async () => {
    const t = createTest();

    await expect(t.query(api.banking.safeToSpend.getSafeToSpend, {})).rejects.toThrow('Unauthorized');
  });
});
