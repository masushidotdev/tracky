import type { CreditFacility, CreditInstallmentPlan } from './types';

export function parseOptionalNumber(value: string) {
  const normalized = value.trim();
  return normalized ? Number(normalized) : undefined;
}

export function currentCycleMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function nextMonthDueDate(day = 1) {
  const value = new Date();
  const dueMonth = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
  const year = dueMonth.getUTCFullYear();
  const month = dueMonth.getUTCMonth() + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(Math.max(day, 1), daysInMonth)).padStart(2, '0')}`;
}

export function isInstallmentFacility(facility: CreditFacility) {
  return facility.facilityType === 'installmentCredit';
}

export function remainingRepaymentAmount(
  plan: Pick<CreditInstallmentPlan, 'monthlyPaymentAmount' | 'outstandingAmount' | 'remainingInstallments'>,
) {
  const scheduledAmountMinor = plan.monthlyPaymentAmount.amountMinor * BigInt(Math.max(0, plan.remainingInstallments));
  return {
    amountMinor:
      scheduledAmountMinor > plan.outstandingAmount.amountMinor
        ? scheduledAmountMinor
        : plan.outstandingAmount.amountMinor,
    currency: plan.monthlyPaymentAmount.currency,
  };
}

export function wholeMonthsElapsed(startDate: string, asOfDate: string) {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [asOfYear, asOfMonth, asOfDay] = asOfDate.split('-').map(Number);

  if (
    !Number.isFinite(startYear) ||
    !Number.isFinite(startMonth) ||
    !Number.isFinite(startDay) ||
    !Number.isFinite(asOfYear) ||
    !Number.isFinite(asOfMonth) ||
    !Number.isFinite(asOfDay)
  ) {
    return 0;
  }

  let elapsedMonths = (asOfYear - startYear) * 12 + (asOfMonth - startMonth);
  if (asOfDay < startDay) {
    elapsedMonths -= 1;
  }

  return Math.max(0, elapsedMonths);
}

export function installmentFacilityProgress(plan: CreditInstallmentPlan, asOfDate: string) {
  const totalInstallments = Math.max(0, plan.installmentCount);
  const elapsedInstallments = Math.min(totalInstallments, wholeMonthsElapsed(plan.startDate, asOfDate));
  const remainingInstallments = Math.max(0, totalInstallments - elapsedInstallments);
  const percent = totalInstallments > 0 ? (elapsedInstallments / totalInstallments) * 100 : 0;

  return {
    elapsedInstallments,
    percent,
    remainingInstallments,
    totalInstallments,
  };
}
