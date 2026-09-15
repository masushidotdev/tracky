/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
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

async function latestBalanceMinor(t: TestHarness, accountId: Id<'financialAccounts'>) {
  return await t.run(async (ctx) => {
    const balances = await ctx.db
      .query('accountBalances')
      .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', accountId))
      .order('desc')
      .take(10);
    return {
      amountMinor: balances[0]?.amount.amountMinor,
      rowCount: balances.length,
    };
  });
}

async function seedManualCard(t: TestHarness, userId: string) {
  await seedAuthKitUser(t, userId);
  const asUser = t.withIdentity({ subject: userId });
  const cardAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
    name: 'Acme Flex Classic',
    accountType: 'CARD',
    currency: 'EUR',
  });
  await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
    accountId: cardAccountId,
    direction: 'DBIT',
    amount: { amountMinor: 120_000n, currency: 'EUR' },
    bookingDate: '2026-07-01',
    description: 'Estratto di luglio',
    classificationKind: 'internal',
  });

  const facilityId = await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Acme Flex Classic',
      facilityType: 'cardCreditLine',
      status: 'active',
      source: 'manual',
      linkedAccountId: cardAccountId,
      provider: 'manual',
      limitAmount: { amountMinor: 250_000n, currency: 'EUR' },
      usedAmount: { amountMinor: 0n, currency: 'EUR' },
      repaymentType: 'statementBalance',
      paymentDayOfMonth: 5,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });

  return { asUser, cardAccountId, facilityId };
}

async function convertManualStatement(t: TestHarness, userId: string) {
  const fixture = await seedManualCard(t, userId);
  await fixture.asUser.mutation(api.banking.credit.closeCreditFacilityUsageCycle, {
    creditFacilityId: fixture.facilityId,
    cycleMonth: '2026-07',
  });
  const installmentPlanId = await fixture.asUser.mutation(api.banking.credit.createInstallmentPlan, {
    creditFacilityId: fixture.facilityId,
    name: 'Estratto luglio in 3 rate',
    principalAmount: { amountMinor: 120_000n, currency: 'EUR' },
    monthlyPaymentAmount: { amountMinor: 40_000n, currency: 'EUR' },
    installmentCount: 3,
    startDate: '2026-07-01',
    nextPaymentDate: '2026-08-01',
  });
  return { ...fixture, installmentPlanId };
}

async function convertManualStatementSettledFromChecking(t: TestHarness, userId: string) {
  const fixture = await convertManualStatement(t, userId);
  const checkingAccountId = await fixture.asUser.mutation(api.banking.manualAccounts.createManualAccount, {
    name: 'Conto Acme',
    accountType: 'CACC',
    currency: 'EUR',
  });
  await fixture.asUser.mutation(api.banking.credit.updateCreditFacility, {
    creditFacilityId: fixture.facilityId,
    settlementAccountId: checkingAccountId,
  });
  return { ...fixture, checkingAccountId };
}

