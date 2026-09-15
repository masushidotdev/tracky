import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { isLoanFacilityType, moneyAmountValidator } from '../lib/validators';
import {
  createInstallmentPlanForUserCore,
  getOwnedFacility,
  syncInstallmentPlanBucketsAfterChange,
} from './credit';
import {
  addMonthsToIsoDate,
  buildLoanPayoffProjection,
  estimateInstallmentPaymentMinor,
  monthsBetweenIsoDates,
} from './creditMath';
import { validateSettlementAccount } from './creditValidation';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

type DbCtx = QueryCtx | MutationCtx;
type MoneyAmount = { amountMinor: bigint; currency: string };

const loanFacilityTypeValidator = v.union(
  v.literal('mortgage'),
  v.literal('autoLoan'),
  v.literal('personalLoan'),
);

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function assertIsoDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConvexError(`${label} must be an ISO date`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ConvexError(`${label} must be an ISO date`);
  }
}

function assertLoanName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ConvexError('Loan name is required');
  }
  return trimmed;
}

function assertAnnualRate(annualRateBps: number) {
  if (!Number.isInteger(annualRateBps) || annualRateBps < 0) {
    throw new ConvexError('Annual nominal rate must be a non-negative integer');
  }
}

function assertMoney(name: string, amount: MoneyAmount, options: { allowZero?: boolean } = {}) {
  if (options.allowZero ? amount.amountMinor < 0n : amount.amountMinor <= 0n) {
    throw new ConvexError(`${name} must be ${options.allowZero ? 'non-negative' : 'greater than zero'}`);
  }
}

function assertSameCurrency(name: string, amount: MoneyAmount, currency: string) {
  if (amount.currency !== currency) {
    throw new ConvexError(`${name} currency must match the loan currency`);
  }
}

function assertFinalPayment(finalPaymentAmount: MoneyAmount | undefined, currentBalance: MoneyAmount) {
  if (!finalPaymentAmount) return;
  assertMoney('Final payment amount', finalPaymentAmount);
  assertSameCurrency('Final payment amount', finalPaymentAmount, currentBalance.currency);
  if (finalPaymentAmount.amountMinor >= currentBalance.amountMinor) {
    throw new ConvexError('Final payment amount must be less than the current loan balance');
  }
}

// A stored next payment date drifts into the past between one edit and the next. Projecting from it
// would spend instalments that have already been paid, so the curve would claim a balance lower than
// the one owed today and reach zero years early.
function nextDueDateOnOrAfter(date: string, today: string) {
  let candidate = date;
  for (let index = 0; index < 1200 && candidate < today; index += 1) {
    candidate = addMonthsToIsoDate(candidate, 1);
  }
  return candidate;
}

// The term is whatever the contract says when the user has told us; only otherwise is it derived from
// the rate and the instalment.
function resolveLoanTerm(input: {
  outstandingMinor: bigint;
  annualRateBps: number;
  monthlyPaymentMinor: bigint;
  escrowMinor: bigint;
  finalPaymentMinor?: bigint;
  firstPaymentDate: string;
  maturityDate?: string;
}) {
  if (input.maturityDate) {
    const months = monthsBetweenIsoDates(input.firstPaymentDate, input.maturityDate) + 1;
    if (months <= 0) {
      throw new ConvexError('Maturity date cannot precede the next instalment');
    }
    return { months, payoffDate: input.maturityDate };
  }
  const projection = assertAmortisingTerms(input);
  return { months: projection.months, payoffDate: projection.payoffDate };
}

function assertMaturityDate(maturityDate: string | undefined, firstPaymentDate: string) {
  if (!maturityDate) return;
  assertIsoDate(maturityDate, 'Maturity date');
  if (maturityDate < firstPaymentDate) {
    throw new ConvexError('Maturity date cannot precede the next instalment');
  }
}

// With a contractual end date the term is known, so the curve is drawn over it instead of being
// derived from a rate and an instalment that only approximate what the lender actually does.
function buildLoanProjection(input: {
  outstandingMinor: bigint;
  annualRateBps: number;
  monthlyPaymentMinor: bigint;
  escrowMinor?: bigint;
  finalPaymentMinor?: bigint;
  startDate: string;
  maturityDate?: string;
}) {
  const months = input.maturityDate ? monthsBetweenIsoDates(input.startDate, input.maturityDate) + 1 : null;
  if (months !== null && months > 0) {
    const projection = buildLoanPayoffProjection({
      outstandingMinor: input.outstandingMinor,
      annualRateBps: input.annualRateBps,
      monthlyPaymentMinor:
        estimateInstallmentPaymentMinor(input.outstandingMinor, input.annualRateBps, months) +
        (input.escrowMinor ?? 0n),
      escrowMinor: input.escrowMinor,
      finalPaymentMinor: input.finalPaymentMinor,
      startDate: input.startDate,
      maxMonths: months,
    });
    return { ...projection, months, payoffDate: input.maturityDate ?? projection.payoffDate };
  }

  return buildLoanPayoffProjection(input);
}

