import { ConvexError, v } from 'convex/values';
import { internalQuery, mutation, query } from '../_generated/server';
import { internal } from '../_generated/api';
import { requireAuthUser } from '../auth';
import { isAssetAccountType, isSpendableAccountType } from '../lib/accountTypes';
import { absoluteMinorUnits } from '../lib/money';
import {
  isLoanFacilityType,
  moneyAmountValidator,
  plannedTransferStatusValidator,
  recurrenceIntervalValidator,
} from '../lib/validators';
import { addMonthsToIsoDate, buildInstallmentPaymentSchedule } from './creditMath';
import { latestBookedBalance } from './balances';
import {
  availableBalance,
  effectiveFacilityUsedAmount,
  linkedCardAccountForFacility,
  overdraftLimitByAccount,
} from './overdraft';
import { defaultUsageCycleDueDate, unscheduledCardUsageMinor } from './statementCycles';
import { createManualAccountCore } from './manualAccounts';
import { applyManualBalanceDelta, createCounterpartTransferCore } from './manualTransactions';
import { buildMoneyBoxFundingPlan } from './planningMath';
import {
  isPlannedExpenseOccurrence,
  occurrencePaymentCandidateDateRange,
  strictPlannedExpenseAmountMatch,
} from './planningReconciliation';
import { addEligiblePlanAccount } from './plan';
import { invalidateAllPlanSnapshots, invalidatePlanSnapshots } from './planSnapshotInvalidation';
import { addRecurringInterval, normalizeMerchantKey } from './subscriptionDetection';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { PlannedExpenseSuggestion } from './planningSuggestions';

const plannedExpenseStatusValidator = v.union(
  v.literal('planned'),
  v.literal('funding'),
  v.literal('paid'),
  v.literal('cancelled'),
);
const plannedExpenseIdValidator = v.id('plannedTransactions');
const plannedTransferIdValidator = v.id('plannedTransactions');
const activePlannedExpenseStatuses = ['planned', 'funding'] as const;
const planningCycleIntervalValidator = recurrenceIntervalValidator;
const plannedExpenseDirectionValidator = v.union(v.literal('inflow'), v.literal('outflow'));
const plannedTransferActiveStatuses = ['planned'] as const;
const MAX_PLANNED_TRANSACTION_NOTE_LENGTH = 500;

type MoneyAmount = {
  amountMinor: bigint;
  currency: string;
};

function moneyBoxContributionDelta(contribution: Pick<Doc<'moneyBoxContributions'>, 'amount' | 'kind'>) {
  return contribution.kind === 'withdrawal' ? -contribution.amount.amountMinor : contribution.amount.amountMinor;
}

function normalizePlannedTransactionNote(note: string | null) {
  const normalized = note?.trim() ?? '';
  if (normalized.length > MAX_PLANNED_TRANSACTION_NOTE_LENGTH) {
    throw new ConvexError('Planned transaction note must be at most 500 characters');
  }
  return normalized || undefined;
}

type PlannedExpenseStatus = Doc<'plannedTransactions'>['status'];
type PlanningPreference = Doc<'planningPreferences'>;
type PlanningCycleInterval = PlanningPreference['cycleInterval'];

type FutureCashflowSource =
  | 'plannedExpense'
  | 'subscription'
  | 'scheduledTransaction'
  | 'creditInstallment'
  | 'creditStatement'
  | 'plannedTransfer';
type PlannedExpenseDirection = 'inflow' | 'outflow';

type FutureCashflowItem = {
  key: string;
  source: FutureCashflowSource;
  title: string;
  dueDate: string;
  amount: MoneyAmount;
  direction: PlannedExpenseDirection;
  subtitle?: string;
  note?: string;
  account?: Doc<'financialAccounts'>;
  creditFacilityId?: Id<'creditFacilities'>;
  creditUsageCycleId?: Id<'creditFacilityUsageCycles'>;
  creditCycleMonth?: string;
  creditPlanCount?: number;
  creditInstallmentDetails?: Array<{
    installmentPlanId: Id<'creditFacilityInstallmentPlans'>;
    planName: string;
    amount: MoneyAmount;
    remainingAfterPayment: number;
  }>;
  plannedExpenseId?: Id<'plannedTransactions'>;
  plannedExpenseStatus?: Doc<'plannedTransactions'>['status'];
  plannedExpenseMoneyBoxId?: Id<'moneyBoxes'>;
  plannedTransferId?: Id<'plannedTransactions'>;
  plannedTransferEndpoint?: 'from' | 'to';
  transactionId?: Id<'transactions'>;
  occurrencePayment?: {
    source: Doc<'plannedExpenseOccurrencePayments'>['source'];
    transactionId?: Id<'transactions'>;
  };
};

type FutureCashflowSummary = {
  asOfDate: string;
  horizonDate: string;
  upcomingTotals: Array<MoneyAmount>;
  monthlyFundingTotals: Array<MoneyAmount>;
  upcomingItems: Array<FutureCashflowItem>;
  upcomingItemsByAccount: Array<{
    accountId: string;
    account: Doc<'financialAccounts'> | undefined;
    items: Array<FutureCashflowItem>;
    totals: Array<MoneyAmount>;
  }>;
  fundingItems: Array<{
    moneyBoxId: Id<'moneyBoxes'>;
    accountId?: Id<'financialAccounts'>;
    name: string;
    targetDate: string;
    targetAmount: MoneyAmount;
    savedAmount: MoneyAmount;
    monthlyRequiredAmount: MoneyAmount;
    cycleContributedAmount: MoneyAmount;
    remainingAmount: MoneyAmount;
    progressPercent: number;
    fundingStatus: 'covered' | 'behind' | 'dueSoon' | 'onTrack';
    status: 'onTrack' | 'ahead' | 'behind' | 'completed';
    deltaMinor: bigint;
    projectedCompletionDate: string | null;
  }>;
};

type FutureCashflowAccountGroup = FutureCashflowSummary['upcomingItemsByAccount'][number];

type PlanningCycleWindow = {
  cycleStartDate: string;
  cycleEndDate: string;
  asOfDate: string;
  cycleOffset: number;
};

type PlanningCashflowRow = FutureCashflowItem & {
  projectedBalanceAfter?: MoneyAmount;
  projectedAvailableAfter?: MoneyAmount;
  projectionStatus: 'projected' | 'missingBalance' | 'currencyMismatch' | 'pastCycle';
};

type PlanningCashflowAccountGroup = {
  accountId: string;
  account: Doc<'financialAccounts'> | undefined;
  latestBalance?: Doc<'accountBalances'>;
  startingBalance?: MoneyAmount;
  startingAvailable?: MoneyAmount;
  overdraftLimitAmount?: MoneyAmount;
  projectedEndBalance?: MoneyAmount;
  projectedEndAvailable?: MoneyAmount;
  firstNegativeDate?: string;
  projectionStatus: 'projected' | 'missingBalance' | 'currencyMismatch' | 'pastCycle';
  items: Array<PlanningCashflowRow>;
  totals: Array<MoneyAmount>;
};

type PlanningCashflowView = PlanningCycleWindow & {
  preference: {
    cycleInterval: PlanningCycleInterval;
    cycleIntervalCount: number;
    anchorDate: string;
  };
  upcomingTotals: Array<MoneyAmount>;
  monthlyFundingTotals: Array<MoneyAmount>;
  firstNegativeDate?: string;
  aggregateSeries: Array<{
    date: string;
    projectedBalanceAfter: MoneyAmount;
  }>;
  aggregateEndBalance?: MoneyAmount;
  aggregateFirstNegativeDate?: string;
  accountGroups: Array<PlanningCashflowAccountGroup>;
  fundingItems: FutureCashflowSummary['fundingItems'];
};

function plannedExpenseResult(expense: Doc<'plannedTransactions'>) {
  return {
    _id: expense._id,
    _creationTime: expense._creationTime,
    userId: expense.userId,
    ...(expense.accountId !== undefined ? { accountId: expense.accountId } : {}),
    name: expense.name,
    ...(expense.description !== undefined ? { description: expense.description } : {}),
    ...(expense.note !== undefined ? { note: expense.note } : {}),
    amount: expense.amount,
    ...(expense.direction !== undefined ? { direction: expense.direction } : {}),
    dueDate: expense.dueDate,
    ...(expense.recurrenceInterval !== undefined ? { recurrenceInterval: expense.recurrenceInterval } : {}),
    ...(expense.recurrenceIntervalCount !== undefined
      ? { recurrenceIntervalCount: expense.recurrenceIntervalCount }
      : {}),
    status: expense.status,
    source: expense.source,
    ...(expense.categoryId !== undefined ? { categoryId: expense.categoryId } : {}),
    ...(expense.subscriptionId !== undefined ? { subscriptionId: expense.subscriptionId } : {}),
    ...(expense.moneyBoxId !== undefined ? { moneyBoxId: expense.moneyBoxId } : {}),
    ...(expense.latestTransactionId !== undefined ? { latestTransactionId: expense.latestTransactionId } : {}),
    ...(expense.reconciliationMerchantKey !== undefined
      ? { reconciliationMerchantKey: expense.reconciliationMerchantKey }
      : {}),
    createdAtMs: expense.createdAtMs,
    updatedAtMs: expense.updatedAtMs,
  };
}

function plannedTransferResult(transfer: Doc<'plannedTransactions'>) {
  if (transfer.kind !== 'transfer' || !transfer.toAccountId || transfer.status === 'funding') {
    throw new ConvexError('Invalid planned transfer');
  }

  return {
    _id: transfer._id,
    _creationTime: transfer._creationTime,
    userId: transfer.userId,
    ...(transfer.fromAccountId !== undefined ? { fromAccountId: transfer.fromAccountId } : {}),
    ...(transfer.fromCreditFacilityId !== undefined ? { fromCreditFacilityId: transfer.fromCreditFacilityId } : {}),
    toAccountId: transfer.toAccountId,
    name: transfer.name,
    ...(transfer.description !== undefined ? { description: transfer.description } : {}),
    amount: transfer.amount,
    scheduledDate: transfer.dueDate,
    status: transfer.status === 'paid' ? ('completed' as const) : transfer.status,
    ...(transfer.completedTransferMatchId !== undefined
      ? { completedTransferMatchId: transfer.completedTransferMatchId }
      : {}),
    ...(transfer.completedAtMs !== undefined ? { completedAtMs: transfer.completedAtMs } : {}),
    createdAtMs: transfer.createdAtMs,
    updatedAtMs: transfer.updatedAtMs,
  };
}

function moneyBoxResult(moneyBox: Doc<'moneyBoxes'>) {
  return {
    _id: moneyBox._id,
    _creationTime: moneyBox._creationTime,
    userId: moneyBox.userId,
    ...(moneyBox.accountId !== undefined ? { accountId: moneyBox.accountId } : {}),
    name: moneyBox.name,
    targetAmount: moneyBox.targetAmount,
    savedAmount: moneyBox.savedAmount,
    targetDate: moneyBox.targetDate,
    status: moneyBox.status,
    source: moneyBox.source,
    // The planning anchor a money box was created from is not read by any consumer, and exposing it
    // under the old name would hand out an id of a table it no longer belongs to.
    ...(moneyBox.growthRatePct !== undefined ? { growthRatePct: moneyBox.growthRatePct } : {}),
    ...(moneyBox.spendingReducesProgress !== undefined
      ? { spendingReducesProgress: moneyBox.spendingReducesProgress }
      : {}),
    ...(moneyBox.heldOutsideBalance !== undefined ? { heldOutsideBalance: moneyBox.heldOutsideBalance } : {}),
    createdAtMs: moneyBox.createdAtMs,
    updatedAtMs: moneyBox.updatedAtMs,
  };
}

