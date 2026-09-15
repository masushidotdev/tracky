/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { components } from '../_generated/api';
import schema from '../schema';
import { EXTRA_SAVINGS_ACCOUNT_ID, projectForecast } from './forecastCore';
import type { Id } from '../_generated/dataModel';
import type { ForecastParams, ForecastResult } from './forecastCore';

const START_DATE = '2026-01-01';
const START_YEAR = 2026;
const BIRTH_YEAR = 1990;

function params(overrides: Partial<ForecastParams> = {}): ForecastParams {
  return {
    currency: 'EUR',
    birthYear: BIRTH_YEAR,
    endAge: 40,
    inflationAnnualPct: 0,
    accounts: [],
    incomeSources: [],
    livingExpenses: { monthlyMinor: 0n, change: 'fixed' },
    extraSavings: { growthAnnualPct: 0, splits: [] },
    withdrawal: { capitalGainsTaxPct: 26 },
    events: [],
    ...overrides,
  };
}

function checkpoint(result: ForecastResult, calendarYear: number) {
  const value = result.yearly.find((item) => item.calendarYear === calendarYear);
  expect(value, `Missing checkpoint for ${calendarYear}`).toBeDefined();
  return value!;
}

function balance(result: ForecastResult, calendarYear: number, accountId: string) {
  return checkpoint(result, calendarYear).accounts.find((account) => account.id === accountId)?.endBalanceMinor;
}

