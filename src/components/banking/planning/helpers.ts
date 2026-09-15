import type { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import type { TranslationKey } from '@/lib/i18n';
import type { CashflowSource, PlannedExpenseStatus } from '@/lib/planning-i18n';
import { moneyInputValue } from '@/lib/money';

export type RecurrenceInterval = 'day' | 'week' | 'month' | 'year' | undefined;
export type CycleInterval = 'day' | 'week' | 'month' | 'year';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
// Derived from what the query returns, not from the table: planning rows are reshaped on the way out
// - a transfer still reports a scheduledDate and a 'completed' status - so the stored document is not
// the shape the components receive.
export type PlannedExpense = FunctionReturnType<typeof api.banking.planning.listPlannedExpenses>[number];
export type PlannedTransfer = FunctionReturnType<typeof api.banking.planning.listPlannedTransfers>[number];
export type PlannedExpenseDirection = 'inflow' | 'outflow';

export type MoneyBoxFundingRow = {
  moneyBoxId: Id<'moneyBoxes'>;
  accountId?: Id<'financialAccounts'>;
  name: string;
  monthlyRequiredAmount: { amountMinor: bigint; currency: string };
  cycleContributedAmount: { amountMinor: bigint; currency: string };
};

export type CashflowItem = {
  key: string;
  source: CashflowSource;
  title: string;
  dueDate: string;
  amount: {
    amountMinor: bigint;
    currency: string;
  };
  direction: PlannedExpenseDirection;
  subtitle?: string;
  note?: string;
  creditFacilityId?: Id<'creditFacilities'>;
  creditUsageCycleId?: Id<'creditFacilityUsageCycles'>;
  creditCycleMonth?: string;
  creditPlanCount?: number;
  creditInstallmentDetails?: Array<{
    installmentPlanId: Id<'creditFacilityInstallmentPlans'>;
    planName: string;
    amount: {
      amountMinor: bigint;
      currency: string;
    };
    remainingAfterPayment: number;
  }>;
  plannedExpenseId?: Id<'plannedTransactions'>;
  plannedExpenseStatus?: PlannedExpenseStatus;
  plannedExpenseMoneyBoxId?: Id<'moneyBoxes'>;
  plannedTransferId?: Id<'plannedTransactions'>;
  plannedTransferEndpoint?: 'from' | 'to';
  occurrencePayment?: {
    source: 'manual' | 'linkedTransaction' | 'automatic';
    transactionId?: Id<'transactions'>;
  };
  projectedBalanceAfter?: {
    amountMinor: bigint;
    currency: string;
  };
  projectedAvailableAfter?: {
    amountMinor: bigint;
    currency: string;
  };
  projectionStatus?: 'projected' | 'missingBalance' | 'currencyMismatch' | 'pastCycle';
};

export type CashflowAccountGroup = {
  accountId: string;
  account?: Doc<'financialAccounts'>;
  latestBalance?: Doc<'accountBalances'>;
  startingBalance?: {
    amountMinor: bigint;
    currency: string;
  };
  startingAvailable?: {
    amountMinor: bigint;
    currency: string;
  };
  overdraftLimitAmount?: {
    amountMinor: bigint;
    currency: string;
  };
  projectedEndBalance?: {
    amountMinor: bigint;
    currency: string;
  };
  projectedEndAvailable?: {
    amountMinor: bigint;
    currency: string;
  };
  firstNegativeDate?: string;
  projectionStatus: 'projected' | 'missingBalance' | 'currencyMismatch' | 'pastCycle';
  items: Array<CashflowItem>;
  totals: Array<{
    amountMinor: bigint;
    currency: string;
  }>;
};

export const weekdays: Array<Weekday> = [1, 2, 3, 4, 5, 6, 0];

export const cycleIntervalLabelKeys: Record<CycleInterval, TranslationKey> = {
  day: 'planning.form.interval.day',
  week: 'planning.form.interval.week',
  month: 'planning.form.interval.month',
  year: 'planning.form.interval.year',
};

export function isoDateFromLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function dayOfMonthFromIsoDate(date: string) {
  return isIsoDate(date) ? Number(date.slice(8, 10)) : 1;
}

export function clampDayOfMonth(value: number) {
  if (!Number.isInteger(value)) {
    return 1;
  }

  return Math.min(Math.max(value, 1), 31);
}

export function isoDateWithDayOfMonth(date: string, day: number) {
  if (!isIsoDate(date)) {
    return date;
  }

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const monthEndDay = new Date(year, month, 0).getDate();
  const normalizedDay = Math.min(clampDayOfMonth(day), monthEndDay);
  return `${date.slice(0, 8)}${String(normalizedDay).padStart(2, '0')}`;
}

export function localDateFromIsoDate(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00`);
}

export function weekdayFromIsoDate(date: string): Weekday {
  if (!isIsoDate(date)) {
    return 0;
  }

  return localDateFromIsoDate(date).getDay() as Weekday;
}

export function nextIsoDateOnOrAfterWeekday(date: string, weekday: Weekday) {
  if (!isIsoDate(date)) {
    return date;
  }

  const value = localDateFromIsoDate(date);
  const dayOffset = (weekday - value.getDay() + 7) % 7;
  value.setDate(value.getDate() + dayOffset);
  return isoDateFromLocalDate(value);
}

export function moneyAmountInputValue(amount: { amountMinor: bigint; currency: string }) {
  return moneyInputValue(amount);
}

export function formatIsoDateLabel(date: string, intlLocale: string) {
  return new Intl.DateTimeFormat(intlLocale, {
    dateStyle: 'medium',
  }).format(localDateFromIsoDate(date));
}

export function formattedWeeklyOccurrence(date: string, intlLocale: string) {
  return new Intl.DateTimeFormat(intlLocale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(localDateFromIsoDate(date));
}

export function weekdayLabel(weekday: Weekday, intlLocale: string) {
  const referenceDate = new Date(2026, 5, 7 + weekday);
  return new Intl.DateTimeFormat(intlLocale, { weekday: 'long' }).format(referenceDate);
}
