import { describe, expect, it } from 'vitest';

import { planBucketProgress } from './plan-status';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanBucket } from './types';

function bucket(overrides: Partial<PlanBucket> = {}): PlanBucket {
  return {
    bucketId: 'bucket' as Id<'planBuckets'>,
    name: 'Groceries',
    hidden: false,
    cardAccountId: null,
    installmentPlanId: null,
    moneyBoxId: null,
    moneyBoxName: null,
    categoryIds: [],
    assignedMinor: 0n,
    activityMinor: 0n,
    coveredCardSpendMinor: 0n,
    creditOverspendMinor: 0n,
    availableMinor: 0n,
    carryInMinor: 0n,
    moneyBoxPrefundedMinor: 0n,
    cardDebtMinor: 0n,
    installmentCoveredDebtMinor: 0n,
    dueDate: undefined,
    target: null,
    neededMinor: 0n,
    underfundedMinor: 0n,
    snoozed: false,
    status: 'funded',
    ...overrides,
  };
}

describe('planBucketProgress', () => {
  it('prioritizes overspending over a target gap', () => {
    const progress = planBucketProgress(
      bucket({
        carryInMinor: 10_000n,
        assignedMinor: 30_000n,
        activityMinor: -42_890n,
        availableMinor: -2_890n,
        neededMinor: 50_000n,
        underfundedMinor: 20_000n,
        status: 'overspent',
        target: {
          id: 'target' as Id<'planTargets'>,
          cadence: 'monthly',
          behaviour: 'setAside',
          amountMinor: 50_000n,
          currency: 'EUR',
          dueDate: undefined,
          dayOfMonth: undefined,
          dayOfWeek: undefined,
          repeats: true,
        },
      }),
    );

    expect(progress.message).toEqual({
      kind: 'overspent',
      amountMinor: 2_890n,
      availableToSpendMinor: 40_000n,
      cashAmountMinor: 2_890n,
      creditAmountMinor: 0n,
    });
    expect(progress.tone).toBe('destructive');
  });

  it('splits mixed overspending into destructive cash and warning credit shares', () => {
    const progress = planBucketProgress(
      bucket({
        assignedMinor: 1_000n,
        activityMinor: -2_500n,
        availableMinor: -1_500n,
        creditOverspendMinor: 1_000n,
        status: 'overspent',
      }),
    );

    expect(progress.message).toEqual({
      kind: 'overspent',
      amountMinor: 1_500n,
      availableToSpendMinor: 1_000n,
      cashAmountMinor: 500n,
      creditAmountMinor: 1_000n,
    });
    expect(progress.tone).toBe('destructive');
  });

  it('uses the warning tone when all overspending is credit-backed', () => {
    const progress = planBucketProgress(
      bucket({
        activityMinor: -2_000n,
        availableMinor: -2_000n,
        creditOverspendMinor: 2_000n,
        status: 'overspent',
      }),
    );

    expect(progress.message).toEqual({
      kind: 'overspent',
      amountMinor: 2_000n,
      availableToSpendMinor: 0n,
      cashAmountMinor: 0n,
      creditAmountMinor: 2_000n,
    });
    expect(progress.tone).toBe('warning');
  });

  it('includes the due day only when the target has a due date', () => {
    const withDueDate = planBucketProgress(
      bucket({
        underfundedMinor: 2_500n,
        status: 'underfunded',
        target: {
          id: 'target' as Id<'planTargets'>,
          cadence: 'yearly',
          behaviour: 'setAside',
          amountMinor: 10_000n,
          currency: 'EUR',
          dueDate: '2026-12-19',
          dayOfMonth: undefined,
          dayOfWeek: undefined,
          repeats: true,
        },
      }),
    );
    const withoutDueDate = planBucketProgress(
      bucket({
        underfundedMinor: 2_500n,
        status: 'underfunded',
      }),
    );

    expect(withDueDate.message).toEqual({ kind: 'underfunded', amountMinor: 2_500n, dueDay: 19 });
    expect(withoutDueDate.message).toEqual({ kind: 'underfunded', amountMinor: 2_500n, dueDay: undefined });
  });

  it('recognizes a funded bucket whose spendable amount was fully spent', () => {
    const progress = planBucketProgress(
      bucket({ assignedMinor: 10_000n, activityMinor: -10_000n, availableMinor: 0n }),
    );

    expect(progress.message).toEqual({ kind: 'fullySpent' });
    expect(progress.tone).toBe('muted');
  });

  it('keeps snoozing visible without replacing a higher-priority state', () => {
    const progress = planBucketProgress(bucket({ assignedMinor: 5_000n, availableMinor: 5_000n, snoozed: true }));

    expect(progress.message).toEqual({ kind: 'funded' });
    expect(progress.snoozed).toBe(true);
    expect(progress.tone).toBe('positive');
  });

  it('uses target funding progress when a target exists', () => {
    const progress = planBucketProgress(
      bucket({
        assignedMinor: 2_500n,
        availableMinor: 2_500n,
        neededMinor: 10_000n,
        underfundedMinor: 7_500n,
        status: 'underfunded',
        target: {
          id: 'target' as Id<'planTargets'>,
          cadence: 'monthly',
          behaviour: 'setAside',
          amountMinor: 10_000n,
          currency: 'EUR',
          dueDate: undefined,
          dayOfMonth: undefined,
          dayOfWeek: undefined,
          repeats: true,
        },
      }),
    );

    expect(progress.percent).toBe(25);
    expect(progress.tone).toBe('warning');
  });

  it('measures card payment progress against current debt without a target row', () => {
    const progress = planBucketProgress(
      bucket({
        cardAccountId: 'card' as Id<'financialAccounts'>,
        cardDebtMinor: 20_000n,
        neededMinor: 20_000n,
        underfundedMinor: 15_000n,
        availableMinor: 5_000n,
        status: 'underfunded',
      }),
    );

    expect(progress.percent).toBe(25);
    expect(progress.tone).toBe('warning');
  });

  it('uses spending against the pre-activity amount without a target', () => {
    const progress = planBucketProgress(
      bucket({ carryInMinor: 5_000n, assignedMinor: 5_000n, activityMinor: -4_000n, availableMinor: 6_000n }),
    );

    expect(progress.percent).toBe(40);
    expect(progress.tone).toBe('positive');
  });
});
