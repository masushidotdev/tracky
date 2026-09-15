import { monthlyInterest } from '../analyst/proactive/debtPayoffCore';

export type LiabilityMonthInput = {
  balanceMinor: bigint;
  annualRateBps: number;
  paymentMonthlyMinor: bigint;
  monthIndex: number;
};

export type LiabilityMonthResult = {
  openingBalanceMinor: bigint;
  interestMinor: bigint;
  paymentMinor: bigint;
  endingBalanceMinor: bigint;
  paidOff: boolean;
  payoffMonthIndex?: number;
  negativeAmortization: boolean;
};

export function stepLiability(input: LiabilityMonthInput): LiabilityMonthResult {
  if (input.balanceMinor < 0n) throw new Error('Liability balance cannot be negative.');
  if (input.paymentMonthlyMinor < 0n) throw new Error('Liability payment cannot be negative.');
  if (!Number.isInteger(input.annualRateBps) || input.annualRateBps < 0) {
    throw new Error('Liability annualRateBps must be a non-negative integer.');
  }
  if (!Number.isInteger(input.monthIndex) || input.monthIndex < 0) {
    throw new Error('Liability monthIndex must be a non-negative integer.');
  }

  const interestMinor = monthlyInterest(input.balanceMinor, input.annualRateBps);
  const balanceAfterInterestMinor = input.balanceMinor + interestMinor;
  const paymentMinor =
    input.paymentMonthlyMinor < balanceAfterInterestMinor
      ? input.paymentMonthlyMinor
      : balanceAfterInterestMinor;
  const endingBalanceMinor = balanceAfterInterestMinor - paymentMinor;
  const paidOff = input.balanceMinor > 0n && endingBalanceMinor === 0n;

  return {
    openingBalanceMinor: input.balanceMinor,
    interestMinor,
    paymentMinor,
    endingBalanceMinor,
    paidOff,
    payoffMonthIndex: paidOff ? input.monthIndex : undefined,
    negativeAmortization: interestMinor > 0n && input.paymentMonthlyMinor <= interestMinor,
  };
}
