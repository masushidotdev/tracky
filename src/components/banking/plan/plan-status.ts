import type { PlanBucket } from './types';

export type PlanBucketProgressMessage =
  | {
      kind: 'overspent';
      amountMinor: bigint;
      availableToSpendMinor: bigint;
      cashAmountMinor: bigint;
      creditAmountMinor: bigint;
    }
  | { kind: 'underfunded'; amountMinor: bigint; dueDay?: number }
  | { kind: 'fullySpent' }
  | { kind: 'funded' };

export type PlanBucketProgress = {
  percent: number;
  message: PlanBucketProgressMessage;
  snoozed: boolean;
  tone: 'positive' | 'warning' | 'muted' | 'destructive';
};

export function planBucketStatusKey(
  bucket: Pick<PlanBucket, 'status'>,
): 'plan.status.overspent' | 'plan.status.underfunded' | 'plan.status.funded' | 'plan.status.overfunded' {
  switch (bucket.status) {
    case 'overspent':
      return 'plan.status.overspent';
    case 'underfunded':
      return 'plan.status.underfunded';
    case 'overfunded':
      return 'plan.status.overfunded';
    default:
      return 'plan.status.funded';
  }
}

export function planBucketProgress(bucket: PlanBucket): PlanBucketProgress {
  const availableToSpendMinor = maxBigInt(0n, bucket.carryInMinor + bucket.assignedMinor);
  const message = progressMessage(bucket, availableToSpendMinor);

  return {
    percent: progressPercent(bucket, availableToSpendMinor),
    message,
    snoozed: bucket.snoozed,
    tone:
      bucket.availableMinor < 0n
        ? message.kind === 'overspent' && message.cashAmountMinor === 0n && message.creditAmountMinor > 0n
          ? 'warning'
          : 'destructive'
        : bucket.status === 'underfunded'
          ? 'warning'
          : bucket.availableMinor === 0n || message.kind === 'fullySpent'
            ? 'muted'
            : 'positive',
  };
}

function progressMessage(bucket: PlanBucket, availableToSpendMinor: bigint): PlanBucketProgressMessage {
  if (bucket.availableMinor < 0n) {
    const amountMinor = -bucket.availableMinor;
    const positiveCreditMinor = bucket.creditOverspendMinor > 0n ? bucket.creditOverspendMinor : 0n;
    const creditAmountMinor = positiveCreditMinor < amountMinor ? positiveCreditMinor : amountMinor;
    return {
      kind: 'overspent',
      amountMinor,
      availableToSpendMinor,
      cashAmountMinor: amountMinor - creditAmountMinor,
      creditAmountMinor,
    };
  }
  if (bucket.underfundedMinor > 0n) {
    return {
      kind: 'underfunded',
      amountMinor: bucket.underfundedMinor,
      dueDay: dueDay(bucket.target?.dueDate),
    };
  }
  if (bucket.availableMinor === 0n && bucket.activityMinor < 0n && availableToSpendMinor > 0n) {
    return { kind: 'fullySpent' };
  }
  return { kind: 'funded' };
}

function progressPercent(bucket: PlanBucket, availableToSpendMinor: bigint) {
  if (bucket.cardAccountId) {
    if (bucket.neededMinor <= 0n) return 100;
    return percentage(maxBigInt(0n, bucket.availableMinor), bucket.neededMinor);
  }
  if (bucket.target) {
    if (bucket.neededMinor <= 0n) return 100;
    return percentage(maxBigInt(0n, bucket.assignedMinor), bucket.neededMinor);
  }
  if (availableToSpendMinor <= 0n) return bucket.availableMinor < 0n ? 100 : 0;
  const spentMinor = bucket.activityMinor < 0n ? -bucket.activityMinor : 0n;
  return percentage(spentMinor, availableToSpendMinor);
}

function percentage(value: bigint, total: bigint) {
  if (total <= 0n) return 0;
  const clamped = value > total ? total : value;
  return Number((clamped * 10_000n) / total) / 100;
}

function dueDay(dueDate: string | undefined) {
  if (!dueDate) return undefined;
  const day = Number(dueDate.slice(8, 10));
  return day >= 1 && day <= 31 ? day : undefined;
}

function maxBigInt(left: bigint, right: bigint) {
  return left > right ? left : right;
}
