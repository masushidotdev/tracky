import {
  getAccountsOverview,
  getCashflowProjection,
  getCreditFacilities,
  getDetectedAnomalies,
  getLatestHealthScore,
  getMoneyBoxes,
  getPlanWithProgress,
  getPlannedItems,
  getSafeToSpend,
  getSpendingByCategory,
  getSpendingReport,
  getSubscriptions,
  listTransactions,
} from './read';
import { presentChart, presentTable } from './present';
import { compareDebtPayoff } from './debtPayoff';
import { getForecast } from './forecast';
import { longTermProjection } from './longTermProjection';
import { webSearch } from './search';
import { simulateWhatIf } from './simulate';
import {
  bulkRecategorize,
  createMoneyBox,
  createPlannedExpense,
  setPlanAssigned,
  setPlanTarget,
} from './write';
import { rememberFact } from './memory';
import { optimizeMoneyBoxes } from './moneyBoxOptimizer';
import type { ToolSet } from 'ai';

export const analystTools: ToolSet = {
  getAccountsOverview,
  listTransactions,
  getSpendingByCategory,
  getSpendingReport,
  getPlanWithProgress,
  getCashflowProjection,
  getSafeToSpend,
  getMoneyBoxes,
  getCreditFacilities,
  getDetectedAnomalies,
  getSubscriptions,
  getPlannedItems,
  getLatestHealthScore,
  compareDebtPayoff,
  getForecast,
  longTermProjection,
  setPlanAssigned,
  setPlanTarget,
  createMoneyBox,
  createPlannedExpense,
  rememberFact,
  optimizeMoneyBoxes,
  bulkRecategorize,
  webSearch,
  simulateWhatIf,
  presentChart,
  presentTable,
};

export const analystProactiveTools: ToolSet = {
  getAccountsOverview,
  listTransactions,
  getSpendingByCategory,
  getSpendingReport,
  getPlanWithProgress,
  getCashflowProjection,
  getSafeToSpend,
  getMoneyBoxes,
  getCreditFacilities,
  getDetectedAnomalies,
  getSubscriptions,
  getPlannedItems,
  getLatestHealthScore,
  compareDebtPayoff,
  simulateWhatIf,
  presentChart,
  presentTable,
};
