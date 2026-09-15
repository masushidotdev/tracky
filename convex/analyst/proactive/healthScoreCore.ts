export type HealthScoreInput = {
  monthlyIncome: number;
  monthlyOutflow: number;
  monthlyDebtPayments: number;
  liquidBalance: number;
  essentialMonthlyOutflow: number;
  subscriptionMonthly: number;
  budgetAmount: number;
  budgetSpent: number;
};

export type HealthScoreResult = {
  score: number;
  components: {
    savingsRate: number;
    budgetAdherence: number;
    debtLoad: number;
    liquidityMonths: number;
    subscriptionLoad: number;
  };
  warnings: Array<string>;
  insufficientData: boolean;
};

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolate(value: number, low: number, high: number, lowScore: number, highScore: number) {
  if (value <= low) return lowScore;
  if (value >= high) return highScore;
  return lowScore + ((value - low) / (high - low)) * (highScore - lowScore);
}

export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  const monthlyIncome = finiteNonNegative(input.monthlyIncome);
  const monthlyOutflow = finiteNonNegative(input.monthlyOutflow);
  const monthlyDebtPayments = finiteNonNegative(input.monthlyDebtPayments);
  const liquidBalance = finiteNonNegative(input.liquidBalance);
  const essentialMonthlyOutflow = finiteNonNegative(input.essentialMonthlyOutflow);
  const subscriptionMonthly = finiteNonNegative(input.subscriptionMonthly);
  const budgetAmount = finiteNonNegative(input.budgetAmount);
  const budgetSpent = finiteNonNegative(input.budgetSpent);
  const warnings: Array<string> = [];

  if (monthlyIncome <= 0) warnings.push('Monthly income is unavailable or zero.');
  if (essentialMonthlyOutflow <= 0) warnings.push('Essential monthly outflow is unavailable or zero.');
  const insufficientData = monthlyIncome <= 0 && monthlyOutflow <= 0 && liquidBalance <= 0;
  if (insufficientData) warnings.push('There is not enough financial activity to produce a meaningful score.');

  const savingsRate =
    monthlyIncome > 0
      ? interpolate((monthlyIncome - monthlyOutflow) / monthlyIncome, -0.05, 0.2, 0, 100)
      : monthlyOutflow > 0
        ? 0
        : 50;
  const budgetAdherence =
    budgetAmount > 0 ? clamp(100 - (Math.max(0, budgetSpent - budgetAmount) / budgetAmount) * 100) : 100;
  const debtLoad =
    monthlyIncome > 0
      ? interpolate(monthlyDebtPayments / monthlyIncome, 0.1, 0.5, 100, 0)
      : monthlyDebtPayments > 0
        ? 0
        : 100;
  const liquidityMonths =
    essentialMonthlyOutflow > 0 ? clamp((liquidBalance / essentialMonthlyOutflow / 3) * 100) : liquidBalance > 0 ? 100 : 0;
  const subscriptionLoad =
    monthlyIncome > 0
      ? interpolate(subscriptionMonthly / monthlyIncome, 0.05, 0.2, 100, 0)
      : subscriptionMonthly > 0
        ? 0
        : 100;
  const components = {
    savingsRate: clamp(savingsRate),
    budgetAdherence: clamp(budgetAdherence),
    debtLoad: clamp(debtLoad),
    liquidityMonths: clamp(liquidityMonths),
    subscriptionLoad: clamp(subscriptionLoad),
  };
  const score = Math.round(
    components.savingsRate * 0.3 +
      components.budgetAdherence * 0.25 +
      components.debtLoad * 0.2 +
      components.liquidityMonths * 0.15 +
      components.subscriptionLoad * 0.1,
  );

  return { score: clamp(score), components, warnings, insufficientData };
}
