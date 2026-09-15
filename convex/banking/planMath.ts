import { calendarMonthsInclusive, positiveCeilDivide } from './planningMath';

export type PlanLiquidityAccount = {
  accountType?: string | null;
  balanceMinor: bigint;
};

export type PlanTargetCadence = 'weekly' | 'monthly' | 'yearly' | 'custom';
export type PlanTargetBehaviour = 'setAside' | 'refill' | 'balanceBy';
export type PlanTargetStatus = 'overspent' | 'underfunded' | 'funded' | 'overfunded';

export type PlanTargetDefinition = {
  cadence: PlanTargetCadence;
  behaviour: PlanTargetBehaviour;
  amountMinor: bigint;
  dueDate?: string;
  dayOfMonth?: number;
  dayOfWeek?: number;
  repeats: boolean;
  repeatIntervalCount?: number;
  repeatIntervalUnit?: 'month' | 'year';
  snoozedPeriods: Array<string>;
};

export function carryIn(previousAvailableMinor: bigint) {
  return previousAvailableMinor > 0n ? previousAvailableMinor : 0n;
}

export function available(carryInMinor: bigint, assignedMinor: bigint, activityMinor: bigint) {
  return carryInMinor + assignedMinor + activityMinor;
}

export function cashOverspending(availableMinors: Iterable<bigint>) {
  let total = 0n;
  for (const availableMinor of availableMinors) {
    total += availableMinor < 0n ? availableMinor : 0n;
  }
  return total;
}

/**
 * A credit card is debt, not negative cash. Its balance never changes plan liquidity: cash reserved
 * to repay it lives in the card's payment bucket instead.
 */
export function planLiquidityMinor(accounts: Iterable<PlanLiquidityAccount>) {
  let total = 0n;
  for (const account of accounts) {
    if (account.accountType?.toUpperCase() === 'CARD') continue;
    total += account.balanceMinor;
  }
  return total;
}

/**
 * Only what buckets actually hold is subtracted: a bucket in the red reserves nothing, and counting
 * its negative available handed the overspending back as assignable money — 1.000 in the account,
 * nothing assigned, 100 spent, and the plan offered 1.000 while the user held 900.
 *
 * So: assigning 100 lowers this by 100, spending within a bucket leaves it alone, overspending by 100
 * lowers it by 100 straight away rather than at the month rollover, and it never exceeds liquidity.
 */
export function readyToAssign(liquidityMinor: bigint, availableMinors: Iterable<bigint>) {
  let totalReserved = 0n;
  for (const availableMinor of availableMinors) {
    if (availableMinor > 0n) totalReserved += availableMinor;
  }
  return liquidityMinor - totalReserved;
}

function overdraftStockMinor(liquidityMinor: bigint) {
  return liquidityMinor < 0n ? -liquidityMinor : 0n;
}

/**
 * Positive is progress out of overdraft; negative means the overdraft grew. Capping each month at
 * zero keeps a move from -100 to +50 as 100 of debt repaid rather than 150 of "progress".
 */
export function overdraftProgressMinor(previousLiquidityMinor: bigint, liquidityMinor: bigint) {
  return overdraftStockMinor(previousLiquidityMinor) - overdraftStockMinor(liquidityMinor);
}

export function overdraftMonthlyStepMinor(amountMinor: bigint, period: string, targetDate: string) {
  const monthsRemaining = calendarMonthsInclusive(`${period}-01`, targetDate);
  return positiveCeilDivide(amountMinor, BigInt(monthsRemaining));
}

export function weekdayOccurrencesInPeriod(period: string, dayOfWeek: number) {
  const [year, month] = period.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let occurrences = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === dayOfWeek) occurrences += 1;
  }
  return occurrences;
}

function customRepeatIntervalMonths(target: PlanTargetDefinition) {
  if (
    target.cadence !== 'custom' ||
    !target.repeats ||
    !Number.isInteger(target.repeatIntervalCount) ||
    target.repeatIntervalCount === undefined ||
    target.repeatIntervalCount <= 0 ||
    (target.repeatIntervalUnit !== 'month' && target.repeatIntervalUnit !== 'year')
  ) {
    return undefined;
  }
  return target.repeatIntervalCount * (target.repeatIntervalUnit === 'year' ? 12 : 1);
}

