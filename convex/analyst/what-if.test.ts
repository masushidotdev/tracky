// @vitest-environment node

import { describe, expect, test } from 'vitest';
import { monthlyBaselineFromFutureCashflow } from './tools/simulate';
import { applyWhatIfScenario } from './whatIfCore';

const baseline = [
  { month: '2026-07', inflow: 3000, outflow: 2000, projectedBalance: 5000 },
  { month: '2026-08', inflow: 3000, outflow: 2000, projectedBalance: 6000 },
  { month: '2026-09', inflow: 3000, outflow: 2000, projectedBalance: 7000 },
];

describe('applyWhatIfScenario', () => {
  test('applies recurring additions and removals cumulatively within the horizon', () => {
    const result = applyWhatIfScenario(
      baseline,
      [
        { kind: 'addMonthlyExpense', label: 'Gym', amount: 100, currency: 'EUR' },
        { kind: 'removeMonthlyExpense', label: 'Old plan', amount: 40, currency: 'EUR', months: 2 },
      ],
      2,
    );

    expect(result.scenario).toEqual([
      { month: '2026-07', inflow: 3000, outflow: 2060, projectedBalance: 4940 },
      { month: '2026-08', inflow: 3000, outflow: 2060, projectedBalance: 5880 },
    ]);
    expect(result.deltaByMonth.map((row) => row.projectedBalance)).toEqual([-60, -120]);
  });

  test('applies a dated one-off expense only once', () => {
    const result = applyWhatIfScenario(
      baseline,
      [{ kind: 'oneOffExpense', label: 'Repair', amount: 2500, currency: 'EUR', startDate: '2026-08-10' }],
      3,
    );

    expect(result.scenario.map((row) => row.outflow)).toEqual([2000, 4500, 2000]);
    expect(result.scenario.map((row) => row.projectedBalance)).toEqual([5000, 3500, 4500]);
  });

  test('reports the minimum and warns when the scenario turns negative', () => {
    const result = applyWhatIfScenario(
      baseline,
      [{ kind: 'addMonthlyExpense', label: 'Rent increase', amount: 4000, currency: 'EUR' }],
      3,
    );

    expect(result.minProjectedBalance).toBe(-5000);
    expect(result.warnings).toEqual(['Scenario produces a negative projected balance.']);
  });
});

describe('monthlyBaselineFromFutureCashflow', () => {
  test('uses every grouped event, deduplicates it, and projects a secondary currency from visible balances', () => {
    const usdEvents = Array.from({ length: 101 }, (_, index) => ({
      key: `usd-expense-${index}`,
      dueDate: index < 100 ? '2026-07-10' : '2026-08-10',
      amount: { amountMinor: 100n, currency: 'USD' },
      direction: 'outflow' as const,
    }));
    const result = monthlyBaselineFromFutureCashflow(
      {
        accounts: [
          { latestBalance: { amount: { amountMinor: 500000n, currency: 'EUR' } } },
          { latestBalance: { amount: { amountMinor: 25000n, currency: 'USD' } } },
          { latestBalance: { amount: { amountMinor: 7500n, currency: 'USD' } } },
        ],
        upcomingItemsByAccount: [
          { accountId: 'usd-1', items: usdEvents },
          {
            accountId: 'usd-2',
            items: [
              usdEvents[0],
              {
                key: 'paid-usd-expense',
                dueDate: '2026-07-15',
                amount: { amountMinor: 5000n, currency: 'USD' },
                direction: 'outflow',
                occurrencePayment: { source: 'manual' },
              },
              {
                key: 'eur-income',
                dueDate: '2026-07-20',
                amount: { amountMinor: 100000n, currency: 'EUR' },
                direction: 'inflow',
              },
            ],
          },
        ],
      },
      { startMonth: '2026-07', horizonMonths: 2, currency: 'USD' },
    );

    expect(result).toEqual([
      { month: '2026-07', inflow: 0, outflow: 100, projectedBalance: 225 },
      { month: '2026-08', inflow: 0, outflow: 1, projectedBalance: 224 },
    ]);
  });
});