function assertOriginalPrincipal(originalPrincipalAmount: MoneyAmount | undefined, outstanding: MoneyAmount) {
  if (!originalPrincipalAmount) return;
  assertMoney('Original principal amount', originalPrincipalAmount);
  assertSameCurrency('Original principal amount', originalPrincipalAmount, outstanding.currency);
  if (originalPrincipalAmount.amountMinor < outstanding.amountMinor) {
    throw new ConvexError('Original principal amount cannot be lower than the current loan balance');
  }
}

// Share of the borrowed capital already repaid. Percent is capped at 100 and floored at 0 so a stale
// original principal cannot render a bar past its track.
export function loanRepaymentProgress(
  originalPrincipalAmount: MoneyAmount | undefined,
  outstanding: MoneyAmount,
) {
  if (!originalPrincipalAmount || originalPrincipalAmount.amountMinor <= 0n) {
    return null;
  }
  const repaidMinor =
    originalPrincipalAmount.amountMinor > outstanding.amountMinor
      ? originalPrincipalAmount.amountMinor - outstanding.amountMinor
      : 0n;
  const percent = Number((repaidMinor * 10000n) / originalPrincipalAmount.amountMinor) / 100;

  return {
    originalPrincipalAmount,
    repaidAmount: { amountMinor: repaidMinor, currency: originalPrincipalAmount.currency },
    outstandingAmount: outstanding,
    percent: Math.min(100, Math.max(0, percent)),
  };
}

function assertAmortisingTerms(input: {
  outstandingMinor: bigint;
  annualRateBps: number;
  monthlyPaymentMinor: bigint;
  escrowMinor: bigint;
  finalPaymentMinor?: bigint;
  firstPaymentDate: string;
}): ReturnType<typeof buildLoanPayoffProjection> & { months: number } {
  const projection = buildLoanPayoffProjection({
    outstandingMinor: input.outstandingMinor,
    annualRateBps: input.annualRateBps,
    monthlyPaymentMinor: input.monthlyPaymentMinor,
    escrowMinor: input.escrowMinor,
    finalPaymentMinor: input.finalPaymentMinor,
    startDate: input.firstPaymentDate,
  });
  if (projection.months === null) {
    throw new ConvexError('The minimum payment does not amortise this loan within 600 months');
  }
  return { ...projection, months: projection.months };
}

async function getLoanPlan(ctx: DbCtx, userId: string, facilityId: Id<'creditFacilities'>) {
  const plans = await ctx.db
    .query('creditFacilityInstallmentPlans')
    .withIndex('by_creditFacilityId', (q) => q.eq('creditFacilityId', facilityId))
    .order('desc')
    .take(10);
  const ownedPlans = plans.filter((plan) => plan.userId === userId);
  const plan = ownedPlans.find((candidate) => candidate.status === 'active') ?? ownedPlans.at(0);
  if (!plan) {
    throw new ConvexError('Loan amortisation plan not found');
  }
  return plan;
}

async function validatePairedPlanBucket(
  ctx: DbCtx,
  userId: string,
  bucketId: Id<'planBuckets'>,
  currency: string,
) {
  const bucket = await ctx.db.get('planBuckets', bucketId);
  if (!bucket || bucket.userId !== userId) {
    throw new ConvexError('Plan bucket not found');
  }
  const plan = await ctx.db.get('plans', bucket.planId);
  if (!plan || plan.userId !== userId) {
    throw new ConvexError('Plan not found');
  }
  if (plan.currency !== currency) {
    throw new ConvexError('The paired Plan bucket must use the loan currency');
  }
  return bucket;
}

function assertLoanFacility(facility: Doc<'creditFacilities'>) {
  if (!isLoanFacilityType(facility.facilityType)) {
    throw new ConvexError('Credit facility is not a mortgage or loan');
  }
}

function assertReclassifiableFacility(facility: Doc<'creditFacilities'>) {
  if (facility.facilityType !== 'installmentCredit' && !isLoanFacilityType(facility.facilityType)) {
    throw new ConvexError('Only installment credit contracts and loans can be reclassified');
  }
}

