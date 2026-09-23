import { ConvexError, v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalMutation, mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { isAccountDeletionStarted } from '../lib/accountDeletionGuard';
import {
  currentPeriod,
  isPlanActivityEligible,
  periodEndDate,
  periodStartDate,
  signedActivityMinor,
} from './planActivity';
import { latestBookedBalance } from './balances';
import { isCardBackedCreditFacilityType } from './credit';
import { buildInstallmentPaymentSchedule } from './creditMath';
import { cardStatementSettlementCardAccountIds } from './planCardSettlements';
import { INSTALLMENTS_GROUP_NAME } from './planSystemBuckets';
import { defaultUsageCycleDueDate } from './statementCycles';
import {
  available,
  carryIn,
  cashOverspending,
  overdraftMonthlyStepMinor,
  overdraftProgressMinor,
  planLiquidityMinor,
  planTargetStatus,
  readyToAssign,
  targetIsSnoozed,
  targetNeededMinor,
  targetUnderfundedMinor,
} from './planMath';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const MAX_PLAN_ROWS = 500;
const MAX_PLAN_ACCOUNTS = 100;
const MAX_CARD_FACILITIES = 200;
const MAX_SCHEDULED_CARD_CYCLES = 200;
const MAX_INSTALLMENT_PAYMENTS_PER_PLAN = 50;
const MAX_INSTALLMENT_SCHEDULE_MONTHS = 500;
const MAX_MONTH_TRANSACTIONS = 5000;
const MAX_MONEY_BOX_CONTRIBUTIONS = 5000;
const MAX_CARRY_MONTHS = 12;
const MAX_MONTH_TRANSFER_MATCHES = 500;
const SNAPSHOT_STABILITY_MONTHS = 2;
const DEFAULT_SNAPSHOT_BATCH_SIZE = 1;
const MAX_SNAPSHOT_BATCH_SIZE = 12;

type ReadCtx = QueryCtx | MutationCtx;
type PlanRows = Awaited<ReturnType<typeof loadPlanRows>>;
type SnapshotEntry = Doc<'planMonthSnapshots'>['entries'][number];
type CarryState = Map<Id<'planBuckets'>, bigint>;
type MoneyBoxContext = {
  moneyBoxByBucketId: Map<Id<'planBuckets'>, Doc<'moneyBoxes'>>;
  prefundedByBucketId: Map<Id<'planBuckets'>, bigint>;
};
type InstallmentPlanContext = {
  planById: Map<Id<'creditFacilityInstallmentPlans'>, Doc<'creditFacilityInstallmentPlans'>>;
  bucketIdByPlanId: Map<Id<'creditFacilityInstallmentPlans'>, Id<'planBuckets'>>;
  outstandingMinorByLinkedAccountId: Map<Id<'financialAccounts'>, bigint>;
};
type MonthTransactions = {
  transactions: Array<Doc<'transactions'>>;
  truncated: boolean;
};
type InPlanCashTransferResolution = {
  matchIds: Set<Id<'transferMatches'>>;
  normalizedMovementByTransactionId: Map<Id<'transactions'>, bigint>;
  activityMinorByTransactionId: Map<Id<'transactions'>, bigint>;
};
type CurrentCardAccount = {
  accountId: Id<'financialAccounts'>;
  balanceMinor: bigint;
};
type CurrentLiquidityAccount = {
  accountId: Id<'financialAccounts'>;
  accountType?: string;
  balanceMinor: bigint;
};
type CurrentOverdraft = {
  amountMinor: bigint;
  remainingFacilityMinor: bigint | null;
};
type OverdraftSummary = CurrentOverdraft & {
  progressMinor: bigint;
  targetDate: string | null;
  monthlyStepMinor: bigint | null;
};
type CurrentLiquidity = {
  minor: bigint;
  cardAccounts: Array<CurrentCardAccount>;
  cardAccountIds: Set<Id<'financialAccounts'>>;
  moneyBoxTransactionIds: Set<Id<'transactions'>>;
  overdraft: CurrentOverdraft | null;
};
type LiquidityContext = {
  currentMinor: bigint;
  currentPeriod: string;
  cardAccountIds: Set<Id<'financialAccounts'>>;
  excludedMovementTransactionIds: Set<Id<'transactions'>>;
  transactionsByPeriod: Map<string, MonthTransactions>;
  inPlanCashTransfersByPeriod: Map<string, InPlanCashTransferResolution>;
  valuesByPeriod: Map<string, { minor: bigint; truncated: boolean }>;
};
type ComputedMonth = {
  period: string;
  entries: Array<
    SnapshotEntry & {
      carryInMinor: bigint;
      coveredCardSpendMinor: bigint;
      creditOverspendMinor: bigint;
      moneyBoxPrefundedMinor: bigint;
    }
  >;
  readyToAssignMinor: bigint;
  liquidityMinor: bigint;
  overdraftProgressMinor: bigint;
  cashOverspendingMinor: bigint;
  coveredCardPurchaseMinorByTransactionId: Map<Id<'transactions'>, bigint>;
  installmentPaymentDueDateByPlanId: Map<Id<'creditFacilityInstallmentPlans'>, string>;
  breakdown: {
    carryFromPreviousMonthMinor: bigint;
    bucketActivityMinor: bigint;
    internalMinor: bigint;
    transferNetMinor: bigint;
    incomeMinor: bigint;
    liquidityFromCardMinor: bigint;
    uncoveredCardSpendMinor: bigint;
    beforePlanStartMinor: bigint;
    unexplainedMinor: bigint;
    moneyBoxReserveMinor: bigint;
    assignedMinor: bigint;
    cashOverspendingMinor: bigint;
  };
  truncated: boolean;
};

function assertPeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new ConvexError('Period must use YYYY-MM format');
  }
}

function addMonths(period: string, months: number) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 7);
}

function newestStableSnapshotPeriod() {
  return addMonths(currentPeriod(), -SNAPSHOT_STABILITY_MONTHS);
}

function laterPeriod(left: string, right: string) {
  return left > right ? left : right;
}

function assertBounded<T>(rows: Array<T>, label: string, maxRows = MAX_PLAN_ROWS) {
  if (rows.length > maxRows) throw new ConvexError(`Too many ${label} to read`);
  return rows;
}

async function loadPlanRows(ctx: ReadCtx, plan: Doc<'plans'>) {
  const [groups, buckets, mappings, categories, targets] = await Promise.all([
    ctx.db
      .query('planGroups')
      .withIndex('by_planId_and_sortOrder', (q) => q.eq('planId', plan._id))
      .take(MAX_PLAN_ROWS + 1),
    ctx.db
      .query('planBuckets')
      .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', plan._id))
      .take(MAX_PLAN_ROWS + 1),
    ctx.db
      .query('planBucketCategories')
      .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', plan._id))
      .take(MAX_PLAN_ROWS + 1),
    ctx.db
      .query('categories')
      .withIndex('by_userId', (q) => q.eq('userId', plan.userId))
      .take(MAX_PLAN_ROWS + 1),
    ctx.db
      .query('planTargets')
      .withIndex('by_planId_and_bucketId', (q) => q.eq('planId', plan._id))
      .take(MAX_PLAN_ROWS + 1),
  ]);

  const boundedBuckets = assertBounded(buckets, 'plan buckets');
  const unplanned = boundedBuckets.find((bucket) => bucket.isUnplanned);
  if (!unplanned) throw new ConvexError('Unplanned bucket not found');

  return {
    groups: assertBounded(groups, 'plan groups'),
    buckets: boundedBuckets,
    mappings: assertBounded(mappings, 'plan category mappings'),
    categories: assertBounded(categories, 'categories'),
    targets: assertBounded(targets, 'plan targets'),
    unplanned,
  };
}

async function loadInstallmentPlanContext(
  ctx: ReadCtx,
  plan: Doc<'plans'>,
  rows: PlanRows,
): Promise<InstallmentPlanContext> {
  const linkedBuckets = rows.buckets.filter(
    (bucket): bucket is Doc<'planBuckets'> & { installmentPlanId: Id<'creditFacilityInstallmentPlans'> } =>
      bucket.installmentPlanId !== undefined,
  );
  const [linkedInstallmentPlans, activeInstallmentPlans] = await Promise.all([
    Promise.all(linkedBuckets.map((bucket) => ctx.db.get('creditFacilityInstallmentPlans', bucket.installmentPlanId))),
    ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', plan.userId).eq('status', 'active'))
      .take(MAX_PLAN_ROWS + 1),
  ]);
  const boundedActiveInstallmentPlans = assertBounded(activeInstallmentPlans, 'active installment plans');
  const installmentPlanById = new Map<Id<'creditFacilityInstallmentPlans'>, Doc<'creditFacilityInstallmentPlans'>>();
  for (const installmentPlan of linkedInstallmentPlans) {
    if (installmentPlan) installmentPlanById.set(installmentPlan._id, installmentPlan);
  }
  for (const installmentPlan of boundedActiveInstallmentPlans) {
    installmentPlanById.set(installmentPlan._id, installmentPlan);
  }
  const facilityIds = [
    ...new Set([...installmentPlanById.values()].map((installmentPlan) => installmentPlan.creditFacilityId)),
  ];
  const facilities = await Promise.all(facilityIds.map((facilityId) => ctx.db.get('creditFacilities', facilityId)));
  const facilityById = new Map(facilityIds.map((facilityId, index) => [facilityId, facilities[index]]));
  const planById = new Map<Id<'creditFacilityInstallmentPlans'>, Doc<'creditFacilityInstallmentPlans'>>();
  const bucketIdByPlanId = new Map<Id<'creditFacilityInstallmentPlans'>, Id<'planBuckets'>>();
  const outstandingMinorByLinkedAccountId = new Map<Id<'financialAccounts'>, bigint>();
  linkedInstallmentPlans.forEach((installmentPlan, index) => {
    const bucket = linkedBuckets[index];
    const facility = installmentPlan ? facilityById.get(installmentPlan.creditFacilityId) : null;
    if (
      !installmentPlan ||
      !facility ||
      installmentPlan.userId !== plan.userId ||
      facility.userId !== plan.userId ||
      installmentPlan.monthlyPaymentAmount.currency !== plan.currency
    ) {
      return;
    }
    planById.set(installmentPlan._id, installmentPlan);
    bucketIdByPlanId.set(installmentPlan._id, bucket._id);
  });
  for (const installmentPlan of boundedActiveInstallmentPlans) {
    const facility = facilityById.get(installmentPlan.creditFacilityId);
    if (
      plan.currency === 'EUR' &&
      installmentPlan.userId === plan.userId &&
      facility?.userId === plan.userId &&
      installmentPlan.monthlyPaymentAmount.currency === plan.currency &&
      installmentPlan.outstandingAmount.currency === plan.currency &&
      facility.linkedAccountId
    ) {
      const outstandingMinor =
        installmentPlan.outstandingAmount.amountMinor > 0n ? installmentPlan.outstandingAmount.amountMinor : 0n;
      outstandingMinorByLinkedAccountId.set(
        facility.linkedAccountId,
        (outstandingMinorByLinkedAccountId.get(facility.linkedAccountId) ?? 0n) + outstandingMinor,
      );
    }
  }
  return { planById, bucketIdByPlanId, outstandingMinorByLinkedAccountId };
}