function todayIsoDate() {
  // Server-side planning dates use UTC; user-local rollover is tracked as a follow-up.
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertIsoDate(value: string, label: string) {
  if (!isIsoDate(value)) {
    throw new ConvexError(`${label} must be an ISO date`);
  }
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDateFromUtcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string) {
  return Math.floor((utcDate(endDate).getTime() - utcDate(startDate).getTime()) / (24 * 60 * 60 * 1000));
}

function addDaysToIsoDate(date: string, days: number) {
  const value = utcDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDateFromUtcDate(value);
}

function clampDay(year: number, monthIndex: number, day: number) {
  return Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

function addMonthsClampedToIsoDate(date: string, months: number) {
  const value = utcDate(date);
  const targetMonth = value.getUTCMonth() + months;
  const targetYear = value.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const targetDay = clampDay(targetYear, normalizedMonth, value.getUTCDate());
  return isoDateFromUtcDate(new Date(Date.UTC(targetYear, normalizedMonth, targetDay)));
}

function monthDifference(startDate: string, endDate: string) {
  const start = utcDate(startDate);
  const end = utcDate(endDate);
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
}

function normalizePlanningCycleIntervalCount(value: number | undefined) {
  const normalizedCount = value ?? 1;
  if (!Number.isInteger(normalizedCount) || normalizedCount < 1) {
    throw new ConvexError('Cycle interval count must be an integer greater than or equal to 1');
  }

  return Math.min(normalizedCount, 365);
}

function normalizePlanningPreferenceForCycle(
  preference: Pick<PlanningPreference, 'cycleInterval' | 'cycleIntervalCount' | 'anchorDate'>,
) {
  return {
    cycleInterval: preference.cycleInterval,
    cycleIntervalCount:
      preference.cycleInterval === 'month' ? 1 : normalizePlanningCycleIntervalCount(preference.cycleIntervalCount),
    anchorDate: preference.anchorDate,
  };
}

function defaultPlanningPreference(asOfDate: string) {
  assertIsoDate(asOfDate, 'As-of date');
  return {
    cycleInterval: 'month' as const,
    cycleIntervalCount: 1,
    anchorDate: `${asOfDate.slice(0, 8)}01`,
  };
}

function currentCycleStartForFixedDayInterval(input: {
  anchorDate: string;
  asOfDate: string;
  cycleOffset: number;
  intervalDays: number;
}) {
  const baseCycleIndex = Math.floor(daysBetween(input.anchorDate, input.asOfDate) / input.intervalDays);
  return addDaysToIsoDate(input.anchorDate, (baseCycleIndex + input.cycleOffset) * input.intervalDays);
}

function currentCycleStartForMonthInterval(input: {
  anchorDate: string;
  asOfDate: string;
  cycleOffset: number;
  intervalMonths: number;
}) {
  let cycleIndex = Math.floor(monthDifference(input.anchorDate, input.asOfDate) / input.intervalMonths);
  let startDate = addMonthsClampedToIsoDate(input.anchorDate, cycleIndex * input.intervalMonths);
  let nextStartDate = addMonthsClampedToIsoDate(input.anchorDate, (cycleIndex + 1) * input.intervalMonths);

  while (startDate > input.asOfDate) {
    cycleIndex -= 1;
    startDate = addMonthsClampedToIsoDate(input.anchorDate, cycleIndex * input.intervalMonths);
    nextStartDate = addMonthsClampedToIsoDate(input.anchorDate, (cycleIndex + 1) * input.intervalMonths);
  }

  while (nextStartDate <= input.asOfDate) {
    cycleIndex += 1;
    startDate = nextStartDate;
    nextStartDate = addMonthsClampedToIsoDate(input.anchorDate, (cycleIndex + 1) * input.intervalMonths);
  }

  return addMonthsClampedToIsoDate(input.anchorDate, (cycleIndex + input.cycleOffset) * input.intervalMonths);
}

function buildPlanningCycleWindow(input: {
  preference: Pick<PlanningPreference, 'cycleInterval' | 'cycleIntervalCount' | 'anchorDate'>;
  asOfDate?: string;
  cycleOffset?: number;
}): PlanningCycleWindow {
  const asOfDate = (input.asOfDate ?? todayIsoDate()).slice(0, 10);
  const cycleOffset = input.cycleOffset ?? 0;
  if (!Number.isInteger(cycleOffset) || cycleOffset < -120 || cycleOffset > 120) {
    throw new ConvexError('Cycle offset must be an integer between -120 and 120');
  }

  assertIsoDate(asOfDate, 'As-of date');
  const preference = normalizePlanningPreferenceForCycle(input.preference);
  assertIsoDate(preference.anchorDate, 'Anchor date');
  const cycleIntervalCount = preference.cycleIntervalCount;
  let cycleStartDate: string;
  let nextCycleStartDate: string;

  if (preference.cycleInterval === 'day' || preference.cycleInterval === 'week') {
    const intervalDays = (preference.cycleInterval === 'week' ? 7 : 1) * cycleIntervalCount;
    cycleStartDate = currentCycleStartForFixedDayInterval({
      anchorDate: preference.anchorDate,
      asOfDate,
      cycleOffset,
      intervalDays,
    });
    nextCycleStartDate = addDaysToIsoDate(cycleStartDate, intervalDays);
  } else {
    const intervalMonths = (preference.cycleInterval === 'year' ? 12 : 1) * cycleIntervalCount;
    cycleStartDate = currentCycleStartForMonthInterval({
      anchorDate: preference.anchorDate,
      asOfDate,
      cycleOffset,
      intervalMonths,
    });
    nextCycleStartDate = addMonthsClampedToIsoDate(cycleStartDate, intervalMonths);
  }

  return {
    cycleStartDate,
    cycleEndDate: addDaysToIsoDate(nextCycleStartDate, -1),
    asOfDate: cycleOffset === 0 && asOfDate > cycleStartDate ? asOfDate : cycleStartDate,
    cycleOffset,
  };
}

function addMoney(totals: Array<MoneyAmount>, amount: MoneyAmount) {
  const existingTotal = totals.find((total) => total.currency === amount.currency);
  if (existingTotal) {
    existingTotal.amountMinor += amount.amountMinor;
    return;
  }

  totals.push({ ...amount });
}

function zeroMoney(currency: string): MoneyAmount {
  return {
    amountMinor: 0n,
    currency,
  };
}

function totalsToMoney(totals: Array<MoneyAmount>) {
  return [...totals].sort((left, right) => left.currency.localeCompare(right.currency));
}

function sortCashflowItems(items: Array<FutureCashflowItem>) {
  items.sort(
    (left, right) =>
      left.dueDate.localeCompare(right.dueDate) ||
      (left.direction === right.direction ? 0 : left.direction === 'inflow' ? -1 : 1) ||
      left.title.localeCompare(right.title),
  );
}

function addUpcomingItem(
  group: FutureCashflowAccountGroup,
  upcomingTotals: Array<MoneyAmount>,
  item: FutureCashflowItem,
) {
  group.items.push(item);
  if (item.direction === 'outflow' && item.source !== 'plannedTransfer' && !item.occurrencePayment) {
    addMoney(group.totals, item.amount);
    addMoney(upcomingTotals, item.amount);
  }
}

async function statementProjectionMonth(ctx: QueryCtx, facilityId: Id<'creditFacilities'>, fallbackMonth: string) {
  const openCycles = await ctx.db
    .query('creditFacilityUsageCycles')
    .withIndex('by_creditFacilityId_and_status', (q) => q.eq('creditFacilityId', facilityId).eq('status', 'open'))
    .take(10);
  const openCycle = openCycles.toSorted((left, right) => left.cycleMonth.localeCompare(right.cycleMonth)).at(0);
  return openCycle?.cycleMonth ?? fallbackMonth;
}

async function buildCreditStatementProjectionItems(
  ctx: QueryCtx,
  input: {
    facility: Doc<'creditFacilities'>;
    scheduledCycles: Array<Doc<'creditFacilityUsageCycles'>>;
    pendingCardTransfers: Array<Doc<'plannedTransactions'>>;
    asOfDate: string;
    horizonDate: string;
    fallbackMonth: string;
  },
) {
  const { facility, scheduledCycles, pendingCardTransfers, asOfDate, horizonDate } = input;
  if (facility.facilityType !== 'cardCreditLine') {
    return [];
  }

  const projectionMonth = await statementProjectionMonth(ctx, facility._id, input.fallbackMonth);
  // CARD-linked facilities derive usage from the card balance, which does not
  // reset when a month closes: subtract what already-scheduled cycles cover so
  // the projection only carries the not-yet-invoiced remainder.
  let baseAmountMinor = facility.usedAmount.amountMinor;
  if (await linkedCardAccountForFacility(ctx, facility)) {
    const { usedAmount } = await effectiveFacilityUsedAmount(ctx, facility);
    const scheduledTotalMinor = scheduledCycles.reduce((total, cycle) => total + cycle.trackedAmount.amountMinor, 0n);
    baseAmountMinor = unscheduledCardUsageMinor(usedAmount.amountMinor, scheduledTotalMinor);
  }
  const amountByMonth = new Map<string, bigint>();
  amountByMonth.set(projectionMonth, baseAmountMinor);
  for (const transfer of pendingCardTransfers) {
    const transferMonth = transfer.dueDate.slice(0, 7);
    const statementMonth = transferMonth > projectionMonth ? transferMonth : projectionMonth;
    amountByMonth.set(statementMonth, (amountByMonth.get(statementMonth) ?? 0n) + transfer.amount.amountMinor);
  }

  const scheduledMonths = new Set(scheduledCycles.map((cycle) => cycle.cycleMonth));
  const items: Array<FutureCashflowItem> = [];
  for (const [cycleMonth, amountMinor] of amountByMonth) {
    const dueDate = defaultUsageCycleDueDate(facility, cycleMonth);
    if (scheduledMonths.has(cycleMonth) || dueDate < asOfDate || dueDate > horizonDate || amountMinor <= 0n) {
      continue;
    }
    items.push({
      key: `creditStatementProjection:${facility._id}:${dueDate}`,
      source: 'creditStatement',
      title: facility.name,
      subtitle: cycleMonth,
      dueDate,
      amount: { amountMinor, currency: facility.usedAmount.currency },
      direction: 'outflow',
      creditFacilityId: facility._id,
      creditCycleMonth: cycleMonth,
    });
  }
  return items;
}

function normalizeMonthsAhead(value: number | undefined) {
  const monthsAhead = value ?? 3;
  if (!Number.isInteger(monthsAhead) || monthsAhead < 0) {
    throw new ConvexError('Months ahead must be a non-negative integer');
  }

  return Math.min(monthsAhead, 24);
}

function normalizeHorizonDate(asOfDate: string, horizonDate: string | undefined, monthsAhead: number) {
  const normalizedHorizonDate = horizonDate?.slice(0, 10) ?? addMonthsToIsoDate(asOfDate, monthsAhead);
  if (normalizedHorizonDate < asOfDate) {
    throw new ConvexError('Horizon date must be on or after the start date');
  }

  return normalizedHorizonDate;
}

function moneyBoxPatchForPlannedExpenseStatus(moneyBox: Doc<'moneyBoxes'>, status: PlannedExpenseStatus, now: number) {
  if (status === 'paid') {
    return {
      status: 'completed' as const,
      savedAmount:
        moneyBox.savedAmount.currency === moneyBox.targetAmount.currency &&
        moneyBox.savedAmount.amountMinor < moneyBox.targetAmount.amountMinor
          ? moneyBox.targetAmount
          : moneyBox.savedAmount,
      updatedAtMs: now,
    };
  }

  if (status === 'cancelled') {
    return {
      status: 'archived' as const,
      updatedAtMs: now,
    };
  }

  if (status === 'funding') {
    return {
      status: 'active' as const,
      updatedAtMs: now,
    };
  }

  if (moneyBox.status === 'active') {
    return {
      status: 'archived' as const,
      updatedAtMs: now,
    };
  }

  return null;
}

async function setSinglePlannedExpensePaid(ctx: MutationCtx, expense: Doc<'plannedTransactions'>, now: number) {
  if (expense.recurrenceInterval) {
    return;
  }

  await ctx.db.patch('plannedTransactions', expense._id, {
    status: 'paid',
    updatedAtMs: now,
  });
  if (!expense.moneyBoxId) {
    return;
  }

  const moneyBox = await ctx.db.get('moneyBoxes', expense.moneyBoxId);
  if (moneyBox && moneyBox.userId === expense.userId) {
    const patch = moneyBoxPatchForPlannedExpenseStatus(moneyBox, 'paid', now);
    if (patch) {
      await ctx.db.patch('moneyBoxes', moneyBox._id, patch);
      await invalidateAllPlanSnapshots(ctx, expense.userId);
    }
  }
}

function normalizeRecurrenceIntervalCount(
  recurrenceInterval: Doc<'plannedTransactions'>['recurrenceInterval'],
  recurrenceIntervalCount: number | undefined,
) {
  if (!recurrenceInterval) {
    return undefined;
  }

  const normalizedCount = recurrenceIntervalCount ?? 1;
  if (!Number.isInteger(normalizedCount) || normalizedCount < 1) {
    throw new ConvexError('Recurrence interval count must be an integer greater than or equal to 1');
  }

  return normalizedCount;
}

function normalizePlannedTransferStatus(status: 'planned' | 'completed' | 'cancelled') {
  if (status !== 'completed') {
    throw new ConvexError('Planned transfer status must be completed');
  }

  return 'paid' as const;
}

function isPlannedExpense(expense: Doc<'plannedTransactions'> | null): expense is Doc<'plannedTransactions'> {
  return expense?.kind === 'expense' || expense?.kind === 'income';
}

function plannedExpenseDirection(expense: Pick<Doc<'plannedTransactions'>, 'direction'>): PlannedExpenseDirection {
  return expense.direction ?? 'outflow';
}

async function validatePlannedTransferEndpoints(
  ctx: QueryCtx,
  input: {
    userId: string;
    fromAccountId?: Id<'financialAccounts'>;
    fromCreditFacilityId?: Id<'creditFacilities'>;
    toAccountId: Id<'financialAccounts'>;
    amount: MoneyAmount;
  },
) {
  if (Boolean(input.fromAccountId) === Boolean(input.fromCreditFacilityId)) {
    throw new ConvexError('Planned transfer requires exactly one source');
  }

  if (input.amount.amountMinor <= 0n) {
    throw new ConvexError('Planned transfer amount must be positive');
  }

  const toAccount = await ctx.db.get('financialAccounts', input.toAccountId);
  if (!toAccount || toAccount.userId !== input.userId) {
    throw new ConvexError('Destination account not found');
  }

  if (input.fromAccountId) {
    if (input.fromAccountId === input.toAccountId) {
      throw new ConvexError('Planned transfers require two different accounts');
    }
    const fromAccount = await ctx.db.get('financialAccounts', input.fromAccountId);
    if (!fromAccount || fromAccount.userId !== input.userId) {
      throw new ConvexError('Source account not found');
    }
    if (fromAccount.currency !== input.amount.currency || toAccount.currency !== input.amount.currency) {
      throw new ConvexError('Planned transfers across currencies are not supported yet');
    }
    return { fromAccount, toAccount };
  }

  const facility = await ctx.db.get('creditFacilities', input.fromCreditFacilityId!);
  if (!facility || facility.userId !== input.userId) {
    throw new ConvexError('Source credit facility not found');
  }
  if (facility.facilityType !== 'cardCreditLine' || facility.status !== 'active') {
    throw new ConvexError('Source credit facility must be an active card credit line');
  }
  if (facility.limitAmount.currency !== input.amount.currency || toAccount.currency !== input.amount.currency) {
    throw new ConvexError('Planned transfers across currencies are not supported yet');
  }

  return { facility, toAccount };
}

function applyCashflowToBalance(balance: MoneyAmount, item: FutureCashflowItem) {
  if (balance.currency !== item.amount.currency) {
    return null;
  }

  return {
    amountMinor:
      item.direction === 'inflow'
        ? balance.amountMinor + item.amount.amountMinor
        : balance.amountMinor - item.amount.amountMinor,
    currency: balance.currency,
  };
}

function availableForProjectedBalance(balance: MoneyAmount, overdraftLimitAmount: MoneyAmount | undefined) {
  return availableBalance(balance, overdraftLimitAmount);
}

function subscriptionOccurrences(
  input: {
    subscriptionId: Id<'subscriptions'>;
    name: string;
    merchantName?: string;
    amount: MoneyAmount;
    interval: 'day' | 'week' | 'month' | 'year';
    intervalCount: number;
    startDate: string;
    nextDueDate?: string;
    asOfDate: string;
    horizonDate: string;
  },
  account: Doc<'financialAccounts'> | undefined,
) {
  const occurrences: Array<FutureCashflowItem> = [];
  let dueDate = (input.nextDueDate ?? input.startDate).slice(0, 10);
  // Guard long-running recurrence expansion; deep weekly offsets can still truncate after 240 occurrences.
  for (let guard = 0; guard < 240 && dueDate < input.asOfDate; guard += 1) {
    dueDate = addRecurringInterval(dueDate, input.interval, input.intervalCount);
  }

  for (let guard = 0; guard < 240 && dueDate <= input.horizonDate; guard += 1) {
    occurrences.push({
      key: `subscription:${input.subscriptionId}:${dueDate}`,
      source: 'subscription',
      title: input.name,
      subtitle: input.merchantName,
      dueDate,
      amount: input.amount,
      direction: 'outflow',
      account,
    });
    dueDate = addRecurringInterval(dueDate, input.interval, input.intervalCount);
  }

  return occurrences;
}

function plannedExpenseOccurrences(
  expense: Doc<'plannedTransactions'>,
  input: {
    asOfDate: string;
    horizonDate: string;
  },
  account: Doc<'financialAccounts'> | undefined,
) {
  if (!expense.recurrenceInterval) {
    if (expense.dueDate < input.asOfDate || expense.dueDate > input.horizonDate) {
      return [];
    }

    return [
      {
        key: `plannedExpense:${expense._id}:${expense.dueDate}`,
        source: 'plannedExpense' as const,
        title: expense.name,
        subtitle: expense.description,
        note: expense.note,
        dueDate: expense.dueDate,
        amount: expense.amount,
        direction: plannedExpenseDirection(expense),
        account,
        plannedExpenseId: expense._id,
        plannedExpenseStatus: expense.status,
        plannedExpenseMoneyBoxId: expense.moneyBoxId,
      },
    ];
  }

  const occurrences: Array<FutureCashflowItem> = [];
  const interval = expense.recurrenceInterval;
  const intervalCount = expense.recurrenceIntervalCount ?? 1;
  let dueDate = expense.dueDate.slice(0, 10);

  // Guard long-running recurrence expansion; deep weekly offsets can still truncate after 240 occurrences.
  for (let guard = 0; guard < 240 && dueDate < input.asOfDate; guard += 1) {
    dueDate = addRecurringInterval(dueDate, interval, intervalCount);
  }

  for (let guard = 0; guard < 240 && dueDate <= input.horizonDate; guard += 1) {
    occurrences.push({
      key: `plannedExpense:${expense._id}:${dueDate}`,
      source: 'plannedExpense',
      title: expense.name,
      subtitle: expense.description,
      note: expense.note,
      dueDate,
      amount: expense.amount,
      direction: plannedExpenseDirection(expense),
      account,
      plannedExpenseId: expense._id,
      plannedExpenseStatus: expense.status,
      plannedExpenseMoneyBoxId: expense.moneyBoxId,
    });
    dueDate = addRecurringInterval(dueDate, interval, intervalCount);
  }

  return occurrences;
}

const MAX_LEDGER_PLANNED_RULES_PER_BUCKET = 200;
const MAX_LEDGER_OCCURRENCE_PAYMENTS = 1000;

type LedgerPlannedOccurrence = {
  plannedTransactionId: Id<'plannedTransactions'>;
  dueDate: string;
  name: string;
  description?: string;
  note?: string;
  amount: MoneyAmount;
  direction: PlannedExpenseDirection;
  categoryId?: Id<'categories'>;
  accountId: Id<'financialAccounts'>;
  recurrence: {
    interval: NonNullable<Doc<'plannedTransactions'>['recurrenceInterval']>;
    count: number;
  };
};

function nextRecurringOccurrenceDate(
  expense: Pick<Doc<'plannedTransactions'>, 'dueDate' | 'recurrenceInterval' | 'recurrenceIntervalCount'>,
  asOfDate: string,
) {
  if (!expense.recurrenceInterval) {
    return null;
  }

  let dueDate = expense.dueDate.slice(0, 10);
  for (let guard = 0; guard < 240 && dueDate < asOfDate; guard += 1) {
    dueDate = addRecurringInterval(dueDate, expense.recurrenceInterval, expense.recurrenceIntervalCount ?? 1);
  }

  return dueDate >= asOfDate ? dueDate : null;
}

export const listNextLedgerPlannedOccurrencesForUser = internalQuery({
  args: {
    userId: v.string(),
    accountId: v.optional(v.id('financialAccounts')),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Array<LedgerPlannedOccurrence>> => {
    const asOfDate = (args.asOfDate ?? todayIsoDate()).slice(0, 10);
    assertIsoDate(asOfDate, 'As-of date');

    const paidOccurrences = await ctx.db
      .query('plannedExpenseOccurrencePayments')
      .withIndex('by_userId_and_dueDate', (q) => q.eq('userId', args.userId).gte('dueDate', asOfDate))
      .take(MAX_LEDGER_OCCURRENCE_PAYMENTS);
    const paidOccurrenceKeys = new Set<string>();
    for (const payment of paidOccurrences) {
      if (payment.status === 'paid' && payment.plannedTransactionId) {
        paidOccurrenceKeys.add(`${payment.plannedTransactionId}:${payment.dueDate}`);
      }
    }

    const rulesById = new Map<Id<'plannedTransactions'>, Doc<'plannedTransactions'>>();
    for (const status of activePlannedExpenseStatuses) {
      for (const kind of ['expense', 'income'] as const) {
        for (const recurrenceInterval of ['day', 'week', 'month', 'year'] as const) {
          const rules = args.accountId
            ? await ctx.db
                .query('plannedTransactions')
                .withIndex('by_userId_kind_accountId_status_recurrence', (q) =>
                  q
                    .eq('userId', args.userId)
                    .eq('kind', kind)
                    .eq('accountId', args.accountId)
                    .eq('status', status)
                    .eq('recurrenceInterval', recurrenceInterval),
                )
                .take(MAX_LEDGER_PLANNED_RULES_PER_BUCKET)
            : await ctx.db
                .query('plannedTransactions')
                .withIndex('by_userId_kind_status_recurrence', (q) =>
                  q
                    .eq('userId', args.userId)
                    .eq('kind', kind)
                    .eq('status', status)
                    .eq('recurrenceInterval', recurrenceInterval),
                )
                .take(MAX_LEDGER_PLANNED_RULES_PER_BUCKET);

          for (const rule of rules) {
            if (rule.accountId) {
              rulesById.set(rule._id, rule);
            }
          }
        }
      }
    }

    const occurrences: Array<LedgerPlannedOccurrence> = [];
    for (const rule of rulesById.values()) {
      let dueDate = nextRecurringOccurrenceDate(rule, asOfDate);
      if (!dueDate || !rule.accountId || !rule.recurrenceInterval) {
        continue;
      }

      // A paid date is complete, so the register advances this rule to its next unpaid occurrence.
      for (let guard = 0; guard < 240 && paidOccurrenceKeys.has(`${rule._id}:${dueDate}`); guard += 1) {
        dueDate = addRecurringInterval(dueDate, rule.recurrenceInterval, rule.recurrenceIntervalCount ?? 1);
      }
      if (paidOccurrenceKeys.has(`${rule._id}:${dueDate}`)) {
        continue;
      }

      occurrences.push({
        plannedTransactionId: rule._id,
        dueDate,
        name: rule.name,
        ...(rule.description !== undefined ? { description: rule.description } : {}),
        ...(rule.note !== undefined ? { note: rule.note } : {}),
        amount: rule.amount,
        direction: plannedExpenseDirection(rule),
        ...(rule.categoryId !== undefined ? { categoryId: rule.categoryId } : {}),
        accountId: rule.accountId,
        recurrence: {
          interval: rule.recurrenceInterval,
          count: rule.recurrenceIntervalCount ?? 1,
        },
      });
    }

    return occurrences.toSorted(
      (left, right) =>
        left.dueDate.localeCompare(right.dueDate) ||
        left.name.localeCompare(right.name) ||
        left.plannedTransactionId.localeCompare(right.plannedTransactionId),
    );
  },
});

export const listNextLedgerPlannedOccurrences = query({
  args: {
    accountId: v.optional(v.id('financialAccounts')),
  },
  handler: async (ctx, args): Promise<Array<LedgerPlannedOccurrence>> => {
    const user = await requireAuthUser(ctx);
    const occurrences: Array<LedgerPlannedOccurrence> = await ctx.runQuery(
      internal.banking.planning.listNextLedgerPlannedOccurrencesForUser,
      {
        userId: user.id,
        accountId: args.accountId,
      },
    );
    return occurrences;
  },
});

export const listMoneyBoxes = query({
  args: {
    status: v.optional(v.union(v.literal('active'), v.literal('completed'), v.literal('archived'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);

    const moneyBoxes = args.status
      ? await ctx.db
          .query('moneyBoxes')
          .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', args.status!))
          .take(limit)
      : await ctx.db
          .query('moneyBoxes')
          .withIndex('by_userId_and_targetDate', (q) => q.eq('userId', user.id))
          .take(limit);

    return moneyBoxes.map(moneyBoxResult);
  },
});

export const getFutureCashflowForUser = internalQuery({
  args: {
    userId: v.string(),
    monthsAhead: v.optional(v.number()),
    limit: v.optional(v.number()),
    asOfDate: v.optional(v.string()),
    horizonDate: v.optional(v.string()),
    contributionCycleStartDate: v.optional(v.string()),
    contributionCycleEndDate: v.optional(v.string()),
    contributionAsOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<FutureCashflowSummary> => {
    const asOfDate = (args.asOfDate ?? todayIsoDate()).slice(0, 10);
    const monthsAhead = normalizeMonthsAhead(args.monthsAhead);
    const limit = Math.min(args.limit ?? 12, 100);
    const horizonDate = normalizeHorizonDate(asOfDate, args.horizonDate, monthsAhead);
    const projectedCycleMonth = todayIsoDate().slice(0, 7);
    const upcomingTotals: Array<MoneyAmount> = [];
    const monthlyFundingTotals: Array<MoneyAmount> = [];
    const occurrencePayments = await ctx.db
      .query('plannedExpenseOccurrencePayments')
      .withIndex('by_userId_and_dueDate', (q) =>
        q.eq('userId', args.userId).gte('dueDate', asOfDate).lte('dueDate', horizonDate),
      )
      .take(200);
    const occurrencePaymentByKey = new Map(
      occurrencePayments
        .filter((payment) => payment.status === 'paid')
        .map((payment) => [`${payment.plannedTransactionId}:${payment.dueDate}`, payment]),
    );

    function withOccurrencePayment(item: FutureCashflowItem) {
      if (!item.plannedExpenseId) {
        return item;
      }
      const payment = occurrencePaymentByKey.get(`${item.plannedExpenseId}:${item.dueDate}`);
      if (!payment) {
        return item;
      }
      return {
        ...item,
        occurrencePayment: {
          source: payment.source,
          transactionId: payment.transactionId,
        },
      };
    }

    const activeAccounts = await ctx.db
      .query('financialAccounts')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(100);
    // CARD groups stay: their rows are shown for inspection and their
    // statement outflows route to the settlement account. Asset accounts have
    // no cashflow at all, so they are dropped from the groups entirely.
    const accounts = activeAccounts.filter((account) => !account.hidden && !isAssetAccountType(account.accountType));

    const accountGroups: Array<FutureCashflowAccountGroup> = accounts.map((account) => ({
      accountId: account._id,
      account,
      items: [],
      totals: [],
    }));
    const accountGroupById = new Map(accountGroups.map((group) => [group.account?._id, group]));
    const unknownAccountGroup: FutureCashflowAccountGroup = {
      accountId: 'unknown',
      account: undefined,
      items: [],
      totals: [],
    };
    const plannedTransfers: Array<Doc<'plannedTransactions'>> = [];
    for (const status of plannedTransferActiveStatuses) {
      plannedTransfers.push(
        ...(await ctx.db
          .query('plannedTransactions')
          .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) =>
            q
              .eq('userId', args.userId)
              .eq('kind', 'transfer')
              .eq('status', status)
              .gte('dueDate', asOfDate)
              .lte('dueDate', horizonDate),
          )
          .take(200)),
      );
    }
    const pendingCardTransfersByFacility = new Map<Id<'creditFacilities'>, Array<Doc<'plannedTransactions'>>>();
    for (const transfer of plannedTransfers) {
      if (!transfer.fromCreditFacilityId) {
        continue;
      }
      const facilityTransfers = pendingCardTransfersByFacility.get(transfer.fromCreditFacilityId) ?? [];
      facilityTransfers.push(transfer);
      pendingCardTransfersByFacility.set(transfer.fromCreditFacilityId, facilityTransfers);
    }
    const cardSourceFacilities = await Promise.all(
      [...pendingCardTransfersByFacility.keys()].map((facilityId) => ctx.db.get('creditFacilities', facilityId)),
    );
    const cardSourceFacilityNameById = new Map(
      cardSourceFacilities.flatMap((facility) => (facility ? [[facility._id, facility.name] as const] : [])),
    );

    // Facilities linked to a CARD account settle from a different account: the
    // statement outflow belongs to the settlement account group (or the
    // unknown group when none is configured), never to the card itself.
    const activeFacilities = await ctx.db
      .query('creditFacilities')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(200);
    const cardLinkedFacilityIds = new Set<Id<'creditFacilities'>>();
    const cardStatementFacilitiesBySettlementAccountId = new Map<
      Id<'financialAccounts'> | 'unknown',
      Array<Doc<'creditFacilities'>>
    >();
    const installmentFacilitiesBySettlementAccountId = new Map<
      Id<'financialAccounts'>,
      Array<Doc<'creditFacilities'>>
    >();
    const settlementRoutedInstallmentFacilityIds = new Set<Id<'creditFacilities'>>();
    for (const facility of activeFacilities) {
      const linkedCardAccount = await linkedCardAccountForFacility(ctx, facility);
      if (linkedCardAccount) {
        cardLinkedFacilityIds.add(facility._id);
        const settlementKey = facility.settlementAccountId ?? 'unknown';
        const statementFacilities = cardStatementFacilitiesBySettlementAccountId.get(settlementKey) ?? [];
        statementFacilities.push(facility);
        cardStatementFacilitiesBySettlementAccountId.set(settlementKey, statementFacilities);
      }

      if (facility.settlementAccountId && (linkedCardAccount || isLoanFacilityType(facility.facilityType))) {
        const installmentFacilities =
          installmentFacilitiesBySettlementAccountId.get(facility.settlementAccountId) ?? [];
        installmentFacilities.push(facility);
        installmentFacilitiesBySettlementAccountId.set(facility.settlementAccountId, installmentFacilities);
        settlementRoutedInstallmentFacilityIds.add(facility._id);
      }
    }

    function belongsToUnknownAccountGroup(facility: Doc<'creditFacilities'>) {
      return (
        (!facility.linkedAccountId && !facility.settlementAccountId) ||
        (cardLinkedFacilityIds.has(facility._id) && !facility.settlementAccountId)
      );
    }

    async function addPlannedExpensesForGroup(group: FutureCashflowAccountGroup, accountId: Id<'financialAccounts'>) {
      const occurrences: Array<{ expense: Doc<'plannedTransactions'>; occurrence: FutureCashflowItem }> = [];

      for (const status of activePlannedExpenseStatuses) {
        for (const kind of ['expense', 'income'] as const) {
          const plannedExpenses = await ctx.db
            .query('plannedTransactions')
            .withIndex('by_userId_and_kind_and_accountId_and_status', (q) =>
              q.eq('userId', args.userId).eq('kind', kind).eq('accountId', accountId).eq('status', status),
            )
            .take(100);

          for (const expense of plannedExpenses) {
            for (const occurrence of plannedExpenseOccurrences(expense, { asOfDate, horizonDate }, group.account)) {
              occurrences.push({ expense, occurrence });
            }
          }
        }
      }

      occurrences.sort(
        (left, right) =>
          left.occurrence.dueDate.localeCompare(right.occurrence.dueDate) ||
          (left.occurrence.direction === right.occurrence.direction
            ? 0
            : left.occurrence.direction === 'inflow'
              ? -1
              : 1) ||
          left.occurrence.title.localeCompare(right.occurrence.title),
      );

      for (const { occurrence } of occurrences) {
        addUpcomingItem(group, upcomingTotals, withOccurrencePayment(occurrence));
      }
    }

    async function addSubscriptionsForGroup(group: FutureCashflowAccountGroup, accountId: Id<'financialAccounts'>) {
      const subscriptions = await ctx.db
        .query('subscriptions')
        .withIndex('by_userId_and_accountId_and_status', (q) =>
          q.eq('userId', args.userId).eq('accountId', accountId).eq('status', 'active'),
        )
        .take(100);

      for (const subscription of subscriptions) {
        for (const occurrence of subscriptionOccurrences(
          {
            subscriptionId: subscription._id,
            name: subscription.name,
            merchantName: subscription.merchantName,
            amount: subscription.amount,
            interval: subscription.interval,
            intervalCount: subscription.intervalCount,
            startDate: subscription.startDate,
            nextDueDate: subscription.nextDueDate,
            asOfDate,
            horizonDate,
          },
          group.account,
        )) {
          addUpcomingItem(group, upcomingTotals, occurrence);
        }
      }
    }

    async function addScheduledTransactionsForGroup(
      group: FutureCashflowAccountGroup,
      accountId: Id<'financialAccounts'>,
    ) {
      const transactions = await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
          q
            .eq('userId', args.userId)
            .eq('accountId', accountId)
            .gte('bookingDate', asOfDate)
            .lte('bookingDate', horizonDate),
        )
        .take(500);

      for (const transaction of transactions) {
        if (transaction.status !== 'SCHD') {
          continue;
        }

        addUpcomingItem(group, upcomingTotals, {
          key: `scheduled:${transaction._id}`,
          source: 'scheduledTransaction',
          title: transaction.description,
          subtitle: transaction.counterpartyName ?? undefined,
          dueDate: transaction.bookingDate,
          amount: {
            amountMinor: absoluteMinorUnits(transaction.amount.amountMinor),
            currency: transaction.amount.currency,
          },
          direction: transaction.direction === 'DBIT' ? 'outflow' : 'inflow',
          account: group.account,
          transactionId: transaction._id,
        });
      }
    }

    async function addInstallmentItemsForFacility(
      group: FutureCashflowAccountGroup,
      facility: Doc<'creditFacilities'>,
    ) {
      const plans = await ctx.db
        .query('creditFacilityInstallmentPlans')
        .withIndex('by_creditFacilityId_and_status', (q) =>
          q.eq('creditFacilityId', facility._id).eq('status', 'active'),
        )
        .take(100);

      const creditPaymentGroups = new Map<string, FutureCashflowItem>();
      for (const plan of plans) {
        for (const payment of buildInstallmentPaymentSchedule({
          monthlyPaymentAmount: plan.monthlyPaymentAmount,
          outstandingAmount: plan.outstandingAmount,
          startDate: plan.startDate,
          nextPaymentDate: plan.nextPaymentDate,
          remainingInstallments: plan.remainingInstallments,
          asOfDate,
          monthsAhead,
        })) {
          if (payment.dueDate < asOfDate || payment.dueDate > horizonDate) {
            continue;
          }

          const itemKey = `creditInstallment:${facility._id}:${payment.dueDate}`;
          const existingItem = creditPaymentGroups.get(itemKey);
          const detail = {
            installmentPlanId: plan._id,
            planName: plan.name,
            amount: payment.amount,
            remainingAfterPayment: payment.remainingAfterPayment,
          };
          if (existingItem) {
            existingItem.amount.amountMinor += payment.amount.amountMinor;
            existingItem.creditPlanCount = (existingItem.creditPlanCount ?? 0) + 1;
            existingItem.creditInstallmentDetails?.push(detail);
            continue;
          }

          creditPaymentGroups.set(itemKey, {
            key: itemKey,
            source: 'creditInstallment',
            title: facility.name,
            dueDate: payment.dueDate,
            amount: { ...payment.amount },
            direction: 'outflow',
            account: group.account,
            creditFacilityId: facility._id,
            creditPlanCount: 1,
            creditInstallmentDetails: [detail],
          });
        }
      }

      for (const item of creditPaymentGroups.values()) {
        addUpcomingItem(group, upcomingTotals, item);
      }
    }

    async function addCreditInstallmentsForGroup(
      group: FutureCashflowAccountGroup,
      accountId: Id<'financialAccounts'>,
    ) {
      const facilities = await ctx.db
        .query('creditFacilities')
        .withIndex('by_linkedAccountId', (q) => q.eq('linkedAccountId', accountId))
        .take(100);

      for (const facility of facilities) {
        if (facility.userId !== args.userId || facility.status !== 'active') {
          continue;
        }

        // Card and loan instalments with a settlement account are routed below.
        if (cardLinkedFacilityIds.has(facility._id) || settlementRoutedInstallmentFacilityIds.has(facility._id)) {
          continue;
        }

        await addInstallmentItemsForFacility(group, facility);
      }

      for (const facility of installmentFacilitiesBySettlementAccountId.get(accountId) ?? []) {
        await addInstallmentItemsForFacility(group, facility);
      }
    }

    async function addStatementItemsForFacility(group: FutureCashflowAccountGroup, facility: Doc<'creditFacilities'>) {
      const cycles = await ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_creditFacilityId_and_status', (q) =>
          q.eq('creditFacilityId', facility._id).eq('status', 'scheduled'),
        )
        .take(100);

      for (const cycle of cycles) {
        if (
          cycle.userId !== args.userId ||
          cycle.dueDate < asOfDate ||
          cycle.dueDate > horizonDate ||
          cycle.trackedAmount.amountMinor <= 0n
        ) {
          continue;
        }

        addUpcomingItem(group, upcomingTotals, {
          key: `creditStatement:${cycle._id}:${cycle.dueDate}`,
          source: 'creditStatement',
          title: facility.name,
          subtitle: cycle.cycleMonth,
          dueDate: cycle.dueDate,
          amount: cycle.trackedAmount,
          direction: 'outflow',
          account: group.account,
          creditFacilityId: facility._id,
          creditUsageCycleId: cycle._id,
          creditCycleMonth: cycle.cycleMonth,
        });
      }

      const projectionItems = await buildCreditStatementProjectionItems(ctx, {
        facility,
        scheduledCycles: cycles,
        pendingCardTransfers: pendingCardTransfersByFacility.get(facility._id) ?? [],
        asOfDate,
        horizonDate,
        fallbackMonth: projectedCycleMonth,
      });
      for (const item of projectionItems) {
        addUpcomingItem(group, upcomingTotals, { ...item, account: group.account });
      }
    }

    async function addCreditStatementsForGroup(group: FutureCashflowAccountGroup, accountId: Id<'financialAccounts'>) {
      const facilities = await ctx.db
        .query('creditFacilities')
        .withIndex('by_linkedAccountId', (q) => q.eq('linkedAccountId', accountId))
        .take(100);

      for (const facility of facilities) {
        if (facility.userId !== args.userId || facility.status !== 'active') {
          continue;
        }

        // CARD-linked facilities settle from their settlement account group.
        if (cardLinkedFacilityIds.has(facility._id)) {
          continue;
        }

        await addStatementItemsForFacility(group, facility);
      }

      for (const facility of cardStatementFacilitiesBySettlementAccountId.get(accountId) ?? []) {
        await addStatementItemsForFacility(group, facility);
      }
    }

    for (const group of accountGroups) {
      if (!group.account) {
        continue;
      }

      await addPlannedExpensesForGroup(group, group.account._id);
      await addSubscriptionsForGroup(group, group.account._id);
      await addScheduledTransactionsForGroup(group, group.account._id);
      await addCreditInstallmentsForGroup(group, group.account._id);
      await addCreditStatementsForGroup(group, group.account._id);
    }

    for (const plannedTransfer of plannedTransfers) {
      if (!plannedTransfer.toAccountId) {
        throw new ConvexError('Planned transfer destination is missing');
      }
      const fromGroup = plannedTransfer.fromAccountId ? accountGroupById.get(plannedTransfer.fromAccountId) : undefined;
      const toGroup = accountGroupById.get(plannedTransfer.toAccountId);
      const subtitle =
        plannedTransfer.description ??
        (plannedTransfer.fromCreditFacilityId
          ? cardSourceFacilityNameById.get(plannedTransfer.fromCreditFacilityId)
          : undefined);

      if (fromGroup) {
        addUpcomingItem(fromGroup, upcomingTotals, {
          key: `plannedTransfer:${plannedTransfer._id}:from`,
          source: 'plannedTransfer',
          title: plannedTransfer.name,
          subtitle,
          dueDate: plannedTransfer.dueDate,
          amount: plannedTransfer.amount,
          direction: 'outflow',
          account: fromGroup.account,
          plannedTransferId: plannedTransfer._id,
          plannedTransferEndpoint: 'from',
        });
      }

      if (toGroup) {
        addUpcomingItem(toGroup, upcomingTotals, {
          key: `plannedTransfer:${plannedTransfer._id}:to`,
          source: 'plannedTransfer',
          title: plannedTransfer.name,
          subtitle,
          dueDate: plannedTransfer.dueDate,
          amount: plannedTransfer.amount,
          direction: 'inflow',
          account: toGroup.account,
          plannedTransferId: plannedTransfer._id,
          plannedTransferEndpoint: 'to',
        });
      }
    }

    for (const status of activePlannedExpenseStatuses) {
      for (const kind of ['expense', 'income'] as const) {
        const unassignedPlannedExpenses = await ctx.db
          .query('plannedTransactions')
          .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) =>
            q.eq('userId', args.userId).eq('kind', kind).eq('status', status),
          )
          .take(100);

        for (const expense of unassignedPlannedExpenses) {
          if (expense.accountId) {
            continue;
          }

          for (const occurrence of plannedExpenseOccurrences(expense, { asOfDate, horizonDate }, undefined)) {
            addUpcomingItem(unknownAccountGroup, upcomingTotals, withOccurrencePayment(occurrence));
          }
        }
      }
    }

    const unassignedSubscriptions = await ctx.db
      .query('subscriptions')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(100);

    for (const subscription of unassignedSubscriptions) {
      if (subscription.accountId) {
        continue;
      }

      for (const occurrence of subscriptionOccurrences(
        {
          subscriptionId: subscription._id,
          name: subscription.name,
          merchantName: subscription.merchantName,
          amount: subscription.amount,
          interval: subscription.interval,
          intervalCount: subscription.intervalCount,
          startDate: subscription.startDate,
          nextDueDate: subscription.nextDueDate,
          asOfDate,
          horizonDate,
        },
        undefined,
      )) {
        addUpcomingItem(unknownAccountGroup, upcomingTotals, occurrence);
      }
    }

    const unlinkedCreditPlans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(100);

    const unlinkedCreditPaymentGroups = new Map<string, FutureCashflowItem>();
    for (const plan of unlinkedCreditPlans) {
      const facility = await ctx.db.get('creditFacilities', plan.creditFacilityId);
      if (!facility || facility.userId !== args.userId || !belongsToUnknownAccountGroup(facility)) {
        continue;
      }

      for (const payment of buildInstallmentPaymentSchedule({
        monthlyPaymentAmount: plan.monthlyPaymentAmount,
        outstandingAmount: plan.outstandingAmount,
        startDate: plan.startDate,
        nextPaymentDate: plan.nextPaymentDate,
        remainingInstallments: plan.remainingInstallments,
        asOfDate,
        monthsAhead,
      })) {
        if (payment.dueDate < asOfDate || payment.dueDate > horizonDate) {
          continue;
        }

        const itemKey = `creditInstallment:${facility._id}:${payment.dueDate}`;
        const detail = {
          installmentPlanId: plan._id,
          planName: plan.name,
          amount: payment.amount,
          remainingAfterPayment: payment.remainingAfterPayment,
        };
        const existingItem = unlinkedCreditPaymentGroups.get(itemKey);
        if (existingItem) {
          existingItem.amount.amountMinor += payment.amount.amountMinor;
          existingItem.creditPlanCount = (existingItem.creditPlanCount ?? 0) + 1;
          existingItem.creditInstallmentDetails?.push(detail);
          continue;
        }

        unlinkedCreditPaymentGroups.set(itemKey, {
          key: itemKey,
          source: 'creditInstallment',
          title: facility.name,
          dueDate: payment.dueDate,
          amount: { ...payment.amount },
          direction: 'outflow',
          creditFacilityId: facility._id,
          creditPlanCount: 1,
          creditInstallmentDetails: [detail],
        });
      }
    }

    for (const item of unlinkedCreditPaymentGroups.values()) {
      addUpcomingItem(unknownAccountGroup, upcomingTotals, item);
    }

    const unlinkedCreditStatementCycles = await ctx.db
      .query('creditFacilityUsageCycles')
      .withIndex('by_userId_and_status_and_dueDate', (q) =>
        q.eq('userId', args.userId).eq('status', 'scheduled').gte('dueDate', asOfDate).lte('dueDate', horizonDate),
      )
      .take(100);

    for (const cycle of unlinkedCreditStatementCycles) {
      const facility = await ctx.db.get('creditFacilities', cycle.creditFacilityId);
      if (!facility || facility.userId !== args.userId || cycle.trackedAmount.amountMinor <= 0n) {
        continue;
      }

      // Unknown group hosts facilities with no account attachment: unlinked
      // ones, plus CARD-linked ones without a settlement account configured.
      if (!belongsToUnknownAccountGroup(facility)) {
        continue;
      }

      addUpcomingItem(unknownAccountGroup, upcomingTotals, {
        key: `creditStatement:${cycle._id}:${cycle.dueDate}`,
        source: 'creditStatement',
        title: facility.name,
        subtitle: cycle.cycleMonth,
        dueDate: cycle.dueDate,
        amount: cycle.trackedAmount,
        direction: 'outflow',
        creditFacilityId: facility._id,
        creditUsageCycleId: cycle._id,
        creditCycleMonth: cycle.cycleMonth,
      });
    }

    const unlinkedStatementFacilities = await ctx.db
      .query('creditFacilities')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(100);
    for (const facility of unlinkedStatementFacilities) {
      if (facility.facilityType !== 'cardCreditLine') {
        continue;
      }

      if (!belongsToUnknownAccountGroup(facility)) {
        continue;
      }
      const cycles = await ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_creditFacilityId_and_status', (q) =>
          q.eq('creditFacilityId', facility._id).eq('status', 'scheduled'),
        )
        .take(100);
      const projectionItems = await buildCreditStatementProjectionItems(ctx, {
        facility,
        scheduledCycles: cycles,
        pendingCardTransfers: pendingCardTransfersByFacility.get(facility._id) ?? [],
        asOfDate,
        horizonDate,
        fallbackMonth: projectedCycleMonth,
      });
      for (const item of projectionItems) {
        addUpcomingItem(unknownAccountGroup, upcomingTotals, item);
      }
    }

    const moneyBoxes = await ctx.db
      .query('moneyBoxes')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', args.userId).eq('status', 'active'))
      .take(100);

    const contributionCycleStartDate = args.contributionCycleStartDate ?? asOfDate;
    const contributionCycleEndDate = args.contributionCycleEndDate ?? horizonDate;
    const hasExplicitContributionCycle =
      args.contributionCycleStartDate !== undefined && args.contributionCycleEndDate !== undefined;
    const fundingItems = (
      await Promise.all(
        moneyBoxes.map(async (moneyBox) => {
          const funding = buildMoneyBoxFundingPlan({
            targetAmount: moneyBox.targetAmount,
            savedAmount: moneyBox.savedAmount,
            targetDate: moneyBox.targetDate,
            createdAtMs: moneyBox.createdAtMs,
            asOfDate,
            growthRatePct: moneyBox.growthRatePct,
          });
          const cycleContributions =
            contributionCycleEndDate < contributionCycleStartDate
              ? []
              : await ctx.db
                  .query('moneyBoxContributions')
                  .withIndex('by_moneyBoxId_and_contributionDate', (q) =>
                    q
                      .eq('moneyBoxId', moneyBox._id)
                      .gte('contributionDate', contributionCycleStartDate)
                      .lte('contributionDate', contributionCycleEndDate),
                  )
                  .take(100);
          const cycleContributedAmount = cycleContributions.reduce(
            (amountMinor, contribution) =>
              contribution.amount.currency === moneyBox.targetAmount.currency &&
              (!args.contributionAsOfDate || contribution.contributionDate <= args.contributionAsOfDate)
                ? amountMinor + moneyBoxContributionDelta(contribution)
                : amountMinor,
            0n,
          );
          const futureContributions =
            hasExplicitContributionCycle && args.contributionAsOfDate
              ? await ctx.db
                  .query('moneyBoxContributions')
                  .withIndex('by_moneyBoxId_and_contributionDate', (q) =>
                    q.eq('moneyBoxId', moneyBox._id).gt('contributionDate', args.contributionAsOfDate!),
                  )
                  .take(100)
              : [];
          const futureContributedAmount = futureContributions.reduce(
            (amountMinor, contribution) =>
              contribution.amount.currency === moneyBox.targetAmount.currency
                ? amountMinor + moneyBoxContributionDelta(contribution)
                : amountMinor,
            0n,
          );
          const savedAsOfDelta = moneyBox.savedAmount.amountMinor - futureContributedAmount;
          const savedAsOfMinor = savedAsOfDelta > 0n ? savedAsOfDelta : 0n;
          const savedBeforeCycleDelta = savedAsOfMinor - cycleContributedAmount;
          const savedBeforeCycleMinor = hasExplicitContributionCycle
            ? savedBeforeCycleDelta > 0n
              ? savedBeforeCycleDelta
              : 0n
            : savedAsOfMinor;
          const cycleFunding = hasExplicitContributionCycle
            ? buildMoneyBoxFundingPlan({
                targetAmount: moneyBox.targetAmount,
                savedAmount: {
                  amountMinor: savedBeforeCycleMinor,
                  currency: moneyBox.savedAmount.currency,
                },
                targetDate: moneyBox.targetDate,
                createdAtMs: moneyBox.createdAtMs,
                asOfDate,
                growthRatePct: moneyBox.growthRatePct,
              })
            : funding;
          const linkedExpense = moneyBox.plannedTransactionId
            ? await ctx.db.get('plannedTransactions', moneyBox.plannedTransactionId)
            : null;
          const linkedExpenseAccountId =
            linkedExpense?.userId === args.userId &&
            (linkedExpense.kind === 'expense' || linkedExpense.kind === 'income')
              ? (linkedExpense.accountId ?? undefined)
              : undefined;
          const fundingAccountId = moneyBox.accountId ?? linkedExpenseAccountId;
          addMoney(monthlyFundingTotals, cycleFunding.monthlyRequiredAmount);

          return {
            moneyBoxId: moneyBox._id,
            accountId: fundingAccountId,
            name: moneyBox.name,
            targetDate: moneyBox.targetDate,
            targetAmount: moneyBox.targetAmount,
            savedAmount: moneyBox.savedAmount,
            monthlyRequiredAmount: cycleFunding.monthlyRequiredAmount,
            cycleContributedAmount: {
              amountMinor: cycleContributedAmount,
              currency: moneyBox.targetAmount.currency,
            },
            remainingAmount: funding.remainingAmount,
            progressPercent: funding.progressPercent,
            fundingStatus: funding.fundingStatus,
            status: funding.status,
            deltaMinor: funding.deltaMinor,
            projectedCompletionDate: funding.projectedCompletionDate,
          };
        }),
      )
    )
      .sort((left, right) => {
        if (left.fundingStatus === 'behind' && right.fundingStatus !== 'behind') {
          return -1;
        }
        if (right.fundingStatus === 'behind' && left.fundingStatus !== 'behind') {
          return 1;
        }
        return left.targetDate.localeCompare(right.targetDate) || left.name.localeCompare(right.name);
      })
      .slice(0, limit);

    const fundingAccountIds = new Set(fundingItems.flatMap((item) => (item.accountId ? [item.accountId] : [])));
    const upcomingItemsByAccount = [...accountGroups, unknownAccountGroup]
      .filter((group) => group.items.length > 0 || fundingAccountIds.has(group.accountId as Id<'financialAccounts'>))
      .map((group) => {
        sortCashflowItems(group.items);
        return {
          ...group,
          totals: totalsToMoney(group.totals),
        };
      });
    const upcomingItems = upcomingItemsByAccount.flatMap((group) => group.items);
    sortCashflowItems(upcomingItems);

    return {
      asOfDate,
      horizonDate,
      upcomingTotals: totalsToMoney(upcomingTotals),
      monthlyFundingTotals: totalsToMoney(monthlyFundingTotals),
      upcomingItems: upcomingItems.slice(0, limit),
      upcomingItemsByAccount,
      fundingItems,
    };
  },
});

