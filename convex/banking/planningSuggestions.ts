import { buildMoneyBoxFundingPlan, similarAmount } from './planningMath';
import { recurringIntervalConfidence } from './subscriptionDetection';
import type { Doc, Id } from '../_generated/dataModel';

type MoneyAmount = {
  amountMinor: bigint;
  currency: string;
};

type SuggestibleTransaction = Pick<
  Doc<'transactions'>,
  | '_id'
  | 'bookingDate'
  | 'description'
  | 'counterpartyName'
  | 'direction'
  | 'amount'
  | 'classificationKind'
  | 'classificationSource'
  | 'categoryId'
>;

type ExistingPlannedExpense = Pick<
  Doc<'plannedTransactions'>,
  '_id' | 'name' | 'amount' | 'direction' | 'dueDate' | 'status' | 'latestTransactionId'
>;

type PlannedExpenseDirection = 'inflow' | 'outflow';

export type PlannedExpenseSuggestion = {
  suggestionKey: string;
  name: string;
  description: string;
  amount: MoneyAmount;
  direction: PlannedExpenseDirection;
  dueDate: string;
  recurrenceInterval: 'month';
  recurrenceIntervalCount: number;
  latestTransactionId: Id<'transactions'>;
  categoryId?: Id<'categories'>;
  lastPaidDate: string;
  matchCount: number;
  confidence: number;
  funding: ReturnType<typeof buildMoneyBoxFundingPlan>;
};

export type BuildPlannedExpenseSuggestionsInput = {
  transactions: Array<SuggestibleTransaction>;
  existingPlannedExpenses: Array<ExistingPlannedExpense>;
  limit: number;
  minAmountMinor: bigint;
  asOfDate: string;
  nowMs: number;
};

function normalizeMerchantKey(value: string | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 80);
}

