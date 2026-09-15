export type MoneyAmount = {
  amountMinor: bigint;
  currency: string;
};

export type InstallmentPaymentScheduleItem = {
  dueDate: string;
  amount: MoneyAmount;
  sequenceNumber: number;
  remainingAfterPayment: number;
};

export type LoanPayoffProjection = {
  months: number | null;
  payoffDate: string | null;
  totalInterestMinor: bigint;
  series: Array<{ month: string; balanceMinor: bigint }>;
};

function assertSameCurrency(left: MoneyAmount, right: MoneyAmount) {
  if (left.currency !== right.currency) {
    throw new Error('Money currency mismatch');
  }
}

function ceilDiv(dividend: bigint, divisor: bigint) {
  return (dividend + divisor - 1n) / divisor;
}

export function buildCreditFacilitySummary(
  limitAmount: MoneyAmount,
  usedAmount: MoneyAmount,
  activeInstallmentOutstanding?: MoneyAmount,
) {
  assertSameCurrency(limitAmount, usedAmount);
  if (activeInstallmentOutstanding) {
    assertSameCurrency(limitAmount, activeInstallmentOutstanding);
  }

  const occupiedAmountMinor = usedAmount.amountMinor + (activeInstallmentOutstanding?.amountMinor ?? 0n);
  const remainingAmountMinor = limitAmount.amountMinor - occupiedAmountMinor;
  const availableAmountMinor = remainingAmountMinor > 0n ? remainingAmountMinor : 0n;
  const utilizationPercent =
    limitAmount.amountMinor <= 0n
      ? occupiedAmountMinor > 0n
        ? 100
        : 0
      : Number((occupiedAmountMinor * 10000n) / limitAmount.amountMinor) / 100;

  return {
    availableAmount: {
      amountMinor: availableAmountMinor,
      currency: limitAmount.currency,
    },
    utilizationPercent,
    isOverLimit: occupiedAmountMinor > limitAmount.amountMinor,
  };
}

export function estimateInstallmentPaymentMinor(
  principalAmountMinor: bigint,
  annualNominalRateBps: number | undefined,
  installmentCount: number,
) {
  if (!Number.isInteger(installmentCount) || installmentCount <= 0) {
    throw new Error('Installment count must be a positive integer');
  }

  if (principalAmountMinor <= 0n) {
    return 0n;
  }

  if (!annualNominalRateBps || annualNominalRateBps <= 0) {
    return ceilDiv(principalAmountMinor, BigInt(installmentCount));
  }

  const principal = Number(principalAmountMinor);
  const monthlyRate = annualNominalRateBps / 10000 / 12;
  const payment = (principal * monthlyRate) / (1 - (1 + monthlyRate) ** -installmentCount);

  return BigInt(Math.ceil(payment));
}

export function buildRemainingInstallmentRepaymentAmount(input: {
  monthlyPaymentAmount: MoneyAmount;
  remainingInstallments: number;
  outstandingAmount?: MoneyAmount;
}) {
  const remainingInstallments = Number.isInteger(input.remainingInstallments)
    ? Math.max(0, input.remainingInstallments)
    : 0;

  const scheduledAmountMinor = input.monthlyPaymentAmount.amountMinor * BigInt(remainingInstallments);
  const outstandingFloorMinor =
    input.outstandingAmount?.currency === input.monthlyPaymentAmount.currency
      ? input.outstandingAmount.amountMinor
      : 0n;

  return {
    amountMinor: scheduledAmountMinor > outstandingFloorMinor ? scheduledAmountMinor : outstandingFloorMinor,
    currency: input.monthlyPaymentAmount.currency,
  };
}