describe('forecast life events engine', () => {
  test('retirement changes income and expenses from January and stops contributions', () => {
    const result = projectForecast(
      params({
        endAge: 38,
        accounts: [
          {
            id: 'investments',
            kind: 'investment',
            balanceMinor: 0n,
            growthAnnualPct: 0,
            contributionYearlyMinor: 1_200n,
          },
        ],
        incomeSources: [{ id: 'salary', name: 'Salary', monthlyMinor: 1_000n, change: 'fixed' }],
        livingExpenses: { monthlyMinor: 500n, change: 'fixed' },
        events: [
          {
            kind: 'retirement',
            age: 37,
            expensePct: 50,
            extraYearlyExpensesMinor: 1_200n,
            incomeReductionPct: 100,
          },
        ],
      }),
      { startDate: START_DATE },
    );

    expect(checkpoint(result, 2026)).toMatchObject({
      annualIncomeMinor: 12_000n,
      annualExpensesMinor: 6_000n,
    });
    expect(checkpoint(result, 2027)).toMatchObject({
      annualIncomeMinor: 0n,
      annualExpensesMinor: 4_200n,
    });
    expect(balance(result, 2026, 'investments')).toBe(1_200n);
    expect(balance(result, 2027, 'investments')).toBe(1_200n);
    expect(result.retirement).toMatchObject({ age: 37, monthIndex: 12 });
  });

  test('pension adds an inflation-linked income source at its start age', () => {
    const result = projectForecast(
      params({
        endAge: 38,
        events: [{ kind: 'pension', startAge: 37, monthlyBenefitMinor: 100n }],
      }),
      { startDate: START_DATE },
    );

    expect(checkpoint(result, 2026).annualIncomeMinor).toBe(0n);
    expect(checkpoint(result, 2027).annualIncomeMinor).toBe(1_200n);
    expect(result.events).toContainEqual({ monthIndex: 12, kind: 'pension', label: 'pension 2027' });
  });

  test('financed home creates a growing asset and fully amortized synthetic mortgage', () => {
    const result = projectForecast(
      params({
        endAge: 37,
        inflationAnnualPct: 3,
        accounts: [{ id: 'cash', kind: 'cash', balanceMinor: 2_000_000n, growthAnnualPct: 0 }],
        events: [
          {
            kind: 'buyHome',
            year: START_YEAR,
            priceMinor: 1_000_000n,
            mode: 'finance',
            downPaymentMinor: 200_000n,
            mortgageYears: 1,
            mortgageRateBps: 500,
            recurringCostsAnnualPct: 1,
          },
        ],
      }),
      { startDate: START_DATE },
    );

    expect(balance(result, 2026, 'event:0:mortgage')).toBe(0n);
    expect(balance(result, 2026, 'event:0:home')).toBeGreaterThan(1_029_900n);
    expect(result.liabilities).toContainEqual({
      id: 'event:0:mortgage',
      payoffMonthIndex: 11,
      negativeAmortization: false,
    });
    expect(checkpoint(result, 2026).annualExpensesMinor).toBeGreaterThan(1_010_000n);
    expect(balance(result, 2026, 'cash')).toBeLessThan(1_000_000n);
  });

  test('cash home purchase withdraws the full price and records the home asset', () => {
    const result = projectForecast(
      params({
        endAge: 37,
        accounts: [{ id: 'cash', kind: 'cash', balanceMinor: 2_000_000n, growthAnnualPct: 0 }],
        events: [{ kind: 'buyHome', year: START_YEAR, priceMinor: 1_000_000n, mode: 'cash' }],
      }),
      { startDate: START_DATE },
    );

    expect(balance(result, 2026, 'cash')).toBe(1_000_000n);
    expect(balance(result, 2026, 'event:0:home')).toBe(1_000_000n);
    expect(checkpoint(result, 2026).annualExpensesMinor).toBe(1_000_000n);
  });

  test('child costs stop after the configured support window', () => {
    const result = projectForecast(
      params({
        endAge: 39,
        events: [{ kind: 'haveKid', year: 2027, monthlyCostMinor: 100n, untilAge: 1 }],
      }),
      { startDate: START_DATE },
    );

    expect(checkpoint(result, 2026).annualExpensesMinor).toBe(0n);
    expect(checkpoint(result, 2027).annualExpensesMinor).toBe(1_200n);
    expect(checkpoint(result, 2028).annualExpensesMinor).toBe(0n);
  });

  test('career break reduces income temporarily and pauses contributions', () => {
    const result = projectForecast(
      params({
        endAge: 39,
        accounts: [
          {
            id: 'investments',
            kind: 'investment',
            balanceMinor: 0n,
            growthAnnualPct: 0,
            contributionYearlyMinor: 1_200n,
          },
        ],
        incomeSources: [{ id: 'salary', name: 'Salary', monthlyMinor: 1_000n, change: 'fixed' }],
        events: [{ kind: 'careerBreak', startYear: 2027, endYear: 2028, incomeReductionPct: 100 }],
      }),
      { startDate: START_DATE },
    );

    expect(checkpoint(result, 2026).annualIncomeMinor).toBe(12_000n);
    expect(checkpoint(result, 2027).annualIncomeMinor).toBe(0n);
    expect(checkpoint(result, 2028).annualIncomeMinor).toBe(12_000n);
    expect(balance(result, 2026, 'investments')).toBe(1_200n);
    expect(balance(result, 2027, 'investments')).toBe(1_200n);
    expect(balance(result, 2028, 'investments')).toBe(2_400n);
  });

  test('new job replaces every existing income source', () => {
    const result = projectForecast(
      params({
        endAge: 38,
        incomeSources: [
          { id: 'salary', name: 'Salary', monthlyMinor: 1_000n, change: 'fixed' },
          { id: 'side', name: 'Side work', monthlyMinor: 250n, change: 'fixed' },
        ],
        events: [{ kind: 'newJob', year: 2027, newMonthlyIncomeMinor: 2_000n }],
      }),
      { startDate: START_DATE },
    );

    expect(checkpoint(result, 2026).annualIncomeMinor).toBe(15_000n);
    expect(checkpoint(result, 2027).annualIncomeMinor).toBe(24_000n);
  });

  test('other income and expenses use January lump sums with recurring intervals', () => {
    const result = projectForecast(
      params({
        endAge: 41,
        accounts: [{ id: 'cash', kind: 'cash', balanceMinor: 10_000n, growthAnnualPct: 0 }],
        events: [
          { kind: 'otherExpense', startYear: 2026, amountMinor: 1_200n },
          {
            kind: 'otherExpense',
            startYear: 2026,
            amountMinor: 600n,
            recurring: { intervalYears: 2, endYear: 2030 },
          },
          {
            kind: 'otherIncome',
            startYear: 2027,
            amountMinor: 300n,
            recurring: { intervalYears: 2, endYear: 2029 },
          },
        ],
      }),
      { startDate: START_DATE },
    );

    expect(checkpoint(result, 2026).annualExpensesMinor).toBe(1_800n);
    expect(checkpoint(result, 2027).annualIncomeMinor).toBe(300n);
    expect(checkpoint(result, 2028).annualExpensesMinor).toBe(600n);
    expect(checkpoint(result, 2029).annualIncomeMinor).toBe(300n);
    expect(checkpoint(result, 2030).annualExpensesMinor).toBe(600n);
  });

  test('end of plan truncates the horizon at the January age boundary', () => {
    const result = projectForecast(params({ endAge: 50, events: [{ kind: 'endOfPlan', age: 38 }] }), {
      startDate: START_DATE,
    });

    expect(result.yearly).toHaveLength(2);
    expect(result.yearly.at(-1)?.date).toBe('2027-12-31');
    expect(result.assumptions.endAge).toBe(38);
    expect(result.events).toEqual([{ monthIndex: 24, kind: 'endOfPlan', label: 'endOfPlan 2028' }]);
  });

  test('inflates a ten-years-out event from today money', () => {
    const amountMinor = 1_000_000n;
    const result = projectForecast(
      params({
        endAge: 47,
        inflationAnnualPct: 3,
        accounts: [{ id: 'cash', kind: 'cash', balanceMinor: 2_000_000n, growthAnnualPct: 0 }],
        events: [{ kind: 'otherExpense', startYear: 2036, amountMinor }],
      }),
      { startDate: START_DATE },
    );
    const expectedMinor = BigInt(Math.round(Number(amountMinor) * 1.03 ** 10));
    const actualMinor = checkpoint(result, 2036).annualExpensesMinor;

    expect(actualMinor).toBeGreaterThanOrEqual(expectedMinor - 20n);
    expect(actualMinor).toBeLessThanOrEqual(expectedMinor + 20n);
  });

  test('preserves insertion order for multiple same-kind events', () => {
    const result = projectForecast(
      params({
        endAge: 37,
        events: [
          { kind: 'otherIncome', startYear: 2026, amountMinor: 100n },
          { kind: 'otherIncome', startYear: 2026, amountMinor: 200n },
        ],
      }),
      { startDate: START_DATE },
    );

    expect(result.assumptions.events).toEqual([
      { kind: 'otherIncome', startYear: 2026, amountMinor: 100n },
      { kind: 'otherIncome', startYear: 2026, amountMinor: 200n },
    ]);
    expect(checkpoint(result, 2026).annualIncomeMinor).toBe(300n);
    expect(result.events).toHaveLength(2);
  });

  test('is deterministic across repeated mixed-event runs', () => {
    const input = params({
      endAge: 40,
      inflationAnnualPct: 3,
      accounts: [{ id: 'cash', kind: 'cash', balanceMinor: 5_000_000n, growthAnnualPct: 1 }],
      incomeSources: [{ id: 'salary', name: 'Salary', monthlyMinor: 200_000n, change: 'inflation' }],
      livingExpenses: { monthlyMinor: 100_000n, change: 'inflation' },
      events: [
        { kind: 'haveKid', year: 2027, monthlyCostMinor: 30_000n, untilAge: 2 },
        { kind: 'pension', startAge: 39, monthlyBenefitMinor: 20_000n },
        { kind: 'newJob', year: 2028, newMonthlyIncomeMinor: 250_000n },
        { kind: 'otherExpense', startYear: 2029, amountMinor: 100_000n },
      ],
    });

    expect(projectForecast(input, { startDate: START_DATE })).toEqual(
      projectForecast(input, { startDate: START_DATE }),
    );
  });

  test('rejects invalid event parameters during normalization', () => {
    expect(() =>
      projectForecast(
        params({
          events: [
            {
              kind: 'buyHome',
              year: 2027,
              priceMinor: 1_000_000n,
              mode: 'finance',
            },
          ],
        }),
        { startDate: START_DATE },
      ),
    ).toThrow(/requires downPaymentMinor, mortgageYears, and mortgageRateBps/);
    expect(() =>
      projectForecast(params({ events: [{ kind: 'otherExpense', startYear: 2025, amountMinor: 100n }] }), {
        startDate: START_DATE,
      }),
    ).toThrow(/cannot be in the past/);
  });
});

