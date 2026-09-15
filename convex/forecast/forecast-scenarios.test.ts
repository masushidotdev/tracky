/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { components } from '../_generated/api';
import schema from '../schema';
import type { Doc, Id } from '../_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const discoveredModules = import.meta.glob([
  '../_generated/*.js',
  '../auth.ts',
  '../authProfiles.ts',
  '../lib/*.ts',
  './seeds.ts',
  './scenarios.ts',
  './forecastCore.ts',
  './liabilityMath.ts',
  './projectionMath.ts',
]);
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, loader]) => [
    path.startsWith('../') ? `./${path.slice(3)}` : `./forecast/${path.slice(2)}`,
    loader,
  ]),
);

type Money = { amountMinor: bigint; currency: string };
type SeedResult = {
  currency: string;
  incomeSources: Array<{ name: string; amountMonthly: Money; seededFromDefaults: boolean }>;
  livingExpenses: { amountMonthly: Money; seededFromDefaults: boolean };
  accounts: Array<{
    accountId: Id<'financialAccounts'>;
    accountType?: string;
    kind: 'cash' | 'investment' | 'otherAsset';
    balance: Money;
    growthAnnualPct: number;
  }>;
  liabilities: Array<{
    creditFacilityId: Id<'creditFacilities'>;
    balance: Money;
    annualRateBps: number;
    paymentMonthly: Money;
  }>;
  excludedFacilities: Array<{ creditFacilityId: Id<'creditFacilities'>; missing: Array<string> }>;
  historyMonths: { income: number; expenses: number };
};
type ScenarioBundle = {
  scenario: Doc<'forecastScenarios'>;
  accountAssumptions: Array<Doc<'forecastAccountAssumptions'>>;
  incomeSources: Array<Doc<'forecastIncomeSources'>>;
  lifeEvents: Array<Doc<'forecastLifeEvents'>>;
};
type ForecastEvent = Doc<'forecastLifeEvents'>['event'];
type AccountTarget = Doc<'forecastAccountAssumptions'>['target'];

const getForecastSeeds = makeFunctionReference<'query', Record<string, never>, SeedResult>(
  'forecast/seeds:getForecastSeeds',
);
const listScenarios = makeFunctionReference<'query', Record<string, never>, Array<Doc<'forecastScenarios'>>>(
  'forecast/scenarios:listScenarios',
);
const getScenario = makeFunctionReference<'query', { scenarioId: Id<'forecastScenarios'> }, ScenarioBundle>(
  'forecast/scenarios:getScenario',
);
const initializeForecast = makeFunctionReference<
  'mutation',
  {
    birthYear: number;
    defaultRetirementAge: number;
    retirementAge?: number;
    includeAccountIds?: Array<Id<'financialAccounts'>>;
    incomeOverrides?: Array<{
      name: string;
      amountMonthly: Money;
      changeMode: 'inflation' | 'customPct' | 'fixed';
      customPct?: number;
    }>;
  },
  Id<'forecastScenarios'>
>('forecast/scenarios:initializeForecast');
const updateScenario = makeFunctionReference<
  'mutation',
  {
    scenarioId: Id<'forecastScenarios'>;
    name?: string;
    icon?: string;
    color?: string;
    inflationAnnualPct?: number;
    endAge?: number;
    capitalGainsTaxPct?: number;
  },
  Doc<'forecastScenarios'> | null
>('forecast/scenarios:updateScenario');
const duplicateScenario = makeFunctionReference<
  'mutation',
  { scenarioId: Id<'forecastScenarios'>; name?: string },
  Id<'forecastScenarios'>
>('forecast/scenarios:duplicateScenario');
const deleteScenario = makeFunctionReference<'mutation', { scenarioId: Id<'forecastScenarios'> }, null>(
  'forecast/scenarios:deleteScenario',
);
const reorderScenarios = makeFunctionReference<'mutation', { orderedIds: Array<Id<'forecastScenarios'>> }, null>(
  'forecast/scenarios:reorderScenarios',
);
const upsertAccountAssumption = makeFunctionReference<
  'mutation',
  {
    scenarioId: Id<'forecastScenarios'>;
    target: AccountTarget;
    included: boolean;
    growthAnnualPct?: number;
    contributionYearly?: Money;
    liability?: { annualRateBps?: number; paymentMonthly?: Money; includedInLivingExpenses: boolean };
  },
  Id<'forecastAccountAssumptions'>
