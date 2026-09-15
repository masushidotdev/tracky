import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { absoluteMinorUnits } from '../lib/money';
import {
  bankProviderValidator,
  creditFacilityRepaymentTypeValidator,
  creditFacilityStatusValidator,
  creditFacilityTypeValidator,
  creditFacilityUsageCycleStatusValidator,
  isLoanFacilityType,
  moneyAmountValidator,
} from '../lib/validators';
import {
  addMonthsToIsoDate,
  buildCreditFacilitySummary,
  buildInstallmentPaymentSchedule,
  buildRemainingInstallmentRepaymentAmount,
  estimateInstallmentPaymentMinor,
} from './creditMath';
import {
  cardStatementSyntheticDedupeKey,
  cardStatementSyntheticMetadata,
  scheduleSyntheticCardStatementReconciliation,
  statementCycleMatchesPayment,
} from './cardStatementSettlement';
import { latestBookedBalance } from './balances';
import { effectiveFacilityUsedAmount, linkedCardAccountForFacility } from './overdraft';
import { validateSettlementAccount } from './creditValidation';
import { applyManualBalanceDelta, insertManualTransactionLeg } from './manualTransactions';
import { invalidateAllPlanSnapshots, invalidatePlanSnapshots } from './planSnapshotInvalidation';
import { reconcileInstallmentPlanBucketsForUser } from './planSystemBuckets';
import {
  addMonthsToCycleMonth,
  defaultUsageCycleDueDate,
  unscheduledCardUsageMinor,
  usageCycleCloseBoundary,
} from './statementCycles';
import { createConfirmedTransferMatch } from './transferCore';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type DbCtx = QueryCtx | MutationCtx;

type MoneyAmount = {
  amountMinor: bigint;
  currency: string;
};

type InstallmentPaymentSource = 'manual' | 'transaction';

export function isCardBackedCreditFacilityType(facilityType: Doc<'creditFacilities'>['facilityType']) {
  // Only explicitly card-backed types settle spending already counted by the Plan;
  // future facility types stay visible until their accounting behavior is known.
  return facilityType === 'cardCreditLine' || facilityType === 'additionalCardCreditLine';
}

const closedUsageCycleStatusValidator = v.union(v.literal('paid'), v.literal('cancelled'));

const installmentPaymentAllocationValidator = v.object({
  installmentPlanId: v.id('creditFacilityInstallmentPlans'),
  amount: moneyAmountValidator,
  scheduledDueDate: v.optional(v.string()),
  principalAmount: v.optional(moneyAmountValidator),
  interestAmount: v.optional(moneyAmountValidator),
  feeAmount: v.optional(moneyAmountValidator),
  notes: v.optional(v.string()),
});

type InstallmentPaymentAllocation = {
  installmentPlanId: Id<'creditFacilityInstallmentPlans'>;
  amount: MoneyAmount;
  scheduledDueDate?: string;
  principalAmount?: MoneyAmount;
  interestAmount?: MoneyAmount;
  feeAmount?: MoneyAmount;
  notes?: string;
};

type InstallmentCandidatePlanEntry = {
  plan: Doc<'creditFacilityInstallmentPlans'>;
  facility: Doc<'creditFacilities'>;
  expectedAmount: MoneyAmount;
  repaymentAccountIds: Set<Id<'financialAccounts'>>;
};

type InstallmentCandidateReviewStatus = 'confirmable' | 'pending' | 'review';

export async function syncInstallmentPlanBucketsAfterChange(
  ctx: MutationCtx,
  userId: string,
  affectedDates: Iterable<string | undefined> = [],
) {
  const reconciliation = await reconcileInstallmentPlanBucketsForUser(ctx, userId);
  if (reconciliation.changed) {
    await invalidateAllPlanSnapshots(ctx, userId);
  } else {
    await invalidatePlanSnapshots(ctx, userId, affectedDates);
  }
  return reconciliation;
}

function assertNonNegativeMoney(name: string, amount: { amountMinor: bigint; currency: string }) {
  if (amount.amountMinor < 0n) {
    throw new ConvexError(`${name} cannot be negative`);
  }
}

function assertPositiveMoney(name: string, amount: { amountMinor: bigint; currency: string }) {
  if (amount.amountMinor <= 0n) {
    throw new ConvexError(`${name} must be greater than zero`);
  }
}

function assertSameCurrency(
  leftName: string,
  left: { amountMinor: bigint; currency: string },
  rightName: string,
  right: { amountMinor: bigint; currency: string },
) {
  if (left.currency !== right.currency) {
    throw new ConvexError(`${leftName} currency must match ${rightName} currency`);
  }
}

function assertOptionalDayOfMonth(name: string, value: number | undefined) {
  if (value === undefined) {
    return;
  }

  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new ConvexError(`${name} must be between 1 and 31`);
  }
}

function assertOptionalPositiveInteger(name: string, value: number | undefined) {
  if (value === undefined) {
    return;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new ConvexError(`${name} must be a positive integer`);
  }
}

function assertInstallmentRange(facility: Doc<'creditFacilities'>, installmentCount: number) {
  if (!Number.isInteger(installmentCount) || installmentCount <= 0) {
    throw new ConvexError('Installment count must be a positive integer');
  }

  if (facility.minInstallmentMonths !== undefined && installmentCount < facility.minInstallmentMonths) {
    throw new ConvexError(`Installment count must be at least ${facility.minInstallmentMonths} months`);
  }

  if (facility.maxInstallmentMonths !== undefined && installmentCount > facility.maxInstallmentMonths) {
    throw new ConvexError(`Installment count cannot exceed ${facility.maxInstallmentMonths} months`);
  }
}

async function getOwnedAccount(ctx: DbCtx, userId: string, accountId: Id<'financialAccounts'>) {
  const account = await ctx.db.get('financialAccounts', accountId);
  if (!account || account.userId !== userId) {
    throw new ConvexError('Account not found');
  }
  return account;
}

export async function getOwnedFacility(ctx: DbCtx, userId: string, facilityId: Id<'creditFacilities'>) {
  const facility = await ctx.db.get('creditFacilities', facilityId);
  if (!facility || facility.userId !== userId) {
    throw new ConvexError('Credit facility not found');
  }
  return facility;
}

export async function getOwnedInstallmentPlan(
  ctx: DbCtx,
  userId: string,
  planId: Id<'creditFacilityInstallmentPlans'>,
) {
  const plan = await ctx.db.get('creditFacilityInstallmentPlans', planId);
  if (!plan || plan.userId !== userId) {
    throw new ConvexError('Installment plan not found');
  }
  return plan;
}

async function getOwnedUsageCycle(ctx: DbCtx, userId: string, cycleId: Id<'creditFacilityUsageCycles'>) {
  const cycle = await ctx.db.get('creditFacilityUsageCycles', cycleId);
  if (!cycle || cycle.userId !== userId) {
    throw new ConvexError('Credit usage cycle not found');
  }
  return cycle;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function currentCycleMonth() {
  return todayIsoDate().slice(0, 7);
}

function assertCycleMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new ConvexError('Cycle month must use YYYY-MM format');
  }
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetweenIsoDates(leftDate: string, rightDate: string) {
  const left = new Date(`${leftDate}T00:00:00.000Z`).getTime();
  const right = new Date(`${rightDate}T00:00:00.000Z`).getTime();
  return Math.round((left - right) / (24 * 60 * 60 * 1000));
}

function installmentCycleMonth(dueDate: string) {
  return dueDate.slice(0, 7);
}

function installmentFacilityCycleKey(facilityId: Id<'creditFacilities'>, dueDate: string) {
  return `${facilityId}:${installmentCycleMonth(dueDate)}`;
}

function installmentTransactionFacilityCycleKey(
  transactionId: Id<'transactions'>,
  facilityId: Id<'creditFacilities'>,
  dueDate: string,
) {
  return `${transactionId}:${installmentFacilityCycleKey(facilityId, dueDate)}`;
}

// Accounts whose debits can pay this facility back. A facility linked to a CARD
// account is repaid from its settlement account: on the card itself a DBIT is a
// purchase, never a repayment. Loans link the cash account directly, so there the
// linked account is the one being charged. With neither configured nothing can be
// checked, and any account is accepted.
export async function repaymentAccountIdsForFacility(ctx: QueryCtx, facility: Doc<'creditFacilities'>) {
  const accountIds = new Set<Id<'financialAccounts'>>();
  const linkedCardAccount = await linkedCardAccountForFacility(ctx, facility);
  if (facility.linkedAccountId && !linkedCardAccount) {
    accountIds.add(facility.linkedAccountId);
  }
  if (facility.settlementAccountId) {
    accountIds.add(facility.settlementAccountId);
  }

  return accountIds;
}

function transactionMatchesRepaymentAccounts(
  transaction: Doc<'transactions'>,
  repaymentAccountIds: Set<Id<'financialAccounts'>>,
) {
  return repaymentAccountIds.size === 0 || repaymentAccountIds.has(transaction.accountId);
}

async function assertTransactionMatchesFacilityAccount(
  ctx: QueryCtx,
  transaction: Doc<'transactions'>,
  facility: Doc<'creditFacilities'>,
) {
  if (!transactionMatchesRepaymentAccounts(transaction, await repaymentAccountIdsForFacility(ctx, facility))) {
    throw new ConvexError('Transaction account must match the credit facility repayment account');
  }
}

function expectedInstallmentPaymentAmount(plan: Doc<'creditFacilityInstallmentPlans'>): MoneyAmount {
  if (plan.remainingInstallments <= 1 && plan.outstandingAmount.amountMinor < plan.monthlyPaymentAmount.amountMinor) {
    return plan.outstandingAmount;
  }
  if (
    plan.remainingInstallments <= 1 &&
    !plan.defaultPrincipalAmount &&
    !plan.defaultInterestAmount &&
    !plan.defaultFeeAmount &&
    plan.outstandingAmount.amountMinor > plan.monthlyPaymentAmount.amountMinor
  ) {
    return plan.outstandingAmount;
  }

  return plan.monthlyPaymentAmount;
}

function expectedInstallmentPaymentBreakdown(
  plan: Doc<'creditFacilityInstallmentPlans'>,
  amount: MoneyAmount,
): {
  principalAmount?: MoneyAmount;
  interestAmount?: MoneyAmount;
  feeAmount?: MoneyAmount;
} {
  if (!plan.defaultPrincipalAmount && !plan.defaultInterestAmount && !plan.defaultFeeAmount) {
    return {};
  }

  return resolveInstallmentPaymentBreakdown({
    amount,
    principalAmount: plan.defaultPrincipalAmount,
    interestAmount: plan.defaultInterestAmount,
    feeAmount: plan.defaultFeeAmount,
  });
}

function installmentPaymentToleranceMinor(expectedAmountMinor: bigint) {
  const percentageTolerance = expectedAmountMinor / 20n;
  return percentageTolerance > 500n ? percentageTolerance : 500n;
}

function installmentCandidateConfidence(input: {
  amountDeltaMinor: bigint;
  expectedAmountMinor: bigint;
  dayDelta: number;
}) {
  if (input.amountDeltaMinor === 0n && input.dayDelta <= 3) {
    return 0.93;
  }

  if (input.amountDeltaMinor <= 100n && input.dayDelta <= 7) {
    return 0.86;
  }

  const toleranceMinor = installmentPaymentToleranceMinor(input.expectedAmountMinor);
  if (input.amountDeltaMinor <= toleranceMinor / 2n && input.dayDelta <= 14) {
    return 0.76;
  }

  return 0.64;
}

function isRepaymentLinkableTransaction(transaction: Doc<'transactions'>) {
  if (transaction.direction !== 'DBIT') {
    return false;
  }

  // Deliberately excludes SCHD: a scheduled row is the user's plan to pay, so
  // linking it as a repayment would retire an instalment nobody has paid.
  if (transaction.status !== 'BOOK' && transaction.status !== 'PDNG') {
    return false;
  }

  if (transaction.classificationKind === 'transfer' || transaction.transferMatchId) {
    return false;
  }

  return true;
}

// Automatic matching must not offer a streaming-service debit as a loan installment, so scans skip
// subscription-classified rows. An explicit user link is a different story: recurring SDD
// loan payments are routinely detected as subscriptions, and rejecting them left the user
// with no way at all to record the payment.
function isRepaymentSuggestionCandidate(transaction: Doc<'transactions'>) {
  return isRepaymentLinkableTransaction(transaction) && transaction.classificationKind !== 'subscription';
}

function assertOptionalMoneyComponent(name: string, amount: MoneyAmount | undefined, totalAmount: MoneyAmount) {
  if (!amount) {
    return;
  }

  assertNonNegativeMoney(name, amount);
  assertSameCurrency(name, amount, 'payment amount', totalAmount);
}

function resolveInstallmentPaymentBreakdown(input: {
  amount: MoneyAmount;
  principalAmount?: MoneyAmount;
  interestAmount?: MoneyAmount;
  feeAmount?: MoneyAmount;
}) {
  assertOptionalMoneyComponent('Principal amount', input.principalAmount, input.amount);
  assertOptionalMoneyComponent('Interest amount', input.interestAmount, input.amount);
  assertOptionalMoneyComponent('Fee amount', input.feeAmount, input.amount);

  const interestMinor = input.interestAmount?.amountMinor ?? 0n;
  const feeMinor = input.feeAmount?.amountMinor ?? 0n;
  const explicitPrincipalMinor = input.principalAmount?.amountMinor;
  const principalMinor = explicitPrincipalMinor ?? input.amount.amountMinor - interestMinor - feeMinor;

  if (principalMinor < 0n) {
    throw new ConvexError('Principal amount cannot be negative after interest and fee split');
  }

  if (principalMinor + interestMinor + feeMinor !== input.amount.amountMinor) {
    throw new ConvexError('Payment split must add up to the total payment amount');
  }

  return {
    principalAmount: {
      amountMinor: principalMinor,
      currency: input.amount.currency,
    },
    interestAmount: input.interestAmount,
    feeAmount: input.feeAmount,
  };
}

