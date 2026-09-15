// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { computeHealthScore } from './healthScoreCore';

describe('computeHealthScore', () => {
  test('scores exact healthy boundaries at 100', () => {
    const result = computeHealthScore({
      monthlyIncome: 10_000,
      monthlyOutflow: 8_000,
      monthlyDebtPayments: 1_000,
      liquidBalance: 18_000,
      essentialMonthlyOutflow: 6_000,
      subscriptionMonthly: 500,
      budgetAmount: 7_000,
      budgetSpent: 7_000,
    });
    expect(result.score).toBe(100);
    expect(result.components).toEqual({
      savingsRate: 100,
      budgetAdherence: 100,
      debtLoad: 100,
      liquidityMonths: 100,
      subscriptionLoad: 100,
    });
  });

  test('clamps poor ratios and never returns NaN', () => {
    const result = computeHealthScore({
      monthlyIncome: 1_000,
      monthlyOutflow: 2_000,
      monthlyDebtPayments: 800,
      liquidBalance: -100,
      essentialMonthlyOutflow: 1_000,
      subscriptionMonthly: 400,
      budgetAmount: 100,
      budgetSpent: 400,
    });
    expect(result.score).toBe(0);
    expect(Object.values(result.components).every(Number.isFinite)).toBe(true);
  });

  test('handles zero income and outflow as insufficient without Infinity', () => {
    const result = computeHealthScore({
      monthlyIncome: 0,
      monthlyOutflow: 0,
      monthlyDebtPayments: 0,
      liquidBalance: 0,
      essentialMonthlyOutflow: 0,
      subscriptionMonthly: 0,
      budgetAmount: 0,
      budgetSpent: 0,
    });
    expect(result.insufficientData).toBe(true);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
