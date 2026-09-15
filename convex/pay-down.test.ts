/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { makeFunctionReference } from 'convex/server';
import { describe, expect, test } from 'vitest';
import { components } from './_generated/api';
import { computePayoffPlan } from './analyst/proactive/debtPayoffCore';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/payDown.ts',
  './banking/creditMath.ts',
  './analyst/proactive/debtPayoffCore.ts',
  './lib/*.ts',
]);

type Overview = {
  facilities: Array<{
    facilityId: Id<'creditFacilities'>;
    name: string;
    currency: string;
    balanceMinor: bigint;
    annualRateBps: number;
    monthlyPaymentMinor: bigint;
    payoffMonths: number;
    debtFreeDate: string;
    totalInterestMinor: bigint;
    schedule: Array<{
      monthIndex: number;
      balanceMinor: bigint;
      interestMinor: bigint;
      principalMinor: bigint;
    }>;
  }>;
  needsSetup: Array<{
    facilityId: Id<'creditFacilities'>;
    name: string;
    currency: string;
    missing: Array<'rate' | 'payment'>;
  }>;
  debtFreeDate: string | null;
  totalsByCurrency: Array<{
    currency: string;
    balanceMinor: bigint;
    monthlyPaymentMinor: bigint;
    totalInterestMinor: bigint;
    payoffMonths: number;
    debtFreeDate: string;
  }>;
};

type Simulation = {
  strategy: 'avalanche' | 'snowball' | 'planned';
  currencies: Array<{
    currency: string;
    baseline: {
      payoffMonths: number;
      debtFreeDate: string;
      totalInterestMinor: bigint;
      interestSavedMinor: bigint;
    };
    simulated: {
      payoffMonths: number;
      debtFreeDate: string;
      totalInterestMinor: bigint;
      interestSavedMinor: bigint;
    };
  }>;
  needsSetup: Overview['needsSetup'];
};

const getPayDownOverview = makeFunctionReference<'query', Record<string, never>, Overview>(
  'banking/payDown:getPayDownOverview',
);
const simulatePayoff = makeFunctionReference<
  'query',
  {
    extraMonthlyMinor?: bigint;
    lumpSumMinor?: bigint;
    strategy: 'avalanche' | 'snowball' | 'planned';
  },
  Simulation
>('banking/payDown:simulatePayoff');

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

async function seedFacility(
  t: TestHarness,
  userId: string,
  options: {
    name?: string;
    annualRateBps?: number;
    withPlan?: boolean;
    balanceMinor?: bigint;
    paymentMinor?: bigint;
  } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 0, 1);
    const facilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: options.name ?? 'Personal loan',
      facilityType: 'installmentCredit',
      status: 'active',
      source: 'manual',
      provider: 'manual',
      limitAmount: { amountMinor: options.balanceMinor ?? 100000n, currency: 'EUR' },
      usedAmount: { amountMinor: options.balanceMinor ?? 100000n, currency: 'EUR' },
      repaymentType: 'installmentPlan',
      annualNominalRateBps: options.annualRateBps,
      createdAtMs: now,
      updatedAtMs: now,
    });
    let planId: Id<'creditFacilityInstallmentPlans'> | null = null;
    if (options.withPlan !== false) {
      planId = await ctx.db.insert('creditFacilityInstallmentPlans', {
        userId,
        creditFacilityId: facilityId,
        name: 'Main plan',
        principalAmount: { amountMinor: options.balanceMinor ?? 100000n, currency: 'EUR' },
        outstandingAmount: { amountMinor: options.balanceMinor ?? 100000n, currency: 'EUR' },
        monthlyPaymentAmount: { amountMinor: options.paymentMinor ?? 10000n, currency: 'EUR' },
        installmentCount: 12,
        remainingInstallments: 12,
        startDate: '2026-01-01',
        nextPaymentDate: '2026-02-01',
        endDate: '2027-01-01',
        status: 'active',
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
    return { facilityId, planId };
  });
}