async function getExistingInstallmentPaymentForTransactionPlan(
  ctx: MutationCtx,
  transactionId: Id<'transactions'>,
  installmentPlanId: Id<'creditFacilityInstallmentPlans'>,
) {
  return await ctx.db
    .query('creditFacilityInstallmentPayments')
    .withIndex('by_transactionId_and_installmentPlanId', (q) =>
      q.eq('transactionId', transactionId).eq('installmentPlanId', installmentPlanId),
    )
    .first();
}

async function listInstallmentPaymentsForTransaction(ctx: DbCtx, transactionId: Id<'transactions'>) {
  return await ctx.db
    .query('creditFacilityInstallmentPayments')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', transactionId))
    .take(50);
}

async function getExistingInstallmentPaymentForScheduledDueDate(
  ctx: MutationCtx,
  installmentPlanId: Id<'creditFacilityInstallmentPlans'>,
  scheduledDueDate: string,
) {
  return await ctx.db
    .query('creditFacilityInstallmentPayments')
    .withIndex('by_installmentPlanId_and_scheduledDueDate', (q) =>
      q.eq('installmentPlanId', installmentPlanId).eq('scheduledDueDate', scheduledDueDate),
    )
    .first();
}

async function markCardBackedInstallmentRepaymentInternal(
  ctx: MutationCtx,
  args: {
    userId: string;
    facility: Doc<'creditFacilities'>;
    transactionId: Id<'transactions'>;
    updatedAtMs: number;
  },
) {
  if (!isCardBackedCreditFacilityType(args.facility.facilityType)) return;

  const transaction = await ctx.db.get('transactions', args.transactionId);
  if (!transaction || transaction.userId !== args.userId) {
    throw new ConvexError('Transaction not found');
  }

  await ctx.db.patch('transactions', transaction._id, {
    classificationKind: 'internal',
    classificationSource: 'user',
    classificationConfidence: 1,
    updatedAtMs: args.updatedAtMs,
  });
  await invalidatePlanSnapshots(ctx, args.userId, [transaction.bookingDate]);
}

function assertSamePaymentShape(
  existingPayment: Doc<'creditFacilityInstallmentPayments'>,
  input: {
    amount: MoneyAmount;
    principalAmount: MoneyAmount;
    interestAmount?: MoneyAmount;
    feeAmount?: MoneyAmount;
  },
) {
  if (
    existingPayment.amount.amountMinor !== input.amount.amountMinor ||
    existingPayment.amount.currency !== input.amount.currency
  ) {
    throw new ConvexError('Existing scheduled installment payment amount does not match this repayment');
  }

  const existingPrincipal = existingPayment.principalAmount ?? existingPayment.amount;
  if (
    existingPrincipal.amountMinor !== input.principalAmount.amountMinor ||
    existingPrincipal.currency !== input.principalAmount.currency
  ) {
    throw new ConvexError('Existing scheduled installment principal split does not match this repayment');
  }

  const existingInterestMinor = existingPayment.interestAmount?.amountMinor ?? 0n;
  const inputInterestMinor = input.interestAmount?.amountMinor ?? 0n;
  if (existingInterestMinor !== inputInterestMinor) {
    throw new ConvexError('Existing scheduled installment interest split does not match this repayment');
  }

  const existingFeeMinor = existingPayment.feeAmount?.amountMinor ?? 0n;
  const inputFeeMinor = input.feeAmount?.amountMinor ?? 0n;
  if (existingFeeMinor !== inputFeeMinor) {
    throw new ConvexError('Existing scheduled installment fee split does not match this repayment');
  }
}

async function applyInstallmentPayment(
  ctx: MutationCtx,
  args: {
    userId: string;
    plan: Doc<'creditFacilityInstallmentPlans'>;
    facility: Doc<'creditFacilities'>;
    amount: MoneyAmount;
    principalAmount?: MoneyAmount;
    interestAmount?: MoneyAmount;
    feeAmount?: MoneyAmount;
    paymentDate: string;
    scheduledDueDate?: string;
    source: InstallmentPaymentSource;
    transactionId?: Id<'transactions'>;
    remainingInstallments?: number;
    nextPaymentDate?: string;
    notes?: string;
  },
) {
  if (args.plan.status !== 'active') {
    throw new ConvexError('Installment plan is not active');
  }

  assertPositiveMoney('Payment amount', args.amount);
  assertSameCurrency('Payment amount', args.amount, 'installment plan', args.plan.outstandingAmount);
  assertOptionalPositiveInteger('Remaining installments', args.remainingInstallments);
  const breakdown = resolveInstallmentPaymentBreakdown(args);

  if (args.source === 'transaction' && !args.transactionId) {
    throw new ConvexError('Transaction payment source requires a transaction');
  }

  if (args.transactionId) {
    const existingPayment = await getExistingInstallmentPaymentForTransactionPlan(
      ctx,
      args.transactionId,
      args.plan._id,
    );
    if (existingPayment) {
      if (existingPayment.userId === args.userId) {
        return existingPayment._id;
      }

      throw new ConvexError('Transaction is already linked to an installment payment');
    }
  }

  const scheduledDueDate = args.scheduledDueDate ?? args.plan.nextPaymentDate ?? args.paymentDate;
  const existingScheduledPayment = await getExistingInstallmentPaymentForScheduledDueDate(
    ctx,
    args.plan._id,
    scheduledDueDate,
  );
  if (existingScheduledPayment) {
    if (existingScheduledPayment.userId !== args.userId) {
      throw new ConvexError('Installment payment not found');
    }

    if (existingScheduledPayment.transactionId && existingScheduledPayment.transactionId !== args.transactionId) {
      throw new ConvexError('Scheduled installment payment is already linked to another transaction');
    }

    assertSamePaymentShape(existingScheduledPayment, {
      amount: args.amount,
      principalAmount: breakdown.principalAmount,
      interestAmount: breakdown.interestAmount,
      feeAmount: breakdown.feeAmount,
    });

    if (args.transactionId && !existingScheduledPayment.transactionId) {
      const now = Date.now();
      await ctx.db.patch('creditFacilityInstallmentPayments', existingScheduledPayment._id, {
        source: 'transaction',
        transactionId: args.transactionId,
        paymentDate: args.paymentDate,
        notes: args.notes ?? existingScheduledPayment.notes,
        updatedAtMs: now,
      });
      await markCardBackedInstallmentRepaymentInternal(ctx, {
        userId: args.userId,
        facility: args.facility,
        transactionId: args.transactionId,
        updatedAtMs: now,
      });
    }

    return existingScheduledPayment._id;
  }

  const outstandingAmountMinor = args.plan.outstandingAmount.amountMinor - breakdown.principalAmount.amountMinor;
  const nextOutstandingAmountMinor = outstandingAmountMinor > 0n ? outstandingAmountMinor : 0n;
  const computedRemainingInstallments =
    args.remainingInstallments ??
    (args.plan.remainingInstallments > 0 ? args.plan.remainingInstallments - 1 : args.plan.remainingInstallments);
  const nextRemainingInstallments = Math.max(0, computedRemainingInstallments);
  const currentNextPaymentDate = args.plan.nextPaymentDate ?? args.paymentDate;
  const paidByInstallmentCount = nextRemainingInstallments === 0;
  const nextPaymentDate = paidByInstallmentCount
    ? undefined
    : (args.nextPaymentDate ?? addMonthsToIsoDate(currentNextPaymentDate, 1));
  const now = Date.now();

  const paymentId = await ctx.db.insert('creditFacilityInstallmentPayments', {
    userId: args.userId,
    creditFacilityId: args.facility._id,
    installmentPlanId: args.plan._id,
    amount: args.amount,
    principalAmount: breakdown.principalAmount,
    interestAmount: breakdown.interestAmount,
    feeAmount: breakdown.feeAmount,
    paymentDate: args.paymentDate,
    scheduledDueDate,
    source: args.source,
    transactionId: args.transactionId,
    notes: args.notes,
    createdAtMs: now,
    updatedAtMs: now,
  });

  await ctx.db.patch('creditFacilityInstallmentPlans', args.plan._id, {
    outstandingAmount: {
      amountMinor: nextOutstandingAmountMinor,
      currency: args.plan.outstandingAmount.currency,
    },
    remainingInstallments: nextRemainingInstallments,
    nextPaymentDate,
    status: paidByInstallmentCount ? 'paid' : args.plan.status,
    updatedAtMs: now,
  });

  const currentFacility = await ctx.db.get('creditFacilities', args.facility._id);
  if (!currentFacility || currentFacility.userId !== args.userId) {
    throw new ConvexError('Credit facility not found');
  }

  const facilityUsedAmountMinor = currentFacility.usedAmount.amountMinor - breakdown.principalAmount.amountMinor;
  await ctx.db.patch('creditFacilities', args.facility._id, {
    usedAmount: {
      amountMinor: facilityUsedAmountMinor > 0n ? facilityUsedAmountMinor : 0n,
      currency: currentFacility.usedAmount.currency,
    },
    updatedAtMs: now,
  });

  if (args.transactionId) {
    await markCardBackedInstallmentRepaymentInternal(ctx, {
      userId: args.userId,
      facility: args.facility,
      transactionId: args.transactionId,
      updatedAtMs: now,
    });
  }

  return paymentId;
}

async function confirmInstallmentPaymentTransactionForUserCore(
  ctx: MutationCtx,
  args: {
    userId: string;
    installmentPlanId: Id<'creditFacilityInstallmentPlans'>;
    transactionId: Id<'transactions'>;
    principalAmount?: MoneyAmount;
    interestAmount?: MoneyAmount;
    feeAmount?: MoneyAmount;
    scheduledDueDate?: string;
    notes?: string;
  },
) {
  const plan = await getOwnedInstallmentPlan(ctx, args.userId, args.installmentPlanId);
  const facility = await getOwnedFacility(ctx, args.userId, plan.creditFacilityId);
  const transaction = await ctx.db.get('transactions', args.transactionId);

  if (!transaction || transaction.userId !== args.userId) {
    throw new ConvexError('Transaction not found');
  }

  if (!isRepaymentLinkableTransaction(transaction) || transaction.status !== 'BOOK') {
    throw new ConvexError('Only booked debit transactions can be linked to installment payments');
  }

  await assertTransactionMatchesFacilityAccount(ctx, transaction, facility);
  assertSameCurrency('Transaction', transaction.amount, 'installment plan', plan.outstandingAmount);

  const existingPayments = await listInstallmentPaymentsForTransaction(ctx, transaction._id);
  const alreadyLinkedToThisPlan = existingPayments.some((payment) => payment.installmentPlanId === plan._id);
  if (existingPayments.length > 0 && !alreadyLinkedToThisPlan) {
    throw new ConvexError('Transaction is already partially allocated; confirm the repayment as a batch instead');
  }

  const scheduledDueDate = args.scheduledDueDate ?? plan.nextPaymentDate ?? transaction.bookingDate;
  const paymentId = await applyInstallmentPayment(ctx, {
    userId: args.userId,
    plan,
    facility,
    amount: transaction.amount,
    principalAmount: args.principalAmount,
    interestAmount: args.interestAmount,
    feeAmount: args.feeAmount,
    paymentDate: transaction.bookingDate,
    scheduledDueDate,
    source: 'transaction',
    transactionId: transaction._id,
    notes: args.notes,
  });
  await syncInstallmentPlanBucketsAfterChange(ctx, args.userId, [transaction.bookingDate, scheduledDueDate]);
  return paymentId;
}

async function confirmInstallmentPaymentTransactionBatchForUserCore(
  ctx: MutationCtx,
  args: {
    userId: string;
    transactionId: Id<'transactions'>;
    allocations: Array<InstallmentPaymentAllocation>;
  },
) {
  if (args.allocations.length === 0) {
    throw new ConvexError('At least one installment allocation is required');
  }

  if (args.allocations.length > 20) {
    throw new ConvexError('Too many installment allocations for a single transaction');
  }

  const transaction = await ctx.db.get('transactions', args.transactionId);
  if (!transaction || transaction.userId !== args.userId) {
    throw new ConvexError('Transaction not found');
  }

  const uniquePlanIds = new Set<Id<'creditFacilityInstallmentPlans'>>();
  for (const allocation of args.allocations) {
    if (uniquePlanIds.has(allocation.installmentPlanId)) {
      throw new ConvexError('Installment plan allocations must be unique per transaction');
    }
    uniquePlanIds.add(allocation.installmentPlanId);
    assertPositiveMoney('Allocation amount', allocation.amount);
    assertSameCurrency('Allocation amount', allocation.amount, 'transaction', transaction.amount);
  }

  const existingPayments = await listInstallmentPaymentsForTransaction(ctx, transaction._id);
  const existingByPlan = new Map(existingPayments.map((payment) => [payment.installmentPlanId, payment]));
  const alreadyFullyLinked =
    existingPayments.length === args.allocations.length &&
    args.allocations.every((allocation) => existingByPlan.has(allocation.installmentPlanId));

  if (alreadyFullyLinked) {
    return args.allocations.map((allocation) => existingByPlan.get(allocation.installmentPlanId)!._id);
  }

  if (existingPayments.length > 0) {
    throw new ConvexError('Transaction is already partially allocated to installment payments');
  }

  if (!isRepaymentLinkableTransaction(transaction) || transaction.status !== 'BOOK') {
    throw new ConvexError('Only booked debit transactions can be linked to installment payments');
  }

  const allocatedMinor = args.allocations.reduce((total, allocation) => total + allocation.amount.amountMinor, 0n);
  if (allocatedMinor !== transaction.amount.amountMinor) {
    throw new ConvexError('Installment allocations must add up to the transaction amount');
  }

  const paymentIds = [];
  const affectedDueDates: Array<string> = [];
  for (const allocation of args.allocations) {
    const plan = await getOwnedInstallmentPlan(ctx, args.userId, allocation.installmentPlanId);
    const facility = await getOwnedFacility(ctx, args.userId, plan.creditFacilityId);
    await assertTransactionMatchesFacilityAccount(ctx, transaction, facility);
    const scheduledDueDate = allocation.scheduledDueDate ?? plan.nextPaymentDate ?? transaction.bookingDate;
    affectedDueDates.push(scheduledDueDate);
    paymentIds.push(
      await applyInstallmentPayment(ctx, {
        userId: args.userId,
        plan,
        facility,
        amount: allocation.amount,
        principalAmount: allocation.principalAmount,
        interestAmount: allocation.interestAmount,
        feeAmount: allocation.feeAmount,
        paymentDate: transaction.bookingDate,
        scheduledDueDate,
        source: 'transaction',
        transactionId: transaction._id,
        notes: allocation.notes,
      }),
    );
  }

  await syncInstallmentPlanBucketsAfterChange(ctx, args.userId, [transaction.bookingDate, ...affectedDueDates]);
  return paymentIds;
}