export const getFutureCashflowSummary = query({
  args: {
    monthsAhead: v.optional(v.number()),
    limit: v.optional(v.number()),
    asOfDate: v.optional(v.string()),
    horizonDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<FutureCashflowSummary> => {
    const user = await requireAuthUser(ctx);
    const summary: FutureCashflowSummary = await ctx.runQuery(internal.banking.planning.getFutureCashflowForUser, {
      userId: user.id,
      monthsAhead: args.monthsAhead,
      limit: args.limit,
      asOfDate: args.asOfDate,
      horizonDate: args.horizonDate,
    });
    return summary;
  },
});

async function getPlanningPreferenceForUser(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query('planningPreferences')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
}

export const getPlanningCashflowViewForUser = internalQuery({
  args: {
    userId: v.string(),
    cycleOffset: v.optional(v.number()),
    limit: v.optional(v.number()),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PlanningCashflowView> => {
    const limit = Math.min(args.limit ?? 100, 200);
    const currentAsOfDate = (args.asOfDate ?? todayIsoDate()).slice(0, 10);
    const storedPreference = await getPlanningPreferenceForUser(ctx, args.userId);
    const preference = normalizePlanningPreferenceForCycle(
      storedPreference ?? defaultPlanningPreference(currentAsOfDate),
    );
    const cycleWindow = buildPlanningCycleWindow({
      preference,
      asOfDate: currentAsOfDate,
      cycleOffset: args.cycleOffset,
    });
    const summaryAsOfDate =
      cycleWindow.cycleOffset > 0
        ? buildPlanningCycleWindow({
            preference,
            asOfDate: currentAsOfDate,
            cycleOffset: 0,
          }).asOfDate
        : cycleWindow.asOfDate;
    const summary: FutureCashflowSummary = await ctx.runQuery(internal.banking.planning.getFutureCashflowForUser, {
      userId: args.userId,
      limit,
      asOfDate: summaryAsOfDate,
      horizonDate: cycleWindow.cycleEndDate,
      contributionCycleStartDate: cycleWindow.cycleStartDate,
      contributionCycleEndDate: cycleWindow.cycleEndDate,
      contributionAsOfDate: cycleWindow.cycleOffset < 0 ? cycleWindow.cycleEndDate : currentAsOfDate,
    });

    const accountGroups: Array<PlanningCashflowAccountGroup> = [];
    const overdraftLimits = await overdraftLimitByAccount(ctx, args.userId);
    const upcomingTotals: Array<MoneyAmount> = [];
    let firstNegativeDate: string | undefined;

    for (const group of summary.upcomingItemsByAccount) {
      if (cycleWindow.cycleOffset < 0) {
        accountGroups.push({
          accountId: group.accountId,
          account: group.account,
          projectionStatus: 'pastCycle',
          items: group.items.slice(0, limit).map((item) => ({
            ...item,
            projectionStatus: 'pastCycle',
          })),
          totals: group.totals,
        });
        continue;
      }

      const latestBalance = group.account
        ? ((await latestBookedBalance(ctx, group.account._id)) ?? undefined)
        : undefined;
      const overdraftLimitAmount = group.account ? overdraftLimits.get(group.account._id) : undefined;
      let projectedBalance = latestBalance?.amount;
      let projectedAvailable = projectedBalance
        ? availableForProjectedBalance(projectedBalance, overdraftLimitAmount)
        : undefined;
      let startingBalance = latestBalance?.amount;
      let startingAvailable = projectedAvailable ?? undefined;
      let projectionStatus: PlanningCashflowAccountGroup['projectionStatus'] = latestBalance
        ? 'projected'
        : 'missingBalance';
      let accountFirstNegativeDate: string | undefined;
      const windowTotals: Array<MoneyAmount> = [];
      const windowItems =
        cycleWindow.cycleOffset > 0
          ? group.items.filter((item) => item.dueDate >= cycleWindow.cycleStartDate)
          : group.items;

      if (cycleWindow.cycleOffset > 0) {
        for (const item of group.items) {
          if (item.dueDate >= cycleWindow.cycleStartDate) {
            break;
          }

          if (!projectedBalance) {
            continue;
          }

          if (item.occurrencePayment) {
            continue;
          }

          const nextBalance = applyCashflowToBalance(projectedBalance, item);
          if (!nextBalance) {
            projectedBalance = undefined;
            projectedAvailable = undefined;
            startingBalance = undefined;
            startingAvailable = undefined;
            projectionStatus = 'currencyMismatch';
            break;
          }

          projectedBalance = nextBalance;
          projectedAvailable = availableForProjectedBalance(projectedBalance, overdraftLimitAmount);
        }
        startingBalance = projectionStatus === 'projected' ? projectedBalance : undefined;
        startingAvailable = projectionStatus === 'projected' ? projectedAvailable : undefined;
      }

      const hasFundingRows = summary.fundingItems.some((item) => item.accountId === group.accountId);
      if (cycleWindow.cycleOffset > 0 && windowItems.length === 0 && !hasFundingRows) {
        continue;
      }

      const rows: Array<PlanningCashflowRow> = windowItems.slice(0, limit).map((item) => {
        if (item.direction === 'outflow' && item.source !== 'plannedTransfer' && !item.occurrencePayment) {
          addMoney(windowTotals, item.amount);
          if (cycleWindow.cycleOffset > 0) {
            addMoney(upcomingTotals, item.amount);
          }
        }

        if (item.occurrencePayment) {
          return {
            ...item,
            projectionStatus,
          };
        }

        if (!projectedBalance) {
          return {
            ...item,
            projectionStatus,
          };
        }

        const nextBalance = applyCashflowToBalance(projectedBalance, item);
        if (!nextBalance) {
          projectionStatus = 'currencyMismatch';
          projectedBalance = undefined;
          projectedAvailable = undefined;
          return {
            ...item,
            projectionStatus: 'currencyMismatch',
          };
        }

        projectedBalance = nextBalance;
        projectedAvailable = availableForProjectedBalance(projectedBalance, overdraftLimitAmount);
        // The alarm is about the accounting position, not about the arranged overdraft: drawing on
        // a credit line is borrowing, not spending money the account holds. Reading availability
        // here left an account projected to close at -1.604,69 reporting no negative date at all,
        // and disagreed with the aggregate series, which has always tracked the balance.
        // A CARD account's balance is a liability that lives below zero: never
        // raise the negative-cashflow alarm for it.
        if (projectedBalance.amountMinor < 0n && !accountFirstNegativeDate && group.account?.accountType !== 'CARD') {
          accountFirstNegativeDate = item.dueDate;
          if (!firstNegativeDate || item.dueDate < firstNegativeDate) {
            firstNegativeDate = item.dueDate;
          }
        }

        return {
          ...item,
          projectedBalanceAfter: projectedBalance,
          projectedAvailableAfter: projectedAvailable,
          projectionStatus: 'projected',
        };
      });

      accountGroups.push({
        accountId: group.accountId,
        account: group.account,
        latestBalance,
        startingBalance,
        startingAvailable,
        overdraftLimitAmount,
        projectedEndBalance: projectionStatus === 'projected' ? projectedBalance : undefined,
        projectedEndAvailable: projectionStatus === 'projected' ? projectedAvailable : undefined,
        firstNegativeDate: accountFirstNegativeDate,
        projectionStatus,
        items: rows,
        totals: cycleWindow.cycleOffset > 0 ? totalsToMoney(windowTotals) : group.totals,
      });
    }

    // CARD balances are liabilities and asset balances are not liquidity: keep
    // their individual rows available for inspection, but exclude both from
    // the aggregate liquidity projection.
    const aggregateAccountGroups = accountGroups.filter((group) => isSpendableAccountType(group.account?.accountType));
    const aggregateCurrencyCounts = new Map<string, number>();
    for (const group of aggregateAccountGroups) {
      if (group.startingBalance) {
        aggregateCurrencyCounts.set(
          group.startingBalance.currency,
          (aggregateCurrencyCounts.get(group.startingBalance.currency) ?? 0) + 1,
        );
      }
    }
    const aggregateCurrency = [...aggregateCurrencyCounts.entries()].toSorted(
      ([leftCurrency, leftCount], [rightCurrency, rightCount]) =>
        rightCount - leftCount || leftCurrency.localeCompare(rightCurrency),
    )[0]?.[0];
    let aggregateBalance: MoneyAmount | undefined;
    let aggregateFirstNegativeDate: string | undefined;
    const aggregateSeries: PlanningCashflowView['aggregateSeries'] = [];

    if (aggregateCurrency) {
      for (const group of aggregateAccountGroups) {
        if (group.startingBalance?.currency !== aggregateCurrency) {
          continue;
        }

        aggregateBalance = aggregateBalance
          ? {
              amountMinor: aggregateBalance.amountMinor + group.startingBalance.amountMinor,
              currency: aggregateCurrency,
            }
          : { ...group.startingBalance };
      }

      const aggregateItems = aggregateAccountGroups
        .flatMap((group) => group.items)
        .filter(
          (item) =>
            item.projectionStatus === 'projected' &&
            !item.occurrencePayment &&
            item.amount.currency === aggregateCurrency,
        )
        .toSorted((left, right) => left.dueDate.localeCompare(right.dueDate) || left.key.localeCompare(right.key));

      for (const item of aggregateItems) {
        if (!aggregateBalance) {
          break;
        }
        const nextBalance = applyCashflowToBalance(aggregateBalance, item);
        if (!nextBalance) {
          break;
        }
        aggregateBalance = nextBalance;
        if (aggregateBalance.amountMinor < 0n && !aggregateFirstNegativeDate) {
          aggregateFirstNegativeDate = item.dueDate;
        }
        aggregateSeries.push({ date: item.dueDate, projectedBalanceAfter: aggregateBalance });
      }
    }

    return {
      ...cycleWindow,
      preference: {
        cycleInterval: preference.cycleInterval,
        cycleIntervalCount: preference.cycleIntervalCount,
        anchorDate: preference.anchorDate,
      },
      upcomingTotals: cycleWindow.cycleOffset > 0 ? totalsToMoney(upcomingTotals) : summary.upcomingTotals,
      monthlyFundingTotals: summary.monthlyFundingTotals,
      firstNegativeDate,
      aggregateSeries,
      aggregateEndBalance: aggregateBalance,
      aggregateFirstNegativeDate,
      accountGroups,
      fundingItems: summary.fundingItems,
    };
  },
});

export const getPlanningPreference = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const preference = await getPlanningPreferenceForUser(ctx, user.id);
    if (!preference) {
      return defaultPlanningPreference(todayIsoDate());
    }

    return {
      ...preference,
      cycleIntervalCount: normalizePlanningPreferenceForCycle(preference).cycleIntervalCount,
    };
  },
});

