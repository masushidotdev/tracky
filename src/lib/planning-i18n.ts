import type { TranslationKey } from '@/lib/i18n';

export type FundingStatus = 'covered' | 'behind' | 'dueSoon' | 'onTrack';
export type CashflowSource =
  | 'plannedExpense'
  | 'subscription'
  | 'scheduledTransaction'
  | 'creditInstallment'
  | 'creditStatement'
  | 'plannedTransfer';
export type PlannedExpenseStatus = 'planned' | 'funding' | 'paid' | 'cancelled';
export type PlannedExpenseDirection = 'inflow' | 'outflow';

export function fundingStatusKey(status: FundingStatus): TranslationKey {
  if (status === 'covered') {
    return 'planning.funding.covered';
  }

  if (status === 'behind') {
    return 'planning.funding.behind';
  }

  if (status === 'dueSoon') {
    return 'planning.funding.dueSoon';
  }

  return 'planning.funding.onTrack';
}

export function cashflowSourceKey(source: CashflowSource): TranslationKey {
  if (source === 'subscription') {
    return 'planning.cashflow.source.subscription';
  }

  if (source === 'scheduledTransaction') {
    return 'planning.cashflow.source.scheduledTransaction';
  }

  if (source === 'creditInstallment') {
    return 'planning.cashflow.source.creditInstallment';
  }

  if (source === 'creditStatement') {
    return 'planning.cashflow.source.creditStatement';
  }

  if (source === 'plannedTransfer') {
    return 'planning.cashflow.source.plannedTransfer';
  }

  return 'planning.cashflow.source.plannedExpense';
}

export function plannedExpenseStatusKey(status: PlannedExpenseStatus): TranslationKey {
  if (status === 'funding') {
    return 'planning.expenses.status.funding';
  }

  if (status === 'paid') {
    return 'planning.expenses.status.paid';
  }

  if (status === 'cancelled') {
    return 'planning.expenses.status.cancelled';
  }

  return 'planning.expenses.status.planned';
}

export function cashflowItemBadge(item: {
  source: CashflowSource;
  direction?: PlannedExpenseDirection;
  plannedExpenseStatus?: PlannedExpenseStatus;
}): {
  key: TranslationKey;
  variant: 'outline' | 'secondary';
} {
  if (item.source === 'plannedExpense' && item.direction === 'inflow') {
    return { key: 'planning.cashflow.source.plannedIncome', variant: 'secondary' };
  }

  if (item.source === 'plannedTransfer') {
    return { key: 'planning.cashflow.source.plannedTransfer', variant: 'secondary' };
  }

  if (item.source === 'plannedExpense' && item.plannedExpenseStatus) {
    return { key: plannedExpenseStatusKey(item.plannedExpenseStatus), variant: 'outline' };
  }

  return { key: cashflowSourceKey(item.source), variant: 'secondary' };
}
