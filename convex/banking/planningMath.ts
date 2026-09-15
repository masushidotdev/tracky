import { absoluteMinorUnits } from '../lib/money';

type MoneyAmount = {
  amountMinor: bigint;
  currency: string;
};

export type FundingStatus = 'covered' | 'behind' | 'dueSoon' | 'onTrack';

export type MoneyBoxFundingInput = {
  targetAmount: MoneyAmount;
  savedAmount: MoneyAmount;
  targetDate: string;
  createdAtMs: number;
  asOfDate?: string;
  growthRatePct?: number;
  monthlyFundingPaceMinor?: bigint;
};

export type MoneyBoxProjectionStatus = 'onTrack' | 'ahead' | 'behind' | 'completed';

const MONTHLY_GROWTH_RATE_DENOMINATOR = 12_000_000n;
const MAX_PROJECTION_MONTHS = 600;

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDateFromMs(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

export function calendarMonthsInclusive(fromDate: string, toDate: string) {
  const from = utcDate(fromDate);
  const to = utcDate(toDate);
  return Math.max(1, (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1);
}

function daysUntil(fromDate: string, toDate: string) {
  const deltaMs = utcDate(toDate).getTime() - utcDate(fromDate).getTime();
  return Math.ceil(deltaMs / (24 * 60 * 60 * 1000));
}

export function positiveCeilDivide(value: bigint, divisor: bigint) {
  if (value <= 0n) {
    return 0n;
  }

  return (value + divisor - 1n) / divisor;
}

function clampPercent(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function addMonthsToIsoDate(date: string, months: number) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

function monthlyGrowthMinor(balanceMinor: bigint, growthRatePct: number | undefined) {
  if (balanceMinor <= 0n || growthRatePct === undefined || !Number.isFinite(growthRatePct) || growthRatePct <= 0) {
    return 0n;
  }

  const boundedGrowthRatePct = Math.min(20, growthRatePct);
  const annualRateNumerator = BigInt(Math.round(boundedGrowthRatePct * 10_000));
  return (balanceMinor * annualRateNumerator + MONTHLY_GROWTH_RATE_DENOMINATOR / 2n) / MONTHLY_GROWTH_RATE_DENOMINATOR;
}

function projectCompletionDate(input: {
  asOfDate: string;
  savedMinor: bigint;
  targetMinor: bigint;
  monthlyFundingMinor: bigint;
  growthRatePct?: number;
}) {
  if (input.savedMinor >= input.targetMinor) {
    return input.asOfDate;
  }

  let projectedBalanceMinor = input.savedMinor;
  for (let monthIndex = 0; monthIndex < MAX_PROJECTION_MONTHS; monthIndex += 1) {
    projectedBalanceMinor += monthlyGrowthMinor(projectedBalanceMinor, input.growthRatePct);
    projectedBalanceMinor += input.monthlyFundingMinor;
    if (projectedBalanceMinor >= input.targetMinor) {
      return addMonthsToIsoDate(input.asOfDate, monthIndex);
    }
  }

  return null;
}

export function buildMoneyBoxFundingPlan(input: MoneyBoxFundingInput) {
  const asOfDate = input.asOfDate ?? isoDateFromMs(Date.now());
  const remainingMinor =
    input.targetAmount.amountMinor > input.savedAmount.amountMinor
      ? input.targetAmount.amountMinor - input.savedAmount.amountMinor
      : 0n;
  const monthsRemaining = calendarMonthsInclusive(asOfDate, input.targetDate);
  const totalMonths = calendarMonthsInclusive(isoDateFromMs(input.createdAtMs), input.targetDate);
  const elapsedMonths = Math.max(0, Math.min(totalMonths, totalMonths - monthsRemaining));
  const expectedSavedMinor = positiveCeilDivide(
    input.targetAmount.amountMinor * BigInt(elapsedMonths),
    BigInt(totalMonths),
  );
  const monthlyRequiredMinor = positiveCeilDivide(remainingMinor, BigInt(monthsRemaining));
  const progressPercent =
    input.targetAmount.amountMinor <= 0n
      ? 100
      : clampPercent(Number((input.savedAmount.amountMinor * 10000n) / input.targetAmount.amountMinor) / 100);
  const daysRemaining = daysUntil(asOfDate, input.targetDate);

  let fundingStatus: FundingStatus = 'onTrack';
  if (remainingMinor === 0n) {
    fundingStatus = 'covered';
  } else if (input.savedAmount.amountMinor < expectedSavedMinor) {
    fundingStatus = 'behind';
  } else if (daysRemaining <= 30) {
    fundingStatus = 'dueSoon';
  }

  const deltaMinor = input.savedAmount.amountMinor - expectedSavedMinor;
  let status: MoneyBoxProjectionStatus = 'onTrack';
  if (remainingMinor === 0n) {
    status = 'completed';
  } else if (deltaMinor > 0n) {
    status = 'ahead';
  } else if (deltaMinor < 0n) {
    status = 'behind';
  }
  const projectedCompletionDate = projectCompletionDate({
    asOfDate,
    savedMinor: input.savedAmount.amountMinor,
    targetMinor: input.targetAmount.amountMinor,
    monthlyFundingMinor:
      input.monthlyFundingPaceMinor === undefined || input.monthlyFundingPaceMinor < 0n
        ? monthlyRequiredMinor
        : input.monthlyFundingPaceMinor,
    growthRatePct: input.growthRatePct,
  });

  return {
    remainingAmount: {
      amountMinor: remainingMinor,
      currency: input.targetAmount.currency,
    },
    monthlyRequiredAmount: {
      amountMinor: monthlyRequiredMinor,
      currency: input.targetAmount.currency,
    },
    expectedSavedAmount: {
      amountMinor: expectedSavedMinor,
      currency: input.targetAmount.currency,
    },
    progressPercent,
    monthsRemaining,
    daysRemaining,
    fundingStatus,
    status,
    deltaMinor,
    projectedCompletionDate,
  };
}

export function amountTolerance(amountMinor: bigint) {
  const percentageTolerance = amountMinor / 10n;
  return percentageTolerance > 500n ? percentageTolerance : 500n;
}

export function similarAmount(left: bigint, right: bigint) {
  return absoluteMinorUnits(left - right) <= amountTolerance(left > right ? left : right);
}