async function loadMoneyBoxContext(ctx: ReadCtx, plan: Doc<'plans'>, rows: PlanRows): Promise<MoneyBoxContext> {
  const linkedBuckets = rows.buckets.filter(
    (bucket): bucket is Doc<'planBuckets'> & { moneyBoxId: Id<'moneyBoxes'> } => bucket.moneyBoxId !== undefined,
  );
  const moneyBoxes = await Promise.all(linkedBuckets.map((bucket) => ctx.db.get('moneyBoxes', bucket.moneyBoxId)));
  const moneyBoxByBucketId = new Map<Id<'planBuckets'>, Doc<'moneyBoxes'>>();
  const prefundedByBucketId = new Map<Id<'planBuckets'>, bigint>();
  const planAccountIds = new Set(plan.accountIds);
  const fundedMoneyBoxIds = new Set<Id<'moneyBoxes'>>();

  moneyBoxes.forEach((moneyBox, index) => {
    const bucket = linkedBuckets[index];
    if (!moneyBox || moneyBox.userId !== plan.userId) return;
    moneyBoxByBucketId.set(bucket._id, moneyBox);
    if (
      fundedMoneyBoxIds.has(moneyBox._id) ||
      moneyBox.status === 'archived' ||
      moneyBox.accountId === undefined ||
      !planAccountIds.has(moneyBox.accountId) ||
      moneyBox.savedAmount.currency !== plan.currency
    ) {
      return;
    }
    fundedMoneyBoxIds.add(moneyBox._id);
    prefundedByBucketId.set(bucket._id, moneyBox.savedAmount.amountMinor);
  });

  return { moneyBoxByBucketId, prefundedByBucketId };
}

function installmentScheduleItemForPeriod(installmentPlan: Doc<'creditFacilityInstallmentPlans'>, period: string) {
  if (
    installmentPlan.status !== 'active' ||
    installmentPlan.remainingInstallments <= 0 ||
    period > installmentPlan.endDate.slice(0, 7)
  ) {
    return null;
  }
  const firstDueDate = installmentPlan.nextPaymentDate;
  if (firstDueDate && period < firstDueDate.slice(0, 7)) return null;
  const schedule = buildInstallmentPaymentSchedule({
    monthlyPaymentAmount: installmentPlan.monthlyPaymentAmount,
    outstandingAmount: installmentPlan.outstandingAmount,
    startDate: installmentPlan.startDate,
    nextPaymentDate: firstDueDate,
    remainingInstallments: Math.min(installmentPlan.remainingInstallments, MAX_INSTALLMENT_SCHEDULE_MONTHS),
    asOfDate: firstDueDate ?? installmentPlan.startDate,
    monthsAhead: MAX_INSTALLMENT_SCHEDULE_MONTHS,
  });
  return schedule.find((item) => item.dueDate.slice(0, 7) === period) ?? null;
}

async function loadInstallmentPaymentsForPeriod(
  ctx: ReadCtx,
  plan: Doc<'plans'>,
  installmentContext: InstallmentPlanContext,
  period: string,
) {
  const activityByBucket = new Map<Id<'planBuckets'>, bigint>();
  // One bank debit can settle several plans of the same facility at once — one observed provider sends a single
  // "RIMBORSO PRESTITO" for every instalment of the month. Keyed one-to-one, the last plan read won
  // the entry and the other buckets showed an empty activity list beside a non-zero total.
  const bucketIdsByTransactionId = new Map<Id<'transactions'>, Set<Id<'planBuckets'>>>();
  const paidMinorByTransactionAndBucket = new Map<string, bigint>();
  const dueDateByPlanId = new Map<Id<'creditFacilityInstallmentPlans'>, string>();
  for (const [installmentPlanId, bucketId] of installmentContext.bucketIdByPlanId) {
    const payments = await ctx.db
      .query('creditFacilityInstallmentPayments')
      .withIndex('by_installmentPlanId_and_scheduledDueDate', (q) =>
        q
          .eq('installmentPlanId', installmentPlanId)
          .gte('scheduledDueDate', periodStartDate(period))
          .lt('scheduledDueDate', periodEndDate(period)),
      )
      .take(MAX_INSTALLMENT_PAYMENTS_PER_PLAN + 1);
    if (payments.length > MAX_INSTALLMENT_PAYMENTS_PER_PLAN) {
      throw new ConvexError('Too many installment payments to read');
    }
    for (const payment of payments) {
      if (payment.userId !== plan.userId || payment.amount.currency !== plan.currency) continue;
      const transaction = payment.transactionId ? await ctx.db.get('transactions', payment.transactionId) : null;
      const activityDate = transaction?.bookingDate ?? payment.paymentDate;
      if (plan.startDate !== undefined && activityDate < plan.startDate) continue;
      activityByBucket.set(bucketId, (activityByBucket.get(bucketId) ?? 0n) - payment.amount.amountMinor);
      if (payment.transactionId) {
        const bucketIds = bucketIdsByTransactionId.get(payment.transactionId) ?? new Set<Id<'planBuckets'>>();
        bucketIds.add(bucketId);
        bucketIdsByTransactionId.set(payment.transactionId, bucketIds);
        const shareKey = `${payment.transactionId}|${bucketId}`;
        paidMinorByTransactionAndBucket.set(
          shareKey,
          (paidMinorByTransactionAndBucket.get(shareKey) ?? 0n) + payment.amount.amountMinor,
        );
      }
      if (payment.scheduledDueDate) {
        const existingDueDate = dueDateByPlanId.get(installmentPlanId);
        if (!existingDueDate || payment.scheduledDueDate < existingDueDate) {
          dueDateByPlanId.set(installmentPlanId, payment.scheduledDueDate);
        }
      }
    }
  }
  return { activityByBucket, bucketIdsByTransactionId, paidMinorByTransactionAndBucket, dueDateByPlanId };
}

async function loadMoneyBoxLiquidityAdjustment(ctx: ReadCtx, plan: Doc<'plans'>) {
  const moneyBoxes = assertBounded(
    await ctx.db
      .query('moneyBoxes')
      .withIndex('by_userId_and_targetDate', (q) => q.eq('userId', plan.userId))
      .take(MAX_PLAN_ROWS + 1),
    'money boxes',
  );
  const planAccountIds = new Set(plan.accountIds);
  const qualifyingMoneyBoxes = moneyBoxes.filter((moneyBox) => {
    // Explicit opt-in avoids double-counting cash already in a reported balance.
    // The linked account must be in this plan; accountless boxes are skipped rather than guessed.
    // Matching currency avoids implicit FX.
    // Archived boxes no longer count.
    return (
      moneyBox.heldOutsideBalance === true &&
      moneyBox.accountId !== undefined &&
      planAccountIds.has(moneyBox.accountId) &&
      moneyBox.savedAmount.currency === plan.currency &&
      moneyBox.status !== 'archived'
    );
  });
  if (qualifyingMoneyBoxes.length === 0) {
    return { minor: 0n, transactionIds: new Set<Id<'transactions'>>() };
  }

  const qualifyingMoneyBoxIds = new Set(qualifyingMoneyBoxes.map((moneyBox) => moneyBox._id));
  const contributions = assertBounded(
    await ctx.db
      .query('moneyBoxContributions')
      .withIndex('by_userId_and_contributionDate', (q) => q.eq('userId', plan.userId))
      .take(MAX_MONEY_BOX_CONTRIBUTIONS + 1),
    'money box contributions',
    MAX_MONEY_BOX_CONTRIBUTIONS,
  );
  const transactionIds = new Set<Id<'transactions'>>();
  for (const contribution of contributions) {
    if (qualifyingMoneyBoxIds.has(contribution.moneyBoxId) && contribution.transactionId) {
      transactionIds.add(contribution.transactionId);
    }
  }
  return {
    minor: qualifyingMoneyBoxes.reduce((total, moneyBox) => total + moneyBox.savedAmount.amountMinor, 0n),
    transactionIds,
  };
}

async function loadCurrentLiquidity(ctx: ReadCtx, plan: Doc<'plans'>): Promise<CurrentLiquidity> {
  if (plan.accountIds.length > MAX_PLAN_ACCOUNTS) throw new ConvexError('Too many plan accounts to read');
  const [liquidityAccounts, moneyBoxAdjustment, facilities] = await Promise.all([
    Promise.all(
      plan.accountIds.map(async (accountId) => {
        const account = await ctx.db.get('financialAccounts', accountId);
        if (!account || account.userId !== plan.userId) throw new ConvexError('Plan account not found');
        const balance = await latestBookedBalance(ctx, account._id);
        return {
          accountId: account._id,
          name: account.name,
          alias: account.alias,
          institutionName: account.institutionName,
          ibanMasked: account.ibanMasked,
          accountType: account.accountType,
          balanceMinor: balance?.amount.currency === plan.currency ? balance.amount.amountMinor : 0n,
        };
      }),
    ),
    loadMoneyBoxLiquidityAdjustment(ctx, plan),
    ctx.db
      .query('creditFacilities')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', plan.userId).eq('status', 'active'))
      .take(MAX_CARD_FACILITIES + 1),
  ]);
  const boundedFacilities = assertBounded(facilities, 'active credit facilities', MAX_CARD_FACILITIES);
  const cardAccounts = liquidityAccounts
    .filter((account) => account.accountType?.toUpperCase() === 'CARD')
    .map((account) => ({ accountId: account.accountId, balanceMinor: account.balanceMinor }));
  return {
    minor: planLiquidityMinor(liquidityAccounts) + moneyBoxAdjustment.minor,
    cardAccounts,
    cardAccountIds: new Set(cardAccounts.map((account) => account.accountId)),
    moneyBoxTransactionIds: moneyBoxAdjustment.transactionIds,
    overdraft: currentOverdraft(liquidityAccounts, boundedFacilities, plan.currency),
  };
}