async function getUsageCycleForFacilityMonth(
  ctx: DbCtx,
  args: {
    userId: string;
    creditFacilityId: Id<'creditFacilities'>;
    cycleMonth: string;
  },
) {
  assertCycleMonth(args.cycleMonth);
  const cycles = await ctx.db
    .query('creditFacilityUsageCycles')
    .withIndex('by_creditFacilityId_and_cycleMonth', (q) =>
      q.eq('creditFacilityId', args.creditFacilityId).eq('cycleMonth', args.cycleMonth),
    )
    .take(5);

  const cycle = cycles.find((candidate) => candidate.userId === args.userId);
  return cycle ?? null;
}

export async function createInstallmentPlanForUserCore(
  ctx: MutationCtx,
  args: {
    userId: string;
    facility: Doc<'creditFacilities'>;
    name: string;
    principalAmount: MoneyAmount;
    monthlyPaymentAmount?: MoneyAmount;
    defaultPrincipalAmount?: MoneyAmount;
    defaultInterestAmount?: MoneyAmount;
    defaultFeeAmount?: MoneyAmount;
    installmentCount?: number;
    startDate: string;
    nextPaymentDate?: string;
    linkedTransactionId?: Id<'transactions'>;
    addToFacilityUsage?: boolean;
  },
) {
  const installmentCount = args.installmentCount ?? args.facility.standardInstallmentMonths;

  if (!installmentCount) {
    throw new ConvexError('Installment count is required for this credit facility');
  }

  assertInstallmentRange(args.facility, installmentCount);
  assertPositiveMoney('Principal amount', args.principalAmount);
  assertSameCurrency('Principal amount', args.principalAmount, 'credit facility', args.facility.limitAmount);

  if (
    args.facility.minimumPurchaseAmount &&
    args.principalAmount.amountMinor < args.facility.minimumPurchaseAmount.amountMinor
  ) {
    throw new ConvexError('Principal amount is below this facility minimum purchase amount');
  }

  if (args.linkedTransactionId) {
    const transaction = await ctx.db.get('transactions', args.linkedTransactionId);
    if (!transaction || transaction.userId !== args.userId) {
      throw new ConvexError('Transaction not found');
    }
    assertSameCurrency('Linked transaction', transaction.amount, 'principal amount', args.principalAmount);
  }

  const monthlyPaymentAmount =
    args.monthlyPaymentAmount ??
    ({
      amountMinor: estimateInstallmentPaymentMinor(
        args.principalAmount.amountMinor,
        args.facility.annualNominalRateBps,
        installmentCount,
      ),
      currency: args.principalAmount.currency,
    } satisfies MoneyAmount);

  assertPositiveMoney('Monthly payment amount', monthlyPaymentAmount);
  assertSameCurrency('Monthly payment amount', monthlyPaymentAmount, 'principal amount', args.principalAmount);

  const linkedCardAccount = await linkedCardAccountForFacility(ctx, args.facility);
  if (linkedCardAccount?.provider === 'manual') {
    const currentCardBalance = await latestBookedBalance(ctx, linkedCardAccount._id);
    if (!currentCardBalance || currentCardBalance.amount.currency !== args.principalAmount.currency) {
      throw new ConvexError('Manual card balance is unavailable');
    }
    if (currentCardBalance.amount.amountMinor + args.principalAmount.amountMinor > 0n) {
      throw new ConvexError('Installment principal exceeds the outstanding manual card balance');
    }
  }

  const now = Date.now();
  const planId = await ctx.db.insert('creditFacilityInstallmentPlans', {
    userId: args.userId,
    creditFacilityId: args.facility._id,
    name: args.name.trim(),
    principalAmount: args.principalAmount,
    outstandingAmount: args.principalAmount,
    monthlyPaymentAmount,
    defaultPrincipalAmount: args.defaultPrincipalAmount,
    defaultInterestAmount: args.defaultInterestAmount,
    defaultFeeAmount: args.defaultFeeAmount,
    installmentCount,
    remainingInstallments: installmentCount,
    startDate: args.startDate,
    nextPaymentDate: args.nextPaymentDate ?? addMonthsToIsoDate(args.startDate, 1),
    endDate: addMonthsToIsoDate(args.nextPaymentDate ?? addMonthsToIsoDate(args.startDate, 1), installmentCount - 1),
    status: 'active',
    linkedTransactionId: args.linkedTransactionId,
    manualCardBalanceCorrectionApplied: linkedCardAccount?.provider === 'manual' ? true : undefined,
    manualCardBalanceCorrectionAppliedAtMs: linkedCardAccount?.provider === 'manual' ? now : undefined,
    createdAtMs: now,
    updatedAtMs: now,
  });

  if (linkedCardAccount?.provider === 'manual') {
    await applyManualBalanceDelta(ctx, linkedCardAccount, args.principalAmount.amountMinor);
  }

  if (args.addToFacilityUsage ?? true) {
    const currentFacility = await getOwnedFacility(ctx, args.userId, args.facility._id);
    await ctx.db.patch('creditFacilities', args.facility._id, {
      usedAmount: {
        amountMinor: currentFacility.usedAmount.amountMinor + args.principalAmount.amountMinor,
        currency: currentFacility.usedAmount.currency,
      },
      updatedAtMs: now,
    });
  }

  await syncInstallmentPlanBucketsAfterChange(ctx, args.userId);
  return planId;
}

export const listCreditFacilities = query({
  args: {
    status: v.optional(creditFacilityStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);
    const facilities = args.status
      ? await ctx.db
          .query('creditFacilities')
          .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', args.status!))
          .take(limit)
      : await ctx.db
          .query('creditFacilities')
          .withIndex('by_userId', (q) => q.eq('userId', user.id))
          .take(limit);

    const result = [];
    for (const facility of facilities) {
      const activePlans = await ctx.db
        .query('creditFacilityInstallmentPlans')
        .withIndex('by_creditFacilityId_and_status', (q) =>
          q.eq('creditFacilityId', facility._id).eq('status', 'active'),
        )
        .take(100);

      const activeInstallmentOutstanding = activePlans.reduce(
        (total, plan) => total + buildRemainingInstallmentRepaymentAmount(plan).amountMinor,
        0n,
      );
      const { usedAmount, usageDerived } = await effectiveFacilityUsedAmount(ctx, facility);
      const scheduledCycles =
        facility.facilityType === 'cardCreditLine'
          ? await ctx.db
              .query('creditFacilityUsageCycles')
              .withIndex('by_creditFacilityId_and_status', (q) =>
                q.eq('creditFacilityId', facility._id).eq('status', 'scheduled'),
              )
              .take(100)
          : [];
      const scheduledStatementMinor = scheduledCycles.reduce(
        (total, cycle) =>
          cycle.trackedAmount.currency === usedAmount.currency ? total + cycle.trackedAmount.amountMinor : total,
        0n,
      );
      const currentStatementAmount = {
        amountMinor:
          usageDerived && facility.facilityType === 'cardCreditLine'
            ? unscheduledCardUsageMinor(usedAmount.amountMinor, scheduledStatementMinor)
            : usedAmount.amountMinor,
        currency: usedAmount.currency,
      };

      result.push({
        ...facility,
        usedAmount,
        usageDerived,
        currentStatementAmount,
        summary: buildCreditFacilitySummary(
          facility.limitAmount,
          usedAmount,
          isLoanFacilityType(facility.facilityType)
            ? undefined
            : {
                amountMinor: activeInstallmentOutstanding,
                currency: facility.limitAmount.currency,
              },
        ),
        activeInstallmentPlanCount: activePlans.length,
        activeInstallmentOutstanding: {
          amountMinor: activeInstallmentOutstanding,
          currency: facility.limitAmount.currency,
        },
      });
    }

    return result;
  },
});

export const listInstallmentPlans = query({
  args: {
    creditFacilityId: v.optional(v.id('creditFacilities')),
    status: v.optional(v.union(v.literal('active'), v.literal('paid'), v.literal('cancelled'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);

    if (args.creditFacilityId) {
      await getOwnedFacility(ctx, user.id, args.creditFacilityId);

      if (args.status) {
        return await ctx.db
          .query('creditFacilityInstallmentPlans')
          .withIndex('by_creditFacilityId_and_status', (q) =>
            q.eq('creditFacilityId', args.creditFacilityId!).eq('status', args.status!),
          )
          .take(limit);
      }

      return await ctx.db
        .query('creditFacilityInstallmentPlans')
        .withIndex('by_creditFacilityId', (q) => q.eq('creditFacilityId', args.creditFacilityId!))
        .take(limit);
    }

    if (args.status) {
      return await ctx.db
        .query('creditFacilityInstallmentPlans')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', args.status!))
        .take(limit);
    }

    return await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(limit);
  },
});

export const listInstallmentPlanPayments = query({
  args: {
    installmentPlanId: v.id('creditFacilityInstallmentPlans'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await getOwnedInstallmentPlan(ctx, user.id, args.installmentPlanId);
    const recordedPayments = await ctx.db
      .query('creditFacilityInstallmentPayments')
      .withIndex('by_installmentPlanId_and_scheduledDueDate', (q) => q.eq('installmentPlanId', plan._id))
      .take(500);
    const upcomingSchedule = buildInstallmentPaymentSchedule({
      monthlyPaymentAmount: plan.monthlyPaymentAmount,
      outstandingAmount: plan.outstandingAmount,
      startDate: plan.startDate,
      nextPaymentDate: plan.nextPaymentDate,
      remainingInstallments: Math.min(plan.remainingInstallments, 500),
      asOfDate: plan.nextPaymentDate ?? todayIsoDate(),
      monthsAhead: Math.min(plan.remainingInstallments, 500),
    });
    const paymentsByDueDate = new Map<
      string,
      {
        scheduledDueDate: string;
        amount: MoneyAmount;
        paymentDate: string | null;
        isLinked: boolean;
        transactionId: Id<'transactions'> | null;
        isRecorded: boolean;
      }
    >();

    for (const payment of upcomingSchedule) {
      paymentsByDueDate.set(payment.dueDate, {
        scheduledDueDate: payment.dueDate,
        amount: payment.amount,
        paymentDate: null,
        isLinked: false,
        transactionId: null,
        isRecorded: false,
      });
    }

    for (const payment of recordedPayments) {
      const scheduledDueDate = payment.scheduledDueDate ?? payment.paymentDate;
      paymentsByDueDate.set(scheduledDueDate, {
        scheduledDueDate,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        isLinked: payment.transactionId !== undefined,
        transactionId: payment.transactionId ?? null,
        isRecorded: true,
      });
    }

    return [...paymentsByDueDate.values()].sort((left, right) =>
      left.scheduledDueDate.localeCompare(right.scheduledDueDate),
    );
  },
});

// What a single transaction can be linked to. A facility repaid by one debit for
// several plans in the same cycle — a card line with three financed purchases —
// is one option carrying its allocations, never three competing ones: linking a
// single plan would book the whole debit against it and leave the others unpaid.
// The suggestion scan groups the same way; this is the manual door onto it.
export const listInstallmentLinkOptions = query({
  args: {
    transactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transaction = await ctx.db.get('transactions', args.transactionId);
    if (!transaction || transaction.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }

    const activePlans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'active'))
      .take(100);

    const facilityCache = new Map<Id<'creditFacilities'>, Doc<'creditFacilities'> | null>();
    const repaymentAccountCache = new Map<Id<'creditFacilities'>, Set<Id<'financialAccounts'>>>();
    const groups = new Map<
      string,
      {
        facility: Doc<'creditFacilities'>;
        entries: Array<{
          plan: Doc<'creditFacilityInstallmentPlans'>;
          expectedAmount: MoneyAmount;
          scheduledDueDate: string;
        }>;
      }
    >();

    for (const plan of activePlans) {
      if (!facilityCache.has(plan.creditFacilityId)) {
        const loaded = await ctx.db.get('creditFacilities', plan.creditFacilityId);
        facilityCache.set(plan.creditFacilityId, loaded && loaded.userId === user.id ? loaded : null);
      }
      const facility = facilityCache.get(plan.creditFacilityId) ?? null;
      if (!facility) {
        continue;
      }

      if (!repaymentAccountCache.has(facility._id)) {
        repaymentAccountCache.set(facility._id, await repaymentAccountIdsForFacility(ctx, facility));
      }
      if (!transactionMatchesRepaymentAccounts(transaction, repaymentAccountCache.get(facility._id)!)) {
        continue;
      }

      const expectedAmount = expectedInstallmentPaymentAmount(plan);
      if (expectedAmount.currency !== transaction.amount.currency) {
        continue;
      }

      const scheduledDueDate = plan.nextPaymentDate ?? transaction.bookingDate;
      const key = installmentFacilityCycleKey(facility._id, scheduledDueDate);
      const group = groups.get(key) ?? { facility, entries: [] };
      group.entries.push({ plan, expectedAmount, scheduledDueDate });
      groups.set(key, group);
    }

    const options = [];
    for (const [key, group] of groups) {
      const entries = group.entries.sort((left, right) => left.plan.name.localeCompare(right.plan.name));
      const facility = { _id: group.facility._id, name: group.facility.name };
      if (entries.length === 1) {
        const [entry] = entries;
        options.push({
          kind: 'single' as const,
          key,
          facility,
          expectedAmount: entry.expectedAmount,
          plan: {
            _id: entry.plan._id,
            name: entry.plan.name,
            monthlyPaymentAmount: entry.plan.monthlyPaymentAmount,
            nextPaymentDate: entry.plan.nextPaymentDate ?? null,
          },
        });
        continue;
      }

      options.push({
        kind: 'aggregate' as const,
        key,
        facility,
        expectedAmount: {
          amountMinor: entries.reduce((total, entry) => total + entry.expectedAmount.amountMinor, 0n),
          currency: transaction.amount.currency,
        },
        allocations: entries.map((entry) => ({
          plan: { _id: entry.plan._id, name: entry.plan.name },
          expectedAmount: entry.expectedAmount,
          scheduledDueDate: entry.scheduledDueDate,
        })),
      });
    }

    return options.sort(
      (left, right) => left.facility.name.localeCompare(right.facility.name) || left.key.localeCompare(right.key),
    );
  },
});

export const listUpcomingInstallmentPayments = query({
  args: {
    monthsAhead: v.optional(v.number()),
    limit: v.optional(v.number()),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 50, 100);
    const requestedMonthsAhead = args.monthsAhead ?? 6;
    if (!Number.isInteger(requestedMonthsAhead) || requestedMonthsAhead < 0) {
      throw new ConvexError('Months ahead must be a non-negative integer');
    }
    const monthsAhead = Math.min(requestedMonthsAhead, 24);
    const asOfDate = args.asOfDate ?? new Date().toISOString().slice(0, 10);
    const plans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'active'))
      .take(100);

    const payments = [];
    for (const plan of plans) {
      const facility = await ctx.db.get('creditFacilities', plan.creditFacilityId);
      if (!facility || facility.userId !== user.id) {
        continue;
      }

      const schedule = buildInstallmentPaymentSchedule({
        monthlyPaymentAmount: plan.monthlyPaymentAmount,
        outstandingAmount: plan.outstandingAmount,
        startDate: plan.startDate,
        nextPaymentDate: plan.nextPaymentDate,
        remainingInstallments: plan.remainingInstallments,
        asOfDate,
        monthsAhead,
      });

      for (const payment of schedule) {
        payments.push({
          ...payment,
          isOverdue: payment.dueDate < asOfDate,
          plan: {
            _id: plan._id,
            name: plan.name,
            remainingInstallments: plan.remainingInstallments,
            outstandingAmount: plan.outstandingAmount,
          },
          facility: {
            _id: facility._id,
            name: facility.name,
            facilityType: facility.facilityType,
          },
        });
      }
    }

    return payments.sort((left, right) => left.dueDate.localeCompare(right.dueDate)).slice(0, limit);
  },
});