>('forecast/scenarios:upsertAccountAssumption');
const upsertIncomeSource = makeFunctionReference<
  'mutation',
  {
    scenarioId: Id<'forecastScenarios'>;
    incomeSourceId?: Id<'forecastIncomeSources'>;
    name: string;
    amountMonthly: Money;
    changeMode: 'inflation' | 'customPct' | 'fixed';
    customPct?: number;
    sortOrder?: number;
  },
  Id<'forecastIncomeSources'>
>('forecast/scenarios:upsertIncomeSource');
const deleteIncomeSource = makeFunctionReference<'mutation', { incomeSourceId: Id<'forecastIncomeSources'> }, null>(
  'forecast/scenarios:deleteIncomeSource',
);
const upsertLifeEvent = makeFunctionReference<
  'mutation',
  {
    scenarioId: Id<'forecastScenarios'>;
    lifeEventId?: Id<'forecastLifeEvents'>;
    enabled: boolean;
    event: ForecastEvent;
  },
  Id<'forecastLifeEvents'>
>('forecast/scenarios:upsertLifeEvent');
const deleteLifeEvent = makeFunctionReference<'mutation', { lifeEventId: Id<'forecastLifeEvents'> }, null>(
  'forecast/scenarios:deleteLifeEvent',
);
const updateForecastProfile = makeFunctionReference<
  'mutation',
  { birthYear: number; defaultRetirementAge: number },
  null
>('forecast/scenarios:updateForecastProfile');

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthUser(t: TestHarness, userId: string, firstName = 'Forecast', lastName = 'User') {
  const timestamp = '2026-07-01T00:00:00.000Z';
  await t.mutation(components.workOSAuthKit.lib.onWebhookEvent, {
    apiKey: 'sk_test',
    event: {
      id: `evt_${userId}`,
      createdAt: timestamp,
      event: 'user.created',
      data: {
        object: 'user',
        id: userId,
        email: `${userId}@example.com`,
        firstName,
        lastName,
        emailVerified: true,
        profilePictureUrl: null,
        lastSignInAt: null,
        externalId: null,
        metadata: {},
        locale: 'en-US',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
  });
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query('userProfiles')
      .withIndex('by_authUserId', (q) => q.eq('authUserId', userId))
      .unique();
    if (!existing) {
      const now = Date.parse(timestamp);
      await ctx.db.insert('userProfiles', {
        authUserId: userId,
        email: `${userId}@example.com`,
        name: `${firstName} ${lastName}`,
        firstName,
        lastName,
        emailVerified: true,
        locale: 'en-US',
        status: 'active',
        createdAtMs: now,
        updatedAtMs: now,
        lastSyncedAtMs: now,
      });
    }
  });
}

async function seedAccount(
  t: TestHarness,
  input: { userId: string; name: string; accountType: string; currency?: string; balanceMinor?: bigint },
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const currency = input.currency ?? 'EUR';
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId: input.userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId: input.userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: `${input.name}_${input.userId}`,
      name: input.name,
      accountType: input.accountType,
      currency,
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    if (input.balanceMinor !== undefined) {
      await ctx.db.insert('accountBalances', {
        userId: input.userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'closingBooked',
        amount: { amountMinor: input.balanceMinor, currency },
        fetchedAtMs: now,
      });
    }
    return { accountId, providerConnectionId };
  });
}

function previousCompleteMonth(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 15)).toISOString().slice(0, 10);
}