function currentOverdraft(
  accounts: Array<CurrentLiquidityAccount>,
  facilities: Array<Doc<'creditFacilities'>>,
  currency: string,
): CurrentOverdraft | null {
  const overdrawnAccounts = accounts.filter(
    (account) => account.accountType?.toUpperCase() !== 'CARD' && account.balanceMinor < 0n,
  );
  if (overdrawnAccounts.length === 0) return null;

  const overdrawnAccountIds = new Set(overdrawnAccounts.map((account) => account.accountId));
  const facilityLimitByAccountId = new Map<Id<'financialAccounts'>, bigint>();
  for (const facility of facilities) {
    if (
      facility.facilityType !== 'accountOverdraft' ||
      !facility.linkedAccountId ||
      !overdrawnAccountIds.has(facility.linkedAccountId) ||
      facility.limitAmount.currency !== currency
    ) {
      continue;
    }
    const limitMinor = facility.limitAmount.amountMinor > 0n ? facility.limitAmount.amountMinor : 0n;
    facilityLimitByAccountId.set(
      facility.linkedAccountId,
      (facilityLimitByAccountId.get(facility.linkedAccountId) ?? 0n) + limitMinor,
    );
  }

  let amountMinor = 0n;
  let remainingFacilityMinor = 0n;
  for (const account of overdrawnAccounts) {
    const usedMinor = -account.balanceMinor;
    amountMinor += usedMinor;
    const limitMinor = facilityLimitByAccountId.get(account.accountId);
    if (limitMinor !== undefined) {
      remainingFacilityMinor += limitMinor > usedMinor ? limitMinor - usedMinor : 0n;
    }
  }

  return {
    amountMinor,
    remainingFacilityMinor: facilityLimitByAccountId.size > 0 ? remainingFacilityMinor : null,
  };
}

async function loadCardPaymentDueDates(ctx: ReadCtx, plan: Doc<'plans'>, cardAccountIds: Set<Id<'financialAccounts'>>) {
  if (cardAccountIds.size === 0) return new Map<Id<'financialAccounts'>, string>();
  const [facilities, scheduledCycles] = await Promise.all([
    ctx.db
      .query('creditFacilities')
      .withIndex('by_userId', (q) => q.eq('userId', plan.userId))
      .take(MAX_CARD_FACILITIES),
    ctx.db
      .query('creditFacilityUsageCycles')
      .withIndex('by_userId_and_status_and_dueDate', (q) => q.eq('userId', plan.userId).eq('status', 'scheduled'))
      .take(MAX_SCHEDULED_CARD_CYCLES),
  ]);
  const accountIdByFacilityId = new Map<Id<'creditFacilities'>, Id<'financialAccounts'>>();
  for (const facility of facilities) {
    if (facility.linkedAccountId && cardAccountIds.has(facility.linkedAccountId)) {
      accountIdByFacilityId.set(facility._id, facility.linkedAccountId);
    }
  }
  const dueDateByAccountId = new Map<Id<'financialAccounts'>, string>();
  for (const cycle of scheduledCycles) {
    const accountId = accountIdByFacilityId.get(cycle.creditFacilityId);
    if (accountId && !dueDateByAccountId.has(accountId)) {
      dueDateByAccountId.set(accountId, cycle.dueDate);
    }
  }
  // A tracked cycle is the better answer, but most cards never have one: the statement is simply
  // charged on the facility's payment day of the following month. Without this fallback the plan
  // stayed silent about when the money leaves, while the accounts section already said it.
  for (const facility of facilities) {
    const accountId = accountIdByFacilityId.get(facility._id);
    if (!accountId || dueDateByAccountId.has(accountId) || !isCardBackedCreditFacilityType(facility.facilityType)) {
      continue;
    }
    dueDateByAccountId.set(accountId, defaultUsageCycleDueDate(facility, currentPeriod()));
  }
  return dueDateByAccountId;
}

async function loadMonthTransactions(
  ctx: ReadCtx,
  plan: Doc<'plans'>,
  period: string,
  cache: Map<string, MonthTransactions>,
) {
  const cached = cache.get(period);
  if (cached) return cached;
  const transactionRows = await ctx.db
    .query('transactions')
    .withIndex('by_userId_and_status_and_bookingDate', (q) =>
      q
        .eq('userId', plan.userId)
        .eq('status', 'BOOK')
        .gte('bookingDate', periodStartDate(period))
        .lt('bookingDate', periodEndDate(period)),
    )
    .take(MAX_MONTH_TRANSACTIONS + 1);
  const result = {
    transactions: transactionRows.slice(0, MAX_MONTH_TRANSACTIONS),
    truncated: transactionRows.length > MAX_MONTH_TRANSACTIONS,
  };
  cache.set(period, result);
  return result;
}

function isPlanMovementTransaction(
  transaction: Doc<'transactions'>,
  accountIds: Set<Id<'financialAccounts'>>,
  cardAccountIds: Set<Id<'financialAccounts'>>,
  excludedMovementTransactionIds: Set<Id<'transactions'>>,
  currency: string,
) {
  return (
    !excludedMovementTransactionIds.has(transaction._id) &&
    accountIds.has(transaction.accountId) &&
    !cardAccountIds.has(transaction.accountId) &&
    transaction.amount.currency === currency
  );
}

function planMovementMinor(
  plan: Doc<'plans'>,
  transactions: Array<Doc<'transactions'>>,
  cardAccountIds: Set<Id<'financialAccounts'>>,
  excludedMovementTransactionIds: Set<Id<'transactions'>>,
  inPlanCashTransfers: InPlanCashTransferResolution,
) {
  const accountIds = new Set(plan.accountIds);
  let movementMinor = 0n;
  for (const transaction of transactions) {
    if (
      isPlanMovementTransaction(transaction, accountIds, cardAccountIds, excludedMovementTransactionIds, plan.currency)
    ) {
      movementMinor +=
        inPlanCashTransfers.normalizedMovementByTransactionId.get(transaction._id) ?? signedActivityMinor(transaction);
    }
  }
  return movementMinor;
}

async function resolveInPlanCashTransfers(
  ctx: ReadCtx,
  plan: Doc<'plans'>,
  transactions: Array<Doc<'transactions'>>,
  cardAccountIds: Set<Id<'financialAccounts'>>,
): Promise<InPlanCashTransferResolution> {
  const matchIds = [
    ...new Set(
      transactions.flatMap((transaction) =>
        transaction.classificationKind === 'transfer' && transaction.transferMatchId
          ? [transaction.transferMatchId]
          : [],
      ),
    ),
  ];
  if (matchIds.length > MAX_MONTH_TRANSFER_MATCHES) throw new ConvexError('Too many transfer matches to read');

  const planAccountIds = new Set(plan.accountIds);
  const matches = await Promise.all(matchIds.map((matchId) => ctx.db.get('transferMatches', matchId)));
  const matchesWithLegs = await Promise.all(
    matches.map(async (match) => {
      if (!match) return null;
      const [outgoing, incoming] = await Promise.all([
        ctx.db.get('transactions', match.outgoingTransactionId),
        ctx.db.get('transactions', match.incomingTransactionId),
      ]);
      return { match, outgoing, incoming };
    }),
  );
  const resolvedMatchIds = new Set<Id<'transferMatches'>>();
  const normalizedMovementByTransactionId = new Map<Id<'transactions'>, bigint>();
  const activityMinorByTransactionId = new Map<Id<'transactions'>, bigint>();

  for (const matchWithLegs of matchesWithLegs) {
    if (!matchWithLegs) continue;
    const { match, outgoing, incoming } = matchWithLegs;
    if (
      !outgoing ||
      !incoming ||
      match.status !== 'confirmed' ||
      match.userId !== plan.userId ||
      outgoing.userId !== plan.userId ||
      incoming.userId !== plan.userId ||
      outgoing.direction !== 'DBIT' ||
      incoming.direction !== 'CRDT' ||
      outgoing.amount.currency !== plan.currency ||
      incoming.amount.currency !== plan.currency ||
      !planAccountIds.has(outgoing.accountId) ||
      !planAccountIds.has(incoming.accountId) ||
      cardAccountIds.has(outgoing.accountId) ||
      cardAccountIds.has(incoming.accountId)
    ) {
      continue;
    }

    resolvedMatchIds.add(match._id);
    // The principal stays inside the Plan. Attribute only the signed amount difference on the
    // outgoing booking date so a provider delay cannot create a fake perimeter transfer.
    const signedDeltaMinor = incoming.amount.amountMinor - outgoing.amount.amountMinor;
    normalizedMovementByTransactionId.set(outgoing._id, signedDeltaMinor);
    normalizedMovementByTransactionId.set(incoming._id, 0n);
    if (signedDeltaMinor !== 0n) activityMinorByTransactionId.set(outgoing._id, signedDeltaMinor);
  }

  return {
    matchIds: resolvedMatchIds,
    normalizedMovementByTransactionId,
    activityMinorByTransactionId,
  };
}

async function loadInPlanCashTransfersForPeriod(
  ctx: ReadCtx,
  plan: Doc<'plans'>,
  period: string,
  transactions: Array<Doc<'transactions'>>,
  cardAccountIds: Set<Id<'financialAccounts'>>,
  cache: Map<string, InPlanCashTransferResolution>,
) {
  const cached = cache.get(period);
  if (cached) return cached;
  const result = await resolveInPlanCashTransfers(ctx, plan, transactions, cardAccountIds);
  cache.set(period, result);
  return result;
}