export const listUpcomingInstallmentPaymentGroups = query({
  args: {
    monthsAhead: v.optional(v.number()),
    limit: v.optional(v.number()),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 50, 100);
    const requestedMonthsAhead = args.monthsAhead ?? 6;
    if (!Number.isInteger(requestedMonthsAhead) || requestedMonthsAhead < 0) {
      throw new ConvexError('Months ahead must be a non-negative integer');
    }
    const monthsAhead = Math.min(requestedMonthsAhead, 24);
    const asOfDate = args.asOfDate ?? new Date().toISOString().slice(0, 10);
    const plans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'active'))
      .take(100);

    const groups = new Map<
      string,
      {
        key: string;
        dueDate: string;
        isOverdue: boolean;
        amount: MoneyAmount;
        planCount: number;
        facility: {
          _id: Id<'creditFacilities'>;
          name: string;
          facilityType: Doc<'creditFacilities'>['facilityType'];
        };
        payments: Array<{
          dueDate: string;
          amount: MoneyAmount;
          sequenceNumber: number;
          remainingAfterPayment: number;
          plan: {
            _id: Id<'creditFacilityInstallmentPlans'>;
            name: string;
            remainingInstallments: number;
            outstandingAmount: MoneyAmount;
          };
        }>;
      }
    >();

    for (const plan of plans) {
      const facility = await ctx.db.get('creditFacilities', plan.creditFacilityId);
      if (!facility || facility.userId !== user.id) {
        continue;
      }

      const schedule = buildInstallmentPaymentSchedule({
        monthlyPaymentAmount: plan.monthlyPaymentAmount,
        outstandingAmount: plan.outstandingAmount,
        startDate: plan.startDate,
        nextPaymentDate: plan.nextPaymentDate,
        remainingInstallments: plan.remainingInstallments,
        asOfDate,
        monthsAhead,
      });

      for (const payment of schedule) {
        const key = `${facility._id}:${payment.dueDate}`;
        const existingGroup = groups.get(key);
        if (existingGroup) {
          existingGroup.amount.amountMinor += payment.amount.amountMinor;
          existingGroup.planCount += 1;
          existingGroup.payments.push({
            ...payment,
            plan: {
              _id: plan._id,
              name: plan.name,
              remainingInstallments: plan.remainingInstallments,
              outstandingAmount: plan.outstandingAmount,
            },
          });
          continue;
        }

        groups.set(key, {
          key,
          dueDate: payment.dueDate,
          isOverdue: payment.dueDate < asOfDate,
          amount: { ...payment.amount },
          planCount: 1,
          facility: {
            _id: facility._id,
            name: facility.name,
            facilityType: facility.facilityType,
          },
          payments: [
            {
              ...payment,
              plan: {
                _id: plan._id,
                name: plan.name,
                remainingInstallments: plan.remainingInstallments,
                outstandingAmount: plan.outstandingAmount,
              },
            },
          ],
        });
      }
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        payments: group.payments.sort(
          (left, right) => left.dueDate.localeCompare(right.dueDate) || left.plan.name.localeCompare(right.plan.name),
        ),
      }))
      .sort(
        (left, right) =>
          left.dueDate.localeCompare(right.dueDate) || left.facility.name.localeCompare(right.facility.name),
      )
      .slice(0, limit);
  },
});

