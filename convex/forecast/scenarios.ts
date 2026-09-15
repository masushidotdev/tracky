import { ConvexError, v } from 'convex/values';

import { mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import {
  HEX_COLOR_REGEX,
  SCENARIO_COLOR_VAR_REGEX,
  forecastChangeModeValidator,
  forecastLifeEventValidator,
  moneyAmountValidator,
} from '../lib/validators';
import { loadForecastSeeds } from './seeds';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const MAX_SCENARIOS = 50;
const MAX_ACCOUNT_ASSUMPTIONS = 100;
const MAX_INCOME_SOURCES = 20;
const MAX_LIFE_EVENTS = 50;
const MAX_SPLITS = 20;
const MAX_NAME_LENGTH = 80;
const MAX_SCENARIO_ICON_LENGTH = 8;

type ScenarioContext = QueryCtx | MutationCtx;
type MoneyAmount = { amountMinor: bigint; currency: string };
type ForecastEvent = Doc<'forecastLifeEvents'>['event'];

const targetValidator = v.union(
  v.object({ kind: v.literal('account'), accountId: v.id('financialAccounts') }),
  v.object({ kind: v.literal('creditFacility'), creditFacilityId: v.id('creditFacilities') }),
);

const liabilityValidator = v.object({
  annualRateBps: v.optional(v.number()),
  paymentMonthly: v.optional(moneyAmountValidator),
  includedInLivingExpenses: v.boolean(),
});

const incomeOverrideValidator = v.object({
  name: v.string(),
  amountMonthly: moneyAmountValidator,
  changeMode: forecastChangeModeValidator,
  customPct: v.optional(v.number()),
});

function normalizeName(name: string, label = 'Scenario name') {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > MAX_NAME_LENGTH) {
    throw new ConvexError(`${label} must contain 1 to ${MAX_NAME_LENGTH} characters`);
  }
  return normalized;
}

function normalizeScenarioIcon(icon: string) {
  const normalized = icon.trim();
  if (normalized.length > MAX_SCENARIO_ICON_LENGTH) {
    throw new ConvexError('Scenario icon must contain at most 8 characters');
  }
  return normalized;
}

function normalizeScenarioColor(color: string) {
  const normalized = color.trim();
  if (!HEX_COLOR_REGEX.test(normalized) && !SCENARIO_COLOR_VAR_REGEX.test(normalized)) {
    throw new ConvexError('Scenario color must use #rrggbb format or a chart palette token');
  }
  return normalized;
}