async function listedFacility(
  t: TestHarness,
  asUser: ReturnType<TestHarness['withIdentity']>,
  facilityId: Id<'creditFacilities'>,
) {
  const facilities = await asUser.query(api.banking.credit.listCreditFacilities, {});
  const facility = facilities.find((candidate) => candidate._id === facilityId);
  if (!facility) throw new Error('Credit facility not found');
  return facility;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('card statement installment conversion', () => {
  test('moves a manual statement out of the card balance without changing availability or Plan accounting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    const t = createTest();
    const fixture = await seedManualCard(t, 'manual_card_conversion_user');
    const { planId } = await fixture.asUser.mutation(api.banking.plan.createPlan, {
      name: 'Main plan',
      currency: 'EUR',
      accountIds: [fixture.cardAccountId],
    });
    const beforePlan = await fixture.asUser.query(api.banking.planRead.getPlanMonth, {
      planId,
      period: '2026-07',
    });
    const beforeFacility = await listedFacility(t, fixture.asUser, fixture.facilityId);

    expect(beforeFacility.usedAmount.amountMinor).toBe(120_000n);
    expect(beforeFacility.activeInstallmentOutstanding.amountMinor).toBe(0n);
    expect(beforeFacility.summary.availableAmount.amountMinor).toBe(130_000n);

    await fixture.asUser.mutation(api.banking.credit.closeCreditFacilityUsageCycle, {
      creditFacilityId: fixture.facilityId,
      cycleMonth: '2026-07',
    });
    const installmentPlanId = await fixture.asUser.mutation(api.banking.credit.createInstallmentPlan, {
      creditFacilityId: fixture.facilityId,
      name: 'Estratto luglio in 3 rate',
      principalAmount: { amountMinor: 120_000n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 40_000n, currency: 'EUR' },
      installmentCount: 3,
      startDate: '2026-07-01',
      nextPaymentDate: '2026-08-01',
    });

    const balance = await latestBalanceMinor(t, fixture.cardAccountId);
    const storedPlan = await t.run(
      async (ctx) => await ctx.db.get('creditFacilityInstallmentPlans', installmentPlanId),
    );
    const afterFacility = await listedFacility(t, fixture.asUser, fixture.facilityId);
    const afterPlan = await fixture.asUser.query(api.banking.planRead.getPlanMonth, {
      planId,
      period: '2026-07',
    });

    expect(balance.amountMinor).toBe(0n);
    expect(storedPlan?.outstandingAmount.amountMinor).toBe(120_000n);
    expect(storedPlan?.manualCardBalanceCorrectionApplied).toBe(true);
    expect(afterFacility.usedAmount.amountMinor).toBe(0n);
    expect(afterFacility.activeInstallmentOutstanding.amountMinor).toBe(120_000n);
    expect(afterFacility.summary.availableAmount.amountMinor).toBe(130_000n);
    expect(afterPlan.readyToAssignMinor).toBe(beforePlan.readyToAssignMinor);
    expect(afterPlan.breakdown.unexplainedMinor).toBe(beforePlan.breakdown.unexplainedMinor);
  });

  test('does not write a provider-managed card balance during conversion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'provider_card_conversion_user';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const { cardAccountId, facilityId } = await t.run(async (ctx) => {
      const now = Date.now();
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
        providerAccountId: 'provider_card',
        name: 'Provider card',
        accountType: 'CARD',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('accountBalances', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'closingBooked',
        amount: { amountMinor: -120_000n, currency: 'EUR' },
        referenceDate: '2026-07-15',
        fetchedAtMs: now,
      });
      const insertedFacilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Provider card facility',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'provider',
        linkedAccountId: accountId,
        provider: 'mock',
        limitAmount: { amountMinor: 250_000n, currency: 'EUR' },
        usedAmount: { amountMinor: 0n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { cardAccountId: accountId, facilityId: insertedFacilityId };
    });
    const before = await latestBalanceMinor(t, cardAccountId);

    await asUser.mutation(api.banking.credit.createInstallmentPlan, {
      creditFacilityId: facilityId,
      name: 'Provider-managed conversion',
      principalAmount: { amountMinor: 120_000n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 40_000n, currency: 'EUR' },
      installmentCount: 3,
      startDate: '2026-07-01',
      nextPaymentDate: '2026-08-01',
    });

    expect(await latestBalanceMinor(t, cardAccountId)).toEqual(before);
  });

  test('recording a paid installment lowers residual and raises availability without touching the card balance', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    const t = createTest();
    const fixture = await convertManualStatement(t, 'manual_card_installment_payment_user');
    const beforeBalance = await latestBalanceMinor(t, fixture.cardAccountId);

    await fixture.asUser.mutation(api.banking.credit.recordInstallmentPayment, {
      installmentPlanId: fixture.installmentPlanId,
      amount: { amountMinor: 40_000n, currency: 'EUR' },
      paymentDate: '2026-08-01',
      scheduledDueDate: '2026-08-01',
    });

    const storedPlan = await t.run(async (ctx) =>
      ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId),
    );
    const facility = await listedFacility(t, fixture.asUser, fixture.facilityId);

    expect(storedPlan?.outstandingAmount.amountMinor).toBe(80_000n);
    expect(storedPlan?.remainingInstallments).toBe(2);
    expect(await latestBalanceMinor(t, fixture.cardAccountId)).toEqual(beforeBalance);
    expect(facility.usedAmount.amountMinor).toBe(0n);
    expect(facility.activeInstallmentOutstanding.amountMinor).toBe(80_000n);
    expect(facility.summary.availableAmount.amountMinor).toBe(170_000n);
  });

  test('the final expected installment absorbs a one-cent principal rounding remainder', async () => {
    const t = createTest();
    const fixture = await seedManualCard(t, 'manual_card_installment_rounding_user');
    const installmentPlanId = await fixture.asUser.mutation(api.banking.credit.createInstallmentPlan, {
      creditFacilityId: fixture.facilityId,
      name: 'August statement in 3 installments',
      principalAmount: { amountMinor: 39076n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 13025n, currency: 'EUR' },
      installmentCount: 3,
      startDate: '2026-09-05',
      nextPaymentDate: '2026-09-05',
    });

    await fixture.asUser.mutation(api.banking.credit.recordExpectedInstallmentPayment, { installmentPlanId });
    await fixture.asUser.mutation(api.banking.credit.recordExpectedInstallmentPayment, { installmentPlanId });
    await fixture.asUser.mutation(api.banking.credit.recordExpectedInstallmentPayment, { installmentPlanId });

    const stored = await t.run(async (ctx) => ({
      plan: await ctx.db.get('creditFacilityInstallmentPlans', installmentPlanId),
      payments: await ctx.db
        .query('creditFacilityInstallmentPayments')
        .withIndex('by_installmentPlanId_and_paymentDate', (q) => q.eq('installmentPlanId', installmentPlanId))
        .take(10),
    }));

    expect(stored.payments.map((payment) => payment.amount.amountMinor)).toEqual([13025n, 13025n, 13026n]);
    expect(stored.plan).toMatchObject({
      outstandingAmount: { amountMinor: 0n, currency: 'EUR' },
      remainingInstallments: 0,
      status: 'paid',
    });
  });

  test('a new manual card purchase after conversion occupies additional facility limit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    const t = createTest();
    const fixture = await convertManualStatement(t, 'manual_card_new_purchase_user');

    await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 25_000n, currency: 'EUR' },
      // Must not be after the fake "today": a future date would be scheduled and
      // occupy nothing until it comes due.
      bookingDate: '2026-07-15',
      description: 'Nuovo acquisto',
      classificationKind: 'expense',
    });

    const facility = await listedFacility(t, fixture.asUser, fixture.facilityId);
    expect((await latestBalanceMinor(t, fixture.cardAccountId)).amountMinor).toBe(-25_000n);
    expect(facility.usedAmount.amountMinor).toBe(25_000n);
    expect(facility.activeInstallmentOutstanding.amountMinor).toBe(120_000n);
    expect(facility.summary.availableAmount.amountMinor).toBe(105_000n);
  });

  test('links the checking debit that pays a card installment, since the card never pays itself', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    const t = createTest();
    const fixture = await convertManualStatementSettledFromChecking(t, 'card_installment_settlement_link_user');
    const transactionId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.checkingAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 40_000n, currency: 'EUR' },
      bookingDate: '2026-08-01',
      description: 'Rata Flexia',
      classificationKind: 'expense',
    });

    await fixture.asUser.mutation(api.banking.credit.confirmInstallmentPaymentTransaction, {
      installmentPlanId: fixture.installmentPlanId,
      transactionId,
      scheduledDueDate: '2026-08-01',
    });

    const storedPlan = await t.run(async (ctx) =>
      ctx.db.get('creditFacilityInstallmentPlans', fixture.installmentPlanId),
    );
    const linkedTransaction = await t.run(async (ctx) => ctx.db.get('transactions', transactionId));
    expect(storedPlan?.outstandingAmount.amountMinor).toBe(80_000n);
    expect(storedPlan?.remainingInstallments).toBe(2);
    // The debit repays card debt the Plan already counted, so it must not land in
    // a spending category a second time.
    expect(linkedTransaction?.classificationKind).toBe('internal');
  });

  test('suggests the settlement debit and never a card purchase as an installment payment', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    const t = createTest();
    const fixture = await convertManualStatementSettledFromChecking(t, 'card_installment_settlement_candidate_user');
    const settlementTransactionId = await fixture.asUser.mutation(
      api.banking.manualTransactions.createManualTransaction,
      {
        accountId: fixture.checkingAccountId,
        direction: 'DBIT',
        amount: { amountMinor: 40_000n, currency: 'EUR' },
        bookingDate: '2026-08-01',
        description: 'Rata Flexia',
        classificationKind: 'expense',
      },
    );
    await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 40_000n, currency: 'EUR' },
      bookingDate: '2026-08-01',
      description: 'Acquisto da 400 euro',
      classificationKind: 'expense',
    });

    const candidates = await fixture.asUser.query(api.banking.credit.listInstallmentPaymentCandidates, {});

    // Expected-instalment rows carry no transaction: only the matched ones are at stake here.
    const matchedTransactionIds = candidates.flatMap((candidate) =>
      candidate.kind === 'expected' ? [] : [candidate.transaction._id],
    );
    expect(matchedTransactionIds).toEqual([settlementTransactionId]);
  });

  test('a facility without installment plans keeps its existing availability', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    const t = createTest();
    const fixture = await seedManualCard(t, 'manual_card_without_installments_user');

    const facility = await listedFacility(t, fixture.asUser, fixture.facilityId);
    expect(facility.activeInstallmentPlanCount).toBe(0);
    expect(facility.activeInstallmentOutstanding.amountMinor).toBe(0n);
    expect(facility.usedAmount.amountMinor).toBe(120_000n);
    expect(facility.summary.availableAmount.amountMinor).toBe(130_000n);
  });
});