export const listInstallmentPaymentCandidates = query({
  args: {
    limit: v.optional(v.number()),
    daysWindow: v.optional(v.number()),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 10, 50);
    const requestedDaysWindow = args.daysWindow ?? 14;
    if (!Number.isInteger(requestedDaysWindow) || requestedDaysWindow < 0) {
      throw new ConvexError('Days window must be a non-negative integer');
    }
    const daysWindow = Math.min(requestedDaysWindow, 45);
    const asOfDate = args.asOfDate ?? todayIsoDate();

    const activePlans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'active'))
      .take(100);

    if (activePlans.length === 0) {
      return [];
    }

    const scheduledDueDates = activePlans.flatMap((plan) => (plan.nextPaymentDate ? [plan.nextPaymentDate] : []));
    const dueDateSearchStarts = scheduledDueDates.map((dueDate) => addDaysToIsoDate(dueDate, -daysWindow));
    const dueDateSearchEnds = scheduledDueDates.map((dueDate) => addDaysToIsoDate(dueDate, daysWindow));
    const fromDate = [addDaysToIsoDate(asOfDate, -120), ...dueDateSearchStarts].reduce((earliest, date) =>
      date < earliest ? date : earliest,
    );
    const toDate = [addDaysToIsoDate(asOfDate, daysWindow), ...dueDateSearchEnds].reduce((latest, date) =>
      date > latest ? date : latest,
    );
    const recentTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_bookingDate', (q) =>
        q.eq('userId', user.id).gte('bookingDate', fromDate).lte('bookingDate', toDate),
      )
      .order('desc')
      .take(250);

    const eligibleTransactions = recentTransactions.filter(isRepaymentSuggestionCandidate);

    const existingPayments = await ctx.db
      .query('creditFacilityInstallmentPayments')
      .withIndex('by_userId_and_paymentDate', (q) =>
        q.eq('userId', user.id).gte('paymentDate', fromDate).lte('paymentDate', toDate),
      )
      .take(500);
    const linkedPlanIdsByTransactionId = new Map<Id<'transactions'>, Set<Id<'creditFacilityInstallmentPlans'>>>();
    for (const payment of existingPayments) {
      if (payment.transactionId) {
        const planIds =
          linkedPlanIdsByTransactionId.get(payment.transactionId) ?? new Set<Id<'creditFacilityInstallmentPlans'>>();
        planIds.add(payment.installmentPlanId);
        linkedPlanIdsByTransactionId.set(payment.transactionId, planIds);
      }
    }

    const accountCache = new Map<Id<'financialAccounts'>, Doc<'financialAccounts'> | null>();
    async function getAccount(accountId: Id<'financialAccounts'>) {
      if (!accountCache.has(accountId)) {
        const account = await ctx.db.get('financialAccounts', accountId);
        accountCache.set(accountId, account && account.userId === user.id ? account : null);
      }

      return accountCache.get(accountId) ?? null;
    }

    const activePlanEntries: Array<InstallmentCandidatePlanEntry> = [];
    for (const plan of activePlans) {
      const facility = await ctx.db.get('creditFacilities', plan.creditFacilityId);
      if (!facility || facility.userId !== user.id) {
        continue;
      }

      activePlanEntries.push({
        plan,
        facility,
        expectedAmount: expectedInstallmentPaymentAmount(plan),
        repaymentAccountIds: await repaymentAccountIdsForFacility(ctx, facility),
      });
    }

    const planCountsByFacilityCycleKey = new Map<string, number>();
    for (const entry of activePlanEntries) {
      const scheduledDueDate = entry.plan.nextPaymentDate ?? asOfDate;
      const facilityCycleKey = installmentFacilityCycleKey(entry.facility._id, scheduledDueDate);
      planCountsByFacilityCycleKey.set(facilityCycleKey, (planCountsByFacilityCycleKey.get(facilityCycleKey) ?? 0) + 1);
    }
    const aggregateOnlyFacilityCycleKeys = new Set(
      [...planCountsByFacilityCycleKey.entries()].filter(([, count]) => count > 1).map(([key]) => key),
    );

    const candidates = [];
    const aggregateTransactionFacilityCycleKeys = new Set<string>();
    const candidateFacilityCycleKeys = new Set<string>();
    function reviewStatusForTransaction(
      transaction: Doc<'transactions'>,
      amountDeltaMinor: bigint,
    ): InstallmentCandidateReviewStatus {
      if (transaction.status !== 'BOOK') {
        return 'pending';
      }

      if (amountDeltaMinor > 0n) {
        return 'review';
      }

      return 'confirmable';
    }

    for (const transaction of eligibleTransactions) {
      if (linkedPlanIdsByTransactionId.has(transaction._id)) {
        continue;
      }

      const entriesByFacilityId = new Map<
        string,
        Array<InstallmentCandidatePlanEntry & { dayDelta: number; scheduledDueDate: string; facilityCycleKey: string }>
      >();
      for (const entry of activePlanEntries) {
        if (!transactionMatchesRepaymentAccounts(transaction, entry.repaymentAccountIds)) {
          continue;
        }

        if (transaction.bookingDate < entry.plan.startDate) {
          continue;
        }

        if (transaction.amount.currency !== entry.expectedAmount.currency) {
          continue;
        }

        const dayDelta = entry.plan.nextPaymentDate
          ? Math.abs(daysBetweenIsoDates(transaction.bookingDate, entry.plan.nextPaymentDate))
          : 0;
        if (dayDelta > daysWindow) {
          continue;
        }

        const scheduledDueDate = entry.plan.nextPaymentDate ?? transaction.bookingDate;
        const facilityCycleKey = installmentFacilityCycleKey(entry.facility._id, scheduledDueDate);
        const facilityEntries = entriesByFacilityId.get(facilityCycleKey) ?? [];
        facilityEntries.push({ ...entry, dayDelta, scheduledDueDate, facilityCycleKey });
        entriesByFacilityId.set(facilityCycleKey, facilityEntries);
      }

      for (const [facilityCycleKey, entries] of entriesByFacilityId) {
        if (entries.length < 2) {
          continue;
        }

        const expectedAmountMinor = entries.reduce((total, entry) => total + entry.expectedAmount.amountMinor, 0n);
        const amountDeltaMinor = absoluteMinorUnits(transaction.amount.amountMinor - expectedAmountMinor);
        if (amountDeltaMinor > installmentPaymentToleranceMinor(expectedAmountMinor)) {
          continue;
        }

        const [firstEntry] = entries;
        const maxDayDelta = Math.max(...entries.map((entry) => entry.dayDelta));
        const scheduledDueDate = firstEntry.plan.nextPaymentDate ?? transaction.bookingDate;
        const account = await getAccount(transaction.accountId);
        const facility = firstEntry.facility;
        const expectedAmount = {
          amountMinor: expectedAmountMinor,
          currency: transaction.amount.currency,
        };
        candidates.push({
          kind: 'aggregate' as const,
          facility: {
            _id: facility._id,
            name: facility.name,
            facilityType: facility.facilityType,
          },
          transaction: {
            ...transaction,
            account: account
              ? {
                  _id: account._id,
                  name: account.name,
                  institutionName: account.institutionName,
                }
              : null,
          },
          expectedAmount,
          amountDelta: {
            amountMinor: amountDeltaMinor,
            currency: expectedAmount.currency,
          },
          reviewStatus: reviewStatusForTransaction(transaction, amountDeltaMinor),
          confirmable: transaction.status === 'BOOK' && amountDeltaMinor === 0n,
          dateDeltaDays: maxDayDelta,
          confidence: installmentCandidateConfidence({
            amountDeltaMinor,
            expectedAmountMinor,
            dayDelta: maxDayDelta,
          }),
          allocations: entries
            .sort((left, right) => left.plan.name.localeCompare(right.plan.name))
            .map((entry) => ({
              plan: {
                _id: entry.plan._id,
                name: entry.plan.name,
                monthlyPaymentAmount: entry.plan.monthlyPaymentAmount,
                outstandingAmount: entry.plan.outstandingAmount,
                nextPaymentDate: entry.plan.nextPaymentDate,
                remainingInstallments: entry.plan.remainingInstallments,
              },
              expectedAmount: entry.expectedAmount,
              scheduledDueDate: entry.scheduledDueDate,
              dateDeltaDays: entry.dayDelta,
            })),
        });
        aggregateTransactionFacilityCycleKeys.add(
          installmentTransactionFacilityCycleKey(transaction._id, facility._id, scheduledDueDate),
        );
        candidateFacilityCycleKeys.add(facilityCycleKey);
      }
    }

    for (const entry of activePlanEntries) {
      const toleranceMinor = installmentPaymentToleranceMinor(entry.expectedAmount.amountMinor);
      for (const transaction of eligibleTransactions) {
        if (!transactionMatchesRepaymentAccounts(transaction, entry.repaymentAccountIds)) {
          continue;
        }

        const scheduledDueDate = entry.plan.nextPaymentDate ?? transaction.bookingDate;
        const facilityCycleKey = installmentFacilityCycleKey(entry.facility._id, scheduledDueDate);
        if (aggregateOnlyFacilityCycleKeys.has(facilityCycleKey)) {
          continue;
        }

        const linkedPlanIds = linkedPlanIdsByTransactionId.get(transaction._id);
        if (linkedPlanIds?.has(entry.plan._id) || linkedPlanIdsByTransactionId.has(transaction._id)) {
          continue;
        }

        if (
          aggregateTransactionFacilityCycleKeys.has(
            installmentTransactionFacilityCycleKey(transaction._id, entry.facility._id, scheduledDueDate),
          )
        ) {
          continue;
        }

        if (transaction.bookingDate < entry.plan.startDate) {
          continue;
        }

        if (transaction.amount.currency !== entry.expectedAmount.currency) {
          continue;
        }

        const amountDeltaMinor = absoluteMinorUnits(transaction.amount.amountMinor - entry.expectedAmount.amountMinor);
        if (amountDeltaMinor > toleranceMinor) {
          continue;
        }

        const dayDelta = entry.plan.nextPaymentDate
          ? Math.abs(daysBetweenIsoDates(transaction.bookingDate, entry.plan.nextPaymentDate))
          : 0;
        if (dayDelta > daysWindow) {
          continue;
        }

        const account = await getAccount(transaction.accountId);
        candidates.push({
          kind: 'single' as const,
          plan: {
            _id: entry.plan._id,
            name: entry.plan.name,
            monthlyPaymentAmount: entry.plan.monthlyPaymentAmount,
            outstandingAmount: entry.plan.outstandingAmount,
            nextPaymentDate: entry.plan.nextPaymentDate,
            remainingInstallments: entry.plan.remainingInstallments,
          },
          facility: {
            _id: entry.facility._id,
            name: entry.facility.name,
            facilityType: entry.facility.facilityType,
          },
          transaction: {
            ...transaction,
            account: account
              ? {
                  _id: account._id,
                  name: account.name,
                  institutionName: account.institutionName,
                }
              : null,
          },
          expectedAmount: entry.expectedAmount,
          amountDelta: {
            amountMinor: amountDeltaMinor,
            currency: entry.expectedAmount.currency,
          },
          reviewStatus: reviewStatusForTransaction(transaction, amountDeltaMinor),
          confirmable: transaction.status === 'BOOK' && amountDeltaMinor === 0n,
          scheduledDueDate,
          dateDeltaDays: dayDelta,
          confidence: installmentCandidateConfidence({
            amountDeltaMinor,
            expectedAmountMinor: entry.expectedAmount.amountMinor,
            dayDelta,
          }),
        });
        candidateFacilityCycleKeys.add(facilityCycleKey);
      }
    }

    const expectedGroups = new Map<
      string,
      {
        kind: 'expected';
        facility: {
          _id: Id<'creditFacilities'>;
          name: string;
          facilityType: Doc<'creditFacilities'>['facilityType'];
        };
        dueDate: string;
        expectedAmount: MoneyAmount;
        allocations: Array<{
          plan: {
            _id: Id<'creditFacilityInstallmentPlans'>;
            name: string;
            monthlyPaymentAmount: MoneyAmount;
            outstandingAmount: MoneyAmount;
            nextPaymentDate?: string;
            remainingInstallments: number;
          };
          expectedAmount: MoneyAmount;
          scheduledDueDate: string;
        }>;
      }
    >();

    for (const entry of activePlanEntries) {
      const scheduledDueDate = entry.plan.nextPaymentDate ?? asOfDate;
      if (scheduledDueDate < fromDate || scheduledDueDate > toDate) {
        continue;
      }

      const facilityCycleKey = installmentFacilityCycleKey(entry.facility._id, scheduledDueDate);
      if (candidateFacilityCycleKeys.has(facilityCycleKey)) {
        continue;
      }

      const existingScheduledPayment = await ctx.db
        .query('creditFacilityInstallmentPayments')
        .withIndex('by_installmentPlanId_and_scheduledDueDate', (q) =>
          q.eq('installmentPlanId', entry.plan._id).eq('scheduledDueDate', scheduledDueDate),
        )
        .first();
      if (existingScheduledPayment) {
        continue;
      }

      const key = facilityCycleKey;
      const group = expectedGroups.get(key) ?? {
        kind: 'expected' as const,
        facility: {
          _id: entry.facility._id,
          name: entry.facility.name,
          facilityType: entry.facility.facilityType,
        },
        dueDate: scheduledDueDate,
        expectedAmount: {
          amountMinor: 0n,
          currency: entry.expectedAmount.currency,
        },
        allocations: [],
      };
      if (scheduledDueDate < group.dueDate) {
        group.dueDate = scheduledDueDate;
      }
      group.expectedAmount.amountMinor += entry.expectedAmount.amountMinor;
      group.allocations.push({
        plan: {
          _id: entry.plan._id,
          name: entry.plan.name,
          monthlyPaymentAmount: entry.plan.monthlyPaymentAmount,
          outstandingAmount: entry.plan.outstandingAmount,
          nextPaymentDate: entry.plan.nextPaymentDate,
          remainingInstallments: entry.plan.remainingInstallments,
        },
        expectedAmount: entry.expectedAmount,
        scheduledDueDate,
      });
      expectedGroups.set(key, group);
    }

    candidates.push(...expectedGroups.values());

    return candidates
      .sort((left, right) => {
        if (left.kind === 'expected' || right.kind === 'expected') {
          const leftDate = left.kind === 'expected' ? left.dueDate : left.transaction.bookingDate;
          const rightDate = right.kind === 'expected' ? right.dueDate : right.transaction.bookingDate;
          return leftDate.localeCompare(rightDate);
        }

        if (right.confidence !== left.confidence) {
          return right.confidence - left.confidence;
        }

        return right.transaction.bookingDate.localeCompare(left.transaction.bookingDate);
      })
      .slice(0, limit);
  },
});

export const createCreditFacility = mutation({
  args: {
    name: v.string(),
    facilityType: creditFacilityTypeValidator,
    linkedAccountId: v.optional(v.id('financialAccounts')),
    provider: v.optional(bankProviderValidator),
    limitAmount: moneyAmountValidator,
    usedAmount: v.optional(moneyAmountValidator),
    minimumPurchaseAmount: v.optional(moneyAmountValidator),
    repaymentType: creditFacilityRepaymentTypeValidator,
    standardInstallmentMonths: v.optional(v.number()),
    minInstallmentMonths: v.optional(v.number()),
    maxInstallmentMonths: v.optional(v.number()),
    annualNominalRateBps: v.optional(v.number()),
    statementDayOfMonth: v.optional(v.number()),
    paymentDayOfMonth: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const now = Date.now();
    const usedAmount =
      args.facilityType === 'accountOverdraft'
        ? { amountMinor: 0n, currency: args.limitAmount.currency }
        : (args.usedAmount ?? { amountMinor: 0n, currency: args.limitAmount.currency });

    assertPositiveMoney('Limit amount', args.limitAmount);
    assertNonNegativeMoney('Used amount', usedAmount);
    assertSameCurrency('Used amount', usedAmount, 'limit amount', args.limitAmount);

    if (args.minimumPurchaseAmount) {
      assertPositiveMoney('Minimum purchase amount', args.minimumPurchaseAmount);
      assertSameCurrency('Minimum purchase amount', args.minimumPurchaseAmount, 'limit amount', args.limitAmount);
    }

    assertOptionalPositiveInteger('Standard installment months', args.standardInstallmentMonths);
    assertOptionalPositiveInteger('Minimum installment months', args.minInstallmentMonths);
    assertOptionalPositiveInteger('Maximum installment months', args.maxInstallmentMonths);
    assertOptionalDayOfMonth('Statement day of month', args.statementDayOfMonth);
    assertOptionalDayOfMonth('Payment day of month', args.paymentDayOfMonth);

    if (
      args.minInstallmentMonths !== undefined &&
      args.maxInstallmentMonths !== undefined &&
      args.minInstallmentMonths > args.maxInstallmentMonths
    ) {
      throw new ConvexError('Minimum installment months cannot exceed maximum installment months');
    }

    if (args.annualNominalRateBps !== undefined && args.annualNominalRateBps < 0) {
      throw new ConvexError('Annual nominal rate cannot be negative');
    }

    if (args.facilityType === 'accountOverdraft' && !args.linkedAccountId) {
      throw new ConvexError('Account overdraft facilities require a linked account');
    }

    const linkedAccount = args.linkedAccountId ? await getOwnedAccount(ctx, user.id, args.linkedAccountId) : null;
    if (linkedAccount && linkedAccount.currency !== args.limitAmount.currency) {
      throw new ConvexError('Credit facility currency must match the linked account currency');
    }

    return await ctx.db.insert('creditFacilities', {
      userId: user.id,
      name: args.name.trim(),
      facilityType: args.facilityType,
      status: 'active',
      source: 'manual',
      linkedAccountId: args.linkedAccountId,
      provider: args.provider ?? linkedAccount?.provider ?? 'manual',
      limitAmount: args.limitAmount,
      usedAmount,
      minimumPurchaseAmount: args.minimumPurchaseAmount,
      repaymentType: args.repaymentType,
      standardInstallmentMonths: args.standardInstallmentMonths,
      minInstallmentMonths: args.minInstallmentMonths,
      maxInstallmentMonths: args.maxInstallmentMonths,
      annualNominalRateBps: args.annualNominalRateBps,
      statementDayOfMonth: args.statementDayOfMonth,
      paymentDayOfMonth: args.paymentDayOfMonth,
      notes: args.notes,
      createdAtMs: now,
      updatedAtMs: now,
    });
  },
});

export const createInstallmentCreditContract = mutation({
  args: {
    name: v.string(),
    linkedAccountId: v.optional(v.id('financialAccounts')),
    provider: v.optional(bankProviderValidator),
    principalAmount: moneyAmountValidator,
    monthlyPaymentAmount: moneyAmountValidator,
    installmentCount: v.number(),
    startDate: v.string(),
    nextPaymentDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const now = Date.now();
    const linkedAccount = args.linkedAccountId ? await getOwnedAccount(ctx, user.id, args.linkedAccountId) : null;

    assertPositiveMoney('Principal amount', args.principalAmount);
    assertPositiveMoney('Monthly payment amount', args.monthlyPaymentAmount);
    assertSameCurrency('Monthly payment amount', args.monthlyPaymentAmount, 'principal amount', args.principalAmount);
    assertOptionalPositiveInteger('Installment count', args.installmentCount);

    if (linkedAccount && linkedAccount.currency !== args.principalAmount.currency) {
      throw new ConvexError('Credit facility currency must match the linked account currency');
    }

    const facilityId = await ctx.db.insert('creditFacilities', {
      userId: user.id,
      name: args.name.trim(),
      facilityType: 'installmentCredit',
      status: 'active',
      source: 'manual',
      linkedAccountId: args.linkedAccountId,
      provider: args.provider ?? linkedAccount?.provider ?? 'manual',
      limitAmount: args.principalAmount,
      usedAmount: {
        amountMinor: 0n,
        currency: args.principalAmount.currency,
      },
      repaymentType: 'installmentPlan',
      standardInstallmentMonths: args.installmentCount,
      notes: args.notes,
      createdAtMs: now,
      updatedAtMs: now,
    });

    const facility = await getOwnedFacility(ctx, user.id, facilityId);
    const planId = await createInstallmentPlanForUserCore(ctx, {
      userId: user.id,
      facility,
      name: args.name,
      principalAmount: args.principalAmount,
      monthlyPaymentAmount: args.monthlyPaymentAmount,
      installmentCount: args.installmentCount,
      startDate: args.startDate,
      nextPaymentDate: args.nextPaymentDate,
      addToFacilityUsage: true,
    });

    return { creditFacilityId: facilityId, installmentPlanId: planId };
  },
});