function humanName(transaction: SuggestibleTransaction) {
  return (transaction.counterpartyName ?? transaction.description).trim() || 'Planned payment';
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysBetween(left: string, right: string) {
  const leftDate = utcDate(left).getTime();
  const rightDate = utcDate(right).getTime();
  return Math.round(Math.abs(leftDate - rightDate) / (24 * 60 * 60 * 1000));
}

function addMonths(date: string, months: number) {
  const value = utcDate(date);
  const originalDay = value.getUTCDate();
  value.setUTCMonth(value.getUTCMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return value.toISOString().slice(0, 10);
}

function advanceIntoFuture(date: string, months: number, asOfDate: string) {
  let nextDate = date;
  while (nextDate <= asOfDate) {
    nextDate = addMonths(nextDate, months);
  }

  return nextDate;
}

function intervalFromDayDelta(dayDelta: number) {
  if (dayDelta >= 80 && dayDelta <= 100) {
    return { months: 3, confidence: 0.72 };
  }

  if (dayDelta >= 170 && dayDelta <= 195) {
    return { months: 6, confidence: 0.78 };
  }

  if (dayDelta >= 330 && dayDelta <= 390) {
    return { months: 12, confidence: 0.86 };
  }

  return null;
}

function intervalForTransaction(transaction: SuggestibleTransaction, dayDelta: number) {
  if (transaction.direction === 'CRDT') {
    const cadence = recurringIntervalConfidence(dayDelta);
    if (cadence?.interval === 'month' && cadence.intervalCount === 1) {
      return { months: cadence.intervalCount, confidence: cadence.confidence };
    }

    return null;
  }

  return intervalFromDayDelta(dayDelta);
}

function isSuggestibleTransaction(transaction: SuggestibleTransaction, minAmountMinor: bigint) {
  if (transaction.amount.amountMinor < minAmountMinor) {
    return false;
  }

  return (
    transaction.classificationKind !== 'transfer' &&
    transaction.classificationKind !== 'internal' &&
    transaction.classificationKind !== 'subscription'
  );
}

function plannedExpenseDirection(expense: ExistingPlannedExpense): PlannedExpenseDirection {
  return expense.direction ?? 'outflow';
}

function transactionDirection(transaction: SuggestibleTransaction): PlannedExpenseDirection {
  return transaction.direction === 'CRDT' ? 'inflow' : 'outflow';
}

function alreadyPlanned(args: {
  suggestionName: string;
  latestTransactionId: Id<'transactions'>;
  amount: MoneyAmount;
  direction: PlannedExpenseDirection;
  dueDate: string;
  existingPlannedExpenses: Array<ExistingPlannedExpense>;
}) {
  return args.existingPlannedExpenses.some((expense) => {
    if (expense.status === 'cancelled') {
      return false;
    }

    if (expense.latestTransactionId === args.latestTransactionId) {
      return true;
    }

    if (plannedExpenseDirection(expense) !== args.direction) {
      return false;
    }

    return (
      expense.dueDate === args.dueDate &&
      expense.amount.currency === args.amount.currency &&
      expense.amount.amountMinor === args.amount.amountMinor &&
      expense.name.toLowerCase() === args.suggestionName.toLowerCase()
    );
  });
}

export function buildPlannedExpenseSuggestions(
  input: BuildPlannedExpenseSuggestionsInput,
): Array<PlannedExpenseSuggestion> {
  const transactions = [...input.transactions].sort((left, right) => right.bookingDate.localeCompare(left.bookingDate));
  const suggestions: Array<PlannedExpenseSuggestion> = [];
  const emittedKeys = new Set<string>();

  for (const latest of transactions) {
    if (suggestions.length >= input.limit) {
      break;
    }

    if (!isSuggestibleTransaction(latest, input.minAmountMinor)) {
      continue;
    }

    const merchantKey = normalizeMerchantKey(latest.counterpartyName ?? latest.description);
    if (merchantKey.length < 4) {
      continue;
    }
    const direction = transactionDirection(latest);

    const priorMatches = transactions
      .filter((candidate) => candidate.bookingDate < latest.bookingDate)
      .filter((candidate) => {
        if (!isSuggestibleTransaction(candidate, input.minAmountMinor)) {
          return false;
        }

        if (candidate.direction !== latest.direction) {
          return false;
        }

        if (candidate.amount.currency !== latest.amount.currency) {
          return false;
        }

        if (!similarAmount(candidate.amount.amountMinor, latest.amount.amountMinor)) {
          return false;
        }

        return normalizeMerchantKey(candidate.counterpartyName ?? candidate.description) === merchantKey;
      });

    const intervalMatch = priorMatches
      .map((candidate) => ({
        transaction: candidate,
        interval: intervalForTransaction(latest, daysBetween(candidate.bookingDate, latest.bookingDate)),
      }))
      .find(
        (match): match is { transaction: SuggestibleTransaction; interval: { months: number; confidence: number } } =>
          Boolean(match.interval),
      );

    if (!intervalMatch) {
      continue;
    }

    if (direction === 'inflow' && priorMatches.length + 1 < 3) {
      continue;
    }

    const dueDate = advanceIntoFuture(
      addMonths(latest.bookingDate, intervalMatch.interval.months),
      intervalMatch.interval.months,
      input.asOfDate,
    );
    const name = humanName(latest);
    const suggestionKey = `${direction}:${merchantKey}:${latest.amount.currency}:${latest.amount.amountMinor.toString()}:${intervalMatch.interval.months}`;

    if (emittedKeys.has(suggestionKey)) {
      continue;
    }

    if (
      alreadyPlanned({
        suggestionName: name,
        latestTransactionId: latest._id,
        amount: latest.amount,
        direction,
        dueDate,
        existingPlannedExpenses: input.existingPlannedExpenses,
      })
    ) {
      continue;
    }

    emittedKeys.add(suggestionKey);
    suggestions.push({
      suggestionKey,
      name,
      description: `Detected ${priorMatches.length + 1} sizeable payments roughly every ${intervalMatch.interval.months} month(s).`,
      amount: latest.amount,
      direction,
      dueDate,
      recurrenceInterval: 'month',
      recurrenceIntervalCount: intervalMatch.interval.months,
      latestTransactionId: latest._id,
      categoryId: latest.categoryId,
      lastPaidDate: latest.bookingDate,
      matchCount: priorMatches.length + 1,
      confidence: Math.min(0.95, intervalMatch.interval.confidence + Math.min(priorMatches.length - 1, 3) * 0.03),
      funding: buildMoneyBoxFundingPlan({
        targetAmount: latest.amount,
        savedAmount: { amountMinor: 0n, currency: latest.amount.currency },
        targetDate: dueDate,
        createdAtMs: input.nowMs,
        asOfDate: input.asOfDate,
      }),
    });
  }

  return suggestions;
}
