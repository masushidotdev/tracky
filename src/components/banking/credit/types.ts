import type { api } from '../../../../convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';

export type CreditFacility = FunctionReturnType<typeof api.banking.credit.listCreditFacilities>[number];
export type CreditUsageCycle = FunctionReturnType<typeof api.banking.credit.listCreditFacilityUsageCycles>[number];
export type CreditInstallmentPlan = FunctionReturnType<typeof api.banking.credit.listInstallmentPlans>[number];
export type CreditUsageCyclePaymentCandidate = FunctionReturnType<
  typeof api.banking.credit.listUsageCyclePaymentCandidates
>[number];
export type FinancialAccount = FunctionReturnType<typeof api.banking.accounts.listAccounts>[number];