async function liquidityAtEndOfPeriod(ctx: ReadCtx, plan: Doc<'plans'>, period: string, liquidity: LiquidityContext) {
  const cached = liquidity.valuesByPeriod.get(period);
  if (cached) return cached;
  if (period === liquidity.currentPeriod) {
    const result = { minor: liquidity.currentMinor, truncated: false };
    liquidity.valuesByPeriod.set(period, result);
    return result;
  }

  const isPast = period < liquidity.currentPeriod;
  let cursor = addMonths(isPast ? period : liquidity.currentPeriod, 1);
  const throughPeriod = isPast ? liquidity.currentPeriod : period;
  let movementMinor = 0n;
  let truncated = false;
  let monthsRead = 0;
  while (cursor <= throughPeriod && monthsRead < MAX_CARRY_MONTHS) {
    const month = await loadMonthTransactions(ctx, plan, cursor, liquidity.transactionsByPeriod);
    const inPlanCashTransfers = await loadInPlanCashTransfersForPeriod(
      ctx,
      plan,
      cursor,
      month.transactions,
      liquidity.cardAccountIds,
      liquidity.inPlanCashTransfersByPeriod,
    );
    truncated ||= month.truncated;
    movementMinor += planMovementMinor(
      plan,
      month.transactions,
      liquidity.cardAccountIds,
      liquidity.excludedMovementTransactionIds,
      inPlanCashTransfers,
    );
    cursor = addMonths(cursor, 1);
    monthsRead += 1;
  }
  truncated ||= cursor <= throughPeriod;
  const result = {
    minor: liquidity.currentMinor + (isPast ? -movementMinor : movementMinor),
    truncated,
  };
  liquidity.valuesByPeriod.set(period, result);
  return result;
}

/**
 * Both legs of a statement payment are transactions, and they need not land in the same month: a
 * payment leaving the account on the 31st can reach the card the day after. Deriving the card side
 * from the month's own rows made the lone leg look like an ordinary transfer out of the plan, so
 * the pairing is resolved through `transferMatches` instead of inferred from the window.
 */
async function cardTransferMatchIdsForMonth(
  ctx: ReadCtx,
  transactions: Array<Doc<'transactions'>>,
  cardAccountIds: Set<Id<'financialAccounts'>>,
) {
  const cardMatchIds = new Set<Id<'transferMatches'>>();
  const unresolved = new Map<Id<'transferMatches'>, Id<'transactions'>>();
  for (const transaction of transactions) {
    if (!transaction.transferMatchId) continue;
    if (cardAccountIds.has(transaction.accountId)) cardMatchIds.add(transaction.transferMatchId);
    else unresolved.set(transaction.transferMatchId, transaction._id);
  }
  for (const matchId of cardMatchIds) unresolved.delete(matchId);
  if (unresolved.size === 0) return cardMatchIds;
  if (unresolved.size > MAX_MONTH_TRANSFER_MATCHES) throw new ConvexError('Too many transfer matches to read');

  const matches = await Promise.all([...unresolved.keys()].map((matchId) => ctx.db.get('transferMatches', matchId)));
  const counterparts: Array<{ matchId: Id<'transferMatches'>; transactionId: Id<'transactions'> }> = [];
  for (const match of matches) {
    if (!match) continue;
    const knownTransactionId = unresolved.get(match._id);
    counterparts.push({
      matchId: match._id,
      transactionId:
        match.outgoingTransactionId === knownTransactionId ? match.incomingTransactionId : match.outgoingTransactionId,
    });
  }
  const counterpartRows = await Promise.all(
    counterparts.map((counterpart) => ctx.db.get('transactions', counterpart.transactionId)),
  );
  counterpartRows.forEach((row, index) => {
    if (row && cardAccountIds.has(row.accountId)) cardMatchIds.add(counterparts[index].matchId);
  });
  return cardMatchIds;
}