export const upsertPlanningPreference = mutation({
  args: {
    cycleInterval: planningCycleIntervalValidator,
    cycleIntervalCount: v.number(),
    anchorDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    assertIsoDate(args.anchorDate, 'Anchor date');
    const cycleIntervalCount =
      args.cycleInterval === 'month' ? 1 : normalizePlanningCycleIntervalCount(args.cycleIntervalCount);
    const now = Date.now();
    const existingPreference = await ctx.db
      .query('planningPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .unique();

    if (existingPreference) {
      await ctx.db.patch('planningPreferences', existingPreference._id, {
        cycleInterval: args.cycleInterval,
        cycleIntervalCount,
        anchorDate: args.anchorDate,
        updatedAtMs: now,
      });
      return existingPreference._id;
    }

    return await ctx.db.insert('planningPreferences', {
      userId: user.id,
      cycleInterval: args.cycleInterval,
      cycleIntervalCount,
      anchorDate: args.anchorDate,
      createdAtMs: now,
      updatedAtMs: now,
    });
  },
});

export const getPlanningCashflowView = query({
  args: {
    cycleOffset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PlanningCashflowView> => {
    const user = await requireAuthUser(ctx);
    const view: PlanningCashflowView = await ctx.runQuery(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId: user.id,
      cycleOffset: args.cycleOffset,
      limit: args.limit,
    });
    return view;
  },
});

export const listMoneyBoxFundingPlans = query({
  args: {
    status: v.optional(v.union(v.literal('active'), v.literal('completed'), v.literal('archived'))),
    limit: v.optional(v.number()),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);
    const moneyBoxes = args.status
      ? await ctx.db
          .query('moneyBoxes')
          .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', args.status!))
          .take(limit)
      : await ctx.db
          .query('moneyBoxes')
          .withIndex('by_userId_and_targetDate', (q) => q.eq('userId', user.id))
          .take(limit);

    const plans = [];
    for (const moneyBox of moneyBoxes) {
      const plannedExpense = moneyBox.plannedTransactionId
        ? await ctx.db.get('plannedTransactions', moneyBox.plannedTransactionId)
        : null;

      plans.push({
        moneyBox: moneyBoxResult(moneyBox),
        plannedExpense:
          plannedExpense &&
          plannedExpense.userId === user.id &&
          (plannedExpense.kind === 'expense' || plannedExpense.kind === 'income')
            ? {
                _id: plannedExpense._id,
                name: plannedExpense.name,
                dueDate: plannedExpense.dueDate,
                status: plannedExpense.status,
              }
            : null,
        funding: buildMoneyBoxFundingPlan({
          targetAmount: moneyBox.targetAmount,
          savedAmount: moneyBox.savedAmount,
          targetDate: moneyBox.targetDate,
          createdAtMs: moneyBox.createdAtMs,
          asOfDate: args.asOfDate,
          growthRatePct: moneyBox.growthRatePct,
        }),
      });
    }

    return plans;
  },
});

