import { stepLiability } from './liabilityMath';
import {
  PERCENT_SCALE,
  RATE_SCALE,
  applyMonthlyRate,
  monthEndIso,
  monthlyRateScaled,
  multiplyScaled,
  percentScaled,
  roundedDivide,
} from './projectionMath';

export const EXTRA_SAVINGS_ACCOUNT_ID = 'extraSavings';

export type ForecastAccountKind = 'cash' | 'investment' | 'otherAsset' | 'liability';

export type ForecastChange =
  | 'inflation'
  | 'fixed'
  | { mode: 'inflation' }
  | { mode: 'fixed' }
  | { mode: 'customPct'; annualPct: number };

export type ForecastAccountInput = {
  id: string;
  kind: ForecastAccountKind;
  currency?: string;
  balanceMinor: bigint;
  growthAnnualPct?: number;
  contributionYearlyMinor?: bigint;
  liability?: {
    annualRateBps: number;
    paymentMonthlyMinor: bigint;
    includedInLivingExpenses: boolean;
  };
};

export type ForecastIncomeSourceInput = {
  id: string;
  name: string;
  currency?: string;
  monthlyMinor: bigint;
  change: ForecastChange;
};

export type ForecastLifeEvent =
  | {
      kind: 'retirement';
      age: number;
      expensePct: number;
      extraYearlyExpensesMinor?: bigint;
      incomeReductionPct: number;
    }
  | { kind: 'pension'; startAge: number; monthlyBenefitMinor: bigint }
  | {
      kind: 'buyHome';
      year: number;
      priceMinor: bigint;
      mode: 'cash' | 'finance';
      downPaymentMinor?: bigint;
      mortgageYears?: number;
      mortgageRateBps?: number;
      recurringCostsAnnualPct?: number;
    }
  | { kind: 'haveKid'; year: number; monthlyCostMinor: bigint; untilAge: number }
  | { kind: 'careerBreak'; startYear: number; endYear: number; incomeReductionPct: number }
  | { kind: 'newJob'; year: number; newMonthlyIncomeMinor: bigint }
  | {
      kind: 'otherIncome' | 'otherExpense';
      startYear: number;
      amountMinor: bigint;
      recurring?: { intervalYears: number; endYear?: number };
    }
  | { kind: 'endOfPlan'; age: number };

export type ForecastParams = {
  currency: string;
  birthYear: number;
  endAge?: number;
  inflationAnnualPct?: number;
  accounts: ReadonlyArray<ForecastAccountInput>;
  incomeSources: ReadonlyArray<ForecastIncomeSourceInput>;
  livingExpenses: {
    currency?: string;
    monthlyMinor: bigint;
    change: ForecastChange;
  };
  extraSavings?: {
    growthAnnualPct?: number;
    splits?: ReadonlyArray<{ accountId: string; pct: number }>;
  };
  withdrawal?: {
    capitalGainsTaxPct?: number;
  };
  events: ReadonlyArray<ForecastLifeEvent>;
};

export type NormalizedForecastAssumptions = {
  currency: string;
  birthYear: number;
  endAge: number;
  inflationAnnualPct: number;
  accounts: Array<ForecastAccountInput>;
  incomeSources: Array<ForecastIncomeSourceInput>;
  livingExpenses: ForecastParams['livingExpenses'];
  extraSavings: {
    growthAnnualPct: number;
    splits: Array<{ accountId: string; pct: number }>;
  };
  withdrawal: { capitalGainsTaxPct: number };
  events: Array<ForecastLifeEvent>;
};