export function addMonthsToIsoDate(date: string, months: number) {
  if (!Number.isInteger(months) || months < 0) {
    throw new Error('Months must be a non-negative integer');
  }

  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

// Whole months from one date to another, ignoring the day of the month: instalments fall on the same
// day every month, so only the month matters.
export function monthsBetweenIsoDates(from: string, to: string) {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

export function buildLoanPayoffProjection(input: {
  outstandingMinor: bigint;
  annualRateBps: number;
  monthlyPaymentMinor: bigint;
  escrowMinor?: bigint;
  finalPaymentMinor?: bigint;
  startDate: string;
  maxMonths?: number;
}): LoanPayoffProjection {
  const escrowMinor = input.escrowMinor ?? 0n;
  const finalPaymentMinor = input.finalPaymentMinor ?? 0n;
  const maxMonths = input.maxMonths ?? 600;
  if (input.outstandingMinor < 0n) {
    throw new Error('Outstanding balance cannot be negative');
  }
  if (!Number.isInteger(input.annualRateBps) || input.annualRateBps < 0) {
    throw new Error('Annual rate must be a non-negative integer');
  }
  if (input.monthlyPaymentMinor <= 0n) {
    throw new Error('Monthly payment must be greater than zero');
  }
  if (escrowMinor < 0n) {
    throw new Error('Escrow cannot be negative');
  }
  if (finalPaymentMinor < 0n) {
    throw new Error('Final payment cannot be negative');
  }
  if (!Number.isInteger(maxMonths) || maxMonths <= 0) {
    throw new Error('Maximum months must be a positive integer');
  }

  if (input.outstandingMinor === 0n) {
    return { months: 0, payoffDate: input.startDate, totalInterestMinor: 0n, series: [] };
  }

  const amortizingPaymentMinor = input.monthlyPaymentMinor - escrowMinor;
  if (amortizingPaymentMinor <= 0n && (finalPaymentMinor === 0n || input.outstandingMinor > finalPaymentMinor)) {
    return { months: null, payoffDate: null, totalInterestMinor: 0n, series: [] };
  }

  let balanceMinor = input.outstandingMinor;
  let totalInterestMinor = 0n;
  const series: LoanPayoffProjection['series'] = [];
  const monthlyRateDenominator = 120_000n;
  const annualRateBps = BigInt(input.annualRateBps);

  for (let index = 0; index < maxMonths; index += 1) {
    const interestNumerator = balanceMinor * annualRateBps;
    const interestMinor = (interestNumerator + monthlyRateDenominator / 2n) / monthlyRateDenominator;
    const paymentDate = addMonthsToIsoDate(input.startDate, index);

    if (finalPaymentMinor > 0n && balanceMinor <= finalPaymentMinor) {
      totalInterestMinor += interestMinor;
      balanceMinor = 0n;
      series.push({ month: paymentDate.slice(0, 7), balanceMinor });
      return {
        months: index + 1,
        payoffDate: paymentDate,
        totalInterestMinor,
        series,
      };
    }

    const principalMinor = amortizingPaymentMinor - interestMinor;
    if (principalMinor <= 0n) {
      return { months: null, payoffDate: null, totalInterestMinor, series };
    }

    balanceMinor -= principalMinor < balanceMinor ? principalMinor : balanceMinor;
    totalInterestMinor += interestMinor;
    series.push({ month: paymentDate.slice(0, 7), balanceMinor });

    if (balanceMinor === 0n) {
      return {
        months: index + 1,
        payoffDate: paymentDate,
        totalInterestMinor,
        series,
      };
    }
  }

  return { months: null, payoffDate: null, totalInterestMinor, series };
}

export function buildInstallmentPaymentSchedule(input: {
  monthlyPaymentAmount: MoneyAmount;
  outstandingAmount?: MoneyAmount;
  startDate: string;
  nextPaymentDate?: string;
  remainingInstallments: number;
  asOfDate?: string;
  monthsAhead?: number;
}): Array<InstallmentPaymentScheduleItem> {
  if (!Number.isInteger(input.remainingInstallments) || input.remainingInstallments <= 0) {
    return [];
  }

  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const monthsAhead = input.monthsAhead ?? 6;
  if (!Number.isInteger(monthsAhead) || monthsAhead < 0) {
    throw new Error('Months ahead must be a non-negative integer');
  }

  const firstDueDate = input.nextPaymentDate ?? addMonthsToIsoDate(input.startDate, 1);
  const horizonDate = addMonthsToIsoDate(asOfDate, monthsAhead);
  const schedule: Array<InstallmentPaymentScheduleItem> = [];
  const scheduledTotalMinor = input.monthlyPaymentAmount.amountMinor * BigInt(input.remainingInstallments);
  const finalInstallmentAdjustmentMinor =
    input.outstandingAmount?.currency === input.monthlyPaymentAmount.currency &&
    input.outstandingAmount.amountMinor > scheduledTotalMinor
      ? input.outstandingAmount.amountMinor - scheduledTotalMinor
      : 0n;

  for (let index = 0; index < input.remainingInstallments; index += 1) {
    const dueDate = addMonthsToIsoDate(firstDueDate, index);
    if (dueDate > horizonDate) {
      break;
    }

    schedule.push({
      dueDate,
      amount: {
        amountMinor:
          input.monthlyPaymentAmount.amountMinor +
          (index === input.remainingInstallments - 1 ? finalInstallmentAdjustmentMinor : 0n),
        currency: input.monthlyPaymentAmount.currency,
      },
      sequenceNumber: index + 1,
      remainingAfterPayment: input.remainingInstallments - index - 1,
    });
  }

  return schedule;
}