async function computeMonth(
  ctx: ReadCtx,
  plan: Doc<'plans'>,
  rows: PlanRows,
  period: string,
  previousAvailable: CarryState,
  previousReadyToAssignMinor: bigint,
  previousLiquidityMinor: bigint,
  monthLiquidityMinor: bigint,
  cardAccountIds: Set<Id<'financialAccounts'>>,
  cardAccountIdBySettlementTransactionId: Map<Id<'transactions'>, Id<'financialAccounts'>>,
  installmentContext: InstallmentPlanContext,
  moneyBoxContext: MoneyBoxContext,
  excludedMovementTransactionIds: Set<Id<'transactions'>>,
  transactionsByPeriod: Map<string, MonthTransactions>,
  inPlanCashTransfersByPeriod: Map<string, InPlanCashTransferResolution>,
): Promise<ComputedMonth> {
  const [assignments, monthTransactions, installmentPayments] = await Promise.all([
    ctx.db
      .query('planAssignments')
      .withIndex('by_planId_and_period', (q) => q.eq('planId', plan._id).eq('period', period))
      .take(MAX_PLAN_ROWS + 1),
    loadMonthTransactions(ctx, plan, period, transactionsByPeriod),
    loadInstallmentPaymentsForPeriod(ctx, plan, installmentContext, period),
  ]);
  const boundedAssignments = assertBounded(assignments, 'plan assignments');
  const transactions = monthTransactions.transactions;
  const inPlanCashTransfers = await loadInPlanCashTransfersForPeriod(
    ctx,
    plan,
    period,
    transactions,
    cardAccountIds,
    inPlanCashTransfersByPeriod,
  );
  const bucketIds = new Set(rows.buckets.map((bucket) => bucket._id));
  const mappingByCategory = new Map(rows.mappings.map((mapping) => [mapping.categoryId, mapping.bucketId]));
  const cardBucketIdByAccountId = new Map(
    rows.buckets.flatMap((bucket) => (bucket.cardAccountId ? [[bucket.cardAccountId, bucket._id] as const] : [])),
  );
  const activityByBucket = new Map(installmentPayments.activityByBucket);
  const cardSpendByBucket = new Map<Id<'planBuckets'>, Map<Id<'financialAccounts'>, bigint>>();
  const cardPurchasesByBucket = new Map<Id<'planBuckets'>, Map<Id<'financialAccounts'>, Array<Doc<'transactions'>>>>();
  const planAccountIds = new Set(plan.accountIds);
  let internalMinor = 0n;
  let transferNetMinor = 0n;
  let incomeMinor = 0n;
  let liquidityFromCardMinor = 0n;
  let beforePlanStartMinor = 0n;
  // Net, not just the debits: a refund credited to a card reduces the debt it contracted, and
  // `cardSpendByBucket` below only collects DBIT rows.
  let cardChargedActivityMinor = 0n;

  const cardTransferMatchIds = await cardTransferMatchIdsForMonth(ctx, transactions, cardAccountIds);

  for (const transaction of transactions) {
    if (excludedMovementTransactionIds.has(transaction._id)) continue;
    if (plan.startDate !== undefined && transaction.bookingDate < plan.startDate) {
      // Liquidity reconstruction still includes the real movement. Name its signed cash effect
      // explicitly, but do not let a transaction from before the plan existed reach any bucket,
      // overspending calculation, income, card-payment, internal, or transfer line.
      if (
        isPlanMovementTransaction(
          transaction,
          planAccountIds,
          cardAccountIds,
          excludedMovementTransactionIds,
          plan.currency,
        )
      ) {
        beforePlanStartMinor +=
          inPlanCashTransfers.normalizedMovementByTransactionId.get(transaction._id) ??
          signedActivityMinor(transaction);
      }
      continue;
    }
    // A linked repayment is represented by the payment row above. It must not also become income,
    // out-of-plan internal movement, card settlement, or category activity.
    if (installmentPayments.bucketIdsByTransactionId.has(transaction._id)) continue;

    if (
      transaction.classificationKind === 'income' &&
      isPlanMovementTransaction(
        transaction,
        planAccountIds,
        cardAccountIds,
        excludedMovementTransactionIds,
        plan.currency,
      )
    ) {
      incomeMinor += signedActivityMinor(transaction);
    }

    let paymentCardAccountId: Id<'financialAccounts'> | undefined;
    if (
      cardAccountIds.has(transaction.accountId) &&
      transaction.amount.currency === plan.currency &&
      transaction.direction === 'CRDT' &&
      (transaction.classificationKind === 'transfer' || transaction.classificationKind === 'internal')
    ) {
      paymentCardAccountId = transaction.accountId;
    } else if (!transaction.transferMatchId) {
      const settlementCardAccountId = cardAccountIdBySettlementTransactionId.get(transaction._id);
      if (settlementCardAccountId && cardAccountIds.has(settlementCardAccountId)) {
        paymentCardAccountId = settlementCardAccountId;
      }
    }
    if (paymentCardAccountId) {
      // Unplanned rather than nowhere when the card has no payment bucket: dropping the row left
      // the cash leg in the liquidity change with nothing to answer for it, and the payment came
      // back out as negative income.
      const cardBucketId = cardBucketIdByAccountId.get(paymentCardAccountId) ?? rows.unplanned._id;
      const signedMinor = signedActivityMinor(transaction);
      const paymentMinor = signedMinor < 0n ? -signedMinor : signedMinor;
      activityByBucket.set(cardBucketId, (activityByBucket.get(cardBucketId) ?? 0n) - paymentMinor);
      // Settling a statement is not category spending. The card-side leg falls out on its own
      // because it is a transfer, but a cash-side settlement with no counterpart is an ordinary
      // eligible outflow — without this it would be charged to a bucket as well as to the card.
      continue;
    }

    // The cash side of that same payment: its liquidity effect is real and already counted, but it
    // must not also appear under out-of-plan transfers, or one payment would be reported twice.
    if (transaction.transferMatchId && cardTransferMatchIds.has(transaction.transferMatchId)) {
      // Money arriving from a card is borrowed, not earned: it raises both what can be assigned and
      // the card's debt. The outgoing direction is the statement payment, already carried by the
      // card bucket's activity above.
      if (
        transaction.direction === 'CRDT' &&
        isPlanMovementTransaction(
          transaction,
          planAccountIds,
          cardAccountIds,
          excludedMovementTransactionIds,
          plan.currency,
        )
      ) {
        liquidityFromCardMinor += signedActivityMinor(transaction);
      }
      continue;
    }

    const inPlanCashTransferMovement = inPlanCashTransfers.normalizedMovementByTransactionId.get(transaction._id);
    if (inPlanCashTransferMovement !== undefined) {
      const activityMinor = inPlanCashTransfers.activityMinorByTransactionId.get(transaction._id);
      if (activityMinor !== undefined) {
        activityByBucket.set(rows.unplanned._id, (activityByBucket.get(rows.unplanned._id) ?? 0n) + activityMinor);
      }
      continue;
    }

    if (
      planAccountIds.has(transaction.accountId) &&
      !cardAccountIds.has(transaction.accountId) &&
      transaction.amount.currency === plan.currency
    ) {
      const movementMinor = signedActivityMinor(transaction);
      if (transaction.classificationKind === 'internal') internalMinor += movementMinor;
      if (transaction.classificationKind === 'transfer') transferNetMinor += movementMinor;
    }

    if (!planAccountIds.has(transaction.accountId)) continue;
    if (!isPlanActivityEligible(transaction, { currency: plan.currency })) continue;
    const mappedBucketId = transaction.categoryId ? mappingByCategory.get(transaction.categoryId) : undefined;
    const bucketId = mappedBucketId && bucketIds.has(mappedBucketId) ? mappedBucketId : rows.unplanned._id;
    activityByBucket.set(bucketId, (activityByBucket.get(bucketId) ?? 0n) + signedActivityMinor(transaction));
    if (cardAccountIds.has(transaction.accountId)) {
      const signedMinor = signedActivityMinor(transaction);
      cardChargedActivityMinor += signedMinor;
      // Net of refunds, both here and in `cardChargedActivityMinor`. Backing out only the debits
      // made a refund look like cash the bucket could earmark, when it is credit on the card.
      const spendByCard = cardSpendByBucket.get(bucketId) ?? new Map<Id<'financialAccounts'>, bigint>();
      spendByCard.set(transaction.accountId, (spendByCard.get(transaction.accountId) ?? 0n) - signedMinor);
      cardSpendByBucket.set(bucketId, spendByCard);
      if (transaction.direction === 'DBIT') {
        const purchasesByCard =
          cardPurchasesByBucket.get(bucketId) ?? new Map<Id<'financialAccounts'>, Array<Doc<'transactions'>>>();
        const purchases = purchasesByCard.get(transaction.accountId) ?? [];
        purchases.push(transaction);
        purchasesByCard.set(transaction.accountId, purchases);
        cardPurchasesByBucket.set(bucketId, purchasesByCard);
      }
    }
  }

  const assignedByBucket = new Map(
    boundedAssignments.map((assignment) => [assignment.bucketId, assignment.assignedMinor]),
  );
  const includesCurrentMoneyBoxStock = period >= currentPeriod();
  const baseEntries = rows.buckets.map((bucket) => {
    const carryInMinor = carryIn(previousAvailable.get(bucket._id) ?? 0n);
    const assignedMinor = assignedByBucket.get(bucket._id) ?? 0n;
    const activityMinor = activityByBucket.get(bucket._id) ?? 0n;
    const moneyBoxPrefundedMinor = includesCurrentMoneyBoxStock
      ? (moneyBoxContext.prefundedByBucketId.get(bucket._id) ?? 0n)
      : 0n;
    return {
      bucketId: bucket._id,
      assignedMinor,
      activityMinor,
      availableEndMinor: available(carryInMinor, assignedMinor, activityMinor) + moneyBoxPrefundedMinor,
      carryInMinor,
      moneyBoxPrefundedMinor,
    };
  });

  const coveredByCardAccount = new Map<Id<'financialAccounts'>, bigint>();
  const coveredByBucket = new Map<Id<'planBuckets'>, bigint>();
  const coveredCardPurchaseMinorByTransactionId = new Map<Id<'transactions'>, bigint>();
  // Sorted, not in `plan.accountIds` order: that array is rewritten from whatever order the accounts
  // sheet posted, so which card counted as covered used to depend on how the form was submitted.
  const cardAccountOrder = plan.accountIds.filter((accountId) => cardAccountIds.has(accountId)).sort();
  for (const entry of baseEntries) {
    const spendByCard = cardSpendByBucket.get(entry.bucketId);
    if (!spendByCard) continue;
    let remainingAvailable =
      entry.carryInMinor +
      entry.assignedMinor +
      entry.activityMinor +
      entry.moneyBoxPrefundedMinor +
      [...spendByCard.values()].reduce((total, spendMinor) => total + spendMinor, 0n);
    for (const cardAccountId of cardAccountOrder) {
      const spendMinor = spendByCard.get(cardAccountId) ?? 0n;
      const availableToCover = remainingAvailable > 0n ? remainingAvailable : 0n;
      const coveredMinor = spendMinor < availableToCover ? spendMinor : availableToCover;
      if (coveredMinor <= 0n) continue;
      coveredByCardAccount.set(cardAccountId, (coveredByCardAccount.get(cardAccountId) ?? 0n) + coveredMinor);
      coveredByBucket.set(entry.bucketId, (coveredByBucket.get(entry.bucketId) ?? 0n) + coveredMinor);
      let remainingCoveredMinor = coveredMinor;
      for (const purchase of cardPurchasesByBucket.get(entry.bucketId)?.get(cardAccountId) ?? []) {
        if (remainingCoveredMinor <= 0n) break;
        const purchaseMinor = -signedActivityMinor(purchase);
        const purchaseCoveredMinor = purchaseMinor < remainingCoveredMinor ? purchaseMinor : remainingCoveredMinor;
        if (purchaseCoveredMinor <= 0n) continue;
        coveredCardPurchaseMinorByTransactionId.set(purchase._id, purchaseCoveredMinor);
        remainingCoveredMinor -= purchaseCoveredMinor;
      }
      remainingAvailable -= coveredMinor;
    }
  }

  const cardAccountIdByBucketId = new Map(
    rows.buckets.flatMap((bucket) => (bucket.cardAccountId ? [[bucket._id, bucket.cardAccountId] as const] : [])),
  );
  const entries = baseEntries.map((entry) => {
    const cardAccountId = cardAccountIdByBucketId.get(entry.bucketId);
    const coveredCardSpendMinor = cardAccountId ? (coveredByCardAccount.get(cardAccountId) ?? 0n) : 0n;
    // The share of this bucket's overspending that was put on a card rather than paid with cash.
    // Shown on the row, deliberately not in the Ready to Assign panel: there it would be the very
    // euros already reported as uncovered card spending, with the sign turned round.
    const bucketCardSpendMinor = [...(cardSpendByBucket.get(entry.bucketId)?.values() ?? [])].reduce(
      (total, spendMinor) => total + spendMinor,
      0n,
    );
    return {
      ...entry,
      coveredCardSpendMinor,
      creditOverspendMinor: bucketCardSpendMinor - (coveredByBucket.get(entry.bucketId) ?? 0n),
      availableEndMinor: entry.availableEndMinor + coveredCardSpendMinor,
    };
  });

  const assignedMinor = entries.reduce((total, entry) => total + entry.assignedMinor, 0n);
  const bucketActivityMinor = entries.reduce((total, entry) => total + entry.activityMinor, 0n);
  const coveredCardSpendMinor = entries.reduce((total, entry) => total + entry.coveredCardSpendMinor, 0n);
  const liquidityChangeMinor = monthLiquidityMinor - previousLiquidityMinor;
  // What the card lent this month and nothing has set aside for yet. Net of refunds, and net of the
  // part already moved into the card's payment bucket, which is money the plan has accounted for.
  const uncoveredCardSpendMinor = -cardChargedActivityMinor - coveredCardSpendMinor;
  // Covered card spending offsets the purchase activity inside bucket availability. Keep it in the
  // reconciliation so any movement the model cannot attribute remains visible instead of becoming income.
  const unexplainedMinor =
    liquidityChangeMinor -
    beforePlanStartMinor -
    incomeMinor -
    liquidityFromCardMinor -
    uncoveredCardSpendMinor -
    bucketActivityMinor -
    coveredCardSpendMinor -
    internalMinor -
    transferNetMinor;
  // This month's, not last month's. Ready to Assign stopped crediting overspending back, so the
  // penalty now lands in the month that caused it and the panel adds up again:
  // readyToAssign(n) = readyToAssign(n-1) + income + liquidityFromCard + uncoveredCardSpend
  //                    + beforePlanStart + unexplained + internal + transfers - assigned
  //                    + overspending(n).
  const cashOverspendingMinor = cashOverspending(entries.map((entry) => entry.availableEndMinor));
  const readyToAssignMinor = readyToAssign(
    monthLiquidityMinor,
    entries.map((entry) => entry.availableEndMinor),
  );
  const readyToAssignWithoutMoneyBoxReserve =
    previousReadyToAssignMinor +
    beforePlanStartMinor +
    incomeMinor +
    liquidityFromCardMinor +
    uncoveredCardSpendMinor +
    unexplainedMinor +
    internalMinor +
    transferNetMinor -
    assignedMinor +
    cashOverspendingMinor;
  // Signed reconciliation adjustment, not liquidity movement: negative when newly reserved stock
  // lowers Ready to Assign, zero when an unchanged stock is refreshed in the following month.
  const moneyBoxReserveMinor = readyToAssignMinor - readyToAssignWithoutMoneyBoxReserve;

  return {
    period,
    entries,
    readyToAssignMinor,
    liquidityMinor: monthLiquidityMinor,
    overdraftProgressMinor: overdraftProgressMinor(previousLiquidityMinor, monthLiquidityMinor),
    cashOverspendingMinor,
    coveredCardPurchaseMinorByTransactionId,
    installmentPaymentDueDateByPlanId: installmentPayments.dueDateByPlanId,
    breakdown: {
      carryFromPreviousMonthMinor: previousReadyToAssignMinor,
      bucketActivityMinor,
      internalMinor,
      transferNetMinor,
      incomeMinor,
      liquidityFromCardMinor,
      uncoveredCardSpendMinor,
      beforePlanStartMinor,
      unexplainedMinor,
      moneyBoxReserveMinor,
      assignedMinor,
      cashOverspendingMinor,
    },
    truncated: monthTransactions.truncated,
  };
}

async function findSeedSnapshot(ctx: ReadCtx, planId: Id<'plans'>, period: string) {
  const newestStablePeriod = newestStableSnapshotPeriod();
  let candidatePeriod = addMonths(period, -1);
  for (let step = 0; step < MAX_CARRY_MONTHS; step += 1) {
    if (candidatePeriod <= newestStablePeriod) {
      const snapshot = await ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId).eq('period', candidatePeriod))
        .unique();
      if (snapshot) return snapshot;
    }
    candidatePeriod = addMonths(candidatePeriod, -1);
  }
  return null;
}

