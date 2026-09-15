import { v } from 'convex/values';

export const bankProviderValidator = v.union(v.literal('enableBanking'), v.literal('manual'), v.literal('mock'));

export const connectionStatusValidator = v.union(
  v.literal('pending'),
  v.literal('active'),
  v.literal('reauthorizationRequired'),
  v.literal('paused'),
  v.literal('error'),
);

export const userProfileStatusValidator = v.union(v.literal('active'), v.literal('deleted'));

export const notificationTypeValidator = v.union(
  v.literal('budgetOverspend'),
  v.literal('billReminder'),
  v.literal('upcomingPayment'),
  v.literal('lowProjectedBalance'),
  v.literal('syncFailed'),
  v.literal('analystReport'),
  v.literal('spendingAnomaly'),
  v.literal('healthScore'),
  v.literal('subscriptionReview'),
);

export const importJobStatusValidator = v.union(
  v.literal('queued'),
  v.literal('running'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('rateLimited'),
);

export const transactionStatusValidator = v.union(
  v.literal('BOOK'),
  v.literal('PDNG'),
  v.literal('SCHD'),
  v.literal('HOLD'),
  v.literal('CNCL'),
  v.literal('RJCT'),
  v.literal('OTHR'),
);

export const transactionDirectionValidator = v.union(v.literal('CRDT'), v.literal('DBIT'));

export const classificationKindValidator = v.union(
  v.literal('uncategorized'),
  v.literal('expense'),
  v.literal('income'),
  v.literal('subscription'),
  v.literal('transfer'),
  v.literal('internal'),
);

export const classificationSourceValidator = v.union(
  v.literal('provider'),
  v.literal('system'),
  v.literal('rule'),
  v.literal('user'),
);

export const recurrenceIntervalValidator = v.union(
  v.literal('day'),
  v.literal('week'),
  v.literal('month'),
  v.literal('year'),
);

export const LOAN_FACILITY_TYPES = ['mortgage', 'autoLoan', 'personalLoan'] as const;

export function isLoanFacilityType(facilityType: string): boolean {
  return LOAN_FACILITY_TYPES.some((loanType) => loanType === facilityType);
}

export const creditFacilityTypeValidator = v.union(
  v.literal('accountOverdraft'),
  v.literal('cardCreditLine'),
  v.literal('additionalCardCreditLine'),
  v.literal('installmentCredit'),
  v.literal('mortgage'),
  v.literal('autoLoan'),
  v.literal('personalLoan'),
  v.literal('other'),
);

export const creditFacilityStatusValidator = v.union(
  v.literal('active'),
  v.literal('paused'),
  v.literal('closed'),
);

export const creditFacilityRepaymentTypeValidator = v.union(
  v.literal('onDemand'),
  v.literal('statementBalance'),
  v.literal('installmentPlan'),
);

export const creditFacilityPlanStatusValidator = v.union(
  v.literal('active'),
  v.literal('paid'),
  v.literal('cancelled'),
);

export const creditFacilityUsageCycleStatusValidator = v.union(
  v.literal('open'),
  v.literal('scheduled'),
  v.literal('paid'),
  v.literal('cancelled'),
);

export const plannedTransferStatusValidator = v.union(
  v.literal('planned'),
  v.literal('completed'),
  v.literal('cancelled'),
);

export const metadataValidator = v.record(v.string(), v.any());

export const moneyAmountValidator = v.object({
  amountMinor: v.int64(),
  currency: v.string(),
});

export const reportTabValidator = v.union(v.literal('cashflow'), v.literal('spending'), v.literal('income'));

export const reportModeValidator = v.union(v.literal('breakdown'), v.literal('trends'));

export const reportChartTypeValidator = v.union(
  v.literal('sankey'),
  v.literal('donut'),
  v.literal('hbar'),
  v.literal('barGrouped'),
  v.literal('barStacked'),
);

export const reportGroupByValidator = v.union(
  v.literal('category'),
  v.literal('categoryGroup'),
  v.literal('counterparty'),
  v.literal('account'),
);

export const reportGranularityValidator = v.union(v.literal('month'), v.literal('quarter'), v.literal('year'));

export const reportDatePresetValidator = v.union(
  v.literal('last30Days'),
  v.literal('last90Days'),
  v.literal('thisMonth'),
  v.literal('lastMonth'),
  v.literal('thisYear'),
  v.literal('lastYear'),
  v.literal('last12Months'),
  v.literal('allTime'),
  v.literal('custom'),
);

export const savedReportConfigValidator = v.object({
  tab: reportTabValidator,
  mode: reportModeValidator,
  chartType: reportChartTypeValidator,
  groupBy: reportGroupByValidator,
  granularity: v.optional(reportGranularityValidator),
  datePreset: v.optional(reportDatePresetValidator),
  dateFrom: v.optional(v.string()),
  dateTo: v.optional(v.string()),
  accountIds: v.optional(v.array(v.id('financialAccounts'))),
  categoryIds: v.optional(v.array(v.id('categories'))),
  tagIds: v.optional(v.array(v.id('transactionTags'))),
  amountMinMinor: v.optional(v.int64()),
  amountMaxMinor: v.optional(v.int64()),
});

export const forecastChangeModeValidator = v.union(v.literal('inflation'), v.literal('customPct'), v.literal('fixed'));

export const forecastLifeEventValidator = v.union(
  v.object({
    kind: v.literal('retirement'),
    age: v.number(),
    expensePct: v.number(),
    extraYearlyExpenses: v.optional(moneyAmountValidator),
    incomeReductionPct: v.number(),
  }),
  v.object({
    kind: v.literal('pension'),
    startAge: v.number(),
    monthlyBenefit: moneyAmountValidator,
  }),
  v.object({
    kind: v.literal('buyHome'),
    year: v.number(),
    price: moneyAmountValidator,
    mode: v.union(v.literal('cash'), v.literal('finance')),
    downPayment: v.optional(moneyAmountValidator),
    mortgageYears: v.optional(v.number()),
    mortgageRateBps: v.optional(v.number()),
    recurringCostsAnnualPct: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal('haveKid'),
    year: v.number(),
    monthlyCost: moneyAmountValidator,
    untilAge: v.number(),
  }),
  v.object({
    kind: v.literal('careerBreak'),
    startYear: v.number(),
    endYear: v.number(),
    incomeReductionPct: v.number(),
  }),
  v.object({
    kind: v.literal('newJob'),
    year: v.number(),
    newMonthlyIncome: moneyAmountValidator,
  }),
  v.object({
    kind: v.literal('otherIncome'),
    startYear: v.number(),
    amount: moneyAmountValidator,
    recurring: v.optional(v.object({ intervalYears: v.number(), endYear: v.optional(v.number()) })),
  }),
  v.object({
    kind: v.literal('otherExpense'),
    startYear: v.number(),
    amount: moneyAmountValidator,
    recurring: v.optional(v.object({ intervalYears: v.number(), endYear: v.optional(v.number()) })),
  }),
  v.object({
    kind: v.literal('endOfPlan'),
    age: v.number(),
  }),
);

export const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/i;
export const SCENARIO_COLOR_VAR_REGEX = /^var\(--chart-[1-9]\)$/;