function finiteInRange(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ConvexError(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function integerInRange(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ConvexError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function validateBirthYear(birthYear: number) {
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > currentYear) {
    throw new ConvexError(`Birth year must be an integer from 1900 to ${currentYear}`);
  }
}

function validateAge(age: number, label: string) {
  if (!Number.isInteger(age) || age < 18 || age > 120) {
    throw new ConvexError(`${label} must be an integer from 18 to 120`);
  }
}

function validateChange(changeMode: 'inflation' | 'customPct' | 'fixed', customPct: number | undefined, label: string) {
  if (changeMode === 'customPct') {
    if (customPct === undefined) throw new ConvexError(`${label} requires customPct`);
    finiteInRange(customPct, -99, 100, `${label} customPct`);
  } else if (customPct !== undefined) {
    throw new ConvexError(`${label} customPct is only valid for customPct mode`);
  }
}

function validateMoney(amount: MoneyAmount, currency: string, label: string, allowZero = true) {
  if (amount.currency.toUpperCase() !== currency) {
    throw new ConvexError(`${label} currency must match scenario currency`);
  }
  if (amount.amountMinor < 0n || (!allowZero && amount.amountMinor === 0n)) {
    throw new ConvexError(`${label} must be ${allowZero ? 'non-negative' : 'positive'}`);
  }
}

function sameTarget(
  left: Doc<'forecastAccountAssumptions'>['target'],
  right: Doc<'forecastAccountAssumptions'>['target'],
) {
  return (
    left.kind === right.kind &&
    (left.kind === 'account'
      ? right.kind === 'account' && left.accountId === right.accountId
      : right.kind === 'creditFacility' && left.creditFacilityId === right.creditFacilityId)
  );
}

async function ownedScenario(ctx: ScenarioContext, userId: string, scenarioId: Id<'forecastScenarios'>) {
  const scenario = await ctx.db.get('forecastScenarios', scenarioId);
  if (!scenario || scenario.userId !== userId) throw new ConvexError('Forecast scenario not found');
  return scenario;
}

async function scenarioChildren(ctx: ScenarioContext, scenarioId: Id<'forecastScenarios'>) {
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

function validateScenarioConfig(
  args: {
    inflationAnnualPct?: number;
    endAge?: number;
    livingExpenses?: Doc<'forecastScenarios'>['livingExpenses'];
    extraSavings?: Doc<'forecastScenarios'>['extraSavings'];
    capitalGainsTaxPct?: number;
  },
  scenario: Doc<'forecastScenarios'>,
) {
  if (args.inflationAnnualPct !== undefined) {
    finiteInRange(args.inflationAnnualPct, -99, 100, 'Inflation');
  }
  if (args.endAge !== undefined) validateAge(args.endAge, 'End age');
  if (args.livingExpenses !== undefined) {
    validateMoney(args.livingExpenses.amountMonthly, scenario.currency, 'Living expenses');
    validateChange(args.livingExpenses.changeMode, args.livingExpenses.customPct, 'Living expenses change');
  }
  if (args.extraSavings !== undefined) {
    finiteInRange(args.extraSavings.growthAnnualPct, -99, 100, 'Extra savings growth');
    if (args.extraSavings.splits.length > MAX_SPLITS) {
      throw new ConvexError(`Extra savings can contain at most ${MAX_SPLITS} splits`);
    }
    const seen = new Set<Id<'financialAccounts'>>();
    let totalPct = 0;
    for (const split of args.extraSavings.splits) {
      if (seen.has(split.accountId)) throw new ConvexError('Extra savings split accounts must be unique');
      seen.add(split.accountId);
      totalPct += finiteInRange(split.pct, 0, 100, 'Extra savings split percentage');
    }
    if (totalPct > 100) throw new ConvexError('Extra savings split percentages cannot exceed 100');
  }
  if (args.capitalGainsTaxPct !== undefined) {
    finiteInRange(args.capitalGainsTaxPct, 0, 99, 'Capital gains tax');
  }
}

async function validateSplitAccounts(
  ctx: MutationCtx,
  userId: string,
  currency: string,
  splits: ReadonlyArray<{ accountId: Id<'financialAccounts'>; pct: number }>,
) {
  for (const split of splits) {
    const account = await ctx.db.get('financialAccounts', split.accountId);
    if (!account || account.userId !== userId || account.currency.toUpperCase() !== currency) {
      throw new ConvexError('Extra savings split account not found');
    }
  }
}

async function validateTarget(ctx: MutationCtx, userId: string, target: Doc<'forecastAccountAssumptions'>['target']) {
  if (target.kind === 'account') {
    const account = await ctx.db.get('financialAccounts', target.accountId);
    if (!account || account.userId !== userId) throw new ConvexError('Forecast account not found');
    return;
  }
  const facility = await ctx.db.get('creditFacilities', target.creditFacilityId);
  if (!facility || facility.userId !== userId) throw new ConvexError('Credit facility not found');
}

function validateLifeEvent(event: ForecastEvent, scenario: Doc<'forecastScenarios'>) {
  const currentYear = new Date().getUTCFullYear();
  const validateEventMoney = (amount: MoneyAmount, label: string) => validateMoney(amount, scenario.currency, label);
  switch (event.kind) {
    case 'retirement':
      validateAge(event.age, 'Retirement age');
      finiteInRange(event.expensePct, 0, 100, 'Retirement expense percentage');
      finiteInRange(event.incomeReductionPct, 0, 100, 'Retirement income reduction');
      if (event.extraYearlyExpenses) validateEventMoney(event.extraYearlyExpenses, 'Retirement extra expenses');
      break;
    case 'pension':
      validateAge(event.startAge, 'Pension start age');
      validateEventMoney(event.monthlyBenefit, 'Pension benefit');
      break;
    case 'buyHome':
      integerInRange(event.year, currentYear, currentYear + 120, 'Home purchase year');
      validateEventMoney(event.price, 'Home price');
      if (event.downPayment) validateEventMoney(event.downPayment, 'Home down payment');
      if (event.mortgageYears !== undefined) integerInRange(event.mortgageYears, 1, 50, 'Mortgage years');
      if (event.mortgageRateBps !== undefined) integerInRange(event.mortgageRateBps, 0, 100_000, 'Mortgage rate');
      if (event.recurringCostsAnnualPct !== undefined) {
        finiteInRange(event.recurringCostsAnnualPct, 0, 100, 'Home recurring costs');
      }
      break;
    case 'haveKid':
      integerInRange(event.year, currentYear, currentYear + 120, 'Child year');
      validateEventMoney(event.monthlyCost, 'Child monthly cost');
      integerInRange(event.untilAge, 0, 40, 'Child support age');
      break;
    case 'careerBreak':
      integerInRange(event.startYear, currentYear, currentYear + 120, 'Career break start year');
      integerInRange(event.endYear, event.startYear, currentYear + 120, 'Career break end year');
      finiteInRange(event.incomeReductionPct, 0, 100, 'Career break income reduction');
      break;
    case 'newJob':
      integerInRange(event.year, currentYear, currentYear + 120, 'New job year');
      validateEventMoney(event.newMonthlyIncome, 'New job income');
      break;
    case 'otherIncome':
    case 'otherExpense':
      integerInRange(event.startYear, currentYear, currentYear + 120, 'Event start year');
      validateEventMoney(event.amount, 'Event amount');
      if (event.recurring) {
        integerInRange(event.recurring.intervalYears, 1, 120, 'Recurring interval');
        if (event.recurring.endYear !== undefined) {
          integerInRange(event.recurring.endYear, event.startYear, currentYear + 120, 'Recurring end year');
        }
      }
      break;
    case 'endOfPlan':
      validateAge(event.age, 'End-of-plan age');
      break;
  }
}

async function upsertProfile(
  ctx: MutationCtx,
  userId: string,
  profile: { birthYear: number; defaultRetirementAge: number; onboardingCompletedAtMs?: number },
) {
  const existing = await ctx.db
    .query('userSettings')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch('userSettings', existing._id, { forecastProfile: profile, updatedAtMs: now });
  } else {
    await ctx.db.insert('userSettings', {
      userId,
      forecastProfile: profile,
      createdAtMs: now,
      updatedAtMs: now,
    });
  }
}

export const listScenarios = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    return await ctx.db
      .query('forecastScenarios')
      .withIndex('by_userId_and_sortOrder', (q) => q.eq('userId', user.id))
      .take(MAX_SCENARIOS);
  },
});