export type ForecastYearCheckpoint = {
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

export type ForecastLiabilityResult = {
  id: string;
  payoffMonthIndex?: number;
  negativeAmortization: boolean;
};

export type ForecastResult = {
  currency: string;
  yearly: Array<ForecastYearCheckpoint>;
  events: Array<{ monthIndex: number; kind: ForecastLifeEvent['kind']; label: string }>;
  retirement?: { age: number; monthIndex: number; netWorthMinor: bigint };
  liabilities: Array<ForecastLiabilityResult>;
  finalNetWorthMinor: bigint;
  depletedMonthIndex?: number;
  assumptions: NormalizedForecastAssumptions;
};

type AssetState = {
  id: string;
  kind: Exclude<ForecastAccountKind, 'liability'>;
  balanceMinor: bigint;
  growthMonthlyScaled: bigint;
  contributionMonthlyMinor: bigint;
};

type LiabilityState = {
  id: string;
  balanceMinor: bigint;
  annualRateBps: number;
  paymentMonthlyMinor: bigint;
  includedInLivingExpenses: boolean;
  payoffMonthIndex?: number;
  negativeAmortization: boolean;
};

type IncomeState = {
  monthlyMinor: bigint;
  monthlyRateScaled: bigint;
  active: boolean;
};

type RecurringExpenseState = {
  monthlyMinor: bigint;
  monthlyRateScaled: bigint;
  endMonthIndex: number | undefined;
};

type RuntimeEvent = {
  event: ForecastLifeEvent;
  monthIndex: number;
  calendarYear: number;
  order: number;
};

type HomeCostState = {
  assetId: string;
  annualPctScaled: bigint;
};

const HUNDRED_PERCENT_SCALED = 100n * PERCENT_SCALE;
const MONTHLY_RATE_DENOMINATOR = 120_000n;

function assertNonNegativeMoney(value: bigint, label: string) {
  if (value < 0n) throw new Error(`${label} cannot be negative.`);
}

function finiteNumber(value: number | undefined, fallback: number, label: string) {
  const normalized = value ?? fallback;
  if (!Number.isFinite(normalized)) throw new Error(`${label} must be finite.`);
  return normalized;
}

function annualRate(value: number | undefined, fallback: number, label: string) {
  const normalized = finiteNumber(value, fallback, label);
  if (normalized <= -100) throw new Error(`${label} must be greater than -100%.`);
  return normalized;
}

function normalizeCurrency(value: string, label: string) {
  const currency = value.trim().toUpperCase();
  if (!currency) throw new Error(`${label} is required.`);
  return currency;
}

function assertMatchingCurrency(expected: string, value: string | undefined, label: string) {
  if (value !== undefined && normalizeCurrency(value, label) !== expected) {
    throw new Error('Forecast projection requires a single currency.');
  }
}

function changeAnnualPct(change: ForecastChange, inflationAnnualPct: number, label: string) {
  if (change === 'inflation') return inflationAnnualPct;
  if (change === 'fixed') return 0;
  if (change.mode === 'inflation') return inflationAnnualPct;
  if (change.mode === 'fixed') return 0;
  return annualRate(change.annualPct, 0, `${label} annualPct`);
}

function parseStartDate(startDate: string) {
  monthEndIso(startDate, 0);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate.slice(0, 10));
  if (!match) throw new Error('startDate must be an ISO date.');
  return { year: Number(match[1]), month: Number(match[2]) };
}

function assertInteger(value: number, label: string, minimum?: number) {
  if (!Number.isInteger(value) || (minimum !== undefined && value < minimum)) {
    throw new Error(`${label} must be an integer${minimum === undefined ? '' : ` of at least ${minimum}`}.`);
  }
}

