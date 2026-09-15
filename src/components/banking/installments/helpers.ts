import type { Doc } from '../../../../convex/_generated/dataModel';
import type { TranslationKey } from '@/lib/i18n';
import { moneyInputValue } from '@/lib/money';

export type CreditFacility = Doc<'creditFacilities'>;
export type InstallmentPlan = Doc<'creditFacilityInstallmentPlans'>;
export type MoneyAmount = { amountMinor: bigint; currency: string };

export type InstallmentPlanFormValues = {
  creditFacilityId: string;
  name: string;
  principalAmount: string;
  monthlyPaymentAmount: string;
  installmentCount: string;
  startDate: string;
  nextPaymentDate: string;
};

export function parseOptionalNumber(value: string) {
  const normalized = value.trim();
  return normalized ? Number(normalized) : undefined;
}

export function moneyToInputValue(amount: MoneyAmount) {
  return moneyInputValue(amount);
}

export function remainingRepaymentAmount(plan: InstallmentPlan) {
  return {
    amountMinor: plan.monthlyPaymentAmount.amountMinor * BigInt(Math.max(0, plan.remainingInstallments)),
    currency: plan.monthlyPaymentAmount.currency,
  };
}

export function addMonthsToIsoDate(date: string, months: number) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

export function expectedPaymentAmount(
  plan: InstallmentPlan,
  outstandingAmount: MoneyAmount,
  remainingInstallments: number,
) {
  if (remainingInstallments <= 1 && outstandingAmount.amountMinor < plan.monthlyPaymentAmount.amountMinor) {
    return outstandingAmount;
  }

  return plan.monthlyPaymentAmount;
}

export function expectedPrincipalAmount(plan: InstallmentPlan, amount: MoneyAmount) {
  if (plan.defaultPrincipalAmount) {
    return plan.defaultPrincipalAmount;
  }

  const interestMinor = plan.defaultInterestAmount?.amountMinor ?? 0n;
  const feeMinor = plan.defaultFeeAmount?.amountMinor ?? 0n;
  const principalMinor = amount.amountMinor - interestMinor - feeMinor;

  return {
    amountMinor: principalMinor > 0n ? principalMinor : 0n,
    currency: amount.currency,
  };
}

export function buildBackfillPreview(plan: InstallmentPlan, throughScheduledDueDate: string) {
  const paidInstallments = Math.max(0, plan.installmentCount - plan.remainingInstallments);
  const firstDueDate = addMonthsToIsoDate(plan.startDate, paidInstallments);
  let outstandingAmount = plan.outstandingAmount;
  let totalPaymentMinor = 0n;
  let installments = 0;
  let lastDueDate: string | null = null;
  let remainingInstallments = plan.remainingInstallments;

  if (!throughScheduledDueDate || throughScheduledDueDate < firstDueDate) {
    return {
      installments,
      lastDueDate,
      nextPaymentDate: firstDueDate,
      outstandingAmount,
      remainingRepaymentAmount: remainingRepaymentAmount(plan),
      totalAmount: {
        amountMinor: totalPaymentMinor,
        currency: plan.monthlyPaymentAmount.currency,
      },
    };
  }

  for (let index = 0; index < plan.remainingInstallments && index < 120; index += 1) {
    const dueDate = addMonthsToIsoDate(firstDueDate, index);
    if (dueDate > throughScheduledDueDate) {
      break;
    }

    const amount = expectedPaymentAmount(plan, outstandingAmount, remainingInstallments);
    const principalAmount = expectedPrincipalAmount(plan, amount);
    totalPaymentMinor += amount.amountMinor;
    outstandingAmount = {
      amountMinor:
        outstandingAmount.amountMinor > principalAmount.amountMinor
          ? outstandingAmount.amountMinor - principalAmount.amountMinor
          : 0n,
      currency: outstandingAmount.currency,
    };
    installments += 1;
    remainingInstallments = Math.max(0, remainingInstallments - 1);
    lastDueDate = dueDate;
  }

  const remainingRepaymentAmountAfterBackfill = {
    amountMinor: plan.monthlyPaymentAmount.amountMinor * BigInt(remainingInstallments),
    currency: plan.monthlyPaymentAmount.currency,
  };

  return {
    installments,
    lastDueDate,
    nextPaymentDate: remainingInstallments === 0 ? null : addMonthsToIsoDate(firstDueDate, installments),
    outstandingAmount,
    remainingRepaymentAmount: remainingRepaymentAmountAfterBackfill,
    totalAmount: {
      amountMinor: totalPaymentMinor,
      currency: plan.monthlyPaymentAmount.currency,
    },
  };
}

export function repaymentCandidateStatusKey(status: 'confirmable' | 'pending' | 'review'): TranslationKey {
  if (status === 'confirmable') {
    return 'credit.installments.status.confirmable';
  }

  if (status === 'pending') {
    return 'credit.installments.status.pending';
  }

  return 'credit.installments.status.review';
}
