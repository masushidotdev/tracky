import { absoluteMinorUnits } from '../lib/money';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type DbCtx = QueryCtx | MutationCtx;

export type SubscriptionCadence = {
  confidence: number;
  interval: 'day' | 'week' | 'month' | 'year';
  intervalCount: number;
  nextDueDate: string;
};

export function normalizeMerchantKey(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 80);
}

export function daysBetween(left: string, right: string) {
  const leftDate = new Date(`${left.slice(0, 10)}T00:00:00.000Z`).getTime();
  const rightDate = new Date(`${right.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.round(Math.abs(leftDate - rightDate) / (24 * 60 * 60 * 1000));
}

function daysInUtcMonth(year: number, monthZeroBased: number) {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

export function addRecurringInterval(date: string, interval: SubscriptionCadence['interval'], intervalCount: number) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  const count = Math.max(intervalCount, 1);

  if (interval === 'day') {
    value.setUTCDate(value.getUTCDate() + count);
    return value.toISOString().slice(0, 10);
  }

  if (interval === 'week') {
    value.setUTCDate(value.getUTCDate() + count * 7);
    return value.toISOString().slice(0, 10);
  }

  if (interval === 'year') {
    const month = value.getUTCMonth();
    const day = value.getUTCDate();
    const year = value.getUTCFullYear() + count;
    value.setUTCFullYear(year, month, Math.min(day, daysInUtcMonth(year, month)));
    return value.toISOString().slice(0, 10);
  }

  // Month-end recurrence currently drifts after clamping (e.g. Jan 31 -> Feb 28 -> Mar 28); preserve for existing detections.
  const month = value.getUTCMonth() + count;
  const targetYear = value.getUTCFullYear() + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const targetDay = Math.min(value.getUTCDate(), daysInUtcMonth(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().slice(0, 10);
}

export function subscriptionAmountTolerance(amountMinor: bigint) {
  const percentageTolerance = amountMinor / 20n;
  return percentageTolerance > 100n ? percentageTolerance : 100n;
}

export function recurringIntervalConfidence(dayDelta: number) {
  if (dayDelta >= 25 && dayDelta <= 35) {
    return { confidence: 0.82, interval: 'month' as const, intervalCount: 1 };
  }

  if (dayDelta >= 55 && dayDelta <= 65) {
    return { confidence: 0.76, interval: 'month' as const, intervalCount: 2 };
  }

  if (dayDelta >= 85 && dayDelta <= 95) {
    return { confidence: 0.72, interval: 'month' as const, intervalCount: 3 };
  }

  if (dayDelta >= 355 && dayDelta <= 375) {
    return { confidence: 0.74, interval: 'year' as const, intervalCount: 1 };
  }

  return null;
}

export function merchantKeyForTransaction(transaction: Pick<Doc<'transactions'>, 'counterpartyName' | 'description'>) {
  return normalizeMerchantKey(transaction.counterpartyName ?? transaction.description);
}

export function merchantKeyForSubscription(
  subscription: Pick<Doc<'subscriptions'>, 'description' | 'merchantName' | 'name'>,
) {
  return normalizeMerchantKey(subscription.merchantName ?? subscription.name);
}

function isMatchingSubscriptionTransaction(
  transaction: Doc<'transactions'>,
  args: {
    amountMinor: bigint;
    currency: string;
    merchantKey: string;
  },
) {
  if (transaction.direction !== 'DBIT' || transaction.amount.currency !== args.currency) {
    return false;
  }

  // Cadence is inferred from charges that really happened; a scheduled row would
  // fabricate an extra occurrence and pull the next due date forward.
  if (transaction.status === 'SCHD') {
    return false;
  }

  if (merchantKeyForTransaction(transaction) !== args.merchantKey) {
    return false;
  }

  return absoluteMinorUnits(transaction.amount.amountMinor - args.amountMinor) <= subscriptionAmountTolerance(args.amountMinor);
}

export async function findRelatedSubscriptionTransactions(ctx: DbCtx, transaction: Doc<'transactions'>) {
  const merchantKey = merchantKeyForTransaction(transaction);
  if (merchantKey.length < 4 || transaction.direction !== 'DBIT') {
    return [transaction];
  }

  const recentTransactions = await ctx.db
    .query('transactions')
    .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', transaction.userId))
    .order('desc')
    .take(300);

  const related = recentTransactions.filter((candidate) =>
    isMatchingSubscriptionTransaction(candidate, {
      amountMinor: transaction.amount.amountMinor,
      currency: transaction.amount.currency,
      merchantKey,
    }),
  );

  if (!related.some((candidate) => candidate._id === transaction._id)) {
    related.push(transaction);
  }

  return related.sort((left, right) => left.bookingDate.localeCompare(right.bookingDate));
}

export function inferCadenceFromTransactions(
  transactions: Array<Pick<Doc<'transactions'>, 'bookingDate'>>,
  fallback: {
    interval: SubscriptionCadence['interval'];
    intervalCount: number;
  } = { interval: 'month', intervalCount: 1 },
): SubscriptionCadence {
  const sortedDates = Array.from(new Set(transactions.map((transaction) => transaction.bookingDate.slice(0, 10)))).sort();
  const lastDate = sortedDates.at(-1) ?? new Date().toISOString().slice(0, 10);
  let best = {
    confidence: 1,
    interval: fallback.interval,
    intervalCount: fallback.intervalCount,
  };

  if (sortedDates.length >= 2) {
    const inferred = recurringIntervalConfidence(daysBetween(sortedDates.at(-2)!, lastDate));
    if (inferred) {
      best = inferred;
    }
  }

  return {
    ...best,
    nextDueDate: addRecurringInterval(lastDate, best.interval, best.intervalCount),
  };
}

export async function inferCadenceForTransaction(
  ctx: DbCtx,
  transaction: Doc<'transactions'>,
  fallback: {
    interval: SubscriptionCadence['interval'];
    intervalCount: number;
  } = { interval: 'month', intervalCount: 1 },
) {
  const relatedTransactions = await findRelatedSubscriptionTransactions(ctx, transaction);
  return {
    cadence: inferCadenceFromTransactions(relatedTransactions, fallback),
    relatedTransactions,
  };
}

export async function findMatchingSubscription(ctx: DbCtx, transaction: Doc<'transactions'>) {
  const merchantKey = merchantKeyForTransaction(transaction);
  if (merchantKey.length < 4 || transaction.direction !== 'DBIT') {
    return null;
  }

  const subscriptions = await ctx.db
    .query('subscriptions')
    .withIndex('by_userId', (q) => q.eq('userId', transaction.userId))
    .take(200);

  return (
    subscriptions.find((subscription) => {
      if (subscription.status === 'ended' || subscription.amount.currency !== transaction.amount.currency) {
        return false;
      }

      if (merchantKeyForSubscription(subscription) !== merchantKey) {
        return false;
      }

      return (
        absoluteMinorUnits(subscription.amount.amountMinor - transaction.amount.amountMinor) <=
        subscriptionAmountTolerance(transaction.amount.amountMinor)
      );
    }) ?? null
  );
}

export async function linkTransactionsToSubscription(
  ctx: MutationCtx,
  args: {
    categoryId?: Id<'categories'>;
    confidence?: number;
    subscriptionId: Id<'subscriptions'>;
    transactions: Array<Doc<'transactions'>>;
  },
) {
  if (args.transactions.length === 0) return;
  const now = Date.now();
  for (const transaction of args.transactions) {
    await ctx.db.patch('transactions', transaction._id, {
      categoryId: args.categoryId ?? transaction.categoryId,
      classificationKind: 'subscription',
      classificationSource: 'user',
      classificationConfidence: args.confidence ?? 1,
      subscriptionId: args.subscriptionId,
      updatedAtMs: now,
    });
  }
  await invalidatePlanSnapshots(
    ctx,
    args.transactions[0].userId,
    args.transactions.map((transaction) => transaction.bookingDate),
  );
}
