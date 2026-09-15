// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { detectSpendingAnomalies, toPersistedSpendingAnomaly } from './anomalyCore';

const base = {
  scope: 'category' as const,
  key: 'groceries',
  label: 'Groceries',
  currency: 'EUR',
  currentPeriod: '2026-07',
};

describe('detectSpendingAnomalies', () => {
  test('ignores a stable current month and baselines shorter than three positive months', () => {
    expect(
      detectSpendingAnomalies([
        { ...base, currentAmount: 101, baseline: [100, 100, 100].map((amount, index) => ({ period: `p${index}`, amount })) },
        { ...base, key: 'short', currentAmount: 500, baseline: [100, 100].map((amount, index) => ({ period: `s${index}`, amount })) },
      ]),
    ).toEqual([]);
  });

  test('detects positive anomalies with the zero-variance floor', () => {
    const [result] = detectSpendingAnomalies([
      { ...base, currentAmount: 150, baseline: [100, 100, 100].map((amount, index) => ({ period: `p${index}`, amount })) },
    ]);
    expect(result).toMatchObject({ key: 'groceries', mean: 100, zScore: 5, percentAboveBaseline: 50 });
  });

  test('projects detected anomalies to the exact persistence contract', () => {
    const [result] = detectSpendingAnomalies([
      { ...base, currentAmount: 150, baseline: [100, 100, 100].map((amount, index) => ({ period: `p${index}`, amount })) },
    ]);

    expect(toPersistedSpendingAnomaly(result)).toEqual({
      scope: 'category',
      key: 'groceries',
      label: 'Groceries',
      currency: 'EUR',
      currentAmount: 150,
      mean: 100,
      zScore: 5,
      percentAboveBaseline: 50,
    });
  });

  test('keeps currencies separate and sorts deterministically', () => {
    const results = detectSpendingAnomalies([
      { ...base, key: 'b', currentAmount: 160, baseline: [100, 100, 100].map((amount, index) => ({ period: `p${index}`, amount })) },
      { ...base, key: 'a', currency: 'USD', currentAmount: 200, baseline: [100, 100, 100].map((amount, index) => ({ period: `q${index}`, amount })) },
    ]);
    expect(results.map((result) => `${result.currency}:${result.key}`)).toEqual(['USD:a', 'EUR:b']);
  });
});