const discoveredModules = import.meta.glob([
  '../_generated/*.js',
  '../auth.ts',
  '../authProfiles.ts',
  '../lib/*.ts',
  './projection.ts',
  './forecastCore.ts',
  './liabilityMath.ts',
  './projectionMath.ts',
]);
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, loader]) => [
    path.startsWith('../') ? `./${path.slice(3)}` : `./forecast/${path.slice(2)}`,
    loader,
  ]),
);

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

type ProjectionSuccess = {
  projection: ForecastResult;
  events: ForecastResult['events'];
  invalidEvents: Array<{ eventId: Id<'forecastLifeEvents'>; reason: string }>;
};
type ProjectionResult = { upgradeRequired: true } | { needsOnboarding: true } | ProjectionSuccess;
const getProjection = makeFunctionReference<'query', { scenarioId: Id<'forecastScenarios'> }, ProjectionResult>(
  'forecast/projection:getProjection',
);

async function seedAuthUser(t: ReturnType<typeof convexTest>, userId: string) {
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
        firstName: 'Forecast',
        lastName: 'Events',
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

describe('forecast life events projection wiring', () => {
  test('passes valid stored events and reports invalid stored events without failing', async () => {
    const t = convexTest(schema, modules);
    workOSAuthKitTest.register(t);
    const userId = 'forecast_event_projection_user';
    await seedAuthUser(t, userId);
    const currentYear = new Date().getUTCFullYear();
    const scenarioId = await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('userSettings', {
        userId,
        planTier: 'pro',
        forecastProfile: {
          birthYear: currentYear - 30,
          defaultRetirementAge: 67,
          onboardingCompletedAtMs: now,
        },
        createdAtMs: now,
        updatedAtMs: now,
      });
      return await ctx.db.insert('forecastScenarios', {
        userId,
        name: 'Events',
        sortOrder: 0,
        currency: 'EUR',
        inflationAnnualPct: 0,
        endAge: 35,
        livingExpenses: {
          amountMonthly: { amountMinor: 0n, currency: 'EUR' },
          changeMode: 'fixed',
        },
        extraSavings: { growthAnnualPct: 0, splits: [] },
        capitalGainsTaxPct: 26,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });
    const { validId, invalidId } = await t.run(async (ctx) => {
      const now = Date.now();
      const insertedValidId = await ctx.db.insert('forecastLifeEvents', {
        userId,
        scenarioId,
        enabled: true,
        event: {
          kind: 'pension',
          startAge: 31,
          monthlyBenefit: { amountMinor: 100n, currency: 'EUR' },
        },
        createdAtMs: now,
        updatedAtMs: now,
      });
      const insertedInvalidId = await ctx.db.insert('forecastLifeEvents', {
        userId,
        scenarioId,
        enabled: true,
        event: {
          kind: 'otherExpense',
          startYear: currentYear - 1,
          amount: { amountMinor: 500n, currency: 'EUR' },
        },
        createdAtMs: now + 1,
        updatedAtMs: now + 1,
      });
      return { validId: insertedValidId, invalidId: insertedInvalidId };
    });

    const result = await t.withIdentity({ subject: userId }).query(getProjection, { scenarioId });
    expect('projection' in result).toBe(true);
    if (!('projection' in result)) throw new Error('Expected projection result');

    expect(result.events).toEqual([
      {
        monthIndex: 12 - (new Date().getUTCMonth() + 1) + 1,
        kind: 'pension',
        label: `pension ${currentYear + 1}`,
      },
    ]);
    expect(result.projection.events).toEqual(result.events);
    expect(result.projection.assumptions.events).toEqual([
      { kind: 'pension', startAge: 31, monthlyBenefitMinor: 100n },
    ]);
    expect(result.invalidEvents).toEqual([{ eventId: invalidId, reason: 'otherExpense start year is in the past' }]);
    expect(result.invalidEvents.some((event) => event.eventId === validId)).toBe(false);
    expect(result.projection.yearly.some((year) => year.annualIncomeMinor > 0n)).toBe(true);
    expect(
      result.projection.yearly.some((year) =>
        year.accounts.some((account) => account.id === EXTRA_SAVINGS_ACCOUNT_ID && account.endBalanceMinor > 0n),
      ),
    ).toBe(true);
  });
});
