export type WhatIfBaselineMonth = {
  month: string;
  inflow: number;
  outflow: number;
  projectedBalance: number;
};

export type WhatIfChange = {
  kind: 'addMonthlyExpense' | 'removeMonthlyExpense' | 'oneOffExpense' | 'addMonthlyIncome' | 'adjustBudget';
  label: string;
  amount: number;
  currency: string;
  startDate?: string;
  months?: number;
};

export type WhatIfResult = {
  baseline: Array<WhatIfBaselineMonth>;
  scenario: Array<WhatIfBaselineMonth>;
  deltaByMonth: Array<{ month: string; inflow: number; outflow: number; projectedBalance: number }>;
  minProjectedBalance: number;
  warnings: Array<string>;
};

function isChangeActive(change: WhatIfChange, month: string, index: number) {
  const startMonth = change.startDate?.slice(0, 7);
  if (startMonth && month < startMonth) return false;
  if (change.kind === 'oneOffExpense') return startMonth ? month === startMonth : index === 0;
  if (change.months === undefined) return true;
  const activeIndex = startMonth ? undefined : index;
  if (activeIndex !== undefined) return activeIndex < change.months;
  const start = new Date(`${startMonth}-01T00:00:00.000Z`);
  const current = new Date(`${month}-01T00:00:00.000Z`);
  const monthDistance =
    (current.getUTCFullYear() - start.getUTCFullYear()) * 12 + current.getUTCMonth() - start.getUTCMonth();
  return monthDistance >= 0 && monthDistance < change.months;
}

export function applyWhatIfScenario(
  baseline: Array<WhatIfBaselineMonth>,
  changes: Array<WhatIfChange>,
  horizonMonths: number,
): WhatIfResult {
  const scopedBaseline = baseline.slice(0, Math.max(0, Math.floor(horizonMonths)));
  let cumulativeDelta = 0;
  const scenario = scopedBaseline.map((row, index) => {
    let inflowDelta = 0;
    let outflowDelta = 0;
    for (const change of changes) {
      if (!isChangeActive(change, row.month, index) || change.kind === 'adjustBudget') continue;
      if (change.kind === 'addMonthlyIncome') inflowDelta += change.amount;
      if (change.kind === 'addMonthlyExpense' || change.kind === 'oneOffExpense') outflowDelta += change.amount;
      if (change.kind === 'removeMonthlyExpense') outflowDelta -= change.amount;
    }
    cumulativeDelta += inflowDelta - outflowDelta;
    return {
      month: row.month,
      inflow: row.inflow + inflowDelta,
      outflow: row.outflow + outflowDelta,
      projectedBalance: row.projectedBalance + cumulativeDelta,
    };
  });
  const deltaByMonth = scenario.map((row, index) => ({
    month: row.month,
    inflow: row.inflow - scopedBaseline[index].inflow,
    outflow: row.outflow - scopedBaseline[index].outflow,
    projectedBalance: row.projectedBalance - scopedBaseline[index].projectedBalance,
  }));
  const minProjectedBalance = scenario.length === 0 ? 0 : Math.min(...scenario.map((row) => row.projectedBalance));
  const warnings = minProjectedBalance < 0 ? ['Scenario produces a negative projected balance.'] : [];
  return { baseline: scopedBaseline, scenario, deltaByMonth, minProjectedBalance, warnings };
}
