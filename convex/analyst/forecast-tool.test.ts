/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import schema from '../schema';
import { analystProactiveTools, analystTools } from './tools';
import { executeGetForecast, forecastInputSchema } from './tools/forecast';
import type { Id } from '../_generated/dataModel';
import type { ToolCtx } from '@convex-dev/agent';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const discoveredModules = import.meta.glob([
  '../_generated/*.js',
  '../auth.ts',
  '../authProfiles.ts',
  '../lib/*.ts',
  '../forecast/projection.ts',
  '../forecast/forecastCore.ts',
  '../forecast/liabilityMath.ts',
  '../forecast/projectionMath.ts',
]);
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, loader]) => [`./${path.slice(3)}`, loader]),
);

function createTest() {
  return convexTest(schema, modules);
}

type TestHarness = ReturnType<typeof createTest>;

function toolCtx(t: TestHarness, userId: string): ToolCtx {
  const runQuery = t.query.bind(t) as ToolCtx['runQuery'];
  return { userId, runQuery } as ToolCtx;
}

async function seedProProfile(t: TestHarness, userId: string) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert('userSettings', {
      userId,
      planTier: 'pro',
      forecastProfile: {
        birthYear: new Date().getUTCFullYear() - 30,
        defaultRetirementAge: 67,
        onboardingCompletedAtMs: now,
      },
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedScenario(t: TestHarness, userId: string) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const scenarioId = await ctx.db.insert('forecastScenarios', {
      userId,
      name: 'Base',
      sortOrder: 0,
      currency: 'EUR',
      inflationAnnualPct: 2,
      endAge: 90,
      livingExpenses: { amountMonthly: { amountMinor: 50_000n, currency: 'EUR' }, changeMode: 'inflation' },
      extraSavings: { growthAnnualPct: 3, splits: [] },
      capitalGainsTaxPct: 26,
      createdAtMs: now,
      updatedAtMs: now,
    });
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
      providerAccountId: `forecast_${userId}`,
      name: 'Checking',
      accountType: 'CACC',
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
      amount: { amountMinor: 100_000n, currency: 'EUR' },
      fetchedAtMs: now,
    });
    await ctx.db.insert('forecastAccountAssumptions', {
      userId,
      scenarioId,
      target: { kind: 'account', accountId },
      included: true,
      growthAnnualPct: 0,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('forecastIncomeSources', {
      userId,
      scenarioId,
      name: 'Salary',
      amountMonthly: { amountMinor: 100_000n, currency: 'EUR' },
      changeMode: 'fixed',
      sortOrder: 0,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const eventId = await ctx.db.insert('forecastLifeEvents', {
      userId,
      scenarioId,
      enabled: true,
      event: {
        kind: 'otherExpense',
        startYear: new Date().getUTCFullYear() + 1,
        amount: { amountMinor: 25_000n, currency: 'EUR' },
      },
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { scenarioId, accountId, eventId };
  });
}

describe('getForecast tool', () => {
  test('is interactive-only', () => {
    expect(analystTools).toHaveProperty('getForecast');
    expect(analystProactiveTools).not.toHaveProperty('getForecast');
  });

  test('returns a friendly upgrade response before reading projections for free users', async () => {
    const runQuery = vi.fn();
    const ctx = { userId: 'forecast_free_user', runQuery } as unknown as ToolCtx;

    const result = await executeGetForecast(ctx, forecastInputSchema.parse({}), {
      isAllowed: () => Promise.resolve(false),
    });

    expect(result).toEqual({
      upgradeRequired: true,
      needsOnboarding: false,
      feature: 'analyst.longTermProjection',
      message: 'Forecast analysis is available on the Pro plan.',
    });
    expect(runQuery).not.toHaveBeenCalled();
  });

  test('returns a helpful onboarding response when no saved scenario exists', async () => {
    const t = createTest();
    const userId = 'forecast_no_scenario_user';
    await seedProProfile(t, userId);

    const result = await executeGetForecast(toolCtx(t, userId), forecastInputSchema.parse({}), {
      isAllowed: () => Promise.resolve(true),
    });

    expect(result).toEqual({
      upgradeRequired: false,
      needsOnboarding: true,
      message: 'Set up Forecast in the app first so I can analyze your active scenario.',
    });
  });

  test('returns a compact major-unit summary for the active saved scenario', async () => {
    const t = createTest();
    const userId = 'forecast_summary_user';
    await seedProProfile(t, userId);
    const seeded = await seedScenario(t, userId);

    const result = await executeGetForecast(toolCtx(t, userId), forecastInputSchema.parse({}), {
      isAllowed: () => Promise.resolve(true),
    });

    expect(result).toMatchObject({
      upgradeRequired: false,
      needsOnboarding: false,
      scenario: { id: seeded.scenarioId, name: 'Base', currency: 'EUR', endAge: 90 },
      yearlyRowsReturned: 50,
      events: [expect.objectContaining({ kind: 'otherExpense' })],
      depletionYear: null,
      assumptions: {
        currency: 'EUR',
        accounts: [expect.objectContaining({ id: seeded.accountId, balance: 1_000 })],
        incomeSources: [expect.objectContaining({ name: 'Salary', monthly: 1_000 })],
        livingExpenses: expect.objectContaining({ monthly: 500 }),
        events: [expect.objectContaining({ kind: 'otherExpense', amount: 250 })],
      },
    });
    expect(result.yearlyRowsTotal).toBeGreaterThan(50);
    expect(result.yearly).toHaveLength(50);
    expect(result.yearly?.[0]).toEqual(
      expect.objectContaining({
        calendarYear: new Date().getUTCFullYear(),
        netWorth: expect.any(Number),
        annualIncome: expect.any(Number),
      }),
    );
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