function assertPercentage(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100.`);
  }
}

function eventCalendarYear(event: ForecastLifeEvent, birthYear: number) {
  switch (event.kind) {
    case 'retirement':
    case 'endOfPlan':
      return birthYear + event.age;
    case 'pension':
      return birthYear + event.startAge;
    case 'buyHome':
    case 'haveKid':
    case 'newJob':
      return event.year;
    case 'careerBreak':
    case 'otherIncome':
    case 'otherExpense':
      return event.startYear;
  }
}

function monthIndexForYear(year: number, start: { year: number; month: number }) {
  return Math.max(0, (year - start.year) * 12 + (1 - start.month));
}

function normalizeLifeEvents(
  inputEvents: ReadonlyArray<ForecastLifeEvent>,
  birthYear: number,
  currentAge: number,
  start: { year: number; month: number },
) {
  const normalized = inputEvents.map((event, order) => {
    const year = eventCalendarYear(event, birthYear);
    const assertFutureYear = (value: number, label: string) => {
      assertInteger(value, label);
      if (value < start.year) throw new Error(`${label} cannot be in the past.`);
    };
    const assertFutureAge = (value: number, label: string) => {
      assertInteger(value, label, 0);
      if (value < currentAge) throw new Error(`${label} cannot be below the current age.`);
    };

    switch (event.kind) {
      case 'retirement':
        assertFutureAge(event.age, 'Retirement age');
        assertPercentage(event.expensePct, 'Retirement expensePct');
        assertPercentage(event.incomeReductionPct, 'Retirement incomeReductionPct');
        if (event.extraYearlyExpensesMinor !== undefined) {
          assertNonNegativeMoney(event.extraYearlyExpensesMinor, 'Retirement extraYearlyExpensesMinor');
        }
        break;
      case 'pension':
        assertFutureAge(event.startAge, 'Pension startAge');
        assertNonNegativeMoney(event.monthlyBenefitMinor, 'Pension monthlyBenefitMinor');
        break;
      case 'buyHome':
        assertFutureYear(event.year, 'Home purchase year');
        assertNonNegativeMoney(event.priceMinor, 'Home priceMinor');
        if (event.priceMinor === 0n) throw new Error('Home priceMinor must be positive.');
        if (event.downPaymentMinor !== undefined) {
          assertNonNegativeMoney(event.downPaymentMinor, 'Home downPaymentMinor');
          if (event.downPaymentMinor > event.priceMinor) {
            throw new Error('Home downPaymentMinor cannot exceed priceMinor.');
          }
        }
        if (event.recurringCostsAnnualPct !== undefined) {
          assertPercentage(event.recurringCostsAnnualPct, 'Home recurringCostsAnnualPct');
        }
        if (event.mode === 'finance') {
          if (
            event.downPaymentMinor === undefined ||
            event.mortgageYears === undefined ||
            event.mortgageRateBps === undefined
          ) {
            throw new Error('Financed home purchase requires downPaymentMinor, mortgageYears, and mortgageRateBps.');
          }
          assertInteger(event.mortgageYears, 'Home mortgageYears', 1);
          assertInteger(event.mortgageRateBps, 'Home mortgageRateBps', 0);
        }
        break;
      case 'haveKid':
        assertFutureYear(event.year, 'Child year');
        assertNonNegativeMoney(event.monthlyCostMinor, 'Child monthlyCostMinor');
        assertInteger(event.untilAge, 'Child untilAge', 0);
        break;
      case 'careerBreak':
        assertFutureYear(event.startYear, 'Career break startYear');
        assertInteger(event.endYear, 'Career break endYear');
        if (event.endYear <= event.startYear) {
          throw new Error('Career break endYear must be greater than startYear.');
        }
        assertPercentage(event.incomeReductionPct, 'Career break incomeReductionPct');
        break;
      case 'newJob':
        assertFutureYear(event.year, 'New job year');
        assertNonNegativeMoney(event.newMonthlyIncomeMinor, 'New job newMonthlyIncomeMinor');
        break;
      case 'otherIncome':
      case 'otherExpense':
        assertFutureYear(event.startYear, `${event.kind} startYear`);
        assertNonNegativeMoney(event.amountMinor, `${event.kind} amountMinor`);
        if (event.recurring) {
          assertInteger(event.recurring.intervalYears, `${event.kind} recurring intervalYears`, 1);
          if (event.recurring.endYear !== undefined) {
            assertInteger(event.recurring.endYear, `${event.kind} recurring endYear`);
            if (event.recurring.endYear < event.startYear) {
              throw new Error(`${event.kind} recurring endYear cannot be before startYear.`);
            }
          }
        }
        break;
      case 'endOfPlan':
        assertFutureAge(event.age, 'End-of-plan age');
        if (event.age <= currentAge) {
          throw new Error('End-of-plan age must be greater than the current age.');
        }
        break;
    }

    return { event: { ...event }, monthIndex: monthIndexForYear(year, start), calendarYear: year, order };
  });

  normalized.sort(
    (left, right) =>
      left.monthIndex - right.monthIndex || left.event.kind.localeCompare(right.event.kind) || left.order - right.order,
  );
  return normalized;
}

function normalizeAssumptions(
  params: ForecastParams,
  start: { year: number; month: number },
): { assumptions: NormalizedForecastAssumptions; runtimeEvents: Array<RuntimeEvent> } {
  const currency = normalizeCurrency(params.currency, 'currency');
  if (!Number.isInteger(params.birthYear)) throw new Error('birthYear must be an integer.');
  const currentAge = start.year - params.birthYear;
  const configuredEndAge = finiteNumber(params.endAge, 90, 'endAge');
  if (!Number.isInteger(configuredEndAge) || configuredEndAge <= currentAge) {
    throw new Error('endAge must be an integer greater than the age at startDate.');
  }

  const runtimeEvents = normalizeLifeEvents(params.events, params.birthYear, currentAge, start);
  const eventEndAge = runtimeEvents.reduce(
    (minimum, item) => (item.event.kind === 'endOfPlan' ? Math.min(minimum, item.event.age) : minimum),
    configuredEndAge,
  );
  const inflationAnnualPct = annualRate(params.inflationAnnualPct, 3, 'inflationAnnualPct');
  assertMatchingCurrency(currency, params.livingExpenses.currency, 'livingExpenses currency');
  assertNonNegativeMoney(params.livingExpenses.monthlyMinor, 'livingExpenses monthlyMinor');
  changeAnnualPct(params.livingExpenses.change, inflationAnnualPct, 'livingExpenses change');

  const seenIds = new Set<string>();
  const accounts = [...params.accounts]
    .map((account): ForecastAccountInput => {
      const id = account.id.trim();
      if (!id) throw new Error('Account id is required.');
      if (id === EXTRA_SAVINGS_ACCOUNT_ID) {
        throw new Error(`Account id ${EXTRA_SAVINGS_ACCOUNT_ID} is reserved.`);
      }
      if (seenIds.has(id)) throw new Error(`Duplicate account id: ${id}.`);
      seenIds.add(id);
      assertMatchingCurrency(currency, account.currency, `Account ${id} currency`);
      // Current accounts can legitimately start below zero while using an overdraft.
      if (account.kind !== 'cash') assertNonNegativeMoney(account.balanceMinor, `Account ${id} balanceMinor`);

      if (account.kind === 'liability') {
        if (account.liability === undefined) {
          throw new Error(`Liability account ${id} requires liability assumptions.`);
        }
        if (!Number.isInteger(account.liability.annualRateBps) || account.liability.annualRateBps < 0) {
          throw new Error(`Liability account ${id} annualRateBps must be a non-negative integer.`);
        }
        assertNonNegativeMoney(account.liability.paymentMonthlyMinor, `Liability account ${id} payment`);
        if (account.contributionYearlyMinor !== undefined) {
          throw new Error(`Liability account ${id} cannot receive contributions.`);
        }
      } else {
        annualRate(account.growthAnnualPct, 0, `Account ${id} growthAnnualPct`);
        if (account.contributionYearlyMinor !== undefined) {
          assertNonNegativeMoney(account.contributionYearlyMinor, `Account ${id} contributionYearlyMinor`);
        }
      }
      return { ...account, id, currency: account.currency?.trim().toUpperCase() };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const incomeIds = new Set<string>();
  const incomeSources = [...params.incomeSources]
    .map((source): ForecastIncomeSourceInput => {
      const id = source.id.trim();
      if (!id) throw new Error('Income source id is required.');
      if (incomeIds.has(id)) throw new Error(`Duplicate income source id: ${id}.`);
      incomeIds.add(id);
      assertMatchingCurrency(currency, source.currency, `Income source ${id} currency`);
      assertNonNegativeMoney(source.monthlyMinor, `Income source ${id} monthlyMinor`);
      changeAnnualPct(source.change, inflationAnnualPct, `Income source ${id} change`);
      return { ...source, id, currency: source.currency?.trim().toUpperCase() };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const growthAnnualPct = annualRate(params.extraSavings?.growthAnnualPct, 3, 'extraSavings growthAnnualPct');
  const splits = [...(params.extraSavings?.splits ?? [])].map((split) => {
    if (!seenIds.has(split.accountId)) throw new Error(`Unknown split account: ${split.accountId}.`);
    const target = accounts.find((account) => account.id === split.accountId);
    if (target?.kind === 'liability') throw new Error('Extra savings splits cannot target liabilities.');
    const pct = finiteNumber(split.pct, 0, `Split ${split.accountId} pct`);
    if (pct < 0 || pct > 100) throw new Error('Extra savings split pct must be between 0 and 100.');
    return { accountId: split.accountId, pct };
  });
  if (splits.length > 20) throw new Error('Extra savings supports at most 20 splits.');

  const capitalGainsTaxPct = finiteNumber(params.withdrawal?.capitalGainsTaxPct, 26, 'capitalGainsTaxPct');
  if (capitalGainsTaxPct < 0 || capitalGainsTaxPct >= 100) {
    throw new Error('capitalGainsTaxPct must be at least 0 and less than 100.');
  }

  return {
    assumptions: {
      currency,
      birthYear: params.birthYear,
      endAge: eventEndAge,
      inflationAnnualPct,
      accounts,
      incomeSources,
      livingExpenses: {
        ...params.livingExpenses,
        currency: params.livingExpenses.currency?.trim().toUpperCase(),
      },
      extraSavings: { growthAnnualPct, splits },
      withdrawal: { capitalGainsTaxPct },
      events: runtimeEvents.map((item) => item.event),
    },
    runtimeEvents,
  };
}

function powScaled(baseScaled: bigint, exponent: number) {
  let result = RATE_SCALE;
  for (let index = 0; index < exponent; index += 1) {
    result = multiplyScaled(result, baseScaled, RATE_SCALE);
  }
  return result;
}

function mortgagePaymentMonthly(principalMinor: bigint, annualRateBps: number, mortgageYears: number) {
  if (principalMinor === 0n) return 0n;
  const months = mortgageYears * 12;
  if (annualRateBps === 0) return (principalMinor + BigInt(months) - 1n) / BigInt(months);

  const monthlyRate = roundedDivide(BigInt(annualRateBps) * RATE_SCALE, MONTHLY_RATE_DENOMINATOR);
  const compounded = powScaled(RATE_SCALE + monthlyRate, months);
  const numerator = principalMinor * monthlyRate * compounded;
  const denominator = RATE_SCALE * (compounded - RATE_SCALE);
  return (numerator + denominator - 1n) / denominator;
}

function inflateMoney(value: bigint, deflatorScaled: bigint) {
  return multiplyScaled(value, deflatorScaled, RATE_SCALE);
}

function netWorth(
  assetStates: ReadonlyArray<AssetState>,
  extraSavingsMinor: bigint,
  liabilities: ReadonlyArray<LiabilityState>,
) {
  const assetsMinor = assetStates.reduce((total, account) => total + account.balanceMinor, extraSavingsMinor);
  const liabilitiesMinor = liabilities.reduce((total, liability) => total + liability.balanceMinor, 0n);
  return assetsMinor - liabilitiesMinor;
}

function withdrawDeficit(
  deficitMinor: bigint,
  extraSavingsMinor: bigint,
  assetStates: Array<AssetState>,
  investmentNetPctScaled: bigint,
) {
  const originalDeficitMinor = deficitMinor;
  const extraWithdrawalMinor = deficitMinor < extraSavingsMinor ? deficitMinor : extraSavingsMinor;
  extraSavingsMinor -= extraWithdrawalMinor;
  deficitMinor -= extraWithdrawalMinor;

  for (const account of assetStates) {
    if (deficitMinor === 0n || account.kind !== 'cash' || account.balanceMinor <= 0n) continue;
    const withdrawalMinor = deficitMinor < account.balanceMinor ? deficitMinor : account.balanceMinor;
    account.balanceMinor -= withdrawalMinor;
    deficitMinor -= withdrawalMinor;
  }

  for (const account of assetStates) {
    if (deficitMinor === 0n || account.kind !== 'investment') continue;
    const grossNeededMinor = roundedDivide(deficitMinor * HUNDRED_PERCENT_SCALED, investmentNetPctScaled);
    const withdrawalMinor = grossNeededMinor < account.balanceMinor ? grossNeededMinor : account.balanceMinor;
    account.balanceMinor -= withdrawalMinor;
    const netProceedsMinor = multiplyScaled(withdrawalMinor, investmentNetPctScaled, HUNDRED_PERCENT_SCALED);
    deficitMinor -= netProceedsMinor < deficitMinor ? netProceedsMinor : deficitMinor;
  }

  const liquidAssetsDepleted =
    extraSavingsMinor === 0n &&
    assetStates.every((account) => account.kind === 'otherAsset' || account.balanceMinor <= 0n);

  return {
    extraSavingsMinor,
    uncoveredDeficitMinor: deficitMinor,
    depleted: deficitMinor > 0n || (originalDeficitMinor > 0n && liquidAssetsDepleted),
  };
}

export function projectForecast(params: ForecastParams, options: { startDate: string }): ForecastResult {
  const start = parseStartDate(options.startDate);
  const normalized = normalizeAssumptions(params, start);
  const { assumptions, runtimeEvents } = normalized;
  const currentAge = start.year - assumptions.birthYear;
  const ageBasedTotalMonths = (assumptions.endAge - currentAge) * 12;
  const endOfPlanMonthIndex = runtimeEvents.reduce(
    (minimum, item) => (item.event.kind === 'endOfPlan' ? Math.min(minimum, item.monthIndex) : minimum),
    ageBasedTotalMonths,
  );
  const totalMonths = Math.min(ageBasedTotalMonths, endOfPlanMonthIndex);
  const inflationMonthlyScaled = monthlyRateScaled(assumptions.inflationAnnualPct);
  const livingExpensesMonthlyScaled = monthlyRateScaled(
    changeAnnualPct(assumptions.livingExpenses.change, assumptions.inflationAnnualPct, 'livingExpenses change'),
  );
  const extraSavingsGrowthMonthlyScaled = monthlyRateScaled(assumptions.extraSavings.growthAnnualPct);
  const investmentNetPctScaled = percentScaled(100 - assumptions.withdrawal.capitalGainsTaxPct);
  const splitStates = assumptions.extraSavings.splits.map((split) => ({
    accountId: split.accountId,
    pctScaled: percentScaled(split.pct),
  }));
  const assetStates: Array<AssetState> = assumptions.accounts
    .filter((account): account is ForecastAccountInput & { kind: AssetState['kind'] } => account.kind !== 'liability')
    .map((account) => ({
      id: account.id,
      kind: account.kind,
      balanceMinor: account.balanceMinor,
      growthMonthlyScaled: monthlyRateScaled(account.growthAnnualPct ?? 0),
      contributionMonthlyMinor: roundedDivide(account.contributionYearlyMinor ?? 0n, 12n),
    }));
  const assetsById = new Map(assetStates.map((account) => [account.id, account]));
  const liabilities: Array<LiabilityState> = assumptions.accounts
    .filter((account) => account.kind === 'liability')
    .map((account) => ({
      id: account.id,
      balanceMinor: account.balanceMinor,
      annualRateBps: account.liability!.annualRateBps,
      paymentMonthlyMinor: account.liability!.paymentMonthlyMinor,
      includedInLivingExpenses: account.liability!.includedInLivingExpenses,
      negativeAmortization: false,
    }));
  const incomeStates: Array<IncomeState> = assumptions.incomeSources.map((source) => ({
    monthlyMinor: source.monthlyMinor,
    monthlyRateScaled: monthlyRateScaled(
      changeAnnualPct(source.change, assumptions.inflationAnnualPct, `Income source ${source.id} change`),
    ),
    active: true,
  }));
  const eventsByMonth = new Map<number, Array<RuntimeEvent & { eventNumber: number }>>();
  const recurringFlowsByMonth = new Map<number, Array<ForecastLifeEvent>>();
  const careerBreaks: Array<{ startMonthIndex: number; endMonthIndex: number; incomeReductionPct: number }> = [];
  for (const [eventNumber, item] of runtimeEvents.entries()) {
    if (item.monthIndex < totalMonths) {
      const items = eventsByMonth.get(item.monthIndex) ?? [];
      items.push({ ...item, eventNumber });
      eventsByMonth.set(item.monthIndex, items);
    }
    if (item.event.kind === 'careerBreak') {
      careerBreaks.push({
        startMonthIndex: item.monthIndex,
        endMonthIndex: monthIndexForYear(item.event.endYear, start),
        incomeReductionPct: item.event.incomeReductionPct,
      });
    }
    if ((item.event.kind === 'otherIncome' || item.event.kind === 'otherExpense') && item.event.recurring) {
      const { intervalYears, endYear } = item.event.recurring;
      for (
        let year = item.event.startYear + intervalYears;
        endYear === undefined || year <= endYear;
        year += intervalYears
      ) {
        const monthIndex = monthIndexForYear(year, start);
        if (monthIndex >= totalMonths) break;
        const items = recurringFlowsByMonth.get(monthIndex) ?? [];
        items.push(item.event);
        recurringFlowsByMonth.set(monthIndex, items);
      }
    }
  }

  let livingExpensesMonthlyMinor = assumptions.livingExpenses.monthlyMinor;
  let extraSavingsMinor = 0n;
  let deflatorScaled = RATE_SCALE;
  let annualIncomeMinor = 0n;
  let annualExpensesMinor = 0n;
  let depletedMonthIndex: number | undefined;
  let retirementIncomePctScaled = HUNDRED_PERCENT_SCALED;
  let contributionsStopped = false;
  let retirement: ForecastResult['retirement'];
  const recurringExpenses: Array<RecurringExpenseState> = [];
  const homeCosts: Array<HomeCostState> = [];
  const yearly: Array<ForecastYearCheckpoint> = [];

  for (let monthIndex = 0; monthIndex < totalMonths; monthIndex += 1) {
    let eventIncomeMinor = 0n;
    let eventExpensesMinor = 0n;
    let retirementThisMonth: Extract<ForecastLifeEvent, { kind: 'retirement' }> | undefined;

    for (const item of eventsByMonth.get(monthIndex) ?? []) {
      const { event, eventNumber } = item;
      switch (event.kind) {
        case 'retirement':
          retirementIncomePctScaled = multiplyScaled(
            retirementIncomePctScaled,
            percentScaled(100 - event.incomeReductionPct),
            HUNDRED_PERCENT_SCALED,
          );
          livingExpensesMonthlyMinor = multiplyScaled(
            livingExpensesMonthlyMinor,
            percentScaled(event.expensePct),
            HUNDRED_PERCENT_SCALED,
          );
          if (event.extraYearlyExpensesMinor !== undefined) {
            recurringExpenses.push({
              monthlyMinor: roundedDivide(inflateMoney(event.extraYearlyExpensesMinor, deflatorScaled), 12n),
              monthlyRateScaled: inflationMonthlyScaled,
              endMonthIndex: undefined,
            });
          }
          contributionsStopped = true;
          retirementThisMonth ??= event;
          break;
        case 'pension':
          incomeStates.push({
            monthlyMinor: inflateMoney(event.monthlyBenefitMinor, deflatorScaled),
            monthlyRateScaled: inflationMonthlyScaled,
            active: true,
          });
          break;
        case 'buyHome': {
          const homeId = `event:${eventNumber}:home`;
          const mortgageId = `event:${eventNumber}:mortgage`;
          if (
            assetsById.has(homeId) ||
            assetsById.has(mortgageId) ||
            liabilities.some((liability) => liability.id === homeId || liability.id === mortgageId)
          ) {
            throw new Error(`Synthetic home account id collision for event ${eventNumber}.`);
          }
          const priceMinor = inflateMoney(event.priceMinor, deflatorScaled);
          const home: AssetState = {
            id: homeId,
            kind: 'otherAsset',
            balanceMinor: priceMinor,
            growthMonthlyScaled: inflationMonthlyScaled,
            contributionMonthlyMinor: 0n,
          };
          assetStates.push(home);
          assetsById.set(homeId, home);
          if (event.recurringCostsAnnualPct !== undefined && event.recurringCostsAnnualPct > 0) {
            homeCosts.push({
              assetId: homeId,
              annualPctScaled: percentScaled(event.recurringCostsAnnualPct),
            });
          }
          if (event.mode === 'cash') {
            eventExpensesMinor += priceMinor;
          } else {
            const downPaymentMinor = inflateMoney(event.downPaymentMinor!, deflatorScaled);
            const principalMinor = priceMinor - downPaymentMinor;
            liabilities.push({
              id: mortgageId,
              balanceMinor: principalMinor,
              annualRateBps: event.mortgageRateBps!,
              paymentMonthlyMinor: mortgagePaymentMonthly(principalMinor, event.mortgageRateBps!, event.mortgageYears!),
              includedInLivingExpenses: false,
              negativeAmortization: false,
            });
            eventExpensesMinor += downPaymentMinor;
          }
          break;
        }
        case 'haveKid':
          recurringExpenses.push({
            monthlyMinor: inflateMoney(event.monthlyCostMinor, deflatorScaled),
            monthlyRateScaled: inflationMonthlyScaled,
            endMonthIndex: monthIndex + event.untilAge * 12,
          });
          break;
        case 'careerBreak':
          break;
        case 'newJob':
          for (const source of incomeStates) source.active = false;
          incomeStates.push({
            monthlyMinor: inflateMoney(event.newMonthlyIncomeMinor, deflatorScaled),
            monthlyRateScaled: inflationMonthlyScaled,
            active: true,
          });
          break;
        case 'otherIncome':
          // Recurring yearly events stay lump sums: one inflation-adjusted January flow.
          eventIncomeMinor += inflateMoney(event.amountMinor, deflatorScaled);
          break;
        case 'otherExpense':
          // Recurring yearly events stay lump sums: one inflation-adjusted January flow.
          eventExpensesMinor += inflateMoney(event.amountMinor, deflatorScaled);
          break;
        case 'endOfPlan':
          break;
      }
    }

    for (const event of recurringFlowsByMonth.get(monthIndex) ?? []) {
      if (event.kind === 'otherIncome') {
        eventIncomeMinor += inflateMoney(event.amountMinor, deflatorScaled);
      } else if (event.kind === 'otherExpense') {
        eventExpensesMinor += inflateMoney(event.amountMinor, deflatorScaled);
      }
    }

    if (retirement === undefined && retirementThisMonth) {
      retirement = {
        age: retirementThisMonth.age,
        monthIndex,
        netWorthMinor: netWorth(assetStates, extraSavingsMinor, liabilities),
      };
    }

    for (const account of assetStates) {
      account.balanceMinor = applyMonthlyRate(account.balanceMinor, account.growthMonthlyScaled);
    }
    extraSavingsMinor = applyMonthlyRate(extraSavingsMinor, extraSavingsGrowthMonthlyScaled);

    let includedPaymentOffsetMinor = 0n;
    let explicitDebtPaymentsMinor = 0n;
    for (const liability of liabilities) {
      if (liability.balanceMinor === 0n) {
        if (liability.includedInLivingExpenses) {
          includedPaymentOffsetMinor += liability.paymentMonthlyMinor;
        }
        continue;
      }
      const stepped = stepLiability({
        balanceMinor: liability.balanceMinor,
        annualRateBps: liability.annualRateBps,
        paymentMonthlyMinor: liability.paymentMonthlyMinor,
        monthIndex,
      });
      liability.balanceMinor = stepped.endingBalanceMinor;
      liability.negativeAmortization ||= stepped.negativeAmortization;
      if (stepped.payoffMonthIndex !== undefined) liability.payoffMonthIndex = stepped.payoffMonthIndex;
      if (liability.includedInLivingExpenses) {
        includedPaymentOffsetMinor += liability.paymentMonthlyMinor - stepped.paymentMinor;
      } else {
        explicitDebtPaymentsMinor += stepped.paymentMinor;
      }
    }

    const careerBreakActive = careerBreaks.some(
      (careerBreak) => careerBreak.startMonthIndex <= monthIndex && monthIndex < careerBreak.endMonthIndex,
    );
    let contributionsMinor = 0n;
    if (!contributionsStopped && !careerBreakActive) {
      for (const account of assetStates) {
        account.balanceMinor += account.contributionMonthlyMinor;
        contributionsMinor += account.contributionMonthlyMinor;
      }
    }

    let incomeMinor = incomeStates.reduce((total, source) => total + (source.active ? source.monthlyMinor : 0n), 0n);
    incomeMinor = multiplyScaled(incomeMinor, retirementIncomePctScaled, HUNDRED_PERCENT_SCALED);
    for (const careerBreak of careerBreaks) {
      if (careerBreak.startMonthIndex <= monthIndex && monthIndex < careerBreak.endMonthIndex) {
        incomeMinor = multiplyScaled(
          incomeMinor,
          percentScaled(100 - careerBreak.incomeReductionPct),
          HUNDRED_PERCENT_SCALED,
        );
      }
    }
    incomeMinor += eventIncomeMinor;

    const effectiveLivingExpensesMinor =
      includedPaymentOffsetMinor < livingExpensesMonthlyMinor
        ? livingExpensesMonthlyMinor - includedPaymentOffsetMinor
        : 0n;
    const recurringExpensesMinor = recurringExpenses.reduce(
      (total, expense) =>
        expense.endMonthIndex === undefined || monthIndex < expense.endMonthIndex
          ? total + expense.monthlyMinor
          : total,
      0n,
    );
    const homeExpensesMinor = homeCosts.reduce((total, homeCost) => {
      const home = assetsById.get(homeCost.assetId);
      if (!home) return total;
      return (
        total + roundedDivide(multiplyScaled(home.balanceMinor, homeCost.annualPctScaled, HUNDRED_PERCENT_SCALED), 12n)
      );
    }, 0n);
    const expensesMinor =
      effectiveLivingExpensesMinor +
      explicitDebtPaymentsMinor +
      recurringExpensesMinor +
      homeExpensesMinor +
      eventExpensesMinor;
    const cashflowMinor = incomeMinor - expensesMinor - contributionsMinor;
    annualIncomeMinor += incomeMinor;
    annualExpensesMinor += expensesMinor;

    if (cashflowMinor >= 0n) {
      let remainderMinor = cashflowMinor;
      for (const account of assetStates) {
        if (remainderMinor === 0n || account.kind !== 'cash' || account.balanceMinor >= 0n) continue;
        const repaymentMinor = remainderMinor < -account.balanceMinor ? remainderMinor : -account.balanceMinor;
        account.balanceMinor += repaymentMinor;
        remainderMinor -= repaymentMinor;
      }
      for (const split of splitStates) {
        const splitMinor = multiplyScaled(remainderMinor, split.pctScaled, HUNDRED_PERCENT_SCALED);
        assetsById.get(split.accountId)!.balanceMinor += splitMinor;
        remainderMinor -= splitMinor;
      }
      extraSavingsMinor += remainderMinor;
    } else {
      const withdrawal = withdrawDeficit(-cashflowMinor, extraSavingsMinor, assetStates, investmentNetPctScaled);
      extraSavingsMinor = withdrawal.extraSavingsMinor;
      if (depletedMonthIndex === undefined && withdrawal.depleted) depletedMonthIndex = monthIndex;
    }

    for (const source of incomeStates) {
      source.monthlyMinor = applyMonthlyRate(source.monthlyMinor, source.monthlyRateScaled);
    }
    for (const expense of recurringExpenses) {
      expense.monthlyMinor = applyMonthlyRate(expense.monthlyMinor, expense.monthlyRateScaled);
    }
    livingExpensesMonthlyMinor = applyMonthlyRate(livingExpensesMonthlyMinor, livingExpensesMonthlyScaled);
    deflatorScaled = applyMonthlyRate(deflatorScaled, inflationMonthlyScaled);

    const date = monthEndIso(options.startDate, monthIndex);
    const isDecember = date.slice(5, 7) === '12';
    const isFinalMonth = monthIndex === totalMonths - 1;
    if (isDecember || isFinalMonth) {
      const calendarYear = Number(date.slice(0, 4));
      yearly.push({
        calendarYear,
        age: Math.min(assumptions.endAge, currentAge + Math.floor((monthIndex + 1) / 12)),
        date,
        accounts: [
          ...assetStates.map((account) => ({ id: account.id, endBalanceMinor: account.balanceMinor })),
          ...liabilities.map((liability) => ({ id: liability.id, endBalanceMinor: liability.balanceMinor })),
          { id: EXTRA_SAVINGS_ACCOUNT_ID, endBalanceMinor: extraSavingsMinor },
        ].sort((left, right) => left.id.localeCompare(right.id)),
        netWorthMinor: netWorth(assetStates, extraSavingsMinor, liabilities),
        annualIncomeMinor,
        annualExpensesMinor,
        annualSavingsMinor: annualIncomeMinor - annualExpensesMinor,
        deflatorScaled,
      });
      annualIncomeMinor = 0n;
      annualExpensesMinor = 0n;
    }
  }

  return {
    currency: assumptions.currency,
    yearly,
    events: runtimeEvents
      .filter((item) => item.monthIndex <= totalMonths)
      .map((item) => ({
        monthIndex: item.monthIndex,
        kind: item.event.kind,
        label: `${item.event.kind} ${item.calendarYear}`,
      })),
    retirement,
    liabilities: liabilities.map((liability) => ({
      id: liability.id,
      payoffMonthIndex: liability.payoffMonthIndex,
      negativeAmortization: liability.negativeAmortization,
    })),
    finalNetWorthMinor: netWorth(assetStates, extraSavingsMinor, liabilities),
    depletedMonthIndex,
    assumptions,
  };
}