function addMonthsToIsoDate(date: string, months: number) {
  const [year, month, day] = date.split('-').map(Number);
  const monthIndex = year * 12 + month - 1 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(
    Math.min(day, daysInTargetMonth),
  ).padStart(2, '0')}`;
}

export function targetDueDateForPeriod(target: PlanTargetDefinition, period: string) {
  if (!target.dueDate || !target.repeats || target.dueDate.slice(0, 7) >= period) return target.dueDate;
  if (target.cadence !== 'yearly' && target.cadence !== 'custom') return target.dueDate;

  const [dueYear, dueMonth] = target.dueDate.split('-').map(Number);
  const [periodYear, periodMonth] = period.split('-').map(Number);
  const intervalMonths = customRepeatIntervalMonths(target) ?? 12;
  const elapsedMonths = (periodYear - dueYear) * 12 + periodMonth - dueMonth;
  let elapsedIntervals = Math.floor(elapsedMonths / intervalMonths);
  let candidate = addMonthsToIsoDate(target.dueDate, elapsedIntervals * intervalMonths);
  if (candidate.slice(0, 7) < period) {
    elapsedIntervals += 1;
    candidate = addMonthsToIsoDate(target.dueDate, elapsedIntervals * intervalMonths);
  }
  return candidate;
}

function remainingAfterCarry(amountMinor: bigint, carryInMinor: bigint) {
  return amountMinor > carryInMinor ? amountMinor - carryInMinor : 0n;
}

export function targetNeededMinor(target: PlanTargetDefinition, period: string, carryInMinor: bigint) {
  if (target.amountMinor <= 0n) return 0n;

  if (target.cadence === 'weekly') {
    const periodAmount = target.amountMinor * BigInt(weekdayOccurrencesInPeriod(period, target.dayOfWeek ?? 0));
    return target.behaviour === 'refill' ? remainingAfterCarry(periodAmount, carryInMinor) : periodAmount;
  }

  if (target.cadence === 'monthly') {
    return target.behaviour === 'refill' ? remainingAfterCarry(target.amountMinor, carryInMinor) : target.amountMinor;
  }

  const dueDate = targetDueDateForPeriod(target, period) ?? `${period}-01`;
  const monthsRemaining = calendarMonthsInclusive(`${period}-01`, dueDate);
  const amountToFund =
    target.behaviour === 'refill' || target.behaviour === 'balanceBy'
      ? remainingAfterCarry(target.amountMinor, carryInMinor)
      : target.amountMinor;

  if (
    target.cadence === 'yearly' ||
    target.behaviour === 'balanceBy' ||
    customRepeatIntervalMonths(target) !== undefined
  ) {
    return positiveCeilDivide(amountToFund, BigInt(monthsRemaining));
  }

  return amountToFund;
}

export function targetIsSnoozed(target: PlanTargetDefinition, period: string) {
  return target.snoozedPeriods.includes(period);
}

export function targetUnderfundedMinor(input: {
  target: PlanTargetDefinition;
  period: string;
  carryInMinor: bigint;
  assignedMinor: bigint;
  prefundedMinor?: bigint;
}) {
  if (targetIsSnoozed(input.target, input.period)) return 0n;
  const neededMinor = targetNeededMinor(input.target, input.period, input.carryInMinor);
  const fundedMinor = input.assignedMinor + (input.prefundedMinor ?? 0n);
  return neededMinor > fundedMinor ? neededMinor - fundedMinor : 0n;
}

export function planTargetStatus(input: {
  target?: PlanTargetDefinition | null;
  neededMinor: bigint;
  underfundedMinor: bigint;
  assignedMinor: bigint;
  availableMinor: bigint;
}): PlanTargetStatus {
  if (input.availableMinor < 0n) return 'overspent';
  if (input.underfundedMinor > 0n) return 'underfunded';
  if (
    input.target &&
    (input.target.behaviour === 'setAside'
      ? input.assignedMinor > input.neededMinor
      : input.availableMinor > input.target.amountMinor)
  ) {
    return 'overfunded';
  }
  return 'funded';
}

export function underfundedPriority(input: {
  period: string;
  availableMinor: bigint;
  dueDate?: string;
  target?: Pick<PlanTargetDefinition, 'cadence' | 'dueDate'> | null;
}) {
  if (input.availableMinor < 0n) return 0;
  const dueDate = input.dueDate ?? input.target?.dueDate;
  if (dueDate && dueDate.slice(0, 7) <= input.period) return 1;
  if (input.target?.cadence === 'weekly' || input.target?.cadence === 'monthly') return 2;
  return 3;
}