export type CreateMoneyBoxForUserArgs = {
  userId: string;
  name: string;
  targetAmount: MoneyAmount;
  savedAmount?: MoneyAmount;
  targetDate: string;
  plannedExpenseId?: Id<'plannedTransactions'>;
  accountId?: Id<'financialAccounts'>;
  heldOutsideBalance?: boolean;
};

export async function createMoneyBoxForUserCore(ctx: MutationCtx, args: CreateMoneyBoxForUserArgs) {
  const now = Date.now();

  if (args.targetAmount.amountMinor <= 0n) {
    throw new ConvexError('Money box target amount must be greater than zero');
  }
  if (args.targetAmount.currency !== args.targetAmount.currency.toUpperCase()) {
    throw new ConvexError('Money box currency must be uppercase');
  }
  if (args.savedAmount) {
    if (args.savedAmount.amountMinor < 0n) {
      throw new ConvexError('Money box saved amount cannot be negative');
    }
    if (args.savedAmount.currency !== args.targetAmount.currency) {
      throw new ConvexError('Saved amount currency must match the money box currency');
    }
  }

  if (args.plannedExpenseId) {
    const plannedExpense = await ctx.db.get('plannedTransactions', args.plannedExpenseId);
    if (
      !plannedExpense ||
      plannedExpense.userId !== args.userId ||
      (plannedExpense.kind !== 'expense' && plannedExpense.kind !== 'income')
    ) {
      throw new ConvexError('Planned expense not found');
    }
  }

  if (args.accountId) {
    const account = await ctx.db.get('financialAccounts', args.accountId);
    if (!account || account.userId !== args.userId) {
      throw new ConvexError('Account not found');
    }
    if (account.currency !== args.targetAmount.currency) {
      throw new ConvexError('Account currency must match the money box currency');
    }
  }

  const moneyBoxId = await ctx.db.insert('moneyBoxes', {
    userId: args.userId,
    accountId: args.accountId,
    name: args.name,
    targetAmount: args.targetAmount,
    savedAmount: args.savedAmount ?? { amountMinor: 0n, currency: args.targetAmount.currency },
    targetDate: args.targetDate,
    status: 'active',
    source: args.plannedExpenseId ? 'plannedExpense' : 'manual',
    plannedTransactionId: args.plannedExpenseId ? args.plannedExpenseId : undefined,
    heldOutsideBalance: args.heldOutsideBalance,
    createdAtMs: now,
    updatedAtMs: now,
  });
  await invalidateAllPlanSnapshots(ctx, args.userId);
  return moneyBoxId;
}

export const createMoneyBox = mutation({
  args: {
    name: v.string(),
    targetAmount: moneyAmountValidator,
    savedAmount: v.optional(moneyAmountValidator),
    targetDate: v.string(),
    plannedExpenseId: v.optional(plannedExpenseIdValidator),
    accountId: v.optional(v.id('financialAccounts')),
    heldOutsideBalance: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await createMoneyBoxForUserCore(ctx, {
      userId: user.id,
      ...args,
    });
  },
});

export const updateMoneyBox = mutation({
  args: {
    moneyBoxId: v.id('moneyBoxes'),
    name: v.string(),
    targetAmount: moneyAmountValidator,
    targetDate: v.string(),
    accountId: v.optional(v.id('financialAccounts')),
    heldOutsideBalance: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const moneyBox = await ctx.db.get('moneyBoxes', args.moneyBoxId);
    if (!moneyBox || moneyBox.userId !== user.id) {
      throw new ConvexError('Money box not found');
    }
    if (moneyBox.status !== 'active') {
      throw new ConvexError('Only active money boxes can be edited');
    }

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError('Money box name is required');
    }
    if (args.targetAmount.amountMinor <= 0n) {
      throw new ConvexError('Target amount must be positive');
    }
    assertIsoDate(args.targetDate, 'Target date');
    if (args.targetAmount.currency !== moneyBox.savedAmount.currency) {
      throw new ConvexError('Money box currency cannot be changed');
    }
    if (args.accountId) {
      const account = await ctx.db.get('financialAccounts', args.accountId);
      if (!account || account.userId !== user.id) {
        throw new ConvexError('Account not found');
      }
      if (account.currency !== args.targetAmount.currency) {
        throw new ConvexError('Account currency must match the money box currency');
      }
    }

    await ctx.db.patch('moneyBoxes', moneyBox._id, {
      name,
      targetAmount: args.targetAmount,
      targetDate: args.targetDate,
      accountId: args.accountId,
      heldOutsideBalance: args.heldOutsideBalance,
      updatedAtMs: Date.now(),
    });
    await invalidateAllPlanSnapshots(ctx, user.id);
    return moneyBox._id;
  },
});