async function seedTransaction(
  t: TestHarness,
  input: {
    userId: string;
    accountId: Id<'financialAccounts'>;
    providerConnectionId: Id<'providerConnections'>;
    bookingDate: string;
    direction: 'CRDT' | 'DBIT';
    amountMinor: bigint;
    currency?: string;
    classificationKind?: 'income' | 'expense' | 'transfer' | 'internal';
  },
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert('transactions', {
      userId: input.userId,
      accountId: input.accountId,
      providerConnectionId: input.providerConnectionId,
      provider: 'mock',
      providerTransactionId: `${input.direction}_${input.bookingDate}_${input.amountMinor}`,
      dedupeKey: `${input.userId}_${input.direction}_${input.bookingDate}_${input.amountMinor}`,
      status: 'BOOK',
      direction: input.direction,
      amount: { amountMinor: input.amountMinor, currency: input.currency ?? 'EUR' },
      bookingDate: input.bookingDate,
      description: 'Forecast fixture',
      classificationKind: input.classificationKind ?? (input.direction === 'CRDT' ? 'income' : 'expense'),
      classificationSource: 'user',
      importedAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedFacility(t: TestHarness, userId: string) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const facilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Personal loan',
      facilityType: 'installmentCredit',
      status: 'active',
      source: 'manual',
      provider: 'manual',
      limitAmount: { amountMinor: 1_200_000n, currency: 'EUR' },
      usedAmount: { amountMinor: 900_000n, currency: 'EUR' },
      repaymentType: 'installmentPlan',
      annualNominalRateBps: 525,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('creditFacilityInstallmentPlans', {
      userId,
      creditFacilityId: facilityId,
      name: 'Main plan',
      principalAmount: { amountMinor: 1_000_000n, currency: 'EUR' },
      outstandingAmount: { amountMinor: 900_000n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 50_000n, currency: 'EUR' },
      installmentCount: 20,
      remainingInstallments: 18,
      startDate: '2026-01-01',
      endDate: '2027-08-01',
      status: 'active',
      createdAtMs: now,
      updatedAtMs: now,
    });
    return facilityId;
  });
}

