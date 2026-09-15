import type { Doc, Id } from '../../../../convex/_generated/dataModel';

export type ReportTab = 'cashflow' | 'spending' | 'income';
export type ReportMode = 'breakdown' | 'trends';
export type ReportChartType = 'sankey' | 'donut' | 'hbar' | 'barGrouped' | 'barStacked';
export type ReportGroupBy = 'category' | 'categoryGroup' | 'counterparty' | 'account';
export type ReportGranularity = 'month' | 'quarter' | 'year';
export type ReportDatePreset =
  | 'last30Days'
  | 'last90Days'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'lastYear'
  | 'last12Months'
  | 'allTime'
  | 'custom';

export type ReportFiltersState = {
  datePreset: ReportDatePreset;
  dateFrom: string;
  dateTo: string;
  groupBy: ReportGroupBy;
  granularity: ReportGranularity;
  accountIds: Array<Id<'financialAccounts'>>;
  categoryIds: Array<Id<'categories'>>;
  tagIds: Array<Id<'transactionTags'>>;
  amountMin: string;
  amountMax: string;
};

export type ReportSummary = {
  currency: string;
  incomeMinor: bigint;
  expensesMinor: bigint;
  netMinor: bigint;
  savingsRatePct: number;
};

export type ReportSeriesGroup = {
  key: string;
  label: string;
  incomeMinor: bigint;
  expensesMinor: bigint;
};

export type ReportSeries = {
  period: string;
  currency: string;
  groups: Array<ReportSeriesGroup>;
};

export type ReportBreakdown = ReportSeriesGroup & {
  currency: string;
  totalMinor: bigint;
};

export type ReportData = {
  summary: Array<ReportSummary>;
  series: Array<ReportSeries>;
  breakdown: Array<ReportBreakdown>;
  truncated: boolean;
};

export type ReportTransaction = {
  _id: Id<'transactions'>;
  bookingDate: string;
  description: string;
  counterpartyName: string | null;
  amount: { amountMinor: bigint; currency: string };
  direction: 'CRDT' | 'DBIT';
  categoryId: Id<'categories'> | null;
};

export type ReportSegmentSelection = {
  groupKey: string;
  label: string;
  currency: string;
};

export type SavedReport = Doc<'savedReports'>;
export type SavedReportConfig = SavedReport['config'];

export type ReportAccountOption = {
  id: Id<'financialAccounts'>;
  label: string;
};

export type ReportCategoryOption = {
  id: Id<'categories'>;
  label: string;
};

export type ReportTagOption = {
  id: Id<'transactionTags'>;
  label: string;
  color?: string;
};