export const setMoneyBoxStatus = mutation({
  args: {
    moneyBoxId: v.id('moneyBoxes'),
    status: v.union(v.literal('archived'), v.literal('active')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const moneyBox = await ctx.db.get('moneyBoxes', args.moneyBoxId);
    if (!moneyBox || moneyBox.userId !== user.id) {
      throw new ConvexError('Money box not found');
    }
    await ctx.db.patch('moneyBoxes', moneyBox._id, { status: args.status, updatedAtMs: Date.now() });
    await invalidateAllPlanSnapshots(ctx, user.id);
    return moneyBox._id;
  },
});

export const setMoneyBoxSettings = mutation({
  args: {
    moneyBoxId: v.id('moneyBoxes'),
    growthRatePct: v.optional(v.number()),
    spendingReducesProgress: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const moneyBox = await ctx.db.get('moneyBoxes', args.moneyBoxId);
    if (!moneyBox || moneyBox.userId !== user.id) {
      throw new ConvexError('Money box not found');
    }
    if (
      args.growthRatePct !== undefined &&
      (!Number.isFinite(args.growthRatePct) || args.growthRatePct < 0 || args.growthRatePct > 20)
    ) {
      throw new ConvexError('Growth rate must be between 0 and 20 percent');
    }

    const updates: {
      growthRatePct?: number;
      spendingReducesProgress?: boolean;
      updatedAtMs: number;
    } = { updatedAtMs: Date.now() };
    if (args.growthRatePct !== undefined) {
      updates.growthRatePct = args.growthRatePct;
    }
    if (args.spendingReducesProgress !== undefined) {
      updates.spendingReducesProgress = args.spendingReducesProgress;
    }
    await ctx.db.patch('moneyBoxes', moneyBox._id, updates);
    return moneyBox._id;
  },
});

export const registerMoneyBoxWithdrawal = mutation({
  args: {
    moneyBoxId: v.id('moneyBoxes'),
    amount: moneyAmountValidator,
    withdrawalDate: v.string(),
    transactionId: v.optional(v.id('transactions')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const moneyBox = await ctx.db.get('moneyBoxes', args.moneyBoxId);
    if (!moneyBox || moneyBox.userId !== user.id) {
      throw new ConvexError('Money box not found');
    }
    if (moneyBox.status === 'archived') {
      throw new ConvexError('Archived money boxes cannot be withdrawn from');
    }
    if (args.amount.amountMinor <= 0n) {
      throw new ConvexError('Withdrawal amount must be positive');
    }
    if (
      args.amount.currency !== moneyBox.targetAmount.currency ||
      args.amount.currency !== moneyBox.savedAmount.currency
    ) {
      throw new ConvexError('Withdrawal currency must match the money box currency');
    }
    if (args.amount.amountMinor > moneyBox.savedAmount.amountMinor) {
      throw new ConvexError('Money box does not have enough saved funds');
    }
    assertIsoDate(args.withdrawalDate, 'Withdrawal date');

    if (args.transactionId) {
      const transaction = await ctx.db.get('transactions', args.transactionId);
      if (!transaction || transaction.userId !== user.id) {
        throw new ConvexError('Transaction not found');
      }
      if (transaction.direction !== 'DBIT') {
        throw new ConvexError('Only debit transactions can be linked to money box withdrawals');
      }
      const linkedContributions = await ctx.db
        .query('moneyBoxContributions')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
        .take(1);
      if (linkedContributions.length > 0) {
        throw new ConvexError('Transaction is already linked to a money box');
      }
    }

    const now = Date.now();
    const nextSavedMinor = moneyBox.savedAmount.amountMinor - args.amount.amountMinor;
    const withdrawalId = await ctx.db.insert('moneyBoxContributions', {
      userId: user.id,
      moneyBoxId: moneyBox._id,
      kind: 'withdrawal',
      amount: args.amount,
      contributionDate: args.withdrawalDate,
      source: args.transactionId ? 'transaction' : 'manual',
      transactionId: args.transactionId,
      createdAtMs: now,
    });
    await ctx.db.patch('moneyBoxes', moneyBox._id, {
      savedAmount: {
        amountMinor: nextSavedMinor,
        currency: moneyBox.savedAmount.currency,
      },
      ...(moneyBox.status === 'completed' && nextSavedMinor < moneyBox.targetAmount.amountMinor
        ? { status: 'active' as const }
        : {}),
      updatedAtMs: now,
    });
    await invalidatePlanSnapshots(ctx, user.id, [args.withdrawalDate]);
    return withdrawalId;
  },
});

export const addMoneyBoxContribution = mutation({
  args: {
    moneyBoxId: v.id('moneyBoxes'),
    amount: moneyAmountValidator,
    contributionDate: v.string(),
    transactionId: v.optional(v.id('transactions')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const moneyBox = await ctx.db.get('moneyBoxes', args.moneyBoxId);

    if (!moneyBox || moneyBox.userId !== user.id) {
      throw new ConvexError('Money box not found');
    }

    if (args.amount.amountMinor <= 0n) {
      throw new ConvexError('Contribution amount must be positive');
    }
    if (
      moneyBox.targetAmount.currency !== args.amount.currency ||
      moneyBox.savedAmount.currency !== args.amount.currency
    ) {
      throw new ConvexError('Contribution currency must match the money box currency');
    }
    assertIsoDate(args.contributionDate, 'Contribution date');

    if (args.transactionId) {
      const transaction = await ctx.db.get('transactions', args.transactionId);
      if (!transaction || transaction.userId !== user.id) {
        throw new ConvexError('Transaction not found');
      }
      const existingContributions = await ctx.db
        .query('moneyBoxContributions')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', args.transactionId))
        .take(1);
      if (existingContributions.length > 0) {
        throw new ConvexError('Transaction is already linked to a money box');
      }
    }

    const now = Date.now();
    const contributionId = await ctx.db.insert('moneyBoxContributions', {
      userId: user.id,
      moneyBoxId: moneyBox._id,
      kind: 'contribution',
      amount: args.amount,
      contributionDate: args.contributionDate,
      source: args.transactionId ? 'transaction' : 'manual',
      transactionId: args.transactionId,
      createdAtMs: now,
    });

    await ctx.db.patch('moneyBoxes', moneyBox._id, {
      savedAmount: {
        amountMinor: moneyBox.savedAmount.amountMinor + args.amount.amountMinor,
        currency: moneyBox.savedAmount.currency,
      },
      updatedAtMs: now,
    });

    await invalidatePlanSnapshots(ctx, user.id, [args.contributionDate]);
    return contributionId;
  },
});

export const associateTransferWithMoneyBox = mutation({
  args: {
    transactionId: v.id('transactions'),
    moneyBoxId: v.id('moneyBoxes'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const [transaction, moneyBox] = await Promise.all([
      ctx.db.get('transactions', args.transactionId),
      ctx.db.get('moneyBoxes', args.moneyBoxId),
    ]);

    if (!transaction || transaction.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }
    if (!moneyBox || moneyBox.userId !== user.id || moneyBox.status === 'archived') {
      throw new ConvexError('Money box not found');
    }
    if (transaction.classificationKind !== 'transfer') {
      throw new ConvexError('Only unmatched transfer transactions can be associated with a money box');
    }
    if (transaction.transferMatchId) {
      throw new ConvexError('Matched transfers cannot be associated with a money box');
    }
    if (transaction.amount.currency !== moneyBox.savedAmount.currency) {
      throw new ConvexError('Transaction currency must match the money box currency');
    }

    const linkedContributions = await ctx.db
      .query('moneyBoxContributions')
      .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
      .take(2);
    if (linkedContributions.length > 1) {
      throw new ConvexError('Transaction has multiple money box contributions');
    }

    const now = Date.now();
    const absoluteAmountMinor =
      transaction.amount.amountMinor < 0n ? -transaction.amount.amountMinor : transaction.amount.amountMinor;
    const amount = {
      amountMinor: transaction.direction === 'DBIT' ? absoluteAmountMinor : -absoluteAmountMinor,
      currency: transaction.amount.currency,
    };
    const existingContribution = linkedContributions.at(0);

    if (existingContribution) {
      const previousMoneyBox = await ctx.db.get('moneyBoxes', existingContribution.moneyBoxId);
      if (!previousMoneyBox || previousMoneyBox.userId !== user.id) {
        throw new ConvexError('Linked money box not found');
      }

      if (previousMoneyBox._id === moneyBox._id) {
        const prospectiveSavedAmount =
          moneyBox.savedAmount.amountMinor - existingContribution.amount.amountMinor + amount.amountMinor;
        if (prospectiveSavedAmount < 0n) {
          throw new ConvexError('Money box does not have enough saved funds');
        }
        await ctx.db.patch('moneyBoxContributions', existingContribution._id, {
          amount,
          contributionDate: transaction.bookingDate,
          source: 'transaction',
        });
        await ctx.db.patch('moneyBoxes', moneyBox._id, {
          savedAmount: {
            amountMinor: prospectiveSavedAmount,
            currency: moneyBox.savedAmount.currency,
          },
          updatedAtMs: now,
        });
        await invalidatePlanSnapshots(ctx, user.id, [transaction.bookingDate]);
        return existingContribution._id;
      }

      const prospectiveSavedAmount = moneyBox.savedAmount.amountMinor + amount.amountMinor;
      if (prospectiveSavedAmount < 0n) {
        throw new ConvexError('Money box does not have enough saved funds');
      }
      await ctx.db.patch('moneyBoxes', previousMoneyBox._id, {
        savedAmount: {
          amountMinor: previousMoneyBox.savedAmount.amountMinor - existingContribution.amount.amountMinor,
          currency: previousMoneyBox.savedAmount.currency,
        },
        updatedAtMs: now,
      });
      await ctx.db.patch('moneyBoxContributions', existingContribution._id, {
        moneyBoxId: moneyBox._id,
        amount,
        contributionDate: transaction.bookingDate,
        source: 'transaction',
      });
      await ctx.db.patch('moneyBoxes', moneyBox._id, {
        savedAmount: {
          amountMinor: prospectiveSavedAmount,
          currency: moneyBox.savedAmount.currency,
        },
        updatedAtMs: now,
      });
      await invalidatePlanSnapshots(ctx, user.id, [transaction.bookingDate]);
      return existingContribution._id;
    }

    const prospectiveSavedAmount = moneyBox.savedAmount.amountMinor + amount.amountMinor;
    if (prospectiveSavedAmount < 0n) {
      throw new ConvexError('Money box does not have enough saved funds');
    }
    const contributionId = await ctx.db.insert('moneyBoxContributions', {
      userId: user.id,
      moneyBoxId: moneyBox._id,
      amount,
      contributionDate: transaction.bookingDate,
      source: 'transaction',
      transactionId: transaction._id,
      createdAtMs: now,
    });
    await ctx.db.patch('moneyBoxes', moneyBox._id, {
      savedAmount: {
        amountMinor: prospectiveSavedAmount,
        currency: moneyBox.savedAmount.currency,
      },
      updatedAtMs: now,
    });
    await invalidatePlanSnapshots(ctx, user.id, [transaction.bookingDate]);
    return contributionId;
  },
});

export async function unlinkMoneyBoxContributionCore(
  ctx: MutationCtx,
  args: {
    userId: string;
    transactionId: Id<'transactions'>;
    expectedMoneyBoxId?: Id<'moneyBoxes'>;
  },
) {
  const transaction = await ctx.db.get('transactions', args.transactionId);

  if (!transaction || transaction.userId !== args.userId) {
    throw new ConvexError('Transaction not found');
  }

  const linkedContributions = await ctx.db
    .query('moneyBoxContributions')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
    .take(2);
  if (linkedContributions.length > 1) {
    throw new ConvexError('Transaction has multiple money box contributions');
  }

  const contribution = linkedContributions.at(0);
  if (!contribution || contribution.userId !== args.userId) {
    throw new ConvexError('Transaction is not linked to a money box');
  }
  if (args.expectedMoneyBoxId && contribution.moneyBoxId !== args.expectedMoneyBoxId) {
    throw new ConvexError('Transaction is linked to a different money box');
  }

  const moneyBox = await ctx.db.get('moneyBoxes', contribution.moneyBoxId);
  if (!moneyBox || moneyBox.userId !== args.userId) {
    throw new ConvexError('Money box not found');
  }

  // Removing a withdrawal gives funds back, so the delta helper keeps both kinds symmetric
  // with the balance the contribution applied when it was created.
  const nextSavedMinor = moneyBox.savedAmount.amountMinor - moneyBoxContributionDelta(contribution);
  if (nextSavedMinor < 0n) {
    throw new ConvexError('Money box does not have enough saved funds');
  }

  await ctx.db.delete('moneyBoxContributions', contribution._id);
  await ctx.db.patch('moneyBoxes', moneyBox._id, {
    savedAmount: {
      amountMinor: nextSavedMinor,
      currency: moneyBox.savedAmount.currency,
    },
    ...(moneyBox.status === 'completed' && nextSavedMinor < moneyBox.targetAmount.amountMinor
      ? { status: 'active' as const }
      : {}),
    updatedAtMs: Date.now(),
  });

  await invalidatePlanSnapshots(ctx, args.userId, [transaction.bookingDate]);
  return contribution.moneyBoxId;
}

export const unlinkMoneyBoxContribution = mutation({
  args: {
    transactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await unlinkMoneyBoxContributionCore(ctx, { userId: user.id, ...args });
  },
});

const MONEY_BOX_CONVERSION_CONTRIBUTION_LIMIT = 25;
const MONEY_BOX_CONVERSION_REFERENCE_LIMIT = 50;
const MONEY_BOX_CONVERSION_WRITE_BATCH_SIZE = 25;

async function processMoneyBoxConversionBatches<T>(rows: ReadonlyArray<T>, process: (row: T) => Promise<unknown>) {
  for (let offset = 0; offset < rows.length; offset += MONEY_BOX_CONVERSION_WRITE_BATCH_SIZE) {
    await Promise.all(rows.slice(offset, offset + MONEY_BOX_CONVERSION_WRITE_BATCH_SIZE).map(process));
  }
}

export const convertMoneyBoxToAccount = mutation({
  args: {
    moneyBoxId: v.id('moneyBoxes'),
    accountType: v.union(v.literal('CACC'), v.literal('SVGS')),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const moneyBox = await ctx.db.get('moneyBoxes', args.moneyBoxId);
    if (!moneyBox || moneyBox.userId !== user.id) {
      throw new ConvexError('Money box not found');
    }
    if (moneyBox.heldOutsideBalance !== true) {
      throw new ConvexError(
        'Only money boxes held outside the reported account balance can be converted; converting this box would count the same money twice',
      );
    }

    const [contributions, planBuckets, plannedTransactions, subscriptions] = await Promise.all([
      ctx.db
        .query('moneyBoxContributions')
        .withIndex('by_moneyBoxId_and_contributionDate', (q) => q.eq('moneyBoxId', moneyBox._id))
        .take(MONEY_BOX_CONVERSION_CONTRIBUTION_LIMIT + 1),
      ctx.db
        .query('planBuckets')
        .withIndex('by_moneyBoxId', (q) => q.eq('moneyBoxId', moneyBox._id))
        .take(MONEY_BOX_CONVERSION_REFERENCE_LIMIT + 1),
      ctx.db
        .query('plannedTransactions')
        .withIndex('by_moneyBoxId', (q) => q.eq('moneyBoxId', moneyBox._id))
        .take(MONEY_BOX_CONVERSION_REFERENCE_LIMIT + 1),
      ctx.db
        .query('subscriptions')
        .withIndex('by_moneyBoxId', (q) => q.eq('moneyBoxId', moneyBox._id))
        .take(MONEY_BOX_CONVERSION_REFERENCE_LIMIT + 1),
    ]);

    if (contributions.length > MONEY_BOX_CONVERSION_CONTRIBUTION_LIMIT) {
      throw new ConvexError(
        `Money box conversion supports at most ${MONEY_BOX_CONVERSION_CONTRIBUTION_LIMIT} contributions at once`,
      );
    }
    if (
      planBuckets.length > MONEY_BOX_CONVERSION_REFERENCE_LIMIT ||
      plannedTransactions.length > MONEY_BOX_CONVERSION_REFERENCE_LIMIT ||
      subscriptions.length > MONEY_BOX_CONVERSION_REFERENCE_LIMIT
    ) {
      throw new ConvexError(
        `Money box conversion supports at most ${MONEY_BOX_CONVERSION_REFERENCE_LIMIT} references per table at once`,
      );
    }

    const referencedRows = [...planBuckets, ...plannedTransactions, ...subscriptions];
    if (contributions.some((contribution) => contribution.userId !== user.id)) {
      throw new ConvexError('Money box has a contribution owned by a different user');
    }
    if (referencedRows.some((row) => row.userId !== user.id)) {
      throw new ConvexError('Money box has a reference owned by a different user');
    }

    const linkedContributions = contributions.filter(
      (contribution): contribution is Doc<'moneyBoxContributions'> & { transactionId: Id<'transactions'> } =>
        contribution.transactionId !== undefined,
    );
    const linkedRows: Array<{
      contribution: Doc<'moneyBoxContributions'> & { transactionId: Id<'transactions'> };
      transaction: Doc<'transactions'>;
    }> = [];
    const seenTransactionIds = new Set<Id<'transactions'>>();
    let transactionBackedMinor = 0n;
    for (const contribution of linkedContributions) {
      if (seenTransactionIds.has(contribution.transactionId)) {
        throw new ConvexError('A transaction is linked to this money box more than once');
      }
      seenTransactionIds.add(contribution.transactionId);

      const transaction = await ctx.db.get('transactions', contribution.transactionId);
      if (!transaction || transaction.userId !== user.id) {
        throw new ConvexError('Money box contribution transaction not found');
      }
      if (transaction.transferMatchId) {
        throw new ConvexError('A money box contribution transaction is already matched as a transfer');
      }
      if (transaction.classificationKind === 'internal') {
        throw new ConvexError('An internal transaction cannot be converted into a money box transfer');
      }
      if (
        contribution.amount.currency !== moneyBox.savedAmount.currency ||
        transaction.amount.currency !== moneyBox.savedAmount.currency
      ) {
        throw new ConvexError('Money box contribution currency must match the money box currency');
      }

      const contributionDelta = moneyBoxContributionDelta(contribution);
      if (contributionDelta === 0n) {
        throw new ConvexError('Money box contribution amount must be greater than zero');
      }
      const expectedDirection = contributionDelta > 0n ? 'DBIT' : 'CRDT';
      if (transaction.direction !== expectedDirection) {
        throw new ConvexError(
          contributionDelta > 0n
            ? 'Money box contributions must be linked to debit transactions'
            : 'Money box withdrawals must be linked to credit transactions',
        );
      }

      transactionBackedMinor += contributionDelta;
      linkedRows.push({ contribution, transaction });
    }

    const openingBalanceMinor = moneyBox.savedAmount.amountMinor - transactionBackedMinor;
    const accountId = await createManualAccountCore(ctx, {
      userId: user.id,
      name: args.name ?? moneyBox.name,
      accountType: args.accountType,
      currency: moneyBox.savedAmount.currency,
    });

    for (const { contribution, transaction } of linkedRows) {
      await unlinkMoneyBoxContributionCore(ctx, {
        userId: user.id,
        transactionId: transaction._id,
        expectedMoneyBoxId: moneyBox._id,
      });
      await createCounterpartTransferCore(ctx, {
        userId: user.id,
        sourceTransactionId: transaction._id,
        accountId,
        amount: {
          amountMinor: absoluteMinorUnits(contribution.amount.amountMinor),
          currency: moneyBox.savedAmount.currency,
        },
        bookingDate: transaction.bookingDate,
        description:
          contribution.kind === 'withdrawal' ? `Withdrawal from ${moneyBox.name}` : `Contribution to ${moneyBox.name}`,
        counterpartyName: moneyBox.name,
      });
    }

    const account = await ctx.db.get('financialAccounts', accountId);
    if (!account) {
      throw new ConvexError('Converted account not found');
    }
    await applyManualBalanceDelta(ctx, account, openingBalanceMinor);

    const planIdsAddedTo: Array<Id<'plans'>> = [];
    if (moneyBox.accountId) {
      const plans = await ctx.db
        .query('plans')
        .withIndex('by_userId', (q) => q.eq('userId', user.id))
        .take(MONEY_BOX_CONVERSION_REFERENCE_LIMIT + 1);
      if (plans.length > MONEY_BOX_CONVERSION_REFERENCE_LIMIT) {
        throw new ConvexError(
          `Money box conversion supports at most ${MONEY_BOX_CONVERSION_REFERENCE_LIMIT} plans at once`,
        );
      }

      for (const plan of plans) {
        if (!plan.accountIds.includes(moneyBox.accountId) || plan.currency !== account.currency) continue;
        const added = await addEligiblePlanAccount(ctx, {
          userId: user.id,
          plan,
          accountId: account._id,
        });
        if (added) planIdsAddedTo.push(plan._id);
      }
    }

    const now = Date.now();
    const manualContributions = contributions.filter((contribution) => contribution.transactionId === undefined);
    await processMoneyBoxConversionBatches(manualContributions, async (contribution) => {
      await ctx.db.delete('moneyBoxContributions', contribution._id);
    });
    await processMoneyBoxConversionBatches(planBuckets, async (bucket) => {
      await ctx.db.patch('planBuckets', bucket._id, { moneyBoxId: undefined, updatedAtMs: now });
    });
    await processMoneyBoxConversionBatches(plannedTransactions, async (transaction) => {
      await ctx.db.patch('plannedTransactions', transaction._id, { moneyBoxId: undefined, updatedAtMs: now });
    });
    await processMoneyBoxConversionBatches(subscriptions, async (subscription) => {
      await ctx.db.patch('subscriptions', subscription._id, { moneyBoxId: undefined, updatedAtMs: now });
    });

    await ctx.db.delete('moneyBoxes', moneyBox._id);
    await invalidateAllPlanSnapshots(ctx, user.id);

    return {
      accountId,
      planIdsAddedTo,
      legsCreated: linkedRows.length,
      openingBalance: {
        amountMinor: openingBalanceMinor,
        currency: moneyBox.savedAmount.currency,
      },
      referencesCleared: {
        moneyBoxContributions: contributions.length,
        planBuckets: planBuckets.length,
        plannedTransactions: plannedTransactions.length,
        subscriptions: subscriptions.length,
      },
    };
  },
});

export const listMoneyBoxContributions = query({
  args: {
    moneyBoxId: v.id('moneyBoxes'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const moneyBox = await ctx.db.get('moneyBoxes', args.moneyBoxId);

    if (!moneyBox || moneyBox.userId !== user.id) {
      throw new ConvexError('Money box not found');
    }

    const contributions = await ctx.db
      .query('moneyBoxContributions')
      .withIndex('by_moneyBoxId_and_contributionDate', (q) => q.eq('moneyBoxId', args.moneyBoxId))
      .order('desc')
      .take(Math.min(args.limit ?? 50, 100));

    return await Promise.all(
      contributions.map(async (contribution) => {
        const transaction = contribution.transactionId
          ? await ctx.db.get('transactions', contribution.transactionId)
          : null;
        const validTransaction = transaction && transaction.userId === user.id ? transaction : null;
        const account = validTransaction ? await ctx.db.get('financialAccounts', validTransaction.accountId) : null;
        return {
          contribution,
          transaction: validTransaction,
          account: account && account.userId === user.id ? account : null,
        };
      }),
    );
  },
});

export const listPlannedExpenses = query({
  args: {
    status: v.optional(plannedExpenseStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);

    if (args.status) {
      const plannedExpenses = (
        await Promise.all(
          (['expense', 'income'] as const).map((kind) =>
            ctx.db
              .query('plannedTransactions')
              .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) =>
                q.eq('userId', user.id).eq('kind', kind).eq('status', args.status!),
              )
              .take(limit),
          ),
        )
      )
        .flat()
        .sort((left, right) => left._creationTime - right._creationTime)
        .slice(0, limit);
      return plannedExpenses.map(plannedExpenseResult);
    }

    const plannedExpenses: Array<Doc<'plannedTransactions'>> = [];
    for (const status of activePlannedExpenseStatuses) {
      for (const kind of ['expense', 'income'] as const) {
        plannedExpenses.push(
          ...(await ctx.db
            .query('plannedTransactions')
            .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) =>
              q.eq('userId', user.id).eq('kind', kind).eq('status', status),
            )
            .take(limit)),
        );
      }
    }

    return plannedExpenses
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.name.localeCompare(right.name))
      .slice(0, limit)
      .map(plannedExpenseResult);
  },
});