async function seedScenario(t: TestHarness, userId: string, sortOrder = 0, name = 'Scenario') {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert('forecastScenarios', {
      userId,
      name,
      sortOrder,
      currency: 'EUR',
      inflationAnnualPct: 3,
      endAge: 90,
      livingExpenses: { amountMonthly: { amountMinor: 100_000n, currency: 'EUR' }, changeMode: 'inflation' },
      extraSavings: { growthAnnualPct: 3, splits: [] },
      capitalGainsTaxPct: 26,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

describe('forecast seeds and scenario CRUD', () => {
  test('seeds monthly actual averages, balances, growth defaults, and configured liabilities', async () => {
    const t = createTest();
    const userId = 'forecast_seed_user';
    await seedAuthUser(t, userId, 'Ada', 'Lovelace');
    const checking = await seedAccount(t, { userId, name: 'Checking', accountType: 'CACC', balanceMinor: 100_000n });
    await seedAccount(t, { userId, name: 'Savings', accountType: 'SVGS', balanceMinor: 200_000n });
    await seedAccount(t, { userId, name: 'Investments', accountType: 'INVS', balanceMinor: 300_000n });
    await seedAccount(t, { userId, name: 'Property', accountType: 'ASST', balanceMinor: 400_000n });
    await seedAccount(t, { userId, name: 'Card', accountType: 'CARD', balanceMinor: -20_000n });
    await seedAccount(t, {
      userId,
      name: 'Dollar account',
      accountType: 'CACC',
      currency: 'USD',
      balanceMinor: 500_000n,
    });
    for (const [index, amountMinor] of [300_000n, 330_000n, 360_000n].entries()) {
      await seedTransaction(t, {
        userId,
        ...checking,
        bookingDate: previousCompleteMonth(index + 1),
        direction: 'CRDT',
        amountMinor,
      });
    }
    for (const [index, amountMinor] of [120_000n, 150_000n, 180_000n].entries()) {
      await seedTransaction(t, {
        userId,
        ...checking,
        bookingDate: previousCompleteMonth(index + 1),
        direction: 'DBIT',
        amountMinor,
      });
    }
    await seedTransaction(t, {
      userId,
      ...checking,
      bookingDate: previousCompleteMonth(1),
      direction: 'CRDT',
      amountMinor: 9_000_000n,
      classificationKind: 'transfer',
    });
    await seedTransaction(t, {
      userId,
      ...checking,
      bookingDate: previousCompleteMonth(1),
      direction: 'DBIT',
      amountMinor: 9_000_000n,
      classificationKind: 'internal',
    });
    const facilityId = await seedFacility(t, userId);
    const excludedFacilityId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Incomplete loan',
        facilityType: 'installmentCredit',
        status: 'active',
        source: 'manual',
        provider: 'manual',
        limitAmount: { amountMinor: 100_000n, currency: 'EUR' },
        usedAmount: { amountMinor: 50_000n, currency: 'EUR' },
        repaymentType: 'installmentPlan',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const seeds = await t.withIdentity({ subject: userId }).query(getForecastSeeds, {});

    expect(seeds.currency).toBe('EUR');
    expect(seeds.incomeSources).toEqual([
      expect.objectContaining({
        name: 'Ada Lovelace',
        amountMonthly: { amountMinor: 330_000n, currency: 'EUR' },
        seededFromDefaults: false,
      }),
    ]);
    expect(seeds.livingExpenses).toMatchObject({
      amountMonthly: { amountMinor: 150_000n, currency: 'EUR' },
      seededFromDefaults: false,
    });
    expect(seeds.historyMonths).toEqual({ income: 3, expenses: 3 });
    expect(seeds.accounts.map((account) => [account.accountType, account.kind, account.growthAnnualPct])).toEqual([
      ['CACC', 'cash', 0],
      ['SVGS', 'cash', 2],
      ['INVS', 'investment', 7],
      ['ASST', 'otherAsset', 3],
    ]);
    expect(seeds.accounts.map((account) => account.balance.amountMinor)).toEqual([
      100_000n,
      200_000n,
      300_000n,
      400_000n,
    ]);
    expect(seeds.liabilities).toEqual([
      expect.objectContaining({
        creditFacilityId: facilityId,
        balance: { amountMinor: 900_000n, currency: 'EUR' },
        annualRateBps: 525,
        paymentMonthly: { amountMinor: 50_000n, currency: 'EUR' },
      }),
    ]);
    expect(seeds.excludedFacilities).toEqual([
      expect.objectContaining({ creditFacilityId: excludedFacilityId, missing: ['rate', 'payment'] }),
    ]);
  });

  test('initializes once, applies account and income tweaks, and leaves the second call unchanged', async () => {
    const t = createTest();
    const userId = 'forecast_init_user';
    await seedAuthUser(t, userId);
    const checking = await seedAccount(t, { userId, name: 'Checking', accountType: 'CACC', balanceMinor: 100_000n });
    const savings = await seedAccount(t, { userId, name: 'Savings', accountType: 'SVGS', balanceMinor: 200_000n });
    const asUser = t.withIdentity({ subject: userId });
    const firstId = await asUser.mutation(initializeForecast, {
      birthYear: 1990,
      defaultRetirementAge: 67,
      includeAccountIds: [savings.accountId],
      incomeOverrides: [
        {
          name: 'Consulting',
          amountMonthly: { amountMinor: 450_000n, currency: 'EUR' },
          changeMode: 'customPct',
          customPct: 2,
        },
      ],
    });
    const first = await asUser.query(getScenario, { scenarioId: firstId });
    const secondId = await asUser.mutation(initializeForecast, {
      birthYear: 1980,
      defaultRetirementAge: 60,
      retirementAge: 61,
    });
    const second = await asUser.query(getScenario, { scenarioId: secondId });

    expect(secondId).toBe(firstId);
    expect(second).toEqual(first);
    expect(first.accountAssumptions).toHaveLength(2);
    expect(
      first.accountAssumptions.find(
        (row) => row.target.kind === 'account' && row.target.accountId === checking.accountId,
      )?.included,
    ).toBe(false);
    expect(
      first.accountAssumptions.find(
        (row) => row.target.kind === 'account' && row.target.accountId === savings.accountId,
      )?.included,
    ).toBe(true);
    expect(first.incomeSources).toEqual([
      expect.objectContaining({
        name: 'Consulting',
        amountMonthly: { amountMinor: 450_000n, currency: 'EUR' },
        changeMode: 'customPct',
        customPct: 2,
      }),
    ]);
    expect(first.lifeEvents).toEqual([]);
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique();
      expect(settings?.forecastProfile).toMatchObject({
        birthYear: 1990,
        defaultRetirementAge: 67,
        onboardingCompletedAtMs: expect.any(Number),
      });
    });
  });

  test('duplicates every child collection with fresh timestamps', async () => {
    const t = createTest();
    const userId = 'forecast_duplicate_user';
    await seedAuthUser(t, userId);
    await seedAccount(t, { userId, name: 'Checking', accountType: 'CACC', balanceMinor: 100_000n });
    const asUser = t.withIdentity({ subject: userId });
    const sourceId = await asUser.mutation(initializeForecast, {
      birthYear: 1990,
      defaultRetirementAge: 67,
      retirementAge: 65,
    });
    const duplicateId = await asUser.mutation(duplicateScenario, { scenarioId: sourceId });
    const source = await asUser.query(getScenario, { scenarioId: sourceId });
    const duplicate = await asUser.query(getScenario, { scenarioId: duplicateId });

    expect(duplicate.scenario).toMatchObject({ name: 'Base copy', sortOrder: 1 });
    expect(duplicate.accountAssumptions).toHaveLength(source.accountAssumptions.length);
    expect(duplicate.incomeSources).toHaveLength(source.incomeSources.length);
    expect(duplicate.lifeEvents).toHaveLength(source.lifeEvents.length);
    expect(duplicate.accountAssumptions.map((row) => row.target)).toEqual(
      source.accountAssumptions.map((row) => row.target),
    );
    expect(duplicate.lifeEvents.map((row) => row.event)).toEqual(source.lifeEvents.map((row) => row.event));
    expect(duplicate.accountAssumptions[0]?._id).not.toBe(source.accountAssumptions[0]?._id);
  });

  test('deletes the last scenario and cascades child rows beyond one batch', async () => {
    const t = createTest();
    const userId = 'forecast_delete_user';
    await seedAuthUser(t, userId);
    const account = await seedAccount(t, { userId, name: 'Checking', accountType: 'CACC' });
    const scenarioId = await seedScenario(t, userId);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 105; index += 1) {
        await ctx.db.insert('forecastAccountAssumptions', {
          userId,
          scenarioId,
          target: { kind: 'account', accountId: account.accountId },
          included: true,
          growthAnnualPct: index % 10,
          createdAtMs: now,
          updatedAtMs: now,
        });
      }
      for (let index = 0; index < 25; index += 1) {
        await ctx.db.insert('forecastIncomeSources', {
          userId,
          scenarioId,
          name: `Income ${index}`,
          amountMonthly: { amountMinor: 100n, currency: 'EUR' },
          changeMode: 'fixed',
          sortOrder: index,
          createdAtMs: now,
          updatedAtMs: now,
        });
      }
      for (let index = 0; index < 55; index += 1) {
        await ctx.db.insert('forecastLifeEvents', {
          userId,
          scenarioId,
          enabled: true,
          event: { kind: 'endOfPlan', age: 90 },
          createdAtMs: now,
          updatedAtMs: now,
        });
      }
    });

    await t.withIdentity({ subject: userId }).mutation(deleteScenario, { scenarioId });

    await t.run(async (ctx) => {
      expect(await ctx.db.get('forecastScenarios', scenarioId)).toBeNull();
      expect(
        await ctx.db
          .query('forecastAccountAssumptions')
          .withIndex('by_scenarioId', (q) => q.eq('scenarioId', scenarioId))
          .take(200),
      ).toEqual([]);
      expect(
        await ctx.db
          .query('forecastIncomeSources')
          .withIndex('by_scenarioId_and_sortOrder', (q) => q.eq('scenarioId', scenarioId))
          .take(200),
      ).toEqual([]);
      expect(
        await ctx.db
          .query('forecastLifeEvents')
          .withIndex('by_scenarioId', (q) => q.eq('scenarioId', scenarioId))
          .take(200),
      ).toEqual([]);
    });
  });

  test('reorders all owned scenarios', async () => {
    const t = createTest();
    const userId = 'forecast_reorder_user';
    await seedAuthUser(t, userId);
    const firstId = await seedScenario(t, userId, 0, 'First');
    const secondId = await seedScenario(t, userId, 1, 'Second');
    const thirdId = await seedScenario(t, userId, 2, 'Third');
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(reorderScenarios, { orderedIds: [thirdId, firstId, secondId] });

    expect((await asUser.query(listScenarios, {})).map((scenario) => scenario._id)).toEqual([
      thirdId,
      firstId,
      secondId,
    ]);
  });

  test('isolates scenario reads, updates, and deletes by owner', async () => {
    const t = createTest();
    await seedAuthUser(t, 'forecast_owner');
    await seedAuthUser(t, 'forecast_other');
    const scenarioId = await seedScenario(t, 'forecast_owner');
    const other = t.withIdentity({ subject: 'forecast_other' });

    await expect(other.query(getScenario, { scenarioId })).rejects.toThrow('Forecast scenario not found');
    await expect(other.mutation(updateScenario, { scenarioId, name: 'Stolen' })).rejects.toThrow(
      'Forecast scenario not found',
    );
    await expect(other.mutation(deleteScenario, { scenarioId })).rejects.toThrow('Forecast scenario not found');
    await t.run(async (ctx) => {
      expect((await ctx.db.get('forecastScenarios', scenarioId))?.name).toBe('Scenario');
    });
  });

  test('requires authentication for every public forecast seed and scenario function', async () => {
    const t = createTest();
    const account = await seedAccount(t, { userId: 'auth_fixture', name: 'Checking', accountType: 'CACC' });
    const scenarioId = await seedScenario(t, 'auth_fixture');
    const incomeSourceId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert('forecastIncomeSources', {
        userId: 'auth_fixture',
        scenarioId,
        name: 'Income',
        amountMonthly: { amountMinor: 100n, currency: 'EUR' },
        changeMode: 'fixed',
        sortOrder: 0,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });
    const lifeEventId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert('forecastLifeEvents', {
        userId: 'auth_fixture',
        scenarioId,
        enabled: true,
        event: { kind: 'endOfPlan', age: 90 },
        createdAtMs: now,
        updatedAtMs: now,
      });
    });
    const unauthenticatedCalls = [
      t.query(getForecastSeeds, {}),
      t.query(listScenarios, {}),
      t.query(getScenario, { scenarioId }),
      t.mutation(initializeForecast, { birthYear: 1990, defaultRetirementAge: 67 }),
      t.mutation(updateScenario, { scenarioId, name: 'Updated' }),
      t.mutation(duplicateScenario, { scenarioId }),
      t.mutation(deleteScenario, { scenarioId }),
      t.mutation(reorderScenarios, { orderedIds: [scenarioId] }),
      t.mutation(upsertAccountAssumption, {
        scenarioId,
        target: { kind: 'account', accountId: account.accountId },
        included: true,
      }),
      t.mutation(upsertIncomeSource, {
        scenarioId,
        name: 'Income',
        amountMonthly: { amountMinor: 100n, currency: 'EUR' },
        changeMode: 'fixed',
      }),
      t.mutation(deleteIncomeSource, { incomeSourceId }),
      t.mutation(upsertLifeEvent, {
        scenarioId,
        enabled: true,
        event: { kind: 'endOfPlan', age: 90 },
      }),
      t.mutation(deleteLifeEvent, { lifeEventId }),
      t.mutation(updateForecastProfile, { birthYear: 1990, defaultRetirementAge: 67 }),
    ];
    for (const call of unauthenticatedCalls) await expect(call).rejects.toThrow('Unauthorized');
  });

  test('rejects invalid ages, percentages, money, changes, and reorder lists', async () => {
    const t = createTest();
    const userId = 'forecast_bounds_user';
    const invalidInitUserId = 'forecast_invalid_init_user';
    await seedAuthUser(t, userId);
    await seedAuthUser(t, invalidInitUserId);
    const account = await seedAccount(t, { userId, name: 'Checking', accountType: 'CACC' });
    const scenarioId = await seedScenario(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      t.withIdentity({ subject: invalidInitUserId }).mutation(initializeForecast, {
        birthYear: 1899,
        defaultRetirementAge: 67,
      }),
    ).rejects.toThrow('Birth year');
    await expect(asUser.mutation(updateScenario, { scenarioId, capitalGainsTaxPct: 100 })).rejects.toThrow(
      'Capital gains tax',
    );
    await expect(asUser.mutation(updateScenario, { scenarioId, inflationAnnualPct: Number.NaN })).rejects.toThrow(
      'Inflation',
    );
    await asUser.mutation(updateForecastProfile, { birthYear: 1990, defaultRetirementAge: 67 });
    await expect(asUser.mutation(updateScenario, { scenarioId, endAge: 66 })).rejects.toThrow('default retirement age');
    await expect(asUser.mutation(updateForecastProfile, { birthYear: 1990, defaultRetirementAge: 91 })).rejects.toThrow(
      'scenario end age',
    );
    await expect(
      asUser.mutation(upsertAccountAssumption, {
        scenarioId,
        target: { kind: 'account', accountId: account.accountId },
        included: true,
        growthAnnualPct: -100,
      }),
    ).rejects.toThrow('Account growth');
    await expect(
      asUser.mutation(upsertIncomeSource, {
        scenarioId,
        name: 'Income',
        amountMonthly: { amountMinor: -1n, currency: 'EUR' },
        changeMode: 'fixed',
      }),
    ).rejects.toThrow('non-negative');
    await expect(
      asUser.mutation(upsertIncomeSource, {
        scenarioId,
        name: 'Income',
        amountMonthly: { amountMinor: 1n, currency: 'EUR' },
        changeMode: 'customPct',
      }),
    ).rejects.toThrow('requires customPct');
    await expect(
      asUser.mutation(upsertLifeEvent, {
        scenarioId,
        enabled: true,
        event: { kind: 'endOfPlan', age: 121 },
      }),
    ).rejects.toThrow('End-of-plan age');
    await expect(asUser.mutation(reorderScenarios, { orderedIds: [] })).rejects.toThrow('every scenario exactly once');
  });

  test('rejects overlong scenario icons and invalid colors', async () => {
    const t = createTest();
    const userId = 'forecast_appearance_user';
    await seedAuthUser(t, userId);
    const scenarioId = await seedScenario(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    await expect(asUser.mutation(updateScenario, { scenarioId, icon: 'x'.repeat(9) })).rejects.toThrow('at most 8');
    for (const color of ['red', '#12345', 'var(--chart-99)']) {
      await expect(asUser.mutation(updateScenario, { scenarioId, color })).rejects.toThrow('#rrggbb');
    }
    await expect(
      asUser.mutation(updateScenario, { scenarioId, icon: '✦', color: '#1baf7a' }),
    ).resolves.toMatchObject({ icon: '✦', color: '#1baf7a' });
    await expect(
      asUser.mutation(updateScenario, { scenarioId, color: 'var(--chart-2)' }),
    ).resolves.toMatchObject({ icon: '✦', color: 'var(--chart-2)' });
    await expect(
      asUser.mutation(updateScenario, { scenarioId, icon: ' xxxxxxxx ', color: ' #1BAF7A ' }),
    ).resolves.toMatchObject({ icon: 'xxxxxxxx', color: '#1BAF7A' });
    await expect(
      asUser.mutation(updateScenario, { scenarioId, color: ' var(--chart-9) ' }),
    ).resolves.toMatchObject({ color: 'var(--chart-9)' });
  });
});
