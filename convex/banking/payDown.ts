import { ConvexError, v } from 'convex/values';
import { query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { computePayoffPlan } from '../analyst/proactive/debtPayoffCore';
import { addMonthsToIsoDate } from './creditMath';
import type { Debt, PayoffStrategy } from '../analyst/proactive/debtPayoffCore';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

const MAX_FACILITIES = 50;
const MAX_INSTALLMENT_PLANS = 200;
const MAX_SCHEDULE_MONTHS = 120;

type ConfiguredFacility = {
  facility: Doc<'creditFacilities'>;
  currency: string;
  debts: Array<Debt>;
  balanceMinor: bigint;
  monthlyPaymentMinor: bigint;
  annualRateBps: number;
};

type NeedsSetupFacility = {
  facilityId: Id<'creditFacilities'>;
  name: string;
  currency: string;
  missing: Array<'rate' | 'payment'>;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function debtFreeDate(asOfDate: string, payoffMonths: number) {
  return addMonthsToIsoDate(asOfDate, payoffMonths);
}

function engineStrategy(strategy: 'avalanche' | 'snowball' | 'planned'): PayoffStrategy {
  return strategy === 'snowball' ? 'snowball' : 'avalanche';
}

async function loadPayDownInputs(ctx: QueryCtx, userId: string) {
  const facilities = await ctx.db
    .query('creditFacilities')
    .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
    .take(MAX_FACILITIES);
  const activePlans = await ctx.db
    .query('creditFacilityInstallmentPlans')
    .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
    .take(MAX_INSTALLMENT_PLANS);
  const plansByFacility = new Map<Id<'creditFacilities'>, Array<Doc<'creditFacilityInstallmentPlans'>>>();
  for (const plan of activePlans) {
    const plans = plansByFacility.get(plan.creditFacilityId) ?? [];
    plans.push(plan);
    plansByFacility.set(plan.creditFacilityId, plans);
  }

  const configured: Array<ConfiguredFacility> = [];
  const needsSetup: Array<NeedsSetupFacility> = [];
  for (const facility of facilities) {
    const plans = plansByFacility.get(facility._id) ?? [];
    const missing: NeedsSetupFacility['missing'] = [];
    if (
      facility.annualNominalRateBps === undefined ||
      !Number.isInteger(facility.annualNominalRateBps) ||
      facility.annualNominalRateBps < 0
    ) {
      missing.push('rate');
    }
    if (plans.length === 0 || plans.some((plan) => plan.monthlyPaymentAmount.amountMinor <= 0n)) {
      missing.push('payment');
    }

    const currency = (plans.at(0)?.outstandingAmount.currency ?? facility.usedAmount.currency).toUpperCase();
    const hasCurrencyMismatch = plans.some(
      (plan) =>
        plan.outstandingAmount.currency.toUpperCase() !== currency ||
        plan.monthlyPaymentAmount.currency.toUpperCase() !== currency,
    );
    if (hasCurrencyMismatch && !missing.includes('payment')) {
      missing.push('payment');
    }
    if (missing.length > 0) {
      needsSetup.push({ facilityId: facility._id, name: facility.name, currency, missing });
      continue;
    }

    const annualRateBps = facility.annualNominalRateBps!;
    const debts = plans.map((plan) => ({
      id: plan._id,
      name: `${facility.name}: ${plan.name}`,
      balanceMinor: plan.outstandingAmount.amountMinor,
      annualRateBps,
      minimumPaymentMinor: plan.monthlyPaymentAmount.amountMinor,
      currency,
    }));
    configured.push({
      facility,
      currency,
      debts,
      balanceMinor: debts.reduce((total, debt) => total + debt.balanceMinor, 0n),
      monthlyPaymentMinor: debts.reduce((total, debt) => total + debt.minimumPaymentMinor, 0n),
      annualRateBps,
    });
  }

  return { configured, needsSetup };
}

function applyLumpSum(
  debts: ReadonlyArray<Debt>,
  lumpSumMinor: bigint,
  strategy: 'avalanche' | 'snowball' | 'planned',
) {
  const adjusted = debts.map((debt, index) => ({ ...debt, index }));
  const ordered = [...adjusted].sort((left, right) => {
    if (strategy === 'planned') return left.index - right.index;
    if (strategy === 'avalanche') {
      return (
        right.annualRateBps - left.annualRateBps ||
        (left.balanceMinor < right.balanceMinor ? -1 : left.balanceMinor > right.balanceMinor ? 1 : 0) ||
        left.id.localeCompare(right.id)
      );
    }
    return (
      (left.balanceMinor < right.balanceMinor ? -1 : left.balanceMinor > right.balanceMinor ? 1 : 0) ||
      right.annualRateBps - left.annualRateBps ||
      left.id.localeCompare(right.id)
    );
  });

  let remainingLumpSumMinor = lumpSumMinor;
  for (const debt of ordered) {
    if (remainingLumpSumMinor === 0n) break;
    const paymentMinor = remainingLumpSumMinor < debt.balanceMinor ? remainingLumpSumMinor : debt.balanceMinor;
    debt.balanceMinor -= paymentMinor;
    remainingLumpSumMinor -= paymentMinor;
  }
  return adjusted.map(({ index: _index, ...debt }) => debt);
}

export const getPayDownOverview = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const { configured, needsSetup } = await loadPayDownInputs(ctx, user.id);
    const asOfDate = todayIsoDate();
    const facilities = configured.map((entry) => {
      const plan = computePayoffPlan({ debts: entry.debts, extraPaymentMinor: 0n, strategy: 'avalanche' });
      return {
        facilityId: entry.facility._id,
        name: entry.facility.name,
        currency: entry.currency,
        balanceMinor: entry.balanceMinor,
        annualRateBps: entry.annualRateBps,
        monthlyPaymentMinor: entry.monthlyPaymentMinor,
        payoffMonths: plan.months,
        debtFreeDate: debtFreeDate(asOfDate, plan.months),
        totalInterestMinor: plan.totalInterestMinor,
        schedule: plan.schedule.slice(0, MAX_SCHEDULE_MONTHS).map((row) => ({
          monthIndex: row.month,
          balanceMinor: row.closingBalanceMinor,
          interestMinor: row.interestMinor,
          principalMinor: row.paidMinor > row.interestMinor ? row.paidMinor - row.interestMinor : 0n,
        })),
      };
    });

    const totalsByCurrency = new Map<
      string,
      {
        currency: string;
        balanceMinor: bigint;
        monthlyPaymentMinor: bigint;
        totalInterestMinor: bigint;
        payoffMonths: number;
        debtFreeDate: string;
      }
    >();
    for (const facility of facilities) {
      const current = totalsByCurrency.get(facility.currency);
      if (current) {
        current.balanceMinor += facility.balanceMinor;
        current.monthlyPaymentMinor += facility.monthlyPaymentMinor;
        current.totalInterestMinor += facility.totalInterestMinor;
        current.payoffMonths = Math.max(current.payoffMonths, facility.payoffMonths);
        current.debtFreeDate = current.debtFreeDate > facility.debtFreeDate ? current.debtFreeDate : facility.debtFreeDate;
      } else {
        totalsByCurrency.set(facility.currency, {
          currency: facility.currency,
          balanceMinor: facility.balanceMinor,
          monthlyPaymentMinor: facility.monthlyPaymentMinor,
          totalInterestMinor: facility.totalInterestMinor,
          payoffMonths: facility.payoffMonths,
          debtFreeDate: facility.debtFreeDate,
        });
      }
    }
    const totals = [...totalsByCurrency.values()].sort((left, right) => left.currency.localeCompare(right.currency));

    return {
      facilities,
      needsSetup,
      debtFreeDate: facilities.reduce<string | null>(
        (latest, facility) => (latest === null || facility.debtFreeDate > latest ? facility.debtFreeDate : latest),
        null,
      ),
      totalsByCurrency: totals,
    };
  },
});