async function computeThroughPeriod(ctx: ReadCtx, plan: Doc<'plans'>, rows: PlanRows, period: string) {
  const [seedSnapshot, currentLiquidity, cardAccountIdBySettlementTransactionId, installmentContext, moneyBoxContext] =
    await Promise.all([
      findSeedSnapshot(ctx, plan._id, period),
      loadCurrentLiquidity(ctx, plan),
      cardStatementSettlementCardAccountIds(ctx, plan.userId),
      loadInstallmentPlanContext(ctx, plan, rows),
      loadMoneyBoxContext(ctx, plan, rows),
    ]);
  const excludedMovementTransactionIds = currentLiquidity.moneyBoxTransactionIds;
  const liquidity: LiquidityContext = {
    currentMinor: currentLiquidity.minor,
    currentPeriod: currentPeriod(),
    cardAccountIds: currentLiquidity.cardAccountIds,
    excludedMovementTransactionIds,
    transactionsByPeriod: new Map(),
    inPlanCashTransfersByPeriod: new Map(),
    valuesByPeriod: new Map(),
  };

  let startPeriod: string;
  let previousAvailable: CarryState;
  let previousPeriod: string;
  if (seedSnapshot) {
    startPeriod = addMonths(seedSnapshot.period, 1);
    previousPeriod = seedSnapshot.period;
    previousAvailable = new Map(seedSnapshot.entries.map((entry) => [entry.bucketId, entry.availableEndMinor]));
  } else {
    startPeriod = laterPeriod(plan.startPeriod, addMonths(period, -(MAX_CARRY_MONTHS - 1)));
    previousPeriod = addMonths(startPeriod, -1);
    previousAvailable = new Map();
  }

  let previousLiquidity = await liquidityAtEndOfPeriod(ctx, plan, previousPeriod, liquidity);
  let previousReadyToAssignMinor = readyToAssign(previousLiquidity.minor, previousAvailable.values());
  let result: ComputedMonth | null = null;
  let truncated = (!seedSnapshot && startPeriod > plan.startPeriod) || previousLiquidity.truncated;
  let cursor = startPeriod;
  let walked = 0;
  while (cursor <= period && walked < MAX_CARRY_MONTHS) {
    const monthLiquidity = await liquidityAtEndOfPeriod(ctx, plan, cursor, liquidity);
    result = await computeMonth(
      ctx,
      plan,
      rows,
      cursor,
      previousAvailable,
      previousReadyToAssignMinor,
      previousLiquidity.minor,
      monthLiquidity.minor,
      currentLiquidity.cardAccountIds,
      cardAccountIdBySettlementTransactionId,
      installmentContext,
      moneyBoxContext,
      excludedMovementTransactionIds,
      liquidity.transactionsByPeriod,
      liquidity.inPlanCashTransfersByPeriod,
    );
    truncated ||= result.truncated || monthLiquidity.truncated;
    previousAvailable = new Map(
      result.entries.map((entry) => [entry.bucketId, entry.availableEndMinor - entry.moneyBoxPrefundedMinor]),
    );
    previousReadyToAssignMinor = result.readyToAssignMinor;
    previousLiquidity = monthLiquidity;
    cursor = addMonths(cursor, 1);
    walked += 1;
  }
  if (!result || result.period !== period) throw new ConvexError('Period precedes plan start');
  const overdraft: OverdraftSummary | null = currentLiquidity.overdraft
    ? {
        ...currentLiquidity.overdraft,
        progressMinor: result.overdraftProgressMinor,
        targetDate: plan.overdraftTargetDate ?? null,
        monthlyStepMinor: plan.overdraftTargetDate
          ? overdraftMonthlyStepMinor(currentLiquidity.overdraft.amountMinor, currentPeriod(), plan.overdraftTargetDate)
          : null,
      }
    : null;
  return {
    ...result,
    truncated,
    currentCardAccounts: currentLiquidity.cardAccounts,
    overdraft,
    installmentPlansById: installmentContext.planById,
    installmentOutstandingMinorByLinkedAccountId: installmentContext.outstandingMinorByLinkedAccountId,
    moneyBoxByBucketId: moneyBoxContext.moneyBoxByBucketId,
  };
}

export async function computePlanMonthState(ctx: ReadCtx, plan: Doc<'plans'>, period: string) {
  const rows = await loadPlanRows(ctx, plan);
  const month = await computeThroughPeriod(ctx, plan, rows, period);
  const cardPaymentDueDates = await loadCardPaymentDueDates(
    ctx,
    plan,
    new Set(rows.buckets.flatMap((bucket) => (bucket.cardAccountId ? [bucket.cardAccountId] : []))),
  );
  const targetByBucket = new Map(rows.targets.map((target) => [target.bucketId, target]));
  const bucketById = new Map(rows.buckets.map((bucket) => [bucket._id, bucket]));
  const currentCardBalanceByAccountId = new Map(
    month.currentCardAccounts.map((account) => [account.accountId, account.balanceMinor]),
  );
  const bucketStates = month.entries.map((entry) => {
    const bucket = bucketById.get(entry.bucketId);
    if (!bucket) throw new ConvexError('Plan bucket computation failed');
    const target = targetByBucket.get(entry.bucketId) ?? null;
    const bookedBalanceMinor = bucket.cardAccountId
      ? (currentCardBalanceByAccountId.get(bucket.cardAccountId) ?? 0n)
      : 0n;
    // The debt is a stock, and the only one we can observe is today's: a past month had a different
    // balance, so claiming this one there would be a lie. From this month on it stands until it is
    // paid — the statement is charged next month, and a future month that reported nothing needed
    // would call the card funded in exactly the month the money leaves. What is already set aside
    // carries forward, so funding it once settles every month after it too.
    const cardDebtMinor =
      bucket.cardAccountId && period >= currentPeriod() && bookedBalanceMinor < 0n ? -bookedBalanceMinor : 0n;
    const installmentOutstandingMinor = bucket.cardAccountId
      ? (month.installmentOutstandingMinorByLinkedAccountId.get(bucket.cardAccountId) ?? 0n)
      : 0n;
    const installmentCoveredDebtMinor =
      installmentOutstandingMinor < cardDebtMinor ? installmentOutstandingMinor : cardDebtMinor;
    const derivedCardNeededMinor = cardDebtMinor - installmentCoveredDebtMinor;
    const installmentPlan = bucket.installmentPlanId
      ? month.installmentPlansById.get(bucket.installmentPlanId)
      : undefined;
    const installmentScheduleItem = installmentPlan ? installmentScheduleItemForPeriod(installmentPlan, period) : null;
    const installmentDueDate = bucket.installmentPlanId
      ? (installmentScheduleItem?.dueDate ?? month.installmentPaymentDueDateByPlanId.get(bucket.installmentPlanId))
      : undefined;
    const installmentNeededMinor =
      installmentPlan &&
      installmentDueDate &&
      installmentPlan.status === 'active' &&
      installmentDueDate.slice(0, 7) === period &&
      period <= installmentPlan.endDate.slice(0, 7)
        ? installmentPlan.monthlyPaymentAmount.amountMinor
        : 0n;
    const neededMinor = target
      ? targetNeededMinor(target, period, entry.carryInMinor)
      : bucket.cardAccountId
        ? derivedCardNeededMinor
        : bucket.installmentPlanId
          ? installmentNeededMinor
          : 0n;
    const installmentFundingMinor = entry.carryInMinor + entry.assignedMinor;
    const underfundedMinor = target
      ? targetUnderfundedMinor({
          target,
          period,
          carryInMinor: entry.carryInMinor,
          assignedMinor: entry.assignedMinor,
          prefundedMinor: entry.moneyBoxPrefundedMinor,
        })
      : bucket.cardAccountId
        ? neededMinor > entry.availableEndMinor
          ? neededMinor - entry.availableEndMinor
          : 0n
        : bucket.installmentPlanId
          ? neededMinor > installmentFundingMinor
            ? neededMinor - installmentFundingMinor
            : 0n
          : 0n;
    return {
      ...entry,
      cardDebtMinor,
      installmentCoveredDebtMinor,
      dueDate: bucket.cardAccountId ? cardPaymentDueDates.get(bucket.cardAccountId) : installmentDueDate,
      target,
      neededMinor,
      underfundedMinor,
      snoozed: target ? targetIsSnoozed(target, period) : false,
      status: planTargetStatus({
        target,
        neededMinor,
        underfundedMinor,
        assignedMinor: entry.assignedMinor + entry.moneyBoxPrefundedMinor,
        availableMinor: entry.availableEndMinor,
      }),
    };
  });
  return { rows, month, bucketStates };
}

async function planAccountSummaries(ctx: QueryCtx, plan: Doc<'plans'>) {
  if (plan.accountIds.length > MAX_PLAN_ACCOUNTS) throw new ConvexError('Too many plan accounts to read');
  const accounts = await Promise.all(plan.accountIds.map((accountId) => ctx.db.get('financialAccounts', accountId)));
  return accounts.map((account) => {
    if (!account || account.userId !== plan.userId) throw new ConvexError('Plan account not found');
    return {
      id: account._id,
      name: account.name,
      alias: account.alias,
      institutionName: account.institutionName,
      ibanMasked: account.ibanMasked,
      accountType: account.accountType,
      currency: account.currency,
      status: account.status,
    };
  });
}

export async function activePlanForUser(ctx: ReadCtx, userId: string) {
  const plans = assertBounded(
    await ctx.db
      .query('plans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(MAX_PLAN_ROWS + 1),
    'plans',
  );
  return plans.find((candidate) => candidate.isDefault) ?? plans.at(0) ?? null;
}

async function requirePlanForUser(ctx: QueryCtx, userId: string, planId?: Id<'plans'>) {
  if (planId) {
    const plan = await ctx.db.get('plans', planId);
    if (!plan || plan.userId !== userId) throw new ConvexError('Plan not found');
    return plan;
  }

  const plan = await activePlanForUser(ctx, userId);
  if (!plan) throw new ConvexError('Plan not found');
  return plan;
}

export const listPlans = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const plans = assertBounded(
      await ctx.db
        .query('plans')
        .withIndex('by_userId', (q) => q.eq('userId', user.id))
        .take(MAX_PLAN_ROWS + 1),
      'plans',
    );
    return plans
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      .map((plan) => ({
        id: plan._id,
        name: plan.name,
        currency: plan.currency,
        startPeriod: plan.startPeriod,
        startDate: plan.startDate ?? null,
        isDefault: plan.isDefault,
      }));
  },
});