async function getActiveInstallmentPlan(ctx: DbCtx, userId: string, facilityId: Id<'creditFacilities'>) {
  const plans = await ctx.db
    .query('creditFacilityInstallmentPlans')
    .withIndex('by_creditFacilityId_and_status', (q) => q.eq('creditFacilityId', facilityId).eq('status', 'active'))
    .take(10);
  const plan = plans.find((candidate) => candidate.userId === userId);
  if (!plan) {
    throw new ConvexError('Active installment plan not found');
  }
  return plan;
}

export const createLoanAccount = mutation({
  args: {
    name: v.string(),
    loanType: loanFacilityTypeValidator,
    currentBalance: moneyAmountValidator,
    originalPrincipalAmount: v.optional(moneyAmountValidator),
    annualNominalRateBps: v.number(),
    minimumPaymentAmount: moneyAmountValidator,
    escrowAmount: v.optional(moneyAmountValidator),
    finalPaymentAmount: v.optional(moneyAmountValidator),
    settlementAccountId: v.optional(v.id('financialAccounts')),
    firstPaymentDate: v.optional(v.string()),
    maturityDate: v.optional(v.string()),
    pairedPlanBucketId: v.optional(v.id('planBuckets')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const name = assertLoanName(args.name);
    assertMoney('Current balance', args.currentBalance);
    assertMoney('Minimum payment amount', args.minimumPaymentAmount);
    assertSameCurrency('Minimum payment amount', args.minimumPaymentAmount, args.currentBalance.currency);
    assertAnnualRate(args.annualNominalRateBps);

    const escrowAmount = args.escrowAmount ?? { amountMinor: 0n, currency: args.currentBalance.currency };
    assertMoney('Escrow amount', escrowAmount, { allowZero: true });
    assertSameCurrency('Escrow amount', escrowAmount, args.currentBalance.currency);
    assertFinalPayment(args.finalPaymentAmount, args.currentBalance);
    assertOriginalPrincipal(args.originalPrincipalAmount, args.currentBalance);
    const firstPaymentDate = args.firstPaymentDate ?? addMonthsToIsoDate(todayIsoDate(), 1);
    assertIsoDate(firstPaymentDate, 'First payment date');

    if (args.settlementAccountId) {
      await validateSettlementAccount(ctx, user.id, args.settlementAccountId, args.currentBalance.currency);
    }
    if (args.pairedPlanBucketId) {
      await validatePairedPlanBucket(ctx, user.id, args.pairedPlanBucketId, args.currentBalance.currency);
    }

    // The balance entered is today's, so the schedule starts at the next instalment still to come.
    // A loan added years into its life keeps its contractual first payment on the facility, but its
    // plan must not project instalments that were paid before Tracky knew about it.
    const scheduleStartDate = nextDueDateOnOrAfter(firstPaymentDate, todayIsoDate());
    assertMaturityDate(args.maturityDate, scheduleStartDate);
    const term = resolveLoanTerm({
      outstandingMinor: args.currentBalance.amountMinor,
      annualRateBps: args.annualNominalRateBps,
      monthlyPaymentMinor: args.minimumPaymentAmount.amountMinor,
      escrowMinor: escrowAmount.amountMinor,
      finalPaymentMinor: args.finalPaymentAmount?.amountMinor,
      firstPaymentDate: scheduleStartDate,
      maturityDate: args.maturityDate,
    });
    const now = Date.now();
    const facilityId = await ctx.db.insert('creditFacilities', {
      userId: user.id,
      name,
      facilityType: args.loanType,
      status: 'active',
      source: 'manual',
      settlementAccountId: args.settlementAccountId,
      provider: 'manual',
      limitAmount: args.currentBalance,
      usedAmount: args.currentBalance,
      originalPrincipalAmount: args.originalPrincipalAmount,
      minimumPaymentAmount: args.minimumPaymentAmount,
      escrowAmount: args.escrowAmount,
      finalPaymentAmount: args.finalPaymentAmount,
      firstPaymentDate,
      maturityDate: args.maturityDate,
      pairedPlanBucketId: args.pairedPlanBucketId,
      repaymentType: 'installmentPlan',
      standardInstallmentMonths: term.months,
      annualNominalRateBps: args.annualNominalRateBps,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const facility = await getOwnedFacility(ctx, user.id, facilityId);
    const planId = await createInstallmentPlanForUserCore(ctx, {
      userId: user.id,
      facility,
      name,
      principalAmount: args.currentBalance,
      monthlyPaymentAmount: args.minimumPaymentAmount,
      installmentCount: term.months,
      startDate: scheduleStartDate,
      nextPaymentDate: scheduleStartDate,
      addToFacilityUsage: false,
    });

    return { creditFacilityId: facilityId, installmentPlanId: planId };
  },
});

export const reclassifyFacilityAsLoan = mutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
    loanType: loanFacilityTypeValidator,
    minimumPaymentAmount: v.optional(moneyAmountValidator),
    originalPrincipalAmount: v.optional(v.union(moneyAmountValidator, v.null())),
    maturityDate: v.optional(v.union(v.string(), v.null())),
    annualNominalRateBps: v.optional(v.number()),
    escrowAmount: v.optional(v.union(moneyAmountValidator, v.null())),
    finalPaymentAmount: v.optional(v.union(moneyAmountValidator, v.null())),
    settlementAccountId: v.optional(v.union(v.id('financialAccounts'), v.null())),
    pairedPlanBucketId: v.optional(v.union(v.id('planBuckets'), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);
    assertReclassifiableFacility(facility);
    const plan = await getActiveInstallmentPlan(ctx, user.id, facility._id);
    const currency = facility.limitAmount.currency;
    const minimumPaymentAmount = args.minimumPaymentAmount ?? plan.monthlyPaymentAmount;
    const annualNominalRateBps = args.annualNominalRateBps ?? facility.annualNominalRateBps ?? 0;
    const finalPaymentAmount =
      args.finalPaymentAmount === undefined ? facility.finalPaymentAmount : (args.finalPaymentAmount ?? undefined);

    assertMoney('Minimum payment amount', minimumPaymentAmount);
    assertSameCurrency('Minimum payment amount', minimumPaymentAmount, currency);
    assertAnnualRate(annualNominalRateBps);
    assertFinalPayment(finalPaymentAmount, plan.outstandingAmount);
    // An instalment contract already knows what was borrowed, so keep that figure rather than making
    // the user retype it; only fall back to it when it is still consistent with today's balance.
    const inheritedPrincipal =
      plan.principalAmount.currency === currency &&
      plan.principalAmount.amountMinor >= plan.outstandingAmount.amountMinor
        ? plan.principalAmount
        : undefined;
    const originalPrincipalAmount =
      args.originalPrincipalAmount === undefined
        ? (facility.originalPrincipalAmount ?? inheritedPrincipal)
        : (args.originalPrincipalAmount ?? undefined);
    assertOriginalPrincipal(originalPrincipalAmount, plan.outstandingAmount);

    if (args.escrowAmount) {
      assertMoney('Escrow amount', args.escrowAmount, { allowZero: true });
      assertSameCurrency('Escrow amount', args.escrowAmount, currency);
    }
    if (args.settlementAccountId) {
      await validateSettlementAccount(ctx, user.id, args.settlementAccountId, currency);
    }
    if (args.pairedPlanBucketId) {
      await validatePairedPlanBucket(ctx, user.id, args.pairedPlanBucketId, currency);
    }

    const maturityDate =
      args.maturityDate === undefined ? facility.maturityDate : (args.maturityDate ?? undefined);
    assertMaturityDate(maturityDate, plan.nextPaymentDate ?? plan.startDate);
    const patch: Partial<Doc<'creditFacilities'>> = {
      facilityType: args.loanType,
      minimumPaymentAmount,
      originalPrincipalAmount,
      maturityDate,
      annualNominalRateBps,
      updatedAtMs: Date.now(),
    };
    if (args.escrowAmount !== undefined) {
      patch.escrowAmount = args.escrowAmount ?? undefined;
    }
    if (args.finalPaymentAmount !== undefined) {
      patch.finalPaymentAmount = args.finalPaymentAmount ?? undefined;
    }
    if (args.settlementAccountId !== undefined) {
      patch.settlementAccountId = args.settlementAccountId ?? undefined;
    }
    if (args.pairedPlanBucketId !== undefined) {
      patch.pairedPlanBucketId = args.pairedPlanBucketId ?? undefined;
    }

    await ctx.db.patch('creditFacilities', facility._id, patch);
    return facility._id;
  },
});

export const reclassifyLoanAsInstallmentContract = mutation({
  args: { creditFacilityId: v.id('creditFacilities') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);
    assertReclassifiableFacility(facility);

    await ctx.db.patch('creditFacilities', facility._id, {
      facilityType: 'installmentCredit',
      updatedAtMs: Date.now(),
    });
    return facility._id;
  },
});

