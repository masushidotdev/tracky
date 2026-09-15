/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, components } from './_generated/api';
import schema from './schema';
import { insertPlannedTransfer } from './plannedTransactionsTestHelpers';

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

async function seedAccount(t: TestHarness, userId: string, options: { currency?: string; accountType?: string } = {}) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    return await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: `${userId}_${options.accountType ?? 'CACC'}_${options.currency ?? 'EUR'}`,
      name: 'Settlement account',
      accountType: options.accountType ?? 'CACC',
      currency: options.currency ?? 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

// Loan projections start from the next instalment that has not fallen due yet, so a moving "today"
// would move every payoff date these tests assert.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mortgages and loans', () => {
  test('creates a loan facility and amortisation plan atomically', async () => {
    const t = createTest();
    const userId = 'loan_create_user';
    await seedAuthKitUser(t, userId);
    const settlementAccountId = await seedAccount(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const result = await asUser.mutation(api.banking.loans.createLoanAccount, {
      name: 'Home mortgage',
      loanType: 'mortgage',
      currentBalance: { amountMinor: 14_191_112n, currency: 'EUR' },
      annualNominalRateBps: 370,
      minimumPaymentAmount: { amountMinor: 68_000n, currency: 'EUR' },
      settlementAccountId,
      firstPaymentDate: '2025-01-01',
    });
    const stored = await t.run(async (ctx) => ({
      facility: await ctx.db.get('creditFacilities', result.creditFacilityId),
      plan: await ctx.db.get('creditFacilityInstallmentPlans', result.installmentPlanId),
    }));

    expect(stored.facility).toMatchObject({
      name: 'Home mortgage',
      facilityType: 'mortgage',
      status: 'active',
      source: 'manual',
      provider: 'manual',
      limitAmount: { amountMinor: 14_191_112n, currency: 'EUR' },
      usedAmount: { amountMinor: 14_191_112n, currency: 'EUR' },
      minimumPaymentAmount: { amountMinor: 68_000n, currency: 'EUR' },
      settlementAccountId,
      firstPaymentDate: '2025-01-01',
      standardInstallmentMonths: 336,
      repaymentType: 'installmentPlan',
    });
    expect(stored.plan).toMatchObject({
      principalAmount: { amountMinor: 14_191_112n, currency: 'EUR' },
      outstandingAmount: { amountMinor: 14_191_112n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 68_000n, currency: 'EUR' },
      installmentCount: 336,
      remainingInstallments: 336,
      // The first payment given is in the past, so the schedule opens at the next one due.
      startDate: '2026-08-01',
      nextPaymentDate: '2026-08-01',
      endDate: '2054-07-01',
      status: 'active',
    });

    const listed = await asUser.query(api.banking.loans.listLoans, {});
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      _id: result.creditFacilityId,
      outstandingAmount: { amountMinor: 14_191_112n, currency: 'EUR' },
      // The stored first payment is in the past, so the curve starts at the next one still to come.
      payoffDate: '2054-07-01',
      payoffMonths: 336,
    });
    const creditFacilities = await asUser.query(api.banking.credit.listCreditFacilities, {});
    expect(creditFacilities[0]?.summary).toMatchObject({
      availableAmount: { amountMinor: 0n, currency: 'EUR' },
      utilizationPercent: 100,
      isOverLimit: false,
    });
  });

  test('creates an auto loan with its contractual final balloon and term', async () => {
    const t = createTest();
    const userId = 'loan_balloon_user';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const result = await asUser.mutation(api.banking.loans.createLoanAccount, {
      name: 'Acme auto financing',
      loanType: 'autoLoan',
      currentBalance: { amountMinor: 1_830_074n, currency: 'EUR' },
      annualNominalRateBps: 645,
      minimumPaymentAmount: { amountMinor: 38_441n, currency: 'EUR' },
      finalPaymentAmount: { amountMinor: 1_001_301n, currency: 'EUR' },
      firstPaymentDate: '2026-08-28',
    });
    const stored = await t.run(async (ctx) => ({
      facility: await ctx.db.get('creditFacilities', result.creditFacilityId),
      plan: await ctx.db.get('creditFacilityInstallmentPlans', result.installmentPlanId),
    }));

    expect(stored.facility).toMatchObject({
      finalPaymentAmount: { amountMinor: 1_001_301n, currency: 'EUR' },
      standardInstallmentMonths: 28,
    });
    expect(stored.plan).toMatchObject({
      installmentCount: 28,
      remainingInstallments: 28,
      endDate: '2028-11-28',
    });

    const overview = await asUser.query(api.banking.loans.getLoanOverview, {
      creditFacilityId: result.creditFacilityId,
    });
    expect(overview.payoffProjection).toMatchObject({ months: 28, payoffDate: '2028-11-28' });
    const listed = await asUser.query(api.banking.loans.listLoans, {});
    expect(listed[0]).toMatchObject({ payoffMonths: 28, payoffDate: '2028-11-28' });
  });

  test('rejects terms that never amortise and invalid settlement accounts', async () => {
    const t = createTest();
    const userId = 'loan_validation_user';
    await seedAuthKitUser(t, userId);
    const cardAccountId = await seedAccount(t, userId, { accountType: 'CARD' });
    const asUser = t.withIdentity({ subject: userId });
    const base = {
      name: 'Personal loan',
      loanType: 'personalLoan' as const,
      currentBalance: { amountMinor: 10_000_000n, currency: 'EUR' },
      annualNominalRateBps: 1_200,
      minimumPaymentAmount: { amountMinor: 90_000n, currency: 'EUR' },
      firstPaymentDate: '2026-08-01',
    };

    await expect(asUser.mutation(api.banking.loans.createLoanAccount, base)).rejects.toThrow(
      'The minimum payment does not amortise this loan within 600 months',
    );
    await expect(
      asUser.mutation(api.banking.loans.createLoanAccount, {
        ...base,
        finalPaymentAmount: { amountMinor: 0n, currency: 'EUR' },
      }),
    ).rejects.toThrow('Final payment amount must be greater than zero');
    await expect(
      asUser.mutation(api.banking.loans.createLoanAccount, {
        ...base,
        finalPaymentAmount: { amountMinor: 1_000_000n, currency: 'USD' },
      }),
    ).rejects.toThrow('Final payment amount currency must match the loan currency');
    await expect(
      asUser.mutation(api.banking.loans.createLoanAccount, {
        ...base,
        finalPaymentAmount: base.currentBalance,
      }),
    ).rejects.toThrow('Final payment amount must be less than the current loan balance');
    await expect(
      asUser.mutation(api.banking.loans.createLoanAccount, {
        ...base,
        annualNominalRateBps: 0,
        minimumPaymentAmount: { amountMinor: 100_000n, currency: 'EUR' },
        settlementAccountId: cardAccountId,
      }),
    ).rejects.toThrow('The settlement account must be a cash account, not a card');
  });

  test('counts loan principal once in net worth and returns negative sidebar debt', async () => {
    const t = createTest();
    const userId = 'loan_dashboard_sidebar_user';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const eurLoan = await asUser.mutation(api.banking.loans.createLoanAccount, {
      name: 'EUR personal loan',
      loanType: 'personalLoan',
      currentBalance: { amountMinor: 1_000_000n, currency: 'EUR' },
      annualNominalRateBps: 1_200,
      minimumPaymentAmount: { amountMinor: 100_000n, currency: 'EUR' },
      firstPaymentDate: '2026-08-01',
    });

    const dashboard = await asUser.query(api.banking.dashboard.getDashboardOverview, {});
    expect(dashboard.netWorth).toEqual([
      {
        cash: { amountMinor: 0n, currency: 'EUR' },
        debts: { amountMinor: 1_000_000n, currency: 'EUR' },
        netWorth: { amountMinor: -1_000_000n, currency: 'EUR' },
      },
    ]);

    await asUser.mutation(api.banking.loans.createLoanAccount, {
      name: 'USD auto loan',
      loanType: 'autoLoan',
      currentBalance: { amountMinor: 500_000n, currency: 'USD' },
      annualNominalRateBps: 0,
      minimumPaymentAmount: { amountMinor: 50_000n, currency: 'USD' },
      firstPaymentDate: '2026-08-01',
    });
    const sidebar = await asUser.query(api.banking.accounts.listSidebarAccounts, {});
    const loanGroup = sidebar.groups.find((group) => group.group === 'loan');

    expect(loanGroup?.total).toBeNull();
    expect(loanGroup?.rows).toEqual([
      {
        kind: 'loan',
        id: eurLoan.creditFacilityId,
        name: 'EUR personal loan',
        balance: { amountMinor: -1_000_000n, currency: 'EUR' },
        status: 'active',
      },
      {
        kind: 'loan',
        id: expect.any(String),
        name: 'USD auto loan',
        balance: { amountMinor: -500_000n, currency: 'USD' },
        status: 'active',
      },
    ]);
  });

  test('measures repayment against the original principal, not the balance entered today', async () => {
    const t = createTest();
    const userId = 'loan_principal_user';
    await seedAuthKitUser(t, userId);
    const settlementAccountId = await seedAccount(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    // Example figures for a mortgage: 155.260,00 borrowed, 141.593,30 still owed.
    const created = await asUser.mutation(api.banking.loans.createLoanAccount, {
      name: 'Mutuo',
      loanType: 'mortgage',
      currentBalance: { amountMinor: 14_159_330n, currency: 'EUR' },
      originalPrincipalAmount: { amountMinor: 15_526_000n, currency: 'EUR' },
      annualNominalRateBps: 300,
      minimumPaymentAmount: { amountMinor: 68_000n, currency: 'EUR' },
      settlementAccountId,
      firstPaymentDate: '2026-09-01',
    });

    const overview = await asUser.query(api.banking.loans.getLoanOverview, {
      creditFacilityId: created.creditFacilityId,
    });
    expect(overview.repaymentProgress).toEqual({
      originalPrincipalAmount: { amountMinor: 15_526_000n, currency: 'EUR' },
      repaidAmount: { amountMinor: 1_366_670n, currency: 'EUR' },
      outstandingAmount: { amountMinor: 14_159_330n, currency: 'EUR' },
      percent: 8.8,
    });
    const listed = await asUser.query(api.banking.loans.listLoans, {});
    expect(listed[0]?.repaymentProgress?.percent).toBe(8.8);

    // A balance the loan never reached would make the bar overflow its track.
    await expect(
      asUser.mutation(api.banking.loans.updateLoanTerms, {
        creditFacilityId: created.creditFacilityId,
        originalPrincipalAmount: { amountMinor: 10_000_000n, currency: 'EUR' },
      }),
    ).rejects.toThrow('Original principal amount cannot be lower than the current loan balance');

    await asUser.mutation(api.banking.loans.updateLoanTerms, {
      creditFacilityId: created.creditFacilityId,
      originalPrincipalAmount: null,
    });
    const cleared = await asUser.query(api.banking.loans.getLoanOverview, {
      creditFacilityId: created.creditFacilityId,
    });
    expect(cleared.repaymentProgress).toBeNull();
  });

  test('projects from the next instalment still to come and honours the contractual payoff date', async () => {
    const t = createTest();
    const userId = 'loan_maturity_user';
    await seedAuthKitUser(t, userId);
    const settlementAccountId = await seedAccount(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    // The example mortgage: 141.593,30 left at 3%, 680 a month, last instalment 01/11/2052. Amortising
    // it ourselves lands in 2051, because the lender fixed the capital schedule at the rate of 2022.
    const created = await asUser.mutation(api.banking.loans.createLoanAccount, {
      name: 'Mutuo',
      loanType: 'mortgage',
      currentBalance: { amountMinor: 14_159_330n, currency: 'EUR' },
      annualNominalRateBps: 300,
      minimumPaymentAmount: { amountMinor: 68_000n, currency: 'EUR' },
      settlementAccountId,
      // Deliberately stale: the mortgage has been running for years.
      firstPaymentDate: '2022-12-01',
      maturityDate: '2052-11-01',
    });

    const overview = await asUser.query(api.banking.loans.getLoanOverview, {
      creditFacilityId: created.creditFacilityId,
    });
    expect(overview.payoffProjection?.payoffDate).toBe('2052-11-01');
    // The curve opens on the balance actually owed, not on one that has already paid four years of
    // instalments that happened before today.
    expect(overview.payoffProjection?.series[0]).toMatchObject({ month: '2026-08' });
    expect(overview.payoffProjection?.series.at(-1)?.balanceMinor).toBe(0n);
    expect(overview.activePlan).toMatchObject({ endDate: '2052-11-01', remainingInstallments: 316 });

    // Clearing it hands the payoff date back to the projection.
    await asUser.mutation(api.banking.loans.updateLoanTerms, {
      creditFacilityId: created.creditFacilityId,
      maturityDate: null,
    });
    const estimated = await asUser.query(api.banking.loans.getLoanOverview, {
      creditFacilityId: created.creditFacilityId,
    });
    expect(estimated.payoffProjection?.payoffDate).toBe('2051-02-01');
  });

  test('reclassifies an installment contract reversibly without changing its schedule or payment history', async () => {
    const t = createTest();
    const userId = 'loan_reclassification_user';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const created = await asUser.mutation(api.banking.credit.createInstallmentCreditContract, {
      name: 'Acme auto financing',
      principalAmount: { amountMinor: 1_200_000n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 110_000n, currency: 'EUR' },
      installmentCount: 12,
      startDate: '2026-01-01',
      nextPaymentDate: '2026-02-01',
    });
    const paymentId = await asUser.mutation(api.banking.credit.recordInstallmentPayment, {
      installmentPlanId: created.installmentPlanId,
      amount: { amountMinor: 110_000n, currency: 'EUR' },
      principalAmount: { amountMinor: 100_000n, currency: 'EUR' },
      interestAmount: { amountMinor: 10_000n, currency: 'EUR' },
      paymentDate: '2026-02-01',
    });
    await t.run(async (ctx) => {
      await ctx.db.patch('creditFacilities', created.creditFacilityId, { annualNominalRateBps: 425 });
    });

    const before = await t.run(async (ctx) => ({
      plan: await ctx.db.get('creditFacilityInstallmentPlans', created.installmentPlanId),
      payment: await ctx.db.get('creditFacilityInstallmentPayments', paymentId),
    }));
    const dashboardBefore = await asUser.query(api.banking.dashboard.getDashboardOverview, {});
    expect(dashboardBefore.netWorth?.[0]?.debts).toEqual({ amountMinor: 1_210_000n, currency: 'EUR' });

    await asUser.mutation(api.banking.loans.reclassifyFacilityAsLoan, {
      creditFacilityId: created.creditFacilityId,
      loanType: 'autoLoan',
    });

    const after = await t.run(async (ctx) => ({
      facility: await ctx.db.get('creditFacilities', created.creditFacilityId),
      plan: await ctx.db.get('creditFacilityInstallmentPlans', created.installmentPlanId),
      payment: await ctx.db.get('creditFacilityInstallmentPayments', paymentId),
    }));
    expect(after.facility).toMatchObject({
      facilityType: 'autoLoan',
      usedAmount: { amountMinor: 1_100_000n, currency: 'EUR' },
      minimumPaymentAmount: { amountMinor: 110_000n, currency: 'EUR' },
      annualNominalRateBps: 425,
      // Inherited from the contract instead of asking the user to retype what was borrowed.
      originalPrincipalAmount: { amountMinor: 1_200_000n, currency: 'EUR' },
    });
    expect(after.plan).toEqual(before.plan);
    expect(after.payment).toEqual(before.payment);

    const dashboardAfter = await asUser.query(api.banking.dashboard.getDashboardOverview, {});
    expect(dashboardAfter.netWorth?.[0]?.debts).toEqual({ amountMinor: 1_100_000n, currency: 'EUR' });
    const listed = await asUser.query(api.banking.loans.listLoans, {});
    expect(listed.map((loan) => loan._id)).toEqual([created.creditFacilityId]);
    const sidebar = await asUser.query(api.banking.accounts.listSidebarAccounts, {});
    expect(sidebar.groups.find((group) => group.group === 'loan')?.rows).toMatchObject([
      { kind: 'loan', id: created.creditFacilityId, name: 'Acme auto financing' },
    ]);

    await asUser.mutation(api.banking.loans.reclassifyFacilityAsLoan, {
      creditFacilityId: created.creditFacilityId,
      loanType: 'personalLoan',
      minimumPaymentAmount: { amountMinor: 120_000n, currency: 'EUR' },
      annualNominalRateBps: 500,
    });
    await asUser.mutation(api.banking.loans.reclassifyLoanAsInstallmentContract, {
      creditFacilityId: created.creditFacilityId,
    });
    await asUser.mutation(api.banking.loans.reclassifyLoanAsInstallmentContract, {
      creditFacilityId: created.creditFacilityId,
    });

    const restored = await t.run(async (ctx) => ({
      facility: await ctx.db.get('creditFacilities', created.creditFacilityId),
      plan: await ctx.db.get('creditFacilityInstallmentPlans', created.installmentPlanId),
      payment: await ctx.db.get('creditFacilityInstallmentPayments', paymentId),
    }));
    expect(restored.facility).toMatchObject({
      facilityType: 'installmentCredit',
      minimumPaymentAmount: { amountMinor: 120_000n, currency: 'EUR' },
      annualNominalRateBps: 500,
    });
    expect(restored.plan).toEqual(before.plan);
    expect(restored.payment).toEqual(before.payment);
    const dashboardRestored = await asUser.query(api.banking.dashboard.getDashboardOverview, {});
    expect(dashboardRestored.netWorth?.[0]?.debts).toEqual({ amountMinor: 1_210_000n, currency: 'EUR' });
  });

  test('recomputes terms and records signed balance adjustments before changing counters', async () => {
    const t = createTest();
    const userId = 'loan_update_user';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const created = await asUser.mutation(api.banking.loans.createLoanAccount, {
      name: 'Car loan',
      loanType: 'autoLoan',
      currentBalance: { amountMinor: 1_200_000n, currency: 'EUR' },
      annualNominalRateBps: 0,
      minimumPaymentAmount: { amountMinor: 100_000n, currency: 'EUR' },
      firstPaymentDate: '2026-08-01',
    });

    await asUser.mutation(api.banking.loans.updateLoanTerms, {
      creditFacilityId: created.creditFacilityId,
      name: 'Updated car loan',
      annualNominalRateBps: 300,
      minimumPaymentAmount: { amountMinor: 120_000n, currency: 'EUR' },
      escrowAmount: { amountMinor: 5_000n, currency: 'EUR' },
    });
    const reduced = await asUser.mutation(api.banking.loans.updateLoanBalance, {
      creditFacilityId: created.creditFacilityId,
      currentBalance: { amountMinor: 900_000n, currency: 'EUR' },
      adjustmentDate: '2026-07-15',
      notes: 'Lender balance correction',
    });
    const increased = await asUser.mutation(api.banking.loans.updateLoanBalance, {
      creditFacilityId: created.creditFacilityId,
      currentBalance: { amountMinor: 950_000n, currency: 'EUR' },
      adjustmentDate: '2026-07-16',
    });
    const stored = await t.run(async (ctx) => ({
      facility: await ctx.db.get('creditFacilities', created.creditFacilityId),
      plan: await ctx.db.get('creditFacilityInstallmentPlans', created.installmentPlanId),
      reduced: reduced.adjustmentPaymentId
        ? await ctx.db.get('creditFacilityInstallmentPayments', reduced.adjustmentPaymentId)
        : null,
      increased: increased.adjustmentPaymentId
        ? await ctx.db.get('creditFacilityInstallmentPayments', increased.adjustmentPaymentId)
        : null,
    }));

    expect(stored.facility).toMatchObject({
      name: 'Updated car loan',
      usedAmount: { amountMinor: 950_000n, currency: 'EUR' },
      annualNominalRateBps: 300,
      minimumPaymentAmount: { amountMinor: 120_000n, currency: 'EUR' },
      escrowAmount: { amountMinor: 5_000n, currency: 'EUR' },
    });
    expect(stored.plan).toMatchObject({
      name: 'Updated car loan',
      outstandingAmount: { amountMinor: 950_000n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 120_000n, currency: 'EUR' },
      remainingInstallments: 9,
      endDate: '2027-04-01',
    });
    expect(stored.reduced).toMatchObject({
      amount: { amountMinor: 300_000n, currency: 'EUR' },
      principalAmount: { amountMinor: 300_000n, currency: 'EUR' },
      paymentDate: '2026-07-15',
      notes: 'Lender balance correction',
    });
    expect(stored.increased).toMatchObject({
      amount: { amountMinor: -50_000n, currency: 'EUR' },
      principalAmount: { amountMinor: -50_000n, currency: 'EUR' },
      paymentDate: '2026-07-16',
      notes: 'Loan balance adjustment',
    });

    const overview = await asUser.query(api.banking.loans.getLoanOverview, {
      creditFacilityId: created.creditFacilityId,
    });
    expect(overview.paymentsByMonth).toHaveLength(1);
    expect(overview.paymentsByMonth[0]).toMatchObject({
      month: '2026-07',
      amount: { amountMinor: 250_000n, currency: 'EUR' },
      principalAmount: { amountMinor: 250_000n, currency: 'EUR' },
    });
    expect(overview.paymentsByMonth[0].payments).toHaveLength(2);
  });
});