export const getScenario = query({
  args: { scenarioId: v.id('forecastScenarios') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const scenario = await ownedScenario(ctx, user.id, args.scenarioId);
    return { scenario, ...(await scenarioChildren(ctx, scenario._id)) };
  },
});

export const initializeForecast = mutation({
  args: {
    birthYear: v.number(),
    defaultRetirementAge: v.number(),
    retirementAge: v.optional(v.number()),
    includeAccountIds: v.optional(v.array(v.id('financialAccounts'))),
    incomeOverrides: v.optional(v.array(incomeOverrideValidator)),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const existing = await ctx.db
      .query('forecastScenarios')
      .withIndex('by_userId_and_sortOrder', (q) => q.eq('userId', user.id))
      .take(1);
    if (existing[0]) {
      // repair path: a scenario without a profile would otherwise deadlock on
      // getProjection's needsOnboarding while this mutation no-ops
      const settings = await ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', user.id))
        .unique();
      if (!settings?.forecastProfile) {
        validateBirthYear(args.birthYear);
        validateAge(args.defaultRetirementAge, 'Default retirement age');
        await upsertProfile(ctx, user.id, {
          birthYear: args.birthYear,
          defaultRetirementAge: args.defaultRetirementAge,
          onboardingCompletedAtMs: Date.now(),
        });
      }
      return existing[0]._id;
    }

    validateBirthYear(args.birthYear);
    validateAge(args.defaultRetirementAge, 'Default retirement age');
    if (args.retirementAge !== undefined) validateAge(args.retirementAge, 'Retirement age');
    const currentAge = new Date().getUTCFullYear() - args.birthYear;
    if (
      args.defaultRetirementAge < currentAge ||
      (args.retirementAge !== undefined && args.retirementAge < currentAge)
    ) {
      throw new ConvexError('Retirement age cannot be lower than the current age');
    }

    const seeds = await loadForecastSeeds(ctx, user.id);
    const includedAccountIds = args.includeAccountIds ? new Set(args.includeAccountIds) : null;
    if (includedAccountIds) {
      const seedIds = new Set(seeds.accounts.map((account) => account.accountId));
      if ([...includedAccountIds].some((accountId) => !seedIds.has(accountId))) {
        throw new ConvexError('Included forecast account not found');
      }
    }
    const incomeSources = args.incomeOverrides ?? seeds.incomeSources;
    if (incomeSources.length > MAX_INCOME_SOURCES) {
      throw new ConvexError(`At most ${MAX_INCOME_SOURCES} income sources are allowed`);
    }
    for (const income of incomeSources) {
      normalizeName(income.name, 'Income source name');
      validateMoney(income.amountMonthly, seeds.currency, 'Income source amount');
      validateChange(income.changeMode, 'customPct' in income ? income.customPct : undefined, 'Income source change');
    }

    const endAge = Math.min(120, Math.max(90, currentAge + 1, (args.retirementAge ?? args.defaultRetirementAge) + 20));
    const now = Date.now();
    const scenarioId = await ctx.db.insert('forecastScenarios', {
      userId: user.id,
      name: 'Base',
      sortOrder: 0,
      currency: seeds.currency,
      inflationAnnualPct: 3,
      endAge,
      livingExpenses: {
        amountMonthly: seeds.livingExpenses.amountMonthly,
        changeMode: seeds.livingExpenses.changeMode,
      },
      extraSavings: { growthAnnualPct: 3, splits: [] },
      capitalGainsTaxPct: 26,
      createdAtMs: now,
      updatedAtMs: now,
    });

    for (const account of seeds.accounts) {
      await ctx.db.insert('forecastAccountAssumptions', {
        userId: user.id,
        scenarioId,
        target: { kind: 'account', accountId: account.accountId },
        included: includedAccountIds ? includedAccountIds.has(account.accountId) : true,
        growthAnnualPct: account.growthAnnualPct,
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
    for (const liability of seeds.liabilities) {
      await ctx.db.insert('forecastAccountAssumptions', {
        userId: user.id,
        scenarioId,
        target: { kind: 'creditFacility', creditFacilityId: liability.creditFacilityId },
        included: true,
        liability: { includedInLivingExpenses: liability.includedInLivingExpenses },
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
    for (const [sortOrder, income] of incomeSources.entries()) {
      await ctx.db.insert('forecastIncomeSources', {
        userId: user.id,
        scenarioId,
        name: normalizeName(income.name, 'Income source name'),
        amountMonthly: { ...income.amountMonthly, currency: seeds.currency },
        changeMode: income.changeMode,
        customPct: 'customPct' in income ? income.customPct : undefined,
        sortOrder,
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
    if (args.retirementAge !== undefined) {
      await ctx.db.insert('forecastLifeEvents', {
        userId: user.id,
        scenarioId,
        enabled: true,
        event: {
          kind: 'retirement',
          age: args.retirementAge,
          expensePct: 80,
          incomeReductionPct: 100,
        },
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
    await upsertProfile(ctx, user.id, {
      birthYear: args.birthYear,
      defaultRetirementAge: args.defaultRetirementAge,
      onboardingCompletedAtMs: now,
    });
    return scenarioId;
  },
});

export const updateScenario = mutation({
  args: {
    scenarioId: v.id('forecastScenarios'),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    inflationAnnualPct: v.optional(v.number()),
    endAge: v.optional(v.number()),
    livingExpenses: v.optional(
      v.object({
        amountMonthly: moneyAmountValidator,
        changeMode: forecastChangeModeValidator,
        customPct: v.optional(v.number()),
      }),
    ),
    extraSavings: v.optional(
      v.object({
        growthAnnualPct: v.number(),
        splits: v.array(v.object({ accountId: v.id('financialAccounts'), pct: v.number() })),
      }),
    ),
    capitalGainsTaxPct: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const scenario = await ownedScenario(ctx, user.id, args.scenarioId);
    validateScenarioConfig(args, scenario);
    if (args.endAge !== undefined) {
      const settings = await ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', user.id))
        .unique();
      const currentAge = settings?.forecastProfile
        ? new Date().getUTCFullYear() - settings.forecastProfile.birthYear
        : null;
      if (currentAge !== null && args.endAge <= currentAge) {
        throw new ConvexError('End age must be greater than the current age');
      }
      if (settings?.forecastProfile && args.endAge < settings.forecastProfile.defaultRetirementAge) {
        throw new ConvexError('End age cannot be lower than the default retirement age');
      }
    }
    if (args.extraSavings) {
      await validateSplitAccounts(ctx, user.id, scenario.currency, args.extraSavings.splits);
    }
    const patch: Partial<Doc<'forecastScenarios'>> & { updatedAtMs: number } = { updatedAtMs: Date.now() };
    if (args.name !== undefined) patch.name = normalizeName(args.name);
    if (args.icon !== undefined) patch.icon = normalizeScenarioIcon(args.icon);
    if (args.color !== undefined) patch.color = normalizeScenarioColor(args.color);
    if (args.inflationAnnualPct !== undefined) patch.inflationAnnualPct = args.inflationAnnualPct;
    if (args.endAge !== undefined) patch.endAge = args.endAge;
    if (args.livingExpenses !== undefined) patch.livingExpenses = args.livingExpenses;
    if (args.extraSavings !== undefined) patch.extraSavings = args.extraSavings;
    if (args.capitalGainsTaxPct !== undefined) patch.capitalGainsTaxPct = args.capitalGainsTaxPct;
    await ctx.db.patch('forecastScenarios', scenario._id, patch);
    return await ctx.db.get('forecastScenarios', scenario._id);
  },
});

export const duplicateScenario = mutation({
  args: { scenarioId: v.id('forecastScenarios'), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const source = await ownedScenario(ctx, user.id, args.scenarioId);
    const scenarios = await ctx.db
      .query('forecastScenarios')
      .withIndex('by_userId_and_sortOrder', (q) => q.eq('userId', user.id))
      .take(MAX_SCENARIOS);
    if (scenarios.length >= MAX_SCENARIOS) throw new ConvexError(`At most ${MAX_SCENARIOS} scenarios are allowed`);
    const children = await scenarioChildren(ctx, source._id);
    const now = Date.now();
    const { _id: _sourceId, _creationTime: _sourceCreationTime, ...sourceFields } = source;
    const scenarioId = await ctx.db.insert('forecastScenarios', {
      ...sourceFields,
      name: normalizeName(args.name ?? `${source.name} copy`),
      sortOrder: Math.max(-1, ...scenarios.map((scenario) => scenario.sortOrder)) + 1,
      createdAtMs: now,
      updatedAtMs: now,
    });
    for (const child of children.accountAssumptions) {
      const { _id: _id, _creationTime: _creationTime, ...fields } = child;
      await ctx.db.insert('forecastAccountAssumptions', { ...fields, scenarioId, createdAtMs: now, updatedAtMs: now });
    }
    for (const child of children.incomeSources) {
      const { _id: _id, _creationTime: _creationTime, ...fields } = child;
      await ctx.db.insert('forecastIncomeSources', { ...fields, scenarioId, createdAtMs: now, updatedAtMs: now });
    }
    for (const child of children.lifeEvents) {
      const { _id: _id, _creationTime: _creationTime, ...fields } = child;
      await ctx.db.insert('forecastLifeEvents', { ...fields, scenarioId, createdAtMs: now, updatedAtMs: now });
    }
    return scenarioId;
  },
});

async function deleteChildren(
  ctx: MutationCtx,
  table: 'forecastAccountAssumptions' | 'forecastLifeEvents',
  scenarioId: Id<'forecastScenarios'>,
) {
  let rows = await ctx.db
    .query(table)
    .withIndex('by_scenarioId', (q) => q.eq('scenarioId', scenarioId))
    .take(100);
  while (rows.length > 0) {
    for (const row of rows) await ctx.db.delete(table, row._id);
    rows = await ctx.db
      .query(table)
      .withIndex('by_scenarioId', (q) => q.eq('scenarioId', scenarioId))
      .take(100);
  }
}

async function deleteIncomeChildren(ctx: MutationCtx, scenarioId: Id<'forecastScenarios'>) {
  let rows = await ctx.db
    .query('forecastIncomeSources')
    .withIndex('by_scenarioId_and_sortOrder', (q) => q.eq('scenarioId', scenarioId))
    .take(100);
  while (rows.length > 0) {
    for (const row of rows) await ctx.db.delete('forecastIncomeSources', row._id);
    rows = await ctx.db
      .query('forecastIncomeSources')
      .withIndex('by_scenarioId_and_sortOrder', (q) => q.eq('scenarioId', scenarioId))
      .take(100);
  }
}

export const deleteScenario = mutation({
  args: { scenarioId: v.id('forecastScenarios') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    await ownedScenario(ctx, user.id, args.scenarioId);
    await deleteChildren(ctx, 'forecastAccountAssumptions', args.scenarioId);
    await deleteIncomeChildren(ctx, args.scenarioId);
    await deleteChildren(ctx, 'forecastLifeEvents', args.scenarioId);
    await ctx.db.delete('forecastScenarios', args.scenarioId);
    return null;
  },
});

export const reorderScenarios = mutation({
  args: { orderedIds: v.array(v.id('forecastScenarios')) },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const scenarios = await ctx.db
      .query('forecastScenarios')
      .withIndex('by_userId_and_sortOrder', (q) => q.eq('userId', user.id))
      .take(MAX_SCENARIOS);
    if (args.orderedIds.length !== scenarios.length || new Set(args.orderedIds).size !== args.orderedIds.length) {
      throw new ConvexError('orderedIds must contain every scenario exactly once');
    }
    const ownedIds = new Set(scenarios.map((scenario) => scenario._id));
    if (args.orderedIds.some((scenarioId) => !ownedIds.has(scenarioId))) {
      throw new ConvexError('Forecast scenario not found');
    }
    const now = Date.now();
    for (const [sortOrder, scenarioId] of args.orderedIds.entries()) {
      await ctx.db.patch('forecastScenarios', scenarioId, { sortOrder, updatedAtMs: now });
    }
    return null;
  },
});

export const upsertAccountAssumption = mutation({
  args: {
    scenarioId: v.id('forecastScenarios'),
    target: targetValidator,
    included: v.boolean(),
    growthAnnualPct: v.optional(v.number()),
    contributionYearly: v.optional(moneyAmountValidator),
    liability: v.optional(liabilityValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const scenario = await ownedScenario(ctx, user.id, args.scenarioId);
    await validateTarget(ctx, user.id, args.target);
    if (args.growthAnnualPct !== undefined) finiteInRange(args.growthAnnualPct, -99, 100, 'Account growth');
    if (args.contributionYearly) validateMoney(args.contributionYearly, scenario.currency, 'Yearly contribution');
    if (args.liability) {
      if (args.target.kind !== 'creditFacility')
        throw new ConvexError('Liability settings require a credit facility target');
      if (args.liability.annualRateBps !== undefined) {
        integerInRange(args.liability.annualRateBps, 0, 100_000, 'Liability annual rate');
      }
      if (args.liability.paymentMonthly) {
        validateMoney(args.liability.paymentMonthly, scenario.currency, 'Liability payment', false);
      }
    }
    const rows = await ctx.db
      .query('forecastAccountAssumptions')
      .withIndex('by_scenarioId', (q) => q.eq('scenarioId', scenario._id))
      .take(MAX_ACCOUNT_ASSUMPTIONS);
    const existing = rows.find((row) => sameTarget(row.target, args.target));
    const now = Date.now();
    const fields = {
      target: args.target,
      included: args.included,
      growthAnnualPct: args.growthAnnualPct,
      contributionYearly: args.contributionYearly,
      liability: args.liability,
      updatedAtMs: now,
    };
    if (existing) {
      await ctx.db.patch('forecastAccountAssumptions', existing._id, fields);
      return existing._id;
    }
    if (rows.length >= MAX_ACCOUNT_ASSUMPTIONS) {
      throw new ConvexError(`At most ${MAX_ACCOUNT_ASSUMPTIONS} account assumptions are allowed`);
    }
    return await ctx.db.insert('forecastAccountAssumptions', {
      userId: user.id,
      scenarioId: scenario._id,
      ...fields,
      createdAtMs: now,
    });
  },
});

export const upsertIncomeSource = mutation({
  args: {
    scenarioId: v.id('forecastScenarios'),
    incomeSourceId: v.optional(v.id('forecastIncomeSources')),
    name: v.string(),
    amountMonthly: moneyAmountValidator,
    changeMode: forecastChangeModeValidator,
    customPct: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const scenario = await ownedScenario(ctx, user.id, args.scenarioId);
    const name = normalizeName(args.name, 'Income source name');
    validateMoney(args.amountMonthly, scenario.currency, 'Income source amount');
    validateChange(args.changeMode, args.customPct, 'Income source change');
    const rows = await ctx.db
      .query('forecastIncomeSources')
      .withIndex('by_scenarioId_and_sortOrder', (q) => q.eq('scenarioId', scenario._id))
      .take(MAX_INCOME_SOURCES);
    const existing = args.incomeSourceId
      ? rows.find((row) => row._id === args.incomeSourceId && row.userId === user.id)
      : undefined;
    if (args.incomeSourceId && !existing) throw new ConvexError('Forecast income source not found');
    const sortOrder = args.sortOrder ?? existing?.sortOrder ?? Math.max(-1, ...rows.map((row) => row.sortOrder)) + 1;
    if (!Number.isInteger(sortOrder) || sortOrder < 0)
      throw new ConvexError('Income source sortOrder must be a non-negative integer');
    const now = Date.now();
    const fields = {
      name,
      amountMonthly: args.amountMonthly,
      changeMode: args.changeMode,
      customPct: args.customPct,
      sortOrder,
      updatedAtMs: now,
    };
    if (existing) {
      await ctx.db.patch('forecastIncomeSources', existing._id, fields);
      return existing._id;
    }
    if (rows.length >= MAX_INCOME_SOURCES)
      throw new ConvexError(`At most ${MAX_INCOME_SOURCES} income sources are allowed`);
    return await ctx.db.insert('forecastIncomeSources', {
      userId: user.id,
      scenarioId: scenario._id,
      ...fields,
      createdAtMs: now,
    });
  },
});

export const deleteIncomeSource = mutation({
  args: { incomeSourceId: v.id('forecastIncomeSources') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const source = await ctx.db.get('forecastIncomeSources', args.incomeSourceId);
    if (!source || source.userId !== user.id) throw new ConvexError('Forecast income source not found');
    await ownedScenario(ctx, user.id, source.scenarioId);
    await ctx.db.delete('forecastIncomeSources', source._id);
    return null;
  },
});

export const upsertLifeEvent = mutation({
  args: {
    scenarioId: v.id('forecastScenarios'),
    lifeEventId: v.optional(v.id('forecastLifeEvents')),
    enabled: v.boolean(),
    event: forecastLifeEventValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const scenario = await ownedScenario(ctx, user.id, args.scenarioId);
    validateLifeEvent(args.event, scenario);
    const rows = await ctx.db
      .query('forecastLifeEvents')
      .withIndex('by_scenarioId', (q) => q.eq('scenarioId', scenario._id))
      .take(MAX_LIFE_EVENTS);
    const existing = args.lifeEventId
      ? rows.find((row) => row._id === args.lifeEventId && row.userId === user.id)
      : undefined;
    if (args.lifeEventId && !existing) throw new ConvexError('Forecast life event not found');
    const now = Date.now();
    if (existing) {
      await ctx.db.patch('forecastLifeEvents', existing._id, {
        enabled: args.enabled,
        event: args.event,
        updatedAtMs: now,
      });
      return existing._id;
    }
    if (rows.length >= MAX_LIFE_EVENTS) throw new ConvexError(`At most ${MAX_LIFE_EVENTS} life events are allowed`);
    return await ctx.db.insert('forecastLifeEvents', {
      userId: user.id,
      scenarioId: scenario._id,
      enabled: args.enabled,
      event: args.event,
      createdAtMs: now,
      updatedAtMs: now,
    });
  },
});

export const deleteLifeEvent = mutation({
  args: { lifeEventId: v.id('forecastLifeEvents') },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const event = await ctx.db.get('forecastLifeEvents', args.lifeEventId);
    if (!event || event.userId !== user.id) throw new ConvexError('Forecast life event not found');
    await ownedScenario(ctx, user.id, event.scenarioId);
    await ctx.db.delete('forecastLifeEvents', event._id);
    return null;
  },
});

export const updateForecastProfile = mutation({
  args: { birthYear: v.number(), defaultRetirementAge: v.number() },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    validateBirthYear(args.birthYear);
    validateAge(args.defaultRetirementAge, 'Default retirement age');
    const currentAge = new Date().getUTCFullYear() - args.birthYear;
    if (args.defaultRetirementAge < currentAge)
      throw new ConvexError('Default retirement age cannot be lower than the current age');
    const [existing, scenarios] = await Promise.all([
      ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', user.id))
        .unique(),
      ctx.db
        .query('forecastScenarios')
        .withIndex('by_userId_and_sortOrder', (q) => q.eq('userId', user.id))
        .take(MAX_SCENARIOS),
    ]);
    if (scenarios.some((scenario) => scenario.endAge < args.defaultRetirementAge || scenario.endAge <= currentAge)) {
      throw new ConvexError('Forecast profile ages must remain within every scenario end age');
    }
    await upsertProfile(ctx, user.id, {
      birthYear: args.birthYear,
      defaultRetirementAge: args.defaultRetirementAge,
      onboardingCompletedAtMs: existing?.forecastProfile?.onboardingCompletedAtMs,
    });
    return null;
  },
});