export const updateLoanTerms = mutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
    annualNominalRateBps: v.optional(v.number()),
    minimumPaymentAmount: v.optional(moneyAmountValidator),
    originalPrincipalAmount: v.optional(v.union(moneyAmountValidator, v.null())),
    maturityDate: v.optional(v.union(v.string(), v.null())),
    escrowAmount: v.optional(v.union(moneyAmountValidator, v.null())),
    finalPaymentAmount: v.optional(v.union(moneyAmountValidator, v.null())),
    settlementAccountId: v.optional(v.union(v.id('financialAccounts'), v.null())),
    name: v.optional(v.string()),
    pairedPlanBucketId: v.optional(v.union(v.id('planBuckets'), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);
    assertLoanFacility(facility);
    const plan = await getLoanPlan(ctx, user.id, facility._id);
    const currency = facility.limitAmount.currency;
    const name = args.name === undefined ? facility.name : assertLoanName(args.name);
    const annualRateBps = args.annualNominalRateBps ?? facility.annualNominalRateBps ?? 0;
    const minimumPaymentAmount = args.minimumPaymentAmount ?? facility.minimumPaymentAmount ?? plan.monthlyPaymentAmount;
    const escrowAmount =
      args.escrowAmount === undefined
        ? (facility.escrowAmount ?? { amountMinor: 0n, currency })
        : (args.escrowAmount ?? { amountMinor: 0n, currency });
    const finalPaymentAmount =
      args.finalPaymentAmount === undefined ? facility.finalPaymentAmount : (args.finalPaymentAmount ?? undefined);

    assertAnnualRate(annualRateBps);
    assertMoney('Minimum payment amount', minimumPaymentAmount);
    assertSameCurrency('Minimum payment amount', minimumPaymentAmount, currency);
    assertMoney('Escrow amount', escrowAmount, { allowZero: true });
    assertSameCurrency('Escrow amount', escrowAmount, currency);
    assertFinalPayment(finalPaymentAmount, plan.outstandingAmount);
    const originalPrincipalAmount =
      args.originalPrincipalAmount === undefined
        ? facility.originalPrincipalAmount
        : (args.originalPrincipalAmount ?? undefined);
    assertOriginalPrincipal(originalPrincipalAmount, plan.outstandingAmount);

    if (args.settlementAccountId) {
      await validateSettlementAccount(ctx, user.id, args.settlementAccountId, currency);
    }
    if (args.pairedPlanBucketId) {
      await validatePairedPlanBucket(ctx, user.id, args.pairedPlanBucketId, currency);
    }

    const firstPaymentDate = nextDueDateOnOrAfter(
      plan.nextPaymentDate ?? facility.firstPaymentDate ?? addMonthsToIsoDate(todayIsoDate(), 1),
      todayIsoDate(),
    );
    const maturityDate =
      args.maturityDate === undefined ? facility.maturityDate : (args.maturityDate ?? undefined);
    assertMaturityDate(maturityDate, firstPaymentDate);
    const term = resolveLoanTerm({
      outstandingMinor: plan.outstandingAmount.amountMinor,
      annualRateBps,
      monthlyPaymentMinor: minimumPaymentAmount.amountMinor,
      escrowMinor: escrowAmount.amountMinor,
      finalPaymentMinor: finalPaymentAmount?.amountMinor,
      firstPaymentDate,
      maturityDate,
    });
    const paidInstallments = Math.max(0, plan.installmentCount - plan.remainingInstallments);
    const now = Date.now();
    await ctx.db.patch('creditFacilities', facility._id, {
      name,
      annualNominalRateBps: annualRateBps,
      minimumPaymentAmount,
      originalPrincipalAmount,
      escrowAmount:
        args.escrowAmount === undefined ? facility.escrowAmount : (args.escrowAmount ?? undefined),
      finalPaymentAmount:
        args.finalPaymentAmount === undefined ? facility.finalPaymentAmount : (args.finalPaymentAmount ?? undefined),
      settlementAccountId:
        args.settlementAccountId === undefined ? facility.settlementAccountId : (args.settlementAccountId ?? undefined),
      pairedPlanBucketId:
        args.pairedPlanBucketId === undefined ? facility.pairedPlanBucketId : (args.pairedPlanBucketId ?? undefined),
      maturityDate,
      standardInstallmentMonths: term.months,
      updatedAtMs: now,
    });
    await ctx.db.patch('creditFacilityInstallmentPlans', plan._id, {
      name,
      monthlyPaymentAmount: minimumPaymentAmount,
      installmentCount: paidInstallments + term.months,
      remainingInstallments: term.months,
      nextPaymentDate: term.months === 0 ? undefined : firstPaymentDate,
      endDate: term.payoffDate ?? firstPaymentDate,
      status: term.months === 0 ? 'paid' : 'active',
      updatedAtMs: now,
    });
    await syncInstallmentPlanBucketsAfterChange(ctx, user.id, [plan.nextPaymentDate, firstPaymentDate]);

    return facility._id;
  },
});