describe('pay-down queries', () => {
  test('returns configured facilities, schedule, currency totals, and setup gaps', async () => {
    const t = createTest();
    const userId = 'pay_down_overview_user';
    await seedAuthKitUser(t, userId);
    const configured = await seedFacility(t, userId, { annualRateBps: 1200 });
    const missingRate = await seedFacility(t, userId, { name: 'Missing rate', withPlan: true });
    const missingPayment = await seedFacility(t, userId, {
      name: 'Missing payment',
      annualRateBps: 900,
      withPlan: false,
    });

    const overview = await t.withIdentity({ subject: userId }).query(getPayDownOverview, {});

    expect(overview.facilities).toHaveLength(1);
    expect(overview.facilities[0]).toMatchObject({
      facilityId: configured.facilityId,
      name: 'Personal loan',
      currency: 'EUR',
      balanceMinor: 100000n,
      annualRateBps: 1200,
      monthlyPaymentMinor: 10000n,
    });
    expect(overview.facilities[0].schedule.length).toBeGreaterThan(0);
    expect(overview.facilities[0].schedule.length).toBeLessThanOrEqual(120);
    expect(overview.needsSetup).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ facilityId: missingRate.facilityId, missing: ['rate'] }),
        expect.objectContaining({ facilityId: missingPayment.facilityId, missing: ['payment'] }),
      ]),
    );
    expect(overview.totalsByCurrency).toMatchObject([
      {
        currency: 'EUR',
        balanceMinor: 100000n,
        monthlyPaymentMinor: 10000n,
      },
    ]);
    expect(overview.debtFreeDate).toBe(overview.facilities[0].debtFreeDate);
  });

  test('matches the Analyst debt engine for identical mapped facility input', async () => {
    const t = createTest();
    const userId = 'pay_down_golden_user';
    await seedAuthKitUser(t, userId);
    const fixture = await seedFacility(t, userId, {
      annualRateBps: 1800,
      balanceMinor: 75000n,
      paymentMinor: 7500n,
    });

    const overview = await t.withIdentity({ subject: userId }).query(getPayDownOverview, {});
    expect(fixture.planId).not.toBeNull();
    const direct = computePayoffPlan({
      debts: [
        {
          id: fixture.planId ?? 'missing-plan',
          name: 'Personal loan: Main plan',
          balanceMinor: 75000n,
          annualRateBps: 1800,
          minimumPaymentMinor: 7500n,
          currency: 'EUR',
        },
      ],
      extraPaymentMinor: 0n,
      strategy: 'avalanche',
    });

    expect(overview.facilities[0].payoffMonths).toBe(direct.months);
    expect(overview.facilities[0].totalInterestMinor).toBe(direct.totalInterestMinor);
    expect(overview.facilities[0].schedule).toEqual(
      direct.schedule.slice(0, 120).map((row) => ({
        monthIndex: row.month,
        balanceMinor: row.closingBalanceMinor,
        interestMinor: row.interestMinor,
        principalMinor: row.paidMinor > row.interestMinor ? row.paidMinor - row.interestMinor : 0n,
      })),
    );
  });

  test('simulates extra monthly payments and lump sums with lower payoff time and interest', async () => {
    const t = createTest();
    const userId = 'pay_down_simulation_user';
    await seedAuthKitUser(t, userId);
    await seedFacility(t, userId, {
      annualRateBps: 2400,
      balanceMinor: 200000n,
      paymentMinor: 8000n,
    });

    const simulation = await t.withIdentity({ subject: userId }).query(simulatePayoff, {
      strategy: 'avalanche',
      extraMonthlyMinor: 4000n,
      lumpSumMinor: 20000n,
    });

    expect(simulation.currencies).toHaveLength(1);
    expect(simulation.currencies[0].simulated.payoffMonths).toBeLessThan(
      simulation.currencies[0].baseline.payoffMonths,
    );
    expect(simulation.currencies[0].simulated.totalInterestMinor).toBeLessThan(
      simulation.currencies[0].baseline.totalInterestMinor,
    );
    expect(simulation.currencies[0].simulated.interestSavedMinor).toBeGreaterThan(0n);
  });

  test('requires authentication', async () => {
    const t = createTest();

    await expect(t.query(getPayDownOverview, {})).rejects.toThrow('Unauthorized');
    await expect(t.query(simulatePayoff, { strategy: 'planned' })).rejects.toThrow('Unauthorized');
  });
});
