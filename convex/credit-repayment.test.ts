/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import { insertPlannedExpense } from './plannedTransactionsTestHelpers';
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

type RepaymentFixture = {
  userId: string;
  installmentPlanId: Id<'creditFacilityInstallmentPlans'>;
  transactionId: Id<'transactions'>;
  creditFacilityId: Id<'creditFacilities'>;
};

type AggregateRepaymentFixture = RepaymentFixture & {
  installmentPlanIds: [
    Id<'creditFacilityInstallmentPlans'>,
    Id<'creditFacilityInstallmentPlans'>,
    Id<'creditFacilityInstallmentPlans'>,
  ];
};

afterEach(() => {
  vi.useRealTimers();
});

async function seedRepaymentFixture(t: TestHarness): Promise<RepaymentFixture> {
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
      providerAccountId: 'checking_account',
      name: 'Checking',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const creditFacilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Acme Flex Line Premium',
      facilityType: 'additionalCardCreditLine',
      status: 'active',
      source: 'manual',
      linkedAccountId: accountId,
      provider: 'manual',
      limitAmount: {
        amountMinor: 100000n,
        currency: 'EUR',
      },
      usedAmount: {
        amountMinor: 30000n,
        currency: 'EUR',
      },
      repaymentType: 'installmentPlan',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const installmentPlanId = await ctx.db.insert('creditFacilityInstallmentPlans', {
      userId,
      creditFacilityId,
      name: 'Phone purchase',
      principalAmount: {
        amountMinor: 30000n,
        currency: 'EUR',
      },
      outstandingAmount: {
        amountMinor: 30000n,
        currency: 'EUR',
      },
      monthlyPaymentAmount: {
        amountMinor: 10000n,
        currency: 'EUR',
      },
      installmentCount: 3,
      remainingInstallments: 3,
      startDate: '2026-01-15',
      nextPaymentDate: '2026-02-15',
      endDate: '2026-04-15',
      status: 'active',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const transactionId = await ctx.db.insert('transactions', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'mock',
      dedupeKey: 'installment_payment',
      status: 'BOOK',
      direction: 'DBIT',
      amount: {
        amountMinor: 10000n,
        currency: 'EUR',
      },
      bookingDate: '2026-02-15',
      description: 'Rimborso rata Flexia',
      classificationKind: 'uncategorized',
      classificationSource: 'provider',
      importedAtMs: now,
      updatedAtMs: now,
    });

    return { userId, installmentPlanId, transactionId, creditFacilityId };
  });
}