export const updateCreditFacilityUsage = mutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
    usedAmount: moneyAmountValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);

    if (facility.facilityType === 'accountOverdraft') {
      throw new ConvexError(
        'Account overdraft usage is derived from the linked account balance and cannot be updated manually',
      );
    }

    if (await linkedCardAccountForFacility(ctx, facility)) {
      throw new ConvexError(
        'Card credit usage is derived from the linked card account balance and cannot be updated manually',
      );
    }

    assertNonNegativeMoney('Used amount', args.usedAmount);
    assertSameCurrency('Used amount', args.usedAmount, 'limit amount', facility.limitAmount);

    await ctx.db.patch('creditFacilities', facility._id, {
      usedAmount: args.usedAmount,
      updatedAtMs: Date.now(),
    });

    return facility._id;
  },
});

export const updateCreditFacility = mutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
    name: v.optional(v.string()),
    limitAmount: v.optional(moneyAmountValidator),
    linkedAccountId: v.optional(v.union(v.id('financialAccounts'), v.null())),
    settlementAccountId: v.optional(v.union(v.id('financialAccounts'), v.null())),
    statementDayOfMonth: v.optional(v.number()),
    paymentDayOfMonth: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);

    // Installment contracts have fixed terms and must stay immutable.
    if (facility.facilityType === 'installmentCredit') {
      throw new ConvexError('Installment credit contracts cannot be edited');
    }

    if (args.limitAmount) {
      assertPositiveMoney('Limit amount', args.limitAmount);
      assertSameCurrency('Limit amount', args.limitAmount, 'credit facility', facility.limitAmount);
    }

    const linkedAccountId =
      args.linkedAccountId === undefined ? facility.linkedAccountId : (args.linkedAccountId ?? undefined);
    if (facility.facilityType === 'accountOverdraft' && !linkedAccountId) {
      throw new ConvexError('Account overdraft facilities require a linked account and cannot be unlinked');
    }

    const linkedAccount = linkedAccountId ? await getOwnedAccount(ctx, user.id, linkedAccountId) : null;
    const limitAmount = args.limitAmount ?? facility.limitAmount;
    if (linkedAccount && linkedAccount.currency !== limitAmount.currency) {
      throw new ConvexError('Credit facility currency must match the linked account currency');
    }

    assertOptionalDayOfMonth('Statement day of month', args.statementDayOfMonth);
    assertOptionalDayOfMonth('Payment day of month', args.paymentDayOfMonth);

    const patch: Partial<Doc<'creditFacilities'>> = { updatedAtMs: Date.now() };
    if (args.name !== undefined) {
      patch.name = args.name.trim();
    }
    if (args.limitAmount !== undefined) {
      patch.limitAmount = args.limitAmount;
    }
    if (args.linkedAccountId !== undefined) {
      patch.linkedAccountId = args.linkedAccountId ?? undefined;
    }
    if (args.settlementAccountId !== undefined) {
      if (args.settlementAccountId) {
        await validateSettlementAccount(ctx, user.id, args.settlementAccountId, limitAmount.currency);
      }
      patch.settlementAccountId = args.settlementAccountId ?? undefined;
    }
    if (args.statementDayOfMonth !== undefined) {
      patch.statementDayOfMonth = args.statementDayOfMonth;
    }
    if (args.paymentDayOfMonth !== undefined) {
      patch.paymentDayOfMonth = args.paymentDayOfMonth;
    }
    if (args.notes !== undefined) {
      patch.notes = args.notes;
    }

    // Linking a card credit line to a CARD account switches usage to derived
    // mode: zero the manual amount so a stale value can't resurface later.
    if (
      facility.facilityType === 'cardCreditLine' &&
      args.linkedAccountId &&
      args.linkedAccountId !== facility.linkedAccountId &&
      linkedAccount?.accountType === 'CARD'
    ) {
      patch.usedAmount = { amountMinor: 0n, currency: facility.limitAmount.currency };
    }

    await ctx.db.patch('creditFacilities', facility._id, patch);
    if (args.linkedAccountId !== undefined && linkedAccountId !== facility.linkedAccountId) {
      await invalidateAllPlanSnapshots(ctx, user.id);
    }

    return facility._id;
  },
});

export const setCreditFacilityStatus = mutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
    status: creditFacilityStatusValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);

    await ctx.db.patch('creditFacilities', facility._id, {
      status: args.status,
      updatedAtMs: Date.now(),
    });

    return facility._id;
  },
});

export const listCreditFacilityUsageCycles = query({
  args: {
    status: v.optional(creditFacilityUsageCycleStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);

    if (args.status) {
      return await ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_userId_and_status_and_dueDate', (q) => q.eq('userId', user.id).eq('status', args.status!))
        .take(limit);
    }

    const cycles: Array<Doc<'creditFacilityUsageCycles'>> = [];
    for (const status of ['open', 'scheduled'] as const) {
      cycles.push(
        ...(await ctx.db
          .query('creditFacilityUsageCycles')
          .withIndex('by_userId_and_status_and_dueDate', (q) => q.eq('userId', user.id).eq('status', status))
          .take(limit)),
      );
    }

    return cycles
      .sort(
        (left, right) => left.dueDate.localeCompare(right.dueDate) || left.cycleMonth.localeCompare(right.cycleMonth),
      )
      .slice(0, limit);
  },
});

async function closeUsageCycleCore(
  ctx: MutationCtx,
  args: {
    facility: Doc<'creditFacilities'>;
    cycleMonth: string;
    dueDate?: string;
    allowZeroAmount: boolean;
    trackedAmount: MoneyAmount;
    // Derived (CARD-linked) usage must NOT be reset at close: the plafond
    // stays occupied until the settlement actually credits the card account.
    resetUsedAmount: boolean;
  },
) {
  const { facility, cycleMonth, trackedAmount } = args;
  assertCycleMonth(cycleMonth);
  const existingCycle = await getUsageCycleForFacilityMonth(ctx, {
    userId: facility.userId,
    creditFacilityId: facility._id,
    cycleMonth,
  });
  if (existingCycle && existingCycle.status !== 'open') {
    throw new ConvexError('Only open credit usage cycles can be closed');
  }

  assertNonNegativeMoney('Tracked amount', trackedAmount);
  assertSameCurrency('Tracked amount', trackedAmount, 'credit facility', facility.limitAmount);
  if (!args.allowZeroAmount) {
    assertPositiveMoney('Tracked amount', trackedAmount);
  }

  const now = Date.now();
  const dueDate = args.dueDate ?? defaultUsageCycleDueDate(facility, cycleMonth);
  let cycleId: Id<'creditFacilityUsageCycles'> | null = null;

  if (trackedAmount.amountMinor > 0n) {
    cycleId = existingCycle
      ? existingCycle._id
      : await ctx.db.insert('creditFacilityUsageCycles', {
          userId: facility.userId,
          creditFacilityId: facility._id,
          cycleMonth,
          status: 'open',
          trackedAmount,
          dueDate,
          createdAtMs: now,
          updatedAtMs: now,
        });
    await ctx.db.patch('creditFacilityUsageCycles', cycleId, {
      status: 'scheduled',
      trackedAmount,
      dueDate,
      closedAtMs: now,
      updatedAtMs: now,
    });
  } else if (existingCycle) {
    await ctx.db.delete('creditFacilityUsageCycles', existingCycle._id);
  }

  const nextCycleMonth = addMonthsToCycleMonth(cycleMonth, 1);
  const existingNextCycle = await getUsageCycleForFacilityMonth(ctx, {
    userId: facility.userId,
    creditFacilityId: facility._id,
    cycleMonth: nextCycleMonth,
  });
  if (!existingNextCycle) {
    await ctx.db.insert('creditFacilityUsageCycles', {
      userId: facility.userId,
      creditFacilityId: facility._id,
      cycleMonth: nextCycleMonth,
      status: 'open',
      trackedAmount: { amountMinor: 0n, currency: facility.limitAmount.currency },
      dueDate: defaultUsageCycleDueDate(facility, nextCycleMonth),
      createdAtMs: now,
      updatedAtMs: now,
    });
  }

  if (args.resetUsedAmount) {
    await ctx.db.patch('creditFacilities', facility._id, {
      usedAmount: { amountMinor: 0n, currency: facility.limitAmount.currency },
      updatedAtMs: now,
    });
  }

  return cycleId;
}

async function usageCycleCloseInputs(ctx: MutationCtx, facility: Doc<'creditFacilities'>) {
  const cardAccount = await linkedCardAccountForFacility(ctx, facility);
  if (!cardAccount) {
    return { trackedAmount: facility.usedAmount, resetUsedAmount: true };
  }

  const { usedAmount } = await effectiveFacilityUsedAmount(ctx, facility);
  const scheduledCycles = await scheduledStatementCyclesForFacility(ctx, facility._id);
  const scheduledAmountMinor = scheduledCycles.reduce(
    (total, cycle) =>
      cycle.trackedAmount.currency === usedAmount.currency ? total + cycle.trackedAmount.amountMinor : total,
    0n,
  );
  return {
    trackedAmount: {
      amountMinor: unscheduledCardUsageMinor(usedAmount.amountMinor, scheduledAmountMinor),
      currency: usedAmount.currency,
    },
    resetUsedAmount: false,
  };
}

async function earliestOpenUsageCycle(ctx: DbCtx, facilityId: Id<'creditFacilities'>) {
  const openCycles = await ctx.db
    .query('creditFacilityUsageCycles')
    .withIndex('by_creditFacilityId_and_status', (q) => q.eq('creditFacilityId', facilityId).eq('status', 'open'))
    .take(100);
  return openCycles.sort((left, right) => left.cycleMonth.localeCompare(right.cycleMonth)).at(0) ?? null;
}

async function cardStatementFacilityForAccount(ctx: DbCtx, userId: string, cardAccountId: Id<'financialAccounts'>) {
  const cardAccount = await getOwnedAccount(ctx, userId, cardAccountId);
  if (cardAccount.accountType !== 'CARD') {
    throw new ConvexError('Card statement payments require a card account');
  }

  const facilities = await ctx.db
    .query('creditFacilities')
    .withIndex('by_linkedAccountId', (q) => q.eq('linkedAccountId', cardAccount._id))
    .take(20);
  const matching = facilities.filter(
    (facility) =>
      facility.userId === userId &&
      facility.status === 'active' &&
      facility.facilityType === 'cardCreditLine' &&
      facility.repaymentType === 'statementBalance' &&
      facility.settlementAccountId,
  );
  if (matching.length === 0) {
    return null;
  }
  if (matching.length > 1) {
    throw new ConvexError('Multiple statement credit facilities are configured for this card');
  }

  return { cardAccount, facility: matching[0] };
}

async function scheduledStatementCyclesForFacility(ctx: DbCtx, facilityId: Id<'creditFacilities'>) {
  return await ctx.db
    .query('creditFacilityUsageCycles')
    .withIndex('by_creditFacilityId_and_status', (q) => q.eq('creditFacilityId', facilityId).eq('status', 'scheduled'))
    .take(20);
}

function cardStatementBalanceEffect(
  cardAccount: Doc<'financialAccounts'>,
  latestBalance: Doc<'accountBalances'> | null,
  payment: { amount: MoneyAmount; bookingDate: string },
) {
  const currentAmount = {
    amountMinor: latestBalance?.amount.amountMinor ?? 0n,
    currency: cardAccount.currency,
  };
  if (cardAccount.provider !== 'manual') {
    return {
      currentAmount,
      resultingAmount: currentAmount,
      balanceWillChange: false,
      reason: 'providerManaged' as const,
    };
  }

  const alreadyIncluded = Boolean(latestBalance?.referenceDate && payment.bookingDate <= latestBalance.referenceDate);
  if (alreadyIncluded) {
    return {
      currentAmount,
      resultingAmount: currentAmount,
      balanceWillChange: false,
      reason: 'alreadyIncluded' as const,
    };
  }

  return {
    currentAmount,
    resultingAmount: {
      amountMinor: currentAmount.amountMinor + payment.amount.amountMinor,
      currency: cardAccount.currency,
    },
    balanceWillChange: true,
    reason: 'applied' as const,
  };
}

export const listCardStatementPaymentCandidates = query({
  args: {
    cardAccountId: v.id('financialAccounts'),
    period: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    assertCycleMonth(args.period);
    const resolved = await cardStatementFacilityForAccount(ctx, user.id, args.cardAccountId);
    if (!resolved) {
      return { facility: null, candidates: [] };
    }
    const { cardAccount, facility } = resolved;
    if (!facility.settlementAccountId) {
      throw new ConvexError('The card has no settlement account');
    }
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 10), 20));
    const scheduledCycles = await scheduledStatementCyclesForFacility(ctx, facility._id);
    const latestCardBalance = await latestBookedBalance(ctx, cardAccount._id);
    const rows = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
        q
          .eq('userId', user.id)
          .eq('accountId', facility.settlementAccountId!)
          .gte('bookingDate', `${args.period}-01`)
          .lt('bookingDate', `${addMonthsToCycleMonth(args.period, 1)}-01`),
      )
      .order('desc')
      .take(50);

    const candidates = [];
    for (const transaction of rows) {
      if (
        transaction.status !== 'BOOK' ||
        !isRepaymentSuggestionCandidate(transaction) ||
        transaction.amount.currency !== 'EUR' ||
        (scheduledCycles.length > 0 &&
          !scheduledCycles.some((cycle) => statementCycleMatchesPayment(cycle, transaction)))
      ) {
        continue;
      }
      if ((await listInstallmentPaymentsForTransaction(ctx, transaction._id)).length > 0) {
        continue;
      }
      candidates.push({
        transaction: {
          _id: transaction._id,
          bookingDate: transaction.bookingDate,
          description: transaction.description,
          counterpartyName: transaction.counterpartyName,
          amount: transaction.amount,
        },
        requiresCycleClose: scheduledCycles.length === 0,
        balanceEffect: cardStatementBalanceEffect(cardAccount, latestCardBalance, transaction),
      });
      if (candidates.length >= limit) {
        break;
      }
    }

    return {
      facility: { _id: facility._id, name: facility.name },
      candidates,
    };
  },
});

