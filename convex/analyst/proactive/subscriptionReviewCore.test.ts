// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { reviewSubscriptions } from './subscriptionReviewCore';

describe('reviewSubscriptions', () => {
  test('normalizes duplicates and totals independently per currency', () => {
    const result = reviewSubscriptions(
      [
        { id: 'a', name: 'Video+', merchantName: 'Acme Video', monthlyAmount: 10, currency: 'EUR', source: 'manual' },
        { id: 'b', name: 'Video Plus', merchantName: 'ACME-video', monthlyAmount: 12, currency: 'EUR', source: 'manual' },
        { id: 'c', name: 'Music', monthlyAmount: 5, currency: 'USD', source: 'manual' },
      ],
      { EUR: 1_000, USD: 500 },
      '2026-07-11',
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ currency: 'EUR', monthlyTotal: 22, annualTotal: 264, activeCount: 2 });
    expect(result[0].duplicateGroups[0].subscriptionIds).toEqual(['a', 'b']);
    expect(result[1]).toMatchObject({ currency: 'USD', monthlyTotal: 5, annualTotal: 60 });
  });

  test('marks only old detected subscriptions stale', () => {
    const [result] = reviewSubscriptions(
      [
        { id: 'detected', name: 'Old', monthlyAmount: 10, currency: 'EUR', source: 'detected', latestTransactionDate: '2026-01-01' },
        { id: 'manual', name: 'Manual', monthlyAmount: 10, currency: 'EUR', source: 'manual' },
      ],
      { EUR: 1_000 },
      '2026-07-11',
    );
    expect(result.staleSubscriptions.map((row) => row.id)).toEqual(['detected']);
    expect(result.shouldNotify).toBe(true);
  });
});
