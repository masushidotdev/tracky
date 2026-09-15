import { describe, expect, test } from 'vitest';
import { buildMoneyBoxFundingPlan, similarAmount } from './banking/planningMath';

describe('money box funding math', () => {
  test('calculates monthly funding needed for a future annual expense', () => {
    const plan = buildMoneyBoxFundingPlan({
      targetAmount: {
        amountMinor: 120000n,
        currency: 'EUR',
      },
      savedAmount: {
        amountMinor: 30000n,
        currency: 'EUR',
      },
      targetDate: '2026-12-31',
      createdAtMs: Date.UTC(2026, 0, 1),
      asOfDate: '2026-04-15',
    });

    expect(plan.remainingAmount.amountMinor).toBe(90000n);
    expect(plan.monthlyRequiredAmount.amountMinor).toBe(10000n);
    expect(plan.expectedSavedAmount.amountMinor).toBe(30000n);
    expect(plan.monthsRemaining).toBe(9);
    expect(plan.progressPercent).toBe(25);
    expect(plan.fundingStatus).toBe('onTrack');
  });

  test('marks underfunded and near-due money boxes distinctly', () => {
    const behindPlan = buildMoneyBoxFundingPlan({
      targetAmount: {
        amountMinor: 120000n,
        currency: 'EUR',
      },
      savedAmount: {
        amountMinor: 10000n,
        currency: 'EUR',
      },
      targetDate: '2026-12-31',
      createdAtMs: Date.UTC(2026, 0, 1),
      asOfDate: '2026-04-15',
    });
    const dueSoonPlan = buildMoneyBoxFundingPlan({
      targetAmount: {
        amountMinor: 100000n,
        currency: 'EUR',
      },
      savedAmount: {
        amountMinor: 50000n,
        currency: 'EUR',
      },
      targetDate: '2026-04-20',
      createdAtMs: Date.UTC(2026, 3, 1),
      asOfDate: '2026-04-01',
    });

    expect(behindPlan.fundingStatus).toBe('behind');
    expect(dueSoonPlan.fundingStatus).toBe('dueSoon');
    expect(dueSoonPlan.monthlyRequiredAmount.amountMinor).toBe(50000n);
  });

  test('classifies linear pace boundaries and completed goals', () => {
    const base = {
      targetAmount: { amountMinor: 120000n, currency: 'EUR' },
      targetDate: '2026-12-31',
      createdAtMs: Date.UTC(2026, 0, 1),
      asOfDate: '2026-04-15',
    };

    const onTrack = buildMoneyBoxFundingPlan({
      ...base,
      savedAmount: { amountMinor: 30000n, currency: 'EUR' },
    });
    const ahead = buildMoneyBoxFundingPlan({
      ...base,
      savedAmount: { amountMinor: 30001n, currency: 'EUR' },
    });
    const behind = buildMoneyBoxFundingPlan({
      ...base,
      savedAmount: { amountMinor: 29999n, currency: 'EUR' },
    });
    const completed = buildMoneyBoxFundingPlan({
      ...base,
      savedAmount: { amountMinor: 120000n, currency: 'EUR' },
    });

    expect(onTrack).toMatchObject({ status: 'onTrack', deltaMinor: 0n });
    expect(ahead).toMatchObject({ status: 'ahead', deltaMinor: 1n });
    expect(behind).toMatchObject({ status: 'behind', deltaMinor: -1n });
    expect(completed).toMatchObject({
      status: 'completed',
      projectedCompletionDate: '2026-04-15',
    });
  });

  test('projects growth-accelerated completion with bigint monthly compounding', () => {
    const base = {
      targetAmount: { amountMinor: 100000n, currency: 'EUR' },
      savedAmount: { amountMinor: 50000n, currency: 'EUR' },
      targetDate: '2027-04-15',
      createdAtMs: Date.UTC(2026, 3, 15),
      asOfDate: '2026-04-15',
    };

    const withoutGrowth = buildMoneyBoxFundingPlan(base);
    const withGrowth = buildMoneyBoxFundingPlan({ ...base, growthRatePct: 20 });

    expect(withoutGrowth.projectedCompletionDate).not.toBeNull();
    expect(withGrowth.projectedCompletionDate).not.toBeNull();
    expect((withGrowth.projectedCompletionDate ?? '') < (withoutGrowth.projectedCompletionDate ?? '')).toBe(true);
  });

  test('returns no projected date when funding is zero and growth cannot reach the target', () => {
    const plan = buildMoneyBoxFundingPlan({
      targetAmount: { amountMinor: 100000n, currency: 'EUR' },
      savedAmount: { amountMinor: 10000n, currency: 'EUR' },
      targetDate: '2030-12-31',
      createdAtMs: Date.UTC(2026, 0, 1),
      asOfDate: '2026-04-15',
      monthlyFundingPaceMinor: 0n,
      growthRatePct: 0,
    });

    expect(plan.projectedCompletionDate).toBeNull();
  });

  test('matches similar money amounts with shared tolerance', () => {
    expect(similarAmount(10000n, 10900n)).toBe(true);
    expect(similarAmount(10000n, 12000n)).toBe(false);
  });
});
