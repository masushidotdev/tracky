import { describe, expect, test } from 'vitest';
import { remainingRepaymentAmount } from './helpers';

describe('credit facility UI helpers', () => {
  test('does not hide a principal cent omitted by equal installment rounding', () => {
    expect(
      remainingRepaymentAmount({
        monthlyPaymentAmount: { amountMinor: 13025n, currency: 'EUR' },
        outstandingAmount: { amountMinor: 39076n, currency: 'EUR' },
        remainingInstallments: 3,
      }),
    ).toEqual({ amountMinor: 39076n, currency: 'EUR' });
  });
});
