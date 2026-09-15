import { describe, expect, test } from 'vitest';
import { buildLoanPayoffProjection } from './banking/creditMath';

describe('loan payoff projection', () => {
  test('projects a real mortgage payoff around 2053', () => {
    const projection = buildLoanPayoffProjection({
      outstandingMinor: 14_191_112n,
      annualRateBps: 370,
      monthlyPaymentMinor: 68_000n,
      startDate: '2025-01-01',
    });

    expect(projection.months).toBe(336);
    expect(projection.payoffDate).toBe('2052-12-01');
    expect(projection.totalInterestMinor).toBe(8_589_071n);
    expect(projection.series).toHaveLength(336);
    expect(projection.series[0]).toEqual({ month: '2025-01', balanceMinor: 14_166_868n });
    expect(projection.series.at(-1)).toEqual({ month: '2052-12', balanceMinor: 0n });
  });

  test('uses a contractual final balloon without changing the ordinary projection', () => {
    const input = {
      outstandingMinor: 1_830_074n,
      annualRateBps: 645,
      monthlyPaymentMinor: 38_441n,
      startDate: '2026-08-28',
    };
    const withBalloon = buildLoanPayoffProjection({
      ...input,
      finalPaymentMinor: 1_001_301n,
    });
    const withoutBalloon = buildLoanPayoffProjection(input);

    expect(withBalloon.months).toBe(28);
    expect(withBalloon.payoffDate).toBe('2028-11-28');
    expect(withBalloon.series).toHaveLength(28);
    const contractualBalances = [1_801_470n, 1_772_712n, 1_743_800n, 1_714_732n, 1_685_508n];
    contractualBalances.forEach((expectedBalance, index) => {
      const actualBalance = withBalloon.series[index]?.balanceMinor;
      expect(actualBalance).toBeDefined();
      expect(actualBalance >= expectedBalance - 1n && actualBalance <= expectedBalance + 1n).toBe(true);
    });
    expect(withBalloon.series.at(-1)).toEqual({ month: '2028-11', balanceMinor: 0n });

    expect(withoutBalloon.months).toBe(56);
    expect(withoutBalloon.payoffDate).toBe('2031-03-28');
  });

  test('uses ceiling division naturally for a zero-rate loan', () => {
    const projection = buildLoanPayoffProjection({
      outstandingMinor: 100_000n,
      annualRateBps: 0,
      monthlyPaymentMinor: 30_000n,
      startDate: '2026-08-15',
    });

    expect(projection).toEqual({
      months: 4,
      payoffDate: '2026-11-15',
      totalInterestMinor: 0n,
      series: [
        { month: '2026-08', balanceMinor: 70_000n },
        { month: '2026-09', balanceMinor: 40_000n },
        { month: '2026-10', balanceMinor: 10_000n },
        { month: '2026-11', balanceMinor: 0n },
      ],
    });
  });

  test('returns no payoff when the payment does not cover monthly interest', () => {
    const input = {
      outstandingMinor: 10_000_000n,
      annualRateBps: 1_200,
      monthlyPaymentMinor: 90_000n,
      startDate: '2026-08-01',
    };

    expect(buildLoanPayoffProjection(input)).toEqual({
      months: null,
      payoffDate: null,
      totalInterestMinor: 0n,
      series: [],
    });
    expect(buildLoanPayoffProjection({ ...input, finalPaymentMinor: 1_000_000n })).toEqual({
      months: null,
      payoffDate: null,
      totalInterestMinor: 0n,
      series: [],
    });
    expect(buildLoanPayoffProjection({ ...input, finalPaymentMinor: 10_000_000n })).toEqual({
      months: 1,
      payoffDate: '2026-08-01',
      totalInterestMinor: 100_000n,
      series: [{ month: '2026-08', balanceMinor: 0n }],
    });
  });

  test('removes escrow from the amount available to amortise principal', () => {
    const projection = buildLoanPayoffProjection({
      outstandingMinor: 120_000n,
      annualRateBps: 0,
      monthlyPaymentMinor: 35_000n,
      escrowMinor: 5_000n,
      startDate: '2026-08-01',
    });

    expect(projection.months).toBe(4);
    expect(projection.payoffDate).toBe('2026-11-01');
    expect(projection.totalInterestMinor).toBe(0n);
    expect(projection.series).toEqual([
      { month: '2026-08', balanceMinor: 90_000n },
      { month: '2026-09', balanceMinor: 60_000n },
      { month: '2026-10', balanceMinor: 30_000n },
      { month: '2026-11', balanceMinor: 0n },
    ]);
  });
});

describe('final balloon payment', () => {
  // Example figures: 18.300,74 left after instalment 32, 6,45% TAN, 384,41 a
  // month and a 10.013,01 balloon with the last instalment. The plan ends 28/11/2028.
  const stellantis = {
    outstandingMinor: 1830074n,
    annualRateBps: 645,
    monthlyPaymentMinor: 38441n,
    startDate: '2026-08-28',
  };

  test('ends on the contractual date instead of amortising to zero', () => {
    const projection = buildLoanPayoffProjection({ ...stellantis, finalPaymentMinor: 1001301n });
    expect(projection.months).toBe(28);
    expect(projection.payoffDate).toBe('2028-11-28');
  });

  test('keeps the amortisation matching the contract month by month', () => {
    const projection = buildLoanPayoffProjection({ ...stellantis, finalPaymentMinor: 1001301n });
    // Cents drift by one against the paper plan because each month rounds independently.
    expect(projection.series.slice(0, 4).map((point) => point.balanceMinor)).toEqual([
      1801470n,
      1772712n,
      1743799n,
      1714731n,
    ]);
  });

  // The balloon is opt-in: without it the same figures must behave exactly as before.
  test('leaves an ordinary loan untouched', () => {
    const projection = buildLoanPayoffProjection(stellantis);
    expect(projection.months).toBe(56);
    expect(projection.payoffDate).toBe('2031-03-28');
  });

  test('does not rescue a payment that never covers the interest', () => {
    const projection = buildLoanPayoffProjection({
      outstandingMinor: 10000000n,
      annualRateBps: 1200,
      monthlyPaymentMinor: 90000n,
      finalPaymentMinor: 100000n,
      startDate: '2026-01-01',
    });
    expect(projection.months).toBeNull();
  });
});