describe('deleting a loan', () => {
  test('leaves nothing pointing at the facility or its plan', async () => {
    const t = createTest();
    const userId = 'loan_delete_cascade_user';
    await seedAuthKitUser(t, userId);
    const settlementAccountId = await seedAccount(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const { creditFacilityId, installmentPlanId } = await asUser.mutation(api.banking.loans.createLoanAccount, {
      name: 'Car loan',
      loanType: 'autoLoan',
      currentBalance: { amountMinor: 1_830_074n, currency: 'EUR' },
      annualNominalRateBps: 645,
      minimumPaymentAmount: { amountMinor: 38_441n, currency: 'EUR' },
      settlementAccountId,
      firstPaymentDate: '2026-08-28',
    });

    // Everything that can point at a loan, planted before the delete so the sweep has to find it.
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('creditFacilityInstallmentPayments', {
        userId,
        creditFacilityId,
        installmentPlanId,
        amount: { amountMinor: 38_441n, currency: 'EUR' },
        paymentDate: '2026-08-28',
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId,
        cycleMonth: '2026-08',
        status: 'open',
        trackedAmount: { amountMinor: 0n, currency: 'EUR' },
        dueDate: '2026-09-01',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const scenarioId = await ctx.db.insert('forecastScenarios', {
        userId,
        name: 'Base',
        currency: 'EUR',
        sortOrder: 0,
        inflationAnnualPct: 2,
        endAge: 90,
        livingExpenses: { amountMonthly: { amountMinor: 100_000n, currency: 'EUR' }, changeMode: 'inflation' },
        extraSavings: { growthAnnualPct: 0, splits: [] },
        capitalGainsTaxPct: 26,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('forecastAccountAssumptions', {
        userId,
        scenarioId,
        target: { kind: 'creditFacility', creditFacilityId },
        included: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await insertPlannedTransfer(ctx, {
        userId,
        fromCreditFacilityId: creditFacilityId,
        toAccountId: settlementAccountId,
        name: 'Repayment',
        amount: { amountMinor: 38_441n, currency: 'EUR' },
        scheduledDate: '2026-09-28',
        status: 'planned',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await asUser.mutation(api.banking.loans.deleteLoan, { creditFacilityId });

    const leftovers = await t.run(async (ctx) => ({
      facility: await ctx.db.get('creditFacilities', creditFacilityId),
      plans: (await ctx.db.query('creditFacilityInstallmentPlans').collect()).filter(
        (row) => row.creditFacilityId === creditFacilityId,
      ),
      payments: (await ctx.db.query('creditFacilityInstallmentPayments').collect()).filter(
        (row) => row.creditFacilityId === creditFacilityId,
      ),
      cycles: (await ctx.db.query('creditFacilityUsageCycles').collect()).filter(
        (row) => row.creditFacilityId === creditFacilityId,
      ),
      assumptions: (await ctx.db.query('forecastAccountAssumptions').collect()).filter(
        (row) => row.target.kind === 'creditFacility' && row.target.creditFacilityId === creditFacilityId,
      ),
      transfersStillLinked: (await ctx.db.query('plannedTransactions').collect()).filter(
        (row) => row.fromCreditFacilityId === creditFacilityId,
      ),
      transfersKept: (await ctx.db.query('plannedTransactions').collect()).length,
      bucketsStillLinked: (await ctx.db.query('planBuckets').collect()).filter(
        (row) => row.installmentPlanId === installmentPlanId,
      ),
    }));

    expect(leftovers.facility).toBeNull();
    expect(leftovers.plans).toHaveLength(0);
    expect(leftovers.payments).toHaveLength(0);
    expect(leftovers.cycles).toHaveLength(0);
    expect(leftovers.assumptions).toHaveLength(0);
    expect(leftovers.bucketsStillLinked).toHaveLength(0);
    // The planned transfer itself is the user's, only its link to the dead facility goes.
    expect(leftovers.transfersStillLinked).toHaveLength(0);
    expect(leftovers.transfersKept).toBe(1);
  });
});
