import { absoluteMinorUnits } from '../lib/money';
import { addRecurringInterval, normalizeMerchantKey } from './subscriptionDetection';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const AUTO_RECONCILE_LOOKAHEAD_DAYS = 14;

type DbCtx = QueryCtx | MutationCtx;

function addDaysToIsoDate(date: string, days: number) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysInUtcMonth(year: number, monthZeroBased: number) {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

function subtractRecurringInterval(
  date: string,
  interval: NonNullable<Doc<'plannedTransactions'>['recurrenceInterval']>,
  intervalCount: number,
) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  const count = Math.max(intervalCount, 1);

  if (interval === 'day') {
    value.setUTCDate(value.getUTCDate() - count);
    return value.toISOString().slice(0, 10);
  }

  if (interval === 'week') {
    value.setUTCDate(value.getUTCDate() - count * 7);
    return value.toISOString().slice(0, 10);
  }

  if (interval === 'year') {
    const month = value.getUTCMonth();
    const day = value.getUTCDate();
    const year = value.getUTCFullYear() - count;
    return new Date(Date.UTC(year, month, Math.min(day, daysInUtcMonth(year, month)))).toISOString().slice(0, 10);
  }

  const month = value.getUTCMonth() - count;
  const targetYear = value.getUTCFullYear() + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const targetDay = Math.min(value.getUTCDate(), daysInUtcMonth(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().slice(0, 10);
}

export function strictPlannedExpenseAmountMatch(left: bigint, right: bigint) {
  const larger = left > right ? left : right;
  const percentageTolerance = larger / 20n;
  const tolerance = percentageTolerance > 100n ? percentageTolerance : 100n;
  return absoluteMinorUnits(left - right) <= tolerance;
}

export function previousPlannedExpenseOccurrenceDate(expense: Doc<'plannedTransactions'>, dueDate: string) {
  if (!expense.recurrenceInterval) {
    return addDaysToIsoDate(dueDate, -AUTO_RECONCILE_LOOKAHEAD_DAYS);
  }

  const intervalCount = expense.recurrenceIntervalCount ?? 1;
  let occurrenceDate = expense.dueDate.slice(0, 10);
  let previousDate: string | undefined;

  for (let guard = 0; guard < 240 && occurrenceDate < dueDate; guard += 1) {
    previousDate = occurrenceDate;
    occurrenceDate = addRecurringInterval(occurrenceDate, expense.recurrenceInterval, intervalCount);
  }

  if (occurrenceDate === dueDate && previousDate) {
    return previousDate;
  }

  return subtractRecurringInterval(dueDate, expense.recurrenceInterval, intervalCount);
}

export function isPlannedExpenseOccurrence(expense: Doc<'plannedTransactions'>, dueDate: string) {
  if (!expense.recurrenceInterval) {
    return expense.dueDate === dueDate;
  }

  const intervalCount = expense.recurrenceIntervalCount ?? 1;
  let occurrenceDate = expense.dueDate.slice(0, 10);
  for (let guard = 0; guard < 240 && occurrenceDate < dueDate; guard += 1) {
    occurrenceDate = addRecurringInterval(occurrenceDate, expense.recurrenceInterval, intervalCount);
  }
  return occurrenceDate === dueDate;
}

export function plannedExpenseOccurrenceForBookingDate(expense: Doc<'plannedTransactions'>, bookingDate: string) {
  if (!expense.recurrenceInterval) {
    const earliestDate = addDaysToIsoDate(expense.dueDate, -AUTO_RECONCILE_LOOKAHEAD_DAYS);
    return bookingDate > earliestDate && bookingDate <= expense.dueDate ? expense.dueDate : undefined;
  }

  const intervalCount = expense.recurrenceIntervalCount ?? 1;
  let dueDate = expense.dueDate.slice(0, 10);
  for (let guard = 0; guard < 240 && dueDate < bookingDate; guard += 1) {
    dueDate = addRecurringInterval(dueDate, expense.recurrenceInterval, intervalCount);
  }

  const previousDate = previousPlannedExpenseOccurrenceDate(expense, dueDate);
  if (
    bookingDate <= previousDate ||
    dueDate > addDaysToIsoDate(bookingDate, AUTO_RECONCILE_LOOKAHEAD_DAYS)
  ) {
    return undefined;
  }
  return dueDate;
}

export function transactionMatchesLearnedPlannedExpense(
  transaction: Doc<'transactions'>,
  expense: Doc<'plannedTransactions'>,
) {
  const expectedDirection = (expense.direction ?? 'outflow') === 'inflow' ? 'CRDT' : 'DBIT';
  return (
    Boolean(expense.reconciliationMerchantKey) &&
    transaction.status === 'BOOK' &&
    transaction.accountId === expense.accountId &&
    transaction.direction === expectedDirection &&
    transaction.classificationKind !== 'transfer' &&
    transaction.classificationKind !== 'internal' &&
    transaction.amount.currency === expense.amount.currency &&
    strictPlannedExpenseAmountMatch(transaction.amount.amountMinor, expense.amount.amountMinor) &&
    normalizeMerchantKey(transaction.counterpartyName ?? transaction.description) === expense.reconciliationMerchantKey
  );
}

async function activePlannedExpensesForAccount(
  ctx: DbCtx,
  userId: string,
  accountId: Id<'financialAccounts'>,
) {
  const expenses: Array<Doc<'plannedTransactions'>> = [];
  for (const status of ['planned', 'funding'] as const) {
    for (const kind of ['expense', 'income'] as const) {
      expenses.push(
        ...(await ctx.db
          .query('plannedTransactions')
          .withIndex('by_userId_and_kind_and_accountId_and_status', (q) =>
            q.eq('userId', userId).eq('kind', kind).eq('accountId', accountId).eq('status', status),
          )
          .take(100)),
      );
    }
  }
  return expenses;
}

export async function reconcileImportedTransactionWithPlannedExpenses(
  ctx: MutationCtx,
  transactionId: Id<'transactions'>,
) {
  const transaction = await ctx.db.get('transactions', transactionId);
  if (!transaction || transaction.status !== 'BOOK') {
    return null;
  }

  const existingPayment = await ctx.db
    .query('plannedExpenseOccurrencePayments')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
    .unique();
  if (existingPayment) {
    return existingPayment.status === 'paid' ? existingPayment._id : null;
  }

  const expenses = await activePlannedExpensesForAccount(
    ctx,
    transaction.userId,
    transaction.accountId,
  );
  const candidates: Array<{ expense: Doc<'plannedTransactions'>; dueDate: string }> = [];

  for (const expense of expenses) {
    if (!transactionMatchesLearnedPlannedExpense(transaction, expense)) {
      continue;
    }
    const dueDate = plannedExpenseOccurrenceForBookingDate(expense, transaction.bookingDate);
    if (!dueDate) {
      continue;
    }
    const occurrencePayment = await ctx.db
      .query('plannedExpenseOccurrencePayments')
      .withIndex('by_plannedTransactionId_and_dueDate', (q) =>
        q.eq('plannedTransactionId', expense._id).eq('dueDate', dueDate),
      )
      .unique();
    if (!occurrencePayment) {
      candidates.push({ expense, dueDate });
    }
  }

  if (candidates.length !== 1) {
    return null;
  }

  const now = Date.now();
  const candidate = candidates[0];
  return await ctx.db.insert('plannedExpenseOccurrencePayments', {
    userId: transaction.userId,
    plannedTransactionId: candidate.expense._id,
    dueDate: candidate.dueDate,
    status: 'paid',
    source: 'automatic',
    transactionId: transaction._id,
    paidAtMs: now,
    updatedAtMs: now,
  });
}

export function occurrencePaymentCandidateDateRange(expense: Doc<'plannedTransactions'>, dueDate: string) {
  return {
    fromDateExclusive: previousPlannedExpenseOccurrenceDate(expense, dueDate),
    toDate: new Date().toISOString().slice(0, 10),
  };
}