export const listPlannedTransfers = query({
  args: {
    status: v.optional(plannedTransferStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);

    if (args.status) {
      const status = args.status === 'completed' ? 'paid' : args.status;
      const transfers = await ctx.db
        .query('plannedTransactions')
        .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) =>
          q.eq('userId', user.id).eq('kind', 'transfer').eq('status', status),
        )
        .take(limit);
      return transfers.map(plannedTransferResult);
    }

    const transfers: Array<Doc<'plannedTransactions'>> = [];
    for (const status of plannedTransferActiveStatuses) {
      transfers.push(
        ...(await ctx.db
          .query('plannedTransactions')
          .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) =>
            q.eq('userId', user.id).eq('kind', 'transfer').eq('status', status),
          )
          .take(limit)),
      );
    }

    return transfers.slice(0, limit).map(plannedTransferResult);
  },
});

export const createPlannedTransfer = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    amount: moneyAmountValidator,
    scheduledDate: v.string(),
    fromAccountId: v.optional(v.id('financialAccounts')),
    fromCreditFacilityId: v.optional(v.id('creditFacilities')),
    toAccountId: v.id('financialAccounts'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const name = args.name.trim();
    if (!name) {
      throw new ConvexError('Planned transfer name is required');
    }
    assertIsoDate(args.scheduledDate, 'Scheduled date');

    await validatePlannedTransferEndpoints(ctx, {
      userId: user.id,
      fromAccountId: args.fromAccountId,
      fromCreditFacilityId: args.fromCreditFacilityId,
      toAccountId: args.toAccountId,
      amount: args.amount,
    });

    const now = Date.now();
    const plannedTransferId = await ctx.db.insert('plannedTransactions', {
      userId: user.id,
      fromAccountId: args.fromAccountId,
      fromCreditFacilityId: args.fromCreditFacilityId,
      toAccountId: args.toAccountId,
      name,
      description: args.description?.trim() ? args.description.trim() : undefined,
      amount: args.amount,
      dueDate: args.scheduledDate,
      kind: 'transfer',
      direction: 'outflow',
      status: 'planned',
      source: 'manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
    return plannedTransferId;
  },
});

export const updatePlannedTransfer = mutation({
  args: {
    plannedTransferId: plannedTransferIdValidator,
    name: v.string(),
    description: v.optional(v.string()),
    amount: moneyAmountValidator,
    scheduledDate: v.string(),
    fromAccountId: v.optional(v.id('financialAccounts')),
    fromCreditFacilityId: v.optional(v.id('creditFacilities')),
    toAccountId: v.id('financialAccounts'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plannedTransfer = await ctx.db.get('plannedTransactions', args.plannedTransferId);
    if (!plannedTransfer || plannedTransfer.userId !== user.id || plannedTransfer.kind !== 'transfer') {
      throw new ConvexError('Planned transfer not found');
    }
    if (plannedTransfer.status !== 'planned') {
      throw new ConvexError('Only planned transfers can be updated');
    }

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError('Planned transfer name is required');
    }
    assertIsoDate(args.scheduledDate, 'Scheduled date');

    await validatePlannedTransferEndpoints(ctx, {
      userId: user.id,
      fromAccountId: args.fromAccountId,
      fromCreditFacilityId: args.fromCreditFacilityId,
      toAccountId: args.toAccountId,
      amount: args.amount,
    });

    await ctx.db.patch('plannedTransactions', plannedTransfer._id, {
      fromAccountId: args.fromAccountId,
      fromCreditFacilityId: args.fromCreditFacilityId,
      toAccountId: args.toAccountId,
      name,
      description: args.description?.trim() ? args.description.trim() : undefined,
      amount: args.amount,
      dueDate: args.scheduledDate,
      updatedAtMs: Date.now(),
    });

    return { plannedTransferId: plannedTransfer._id };
  },
});

export const updatePlannedTransferAmount = mutation({
  args: {
    plannedTransferId: plannedTransferIdValidator,
    amount: moneyAmountValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transfer = await ctx.db.get('plannedTransactions', args.plannedTransferId);
    if (!transfer || transfer.userId !== user.id || transfer.kind !== 'transfer') {
      throw new ConvexError('Planned transfer not found');
    }
    if (transfer.status !== 'planned') {
      throw new ConvexError('Only planned transfers can be updated');
    }
    if (args.amount.amountMinor <= 0n) {
      throw new ConvexError('Planned transfer amount must be positive');
    }
    if (args.amount.currency !== transfer.amount.currency) {
      throw new ConvexError('Planned transfer currency cannot be changed');
    }
    await ctx.db.patch('plannedTransactions', transfer._id, {
      amount: args.amount,
      updatedAtMs: Date.now(),
    });
    return { plannedTransferId: transfer._id };
  },
});

export const deletePlannedTransfer = mutation({
  args: { plannedTransferId: plannedTransferIdValidator },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transfer = await ctx.db.get('plannedTransactions', args.plannedTransferId);
    if (!transfer || transfer.userId !== user.id || transfer.kind !== 'transfer') {
      throw new ConvexError('Planned transfer not found');
    }
    if (transfer.status !== 'planned') {
      throw new ConvexError('Only planned transfers can be deleted');
    }
    await ctx.db.delete('plannedTransactions', transfer._id);
    return { plannedTransferId: transfer._id };
  },
});

export const setPlannedTransferStatus = mutation({
  args: {
    plannedTransferId: plannedTransferIdValidator,
    status: plannedTransferStatusValidator,
    transferMatchId: v.optional(v.id('transferMatches')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const status = normalizePlannedTransferStatus(args.status);
    const plannedTransfer = await ctx.db.get('plannedTransactions', args.plannedTransferId);
    if (!plannedTransfer || plannedTransfer.userId !== user.id || plannedTransfer.kind !== 'transfer') {
      throw new ConvexError('Planned transfer not found');
    }
    // Guard against double completion: card-source transfers increment the facility
    // usedAmount, so completing twice would double-charge the card.
    if (plannedTransfer.status !== 'planned') {
      throw new ConvexError('Only planned transfers can be completed');
    }

    if (args.transferMatchId) {
      const transferMatch = await ctx.db.get('transferMatches', args.transferMatchId);
      if (!transferMatch || transferMatch.userId !== user.id || transferMatch.status !== 'confirmed') {
        throw new ConvexError('Transfer match not found');
      }
    }

    const now = Date.now();
    if (plannedTransfer.fromCreditFacilityId) {
      const facility = await ctx.db.get('creditFacilities', plannedTransfer.fromCreditFacilityId);
      if (!facility || facility.userId !== user.id) {
        throw new ConvexError('Source credit facility not found');
      }
      if (
        facility.limitAmount.currency !== plannedTransfer.amount.currency ||
        facility.usedAmount.currency !== plannedTransfer.amount.currency
      ) {
        throw new ConvexError('Source credit facility currency does not match planned transfer');
      }
      await ctx.db.patch('creditFacilities', facility._id, {
        usedAmount: {
          amountMinor: facility.usedAmount.amountMinor + plannedTransfer.amount.amountMinor,
          currency: facility.usedAmount.currency,
        },
        updatedAtMs: now,
      });
    }

    const patch = args.transferMatchId
      ? {
          status,
          completedTransferMatchId: args.transferMatchId,
          completedAtMs: now,
          updatedAtMs: now,
        }
      : {
          status,
          completedAtMs: now,
          updatedAtMs: now,
        };

    await ctx.db.patch('plannedTransactions', plannedTransfer._id, patch);

    return { plannedTransferId: plannedTransfer._id, status: args.status };
  },
});

export const listPlannedExpensePaymentCandidates = query({
  args: {
    plannedExpenseId: plannedExpenseIdValidator,
    dueDate: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const expense = await ctx.db.get('plannedTransactions', args.plannedExpenseId);
    if (!isPlannedExpense(expense) || expense.userId !== user.id || !expense.accountId) {
      throw new ConvexError('Planned expense not found');
    }
    if (!isPlannedExpenseOccurrence(expense, args.dueDate)) {
      throw new ConvexError('Planned expense occurrence not found');
    }

    const { fromDateExclusive, toDate } = occurrencePaymentCandidateDateRange(expense, args.dueDate);
    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
        q
          .eq('userId', user.id)
          .eq('accountId', expense.accountId!)
          .gt('bookingDate', fromDateExclusive)
          .lte('bookingDate', toDate),
      )
      .order('desc')
      .take(100);
    const linkedPayments = await ctx.db
      .query('plannedExpenseOccurrencePayments')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'paid'))
      .take(200);
    const linkedTransactionIds = new Set(
      linkedPayments.flatMap((payment) => (payment.transactionId ? [payment.transactionId] : [])),
    );
    const expectedDirection = plannedExpenseDirection(expense) === 'inflow' ? 'CRDT' : 'DBIT';

    return transactions
      .filter(
        (transaction) =>
          transaction.status === 'BOOK' &&
          transaction.direction === expectedDirection &&
          transaction.classificationKind !== 'transfer' &&
          transaction.classificationKind !== 'internal' &&
          transaction.amount.currency === expense.amount.currency &&
          strictPlannedExpenseAmountMatch(transaction.amount.amountMinor, expense.amount.amountMinor) &&
          !linkedTransactionIds.has(transaction._id),
      )
      .slice(0, Math.min(args.limit ?? 20, 50));
  },
});