export const getActivePlan = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const plan = await activePlanForUser(ctx, user.id);
    if (!plan) return null;
    return {
      id: plan._id,
      name: plan.name,
      currency: plan.currency,
      startPeriod: plan.startPeriod,
      startDate: plan.startDate ?? null,
      accounts: await planAccountSummaries(ctx, plan),
    };
  },
});

export const getPlanMonth = query({
  args: { planId: v.optional(v.id('plans')), period: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const period = args.period ?? currentPeriod();
    assertPeriod(period);
    const plan = await requirePlanForUser(ctx, user.id, args.planId);
    const { rows, month, bucketStates } = await computePlanMonthState(ctx, plan, period);
    const entryByBucket = new Map(bucketStates.map((entry) => [entry.bucketId, entry]));
    const categoryIdsByBucket = new Map<Id<'planBuckets'>, Array<Id<'categories'>>>();
    const mappedCategoryIds = new Set<Id<'categories'>>();
    for (const mapping of rows.mappings) {
      mappedCategoryIds.add(mapping.categoryId);
      const categoryIds = categoryIdsByBucket.get(mapping.bucketId) ?? [];
      categoryIds.push(mapping.categoryId);
      categoryIdsByBucket.set(mapping.bucketId, categoryIds);
    }
    const unplannedCategoryIds = new Set(categoryIdsByBucket.get(rows.unplanned._id) ?? []);
    for (const category of rows.categories) {
      if (!mappedCategoryIds.has(category._id)) unplannedCategoryIds.add(category._id);
    }

    // Only the rows the reconciliation generates are system rows; a paired category stays the user's.
    const installmentsGroupIds = new Set(
      rows.groups.filter((group) => group.name === INSTALLMENTS_GROUP_NAME).map((group) => group._id),
    );
    const generatedInstallmentBucketIds = new Set(
      rows.buckets
        .filter((bucket) => bucket.installmentPlanId !== undefined && installmentsGroupIds.has(bucket.groupId))
        .map((bucket) => bucket._id),
    );

    const bucketResult = (bucket: Doc<'planBuckets'>) => {
      const entry = entryByBucket.get(bucket._id);
      if (!entry) throw new ConvexError('Plan bucket computation failed');
      return {
        bucketId: bucket._id,
        name: bucket.name,
        // Hidden rows stay in the payload: their money is still part of the plan's totals and of
        // Ready to Assign, so hiding is a view concern, not an accounting one.
        hidden: bucket.hidden,
        cardAccountId: bucket.cardAccountId ?? null,
        installmentPlanId: bucket.installmentPlanId ?? null,
        moneyBoxId: bucket.moneyBoxId ?? null,
        moneyBoxName: bucket.moneyBoxId ? (month.moneyBoxByBucketId.get(bucket._id)?.name ?? null) : null,
        categoryIds:
          // A generated instalment row has no categories to show. A category the user paired to a loan
          // keeps the ones it had, and they still decide what lands in it.
          bucket.cardAccountId || generatedInstallmentBucketIds.has(bucket._id)
            ? []
            : bucket._id === rows.unplanned._id
              ? [...unplannedCategoryIds]
              : (categoryIdsByBucket.get(bucket._id) ?? []),
        assignedMinor: entry.assignedMinor,
        activityMinor: entry.activityMinor,
        coveredCardSpendMinor: entry.coveredCardSpendMinor,
        creditOverspendMinor: entry.creditOverspendMinor,
        availableMinor: entry.availableEndMinor,
        carryInMinor: entry.carryInMinor,
        moneyBoxPrefundedMinor: entry.moneyBoxPrefundedMinor,
        cardDebtMinor: entry.cardDebtMinor,
        installmentCoveredDebtMinor: entry.installmentCoveredDebtMinor,
        dueDate: entry.dueDate,
        target: entry.target
          ? {
              id: entry.target._id,
              cadence: entry.target.cadence,
              behaviour: entry.target.behaviour,
              amountMinor: entry.target.amountMinor,
              currency: entry.target.currency,
              dueDate: entry.target.dueDate,
              dayOfMonth: entry.target.dayOfMonth,
              dayOfWeek: entry.target.dayOfWeek,
              repeats: entry.target.repeats,
              ...(entry.target.repeatIntervalCount === undefined
                ? {}
                : { repeatIntervalCount: entry.target.repeatIntervalCount }),
              ...(entry.target.repeatIntervalUnit === undefined
                ? {}
                : { repeatIntervalUnit: entry.target.repeatIntervalUnit }),
            }
          : null,
        neededMinor: entry.neededMinor,
        underfundedMinor: entry.underfundedMinor,
        snoozed: entry.snoozed,
        status: entry.status,
      };
    };

    const normalBuckets = rows.buckets.filter((bucket) => !bucket.isUnplanned);
    const groups = rows.groups.map((group) => ({
      groupId: group._id,
      name: group.name,
      hidden: group.hidden,
      buckets: normalBuckets
        .filter((bucket) => bucket.groupId === group._id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(bucketResult),
    }));
    const totals = bucketStates.reduce(
      (result, entry) => ({
        assignedMinor: result.assignedMinor + entry.assignedMinor,
        activityMinor: result.activityMinor + entry.activityMinor,
        availableMinor: result.availableMinor + entry.availableEndMinor,
        underfundedMinor: result.underfundedMinor + entry.underfundedMinor,
        targetsMinor: result.targetsMinor + (entry.target ? entry.neededMinor : 0n),
      }),
      { assignedMinor: 0n, activityMinor: 0n, availableMinor: 0n, underfundedMinor: 0n, targetsMinor: 0n },
    );

    return {
      plan: {
        id: plan._id,
        name: plan.name,
        currency: plan.currency,
        expectedIncomeMinor: plan.expectedIncomeMinor ?? null,
      },
      period,
      readyToAssignMinor: month.readyToAssignMinor,
      // Exposed so the header can name the real situation: negative liquidity means the plan's
      // accounts are overdrawn, which is not the same problem as having assigned too much.
      liquidityMinor: month.liquidityMinor,
      overdraft: month.overdraft,
      breakdown: month.breakdown,
      totals,
      groups,
      unplanned: bucketResult(rows.unplanned),
      truncated: month.truncated,
    };
  },
});

export const listPlanBucketTransactions = query({
  args: {
    planId: v.id('plans'),
    bucketId: v.id('planBuckets'),
    period: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    assertPeriod(args.period);
    const plan = await requirePlanForUser(ctx, user.id, args.planId);
    const rows = await loadPlanRows(ctx, plan);
    const bucket = rows.buckets.find((candidate) => candidate._id === args.bucketId);
    if (!bucket) throw new ConvexError('Plan bucket not found');
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 200), 200));
    const transactionRows = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_status_and_bookingDate', (q) =>
        q
          .eq('userId', user.id)
          .eq('status', 'BOOK')
          .gte('bookingDate', periodStartDate(args.period))
          .lt('bookingDate', periodEndDate(args.period)),
      )
      .order('desc')
      .take(MAX_MONTH_TRANSACTIONS + 1);
    const sourceTruncated = transactionRows.length > MAX_MONTH_TRANSACTIONS;
    const monthTransactions = transactionRows.slice(0, MAX_MONTH_TRANSACTIONS);
    const bucketIds = new Set(rows.buckets.map((candidate) => candidate._id));
    const mappingByCategory = new Map(rows.mappings.map((mapping) => [mapping.categoryId, mapping.bucketId]));
    const planAccountIds = new Set(plan.accountIds);
    const accounts = await planAccountSummaries(ctx, plan);
    const planCardAccountIds = new Set(
      accounts.filter((account) => account.accountType?.toUpperCase() === 'CARD').map((account) => account.id),
    );
    const inPlanCashTransfers = await resolveInPlanCashTransfers(ctx, plan, monthTransactions, planCardAccountIds);
    const installmentContext = await loadInstallmentPlanContext(ctx, plan, rows);
    const [cardAccountIdBySettlementTransactionId, moneyBoxAdjustment, installmentPayments, computedCardMonth] =
      await Promise.all([
        bucket.cardAccountId ? cardStatementSettlementCardAccountIds(ctx, plan.userId) : Promise.resolve(null),
        loadMoneyBoxLiquidityAdjustment(ctx, plan),
        loadInstallmentPaymentsForPeriod(ctx, plan, installmentContext, args.period),
        bucket.cardAccountId ? computeThroughPeriod(ctx, plan, rows, args.period) : Promise.resolve(null),
      ]);
    const coveredPurchaseMinorByTransactionId =
      computedCardMonth?.coveredCardPurchaseMinorByTransactionId ?? new Map<Id<'transactions'>, bigint>();
    const matches = monthTransactions.filter((transaction) => {
      if (
        !planAccountIds.has(transaction.accountId) ||
        moneyBoxAdjustment.transactionIds.has(transaction._id) ||
        (plan.startDate !== undefined && transaction.bookingDate < plan.startDate)
      ) {
        return false;
      }
      const transferActivityMinor = inPlanCashTransfers.activityMinorByTransactionId.get(transaction._id);
      if (transferActivityMinor !== undefined) {
        return transferActivityMinor !== 0n && bucket._id === rows.unplanned._id;
      }
      if (bucket.installmentPlanId) {
        if (installmentPayments.bucketIdsByTransactionId.get(transaction._id)?.has(bucket._id) === true) {
          return true;
        }
        // A generated row has no mappings, so this adds nothing there. A category the user paired to a
        // loan keeps them, and its month total already counts them: leaving them out of the list would
        // show a figure whose rows are missing.
        if (!isPlanActivityEligible(transaction, { currency: plan.currency })) return false;
        return transaction.categoryId ? mappingByCategory.get(transaction.categoryId) === bucket._id : false;
      }
      if (bucket.cardAccountId) {
        return (
          (transaction.accountId === bucket.cardAccountId &&
            (coveredPurchaseMinorByTransactionId.has(transaction._id) ||
              (transaction.amount.currency === plan.currency &&
                transaction.direction === 'CRDT' &&
                (transaction.classificationKind === 'transfer' || transaction.classificationKind === 'internal')))) ||
          (!transaction.transferMatchId &&
            cardAccountIdBySettlementTransactionId?.get(transaction._id) === bucket.cardAccountId)
        );
      }
      if (!isPlanActivityEligible(transaction, { currency: plan.currency })) return false;
      const mappedBucketId = transaction.categoryId ? mappingByCategory.get(transaction.categoryId) : undefined;
      const transactionBucketId = mappedBucketId && bucketIds.has(mappedBucketId) ? mappedBucketId : rows.unplanned._id;
      return transactionBucketId === bucket._id;
    });

    const activityRows = matches.map((transaction) => {
      const coveredPurchaseMinor = coveredPurchaseMinorByTransactionId.get(transaction._id);
      const transferActivityMinor = inPlanCashTransfers.activityMinorByTransactionId.get(transaction._id);
      // The covered purchase is a derived inflow to the payment bucket. The original card debit
      // remains activity of its spending category, so expose only the allocated share and give it
      // the opposite direction here.
      const kind = bucket.cardAccountId
        ? coveredPurchaseMinor === undefined
          ? ('payment' as const)
          : ('coveredPurchase' as const)
        : ('activity' as const);
      // The bank debit covers every plan of the facility, so showing its full amount here would
      // contradict the row it was opened from. This bucket only owns its own instalment.
      const instalmentShareMinor = bucket.installmentPlanId
        ? installmentPayments.paidMinorByTransactionAndBucket.get(`${transaction._id}|${bucket._id}`)
        : undefined;
      return {
        _id: transaction._id,
        accountId: transaction.accountId,
        categoryId: transaction.categoryId,
        bookingDate: transaction.bookingDate,
        description: transaction.description,
        counterpartyName: transaction.counterpartyName,
        kind,
        direction:
          transferActivityMinor !== undefined
            ? transferActivityMinor < 0n
              ? ('DBIT' as const)
              : ('CRDT' as const)
            : coveredPurchaseMinor !== undefined
              ? ('CRDT' as const)
              : bucket.cardAccountId || bucket.installmentPlanId
                ? ('DBIT' as const)
                : transaction.direction,
        amount:
          transferActivityMinor !== undefined
            ? {
                amountMinor: transferActivityMinor < 0n ? -transferActivityMinor : transferActivityMinor,
                currency: plan.currency,
              }
            : coveredPurchaseMinor !== undefined
              ? { amountMinor: coveredPurchaseMinor, currency: plan.currency }
              : instalmentShareMinor === undefined
                ? transaction.amount
                : { amountMinor: instalmentShareMinor, currency: transaction.amount.currency },
      };
    });

    return {
      rows: activityRows.slice(0, limit),
      totalMinor: activityRows.reduce((total, row) => total + signedActivityMinor(row), 0n),
      truncated: sourceTruncated || computedCardMonth?.truncated === true || matches.length > limit,
    };
  },
});