export const updateLoanBalance = mutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
    currentBalance: moneyAmountValidator,
    adjustmentDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);
    assertLoanFacility(facility);
    const plan = await getLoanPlan(ctx, user.id, facility._id);
    assertMoney('Current balance', args.currentBalance, { allowZero: true });
    assertSameCurrency('Current balance', args.currentBalance, facility.limitAmount.currency);
    const adjustmentDate = args.adjustmentDate ?? todayIsoDate();
    assertIsoDate(adjustmentDate, 'Adjustment date');

    const adjustmentMinor = plan.outstandingAmount.amountMinor - args.currentBalance.amountMinor;
    if (adjustmentMinor === 0n) {
      return { creditFacilityId: facility._id, adjustmentPaymentId: null };
    }

    const firstPaymentDate = nextDueDateOnOrAfter(
      plan.nextPaymentDate ?? facility.firstPaymentDate ?? addMonthsToIsoDate(adjustmentDate, 1),
      todayIsoDate(),
    );
    const minimumPaymentAmount = facility.minimumPaymentAmount ?? plan.monthlyPaymentAmount;
    assertFinalPayment(facility.finalPaymentAmount, args.currentBalance);
    const term = resolveLoanTerm({
      outstandingMinor: args.currentBalance.amountMinor,
      annualRateBps: facility.annualNominalRateBps ?? 0,
      monthlyPaymentMinor: minimumPaymentAmount.amountMinor,
      escrowMinor: facility.escrowAmount?.amountMinor ?? 0n,
      finalPaymentMinor: facility.finalPaymentAmount?.amountMinor,
      firstPaymentDate,
      maturityDate: facility.maturityDate,
    });
    const paidInstallments = Math.max(0, plan.installmentCount - plan.remainingInstallments);
    const now = Date.now();
    const adjustmentPaymentId = await ctx.db.insert('creditFacilityInstallmentPayments', {
      userId: user.id,
      creditFacilityId: facility._id,
      installmentPlanId: plan._id,
      amount: { amountMinor: adjustmentMinor, currency: facility.limitAmount.currency },
      principalAmount: { amountMinor: adjustmentMinor, currency: facility.limitAmount.currency },
      paymentDate: adjustmentDate,
      source: 'manual',
      notes: args.notes?.trim() || 'Loan balance adjustment',
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.patch('creditFacilityInstallmentPlans', plan._id, {
      outstandingAmount: args.currentBalance,
      installmentCount: paidInstallments + term.months,
      remainingInstallments: term.months,
      nextPaymentDate: term.months === 0 ? undefined : firstPaymentDate,
      endDate: term.payoffDate ?? adjustmentDate,
      status: term.months === 0 ? 'paid' : 'active',
      updatedAtMs: now,
    });
    await ctx.db.patch('creditFacilities', facility._id, {
      usedAmount: args.currentBalance,
      standardInstallmentMonths: term.months,
      updatedAtMs: now,
    });
    await syncInstallmentPlanBucketsAfterChange(ctx, user.id, [adjustmentDate, firstPaymentDate]);

    return { creditFacilityId: facility._id, adjustmentPaymentId };
  },
});

