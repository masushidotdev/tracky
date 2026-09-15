import { describe, expect, test } from 'vitest';
import { projectForecast } from './forecastCore';
import { stepLiability } from './liabilityMath';
import type { ForecastParams } from './forecastCore';

function liabilityParams(
  includedInLivingExpenses: boolean,
  livingExpensesMinor: bigint,
): ForecastParams {
  return {
    currency: 'EUR',
    birthYear: 1990,
    endAge: 37,
    inflationAnnualPct: 0,
    accounts: [
      {
        id: 'loan',
        kind: 'liability',
        balanceMinor: 100n,
        liability: {
          annualRateBps: 0,
          paymentMonthlyMinor: 100n,
          includedInLivingExpenses,
        },
      },
    ],
    incomeSources: [{ id: 'salary', name: 'Salary', monthlyMinor: 200n, change: 'fixed' }],
    livingExpenses: { monthlyMinor: livingExpensesMinor, change: 'fixed' },
    extraSavings: { growthAnnualPct: 0, splits: [] },
    withdrawal: { capitalGainsTaxPct: 26 },
    events: [],
  };
}

describe('forecast liabilities', () => {
  test('amortizes a known 5% fixed-payment schedule', () => {
    const principalMinor = 1_000_000n;
    const paymentMonthlyMinor = 20_000n;
    const monthlyRate = 0.05 / 12;
    const closedFormMonths = Math.ceil(
      -Math.log(1 - (monthlyRate * Number(principalMinor)) / Number(paymentMonthlyMinor)) /
        Math.log(1 + monthlyRate),
    );
    let balanceMinor = principalMinor;
    let payoffMonthIndex: number | undefined;

    for (let monthIndex = 0; monthIndex < 600 && balanceMinor > 0n; monthIndex += 1) {
      const result = stepLiability({
        balanceMinor,
        annualRateBps: 500,
        paymentMonthlyMinor,
        monthIndex,
      });
      if (monthIndex === 0) expect(result.interestMinor).toBe(4_167n);
      balanceMinor = result.endingBalanceMinor;
      payoffMonthIndex = result.payoffMonthIndex ?? payoffMonthIndex;
    }

    expect(payoffMonthIndex).toBe(closedFormMonths - 1);
    expect(balanceMinor).toBe(0n);
  });

  test('handles a zero-rate loan and clamps the final payment', () => {
    let balanceMinor = 1_000n;
    const balances: Array<bigint> = [];
    let payoffMonthIndex: number | undefined;

    for (let monthIndex = 0; monthIndex < 4; monthIndex += 1) {
      const result = stepLiability({
        balanceMinor,
        annualRateBps: 0,
        paymentMonthlyMinor: 300n,
        monthIndex,
      });
      balanceMinor = result.endingBalanceMinor;
      balances.push(balanceMinor);
      payoffMonthIndex = result.payoffMonthIndex ?? payoffMonthIndex;
    }

    expect(balances).toEqual([700n, 400n, 100n, 0n]);
    expect(payoffMonthIndex).toBe(3);
  });

  test('flags payments that do not exceed monthly interest', () => {
    const result = stepLiability({
      balanceMinor: 100_000n,
      annualRateBps: 12_000,
      paymentMonthlyMinor: 10_000n,
      monthIndex: 0,
    });

    expect(result.interestMinor).toBe(10_000n);
    expect(result.endingBalanceMinor).toBe(100_000n);
    expect(result.negativeAmortization).toBe(true);
  });

  test('frees an included living-expense payment after payoff', () => {
    const result = projectForecast(liabilityParams(true, 200n), { startDate: '2026-12-01' });

    expect(result.liabilities).toEqual([
      { id: 'loan', payoffMonthIndex: 0, negativeAmortization: false },
    ]);
    expect(result.yearly[0]).toMatchObject({
      annualIncomeMinor: 200n,
      annualExpensesMinor: 200n,
      annualSavingsMinor: 0n,
    });
    expect(result.yearly[1]).toMatchObject({
      annualIncomeMinor: 2_200n,
      annualExpensesMinor: 1_100n,
      annualSavingsMinor: 1_100n,
    });
    expect(result.finalNetWorthMinor).toBe(1_100n);
  });

  test('treats a non-included payment as an explicit outflow until payoff', () => {
    const result = projectForecast(liabilityParams(false, 100n), { startDate: '2026-12-01' });

    expect(result.yearly[0]).toMatchObject({
      annualIncomeMinor: 200n,
      annualExpensesMinor: 200n,
      annualSavingsMinor: 0n,
    });
    expect(result.finalNetWorthMinor).toBe(1_100n);
  });
});
