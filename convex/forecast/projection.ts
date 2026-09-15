import { ConvexError, v } from 'convex/values';

import { internalQuery, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { latestBookedBalance } from '../banking/balances';
import { FEATURES, resolveTier } from '../lib/entitlements';
import { projectForecast } from './forecastCore';
import type { Doc, Id } from '../_generated/dataModel';
import type {
  ForecastAccountInput,
  ForecastChange,
  ForecastIncomeSourceInput,
  ForecastLifeEvent,
} from './forecastCore';
import type { QueryCtx } from '../_generated/server';

const MAX_SCENARIOS = 50;
const MAX_ACCOUNT_ASSUMPTIONS = 100;
const MAX_INCOME_SOURCES = 20;
const MAX_LIFE_EVENTS = 50;
const MAX_INSTALLMENT_PLANS = 200;

function accountKind(accountType: string | undefined): ForecastAccountInput['kind'] | null {
  switch (accountType?.toUpperCase()) {
    case 'INVS':
      return 'investment';
    case 'ASST':
      return 'otherAsset';
    case 'CARD':
      return null;
    case 'CACC':
    case 'SVGS':
    default:
      return 'cash';
  }
}

function forecastChange(
  changeMode: 'inflation' | 'customPct' | 'fixed',
  customPct: number | undefined,
): ForecastChange {
  if (changeMode === 'customPct') {
    if (customPct === undefined) throw new ConvexError('Custom percentage change is missing');
    return { mode: 'customPct', annualPct: customPct };
  }
  return changeMode;
}

type InvalidForecastEvent = { eventId: Id<'forecastLifeEvents'>; reason: string };
type StoredForecastEvent = Doc<'forecastLifeEvents'>;
type StoredMoney = { amountMinor: bigint; currency: string };

function mapStoredLifeEvent(
  stored: StoredForecastEvent,
  scenarioCurrency: string,
  currentYear: number,
  currentAge: number,
): { event?: ForecastLifeEvent; invalid?: InvalidForecastEvent } {
  const invalid = (reason: string) => ({ invalid: { eventId: stored._id, reason } });
  const event = stored.event;
  const validPercentage = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;
  const validYear = (value: number) => Number.isInteger(value) && value >= currentYear;
  const validAge = (value: number) => Number.isInteger(value) && value >= currentAge;
  const validMoney = (money: StoredMoney) =>
    money.currency.toUpperCase() === scenarioCurrency && money.amountMinor >= 0n;

  switch (event.kind) {
    case 'retirement':
      if (!validAge(event.age)) return invalid('Retirement age is below the current age');
      if (!validPercentage(event.expensePct) || !validPercentage(event.incomeReductionPct)) {
        return invalid('Retirement percentages must be between 0 and 100');
      }
      if (event.extraYearlyExpenses && !validMoney(event.extraYearlyExpenses)) {
        return invalid('Retirement extra expenses must be non-negative and use the scenario currency');
      }
      return {
        event: {
          kind: event.kind,
          age: event.age,
          expensePct: event.expensePct,
          extraYearlyExpensesMinor: event.extraYearlyExpenses?.amountMinor,
          incomeReductionPct: event.incomeReductionPct,
        },
      };
    case 'pension':
      if (!validAge(event.startAge)) return invalid('Pension start age is below the current age');
      if (!validMoney(event.monthlyBenefit)) {
        return invalid('Pension benefit must be non-negative and use the scenario currency');
      }
      return {
        event: { kind: event.kind, startAge: event.startAge, monthlyBenefitMinor: event.monthlyBenefit.amountMinor },
      };
    case 'buyHome':
      if (!validYear(event.year)) return invalid('Home purchase year is in the past');
      if (!validMoney(event.price) || event.price.amountMinor === 0n) {
        return invalid('Home price must be positive and use the scenario currency');
      }
      if (event.downPayment && !validMoney(event.downPayment)) {
        return invalid('Home down payment must be non-negative and use the scenario currency');
      }
      if (event.downPayment && event.downPayment.amountMinor > event.price.amountMinor) {
        return invalid('Home down payment cannot exceed the price');
      }
      if (event.recurringCostsAnnualPct !== undefined && !validPercentage(event.recurringCostsAnnualPct)) {
        return invalid('Home recurring costs percentage must be between 0 and 100');
      }
      if (event.mode === 'finance') {
        if (
          event.downPayment === undefined ||
          event.mortgageYears === undefined ||
          event.mortgageRateBps === undefined
        ) {
          return invalid('Financed home purchase requires down payment, mortgage years, and mortgage rate');
        }
        if (!Number.isInteger(event.mortgageYears) || event.mortgageYears < 1) {
          return invalid('Mortgage years must be a positive integer');
        }
        if (!Number.isInteger(event.mortgageRateBps) || event.mortgageRateBps < 0) {
          return invalid('Mortgage rate must be a non-negative integer');
        }
      }
      return {
        event: {
          kind: event.kind,
          year: event.year,
          priceMinor: event.price.amountMinor,
          mode: event.mode,
          downPaymentMinor: event.downPayment?.amountMinor,
          mortgageYears: event.mortgageYears,
          mortgageRateBps: event.mortgageRateBps,
          recurringCostsAnnualPct: event.recurringCostsAnnualPct,
        },
      };
    case 'haveKid':
      if (!validYear(event.year)) return invalid('Child event year is in the past');
      if (!validMoney(event.monthlyCost)) {
        return invalid('Child monthly cost must be non-negative and use the scenario currency');
      }
      if (!Number.isInteger(event.untilAge) || event.untilAge < 0) {
        return invalid('Child support age must be a non-negative integer');
      }
      return {
        event: {
          kind: event.kind,
          year: event.year,
          monthlyCostMinor: event.monthlyCost.amountMinor,
          untilAge: event.untilAge,
        },
      };
    case 'careerBreak':
      if (!validYear(event.startYear)) return invalid('Career break start year is in the past');
      if (!Number.isInteger(event.endYear) || event.endYear <= event.startYear) {
        return invalid('Career break end year must be greater than its start year');
      }
      if (!validPercentage(event.incomeReductionPct)) {
        return invalid('Career break income reduction must be between 0 and 100');
      }
      return {
        event: {
          kind: event.kind,
          startYear: event.startYear,
          endYear: event.endYear,
          incomeReductionPct: event.incomeReductionPct,
        },
      };
    case 'newJob':
      if (!validYear(event.year)) return invalid('New job year is in the past');
      if (!validMoney(event.newMonthlyIncome)) {
        return invalid('New job income must be non-negative and use the scenario currency');
      }
      return {
        event: { kind: event.kind, year: event.year, newMonthlyIncomeMinor: event.newMonthlyIncome.amountMinor },
      };
    case 'otherIncome':
    case 'otherExpense':
      if (!validYear(event.startYear)) return invalid(`${event.kind} start year is in the past`);
      if (!validMoney(event.amount)) {
        return invalid(`${event.kind} amount must be non-negative and use the scenario currency`);
      }
      if (event.recurring) {
        if (!Number.isInteger(event.recurring.intervalYears) || event.recurring.intervalYears < 1) {
          return invalid(`${event.kind} recurring interval must be a positive integer`);
        }
        if (
          event.recurring.endYear !== undefined &&
          (!Number.isInteger(event.recurring.endYear) || event.recurring.endYear < event.startYear)
        ) {
          return invalid(`${event.kind} recurring end year cannot be before its start year`);
        }
      }
      return {
        event: {
          kind: event.kind,
          startYear: event.startYear,
          amountMinor: event.amount.amountMinor,
          recurring: event.recurring,
        },
      };
    case 'endOfPlan':
      if (!validAge(event.age) || event.age <= currentAge) {
        return invalid('End-of-plan age must be greater than the current age');
      }
      return { event: { kind: event.kind, age: event.age } };
  }
}

async function settingsForUser(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query('userSettings')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
}

async function loadScenario(ctx: QueryCtx, userId: string, scenarioId: Id<'forecastScenarios'> | undefined) {
  if (scenarioId) {
    const scenario = await ctx.db.get('forecastScenarios', scenarioId);
    if (!scenario || scenario.userId !== userId) throw new ConvexError('Forecast scenario not found');
    return scenario;
  }
  return (
    (
      await ctx.db
        .query('forecastScenarios')
        .withIndex('by_userId_and_sortOrder', (q) => q.eq('userId', userId))
        .take(MAX_SCENARIOS)
    ).at(0) ?? null
  );
}

async function loadChildren(ctx: QueryCtx, scenarioId: Id<'forecastScenarios'>) {
  const [accountAssumptions, incomeSources, lifeEvents] = await Promise.all([
    ctx.db
      .query('forecastAccountAssumptions')
      .withIndex('by_scenarioId', (q) => q.eq('scenarioId', scenarioId))
      .take(MAX_ACCOUNT_ASSUMPTIONS),
    ctx.db
      .query('forecastIncomeSources')
      .withIndex('by_scenarioId_and_sortOrder', (q) => q.eq('scenarioId', scenarioId))
      .take(MAX_INCOME_SOURCES),
    ctx.db
      .query('forecastLifeEvents')
      .withIndex('by_scenarioId', (q) => q.eq('scenarioId', scenarioId))
      .take(MAX_LIFE_EVENTS),
  ]);
  return { accountAssumptions, incomeSources, lifeEvents };
}

async function projectionForUser(ctx: QueryCtx, userId: string, scenarioId: Id<'forecastScenarios'> | undefined) {
  const settings = await settingsForUser(ctx, userId);
  if (!FEATURES['forecast.scenarios'][resolveTier(settings)]) {
    return { upgradeRequired: true as const };
  }

  const scenario = await loadScenario(ctx, userId, scenarioId);
  if (!scenario || !settings?.forecastProfile) {
    return { needsOnboarding: true as const };
  }
  const children = await loadChildren(ctx, scenario._id);
  const startDate = new Date().toISOString().slice(0, 10);
  const currentYear = Number(startDate.slice(0, 4));
  const currentAge = currentYear - settings.forecastProfile.birthYear;
  const events: Array<ForecastLifeEvent> = [];
  const invalidEvents: Array<InvalidForecastEvent> = [];
  for (const stored of children.lifeEvents) {
    if (!stored.enabled) continue;
    const mapped = mapStoredLifeEvent(stored, scenario.currency.toUpperCase(), currentYear, currentAge);
    if (mapped.invalid) invalidEvents.push(mapped.invalid);
    else if (mapped.event) events.push(mapped.event);
  }

  const activePlans = await ctx.db
    .query('creditFacilityInstallmentPlans')
    .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
    .take(MAX_INSTALLMENT_PLANS);
  const plansByFacility = new Map<Id<'creditFacilities'>, Array<Doc<'creditFacilityInstallmentPlans'>>>();
  for (const plan of activePlans) {
    const plans = plansByFacility.get(plan.creditFacilityId) ?? [];
    plans.push(plan);
    plansByFacility.set(plan.creditFacilityId, plans);
  }

  const accounts: Array<ForecastAccountInput> = [];
  const excludedAccounts: Array<{
    accountId: Id<'financialAccounts'>;
    name: string;
    reason: 'notFound' | 'inactive' | 'currencyMismatch' | 'unsupportedType';
  }> = [];
  const excludedFacilities: Array<{
    creditFacilityId: Id<'creditFacilities'>;
    name: string;
    reason: 'notFound' | 'inactive' | 'currencyMismatch' | 'missingRate' | 'missingPayment';
  }> = [];

  for (const assumption of children.accountAssumptions) {
    if (!assumption.included) continue;
    if (assumption.target.kind === 'account') {
      const account = await ctx.db.get('financialAccounts', assumption.target.accountId);
      if (!account || account.userId !== userId) {
        excludedAccounts.push({
          accountId: assumption.target.accountId,
          name: 'Unavailable account',
          reason: 'notFound',
        });
        continue;
      }
      if (account.status !== 'active') {
        excludedAccounts.push({
          accountId: account._id,
          name: account.alias?.trim() || account.name,
          reason: 'inactive',
        });
        continue;
      }
      const latest = await latestBookedBalance(ctx, account._id);
      if (
        account.currency.toUpperCase() !== scenario.currency ||
        (latest && latest.amount.currency.toUpperCase() !== scenario.currency) ||
        (assumption.contributionYearly && assumption.contributionYearly.currency.toUpperCase() !== scenario.currency)
      ) {
        excludedAccounts.push({
          accountId: account._id,
          name: account.alias?.trim() || account.name,
          reason: 'currencyMismatch',
        });
        continue;
      }
      const kind = accountKind(account.accountType);
      if (!kind) {
        excludedAccounts.push({
          accountId: account._id,
          name: account.alias?.trim() || account.name,
          reason: 'unsupportedType',
        });
        continue;
      }
      accounts.push({
        id: account._id,
        kind,
        currency: scenario.currency,
        balanceMinor: latest?.amount.amountMinor ?? 0n,
        growthAnnualPct: assumption.growthAnnualPct,
        contributionYearlyMinor: assumption.contributionYearly?.amountMinor,
      });
      continue;
    }

    const facility = await ctx.db.get('creditFacilities', assumption.target.creditFacilityId);
    if (!facility || facility.userId !== userId) {
      excludedFacilities.push({
        creditFacilityId: assumption.target.creditFacilityId,
        name: 'Unavailable facility',
        reason: 'notFound',
      });
      continue;
    }
    if (facility.status !== 'active') {
      excludedFacilities.push({ creditFacilityId: facility._id, name: facility.name, reason: 'inactive' });
      continue;
    }
    const plans = plansByFacility.get(facility._id) ?? [];
    const facilityCurrency = (plans[0]?.outstandingAmount.currency ?? facility.usedAmount.currency).toUpperCase();
    const paymentOverride = assumption.liability?.paymentMonthly;
    if (
      facilityCurrency !== scenario.currency ||
      plans.some(
        (plan) =>
          plan.outstandingAmount.currency.toUpperCase() !== scenario.currency ||
          plan.monthlyPaymentAmount.currency.toUpperCase() !== scenario.currency,
      ) ||
      (paymentOverride && paymentOverride.currency.toUpperCase() !== scenario.currency)
    ) {
      excludedFacilities.push({ creditFacilityId: facility._id, name: facility.name, reason: 'currencyMismatch' });
      continue;
    }
    const annualRateBps = assumption.liability?.annualRateBps ?? facility.annualNominalRateBps;
    if (annualRateBps === undefined || !Number.isInteger(annualRateBps) || annualRateBps < 0) {
      excludedFacilities.push({ creditFacilityId: facility._id, name: facility.name, reason: 'missingRate' });
      continue;
    }
    const livePaymentMinor = plans.reduce((total, plan) => total + plan.monthlyPaymentAmount.amountMinor, 0n);
    const paymentMonthlyMinor = paymentOverride?.amountMinor ?? livePaymentMinor;
    if (paymentMonthlyMinor <= 0n) {
      excludedFacilities.push({ creditFacilityId: facility._id, name: facility.name, reason: 'missingPayment' });
      continue;
    }
    const balanceMinor =
      plans.length > 0
        ? plans.reduce((total, plan) => total + plan.outstandingAmount.amountMinor, 0n)
        : facility.usedAmount.amountMinor;
    accounts.push({
      id: facility._id,
      kind: 'liability',
      currency: scenario.currency,
      balanceMinor,
      liability: {
        annualRateBps,
        paymentMonthlyMinor,
        includedInLivingExpenses: assumption.liability?.includedInLivingExpenses ?? true,
      },
    });
  }

  const incomeSources: Array<ForecastIncomeSourceInput> = [];
  for (const source of children.incomeSources) {
    if (source.amountMonthly.currency.toUpperCase() !== scenario.currency) continue;
    incomeSources.push({
      id: source._id,
      name: source.name,
      currency: scenario.currency,
      monthlyMinor: source.amountMonthly.amountMinor,
      change: forecastChange(source.changeMode, source.customPct),
    });
  }

  const splittableAccountIds = new Set(
    accounts.filter((account) => account.kind !== 'liability').map((account) => account.id),
  );
  const projection = projectForecast(
    {
      currency: scenario.currency,
      birthYear: settings.forecastProfile.birthYear,
      endAge: scenario.endAge,
      inflationAnnualPct: scenario.inflationAnnualPct,
      accounts,
      incomeSources,
      livingExpenses: {
        currency: scenario.currency,
        monthlyMinor: scenario.livingExpenses.amountMonthly.amountMinor,
        change: forecastChange(scenario.livingExpenses.changeMode, scenario.livingExpenses.customPct),
      },
      extraSavings: {
        growthAnnualPct: scenario.extraSavings.growthAnnualPct,
        splits: scenario.extraSavings.splits
          .filter((split) => splittableAccountIds.has(split.accountId))
          .map((split) => ({ accountId: split.accountId, pct: split.pct })),
      },
      withdrawal: { capitalGainsTaxPct: scenario.capitalGainsTaxPct },
      events,
    },
    { startDate },
  );

  return {
    scenario: {
      id: scenario._id,
      name: scenario.name,
      icon: scenario.icon,
      color: scenario.color,
      sortOrder: scenario.sortOrder,
      currency: scenario.currency,
      inflationAnnualPct: scenario.inflationAnnualPct,
      endAge: scenario.endAge,
    },
    projection,
    excludedAccounts,
    excludedFacilities,
    events: projection.events,
    invalidEvents,
  };
}

export const getProjection = query({
  args: { scenarioId: v.id('forecastScenarios') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await projectionForUser(ctx, user.id, args.scenarioId);
  },
});

export const getProjectionForUser = internalQuery({
  args: { userId: v.string(), scenarioId: v.optional(v.id('forecastScenarios')) },
  handler: async (ctx, args) => await projectionForUser(ctx, args.userId, args.scenarioId),
});