export const getLoanOverview = query({
  args: { creditFacilityId: v.id('creditFacilities') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);
    assertLoanFacility(facility);
    const plan = await getLoanPlan(ctx, user.id, facility._id);
    const activePlan = plan.status === 'active' ? plan : null;
    const outstandingAmount = activePlan?.outstandingAmount ?? facility.usedAmount;
    const firstPaymentDate = nextDueDateOnOrAfter(
      activePlan?.nextPaymentDate ?? facility.firstPaymentDate ?? todayIsoDate(),
      todayIsoDate(),
    );
    const payoffProjection = facility.minimumPaymentAmount
      ? buildLoanProjection({
          outstandingMinor: outstandingAmount.amountMinor,
          annualRateBps: facility.annualNominalRateBps ?? 0,
          monthlyPaymentMinor: facility.minimumPaymentAmount.amountMinor,
          escrowMinor: facility.escrowAmount?.amountMinor,
          finalPaymentMinor: facility.finalPaymentAmount?.amountMinor,
          startDate: firstPaymentDate,
          maturityDate: facility.maturityDate,
        })
      : null;
    const pairedPlanBucket = facility.pairedPlanBucketId
      ? await validatePairedPlanBucket(ctx, user.id, facility.pairedPlanBucketId, facility.limitAmount.currency)
      : null;
    const payments = await ctx.db
      .query('creditFacilityInstallmentPayments')
      .withIndex('by_installmentPlanId_and_paymentDate', (q) => q.eq('installmentPlanId', plan._id))
      .take(600);
    const paymentsByMonth = new Map<
      string,
      {
        month: string;
        amount: MoneyAmount;
        principalAmount: MoneyAmount;
        interestAmount: MoneyAmount;
        feeAmount: MoneyAmount;
        payments: Array<Doc<'creditFacilityInstallmentPayments'>>;
      }
    >();
    for (const payment of payments) {
      if (payment.userId !== user.id) {
        continue;
      }
      const month = payment.paymentDate.slice(0, 7);
      const group = paymentsByMonth.get(month) ?? {
        month,
        amount: { amountMinor: 0n, currency: facility.limitAmount.currency },
        principalAmount: { amountMinor: 0n, currency: facility.limitAmount.currency },
        interestAmount: { amountMinor: 0n, currency: facility.limitAmount.currency },
        feeAmount: { amountMinor: 0n, currency: facility.limitAmount.currency },
        payments: [],
      };
      group.amount.amountMinor += payment.amount.amountMinor;
      group.principalAmount.amountMinor += (payment.principalAmount ?? payment.amount).amountMinor;
      group.interestAmount.amountMinor += payment.interestAmount?.amountMinor ?? 0n;
      group.feeAmount.amountMinor += payment.feeAmount?.amountMinor ?? 0n;
      group.payments.push(payment);
      paymentsByMonth.set(month, group);
    }

    return {
      facility,
      activePlan,
      payoffProjection,
      repaymentProgress: loanRepaymentProgress(facility.originalPrincipalAmount, outstandingAmount),
      pairedPlanBucket,
      paymentsByMonth: [...paymentsByMonth.values()].sort((left, right) => left.month.localeCompare(right.month)),
    };
  },
});

