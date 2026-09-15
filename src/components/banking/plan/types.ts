import type { api } from '../../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';

export type ActivePlan = NonNullable<FunctionReturnType<typeof api.banking.planRead.getActivePlan>>;
export type PlanAccountSummary = ActivePlan['accounts'][number];
export type PlanSummary = FunctionReturnType<typeof api.banking.planRead.listPlans>[number];
export type PlanMonth = FunctionReturnType<typeof api.banking.planRead.getPlanMonth>;
export type PlanGroup = PlanMonth['groups'][number];
export type PlanBucket = PlanGroup['buckets'][number];
export type PlanAccount = FunctionReturnType<typeof api.banking.accounts.listAccounts>[number];
export type PlanMoneyBox = FunctionReturnType<typeof api.banking.planning.listMoneyBoxes>[number];
export type PlanCategory = FunctionReturnType<typeof api.banking.categories.listCategories>[number];
export type PlanBucketTransactions = FunctionReturnType<typeof api.banking.planRead.listPlanBucketTransactions>;
export type PlanOutOfPlanKind = 'internal' | 'transfer';
export type PlanOutOfPlanTransactions = FunctionReturnType<typeof api.banking.planRead.listPlanOutOfPlanTransactions>;
export type PlanAutoAssignPreview = FunctionReturnType<typeof api.banking.plan.autoAssign>;
export type PlanAutoAssignStrategy = PlanAutoAssignPreview['strategy'];
export type PlanTargetValues = {
  cadence: 'weekly' | 'monthly' | 'yearly' | 'custom';
  behaviour: 'setAside' | 'refill' | 'balanceBy';
  amountMinor: bigint;
  dueDate?: string;
  dayOfMonth?: number;
  dayOfWeek?: number;
  repeats: boolean;
  repeatIntervalCount?: number;
  repeatIntervalUnit?: 'month' | 'year';
};
