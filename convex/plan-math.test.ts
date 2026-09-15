import { describe, expect, test } from 'vitest';
import {
  available,
  carryIn,
  cashOverspending,
  planLiquidityMinor,
  planTargetStatus,
  readyToAssign,
  targetDueDateForPeriod,
  targetNeededMinor,
  targetUnderfundedMinor,
  underfundedPriority,
  weekdayOccurrencesInPeriod,
} from './banking/planMath';
import type { PlanTargetBehaviour, PlanTargetCadence, PlanTargetDefinition } from './banking/planMath';

describe('plan math', () => {
  test('rolls positive availability into the next month', () => {
    const january = available(0n, 100_00n, -35_00n);
    const february = available(carryIn(january), 20_00n, -10_00n);

    expect(january).toBe(65_00n);
    expect(february).toBe(75_00n);
  });

  test('does not roll negative availability and exposes cash overspending', () => {
    const january = available(0n, 20_00n, -35_00n);
    const february = available(carryIn(january), 10_00n, -4_00n);

    expect(january).toBe(-15_00n);
    expect(carryIn(january)).toBe(0n);
    expect(february).toBe(6_00n);
    expect(cashOverspending([january, 9_00n, -2_00n])).toBe(-17_00n);
  });

  test('excludes every card balance from plan liquidity', () => {
    expect(
      planLiquidityMinor([
        { accountType: 'CACC', balanceMinor: 100_00n },
        { accountType: 'CARD', balanceMinor: -25_00n },
        { accountType: 'card', balanceMinor: 40_00n },
      ]),
    ).toBe(100_00n);
  });

  test('keeps ready to assign coherent across a multi-month sequence', () => {
    const januaryAvailable = [available(0n, 60_00n, -20_00n), available(0n, 25_00n, -30_00n)];
    const februaryAvailable = [
      available(carryIn(januaryAvailable[0]), 10_00n, -15_00n),
      available(carryIn(januaryAvailable[1]), 20_00n, -5_00n),
    ];

    // January's overspent bucket reserves nothing, so only the 40,00 still held is subtracted.
    expect(readyToAssign(90_00n, januaryAvailable)).toBe(50_00n);
    expect(cashOverspending(januaryAvailable)).toBe(-5_00n);
    expect(februaryAvailable).toEqual([35_00n, 15_00n]);
    expect(readyToAssign(85_00n, februaryAvailable)).toBe(35_00n);
  });

  test('does not hand overspending back as assignable money', () => {
    // 1.000 in the account, nothing assigned, 100 spent: the plan used to offer 1.000 while the
    // user held 900, because subtracting a negative available added it back.
    expect(readyToAssign(900_00n, [available(0n, 0n, -100_00n)])).toBe(900_00n);
  });

  test('moves one for one with assigning and with overspending', () => {
    const funded = available(0n, 100_00n, 0n);
    const spentWithin = available(0n, 100_00n, -30_00n);
    const overspent = available(0n, 100_00n, -200_00n);

    expect(readyToAssign(1_000_00n, [])).toBe(1_000_00n);
    expect(readyToAssign(1_000_00n, [funded])).toBe(900_00n);
    // Spending what the bucket holds moves liquidity and availability together.
    expect(readyToAssign(970_00n, [spentWithin])).toBe(900_00n);
    // Overspending by 100 costs 100 straight away instead of waiting for the rollover.
    expect(readyToAssign(800_00n, [overspent])).toBe(800_00n);
  });

  test.each<{
    cadence: PlanTargetCadence;
    behaviour: PlanTargetBehaviour;
    expected: bigint;
  }>([
    { cadence: 'weekly', behaviour: 'setAside', expected: 6_000n },
    { cadence: 'weekly', behaviour: 'refill', expected: 5_800n },
    { cadence: 'weekly', behaviour: 'balanceBy', expected: 6_000n },
    { cadence: 'monthly', behaviour: 'setAside', expected: 1_200n },
    { cadence: 'monthly', behaviour: 'refill', expected: 1_000n },
    { cadence: 'monthly', behaviour: 'balanceBy', expected: 1_200n },
    { cadence: 'yearly', behaviour: 'setAside', expected: 240n },
    { cadence: 'yearly', behaviour: 'refill', expected: 200n },
    { cadence: 'yearly', behaviour: 'balanceBy', expected: 200n },
    { cadence: 'custom', behaviour: 'setAside', expected: 1_200n },
    { cadence: 'custom', behaviour: 'refill', expected: 1_000n },
    { cadence: 'custom', behaviour: 'balanceBy', expected: 200n },
  ])('calculates $cadence $behaviour targets with bigint funding maths', ({ cadence, behaviour, expected }) => {
    const target: PlanTargetDefinition = {
      cadence,
      behaviour,
      amountMinor: 1_200n,
      dueDate: '2026-12-15',
      dayOfWeek: 6,
      repeats: false,
      snoozedPeriods: [],
    };

    expect(targetNeededMinor(target, '2026-08', 200n)).toBe(expected);
  });

  test('a yearly refill target stays level as the fund fills, while set-aside climbs', () => {
    // The Plan walkthrough tells users to pick "refill up to" for an annual bill. This pins why:
    // set-aside ignores what is already put away, so its ask grows as the due date approaches.
    const base = {
      cadence: 'yearly',
      amountMinor: 60_000n,
      dueDate: '2027-03-10',
      repeats: true,
      snoozedPeriods: [],
    } satisfies Omit<PlanTargetDefinition, 'behaviour'>;
    const refill: PlanTargetDefinition = { ...base, behaviour: 'refill' };
    const setAside: PlanTargetDefinition = { ...base, behaviour: 'setAside' };

    // Nine months to go and nothing saved: the two agree.
    expect(targetNeededMinor(refill, '2026-07', 0n)).toBe(6_667n);
    expect(targetNeededMinor(setAside, '2026-07', 0n)).toBe(6_667n);

    // Six months to go with 200,00 already set aside: refill holds, set-aside asks half as much again.
    expect(targetNeededMinor(refill, '2026-10', 20_000n)).toBe(6_667n);
    expect(targetNeededMinor(setAside, '2026-10', 20_000n)).toBe(10_000n);
  });

  test('funds a repeating custom target over six months and advances its due date by six months', () => {
    const target: PlanTargetDefinition = {
      cadence: 'custom',
      behaviour: 'refill',
      amountMinor: 60_000n,
      dueDate: '2026-01-15',
      repeats: true,
      repeatIntervalCount: 6,
      repeatIntervalUnit: 'month',
      snoozedPeriods: [],
    };

    expect(targetDueDateForPeriod(target, '2026-02')).toBe('2026-07-15');
    expect(targetNeededMinor(target, '2026-02', 0n)).toBe(10_000n);
  });

  test('funds a repeating custom target over two years', () => {
    const target: PlanTargetDefinition = {
      cadence: 'custom',
      behaviour: 'refill',
      amountMinor: 240_000n,
      dueDate: '2025-12-20',
      repeats: true,
      repeatIntervalCount: 2,
      repeatIntervalUnit: 'year',
      snoozedPeriods: [],
    };

    expect(targetDueDateForPeriod(target, '2026-01')).toBe('2027-12-20');
    expect(targetNeededMinor(target, '2026-01', 0n)).toBe(10_000n);
  });

  test('advances a stale repeating due date across every elapsed interval', () => {
    const target: PlanTargetDefinition = {
      cadence: 'custom',
      behaviour: 'refill',
      amountMinor: 60_000n,
      dueDate: '2020-01-31',
      repeats: true,
      repeatIntervalCount: 6,
      repeatIntervalUnit: 'month',
      snoozedPeriods: [],
    };

    expect(targetDueDateForPeriod(target, '2026-09')).toBe('2027-01-31');
  });

  test('keeps legacy custom targets without an interval unchanged', () => {
    const target: PlanTargetDefinition = {
      cadence: 'custom',
      behaviour: 'refill',
      amountMinor: 60_000n,
      dueDate: '2025-12-20',
      repeats: true,
      snoozedPeriods: [],
    };

    expect(targetDueDateForPeriod(target, '2026-01')).toBe('2026-12-20');
    expect(targetNeededMinor(target, '2026-01', 10_000n)).toBe(50_000n);
  });

  test('counts five weekly occurrences in a five-week month', () => {
    expect(weekdayOccurrencesInPeriod('2026-08', 6)).toBe(5);
  });

  test('treats a past balance-by due date as due now', () => {
    const target: PlanTargetDefinition = {
      cadence: 'custom',
      behaviour: 'balanceBy',
      amountMinor: 1_000n,
      dueDate: '2026-06-01',
      repeats: false,
      snoozedPeriods: [],
    };

    expect(targetNeededMinor(target, '2026-08', 200n)).toBe(800n);
  });

  test('removes snoozed targets from underfunded without removing their monthly need', () => {
    const target: PlanTargetDefinition = {
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 1_000n,
      repeats: true,
      snoozedPeriods: ['2026-08'],
    };

    expect(targetNeededMinor(target, '2026-08', 0n)).toBe(1_000n);
    expect(targetUnderfundedMinor({ target, period: '2026-08', carryInMinor: 0n, assignedMinor: 100n })).toBe(0n);
  });

  test('orders underfunded work and resolves row status by severity', () => {
    expect(underfundedPriority({ period: '2026-08', availableMinor: -1n, target: null })).toBe(0);
    expect(
      underfundedPriority({
        period: '2026-08',
        availableMinor: 0n,
        target: { cadence: 'custom', dueDate: '2026-08-10' },
      }),
    ).toBe(1);
    expect(underfundedPriority({ period: '2026-08', availableMinor: 0n, target: { cadence: 'monthly' } })).toBe(2);
    expect(underfundedPriority({ period: '2026-08', availableMinor: 0n, target: { cadence: 'yearly' } })).toBe(3);
    expect(
      planTargetStatus({
        target: null,
        neededMinor: 0n,
        underfundedMinor: 10n,
        assignedMinor: 0n,
        availableMinor: -1n,
      }),
    ).toBe('overspent');
    expect(
      planTargetStatus({
        target: null,
        neededMinor: 10n,
        underfundedMinor: 10n,
        assignedMinor: 0n,
        availableMinor: 0n,
      }),
    ).toBe('underfunded');
    expect(
      planTargetStatus({ target: null, neededMinor: 0n, underfundedMinor: 0n, assignedMinor: 0n, availableMinor: 0n }),
    ).toBe('funded');
    expect(
      planTargetStatus({
        target: {
          cadence: 'monthly',
          behaviour: 'setAside',
          amountMinor: 10n,
          repeats: true,
          snoozedPeriods: [],
        },
        neededMinor: 10n,
        underfundedMinor: 0n,
        assignedMinor: 11n,
        availableMinor: 11n,
      }),
    ).toBe('overfunded');
  });
});