export const listLoans = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const facilities = await ctx.db
      .query('creditFacilities')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', 'active'))
      .take(200);
    const loans = facilities.filter((facility) => isLoanFacilityType(facility.facilityType));

    return await Promise.all(
      loans.map(async (facility) => {
        const plans = await ctx.db
          .query('creditFacilityInstallmentPlans')
          .withIndex('by_creditFacilityId_and_status', (q) =>
            q.eq('creditFacilityId', facility._id).eq('status', 'active'),
          )
          .take(10);
        const activePlan = plans.find((plan) => plan.userId === user.id) ?? null;
        const outstandingAmount = activePlan?.outstandingAmount ?? facility.usedAmount;
        const firstPaymentDate = nextDueDateOnOrAfter(
          activePlan?.nextPaymentDate ?? facility.firstPaymentDate ?? todayIsoDate(),
          todayIsoDate(),
        );
        const payoffProjection = facility.minimumPaymentAmount
          ? buildLoanProjection({
              outstandingMinor: outstandingAmount.amountMinor,
              annualRateBps: facility.annualNominalRateBps ?? 0,
              monthlyPaymentMinor: facility.minimumPaymentAmount.amountMinor,
              escrowMinor: facility.escrowAmount?.amountMinor,
              finalPaymentMinor: facility.finalPaymentAmount?.amountMinor,
              startDate: firstPaymentDate,
              maturityDate: facility.maturityDate,
            })
          : null;

        return {
          ...facility,
          outstandingAmount,
          repaymentProgress: loanRepaymentProgress(facility.originalPrincipalAmount, outstandingAmount),
          payoffDate: payoffProjection?.payoffDate ?? null,
          payoffMonths: payoffProjection?.months ?? null,
        };
      }),
    );
  },
});

