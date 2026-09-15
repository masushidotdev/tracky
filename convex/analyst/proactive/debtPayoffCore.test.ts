// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { computePayoffPlan } from './debtPayoffCore';

const debts = [
  { id: 'large-high', name: 'Large high APR', balanceMinor: 20_000n, annualRateBps: 2_400, minimumPaymentMinor: 1_000n, currency: 'EUR' },
  { id: 'small-low', name: 'Small low APR', balanceMinor: 5_000n, annualRateBps: 500, minimumPaymentMinor: 500n, currency: 'EUR' },
];

describe('computePayoffPlan', () => {
  test('avalanche and snowball select different first targets', () => {
    const avalanche = computePayoffPlan({ debts, extraPaymentMinor: 2_000n, strategy: 'avalanche' });
    const snowball = computePayoffPlan({ debts, extraPaymentMinor: 2_000n, strategy: 'snowball' });
    expect(avalanche.schedule[0].targetDebtId).toBe('large-high');
    expect(snowball.schedule[0].targetDebtId).toBe('small-low');
    expect(avalanche.totalInterestMinor).toBeGreaterThan(0n);
  });

  test('rolls the fixed payment pool forward and caps overpayment', () => {
    const result = computePayoffPlan({ debts, extraPaymentMinor: 10_000n, strategy: 'snowball' });
    expect(result.payoffByDebt.every((debt) => debt.payoffMonth !== null)).toBe(true);
    expect(result.schedule.at(-1)?.closingBalanceMinor).toBe(0n);
  });

  test('rejects mixed currencies', () => {
    expect(() =>
      computePayoffPlan({
        debts: [...debts, { ...debts[0], id: 'usd', currency: 'USD' }],
        extraPaymentMinor: 0n,
        strategy: 'avalanche',
      }),
    ).toThrow(/single currency/i);
  });

  test('detects negative amortization and respects maxMonths', () => {
    const result = computePayoffPlan({
      debts: [{ id: 'slow', name: 'Slow', balanceMinor: 100_000n, annualRateBps: 12_000, minimumPaymentMinor: 1n, currency: 'EUR' }],
      extraPaymentMinor: 0n,
      strategy: 'avalanche',
      maxMonths: 3,
    });
    expect(result.months).toBe(3);
    expect(result.warnings.join(' ')).toMatch(/negatively amortizing/i);
    expect(result.warnings.join(' ')).toMatch(/3 months/i);
  });
});