async function seedRepaymentPlan(t: TestHarness, fixture: RepaymentFixture, categoryName: string) {
  const { accountId, categoryId } = await t.run(async (ctx) => {
    const transaction = await ctx.db.get('transactions', fixture.transactionId);
    if (!transaction) throw new Error('Fixture transaction not found');
    const now = Date.now();
    const insertedCategoryId = await ctx.db.insert('categories', {
      userId: fixture.userId,
      name: categoryName,
      kind: 'expense',
      applicableKinds: ['expense'],
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.patch('transactions', transaction._id, {
      classificationKind: 'expense',
      classificationSource: 'user',
      classificationConfidence: 1,
      categoryId: insertedCategoryId,
      updatedAtMs: now,
    });
    return { accountId: transaction.accountId, categoryId: insertedCategoryId };
  });
  const asUser = t.withIdentity({ subject: fixture.userId });
  const { planId } = await asUser.mutation(api.banking.plan.createPlan, {
    name: 'Main plan',
    currency: 'EUR',
    accountIds: [accountId],
  });
  await t.run((ctx) => ctx.db.patch('plans', planId, { startDate: '2026-02-01' }));
  return { asUser, planId, categoryId };
}

async function seedAggregateRepaymentFixture(t: TestHarness): Promise<AggregateRepaymentFixture> {
  const fixture = await seedRepaymentFixture(t);

  const installmentPlanIds = await t.run(async (ctx): Promise<AggregateRepaymentFixture['installmentPlanIds']> => {
    const now = Date.UTC(2026, 0, 1);
    await ctx.db.patch('creditFacilities', fixture.creditFacilityId, {
      usedAmount: {
        amountMinor: 15370n,
        currency: 'EUR',
      },
    });
    await ctx.db.patch('creditFacilityInstallmentPlans', fixture.installmentPlanId, {
      name: 'Wise',
      principalAmount: {
        amountMinor: 6183n,
        currency: 'EUR',
      },
      outstandingAmount: {
        amountMinor: 6183n,
        currency: 'EUR',
      },
      monthlyPaymentAmount: {
        amountMinor: 6183n,
        currency: 'EUR',
      },
      installmentCount: 1,
      remainingInstallments: 1,
      nextPaymentDate: '2026-02-15',
      endDate: '2026-02-15',
    });
    const transferWisePlanId = await ctx.db.insert('creditFacilityInstallmentPlans', {
      userId: fixture.userId,
      creditFacilityId: fixture.creditFacilityId,
      name: 'TransferWise',
      principalAmount: {
        amountMinor: 3091n,
        currency: 'EUR',
      },
      outstandingAmount: {
        amountMinor: 3091n,
        currency: 'EUR',
      },
      monthlyPaymentAmount: {
        amountMinor: 3091n,
        currency: 'EUR',
      },
      installmentCount: 1,
      remainingInstallments: 1,
      startDate: '2026-01-15',
      nextPaymentDate: '2026-02-15',
      endDate: '2026-02-15',
      status: 'active',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const secondWisePlanId = await ctx.db.insert('creditFacilityInstallmentPlans', {
      userId: fixture.userId,
      creditFacilityId: fixture.creditFacilityId,
      name: 'Wise subscription',
      principalAmount: {
        amountMinor: 6096n,
        currency: 'EUR',
      },
      outstandingAmount: {
        amountMinor: 6096n,
        currency: 'EUR',
      },
      monthlyPaymentAmount: {
        amountMinor: 6096n,
        currency: 'EUR',
      },
      installmentCount: 1,
      remainingInstallments: 1,
      startDate: '2026-01-15',
      nextPaymentDate: '2026-02-15',
      endDate: '2026-02-15',
      status: 'active',
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.patch('transactions', fixture.transactionId, {
      amount: {
        amountMinor: 15370n,
        currency: 'EUR',
      },
      description: 'Rimborso prestito estratto 02/2026 carta Flexia',
    });

    return [fixture.installmentPlanId, transferWisePlanId, secondWisePlanId];
  });

  return { ...fixture, installmentPlanIds };
}

async function moveFixtureTransactionToUnlinkedAccount(t: TestHarness, fixture: RepaymentFixture) {
  await t.run(async (ctx) => {
    const transaction = await ctx.db.get('transactions', fixture.transactionId);
    if (!transaction) {
      throw new Error('Fixture transaction not found');
    }

    const now = Date.UTC(2026, 0, 1);
    const otherAccountId = await ctx.db.insert('financialAccounts', {
      userId: fixture.userId,
      providerConnectionId: transaction.providerConnectionId,
      provider: 'mock',
      providerAccountId: 'other_checking_account',
      name: 'Other checking',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.patch('transactions', fixture.transactionId, {
      accountId: otherAccountId,
    });
  });
}

describe('credit installment repayment reconciliation', () => {
  test('closes a card usage cycle with the default due date while resetting the next cycle', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);

    await t.run(async (ctx) => {
      await ctx.db.patch('creditFacilities', fixture.creditFacilityId, {
        facilityType: 'cardCreditLine',
        repaymentType: 'statementBalance',
        paymentDayOfMonth: 10,
        usedAmount: { amountMinor: 45670n, currency: 'EUR' },
      });
    });

    const closedCycleId = await t.withIdentity({ subject: fixture.userId }).mutation(
      api.banking.credit.closeCreditFacilityUsageCycle,
      {
        creditFacilityId: fixture.creditFacilityId,
        cycleMonth: '2026-06',
      },
    );

    const result = await t.run(async (ctx) => {
      const closedCycle = await ctx.db.get('creditFacilityUsageCycles', closedCycleId);
      const nextCycles = await ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_creditFacilityId_and_cycleMonth', (q) =>
          q.eq('creditFacilityId', fixture.creditFacilityId).eq('cycleMonth', '2026-07'),
        )
        .take(5);
      const facility = await ctx.db.get('creditFacilities', fixture.creditFacilityId);
      const plannedExpenses = await ctx.db
        .query('plannedTransactions')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', fixture.userId).eq('status', 'planned'))
        .take(10);
      return { closedCycle, nextCycles, facility, plannedExpenses };
    });

    expect(result.closedCycle?.status).toBe('scheduled');
    expect(result.closedCycle?.trackedAmount.amountMinor).toBe(45670n);
    expect(result.closedCycle?.dueDate).toBe('2026-07-10');
    expect(result.nextCycles).toHaveLength(1);
    expect(result.nextCycles[0]?.status).toBe('open');
    expect(result.nextCycles[0]?.trackedAmount.amountMinor).toBe(0n);
    expect(result.nextCycles[0]?.dueDate).toBe('2026-08-10');
    expect(result.facility?.usedAmount.amountMinor).toBe(0n);
    expect(result.plannedExpenses).toHaveLength(0);
  });

  test('marks scheduled card usage cycles paid and rejects cross-user updates', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await seedAuthKitUser(t, 'other_user');

    await t.run(async (ctx) => {
      await ctx.db.patch('creditFacilities', fixture.creditFacilityId, {
        facilityType: 'cardCreditLine',
        repaymentType: 'statementBalance',
      });
    });

    const cycleId = await t.withIdentity({ subject: fixture.userId }).mutation(
      api.banking.credit.closeCreditFacilityUsageCycle,
      {
        creditFacilityId: fixture.creditFacilityId,
        cycleMonth: '2026-06',
        dueDate: '2026-07-10',
      },
    );

    await expect(
      t.withIdentity({ subject: 'other_user' }).mutation(api.banking.credit.setCreditFacilityUsageCycleStatus, {
        usageCycleId: cycleId,
        status: 'paid',
      }),
    ).rejects.toThrow('Credit usage cycle not found');

    await t.withIdentity({ subject: fixture.userId }).mutation(api.banking.credit.setCreditFacilityUsageCycleStatus, {
      usageCycleId: cycleId,
      status: 'paid',
    });

    const cycle = await t.run(async (ctx) => await ctx.db.get('creditFacilityUsageCycles', cycleId));
    expect(cycle?.status).toBe('paid');
    expect(cycle?.paidAtMs).toBeTypeOf('number');
  });

  test('automatically closes due card cycles, honors statement boundaries, and rolls zero usage forward', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const pastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
    const yesterday = Math.max(1, now.getUTCDate() - 1);

    await t.run(async (ctx) => {
      await ctx.db.patch('creditFacilities', fixture.creditFacilityId, {
        facilityType: 'cardCreditLine',
        repaymentType: 'statementBalance',
        statementDayOfMonth: yesterday,
        usedAmount: { amountMinor: 32100n, currency: 'EUR' },
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId: fixture.userId,
        creditFacilityId: fixture.creditFacilityId,
        cycleMonth: pastMonth,
        status: 'open',
        trackedAmount: { amountMinor: 1n, currency: 'EUR' },
        dueDate: `${currentMonth}-01`,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    });

    await t.mutation(internal.banking.credit.autoCloseDueUsageCycles, { limit: 20 });
    await t.mutation(internal.banking.credit.autoCloseDueUsageCycles, { limit: 20 });

    const result = await t.run(async (ctx) => {
      const cycles = await ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_creditFacilityId_and_cycleMonth', (q) => q.eq('creditFacilityId', fixture.creditFacilityId).eq('cycleMonth', pastMonth))
        .take(5);
      const facility = await ctx.db.get('creditFacilities', fixture.creditFacilityId);
      return { cycles, facility };
    });
    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]).toMatchObject({ status: 'scheduled', trackedAmount: { amountMinor: 32100n, currency: 'EUR' } });
    expect(result.facility?.usedAmount.amountMinor).toBe(0n);

    await t.run(async (ctx) => {
      await ctx.db.patch('creditFacilities', fixture.creditFacilityId, { usedAmount: { amountMinor: 0n, currency: 'EUR' } });
    });
    await t.mutation(internal.banking.credit.autoCloseDueUsageCycles, { limit: 20 });
    const currentCycle = await t.run(async (ctx) =>
      await ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_creditFacilityId_and_cycleMonth', (q) => q.eq('creditFacilityId', fixture.creditFacilityId).eq('cycleMonth', currentMonth))
        .take(5),
    );
    if (now.getUTCDate() > yesterday) {
      expect(currentCycle).toHaveLength(0);
      const nextCycle = await t.run(async (ctx) =>
        await ctx.db
          .query('creditFacilityUsageCycles')
          .withIndex('by_creditFacilityId_and_cycleMonth', (q) => q.eq('creditFacilityId', fixture.creditFacilityId).eq('cycleMonth', nextMonth))
          .take(5),
      );
      expect(nextCycle).toMatchObject([{ status: 'open', trackedAmount: { amountMinor: 0n, currency: 'EUR' } }]);
    }

    const fallbackFacilityId = await t.run(async (ctx) => {
      const facilityId = await ctx.db.insert('creditFacilities', {
        userId: fixture.userId,
        name: 'End of month card',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        provider: 'manual',
        limitAmount: { amountMinor: 50000n, currency: 'EUR' },
        usedAmount: { amountMinor: 99n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId: fixture.userId,
        creditFacilityId: facilityId,
        cycleMonth: currentMonth,
        status: 'open',
        trackedAmount: { amountMinor: 99n, currency: 'EUR' },
        dueDate: `${nextMonth}-01`,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      return facilityId;
    });
    await t.mutation(internal.banking.credit.autoCloseDueUsageCycles, { limit: 20 });
    const fallbackFacility = await t.run(async (ctx) => await ctx.db.get('creditFacilities', fallbackFacilityId));
    expect(fallbackFacility?.usedAmount.amountMinor).toBe(99n);
  });

  test('updates facility limits with matching currency and validates day bounds', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);

    await t.withIdentity({ subject: fixture.userId }).mutation(api.banking.credit.updateCreditFacility, {
      creditFacilityId: fixture.creditFacilityId,
      limitAmount: { amountMinor: 250000n, currency: 'EUR' },
      statementDayOfMonth: 5,
      paymentDayOfMonth: 20,
    });
    const facility = await t.run(async (ctx) => await ctx.db.get('creditFacilities', fixture.creditFacilityId));
    expect(facility).toMatchObject({ limitAmount: { amountMinor: 250000n, currency: 'EUR' }, statementDayOfMonth: 5, paymentDayOfMonth: 20 });
    await expect(
      t.withIdentity({ subject: fixture.userId }).mutation(api.banking.credit.updateCreditFacility, {
        creditFacilityId: fixture.creditFacilityId,
        limitAmount: { amountMinor: 1n, currency: 'USD' },
      }),
    ).rejects.toThrow('currency must match');
    await expect(
      t.withIdentity({ subject: fixture.userId }).mutation(api.banking.credit.updateCreditFacility, {
        creditFacilityId: fixture.creditFacilityId,
        statementDayOfMonth: 32,
      }),
    ).rejects.toThrow('between 1 and 31');

    const installmentFacilityId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert('creditFacilities', {
        userId: fixture.userId,
        name: 'Fixed loan',
        facilityType: 'installmentCredit',
        status: 'active',
        source: 'manual',
        provider: 'manual',
        limitAmount: { amountMinor: 100000n, currency: 'EUR' },
        usedAmount: { amountMinor: 100000n, currency: 'EUR' },
        repaymentType: 'installmentPlan',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });
    await expect(
      t.withIdentity({ subject: fixture.userId }).mutation(api.banking.credit.updateCreditFacility, {
        creditFacilityId: installmentFacilityId,
        limitAmount: { amountMinor: 90000n, currency: 'EUR' },
      }),
    ).rejects.toThrow('Installment credit contracts cannot be edited');
  });

  test('creates an installment credit contract with an active repayment plan', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);

    const accountId = await t.run(async (ctx) => {
      const transaction = await ctx.db.get('transactions', fixture.transactionId);
      return transaction!.accountId;
    });

    const result = await t.withIdentity({ subject: fixture.userId }).mutation(
      api.banking.credit.createInstallmentCreditContract,
      {
        name: 'Acme phone financing',
        linkedAccountId: accountId,
        principalAmount: {
          amountMinor: 72000n,
          currency: 'EUR',
        },
        monthlyPaymentAmount: {
          amountMinor: 3000n,
          currency: 'EUR',
        },
        installmentCount: 24,
        startDate: '2026-01-05',
        nextPaymentDate: '2026-02-05',
      },
    );

    const docs = await t.run(async (ctx) => {
      const facility = await ctx.db.get('creditFacilities', result.creditFacilityId);
      const plan = await ctx.db.get('creditFacilityInstallmentPlans', result.installmentPlanId);
      return { facility, plan };
    });

    expect(docs.facility).toMatchObject({
      name: 'Acme phone financing',
      facilityType: 'installmentCredit',
      repaymentType: 'installmentPlan',
      linkedAccountId: accountId,
    });
    expect(docs.facility?.usedAmount.amountMinor).toBe(72000n);
    expect(docs.plan).toMatchObject({
      name: 'Acme phone financing',
      installmentCount: 24,
      remainingInstallments: 24,
      startDate: '2026-01-05',
      nextPaymentDate: '2026-02-05',
      endDate: '2028-01-05',
      status: 'active',
    });
    expect(docs.plan?.monthlyPaymentAmount.amountMinor).toBe(3000n);
  });

  test('updates editable installment plan fields without rewriting repayment state', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);

    const secondCreditFacilityId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      return await ctx.db.insert('creditFacilities', {
        userId: fixture.userId,
        name: 'Flexia secondary line',
        facilityType: 'installmentCredit',
        status: 'active',
        source: 'manual',
        provider: 'manual',
        limitAmount: {
          amountMinor: 200000n,
          currency: 'EUR',
        },
        usedAmount: {
          amountMinor: 0n,
          currency: 'EUR',
        },
        repaymentType: 'installmentPlan',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await t.withIdentity({ subject: fixture.userId }).mutation(api.banking.credit.updateInstallmentPlan, {
      installmentPlanId: fixture.installmentPlanId,
      creditFacilityId: secondCreditFacilityId,
      name: 'Updated phone purchase',
      monthlyPaymentAmount: {
        amountMinor: 12500n,
        currency: 'EUR',
      },
      nextPaymentDate: '2026-03-20',
    });

    const result = await t.run(async (ctx) => {
      const plan = await ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId);
      const payments = await ctx.db
        .query('creditFacilityInstallmentPayments')
        .withIndex('by_installmentPlanId_and_paymentDate', (q) =>
          q.eq('installmentPlanId', fixture.installmentPlanId),
        )
        .take(10);
      return { plan, payments };
    });

    expect(result.plan?.creditFacilityId).toBe(secondCreditFacilityId);
    expect(result.plan?.name).toBe('Updated phone purchase');
    expect(result.plan?.monthlyPaymentAmount.amountMinor).toBe(12500n);
    expect(result.plan?.nextPaymentDate).toBe('2026-03-20');
    expect(result.plan?.endDate).toBe('2026-05-20');
    expect(result.plan?.principalAmount.amountMinor).toBe(30000n);
    expect(result.plan?.outstandingAmount.amountMinor).toBe(30000n);
    expect(result.plan?.installmentCount).toBe(3);
    expect(result.plan?.remainingInstallments).toBe(3);
    expect(result.payments).toHaveLength(0);
  });

  test('rejects installment plan updates from another user', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, 'other_user');

    await expect(
      t.withIdentity({ subject: 'other_user' }).mutation(api.banking.credit.updateInstallmentPlan, {
        installmentPlanId: fixture.installmentPlanId,
        creditFacilityId: fixture.creditFacilityId,
        name: 'Unauthorized edit',
        monthlyPaymentAmount: {
          amountMinor: 12500n,
          currency: 'EUR',
        },
        nextPaymentDate: '2026-03-20',
      }),
    ).rejects.toThrow('Installment plan not found');
  });

  test('rejects installment plan updates with invalid monthly payment amounts', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);

    await expect(
      t.withIdentity({ subject: fixture.userId }).mutation(api.banking.credit.updateInstallmentPlan, {
        installmentPlanId: fixture.installmentPlanId,
        creditFacilityId: fixture.creditFacilityId,
        name: 'Phone purchase',
        monthlyPaymentAmount: {
          amountMinor: 0n,
          currency: 'EUR',
        },
        nextPaymentDate: '2026-03-20',
      }),
    ).rejects.toThrow('Monthly payment amount must be greater than zero');

    await expect(
      t.withIdentity({ subject: fixture.userId }).mutation(api.banking.credit.updateInstallmentPlan, {
        installmentPlanId: fixture.installmentPlanId,
        creditFacilityId: fixture.creditFacilityId,
        name: 'Phone purchase',
        monthlyPaymentAmount: {
          amountMinor: 12500n,
          currency: 'USD',
        },
        nextPaymentDate: '2026-03-20',
      }),
    ).rejects.toThrow('Monthly payment amount currency must match installment plan currency');
  });

  test('keeps external installment credit payments in their Plan bucket activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T12:00:00.000Z'));
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await t.run(async (ctx) => {
      await ctx.db.patch('creditFacilities', fixture.creditFacilityId, { facilityType: 'installmentCredit' });
    });
    const { asUser, planId, categoryId } = await seedRepaymentPlan(t, fixture, 'Loan payment');

    await t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
      transactionId: fixture.transactionId,
    });

    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-02' });
    const bucket = month.groups.flatMap((group) => group.buckets).find((candidate) => candidate.name === 'Loan payment');
    const installmentBucket = month.groups
      .flatMap((group) => group.buckets)
      .find((candidate) => candidate.installmentPlanId === fixture.installmentPlanId);
    const transaction = await t.run(async (ctx) => ctx.db.get('transactions', fixture.transactionId));

    expect(transaction).toMatchObject({
      classificationKind: 'expense',
      classificationSource: 'user',
      categoryId,
    });
    expect(bucket).toMatchObject({
      name: 'Loan payment',
      categoryIds: [categoryId],
      activityMinor: 0n,
      availableMinor: 0n,
    });
    expect(installmentBucket).toMatchObject({
      name: 'Phone purchase',
      categoryIds: [],
      activityMinor: -10_000n,
      availableMinor: -10_000n,
    });
    expect(month.breakdown.internalMinor).toBe(0n);
    expect(month.breakdown.unexplainedMinor).toBe(0n);
    expect(month.totals.activityMinor).toBe(-10_000n);
  });

  test('keeps additional card credit line repayments internal while routing them to installment activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T12:00:00.000Z'));
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    const { asUser, planId, categoryId } = await seedRepaymentPlan(t, fixture, 'Card purchase');

    await t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
      transactionId: fixture.transactionId,
    });

    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-02' });
    const bucket = month.groups.flatMap((group) => group.buckets).find((candidate) => candidate.name === 'Card purchase');
    const installmentBucket = month.groups
      .flatMap((group) => group.buckets)
      .find((candidate) => candidate.installmentPlanId === fixture.installmentPlanId);
    const transaction = await t.run(async (ctx) => ctx.db.get('transactions', fixture.transactionId));

    expect(transaction).toMatchObject({
      classificationKind: 'internal',
      classificationSource: 'user',
      categoryId,
    });
    expect(bucket?.activityMinor).toBe(0n);
    expect(installmentBucket?.activityMinor).toBe(-10_000n);
    expect(month.breakdown.internalMinor).toBe(0n);
    expect(month.breakdown.unexplainedMinor).toBe(0n);
    expect(month.totals.activityMinor).toBe(-10_000n);
  });

  test('keeps card statement settlements internal', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    const usageCycleId = await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch('creditFacilities', fixture.creditFacilityId, {
        facilityType: 'cardCreditLine',
        repaymentType: 'statementBalance',
      });
      return await ctx.db.insert('creditFacilityUsageCycles', {
        userId: fixture.userId,
        creditFacilityId: fixture.creditFacilityId,
        cycleMonth: '2026-01',
        status: 'scheduled',
        trackedAmount: { amountMinor: 10_000n, currency: 'EUR' },
        dueDate: '2026-02-15',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await t.withIdentity({ subject: fixture.userId }).mutation(api.banking.credit.confirmUsageCyclePaymentTransaction, {
      usageCycleId,
      transactionId: fixture.transactionId,
    });

    const result = await t.run(async (ctx) => ({
      cycle: await ctx.db.get('creditFacilityUsageCycles', usageCycleId),
      transaction: await ctx.db.get('transactions', fixture.transactionId),
    }));
    expect(result.cycle).toMatchObject({ status: 'paid', transactionId: fixture.transactionId });
    expect(result.transaction).toMatchObject({ classificationKind: 'internal', classificationSource: 'user' });
  });

  test('links an imported debit transaction to an active installment plan idempotently', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);

    const paymentId = await t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
      transactionId: fixture.transactionId,
    });
    const secondPaymentId = await t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
      transactionId: fixture.transactionId,
    });

    expect(secondPaymentId).toBe(paymentId);

    const result = await t.run(async (ctx) => {
      const payment = await ctx.db.get('creditFacilityInstallmentPayments', paymentId);
      const plan = await ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId);
      const facility = await ctx.db.get('creditFacilities', fixture.creditFacilityId);
      const transaction = await ctx.db.get('transactions', fixture.transactionId);
      return { payment, plan, facility, transaction };
    });

    expect(result.payment?.source).toBe('transaction');
    expect(result.payment?.transactionId).toBe(fixture.transactionId);
    expect(result.payment?.amount.amountMinor).toBe(10000n);
    expect(result.payment?.paymentDate).toBe('2026-02-15');
    expect(result.plan?.outstandingAmount.amountMinor).toBe(20000n);
    expect(result.plan?.remainingInstallments).toBe(2);
    expect(result.plan?.nextPaymentDate).toBe('2026-03-15');
    expect(result.plan?.status).toBe('active');
    expect(result.facility?.usedAmount.amountMinor).toBe(20000n);
    expect(result.transaction?.classificationKind).toBe('internal');
    expect(result.transaction?.classificationSource).toBe('user');
  });

  test('links a subscription-classified recurring debit when the user picks the plan explicitly', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionId, {
        classificationKind: 'subscription',
        classificationSource: 'user',
        classificationConfidence: 1,
        description: 'Incasso SDD STELLANTIS FINANCIAL SERVICES ITALIA SPA',
      });
    });

    const paymentId = await t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
      transactionId: fixture.transactionId,
    });

    const result = await t.run(async (ctx) => ({
      payment: await ctx.db.get('creditFacilityInstallmentPayments', paymentId),
      plan: await ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId),
    }));

    expect(result.payment?.transactionId).toBe(fixture.transactionId);
    expect(result.plan?.outstandingAmount.amountMinor).toBe(20000n);
    expect(result.plan?.remainingInstallments).toBe(2);
  });

  test('keeps subscription-classified debits out of automatic installment suggestions', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionId, {
        classificationKind: 'subscription',
        classificationSource: 'system',
        classificationConfidence: 1,
      });
    });

    const candidates = await t
      .withIdentity({ subject: fixture.userId })
      .query(api.banking.credit.listInstallmentPaymentCandidates, {
        asOfDate: '2026-02-13',
        daysWindow: 14,
        limit: 10,
      });

    expect(candidates.some((candidate) => candidate.kind === 'single')).toBe(false);
  });

  test('rejects linking an imported transaction from an account that does not repay the credit facility', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await moveFixtureTransactionToUnlinkedAccount(t, fixture);

    await expect(
      t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
        userId: fixture.userId,
        installmentPlanId: fixture.installmentPlanId,
        transactionId: fixture.transactionId,
      }),
    ).rejects.toThrow('credit facility repayment account');
  });

  test('reduces installment debt only by the principal split when repayment includes interest and fees', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);

    const paymentId = await t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
      transactionId: fixture.transactionId,
      principalAmount: {
        amountMinor: 9200n,
        currency: 'EUR',
      },
      interestAmount: {
        amountMinor: 600n,
        currency: 'EUR',
      },
      feeAmount: {
        amountMinor: 200n,
        currency: 'EUR',
      },
    });

    const result = await t.run(async (ctx) => {
      const payment = await ctx.db.get('creditFacilityInstallmentPayments', paymentId);
      const plan = await ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId);
      const facility = await ctx.db.get('creditFacilities', fixture.creditFacilityId);
      return { payment, plan, facility };
    });

    expect(result.payment?.amount.amountMinor).toBe(10000n);
    expect(result.payment?.principalAmount?.amountMinor).toBe(9200n);
    expect(result.payment?.interestAmount?.amountMinor).toBe(600n);
    expect(result.payment?.feeAmount?.amountMinor).toBe(200n);
    expect(result.plan?.outstandingAmount.amountMinor).toBe(20800n);
    expect(result.facility?.usedAmount.amountMinor).toBe(20800n);
  });

  test('caps the expected scheduled installment amount on the final payment', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch('creditFacilityInstallmentPlans', fixture.installmentPlanId, {
        outstandingAmount: {
          amountMinor: 7500n,
          currency: 'EUR',
        },
        remainingInstallments: 1,
      });
    });

    const paymentId = await t.mutation(internal.banking.credit.recordExpectedInstallmentPaymentForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
    });

    const result = await t.run(async (ctx) => {
      const payment = await ctx.db.get('creditFacilityInstallmentPayments', paymentId);
      const plan = await ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId);
      return { payment, plan };
    });

    expect(result.payment?.amount.amountMinor).toBe(7500n);
    expect(result.payment?.scheduledDueDate).toBe('2026-02-15');
    expect(result.payment?.source).toBe('manual');
    expect(result.plan?.outstandingAmount.amountMinor).toBe(0n);
    expect(result.plan?.status).toBe('paid');
  });

  test('does not shorten an interest-bearing plan when principal is below scheduled repayments', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch('creditFacilityInstallmentPlans', fixture.installmentPlanId, {
        principalAmount: {
          amountMinor: 200000n,
          currency: 'EUR',
        },
        outstandingAmount: {
          amountMinor: 78080n,
          currency: 'EUR',
        },
        monthlyPaymentAmount: {
          amountMinor: 6096n,
          currency: 'EUR',
        },
        installmentCount: 36,
        remainingInstallments: 16,
        startDate: '2024-12-05',
        nextPaymentDate: '2026-08-05',
        endDate: '2027-11-05',
      });
    });

    const paymentId = await t.mutation(internal.banking.credit.recordExpectedInstallmentPaymentForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
      scheduledDueDate: '2026-08-05',
    });

    const result = await t.run(async (ctx) => {
      const payment = await ctx.db.get('creditFacilityInstallmentPayments', paymentId);
      const plan = await ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId);
      return { payment, plan };
    });

    expect(result.payment?.amount.amountMinor).toBe(6096n);
    expect(result.plan?.remainingInstallments).toBe(15);
    expect(result.plan?.nextPaymentDate).toBe('2026-09-05');
    expect(result.plan?.status).toBe('active');
  });

  test('backfills expected installments through a selected due date', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await t.run(async (ctx) => {
      await ctx.db.patch('creditFacilities', fixture.creditFacilityId, {
        usedAmount: {
          amountMinor: 60000n,
          currency: 'EUR',
        },
      });
      await ctx.db.patch('creditFacilityInstallmentPlans', fixture.installmentPlanId, {
        name: 'Acme phone financing',
        principalAmount: {
          amountMinor: 60000n,
          currency: 'EUR',
        },
        outstandingAmount: {
          amountMinor: 60000n,
          currency: 'EUR',
        },
        monthlyPaymentAmount: {
          amountMinor: 1000n,
          currency: 'EUR',
        },
        installmentCount: 60,
        remainingInstallments: 60,
        startDate: '2025-11-05',
        nextPaymentDate: '2026-07-05',
        endDate: '2030-11-05',
      });
    });

    const result = await t.withIdentity({ subject: fixture.userId }).mutation(
      api.banking.credit.backfillExpectedInstallmentPayments,
      {
        installmentPlanId: fixture.installmentPlanId,
        throughScheduledDueDate: '2026-07-05',
        notes: 'Historical import',
      },
    );

    const state = await t.run(async (ctx) => {
      const payments = await ctx.db
        .query('creditFacilityInstallmentPayments')
        .withIndex('by_installmentPlanId_and_paymentDate', (q) => q.eq('installmentPlanId', fixture.installmentPlanId))
        .collect();
      const plan = await ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId);
      const facility = await ctx.db.get('creditFacilities', fixture.creditFacilityId);
      return { payments, plan, facility };
    });

    expect(result.recordedInstallments).toBe(9);
    expect(state.payments.map((payment) => payment.scheduledDueDate).sort()).toEqual([
      '2025-11-05',
      '2025-12-05',
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
      '2026-06-05',
      '2026-07-05',
    ]);
    expect(state.payments.every((payment) => payment.source === 'manual')).toBe(true);
    expect(state.payments.every((payment) => payment.notes === 'Historical import')).toBe(true);
    expect(state.plan?.remainingInstallments).toBe(51);
    expect(state.plan?.nextPaymentDate).toBe('2026-08-05');
    expect(state.plan?.outstandingAmount.amountMinor).toBe(51000n);
    expect(state.facility?.usedAmount.amountMinor).toBe(51000n);
  });

  test('rejects installment backfill from another user', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await seedAuthKitUser(t, 'other_user');

    await expect(
      t.withIdentity({ subject: 'other_user' }).mutation(api.banking.credit.backfillExpectedInstallmentPayments, {
        installmentPlanId: fixture.installmentPlanId,
        throughScheduledDueDate: '2026-03-15',
      }),
    ).rejects.toThrow('Installment plan not found');
  });

  test('links a back-dated transaction to a recorded installment without advancing the plan again', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);

    const recordedPaymentId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      await ctx.db.patch('creditFacilities', fixture.creditFacilityId, {
        usedAmount: { amountMinor: 29000n, currency: 'EUR' },
      });
      await ctx.db.patch('creditFacilityInstallmentPlans', fixture.installmentPlanId, {
        principalAmount: { amountMinor: 60000n, currency: 'EUR' },
        outstandingAmount: { amountMinor: 29000n, currency: 'EUR' },
        monthlyPaymentAmount: { amountMinor: 1000n, currency: 'EUR' },
        installmentCount: 60,
        remainingInstallments: 29,
        startDate: '2023-12-05',
        nextPaymentDate: '2026-07-05',
        endDate: '2028-11-05',
      });
      await ctx.db.patch('transactions', fixture.transactionId, {
        amount: { amountMinor: 1000n, currency: 'EUR' },
        bookingDate: '2026-05-05',
      });
      return await ctx.db.insert('creditFacilityInstallmentPayments', {
        userId: fixture.userId,
        creditFacilityId: fixture.creditFacilityId,
        installmentPlanId: fixture.installmentPlanId,
        amount: { amountMinor: 1000n, currency: 'EUR' },
        principalAmount: { amountMinor: 1000n, currency: 'EUR' },
        paymentDate: '2026-05-05',
        scheduledDueDate: '2026-05-05',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const linkedPaymentId = await t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
      transactionId: fixture.transactionId,
      scheduledDueDate: '2026-05-05',
    });

    const state = await t.run(async (ctx) => ({
      payment: await ctx.db.get('creditFacilityInstallmentPayments', recordedPaymentId),
      plan: await ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId),
      facility: await ctx.db.get('creditFacilities', fixture.creditFacilityId),
    }));

    expect(linkedPaymentId).toBe(recordedPaymentId);
    expect(state.payment?.transactionId).toBe(fixture.transactionId);
    expect(state.payment?.source).toBe('transaction');
    expect(state.plan?.remainingInstallments).toBe(29);
    expect(state.plan?.outstandingAmount).toEqual({ amountMinor: 29000n, currency: 'EUR' });
    expect(state.plan?.nextPaymentDate).toBe('2026-07-05');
    expect(state.facility?.usedAmount).toEqual({ amountMinor: 29000n, currency: 'EUR' });
  });

  test('refuses an installment already linked to another transaction', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);

    const secondTransactionId = await t.run(async (ctx) => {
      const transaction = await ctx.db.get('transactions', fixture.transactionId);
      if (!transaction) throw new Error('Fixture transaction not found');
      const now = Date.UTC(2026, 0, 1);
      const transactionId = await ctx.db.insert('transactions', {
        userId: fixture.userId,
        accountId: transaction.accountId,
        providerConnectionId: transaction.providerConnectionId,
        provider: 'mock',
        dedupeKey: 'second_installment_payment',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 10000n, currency: 'EUR' },
        bookingDate: '2026-02-16',
        description: 'Second repayment import',
        classificationKind: 'uncategorized',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityInstallmentPayments', {
        userId: fixture.userId,
        creditFacilityId: fixture.creditFacilityId,
        installmentPlanId: fixture.installmentPlanId,
        amount: { amountMinor: 10000n, currency: 'EUR' },
        principalAmount: { amountMinor: 10000n, currency: 'EUR' },
        paymentDate: '2026-02-15',
        scheduledDueDate: '2026-02-15',
        source: 'transaction',
        transactionId: fixture.transactionId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return transactionId;
    });

    await expect(
      t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
        userId: fixture.userId,
        installmentPlanId: fixture.installmentPlanId,
        transactionId: secondTransactionId,
        scheduledDueDate: '2026-02-15',
      }),
    ).rejects.toThrow('Scheduled installment payment is already linked to another transaction');
  });

  test('lists recorded and upcoming installments sorted with recorded payments winning by due date', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      await ctx.db.insert('creditFacilityInstallmentPayments', {
        userId: fixture.userId,
        creditFacilityId: fixture.creditFacilityId,
        installmentPlanId: fixture.installmentPlanId,
        amount: { amountMinor: 10000n, currency: 'EUR' },
        paymentDate: '2026-01-15',
        scheduledDueDate: '2026-01-15',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityInstallmentPayments', {
        userId: fixture.userId,
        creditFacilityId: fixture.creditFacilityId,
        installmentPlanId: fixture.installmentPlanId,
        amount: { amountMinor: 10000n, currency: 'EUR' },
        paymentDate: '2026-02-14',
        scheduledDueDate: '2026-02-15',
        source: 'transaction',
        transactionId: fixture.transactionId,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const payments = await t
      .withIdentity({ subject: fixture.userId })
      .query(api.banking.credit.listInstallmentPlanPayments, { installmentPlanId: fixture.installmentPlanId });

    expect(payments.map((payment) => payment.scheduledDueDate)).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
    expect(payments[0]).toMatchObject({
      paymentDate: '2026-01-15',
      isLinked: false,
      transactionId: null,
      isRecorded: true,
    });
    expect(payments[1]).toMatchObject({
      paymentDate: '2026-02-14',
      isLinked: true,
      transactionId: fixture.transactionId,
      isRecorded: true,
    });
    expect(payments[2]).toMatchObject({
      amount: { amountMinor: 10000n, currency: 'EUR' },
      paymentDate: null,
      isLinked: false,
      transactionId: null,
      isRecorded: false,
    });
  });

  test('links an imported transaction to an existing manual scheduled payment without applying it twice', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);

    const manualPaymentId = await t.mutation(internal.banking.credit.recordExpectedInstallmentPaymentForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
    });
    const linkedPaymentId = await t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
      userId: fixture.userId,
      installmentPlanId: fixture.installmentPlanId,
      transactionId: fixture.transactionId,
      scheduledDueDate: '2026-02-15',
    });

    expect(linkedPaymentId).toBe(manualPaymentId);

    const result = await t.run(async (ctx) => {
      const payments = await ctx.db
        .query('creditFacilityInstallmentPayments')
        .withIndex('by_installmentPlanId_and_scheduledDueDate', (q) =>
          q.eq('installmentPlanId', fixture.installmentPlanId).eq('scheduledDueDate', '2026-02-15'),
        )
        .take(10);
      const plan = await ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId);
      const facility = await ctx.db.get('creditFacilities', fixture.creditFacilityId);
      const transaction = await ctx.db.get('transactions', fixture.transactionId);
      return { payments, plan, facility, transaction };
    });

    expect(result.payments).toHaveLength(1);
    expect(result.payments[0]?.source).toBe('transaction');
    expect(result.payments[0]?.transactionId).toBe(fixture.transactionId);
    expect(result.plan?.outstandingAmount.amountMinor).toBe(20000n);
    expect(result.plan?.remainingInstallments).toBe(2);
    expect(result.facility?.usedAmount.amountMinor).toBe(20000n);
    expect(result.transaction?.classificationKind).toBe('internal');
  });

  test('surfaces pending imported repayments as not confirmable candidates', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionId, {
        status: 'PDNG',
      });
    });

    const candidates = await t.withIdentity({ subject: fixture.userId }).query(api.banking.credit.listInstallmentPaymentCandidates, {
      asOfDate: '2026-02-13',
      daysWindow: 14,
      limit: 10,
    });

    const candidate = candidates.find((item) => item.kind === 'single');
    expect(candidate?.kind).toBe('single');
    if (candidate?.kind === 'single') {
      expect(candidate.confirmable).toBe(false);
      expect(candidate.reviewStatus).toBe('pending');
      expect(candidate.scheduledDueDate).toBe('2026-02-15');
    }
  });

  test('never offers or accepts a scheduled row as an installment repayment', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionId, { status: 'SCHD' });
    });

    const candidates = await t
      .withIdentity({ subject: fixture.userId })
      .query(api.banking.credit.listInstallmentPaymentCandidates, {
        asOfDate: '2026-02-13',
        daysWindow: 14,
        limit: 10,
      });
    expect(candidates.some((candidate) => candidate.kind === 'single')).toBe(false);

    await expect(
      t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
        userId: fixture.userId,
        installmentPlanId: fixture.installmentPlanId,
        transactionId: fixture.transactionId,
      }),
    ).rejects.toThrow('Only booked debit transactions');
  });

  test('does not surface individual transaction matches when a facility has an aggregate monthly repayment cycle', async () => {
    const t = createTest();
    const fixture = await seedAggregateRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionId, {
        amount: {
          amountMinor: 6285n,
          currency: 'EUR',
        },
        description: 'Individual-looking Wise debit',
      });
    });

    const candidates = await t.withIdentity({ subject: fixture.userId }).query(api.banking.credit.listInstallmentPaymentCandidates, {
      asOfDate: '2026-02-13',
      daysWindow: 14,
      limit: 10,
    });

    expect(candidates.some((candidate) => candidate.kind === 'single')).toBe(false);
    const expectedCandidate = candidates.find((candidate) => candidate.kind === 'expected');
    expect(expectedCandidate?.kind).toBe('expected');
    if (expectedCandidate?.kind === 'expected') {
      expect(expectedCandidate.expectedAmount.amountMinor).toBe(15370n);
      expect(expectedCandidate.allocations).toHaveLength(3);
      expect(expectedCandidate.dueDate).toBe('2026-02-15');
    }
  });

  test('surfaces near matches against the aggregate monthly repayment total instead of single plan amounts', async () => {
    const t = createTest();
    const fixture = await seedAggregateRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionId, {
        amount: {
          amountMinor: 15400n,
          currency: 'EUR',
        },
        description: 'Rimborso prestito estratto 02/2026 carta Flexia',
      });
    });

    const candidates = await t.withIdentity({ subject: fixture.userId }).query(api.banking.credit.listInstallmentPaymentCandidates, {
      asOfDate: '2026-02-13',
      daysWindow: 14,
      limit: 10,
    });

    expect(candidates.some((candidate) => candidate.kind === 'single')).toBe(false);
    const aggregateCandidate = candidates.find((candidate) => candidate.kind === 'aggregate');
    expect(aggregateCandidate?.kind).toBe('aggregate');
    if (aggregateCandidate?.kind === 'aggregate') {
      expect(aggregateCandidate.expectedAmount.amountMinor).toBe(15370n);
      expect(aggregateCandidate.amountDelta.amountMinor).toBe(30n);
      expect(aggregateCandidate.reviewStatus).toBe('review');
      expect(aggregateCandidate.confirmable).toBe(false);
      expect(aggregateCandidate.allocations).toHaveLength(3);
    }
  });

  test('ignores imported repayment candidates from accounts not linked to the credit facility', async () => {
    const t = createTest();
    const fixture = await seedAggregateRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await moveFixtureTransactionToUnlinkedAccount(t, fixture);

    const candidates = await t.withIdentity({ subject: fixture.userId }).query(api.banking.credit.listInstallmentPaymentCandidates, {
      asOfDate: '2026-02-13',
      daysWindow: 14,
      limit: 10,
    });

    expect(candidates.some((candidate) => candidate.kind === 'single' || candidate.kind === 'aggregate')).toBe(false);
    const expectedCandidate = candidates.find((candidate) => candidate.kind === 'expected');
    expect(expectedCandidate?.kind).toBe('expected');
    if (expectedCandidate?.kind === 'expected') {
      expect(expectedCandidate.expectedAmount.amountMinor).toBe(15370n);
      expect(expectedCandidate.allocations).toHaveLength(3);
    }
  });

  test('allocates one imported transaction across multiple active installment plans idempotently', async () => {
    const t = createTest();
    const fixture = await seedAggregateRepaymentFixture(t);
    const allocations = [
      {
        installmentPlanId: fixture.installmentPlanIds[0],
        amount: { amountMinor: 6183n, currency: 'EUR' },
      },
      {
        installmentPlanId: fixture.installmentPlanIds[1],
        amount: { amountMinor: 3091n, currency: 'EUR' },
      },
      {
        installmentPlanId: fixture.installmentPlanIds[2],
        amount: { amountMinor: 6096n, currency: 'EUR' },
      },
    ];

    const paymentIds = await t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionBatchForUser, {
      userId: fixture.userId,
      transactionId: fixture.transactionId,
      allocations,
    });
    const secondPaymentIds = await t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionBatchForUser, {
      userId: fixture.userId,
      transactionId: fixture.transactionId,
      allocations,
    });

    expect(secondPaymentIds).toEqual(paymentIds);

    const result = await t.run(async (ctx) => {
      const payments = await ctx.db
        .query('creditFacilityInstallmentPayments')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', fixture.transactionId))
        .take(10);
      const facility = await ctx.db.get('creditFacilities', fixture.creditFacilityId);
      const transaction = await ctx.db.get('transactions', fixture.transactionId);
      const plans = [];
      for (const planId of fixture.installmentPlanIds) {
        plans.push(await ctx.db.get('creditFacilityInstallmentPlans', planId));
      }
      return { payments, facility, transaction, plans };
    });

    expect(result.payments.map((payment) => payment.amount.amountMinor).sort()).toEqual([3091n, 6096n, 6183n]);
    expect(result.payments).toHaveLength(3);
    expect(result.facility?.usedAmount.amountMinor).toBe(0n);
    expect(result.transaction?.classificationKind).toBe('internal');
    expect(result.plans.map((plan) => plan?.status)).toEqual(['paid', 'paid', 'paid']);
  });

  test('rejects aggregate repayment allocations that do not add up to the transaction amount', async () => {
    const t = createTest();
    const fixture = await seedAggregateRepaymentFixture(t);

    await expect(
      t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionBatchForUser, {
        userId: fixture.userId,
        transactionId: fixture.transactionId,
        allocations: [
          {
            installmentPlanId: fixture.installmentPlanIds[0],
            amount: { amountMinor: 6183n, currency: 'EUR' },
          },
          {
            installmentPlanId: fixture.installmentPlanIds[1],
            amount: { amountMinor: 3091n, currency: 'EUR' },
          },
          {
            installmentPlanId: fixture.installmentPlanIds[2],
            amount: { amountMinor: 6095n, currency: 'EUR' },
          },
        ],
      }),
    ).rejects.toThrow('add up to the transaction amount');
  });

  test('offers one aggregate link option, not three competing plans, when a facility repays several plans at once', async () => {
    const t = createTest();
    const fixture = await seedAggregateRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);

    const options = await t
      .withIdentity({ subject: fixture.userId })
      .query(api.banking.credit.listInstallmentLinkOptions, { transactionId: fixture.transactionId });

    expect(options).toHaveLength(1);
    const [option] = options;
    expect(option.kind).toBe('aggregate');
    if (option.kind === 'aggregate') {
      expect(option.expectedAmount.amountMinor).toBe(15370n);
      // Ordered by plan name: TransferWise, Wise, Wise subscription.
      expect(option.allocations.map((allocation) => allocation.expectedAmount.amountMinor)).toEqual([
        3091n,
        6183n,
        6096n,
      ]);
      expect(option.allocations.every((allocation) => allocation.scheduledDueDate === '2026-02-15')).toBe(true);
    }
  });

  test('offers a single plan option when the facility has only one plan due', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);

    const options = await t
      .withIdentity({ subject: fixture.userId })
      .query(api.banking.credit.listInstallmentLinkOptions, { transactionId: fixture.transactionId });

    expect(options).toHaveLength(1);
    const [option] = options;
    expect(option.kind).toBe('single');
    if (option.kind === 'single') {
      expect(option.plan._id).toBe(fixture.installmentPlanId);
    }
  });

  test('offers no link option for a transaction on an account that does not repay the facility', async () => {
    const t = createTest();
    const fixture = await seedAggregateRepaymentFixture(t);
    await seedAuthKitUser(t, fixture.userId);
    await moveFixtureTransactionToUnlinkedAccount(t, fixture);

    const options = await t
      .withIdentity({ subject: fixture.userId })
      .query(api.banking.credit.listInstallmentLinkOptions, { transactionId: fixture.transactionId });

    expect(options).toEqual([]);
  });

  test('rejects non-debit repayment links', async () => {
    const t = createTest();
    const fixture = await seedRepaymentFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionId, {
        direction: 'CRDT',
      });
    });

    await expect(
      t.mutation(internal.banking.credit.confirmInstallmentPaymentTransactionForUser, {
        userId: fixture.userId,
        installmentPlanId: fixture.installmentPlanId,
        transactionId: fixture.transactionId,
      }),
    ).rejects.toThrow('booked debit');
  });
});
