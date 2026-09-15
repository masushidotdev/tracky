import type { Doc, Id } from '../../../../convex/_generated/dataModel';

export const RATE_SCALE = 1_000_000_000_000n;
export const EXTRA_SAVINGS_ACCOUNT_ID = 'extraSavings';

export type EurosMode = 'today' | 'future';
export type ChangeMode = 'inflation' | 'customPct' | 'fixed';

export type ForecastTarget =
  | { kind: 'account'; accountId: Id<'financialAccounts'> }
  | { kind: 'creditFacility'; creditFacilityId: Id<'creditFacilities'> };

export type ForecastAccountAssumption = {
  _id: Id<'forecastAccountAssumptions'>;
  target: ForecastTarget;
  included: boolean;
  growthAnnualPct?: number;
  contributionYearly?: { amountMinor: bigint; currency: string };
  liability?: {
    annualRateBps?: number;
    paymentMonthly?: { amountMinor: bigint; currency: string };
    includedInLivingExpenses: boolean;
  };
};

export type ForecastIncomeSource = {
  _id: Id<'forecastIncomeSources'>;
  name: string;
  amountMonthly: { amountMinor: bigint; currency: string };
  changeMode: ChangeMode;
  customPct?: number;
  sortOrder: number;
};

export type StoredForecastLifeEvent = Doc<'forecastLifeEvents'>['event'];

export type ForecastLifeEvent = {
  _id: Id<'forecastLifeEvents'>;
  enabled: boolean;
  event: StoredForecastLifeEvent;
};

export type InvalidForecastLifeEvent = {
  eventId: Id<'forecastLifeEvents'>;
  reason: string;
};

export type ForecastScenario = {
  _id: Id<'forecastScenarios'>;
  name: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  currency: string;
  inflationAnnualPct: number;
  endAge: number;
  livingExpenses: {
    amountMonthly: { amountMinor: bigint; currency: string };
    changeMode: ChangeMode;
    customPct?: number;
  };
  extraSavings: {
    growthAnnualPct: number;
    splits: Array<{ accountId: Id<'financialAccounts'>; pct: number }>;
  };
  capitalGainsTaxPct: number;
};

export type ForecastCheckpoint = {
  calendarYear: number;
  age: number;
  date: string;
  accounts: Array<{ id: string; endBalanceMinor: bigint }>;
  netWorthMinor: bigint;
  annualIncomeMinor: bigint;
  annualExpensesMinor: bigint;
  annualSavingsMinor: bigint;
  deflatorScaled: bigint;
};

export type ProjectionAccount = {
  id: string;
  kind: 'cash' | 'investment' | 'otherAsset' | 'liability';
};

export type ForecastProjectionEvent = {
  monthIndex: number;
  kind: StoredForecastLifeEvent['kind'];
  label: string;
};

export type ForecastProjection = {
  currency: string;
  yearly: Array<ForecastCheckpoint>;
  events: Array<ForecastProjectionEvent>;
  retirement?: { age: number; monthIndex: number; netWorthMinor: bigint };
  finalNetWorthMinor: bigint;
  depletedMonthIndex?: number;
  assumptions: {
    birthYear: number;
    endAge: number;
    accounts: Array<ProjectionAccount>;
  };
};

export type AccountOption = {
  _id: Id<'financialAccounts'>;
  name?: string | null;
  alias?: string | null;
  institutionName?: string | null;
  ibanMasked?: string | null;
};

export type FacilityOption = {
  creditFacilityId: Id<'creditFacilities'>;
  name: string;
};

export type ForecastSeeds = {
  currency: string;
  accounts: Array<{
    accountId: Id<'financialAccounts'>;
    name: string;
    kind: 'cash' | 'investment' | 'otherAsset';
    balance: { amountMinor: bigint; currency: string };
    included: boolean;
    growthAnnualPct: number;
  }>;
  liabilities: Array<{
    creditFacilityId: Id<'creditFacilities'>;
    name: string;
    balance: { amountMinor: bigint; currency: string };
  }>;
  incomeSources: Array<{
    name: string;
    amountMonthly: { amountMinor: bigint; currency: string };
    changeMode: ChangeMode;
    customPct?: number;
  }>;
  livingExpenses: {
    amountMonthly: { amountMinor: bigint; currency: string };
    changeMode: ChangeMode;
  };
  excludedFacilities: Array<{ creditFacilityId: Id<'creditFacilities'>; name: string }>;
};

export type OnboardingDraft = {
  birthYear: number;
  retirementAge: number;
  accounts: Array<{
    accountId: Id<'financialAccounts'>;
    included: boolean;
    growthAnnualPct: number;
  }>;
  incomeSources: Array<{
    name: string;
    amountMonthly: string;
    changeMode: ChangeMode;
    customPct?: number;
  }>;
  expensesAmount: string;
};

export type ScenarioDraft = {
  inflationAnnualPct: number;
  endAge: number;
  livingExpensesAmount: string;
  livingExpensesChangeMode: ChangeMode;
  livingExpensesCustomPct?: number;
  extraSavingsGrowthAnnualPct: number;
  capitalGainsTaxPct: number;
};

export type IncomeSourceDraft = {
  incomeSourceId?: Id<'forecastIncomeSources'>;
  name: string;
  amountMonthly: string;
  changeMode: ChangeMode;
  customPct?: number;
  sortOrder?: number;
};

export type AccountAssumptionDraft = {
  target: ForecastTarget;
  included: boolean;
  growthAnnualPct?: number;
  contributionYearly?: string;
  annualRatePct?: number;
  paymentMonthly?: string;
  includedInLivingExpenses?: boolean;
};

export function deflate(nominalMinor: bigint, deflatorScaled: bigint) {
  if (deflatorScaled === 0n) return nominalMinor;
  return (nominalMinor * RATE_SCALE) / deflatorScaled;
}

export function displayMinor(nominalMinor: bigint, deflatorScaled: bigint, mode: EurosMode) {
  return mode === 'today' ? deflate(nominalMinor, deflatorScaled) : nominalMinor;
}

export function firstCheckpoint(projection: ForecastProjection) {
  return projection.yearly.at(0);
}

export function lastCheckpoint(projection: ForecastProjection) {
  return projection.yearly.at(-1);
}

export function retirementAgeFromEvents(
  lifeEvents: ReadonlyArray<{ enabled: boolean; event: { kind: string; age?: number } }>,
) {
  return lifeEvents.find((item) => item.enabled && item.event.kind === 'retirement')?.event.age;
}

export function calendarYearFromMonthIndex(monthIndex: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthIndex, 1)).getUTCFullYear();
}

export function depletionCalendarYear(monthIndex: number | undefined) {
  return monthIndex === undefined ? undefined : calendarYearFromMonthIndex(monthIndex);
}

export function targetKey(target: ForecastTarget) {
  return target.kind === 'account' ? `account:${target.accountId}` : `facility:${target.creditFacilityId}`;
}

export function targetId(target: ForecastTarget) {
  return target.kind === 'account' ? target.accountId : target.creditFacilityId;
}

export function shortId(value: string) {
  return value.slice(-4);
}
