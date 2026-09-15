import { describe, expect, test } from 'vitest';
import {
  addMonthsToIsoDate,
  buildCreditFacilitySummary,
  buildInstallmentPaymentSchedule,
  buildRemainingInstallmentRepaymentAmount,
  estimateInstallmentPaymentMinor,
} from './banking/creditMath';

describe('credit facility math', () => {
  test('calculates available amount and utilization separately from cash balance', () => {
    const limit = {
      amountMinor: 300000n,
      currency: 'EUR',
    };
    const used = {
      amountMinor: 125000n,
      currency: 'EUR',
    };
    const summary = buildCreditFacilitySummary(limit, used);

    expect(summary.availableAmount.amountMinor).toBe(175000n);
    expect(summary.utilizationPercent).toBe(41.66);
    expect(summary.isOverLimit).toBe(false);
    expect(buildCreditFacilitySummary(limit, used, undefined)).toEqual(summary);
  });

  test('counts active installment residual as occupied facility limit', () => {
    const summary = buildCreditFacilitySummary(
      {
        amountMinor: 250000n,
        currency: 'EUR',
      },
      {
        amountMinor: 0n,
        currency: 'EUR',
      },
      {
        amountMinor: 120000n,
        currency: 'EUR',
      },
    );

    expect(summary.availableAmount.amountMinor).toBe(130000n);
    expect(summary.utilizationPercent).toBe(48);
    expect(summary.isOverLimit).toBe(false);
  });

  test('marks facilities over limit without returning negative availability', () => {
    const summary = buildCreditFacilitySummary(
      {
        amountMinor: 100000n,
        currency: 'EUR',
      },
      {
        amountMinor: 125000n,
        currency: 'EUR',
      },
    );

    expect(summary.availableAmount.amountMinor).toBe(0n);
    expect(summary.utilizationPercent).toBe(125);
    expect(summary.isOverLimit).toBe(true);
  });

  test('estimates installment payments with and without interest', () => {
    expect(estimateInstallmentPaymentMinor(120000n, undefined, 12)).toBe(10000n);
    expect(estimateInstallmentPaymentMinor(500000n, 650, 24)).toBeGreaterThan(21000n);
    expect(estimateInstallmentPaymentMinor(500000n, 650, 24)).toBeLessThan(23000n);
  });

  test('adds months to ISO dates for installment plan boundaries', () => {
    expect(addMonthsToIsoDate('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonthsToIsoDate('2026-01-15', 24)).toBe('2028-01-15');
  });

  test('calculates remaining repayment total from the scheduled installments', () => {
    expect(
      buildRemainingInstallmentRepaymentAmount({
        monthlyPaymentAmount: {
          amountMinor: 6096n,
          currency: 'EUR',
        },
        remainingInstallments: 16,
      }),
    ).toEqual({
      amountMinor: 97536n,
      currency: 'EUR',
    });
    expect(
      buildRemainingInstallmentRepaymentAmount({
        monthlyPaymentAmount: { amountMinor: 13025n, currency: 'EUR' },
        outstandingAmount: { amountMinor: 39076n, currency: 'EUR' },
        remainingInstallments: 3,
      }),
    ).toEqual({ amountMinor: 39076n, currency: 'EUR' });
  });

  test('puts a principal rounding shortfall into the final scheduled installment', () => {
    const schedule = buildInstallmentPaymentSchedule({
      monthlyPaymentAmount: { amountMinor: 13025n, currency: 'EUR' },
      outstandingAmount: { amountMinor: 39076n, currency: 'EUR' },
      startDate: '2026-09-05',
      nextPaymentDate: '2026-09-05',
      remainingInstallments: 3,
      asOfDate: '2026-09-01',
      monthsAhead: 3,
    });

    expect(schedule.map((payment) => payment.amount.amountMinor)).toEqual([13025n, 13025n, 13026n]);
  });

  test('builds upcoming installment payments including overdue payments', () => {
    const schedule = buildInstallmentPaymentSchedule({
      monthlyPaymentAmount: {
        amountMinor: 22153n,
        currency: 'EUR',
      },
      startDate: '2026-01-10',
      nextPaymentDate: '2026-02-10',
      remainingInstallments: 4,
      asOfDate: '2026-03-01',
      monthsAhead: 3,
    });

    expect(schedule).toEqual([
      {
        dueDate: '2026-02-10',
        amount: {
          amountMinor: 22153n,
          currency: 'EUR',
        },
        sequenceNumber: 1,
        remainingAfterPayment: 3,
      },
      {
        dueDate: '2026-03-10',
        amount: {
          amountMinor: 22153n,
          currency: 'EUR',
        },
        sequenceNumber: 2,
        remainingAfterPayment: 2,
      },
      {
        dueDate: '2026-04-10',
        amount: {
          amountMinor: 22153n,
          currency: 'EUR',
        },
        sequenceNumber: 3,
        remainingAfterPayment: 1,
      },
      {
        dueDate: '2026-05-10',
        amount: {
          amountMinor: 22153n,
          currency: 'EUR',
        },
        sequenceNumber: 4,
        remainingAfterPayment: 0,
      },
    ]);
  });

  test('returns no schedule when there are no remaining installments', () => {
    expect(
      buildInstallmentPaymentSchedule({
        monthlyPaymentAmount: {
          amountMinor: 10000n,
          currency: 'EUR',
        },
        startDate: '2026-01-10',
        remainingInstallments: 0,
        asOfDate: '2026-03-01',
      }),
    ).toEqual([]);
  });
});
