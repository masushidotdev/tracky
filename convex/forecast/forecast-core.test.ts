import { describe, expect, test } from 'vitest';
import { EXTRA_SAVINGS_ACCOUNT_ID, projectForecast } from './forecastCore';
import { RATE_SCALE, multiplyScaled } from './projectionMath';
import type { ForecastParams } from './forecastCore';

function params(overrides: Partial<ForecastParams> = {}): ForecastParams {
  return {
    currency: 'EUR',
    birthYear: 1990,
    endAge: 37,
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

function balanceAt(result: ReturnType<typeof projectForecast>, checkpointIndex: number, accountId: string) {
  return result.yearly[checkpointIndex]?.accounts.find((account) => account.id === accountId)?.endBalanceMinor;
}

describe('projectForecast assets and cash flow', () => {
  test('is deterministic regardless of account and income input ordering', () => {
    const accounts: ForecastParams['accounts'] = [
      { id: 'z-cash', kind: 'cash', balanceMinor: 10_000n, growthAnnualPct: 0 },
      { id: 'a-investment', kind: 'investment', balanceMinor: 20_000n, growthAnnualPct: 7 },
    ];
    const incomeSources: ForecastParams['incomeSources'] = [
      { id: 'salary', name: 'Salary', monthlyMinor: 5_000n, change: 'fixed' },
      { id: 'rent', name: 'Rent', monthlyMinor: 1_000n, change: 'fixed' },
    ];
    const first = projectForecast(params({ accounts, incomeSources }), { startDate: '2026-01-15' });
    const second = projectForecast(
      params({ accounts: [...accounts].reverse(), incomeSources: [...incomeSources].reverse() }),
      { startDate: '2026-01-15' },
    );

    expect(second).toEqual(first);
  });

  test('matches the zero-growth closed form balance', () => {
    const result = projectForecast(
      params({
        accounts: [{ id: 'cash', kind: 'cash', balanceMinor: 100_000n, growthAnnualPct: 0 }],
        incomeSources: [{ id: 'salary', name: 'Salary', monthlyMinor: 10_000n, change: 'fixed' }],
        livingExpenses: { monthlyMinor: 4_000n, change: 'fixed' },
      }),
      { startDate: '2026-01-01' },
    );

    expect(result.finalNetWorthMinor).toBe(100_000n + 12n * 6_000n);
    expect(result.yearly[0]).toMatchObject({
      annualIncomeMinor: 120_000n,
      annualExpensesMinor: 48_000n,
      annualSavingsMinor: 72_000n,
    });
  });

  test('repays a negative opening cash balance before building extra savings', () => {
    const result = projectForecast(
      params({
        accounts: [{ id: 'overdrawn', kind: 'cash', balanceMinor: -1_000n, growthAnnualPct: 0 }],
        incomeSources: [{ id: 'salary', name: 'Salary', monthlyMinor: 200n, change: 'fixed' }],
      }),
      { startDate: '2026-01-01' },
    );

    expect(balanceAt(result, 0, 'overdrawn')).toBe(0n);
    expect(balanceAt(result, 0, EXTRA_SAVINGS_ACCOUNT_ID)).toBe(1_400n);
    expect(result.finalNetWorthMinor).toBe(1_400n);
  });

  test('does not treat a negative cash balance as withdrawable liquidity', () => {
    const result = projectForecast(
      params({
        accounts: [{ id: 'overdrawn', kind: 'cash', balanceMinor: -100n, growthAnnualPct: 0 }],
        livingExpenses: { monthlyMinor: 10n, change: 'fixed' },
      }),
      { startDate: '2026-01-01' },
    );

    expect(balanceAt(result, 0, 'overdrawn')).toBe(-100n);
    expect(result.depletedMonthIndex).toBe(0);
    expect(result.finalNetWorthMinor).toBe(-100n);
  });

  test('compounds a 7% annual account return to the closed form', () => {
    const initialMinor = 10_000_000n;
    const result = projectForecast(
      params({
        accounts: [{ id: 'investment', kind: 'investment', balanceMinor: initialMinor, growthAnnualPct: 7 }],
      }),
      { startDate: '2026-01-01' },
    );
    const closedFormMinor = BigInt(Math.round(Number(initialMinor) * 1.07));

    expect(result.finalNetWorthMinor).toBeGreaterThanOrEqual(closedFormMinor - 12n);
    expect(result.finalNetWorthMinor).toBeLessThanOrEqual(closedFormMinor + 12n);
  });

  test('emits a prorated first calendar year and a final partial checkpoint', () => {
    const result = projectForecast(
      params({
        incomeSources: [{ id: 'salary', name: 'Salary', monthlyMinor: 100n, change: 'fixed' }],
      }),
      { startDate: '2026-07-15' },
    );

    expect(result.yearly).toHaveLength(2);
    expect(result.yearly[0]).toMatchObject({ date: '2026-12-31', annualIncomeMinor: 600n });
    expect(result.yearly[1]).toMatchObject({ date: '2027-06-30', annualIncomeMinor: 600n });
  });

  test('applies split percentages as a cascade and leaves the remainder in extra savings', () => {
    const result = projectForecast(
      params({
        accounts: [
          { id: 'first', kind: 'investment', balanceMinor: 0n, growthAnnualPct: 0 },
          { id: 'second', kind: 'investment', balanceMinor: 0n, growthAnnualPct: 0 },
        ],
        incomeSources: [{ id: 'salary', name: 'Salary', monthlyMinor: 100n, change: 'fixed' }],
        extraSavings: {
          growthAnnualPct: 0,
          splits: [
            { accountId: 'first', pct: 50 },
            { accountId: 'second', pct: 50 },
          ],
        },
      }),
      { startDate: '2026-01-01' },
    );

    expect(balanceAt(result, 0, 'first')).toBe(600n);
    expect(balanceAt(result, 0, 'second')).toBe(300n);
    expect(balanceAt(result, 0, EXTRA_SAVINGS_ACCOUNT_ID)).toBe(300n);
  });

  test('withdraws extra savings, then cash, then tax-grossed investments', () => {
    const result = projectForecast(
      params({
        accounts: [
          { id: 'cash', kind: 'cash', balanceMinor: 100n, growthAnnualPct: 0 },
          { id: 'investment', kind: 'investment', balanceMinor: 2_000n, growthAnnualPct: 0 },
          { id: 'property', kind: 'otherAsset', balanceMinor: 5_000n, growthAnnualPct: 0 },
        ],
        incomeSources: [{ id: 'salary', name: 'Salary', monthlyMinor: 100n, change: 'fixed' }],
        livingExpenses: {
          monthlyMinor: 10n,
          change: { mode: 'customPct', annualPct: 1e26 },
        },
      }),
      { startDate: '2026-11-01' },
    );

    expect(balanceAt(result, 0, EXTRA_SAVINGS_ACCOUNT_ID)).toBe(0n);
    expect(balanceAt(result, 0, 'cash')).toBe(0n);
    expect(balanceAt(result, 0, 'investment')).toBe(1_041n);
    expect(balanceAt(result, 0, 'property')).toBe(5_000n);
  });

  test('returns a cumulative deflator that converts nominal balances to today money', () => {
    const initialMinor = 1_000_000n;
    const result = projectForecast(
      params({
        inflationAnnualPct: 12,
        accounts: [{ id: 'asset', kind: 'otherAsset', balanceMinor: initialMinor, growthAnnualPct: 12 }],
      }),
      { startDate: '2026-01-01' },
    );
    const checkpoint = result.yearly[0];
    const nominalMinor = balanceAt(result, 0, 'asset')!;
    const todayMinor = multiplyScaled(nominalMinor, RATE_SCALE, checkpoint.deflatorScaled);

    expect(checkpoint.deflatorScaled).toBeGreaterThan(RATE_SCALE);
    expect(todayMinor).toBeGreaterThanOrEqual(initialMinor - 2n);
    expect(todayMinor).toBeLessThanOrEqual(initialMinor + 2n);
  });

  test('detects the first month liquid assets are depleted', () => {
    const result = projectForecast(
      params({
        accounts: [{ id: 'cash', kind: 'cash', balanceMinor: 10_000n, growthAnnualPct: 0 }],
        livingExpenses: { monthlyMinor: 3_000n, change: 'fixed' },
      }),
      { startDate: '2026-01-01' },
    );

    expect(result.depletedMonthIndex).toBe(3);
  });

  test('accepts life events in the core projection', () => {
    const result = projectForecast(params({ events: [{ kind: 'endOfPlan', age: 80 }] }), { startDate: '2026-01-01' });

    expect(result.events).toEqual([]);
    expect(result.assumptions.events).toEqual([{ kind: 'endOfPlan', age: 80 }]);
  });

  test('enforces a single currency', () => {
    expect(() =>
      projectForecast(
        params({
          accounts: [{ id: 'usd', kind: 'cash', currency: 'USD', balanceMinor: 100n, growthAnnualPct: 0 }],
        }),
        { startDate: '2026-01-01' },
      ),
    ).toThrow(/single currency/i);
  });
});
