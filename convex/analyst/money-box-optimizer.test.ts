// @vitest-environment node

import { describe, expect, test } from 'vitest';
import { optimizeMoneyBoxFunding } from './moneyBoxOptimizerCore';

const boxes = [
  {
    id: 'later',
    name: 'Holiday',
    targetDate: '2027-06-01',
    currency: 'EUR',
    remainingMinor: 30_000n,
    monthlyRequiredMinor: 10_000n,
    fundingStatus: 'onTrack' as const,
  },
  {
    id: 'urgent',
    name: 'Emergency',
    targetDate: '2026-08-01',
    currency: 'EUR',
    remainingMinor: 15_000n,
    monthlyRequiredMinor: 15_000n,
    fundingStatus: 'behind' as const,
  },
];

describe('money-box optimizer', () => {
  test('allocates sufficient funding deterministically without exceeding monthly requirements', () => {
    const result = optimizeMoneyBoxFunding({ moneyBoxes: boxes, currency: 'EUR', availableMinor: 30_000n });
    expect(result.allocations.map((row) => [row.name, row.allocationMinor])).toEqual([
      ['Emergency', 15_000n],
      ['Holiday', 10_000n],
    ]);
    expect(result.unallocatedMinor).toBe(5_000n);
    expect(result.shortfallMinor).toBe(0n);
  });

  test('routes scarce funding to behind boxes before on-track boxes', () => {
    const result = optimizeMoneyBoxFunding({ moneyBoxes: boxes, currency: 'EUR', availableMinor: 18_000n });
    expect(result.allocations[0].allocationMinor).toBe(15_000n);
    expect(result.allocations[1].allocationMinor).toBe(3_000n);
    expect(result.shortfallMinor).toBe(7_000n);
  });

  test('honors explicit priority, validates currencies, and preserves integer rounding', () => {
    const result = optimizeMoneyBoxFunding({
      moneyBoxes: boxes,
      currency: 'EUR',
      availableMinor: 10_001n,
      priorityNames: ['Holiday'],
    });
    expect(result.allocations[0].name).toBe('Holiday');
    expect(result.allocations[0].allocationMinor).toBe(10_000n);
    expect(result.allocations[1].allocationMinor).toBe(1n);
    expect(() =>
      optimizeMoneyBoxFunding({
        moneyBoxes: [{ ...boxes[0], currency: 'USD' }],
        currency: 'EUR',
        availableMinor: 100n,
      }),
    ).toThrow('currencies');
  });
});
