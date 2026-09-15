/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import schema from '../schema';

const modules = import.meta.glob(['../_generated/*.js']);

const money = (amountMinor: bigint) => ({ amountMinor, currency: 'EUR' });

describe('forecast schema', () => {
  test('roundtrips a scenario, assumption, income source, and every life-event kind', async () => {
    const t = convexTest(schema, modules);
    const stored = await t.run(async (ctx) => {
      const userId = 'forecast_user';
      const now = Date.UTC(2026, 6, 19);
      const accountId = await ctx.db.insert('financialAccounts', {
        userId,
        provider: 'manual',
        name: 'Investment account',
        accountType: 'INVS',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const scenarioId = await ctx.db.insert('forecastScenarios', {
        userId,
        name: 'Base plan',
        icon: 'chart',
        color: '#123456',
        sortOrder: 0,
        currency: 'EUR',
        inflationAnnualPct: 3,
        endAge: 90,
        livingExpenses: {
          amountMonthly: money(250_000n),
          changeMode: 'customPct',
          customPct: 2.5,
        },
        extraSavings: {
          growthAnnualPct: 3,
          splits: [{ accountId, pct: 50 }],
        },
        capitalGainsTaxPct: 26,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const assumptionId = await ctx.db.insert('forecastAccountAssumptions', {
        userId,
        scenarioId,
        target: { kind: 'account', accountId },
        included: true,
        growthAnnualPct: 7,
        contributionYearly: money(120_000n),
        createdAtMs: now,
        updatedAtMs: now,
      });
      const incomeSourceId = await ctx.db.insert('forecastIncomeSources', {
        userId,
        scenarioId,
        name: 'Salary',
        amountMonthly: money(400_000n),
        changeMode: 'inflation',
        sortOrder: 0,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const events = [
        {
          kind: 'retirement' as const,
          age: 67,
          expensePct: 80,
          extraYearlyExpenses: money(200_000n),
          incomeReductionPct: 100,
        },
        { kind: 'pension' as const, startAge: 68, monthlyBenefit: money(120_000n) },
        {
          kind: 'buyHome' as const,
          year: 2030,
          price: money(30_000_000n),
          mode: 'finance' as const,
          downPayment: money(6_000_000n),
          mortgageYears: 25,
          mortgageRateBps: 350,
          recurringCostsAnnualPct: 1.5,
        },
        { kind: 'haveKid' as const, year: 2028, monthlyCost: money(60_000n), untilAge: 22 },
        {
          kind: 'careerBreak' as const,
          startYear: 2032,
          endYear: 2033,
          incomeReductionPct: 100,
        },
        { kind: 'newJob' as const, year: 2029, newMonthlyIncome: money(500_000n) },
        {
          kind: 'otherIncome' as const,
          startYear: 2035,
          amount: money(100_000n),
          recurring: { intervalYears: 2, endYear: 2041 },
        },
        {
          kind: 'otherExpense' as const,
          startYear: 2031,
          amount: money(80_000n),
          recurring: { intervalYears: 1, endYear: 2034 },
        },
        { kind: 'endOfPlan' as const, age: 95 },
      ];
      const eventIds = [];
      for (const event of events) {
        eventIds.push(
          await ctx.db.insert('forecastLifeEvents', {
            userId,
            scenarioId,
            enabled: true,
            event,
            createdAtMs: now,
            updatedAtMs: now,
          }),
        );
      }

      return {
        scenario: await ctx.db.get('forecastScenarios', scenarioId),
        assumption: await ctx.db.get('forecastAccountAssumptions', assumptionId),
        incomeSource: await ctx.db.get('forecastIncomeSources', incomeSourceId),
        lifeEvents: await Promise.all(eventIds.map(async (eventId) => await ctx.db.get('forecastLifeEvents', eventId))),
      };
    });

    expect(stored.scenario).toMatchObject({
      name: 'Base plan',
      currency: 'EUR',
      livingExpenses: { amountMonthly: money(250_000n), changeMode: 'customPct', customPct: 2.5 },
      capitalGainsTaxPct: 26,
    });
    expect(stored.assumption).toMatchObject({
      included: true,
      growthAnnualPct: 7,
      contributionYearly: money(120_000n),
    });
    expect(stored.incomeSource).toMatchObject({
      name: 'Salary',
      amountMonthly: money(400_000n),
      changeMode: 'inflation',
    });
    expect(stored.lifeEvents.map((row) => row?.event.kind)).toEqual([
      'retirement',
      'pension',
      'buyHome',
      'haveKid',
      'careerBreak',
      'newJob',
      'otherIncome',
      'otherExpense',
      'endOfPlan',
    ]);
    expect(stored.lifeEvents[2]?.event).toMatchObject({
      kind: 'buyHome',
      price: money(30_000_000n),
      mode: 'finance',
      mortgageRateBps: 350,
    });
    expect(stored.lifeEvents[6]?.event).toMatchObject({
      kind: 'otherIncome',
      recurring: { intervalYears: 2, endYear: 2041 },
    });
  });
});
