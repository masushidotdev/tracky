// @vitest-environment node

import { describe, expect, test, vi } from 'vitest';
import { analystProactiveTools, analystTools } from './tools';
import {
  executeLongTermProjection,
  isLongTermProjectionAllowed,
  longTermProjectionInputSchema,
} from './tools/longTermProjection';
import type { ToolCtx } from '@convex-dev/agent';

function toolCtx(runQuery: ToolCtx['runQuery']): ToolCtx {
  return { userId: 'user_123', runQuery } as ToolCtx;
}

function baseline(
  overrides: Partial<
    Record<'liquidMinor' | 'investedMinor' | 'monthlyIncomeMinor' | 'monthlyExpensesMinor', bigint>
  > = {},
) {
  return {
    currency: 'EUR',
    liquidMinor: 0n,
    investedMinor: 0n,
    monthlyIncomeMinor: 0n,
    monthlyExpensesMinor: 0n,
    ...overrides,
  };
}

describe('longTermProjection tool', () => {
  test('is interactive-only', () => {
    expect(analystTools).toHaveProperty('longTermProjection');
    expect(analystProactiveTools).not.toHaveProperty('longTermProjection');
  });

  test('returns the shared-engine projection and overlays user overrides on the baseline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const runQuery = vi.fn().mockResolvedValue(
      baseline({
        liquidMinor: 100_000n,
        investedMinor: 200_000n,
        monthlyIncomeMinor: 300_000n,
        monthlyExpensesMinor: 150_000n,
      }),
    );

    try {
      const input = longTermProjectionInputSchema.parse({
        horizonYears: 1,
        monthlyIncomeMajor: 4_000,
        initialInvestedMajor: 2_500,
        incomeGrowthAnnualPct: 0,
        expenseInflationAnnualPct: 0,
        investmentReturnAnnualPct: 0,
        surplusInvestedPct: 100,
        liquidBufferMonths: 0,
      });
      const result = await executeLongTermProjection(toolCtx(runQuery as ToolCtx['runQuery']), input, {
        isAllowed: () => Promise.resolve(true),
      });

      expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
        userId: 'user_123',
        currency: undefined,
      });
      expect(result).toMatchObject({
        upgradeRequired: false,
        currency: 'EUR',
        finalNetWorth: 33_500,
        assumptions: {
          initialLiquid: 1_000,
          initialInvested: 2_500,
          monthlyIncome: 4_000,
          monthlyExpenses: 1_500,
        },
        yearly: [
          {
            yearIndex: 1,
            liquid: 1_000,
            invested: 32_500,
            netWorth: 33_500,
            annualIncome: 48_000,
            annualExpenses: 18_000,
            annualSavings: 30_000,
          },
        ],
      });
      expect(() => JSON.stringify(result)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  test('is deterministic for a fixed date and baseline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const runQuery = vi.fn().mockResolvedValue(
      baseline({
        liquidMinor: 500_000n,
        investedMinor: 1_000_000n,
        monthlyIncomeMinor: 300_000n,
        monthlyExpensesMinor: 200_000n,
      }),
    );
    const input = longTermProjectionInputSchema.parse({ horizonYears: 10 });

    try {
      const first = await executeLongTermProjection(toolCtx(runQuery as ToolCtx['runQuery']), input, {
        isAllowed: () => Promise.resolve(true),
      });
      const second = await executeLongTermProjection(toolCtx(runQuery as ToolCtx['runQuery']), input, {
        isAllowed: () => Promise.resolve(true),
      });

      expect(second).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });

  test('reports FIRE for a 25x annual-expense fixture', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const runQuery = vi.fn().mockResolvedValue(baseline());

    try {
      const result = await executeLongTermProjection(
        toolCtx(runQuery as ToolCtx['runQuery']),
        longTermProjectionInputSchema.parse({
          horizonYears: 30,
          monthlyIncomeMajor: 2_000,
          monthlyExpensesMajor: 1_000,
          incomeGrowthAnnualPct: 0,
          expenseInflationAnnualPct: 0,
          investmentReturnAnnualPct: 0,
          surplusInvestedPct: 100,
        }),
        { isAllowed: () => Promise.resolve(true) },
      );

      expect(result).toMatchObject({
        upgradeRequired: false,
        fireDate: '2050-12-31',
        fireReachedMonthIndex: 299,
        assumptions: { fireTarget: 300_000 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('passes through engine depletion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const runQuery = vi.fn().mockResolvedValue(baseline());

    try {
      const result = await executeLongTermProjection(
        toolCtx(runQuery as ToolCtx['runQuery']),
        longTermProjectionInputSchema.parse({
          horizonYears: 1,
          initialLiquidMajor: 100,
          monthlyIncomeMajor: 10,
          monthlyExpensesMajor: 40,
          expenseInflationAnnualPct: 0,
          investmentReturnAnnualPct: 0,
        }),
        { isAllowed: () => Promise.resolve(true) },
      );

      expect(result).toMatchObject({ depletedMonthIndex: 3, finalNetWorth: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  test('passes one-off events into the engine and echoes the external contract', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const runQuery = vi.fn().mockResolvedValue(baseline());

    try {
      const result = await executeLongTermProjection(
        toolCtx(runQuery as ToolCtx['runQuery']),
        longTermProjectionInputSchema.parse({
          horizonYears: 1,
          initialLiquidMajor: 1_000,
          monthlyIncomeMajor: 100,
          monthlyExpensesMajor: 50,
          expenseInflationAnnualPct: 0,
          investmentReturnAnnualPct: 0,
          surplusInvestedPct: 0,
          oneOffEvents: [{ monthIndex: 5, amountMajor: 250, kind: 'expense' }],
        }),
        { isAllowed: () => Promise.resolve(true) },
      );

      expect(result).toMatchObject({
        finalNetWorth: 1_350,
        assumptions: {
          oneOffEvents: [{ monthIndex: 5, amount: 250, kind: 'expense' }],
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('maps retirement month input into the engine and stops recurring income', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    const runQuery = vi.fn().mockResolvedValue(baseline());

    try {
      const result = await executeLongTermProjection(
        toolCtx(runQuery as ToolCtx['runQuery']),
        longTermProjectionInputSchema.parse({
          horizonYears: 1,
          initialLiquidMajor: 1_200,
          monthlyIncomeMajor: 500,
          monthlyExpensesMajor: 100,
          expenseInflationAnnualPct: 0,
          investmentReturnAnnualPct: 0,
          retirementAtMonthIndex: 0,
        }),
        { isAllowed: () => Promise.resolve(true) },
      );

      expect(result).toMatchObject({
        depletedMonthIndex: 11,
        finalNetWorth: 0,
        assumptions: { retirementAtMonthIndex: 0 },
        yearly: [{ annualIncome: 0, annualExpenses: 1_200, annualSavings: -1_200 }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('returns the upgrade response before fetching a baseline for free users', async () => {
    const runQuery = vi.fn();
    const input = longTermProjectionInputSchema.parse({});

    const result = await executeLongTermProjection(toolCtx(runQuery as ToolCtx['runQuery']), input, {
      isAllowed: () => Promise.resolve(false),
    });

    expect(result).toEqual({ upgradeRequired: true, feature: 'analyst.longTermProjection' });
    expect(runQuery).not.toHaveBeenCalled();
  });

  test.each([
    ['free', false],
    ['pro', true],
  ] as const)('resolves the %s feature gate from central entitlements', async (tier, allowed) => {
    const runQuery = vi.fn().mockResolvedValue({
      tier,
      features: { 'analyst.longTermProjection': allowed },
      limits: { analystDailyMessages: tier === 'pro' ? 100 : 20 },
    });

    await expect(isLongTermProjectionAllowed(toolCtx(runQuery as ToolCtx['runQuery']))).resolves.toBe(allowed);
    expect(runQuery).toHaveBeenCalledWith(expect.anything(), { userId: 'user_123' });
  });
});