export const listPlanOutOfPlanTransactions = query({
  args: {
    planId: v.id('plans'),
    period: v.string(),
    kind: v.union(v.literal('internal'), v.literal('transfer')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    assertPeriod(args.period);
    const plan = await requirePlanForUser(ctx, user.id, args.planId);
    const rows = await loadPlanRows(ctx, plan);
    const accounts = await planAccountSummaries(ctx, plan);
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 200), 200));
    const transactionRows = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_status_and_bookingDate', (q) =>
        q
          .eq('userId', plan.userId)
          .eq('status', 'BOOK')
          .gte('bookingDate', periodStartDate(args.period))
          .lt('bookingDate', periodEndDate(args.period)),
      )
      .order('desc')
      .take(MAX_MONTH_TRANSACTIONS + 1);
    const sourceTruncated = transactionRows.length > MAX_MONTH_TRANSACTIONS;
    const monthTransactions = transactionRows.slice(0, MAX_MONTH_TRANSACTIONS);
    // These rows have to add up to the figure the user clicked, so they apply exactly the exclusions
    // `computeMonth` applies to `internalMinor` and `transferNetMinor`: card accounts left the plan's
    // cash side, and a statement payment is the card bucket's activity rather than money out of plan.
    const isCardAccount = (accountId: Id<'financialAccounts'>) =>
      accountById.get(accountId)?.accountType?.toUpperCase() === 'CARD';
    const planCardAccountIdSet = new Set(accounts.filter((account) => isCardAccount(account.id)).map((a) => a.id));
    // Same resolution as `computeMonth`, counterpart included: a payment whose legs straddle a month
    // boundary must drop out of this list too, or the rows stop summing to the figure clicked.
    const cardTransferMatchIds = await cardTransferMatchIdsForMonth(ctx, monthTransactions, planCardAccountIdSet);
    const inPlanCashTransfers = await resolveInPlanCashTransfers(ctx, plan, monthTransactions, planCardAccountIdSet);
    const candidates = monthTransactions.filter(
      (transaction) =>
        accountById.has(transaction.accountId) &&
        !(plan.startDate !== undefined && transaction.bookingDate < plan.startDate) &&
        !isCardAccount(transaction.accountId) &&
        !(transaction.transferMatchId && cardTransferMatchIds.has(transaction.transferMatchId)) &&
        !(transaction.transferMatchId && inPlanCashTransfers.matchIds.has(transaction.transferMatchId)) &&
        transaction.amount.currency === plan.currency &&
        transaction.classificationKind === args.kind,
    );
    const installmentContext = await loadInstallmentPlanContext(ctx, plan, rows);
    const [moneyBoxAdjustment, cardAccountIdBySettlementTransactionId, installmentPayments] = await Promise.all([
      loadMoneyBoxLiquidityAdjustment(ctx, plan),
      cardStatementSettlementCardAccountIds(ctx, plan.userId),
      loadInstallmentPaymentsForPeriod(ctx, plan, installmentContext, args.period),
    ]);
    const matches = candidates.filter((transaction) => {
      if (moneyBoxAdjustment.transactionIds.has(transaction._id)) return false;
      if (installmentPayments.bucketIdsByTransactionId.has(transaction._id)) return false;
      const settlementCardAccountId = cardAccountIdBySettlementTransactionId.get(transaction._id);
      return !(settlementCardAccountId && planCardAccountIdSet.has(settlementCardAccountId));
    });

    return {
      rows: matches.slice(0, limit).map((transaction) => {
        const account = accountById.get(transaction.accountId);
        if (!account) throw new ConvexError('Plan account not found');
        return {
          _id: transaction._id,
          accountId: account.id,
          name: account.name,
          alias: account.alias,
          institutionName: account.institutionName,
          ibanMasked: account.ibanMasked,
          bookingDate: transaction.bookingDate,
          description: transaction.description,
          counterpartyName: transaction.counterpartyName,
          direction: transaction.direction,
          amount: transaction.amount,
          signedAmount: {
            amountMinor: signedActivityMinor(transaction),
            currency: transaction.amount.currency,
          },
        };
      }),
      truncated: sourceTruncated || matches.length > limit,
    };
  },
});

async function deleteUnstableSnapshots(ctx: MutationCtx, planId: Id<'plans'>, newestStablePeriod: string) {
  const snapshots = assertBounded(
    await ctx.db
      .query('planMonthSnapshots')
      .withIndex('by_planId_and_period', (q) => q.eq('planId', planId).gt('period', newestStablePeriod))
      .take(MAX_PLAN_ROWS + 1),
    'unstable plan snapshots',
  );
  await Promise.all(snapshots.map((snapshot) => ctx.db.delete('planMonthSnapshots', snapshot._id)));
}

export const recomputePlanSnapshots = internalMutation({
  args: { planId: v.id('plans'), fromPeriod: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    assertPeriod(args.fromPeriod);
    const plan = await ctx.db.get('plans', args.planId);
    if (!plan) return null;
    if (await isAccountDeletionStarted(ctx, plan.userId)) return null;
    const throughPeriod = newestStableSnapshotPeriod();
    await deleteUnstableSnapshots(ctx, plan._id, throughPeriod);
    if (args.fromPeriod > throughPeriod) return null;
    const requestedLimit = Math.floor(args.limit ?? DEFAULT_SNAPSHOT_BATCH_SIZE);
    const limit = Math.max(1, Math.min(requestedLimit, MAX_SNAPSHOT_BATCH_SIZE));
    const rows = await loadPlanRows(ctx, plan);
    let period = laterPeriod(plan.startPeriod, args.fromPeriod);
    let processed = 0;
    let truncated = false;

    while (period <= throughPeriod && processed < limit) {
      const month = await computeThroughPeriod(ctx, plan, rows, period);
      truncated ||= month.truncated;
      if (!month.truncated) {
        const existing = await ctx.db
          .query('planMonthSnapshots')
          .withIndex('by_planId_and_period', (q) => q.eq('planId', plan._id).eq('period', period))
          .unique();
        const snapshot = {
          entries: month.entries.map(({ bucketId, assignedMinor, activityMinor, availableEndMinor }) => ({
            bucketId,
            assignedMinor,
            activityMinor,
            availableEndMinor,
          })),
          computedAtMs: Date.now(),
        };
        if (existing) {
          await ctx.db.patch('planMonthSnapshots', existing._id, snapshot);
        } else {
          await ctx.db.insert('planMonthSnapshots', {
            planId: plan._id,
            userId: plan.userId,
            period,
            ...snapshot,
          });
        }
      }
      period = addMonths(period, 1);
      processed += 1;
    }

    if (period <= throughPeriod) {
      await ctx.scheduler.runAfter(0, internal.banking.planRead.recomputePlanSnapshots, {
        planId: plan._id,
        fromPeriod: period,
        limit,
      });
    }
    return { period: addMonths(period, -1), truncated };
  },
});

export const recalculatePlan = mutation({
  args: { planId: v.id('plans') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await ctx.db.get('plans', args.planId);
    if (!plan || plan.userId !== user.id) throw new ConvexError('Plan not found');
    // Drop the deprecated opening carry left on plans created before liquidity was anchored to
    // balances, so the optional field can eventually leave the schema.
    if (plan.openingCarryMinor !== undefined) {
      await ctx.db.patch('plans', plan._id, { openingCarryMinor: undefined });
    }
    await ctx.scheduler.runAfter(0, internal.banking.planRead.recomputePlanSnapshots, {
      planId: plan._id,
      fromPeriod: plan.startPeriod,
    });
    return plan._id;
  },
});