export const closeLoan = mutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);
    assertLoanFacility(facility);
    const now = Date.now();

    // Cancel the schedule before the facility so no closed loan is left projecting instalments into
    // Cash Flow or holding a bucket in the Plan. Payment history stays: it is what was really paid.
    const plans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_creditFacilityId_and_status', (q) =>
        q.eq('creditFacilityId', facility._id).eq('status', 'active'),
      )
      .take(50);
    const affectedDates: Array<string | undefined> = [];
    for (const plan of plans) {
      if (plan.userId !== user.id) continue;
      affectedDates.push(plan.nextPaymentDate);
      await ctx.db.patch('creditFacilityInstallmentPlans', plan._id, {
        status: 'cancelled',
        updatedAtMs: now,
      });
    }

    await ctx.db.patch('creditFacilities', facility._id, { status: 'closed', updatedAtMs: now });
    await syncInstallmentPlanBucketsAfterChange(ctx, user.id, affectedDates);

    return facility._id;
  },
});

export const deleteLoan = mutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const facility = await getOwnedFacility(ctx, user.id, args.creditFacilityId);
    assertLoanFacility(facility);

    // Four tables point at a facility and one points at its plans; every reference has to go before
    // the row itself, or a dangling id is left behind. Owned rows are deleted, borrowed ones cleared.
    const plans = await ctx.db
      .query('creditFacilityInstallmentPlans')
      .withIndex('by_creditFacilityId', (q) => q.eq('creditFacilityId', facility._id))
      .take(200);
    const affectedDates: Array<string | undefined> = [];

    for (const plan of plans) {
      if (plan.userId !== user.id) continue;
      affectedDates.push(plan.nextPaymentDate);

      const payments = await ctx.db
        .query('creditFacilityInstallmentPayments')
        .withIndex('by_installmentPlanId_and_paymentDate', (q) => q.eq('installmentPlanId', plan._id))
        .take(500);
      for (const payment of payments) {
        // The bank transaction a payment points at is real and stays; only the link goes.
        await ctx.db.delete('creditFacilityInstallmentPayments', payment._id);
      }

      // planBuckets is only indexed by user and by plan position, so the link is found by scan.
      const buckets = await ctx.db
        .query('planBuckets')
        .withIndex('by_userId', (q) => q.eq('userId', user.id))
        .take(500);
      for (const bucket of buckets.filter((candidate) => candidate.installmentPlanId === plan._id)) {
        // Detaching rather than deleting keeps the bucket's assignments and history, the same way
        // removing a card from a plan does.
        await ctx.db.patch('planBuckets', bucket._id, { installmentPlanId: undefined });
      }

      await ctx.db.delete('creditFacilityInstallmentPlans', plan._id);
    }

    const cycles = await ctx.db
      .query('creditFacilityUsageCycles')
      .withIndex('by_creditFacilityId_and_status', (q) => q.eq('creditFacilityId', facility._id))
      .take(200);
    for (const cycle of cycles) {
      if (cycle.userId !== user.id) continue;
      await ctx.db.delete('creditFacilityUsageCycles', cycle._id);
    }

    // The target is a discriminated union whose creditFacilityId is required, so the assumption
    // cannot be pointed elsewhere - it goes with the facility it describes.
    const assumptions = await ctx.db
      .query('forecastAccountAssumptions')
      .withIndex('by_userId', (q) => q.eq('userId', user.id))
      .take(500);
    for (const assumption of assumptions) {
      if (assumption.target.kind !== 'creditFacility' || assumption.target.creditFacilityId !== facility._id) {
        continue;
      }
      await ctx.db.delete('forecastAccountAssumptions', assumption._id);
    }

    // Payments are reached through their plan above; this sweeps any left pointing at the facility
    // directly, so nothing survives the row it belongs to.
    const strayPayments = await ctx.db
      .query('creditFacilityInstallmentPayments')
      .withIndex('by_userId_and_paymentDate', (q) => q.eq('userId', user.id))
      .take(1000);
    for (const payment of strayPayments) {
      if (payment.creditFacilityId !== facility._id) continue;
      await ctx.db.delete('creditFacilityInstallmentPayments', payment._id);
    }

    const transfers = await ctx.db
      .query('plannedTransactions')
      .withIndex('by_userId_and_kind_and_status_and_dueDate', (q) =>
        q.eq('userId', user.id).eq('kind', 'transfer'),
      )
      .take(500);
    for (const transfer of transfers) {
      if (transfer.fromCreditFacilityId !== facility._id) continue;
      await ctx.db.patch('plannedTransactions', transfer._id, { fromCreditFacilityId: undefined });
    }

    await ctx.db.delete('creditFacilities', facility._id);
    await syncInstallmentPlanBucketsAfterChange(ctx, user.id, affectedDates);

    return facility._id;
  },
});
