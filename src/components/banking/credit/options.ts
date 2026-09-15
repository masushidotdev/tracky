import type { TranslationKey } from '@/lib/i18n';

export const CREDIT_FACILITY_TYPES = [
  { value: 'accountOverdraft', labelKey: 'credit.facility.accountOverdraft' },
  { value: 'cardCreditLine', labelKey: 'credit.facility.cardCreditLine' },
  { value: 'additionalCardCreditLine', labelKey: 'credit.facility.additionalCardCreditLine' },
  { value: 'installmentCredit', labelKey: 'credit.facility.installmentCredit' },
  { value: 'other', labelKey: 'credit.facility.other' },
] as const;

export const LOAN_FACILITY_TYPES = [
  { value: 'mortgage', labelKey: 'credit.facility.mortgage' },
  { value: 'autoLoan', labelKey: 'credit.facility.autoLoan' },
  { value: 'personalLoan', labelKey: 'credit.facility.personalLoan' },
] as const;

export const FACILITY_TYPES = [...CREDIT_FACILITY_TYPES, ...LOAN_FACILITY_TYPES] as const;

export const REPAYMENT_TYPES = [
  { value: 'onDemand', labelKey: 'credit.repayment.onDemand' },
  { value: 'statementBalance', labelKey: 'credit.repayment.statementBalance' },
  { value: 'installmentPlan', labelKey: 'credit.repayment.installmentPlan' },
] as const;

export const CURRENCIES = ['EUR', 'USD'] as const;

export type FacilityTypeValue = (typeof FACILITY_TYPES)[number]['value'];
export type RepaymentTypeValue = (typeof REPAYMENT_TYPES)[number]['value'];
export type CurrencyValue = (typeof CURRENCIES)[number];

export function facilityTypeLabel(value: string, translate: (key: TranslationKey) => string) {
  const type = FACILITY_TYPES.find((option) => option.value === value);
  return type ? translate(type.labelKey) : value;
}

export function repaymentTypeLabel(value: string, translate: (key: TranslationKey) => string) {
  const type = REPAYMENT_TYPES.find((option) => option.value === value);
  return type ? translate(type.labelKey) : value;
}
