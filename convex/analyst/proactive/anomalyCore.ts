export type MonthlySpendSeries = {
  scope: 'category' | 'merchant';
  key: string;
  label: string;
  currency: string;
  currentPeriod: string;
  currentAmount: number;
  baseline: Array<{ period: string; amount: number }>;
};

export type SpendingAnomaly = Omit<MonthlySpendSeries, 'baseline'> & {
  mean: number;
  zScore: number;
  percentAboveBaseline: number;
  baselineMonths: number;
};

export type PersistedSpendingAnomaly = Pick<
  SpendingAnomaly,
  | 'scope'
  | 'key'
  | 'label'
  | 'currency'
  | 'currentAmount'
  | 'mean'
  | 'zScore'
  | 'percentAboveBaseline'
>;

export function toPersistedSpendingAnomaly(anomaly: SpendingAnomaly): PersistedSpendingAnomaly {
  return {
    scope: anomaly.scope,
    key: anomaly.key,
    label: anomaly.label,
    currency: anomaly.currency,
    currentAmount: anomaly.currentAmount,
    mean: anomaly.mean,
    zScore: anomaly.zScore,
    percentAboveBaseline: anomaly.percentAboveBaseline,
  };
}

export function detectSpendingAnomalies(series: ReadonlyArray<MonthlySpendSeries>): Array<SpendingAnomaly> {
  const anomalies: Array<SpendingAnomaly> = [];

  for (const item of series) {
    if (!Number.isFinite(item.currentAmount) || item.currentAmount <= 0) continue;
    const baseline = item.baseline
      .filter((point) => Number.isFinite(point.amount) && point.amount > 0)
      .slice(-6);
    if (baseline.length < 3) continue;

    const mean = baseline.reduce((total, point) => total + point.amount, 0) / baseline.length;
    if (!(mean > 0)) continue;
    const variance =
      baseline.reduce((total, point) => total + (point.amount - mean) ** 2, 0) / baseline.length;
    const deviation = Math.max(Math.sqrt(variance), mean * 0.1, 1);
    const zScore = (item.currentAmount - mean) / deviation;

    if (zScore < 2.5 || item.currentAmount < mean * 1.25 || item.currentAmount <= mean) continue;
    anomalies.push({
      scope: item.scope,
      key: item.key,
      label: item.label,
      currency: item.currency,
      currentPeriod: item.currentPeriod,
      currentAmount: item.currentAmount,
      mean,
      zScore,
      percentAboveBaseline: ((item.currentAmount - mean) / mean) * 100,
      baselineMonths: baseline.length,
    });
  }

  return anomalies.sort(
    (left, right) =>
      right.zScore - left.zScore ||
      right.currentAmount - left.currentAmount ||
      left.currency.localeCompare(right.currency) ||
      left.scope.localeCompare(right.scope) ||
      left.key.localeCompare(right.key),
  );
}