export const markPlannedExpenseOccurrencePaid = mutation({
  args: {
    plannedExpenseId: plannedExpenseIdValidator,
    dueDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const expense = await ctx.db.get('plannedTransactions', args.plannedExpenseId);
    if (!isPlannedExpense(expense) || expense.userId !== user.id) {
      throw new ConvexError('Planned expense not found');
    }
    if (!isPlannedExpenseOccurrence(expense, args.dueDate)) {
      throw new ConvexError('Planned expense occurrence not found');
    }

    const existing = await ctx.db
      .query('plannedExpenseOccurrencePayments')
      .withIndex('by_plannedTransactionId_and_dueDate', (q) =>
        q.eq('plannedTransactionId', expense._id).eq('dueDate', args.dueDate),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch('plannedExpenseOccurrencePayments', existing._id, {
        status: 'paid',
        source: 'manual',
        transactionId: undefined,
        paidAtMs: now,
        updatedAtMs: now,
      });
    } else {
      await ctx.db.insert('plannedExpenseOccurrencePayments', {
        userId: user.id,
        plannedTransactionId: expense._id,
        dueDate: args.dueDate,
        status: 'paid',
        source: 'manual',
        paidAtMs: now,
        updatedAtMs: now,
      });
    }

    await setSinglePlannedExpensePaid(ctx, expense, now);
    return { plannedExpenseId: expense._id, dueDate: args.dueDate, status: 'paid' as const };
  },
});

export const linkPlannedExpenseOccurrenceTransaction = mutation({
  args: {
    plannedExpenseId: plannedExpenseIdValidator,
    dueDate: v.string(),
    transactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const expense = await ctx.db.get('plannedTransactions', args.plannedExpenseId);
    const transaction = await ctx.db.get('transactions', args.transactionId);
    if (!isPlannedExpense(expense) || expense.userId !== user.id || !expense.accountId) {
      throw new ConvexError('Planned expense not found');
    }
    if (!transaction || transaction.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }
    if (!isPlannedExpenseOccurrence(expense, args.dueDate)) {
      throw new ConvexError('Planned expense occurrence not found');
    }

    const expectedDirection = plannedExpenseDirection(expense) === 'inflow' ? 'CRDT' : 'DBIT';
    const { fromDateExclusive, toDate } = occurrencePaymentCandidateDateRange(expense, args.dueDate);
    if (
      transaction.status !== 'BOOK' ||
      transaction.accountId !== expense.accountId ||
      transaction.direction !== expectedDirection ||
      transaction.classificationKind === 'transfer' ||
      transaction.classificationKind === 'internal' ||
      transaction.amount.currency !== expense.amount.currency ||
      !strictPlannedExpenseAmountMatch(transaction.amount.amountMinor, expense.amount.amountMinor) ||
      transaction.bookingDate <= fromDateExclusive ||
      transaction.bookingDate > toDate
    ) {
      throw new ConvexError('Transaction is not compatible with this planned expense occurrence');
    }

    const transactionPayment = await ctx.db
      .query('plannedExpenseOccurrencePayments')
      .withIndex('by_transactionId', (q) => q.eq('transactionId', transaction._id))
      .unique();
    if (
      transactionPayment &&
      (transactionPayment.status === 'paid' ||
        transactionPayment.plannedTransactionId !== expense._id ||
        transactionPayment.dueDate !== args.dueDate)
    ) {
      throw new ConvexError('Transaction is already linked to a planned expense occurrence');
    }

    const merchantKey = normalizeMerchantKey(transaction.counterpartyName ?? transaction.description);
    if (merchantKey.length < 4) {
      throw new ConvexError('Transaction merchant is not specific enough for recurring matching');
    }

    const existing = await ctx.db
      .query('plannedExpenseOccurrencePayments')
      .withIndex('by_plannedTransactionId_and_dueDate', (q) =>
        q.eq('plannedTransactionId', expense._id).eq('dueDate', args.dueDate),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch('plannedExpenseOccurrencePayments', existing._id, {
        status: 'paid',
        source: 'linkedTransaction',
        transactionId: transaction._id,
        paidAtMs: now,
        updatedAtMs: now,
      });
    } else {
      await ctx.db.insert('plannedExpenseOccurrencePayments', {
        userId: user.id,
        plannedTransactionId: expense._id,
        dueDate: args.dueDate,
        status: 'paid',
        source: 'linkedTransaction',
        transactionId: transaction._id,
        paidAtMs: now,
        updatedAtMs: now,
      });
    }

    await ctx.db.patch('plannedTransactions', expense._id, {
      reconciliationMerchantKey: merchantKey,
      updatedAtMs: now,
    });
    await setSinglePlannedExpensePaid(ctx, expense, now);
    return { plannedExpenseId: expense._id, dueDate: args.dueDate, status: 'paid' as const };
  },
});

export const reopenPlannedExpenseOccurrence = mutation({
  args: {
    plannedExpenseId: plannedExpenseIdValidator,
    dueDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const expense = await ctx.db.get('plannedTransactions', args.plannedExpenseId);
    if (!isPlannedExpense(expense) || expense.userId !== user.id) {
      throw new ConvexError('Planned expense not found');
    }
    if (!isPlannedExpenseOccurrence(expense, args.dueDate)) {
      throw new ConvexError('Planned expense occurrence not found');
    }

    const payment = await ctx.db
      .query('plannedExpenseOccurrencePayments')
      .withIndex('by_plannedTransactionId_and_dueDate', (q) =>
        q.eq('plannedTransactionId', expense._id).eq('dueDate', args.dueDate),
      )
      .unique();
    if (!payment || payment.status !== 'paid') {
      return { plannedExpenseId: expense._id, dueDate: args.dueDate, status: 'reopened' as const };
    }

    const now = Date.now();
    await ctx.db.patch('plannedExpenseOccurrencePayments', payment._id, {
      status: 'reopened',
      updatedAtMs: now,
    });
    if (!expense.recurrenceInterval && expense.status === 'paid') {
      const status = expense.moneyBoxId ? 'funding' : 'planned';
      await ctx.db.patch('plannedTransactions', expense._id, { status, updatedAtMs: now });
      if (expense.moneyBoxId) {
        const moneyBox = await ctx.db.get('moneyBoxes', expense.moneyBoxId);
        if (moneyBox && moneyBox.userId === user.id) {
          await ctx.db.patch('moneyBoxes', moneyBox._id, { status: 'active', updatedAtMs: now });
        }
      }
    }

    return { plannedExpenseId: expense._id, dueDate: args.dueDate, status: 'reopened' as const };
  },
});

export const updatePlannedExpenseStatus = mutation({
  args: {
    plannedExpenseId: plannedExpenseIdValidator,
    status: plannedExpenseStatusValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plannedExpense = await ctx.db.get('plannedTransactions', args.plannedExpenseId);
    if (!isPlannedExpense(plannedExpense) || plannedExpense.userId !== user.id) {
      throw new ConvexError('Planned expense not found');
    }

    const now = Date.now();
    await ctx.db.patch('plannedTransactions', plannedExpense._id, {
      status: args.status,
      updatedAtMs: now,
    });

    if (plannedExpense.moneyBoxId) {
      const moneyBox = await ctx.db.get('moneyBoxes', plannedExpense.moneyBoxId);
      if (moneyBox && moneyBox.userId === user.id) {
        const moneyBoxPatch = moneyBoxPatchForPlannedExpenseStatus(moneyBox, args.status, now);
        if (moneyBoxPatch) {
          await ctx.db.patch('moneyBoxes', moneyBox._id, moneyBoxPatch);
          await invalidateAllPlanSnapshots(ctx, user.id);
        }
      }
    }

    return { plannedExpenseId: plannedExpense._id, status: args.status };
  },
});

export const updatePlannedExpense = mutation({
  args: {
    plannedExpenseId: plannedExpenseIdValidator,
    name: v.string(),
    description: v.optional(v.string()),
    note: v.optional(v.union(v.string(), v.null())),
    amount: moneyAmountValidator,
    direction: v.optional(plannedExpenseDirectionValidator),
    dueDate: v.string(),
    recurrenceInterval: v.optional(recurrenceIntervalValidator),
    recurrenceIntervalCount: v.optional(v.number()),
    accountId: v.optional(v.union(v.id('financialAccounts'), v.null())),
    categoryId: v.optional(v.union(v.id('categories'), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plannedExpense = await ctx.db.get('plannedTransactions', args.plannedExpenseId);
    if (!isPlannedExpense(plannedExpense) || plannedExpense.userId !== user.id) {
      throw new ConvexError('Planned expense not found');
    }

    const recurrenceIntervalCount = normalizeRecurrenceIntervalCount(
      args.recurrenceInterval,
      args.recurrenceIntervalCount,
    );
    const direction = args.direction ?? plannedExpenseDirection(plannedExpense);

    if (args.accountId) {
      const account = await ctx.db.get('financialAccounts', args.accountId);
      if (!account || account.userId !== user.id) {
        throw new ConvexError('Account not found');
      }
    }

    if (args.categoryId) {
      const category = await ctx.db.get('categories', args.categoryId);
      if (!category || category.userId !== user.id) {
        throw new ConvexError('Category not found');
      }
    }

    if (direction === 'inflow' && plannedExpense.moneyBoxId) {
      throw new ConvexError('Planned income cannot have a money box');
    }

    const now = Date.now();
    await ctx.db.patch('plannedTransactions', plannedExpense._id, {
      name: args.name,
      description: args.description,
      ...(args.note !== undefined ? { note: normalizePlannedTransactionNote(args.note) } : {}),
      amount: args.amount,
      kind: direction === 'inflow' ? 'income' : 'expense',
      direction,
      dueDate: args.dueDate,
      recurrenceInterval: args.recurrenceInterval,
      recurrenceIntervalCount,
      accountId: args.accountId ?? undefined,
      ...(args.categoryId !== undefined ? { categoryId: args.categoryId ?? undefined } : {}),
      updatedAtMs: now,
    });

    if (plannedExpense.moneyBoxId) {
      const moneyBox = await ctx.db.get('moneyBoxes', plannedExpense.moneyBoxId);
      if (moneyBox && moneyBox.userId === user.id) {
        await ctx.db.patch('moneyBoxes', moneyBox._id, {
          name: args.name,
          targetAmount: args.amount,
          targetDate: args.dueDate,
          updatedAtMs: now,
        });
      }
    }

    return { plannedExpenseId: plannedExpense._id };
  },
});

export const listSuggestedPlannedExpenses = query({
  args: {
    limit: v.optional(v.number()),
    minAmount: v.optional(moneyAmountValidator),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const suggestions: Array<PlannedExpenseSuggestion> = await ctx.runQuery(
      internal.banking.planningSuggestionFunctions.listForUser,
      {
        userId: user.id,
        limit: args.limit,
        minAmount: args.minAmount,
        asOfDate: args.asOfDate,
      },
    );
    return suggestions;
  },
});

export type CreatePlannedExpenseForUserArgs = {
  userId: string;
  name: string;
  description?: string;
  note?: string;
  amount: MoneyAmount;
  direction?: PlannedExpenseDirection;
  dueDate: string;
  recurrenceInterval?: Doc<'subscriptions'>['interval'];
  recurrenceIntervalCount?: number;
  categoryId?: Id<'categories'>;
  subscriptionId?: Id<'subscriptions'>;
  createMoneyBox?: boolean;
  accountId?: Id<'financialAccounts'>;
};

export async function createPlannedExpenseForUserCore(ctx: MutationCtx, args: CreatePlannedExpenseForUserArgs) {
  const now = Date.now();
  const direction = args.direction ?? 'outflow';
  const recurrenceIntervalCount = normalizeRecurrenceIntervalCount(
    args.recurrenceInterval,
    args.recurrenceIntervalCount,
  );

  if (args.amount.amountMinor <= 0n) {
    throw new ConvexError('Planned amount must be greater than zero');
  }
  if (args.amount.currency !== args.amount.currency.toUpperCase()) {
    throw new ConvexError('Planned amount currency must be uppercase');
  }

  if (direction === 'inflow' && args.createMoneyBox) {
    throw new ConvexError('Planned income cannot create a money box');
  }

  if (args.categoryId) {
    const category = await ctx.db.get('categories', args.categoryId);
    if (!category || category.userId !== args.userId) {
      throw new ConvexError('Category not found');
    }
  }

  if (args.subscriptionId) {
    const subscription = await ctx.db.get('subscriptions', args.subscriptionId);
    if (!subscription || subscription.userId !== args.userId) {
      throw new ConvexError('Subscription not found');
    }
  }

  if (args.accountId) {
    const account = await ctx.db.get('financialAccounts', args.accountId);
    if (!account || account.userId !== args.userId) {
      throw new ConvexError('Account not found');
    }
  }

  const plannedExpenseId = await ctx.db.insert('plannedTransactions', {
    userId: args.userId,
    name: args.name,
    description: args.description,
    note: args.note === undefined ? undefined : normalizePlannedTransactionNote(args.note),
    amount: args.amount,
    kind: direction === 'inflow' ? 'income' : 'expense',
    direction,
    dueDate: args.dueDate,
    recurrenceInterval: args.recurrenceInterval,
    recurrenceIntervalCount,
    status: args.createMoneyBox ? 'funding' : 'planned',
    source: args.subscriptionId ? 'subscription' : 'manual',
    categoryId: args.categoryId,
    subscriptionId: args.subscriptionId,
    createdAtMs: now,
    updatedAtMs: now,
    accountId: args.accountId,
  });

  if (!args.createMoneyBox) {
    return { plannedExpenseId: plannedExpenseId, moneyBoxId: null };
  }

  const moneyBoxId = await ctx.db.insert('moneyBoxes', {
    userId: args.userId,
    accountId: args.accountId,
    name: args.name,
    targetAmount: args.amount,
    savedAmount: { amountMinor: 0n, currency: args.amount.currency },
    targetDate: args.dueDate,
    status: 'active',
    source: 'plannedExpense',
    plannedTransactionId: plannedExpenseId,
    createdAtMs: now,
    updatedAtMs: now,
  });
  await invalidateAllPlanSnapshots(ctx, args.userId);

  await ctx.db.patch('plannedTransactions', plannedExpenseId, {
    moneyBoxId,
    updatedAtMs: now,
  });

  return { plannedExpenseId: plannedExpenseId, moneyBoxId };
}

export const createPlannedExpense = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    note: v.optional(v.string()),
    amount: moneyAmountValidator,
    direction: v.optional(plannedExpenseDirectionValidator),
    dueDate: v.string(),
    recurrenceInterval: v.optional(recurrenceIntervalValidator),
    recurrenceIntervalCount: v.optional(v.number()),
    categoryId: v.optional(v.id('categories')),
    subscriptionId: v.optional(v.id('subscriptions')),
    createMoneyBox: v.optional(v.boolean()),
    accountId: v.optional(v.id('financialAccounts')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await createPlannedExpenseForUserCore(ctx, {
      userId: user.id,
      ...args,
    });
  },
});

export const acceptPlannedExpenseSuggestion = mutation({
  args: {
    suggestionKey: v.string(),
    name: v.optional(v.string()),
    createMoneyBox: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const result: { plannedExpenseId: Id<'plannedTransactions'>; moneyBoxId: Id<'moneyBoxes'> | null } =
      await ctx.runMutation(internal.banking.planningSuggestionFunctions.acceptForUser, {
        userId: user.id,
        suggestionKey: args.suggestionKey,
        name: args.name,
        createMoneyBox: args.createMoneyBox,
      });
    return result;
  },
});
