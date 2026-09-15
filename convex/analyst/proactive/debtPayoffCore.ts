export type Debt = {
  id: string;
  name: string;
  balanceMinor: bigint;
  annualRateBps: number;
  minimumPaymentMinor: bigint;
  currency: string;
};

export type PayoffStrategy = 'avalanche' | 'snowball';

export type PayoffPlan = {
  strategy: PayoffStrategy;
  currency: string;
  months: number;
  totalInterestMinor: bigint;
  totalPaidMinor: bigint;
  payoffByDebt: Array<{
    id: string;
    name: string;
    payoffMonth: number | null;
    interestAccruedMinor: bigint;
    totalPaidMinor: bigint;
  }>;
  schedule: Array<{
    month: number;
    openingBalanceMinor: bigint;
    interestMinor: bigint;
    paidMinor: bigint;
    closingBalanceMinor: bigint;
    targetDebtId: string | null;
  }>;
  warnings: Array<string>;
};

const MONTHLY_RATE_DENOMINATOR = 120_000n;

export function monthlyInterest(balanceMinor: bigint, annualRateBps: number): bigint {
  if (balanceMinor <= 0n || annualRateBps <= 0) return 0n;
  return (balanceMinor * BigInt(annualRateBps) + MONTHLY_RATE_DENOMINATOR / 2n) / MONTHLY_RATE_DENOMINATOR;
}

function compareDebts(strategy: PayoffStrategy, left: DebtState, right: DebtState) {
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
}

type DebtState = Debt & {
  interestAccruedMinor: bigint;
  totalPaidMinor: bigint;
  payoffMonth: number | null;
};

export function computePayoffPlan({
  debts,
  extraPaymentMinor,
  strategy,
  maxMonths = 600,
}: {
  debts: ReadonlyArray<Debt>;
  extraPaymentMinor: bigint;
  strategy: PayoffStrategy;
  maxMonths?: number;
}): PayoffPlan {
  if (extraPaymentMinor < 0n) throw new Error('Extra payment cannot be negative.');
  if (!Number.isInteger(maxMonths) || maxMonths < 1 || maxMonths > 600) {
    throw new Error('maxMonths must be an integer between 1 and 600.');
  }
  const currencies = [...new Set(debts.filter((debt) => debt.balanceMinor > 0n).map((debt) => debt.currency.toUpperCase()))];
  if (currencies.length > 1) throw new Error('Debt payoff simulation requires a single currency.');
  const currency = currencies.at(0) ?? debts.at(0)?.currency.toUpperCase() ?? 'USD';
  const states: Array<DebtState> = debts
    .filter((debt) => debt.balanceMinor > 0n)
    .map((debt) => {
      if (!Number.isInteger(debt.annualRateBps) || debt.annualRateBps < 0) {
        throw new Error(`Invalid annual rate for debt ${debt.id}.`);
      }
      if (debt.minimumPaymentMinor < 0n) throw new Error(`Invalid minimum payment for debt ${debt.id}.`);
      return {
        ...debt,
        currency: debt.currency.toUpperCase(),
        interestAccruedMinor: 0n,
        totalPaidMinor: 0n,
        payoffMonth: null,
      };
    });
  const monthlyPaymentPool = states.reduce((total, debt) => total + debt.minimumPaymentMinor, 0n) + extraPaymentMinor;
  const warnings: Array<string> = [];
  const schedule: PayoffPlan['schedule'] = [];
  let totalInterestMinor = 0n;
  let totalPaidMinor = 0n;
  let month = 0;

  if (states.length > 0 && monthlyPaymentPool <= 0n) {
    warnings.push('Payment is insufficient: no monthly payment is available.');
  }

  while (states.some((debt) => debt.balanceMinor > 0n) && month < maxMonths) {
    month += 1;
    const active = states.filter((debt) => debt.balanceMinor > 0n);
    const openingBalanceMinor = active.reduce((total, debt) => total + debt.balanceMinor, 0n);
    let interestMinor = 0n;
    for (const debt of active) {
      const interest = monthlyInterest(debt.balanceMinor, debt.annualRateBps);
      debt.balanceMinor += interest;
      debt.interestAccruedMinor += interest;
      interestMinor += interest;
    }
    totalInterestMinor += interestMinor;

    let remainingPool = monthlyPaymentPool;
    let paidMinor = 0n;
    for (const debt of active) {
      const payment = debt.minimumPaymentMinor < debt.balanceMinor ? debt.minimumPaymentMinor : debt.balanceMinor;
      const allowed = payment < remainingPool ? payment : remainingPool;
      debt.balanceMinor -= allowed;
      debt.totalPaidMinor += allowed;
      remainingPool -= allowed;
      paidMinor += allowed;
      if (remainingPool === 0n) break;
    }

    let targetDebtId: string | null = null;
    while (remainingPool > 0n) {
      const targets = states.filter((debt) => debt.balanceMinor > 0n).sort((left, right) => compareDebts(strategy, left, right));
      const target = targets.at(0);
      if (!target) break;
      targetDebtId ??= target.id;
      const payment = remainingPool < target.balanceMinor ? remainingPool : target.balanceMinor;
      target.balanceMinor -= payment;
      target.totalPaidMinor += payment;
      remainingPool -= payment;
      paidMinor += payment;
    }

    for (const debt of states) {
      if (debt.balanceMinor === 0n && debt.payoffMonth === null) debt.payoffMonth = month;
    }
    totalPaidMinor += paidMinor;
    const closingBalanceMinor = states.reduce((total, debt) => total + debt.balanceMinor, 0n);
    schedule.push({ month, openingBalanceMinor, interestMinor, paidMinor, closingBalanceMinor, targetDebtId });

    if (closingBalanceMinor >= openingBalanceMinor && interestMinor > 0n) {
      if (!warnings.includes('Payment is insufficient and debt is negatively amortizing.')) {
        warnings.push('Payment is insufficient and debt is negatively amortizing.');
      }
      if (paidMinor === 0n) break;
    }
  }

  if (states.some((debt) => debt.balanceMinor > 0n)) {
    warnings.push(`Debt was not fully repaid within ${maxMonths} months.`);
  }

  return {
    strategy,
    currency,
    months: month,
    totalInterestMinor,
    totalPaidMinor,
    payoffByDebt: states.map((debt) => ({
      id: debt.id,
      name: debt.name,
      payoffMonth: debt.payoffMonth,
      interestAccruedMinor: debt.interestAccruedMinor,
      totalPaidMinor: debt.totalPaidMinor,
    })),
    schedule,
    warnings,
  };
}