export const simulatePayoff = query({
  args: {
    extraMonthlyMinor: v.optional(v.int64()),
    lumpSumMinor: v.optional(v.int64()),
    strategy: v.union(v.literal('avalanche'), v.literal('snowball'), v.literal('planned')),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const extraMonthlyMinor = args.extraMonthlyMinor ?? 0n;
    const lumpSumMinor = args.lumpSumMinor ?? 0n;
    if (extraMonthlyMinor < 0n) {
      throw new ConvexError('Extra monthly payment cannot be negative');
    }
    if (lumpSumMinor < 0n) {
      throw new ConvexError('Lump sum cannot be negative');
    }

    const { configured, needsSetup } = await loadPayDownInputs(ctx, user.id);
    const debtsByCurrency = new Map<string, Array<Debt>>();
    for (const entry of configured) {
      const debts = debtsByCurrency.get(entry.currency) ?? [];
      debts.push(...entry.debts);
      debtsByCurrency.set(entry.currency, debts);
    }

    const asOfDate = todayIsoDate();
    const strategy = engineStrategy(args.strategy);
    const currencies = [...debtsByCurrency.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, debts]) => {
        const baselinePlan = computePayoffPlan({ debts, extraPaymentMinor: 0n, strategy });
        const adjustedDebts = applyLumpSum(debts, lumpSumMinor, args.strategy);
        const simulatedPlan = computePayoffPlan({ debts: adjustedDebts, extraPaymentMinor: extraMonthlyMinor, strategy });
        const interestSavedMinor =
          baselinePlan.totalInterestMinor > simulatedPlan.totalInterestMinor
            ? baselinePlan.totalInterestMinor - simulatedPlan.totalInterestMinor
            : 0n;
        return {
          currency,
          baseline: {
            payoffMonths: baselinePlan.months,
            debtFreeDate: debtFreeDate(asOfDate, baselinePlan.months),
            totalInterestMinor: baselinePlan.totalInterestMinor,
            interestSavedMinor: 0n,
          },
          simulated: {
            payoffMonths: simulatedPlan.months,
            debtFreeDate: debtFreeDate(asOfDate, simulatedPlan.months),
            totalInterestMinor: simulatedPlan.totalInterestMinor,
            interestSavedMinor,
          },
        };
      });

    return { strategy: args.strategy, currencies, needsSetup };
  },
});