export const registerCardStatementPayment = mutation({
  args: {
    cardAccountId: v.id('financialAccounts'),
    transactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const resolved = await cardStatementFacilityForAccount(ctx, user.id, args.cardAccountId);
    if (!resolved) {
      throw new ConvexError('No active statement credit facility is configured for this card');
    }
    const { cardAccount, facility } = resolved;
    const transaction = await ctx.db.get('transactions', args.transactionId);
    if (!transaction || transaction.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }
    if (transaction.transferMatchId) {
      throw new ConvexError('This transaction is already registered as a transfer');
    }
    if (!isRepaymentLinkableTransaction(transaction) || transaction.status !== 'BOOK') {
      throw new ConvexError('Only booked debit transactions can be registered as card statement payments');
    }
    if (!facility.settlementAccountId || transaction.accountId !== facility.settlementAccountId) {
      throw new ConvexError('Transaction account must match the card settlement account');
    }
    if (
      transaction.amount.currency !== 'EUR' ||
      cardAccount.currency !== 'EUR' ||
      facility.limitAmount.currency !== 'EUR'
    ) {
      throw new ConvexError('Card statement settlement currently supports EUR only');
    }
    if ((await listInstallmentPaymentsForTransaction(ctx, transaction._id)).length > 0) {
      throw new ConvexError('Transaction is already linked to installment payments');
    }
    if (await getUsageCycleLinkedToTransaction(ctx, transaction._id)) {
      throw new ConvexError('Transaction is already linked to a statement cycle');
    }

    const balanceEffect = cardStatementBalanceEffect(
      cardAccount,
      await latestBookedBalance(ctx, cardAccount._id),
      transaction,
    );
    if (balanceEffect.balanceWillChange && balanceEffect.resultingAmount.amountMinor > 0n) {
      throw new ConvexError(
        'Card statement payment would make the card balance positive. Update the card balance or choose a different payment.',
      );
    }

    let scheduledCycles = await scheduledStatementCyclesForFacility(ctx, facility._id);
    if (scheduledCycles.length === 0) {
      const cycleMonth = addMonthsToCycleMonth(transaction.bookingDate.slice(0, 7), -1);
      const closeInputs = await usageCycleCloseInputs(ctx, facility);
      await closeUsageCycleCore(ctx, {
        facility,
        cycleMonth,
        allowZeroAmount: false,
        ...closeInputs,
        // The payment is the statement, and it is a fact: the bank charged what was owed. Closing
        // the cycle now would instead track today's usage, which has already moved on to the
        // current month's spending — a June statement of 2.031,93 settled against a card carrying
        // 1.200,00 of July purchases, and the amounts could never meet.
        trackedAmount: transaction.amount,
      });
      scheduledCycles = await scheduledStatementCyclesForFacility(ctx, facility._id);
    }
    if (!scheduledCycles.some((cycle) => statementCycleMatchesPayment(cycle, transaction))) {
      throw new ConvexError('No scheduled card statement matches this transaction');
    }

    const syntheticDedupeKey = cardStatementSyntheticDedupeKey(transaction._id);
    const existingSynthetic = await ctx.db
      .query('transactions')
      .withIndex('by_accountId_and_dedupeKey', (q) =>
        q.eq('accountId', cardAccount._id).eq('dedupeKey', syntheticDedupeKey),
      )
      .unique();
    if (existingSynthetic) {
      throw new ConvexError('This transaction is already registered as a card statement payment');
    }

    const syntheticMetadata = cardStatementSyntheticMetadata(transaction._id);
    let syntheticTransactionId: Id<'transactions'>;
    if (cardAccount.provider === 'manual') {
      const inserted = await insertManualTransactionLeg(ctx, {
        userId: user.id,
        accountId: cardAccount._id,
        direction: 'CRDT',
        amount: transaction.amount,
        bookingDate: transaction.bookingDate,
        description: `Pagamento estratto carta · ${transaction.description}`,
        classificationKind: 'transfer',
        classificationSource: 'user',
        updateBalance: balanceEffect.balanceWillChange,
        transactionPatch: {
          dedupeKey: syntheticDedupeKey,
          providerMetadata: syntheticMetadata,
        },
      });
      syntheticTransactionId = inserted.transactionId;
    } else {
      if (!cardAccount.providerConnectionId) {
        throw new ConvexError('Card account is missing its provider connection');
      }
      const now = Date.now();
      syntheticTransactionId = await ctx.db.insert('transactions', {
        userId: user.id,
        accountId: cardAccount._id,
        providerConnectionId: cardAccount.providerConnectionId,
        provider: 'manual',
        dedupeKey: syntheticDedupeKey,
        status: 'BOOK',
        direction: 'CRDT',
        amount: transaction.amount,
        bookingDate: transaction.bookingDate,
        transactionDate: transaction.bookingDate,
        description: `Pagamento estratto carta · ${transaction.description}`,
        classificationKind: 'transfer',
        classificationSource: 'user',
        classificationConfidence: 1,
        providerMetadata: syntheticMetadata,
        importedAtMs: now,
        updatedAtMs: now,
      });
    }

    const transferMatchId = await createConfirmedTransferMatch(ctx, {
      userId: user.id,
      outgoingTransactionId: transaction._id,
      incomingTransactionId: syntheticTransactionId,
      notes: 'Missing card statement leg created after explicit user confirmation.',
      source: 'user',
    });
    const settledCycle = await getUsageCycleLinkedToTransaction(ctx, syntheticTransactionId);
    if (!settledCycle || settledCycle.creditFacilityId !== facility._id || settledCycle.status !== 'paid') {
      throw new ConvexError('The card statement cycle could not be settled');
    }

    if (cardAccount.provider !== 'manual') {
      await scheduleSyntheticCardStatementReconciliation(ctx, syntheticTransactionId);
    }

    return {
      transactionId: transaction._id,
      syntheticTransactionId,
      transferMatchId,
      usageCycleId: settledCycle._id,
    };
  },
});

export const closeCreditFacilityUsageCycle = mutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
    cycleMonth: v.optional(v.string()),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);
    if (facility.facilityType !== 'cardCreditLine') {
      throw new ConvexError('Only card credit lines have monthly statement cycles');
    }
    const cycleMonth =
      args.cycleMonth ?? (await earliestOpenUsageCycle(ctx, facility._id))?.cycleMonth ?? currentCycleMonth();
    const closeInputs = await usageCycleCloseInputs(ctx, facility);
    const cycleId = await closeUsageCycleCore(ctx, {
      facility,
      cycleMonth,
      dueDate: args.dueDate,
      allowZeroAmount: false,
      ...closeInputs,
    });
    return cycleId!;
  },
});

export const autoCloseDueUsageCycles = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const facilities = await ctx.db
      .query('creditFacilities')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .take(Math.min(args.limit ?? 200, 200));
    const today = todayIsoDate();
    let closed = 0;

    for (const facility of facilities) {
      // Monthly statement cycles apply only to primary card credit lines; overdrafts and
      // additional card lines (installment-repaid) must never be auto-closed.
      if (facility.facilityType !== 'cardCreditLine') {
        continue;
      }
      const openCycles = await ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_creditFacilityId_and_status', (q) => q.eq('creditFacilityId', facility._id).eq('status', 'open'))
        .take(100);
      const openCycle: Doc<'creditFacilityUsageCycles'> | undefined = openCycles
        .sort((left, right) => left.cycleMonth.localeCompare(right.cycleMonth))
        .at(0);
      const cycleMonth = openCycle?.cycleMonth ?? currentCycleMonth();
      const existingCycle = await getUsageCycleForFacilityMonth(ctx, {
        userId: facility.userId,
        creditFacilityId: facility._id,
        cycleMonth,
      });
      if (existingCycle?.status === 'scheduled') {
        continue;
      }
      const closeInputs = await usageCycleCloseInputs(ctx, facility);
      const amountToEvaluate = openCycle?.trackedAmount ?? closeInputs.trackedAmount;
      if (today <= usageCycleCloseBoundary(facility, cycleMonth) || amountToEvaluate.amountMinor < 0n) {
        continue;
      }

      const cycleId = await closeUsageCycleCore(ctx, {
        facility,
        cycleMonth,
        allowZeroAmount: true,
        ...closeInputs,
      });
      if (cycleId) {
        closed += 1;
      }
    }

    return { closed };
  },
});

export const setCreditFacilityUsageCycleStatus = mutation({
  args: {
    usageCycleId: v.id('creditFacilityUsageCycles'),
    status: closedUsageCycleStatusValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const cycle = await getOwnedUsageCycle(ctx, user.id, args.usageCycleId);
    if (cycle.status !== 'scheduled' && cycle.status !== args.status) {
      throw new ConvexError('Only scheduled credit usage cycles can be marked paid or cancelled');
    }

    const now = Date.now();
    await ctx.db.patch('creditFacilityUsageCycles', cycle._id, {
      status: args.status,
      paidAtMs: args.status === 'paid' ? now : cycle.paidAtMs,
      updatedAtMs: now,
    });

    return cycle._id;
  },
});

async function getUsageCycleLinkedToTransaction(ctx: DbCtx, transactionId: Id<'transactions'>) {
  return await ctx.db
    .query('creditFacilityUsageCycles')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', transactionId))
    .first();
}

export const confirmUsageCyclePaymentTransaction = mutation({
  args: {
    usageCycleId: v.id('creditFacilityUsageCycles'),
    transactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const cycle = await getOwnedUsageCycle(ctx, user.id, args.usageCycleId);

    if (cycle.status === 'paid' && cycle.transactionId === args.transactionId) {
      return cycle._id;
    }

    if (cycle.status !== 'scheduled') {
      throw new ConvexError('Only scheduled credit usage cycles can be linked to a payment');
    }

    const facility = await getOwnedFacility(ctx, user.id, cycle.creditFacilityId);

    // CARD-linked facilities settle through the transfer flow (checking DBIT
    // matched with a card CRDT); reclassifying the checking debit as internal
    // here would orphan the card leg and break double entry.
    if (await linkedCardAccountForFacility(ctx, facility)) {
      throw new ConvexError('This card settles through transfer matching with its card account');
    }

    const transaction = await ctx.db.get('transactions', args.transactionId);
    if (!transaction || transaction.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }

    if (!isRepaymentLinkableTransaction(transaction) || transaction.status !== 'BOOK') {
      throw new ConvexError('Only booked debit transactions can be linked to statement payments');
    }

    await assertTransactionMatchesFacilityAccount(ctx, transaction, facility);
    assertSameCurrency('Transaction', transaction.amount, 'statement cycle', cycle.trackedAmount);

    const existingInstallmentPayments = await listInstallmentPaymentsForTransaction(ctx, transaction._id);
    if (existingInstallmentPayments.length > 0) {
      throw new ConvexError('Transaction is already linked to installment payments');
    }

    if (await getUsageCycleLinkedToTransaction(ctx, transaction._id)) {
      throw new ConvexError('Transaction is already linked to another statement cycle');
    }

    const now = Date.now();
    await ctx.db.patch('creditFacilityUsageCycles', cycle._id, {
      status: 'paid',
      transactionId: transaction._id,
      paidAtMs: now,
      updatedAtMs: now,
    });

    // Statement settlements always repay card spending the Plan already counted.
    await ctx.db.patch('transactions', transaction._id, {
      classificationKind: 'internal',
      classificationSource: 'user',
      classificationConfidence: 1,
      updatedAtMs: now,
    });
    await invalidatePlanSnapshots(ctx, user.id, [transaction.bookingDate]);

    return cycle._id;
  },
});

export const listUsageCyclePaymentCandidates = query({
  args: {
    daysWindow: v.optional(v.number()),
    limit: v.optional(v.number()),
    asOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 20, 50);
    const requestedDaysWindow = args.daysWindow ?? 14;
    if (!Number.isInteger(requestedDaysWindow) || requestedDaysWindow < 0) {
      throw new ConvexError('Days window must be a non-negative integer');
    }
    const daysWindow = Math.min(requestedDaysWindow, 45);
    const asOfDate = args.asOfDate ?? todayIsoDate();

    const scheduledCycles = await ctx.db
      .query('creditFacilityUsageCycles')
      .withIndex('by_userId_and_status_and_dueDate', (q) => q.eq('userId', user.id).eq('status', 'scheduled'))
      .take(50);

    const candidates = [];
    for (const cycle of scheduledCycles) {
      const facility = await ctx.db.get('creditFacilities', cycle.creditFacilityId);
      if (!facility || facility.userId !== user.id) {
        continue;
      }

      // CARD-linked facilities settle via transfer matching instead.
      if (await linkedCardAccountForFacility(ctx, facility)) {
        continue;
      }

      const fromDate = addDaysToIsoDate(cycle.dueDate, -daysWindow);
      const toDate = addDaysToIsoDate(cycle.dueDate, daysWindow);
      const transactions = facility.linkedAccountId
        ? await ctx.db
            .query('transactions')
            .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
              q
                .eq('userId', user.id)
                .eq('accountId', facility.linkedAccountId!)
                .gte('bookingDate', fromDate)
                .lte('bookingDate', toDate),
            )
            .take(200)
        : await ctx.db
            .query('transactions')
            .withIndex('by_userId_and_bookingDate', (q) =>
              q.eq('userId', user.id).gte('bookingDate', fromDate).lte('bookingDate', toDate),
            )
            .take(200);

      const toleranceMinor = installmentPaymentToleranceMinor(cycle.trackedAmount.amountMinor);
      let best: {
        transaction: Doc<'transactions'>;
        amountDeltaMinor: bigint;
        dayDelta: number;
      } | null = null;
      for (const transaction of transactions) {
        if (!isRepaymentSuggestionCandidate(transaction)) {
          continue;
        }

        if (transaction.amount.currency !== cycle.trackedAmount.currency) {
          continue;
        }

        const amountDeltaMinor = absoluteMinorUnits(transaction.amount.amountMinor - cycle.trackedAmount.amountMinor);
        if (amountDeltaMinor > toleranceMinor) {
          continue;
        }

        const dayDelta = Math.abs(daysBetweenIsoDates(transaction.bookingDate, cycle.dueDate));
        if (
          best &&
          (best.amountDeltaMinor < amountDeltaMinor ||
            (best.amountDeltaMinor === amountDeltaMinor && best.dayDelta <= dayDelta))
        ) {
          continue;
        }

        const linkedPayments = await listInstallmentPaymentsForTransaction(ctx, transaction._id);
        if (linkedPayments.length > 0) {
          continue;
        }

        if (await getUsageCycleLinkedToTransaction(ctx, transaction._id)) {
          continue;
        }

        best = { transaction, amountDeltaMinor, dayDelta };
      }

      if (!best) {
        continue;
      }

      candidates.push({
        usageCycleId: cycle._id,
        cycleMonth: cycle.cycleMonth,
        dueDate: cycle.dueDate,
        trackedAmount: cycle.trackedAmount,
        facility: {
          _id: facility._id,
          name: facility.name,
          facilityType: facility.facilityType,
        },
        transaction: best.transaction,
        amountDelta: {
          amountMinor: best.amountDeltaMinor,
          currency: cycle.trackedAmount.currency,
        },
        dateDeltaDays: best.dayDelta,
        confirmable: best.transaction.status === 'BOOK',
        confidence: installmentCandidateConfidence({
          amountDeltaMinor: best.amountDeltaMinor,
          expectedAmountMinor: cycle.trackedAmount.amountMinor,
          dayDelta: best.dayDelta,
        }),
        isOverdue: cycle.dueDate < asOfDate,
      });
    }

    return candidates.sort((left, right) => left.dueDate.localeCompare(right.dueDate)).slice(0, limit);
  },
});

