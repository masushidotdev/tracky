import { describe, expect, test, vi } from 'vitest';
import {
  currentPeriod,
  isPlanActivityEligible,
  periodEndDate,
  periodStartDate,
  signedActivityMinor,
} from './banking/planActivity';
import type { Id } from './_generated/dataModel';

type ActivityTransaction = Parameters<typeof isPlanActivityEligible>[0];

function activityTransaction(overrides: Partial<ActivityTransaction> = {}): ActivityTransaction {
  return {
    status: 'BOOK',
    classificationKind: 'expense',
    direction: 'DBIT',
    amount: { amountMinor: 1234n, currency: 'EUR' },
    ...overrides,
  };
}

describe('plan activity policy', () => {
  test('builds UTC periods and the following-month exclusive end date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T23:59:59.000Z'));
    try {
      expect(currentPeriod()).toBe('2026-12');
      expect(periodStartDate('2026-12')).toBe('2026-12-01');
      expect(periodEndDate('2026-12')).toBe('2027-01-01');
      expect(periodEndDate('2026-07')).toBe('2026-08-01');
    } finally {
      vi.useRealTimers();
    }
  });

  test.each(['PDNG', 'CNCL', 'RJCT', 'HOLD', 'SCHD', 'OTHR'] as const)('excludes %s transactions', (status) => {
    expect(isPlanActivityEligible(activityTransaction({ status }), { currency: 'EUR' })).toBe(false);
  });

  test('counts booked transactions and preserves signed net activity', () => {
    const debit = activityTransaction({ amount: { amountMinor: -5000n, currency: 'EUR' } });
    const credit = activityTransaction({ direction: 'CRDT', amount: { amountMinor: -2000n, currency: 'EUR' } });

    expect(isPlanActivityEligible(debit, { currency: 'EUR' })).toBe(true);
    expect(signedActivityMinor(debit)).toBe(-5000n);
    expect(signedActivityMinor(credit)).toBe(2000n);
  });

  test('excludes transfers, defensive transfer matches, and different currencies', () => {
    const transferMatchId = 'transfer_match_test' as Id<'transferMatches'>;

    expect(
      isPlanActivityEligible(activityTransaction({ classificationKind: 'transfer', transferMatchId }), {
        currency: 'EUR',
      }),
    ).toBe(false);
    expect(
      isPlanActivityEligible(activityTransaction({ classificationKind: 'expense', transferMatchId }), {
        currency: 'EUR',
      }),
    ).toBe(false);
    expect(isPlanActivityEligible(activityTransaction(), { currency: 'USD' })).toBe(false);
  });

  test('keeps income and unclassified inflows out of category activity', () => {
    const salary = activityTransaction({ classificationKind: 'income', direction: 'CRDT' });
    const unclassifiedInflow = activityTransaction({ classificationKind: 'uncategorized', direction: 'CRDT' });
    const refund = activityTransaction({ classificationKind: 'expense', direction: 'CRDT' });

    expect(isPlanActivityEligible(salary, { currency: 'EUR' })).toBe(false);
    expect(isPlanActivityEligible(unclassifiedInflow, { currency: 'EUR' })).toBe(false);
    expect(isPlanActivityEligible(refund, { currency: 'EUR' })).toBe(true);
    expect(isPlanActivityEligible(activityTransaction({ classificationKind: 'uncategorized' }), { currency: 'EUR' })).toBe(
      true,
    );
  });

  test('does not let report visibility exclude plan activity', () => {
    const transaction = {
      ...activityTransaction(),
      hiddenFromReports: true,
    };

    expect(isPlanActivityEligible(transaction, { currency: 'EUR' })).toBe(true);
  });
});