export const createInstallmentPlan = mutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
    name: v.string(),
    principalAmount: moneyAmountValidator,
    monthlyPaymentAmount: v.optional(moneyAmountValidator),
    defaultPrincipalAmount: v.optional(moneyAmountValidator),
    defaultInterestAmount: v.optional(moneyAmountValidator),
    defaultFeeAmount: v.optional(moneyAmountValidator),
    installmentCount: v.optional(v.number()),
    startDate: v.string(),
    nextPaymentDate: v.optional(v.string()),
    linkedTransactionId: v.optional(v.id('transactions')),
    addToFacilityUsage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);

    return await createInstallmentPlanForUserCore(ctx, {
      userId: user.id,
      facility,
      name: args.name,
      principalAmount: args.principalAmount,
      monthlyPaymentAmount: args.monthlyPaymentAmount,
      defaultPrincipalAmount: args.defaultPrincipalAmount,
      defaultInterestAmount: args.defaultInterestAmount,
      defaultFeeAmount: args.defaultFeeAmount,
      installmentCount: args.installmentCount,
      startDate: args.startDate,
      nextPaymentDate: args.nextPaymentDate,
      linkedTransactionId: args.linkedTransactionId,
      addToFacilityUsage: args.addToFacilityUsage,
    });
  },
});

export const updateInstallmentPlan = mutation({
  args: {
    installmentPlanId: v.id('creditFacilityInstallmentPlans'),
    creditFacilityId: v.id('creditFacilities'),
    name: v.string(),
    monthlyPaymentAmount: moneyAmountValidator,
    nextPaymentDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await getOwnedInstallmentPlan(ctx, user.id, args.installmentPlanId);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);
    const name = args.name.trim();

    if (plan.status !== 'active') {
      throw new ConvexError('Installment plan is not active');
    }

    if (!name) {
      throw new ConvexError('Installment plan name is required');
    }

    if (!args.nextPaymentDate.trim()) {
      throw new ConvexError('Next payment date is required');
    }

    assertPositiveMoney('Monthly payment amount', args.monthlyPaymentAmount);
    assertSameCurrency('Monthly payment amount', args.monthlyPaymentAmount, 'installment plan', plan.outstandingAmount);
    assertSameCurrency('Credit facility', facility.limitAmount, 'installment plan', plan.outstandingAmount);

    await ctx.db.patch('creditFacilityInstallmentPlans', plan._id, {
      creditFacilityId: facility._id,
      name,
      monthlyPaymentAmount: args.monthlyPaymentAmount,
      nextPaymentDate: args.nextPaymentDate,
      endDate: addMonthsToIsoDate(args.nextPaymentDate, Math.max(0, plan.remainingInstallments - 1)),
      updatedAtMs: Date.now(),
    });

    await syncInstallmentPlanBucketsAfterChange(ctx, user.id, [plan.nextPaymentDate, args.nextPaymentDate]);
    return plan._id;
  },
});

export const recordInstallmentPayment = mutation({
  args: {
    installmentPlanId: v.id('creditFacilityInstallmentPlans'),
    amount: moneyAmountValidator,
    principalAmount: v.optional(moneyAmountValidator),
    interestAmount: v.optional(moneyAmountValidator),
    feeAmount: v.optional(moneyAmountValidator),
    remainingInstallments: v.optional(v.number()),
    nextPaymentDate: v.optional(v.string()),
    paymentDate: v.optional(v.string()),
    scheduledDueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const plan = await getOwnedInstallmentPlan(ctx, user.id, args.installmentPlanId);
    const facility = await getOwnedFacility(ctx, user.id, plan.creditFacilityId);

    const paymentDate = args.paymentDate ?? todayIsoDate();
    const scheduledDueDate = args.scheduledDueDate ?? plan.nextPaymentDate ?? paymentDate;
    const paymentId = await applyInstallmentPayment(ctx, {
      userId: user.id,
      plan,
      facility,
      amount: args.amount,
      principalAmount: args.principalAmount,
      interestAmount: args.interestAmount,
      feeAmount: args.feeAmount,
      paymentDate,
      scheduledDueDate,
      source: 'manual',
      remainingInstallments: args.remainingInstallments,
      nextPaymentDate: args.nextPaymentDate,
      notes: args.notes,
    });
    await syncInstallmentPlanBucketsAfterChange(ctx, user.id, [paymentDate, scheduledDueDate]);
    return paymentId;
  },
});

async function recordExpectedInstallmentPaymentForUserCore(
  ctx: MutationCtx,
  args: {
    userId: string;
    installmentPlanId: Id<'creditFacilityInstallmentPlans'>;
    paymentDate?: string;
    scheduledDueDate?: string;
  },
) {
  const plan = await getOwnedInstallmentPlan(ctx, args.userId, args.installmentPlanId);
  const facility = await getOwnedFacility(ctx, args.userId, plan.creditFacilityId);
  const amount = expectedInstallmentPaymentAmount(plan);
  const defaultBreakdown = expectedInstallmentPaymentBreakdown(plan, amount);
  const scheduledDueDate = args.scheduledDueDate ?? plan.nextPaymentDate ?? todayIsoDate();

  const paymentDate = args.paymentDate ?? scheduledDueDate;
  const paymentId = await applyInstallmentPayment(ctx, {
    userId: args.userId,
    plan,
    facility,
    amount,
    principalAmount: defaultBreakdown.principalAmount,
    interestAmount: defaultBreakdown.interestAmount,
    feeAmount: defaultBreakdown.feeAmount,
    paymentDate,
    scheduledDueDate,
    source: 'manual',
  });
  await syncInstallmentPlanBucketsAfterChange(ctx, args.userId, [paymentDate, scheduledDueDate]);
  return paymentId;
}

async function backfillExpectedInstallmentPaymentsForUserCore(
  ctx: MutationCtx,
  args: {
    userId: string;
    installmentPlanId: Id<'creditFacilityInstallmentPlans'>;
    throughScheduledDueDate: string;
    notes?: string;
  },
) {
  const initialPlan = await getOwnedInstallmentPlan(ctx, args.userId, args.installmentPlanId);
  if (initialPlan.status !== 'active') {
    throw new ConvexError('Installment plan is not active');
  }

  const paidInstallments = Math.max(0, initialPlan.installmentCount - initialPlan.remainingInstallments);
  const firstDueDate = addMonthsToIsoDate(initialPlan.startDate, paidInstallments);
  if (args.throughScheduledDueDate < firstDueDate) {
    return {
      paymentIds: [],
      recordedInstallments: 0,
      throughScheduledDueDate: args.throughScheduledDueDate,
    };
  }

  const dueDates = [];
  for (let index = 0; index < initialPlan.remainingInstallments; index += 1) {
    const dueDate = addMonthsToIsoDate(firstDueDate, index);
    if (dueDate > args.throughScheduledDueDate) {
      break;
    }
    const existingPayment = await getExistingInstallmentPaymentForScheduledDueDate(ctx, initialPlan._id, dueDate);
    if (existingPayment) {
      continue;
    }
    dueDates.push(dueDate);
    if (dueDates.length >= 120) {
      break;
    }
  }

  if (dueDates.length === 0) {
    return {
      paymentIds: [],
      recordedInstallments: 0,
      throughScheduledDueDate: args.throughScheduledDueDate,
    };
  }

  const paymentIds: Array<Id<'creditFacilityInstallmentPayments'>> = [];
  for (const dueDate of dueDates) {
    const plan = await getOwnedInstallmentPlan(ctx, args.userId, args.installmentPlanId);
    if (plan.status !== 'active') {
      break;
    }
    const facility = await getOwnedFacility(ctx, args.userId, plan.creditFacilityId);
    const amount = expectedInstallmentPaymentAmount(plan);
    const defaultBreakdown = expectedInstallmentPaymentBreakdown(plan, amount);
    const paymentId = await applyInstallmentPayment(ctx, {
      userId: args.userId,
      plan,
      facility,
      amount,
      principalAmount: defaultBreakdown.principalAmount,
      interestAmount: defaultBreakdown.interestAmount,
      feeAmount: defaultBreakdown.feeAmount,
      paymentDate: dueDate,
      scheduledDueDate: dueDate,
      source: 'manual',
      nextPaymentDate: addMonthsToIsoDate(dueDate, 1),
      notes: args.notes ?? 'Historical installment backfill',
    });
    paymentIds.push(paymentId);
  }

  await syncInstallmentPlanBucketsAfterChange(ctx, args.userId, dueDates);
  return {
    paymentIds,
    recordedInstallments: paymentIds.length,
    throughScheduledDueDate: args.throughScheduledDueDate,
  };
}

export const recordExpectedInstallmentPayment = mutation({
  args: {
    installmentPlanId: v.id('creditFacilityInstallmentPlans'),
    paymentDate: v.optional(v.string()),
    scheduledDueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await recordExpectedInstallmentPaymentForUserCore(ctx, {
      userId: user.id,
      installmentPlanId: args.installmentPlanId,
      paymentDate: args.paymentDate,
      scheduledDueDate: args.scheduledDueDate,
    });
  },
});

export const backfillExpectedInstallmentPayments = mutation({
  args: {
    installmentPlanId: v.id('creditFacilityInstallmentPlans'),
    throughScheduledDueDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await backfillExpectedInstallmentPaymentsForUserCore(ctx, {
      userId: user.id,
      installmentPlanId: args.installmentPlanId,
      throughScheduledDueDate: args.throughScheduledDueDate,
      notes: args.notes,
    });
  },
});

export const confirmInstallmentPaymentTransaction = mutation({
  args: {
    installmentPlanId: v.id('creditFacilityInstallmentPlans'),
    transactionId: v.id('transactions'),
    principalAmount: v.optional(moneyAmountValidator),
    interestAmount: v.optional(moneyAmountValidator),
    feeAmount: v.optional(moneyAmountValidator),
    scheduledDueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await confirmInstallmentPaymentTransactionForUserCore(ctx, {
      userId: user.id,
      installmentPlanId: args.installmentPlanId,
      transactionId: args.transactionId,
      principalAmount: args.principalAmount,
      interestAmount: args.interestAmount,
      feeAmount: args.feeAmount,
      scheduledDueDate: args.scheduledDueDate,
      notes: args.notes,
    });
  },
});

export const confirmInstallmentPaymentTransactionBatch = mutation({
  args: {
    transactionId: v.id('transactions'),
    allocations: v.array(installmentPaymentAllocationValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await confirmInstallmentPaymentTransactionBatchForUserCore(ctx, {
      userId: user.id,
      transactionId: args.transactionId,
      allocations: args.allocations,
    });
  },
});

export const confirmInstallmentPaymentTransactionForUser = internalMutation({
  args: {
    userId: v.string(),
    installmentPlanId: v.id('creditFacilityInstallmentPlans'),
    transactionId: v.id('transactions'),
    principalAmount: v.optional(moneyAmountValidator),
    interestAmount: v.optional(moneyAmountValidator),
    feeAmount: v.optional(moneyAmountValidator),
    scheduledDueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await confirmInstallmentPaymentTransactionForUserCore(ctx, args);
  },
});

export const recordExpectedInstallmentPaymentForUser = internalMutation({
  args: {
    userId: v.string(),
    installmentPlanId: v.id('creditFacilityInstallmentPlans'),
    paymentDate: v.optional(v.string()),
    scheduledDueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await recordExpectedInstallmentPaymentForUserCore(ctx, args);
  },
});

export const confirmInstallmentPaymentTransactionBatchForUser = internalMutation({
  args: {
    userId: v.string(),
    transactionId: v.id('transactions'),
    allocations: v.array(installmentPaymentAllocationValidator),
  },
  handler: async (ctx, args) => {
    return await confirmInstallmentPaymentTransactionBatchForUserCore(ctx, args);
  },
});
