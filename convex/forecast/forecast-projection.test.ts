/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { components } from '../_generated/api';
import schema from '../schema';
import type { Doc, Id } from '../_generated/dataModel';
import type { ForecastResult } from './forecastCore';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const discoveredModules = import.meta.glob([
  '../_generated/*.js',
  '../auth.ts',
  '../authProfiles.ts',
  '../lib/*.ts',
  './projection.ts',
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

type ProjectionSuccess = {
  scenario: { id: Id<'forecastScenarios'>; name: string; currency: string };
  projection: ForecastResult;
  excludedAccounts: Array<{
    accountId: Id<'financialAccounts'>;
    name: string;
    reason: 'notFound' | 'inactive' | 'currencyMismatch' | 'unsupportedType';
  }>;
  excludedFacilities: Array<{
    creditFacilityId: Id<'creditFacilities'>;
    name: string;
    reason: 'notFound' | 'inactive' | 'currencyMismatch' | 'missingRate' | 'missingPayment';
  }>;
  events: ForecastResult['events'];
  invalidEvents: Array<{ eventId: Id<'forecastLifeEvents'>; reason: string }>;
};
type ProjectionResult = { upgradeRequired: true } | { needsOnboarding: true } | ProjectionSuccess;

const getProjection = makeFunctionReference<'query', { scenarioId: Id<'forecastScenarios'> }, ProjectionResult>(
  'forecast/projection:getProjection',
);
const getProjectionForUser = makeFunctionReference<
  'query',
  { userId: string; scenarioId?: Id<'forecastScenarios'> },
  ProjectionResult
>('forecast/projection:getProjectionForUser');

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

afterEach(() => {
  vi.useRealTimers();
});

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthUser(t: TestHarness, userId: string) {
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
        firstName: 'Projection',
        lastName: 'User',
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
}

async function setProProfile(t: TestHarness, userId: string, withProfile = true) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert('userSettings', {
      userId,
      planTier: 'pro',
      forecastProfile: withProfile
        ? {
            birthYear: new Date().getUTCFullYear() - 30,
            defaultRetirementAge: 67,
            onboardingCompletedAtMs: now,
          }
        : undefined,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedScenario(t: TestHarness, userId: string, options: { sortOrder?: number; name?: string } = {}) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert('forecastScenarios', {
      userId,
      name: options.name ?? 'Base',
      sortOrder: options.sortOrder ?? 0,
      currency: 'EUR',
      inflationAnnualPct: 0,
      endAge: 35,
      livingExpenses: { amountMonthly: { amountMinor: 0n, currency: 'EUR' }, changeMode: 'fixed' },
      extraSavings: { growthAnnualPct: 0, splits: [] },
      capitalGainsTaxPct: 26,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedAccount(
  t: TestHarness,
  input: { userId: string; name: string; currency?: string; accountType?: string; balanceMinor: bigint },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
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
      accountType: input.accountType ?? 'CACC',
      currency,
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('accountBalances', {
      userId: input.userId,
      accountId,
      providerConnectionId,
      provider: 'mock',
      balanceType: 'closingBooked',
      amount: { amountMinor: input.balanceMinor, currency },
      fetchedAtMs: now,
    });
    return { accountId, providerConnectionId };
  });
}

async function seedAccountAssumption(
  t: TestHarness,
  userId: string,
  scenarioId: Id<'forecastScenarios'>,
  accountId: Id<'financialAccounts'>,
  growthAnnualPct = 0,
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert('forecastAccountAssumptions', {
      userId,
      scenarioId,
      target: { kind: 'account', accountId },
      included: true,
      growthAnnualPct,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedFacility(t: TestHarness, userId: string, scenarioId: Id<'forecastScenarios'>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const facilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Personal loan',
      facilityType: 'installmentCredit',
      status: 'active',
      source: 'manual',
      provider: 'manual',
      limitAmount: { amountMinor: 1_000_000n, currency: 'EUR' },
      usedAmount: { amountMinor: 600_000n, currency: 'EUR' },
      repaymentType: 'installmentPlan',
      annualNominalRateBps: 475,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('creditFacilityInstallmentPlans', {
      userId,
      creditFacilityId: facilityId,
      name: 'Main plan',
      principalAmount: { amountMinor: 800_000n, currency: 'EUR' },
      outstandingAmount: { amountMinor: 600_000n, currency: 'EUR' },
      monthlyPaymentAmount: { amountMinor: 50_000n, currency: 'EUR' },
      installmentCount: 16,
      remainingInstallments: 12,
      startDate: '2026-01-01',
      endDate: '2027-04-01',
      status: 'active',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const assumptionId = await ctx.db.insert('forecastAccountAssumptions', {
      userId,
      scenarioId,
      target: { kind: 'creditFacility', creditFacilityId: facilityId },
      included: true,
      liability: { includedInLivingExpenses: false },
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { facilityId, assumptionId };
  });
}

function expectSuccess(result: ProjectionResult): asserts result is ProjectionSuccess {
  expect('projection' in result).toBe(true);
}

describe('forecast projection query', () => {
  test('soft-gates free users before onboarding checks', async () => {
    const t = createTest();
    const userId = 'projection_free_user';
    await seedAuthUser(t, userId);
    const scenarioId = await seedScenario(t, userId);

    expect(await t.withIdentity({ subject: userId }).query(getProjection, { scenarioId })).toEqual({
      upgradeRequired: true,
    });
  });

  test('returns needsOnboarding for pro users without a forecast profile', async () => {
    const t = createTest();
    const userId = 'projection_no_profile_user';
    await seedAuthUser(t, userId);
    await setProProfile(t, userId, false);
    const scenarioId = await seedScenario(t, userId);

    expect(await t.withIdentity({ subject: userId }).query(getProjection, { scenarioId })).toEqual({
      needsOnboarding: true,
    });
  });

  test('uses current account balances as engine inputs', async () => {
    const t = createTest();
    const userId = 'projection_happy_user';
    await seedAuthUser(t, userId);
    await setProProfile(t, userId);
    const scenarioId = await seedScenario(t, userId);
    const account = await seedAccount(t, { userId, name: 'Checking', balanceMinor: 250_000n });
    await seedAccountAssumption(t, userId, scenarioId, account.accountId);

    const result = await t.withIdentity({ subject: userId }).query(getProjection, { scenarioId });

    expectSuccess(result);
    expect(result.projection.assumptions.accounts).toEqual([
      expect.objectContaining({ id: account.accountId, balanceMinor: 250_000n, kind: 'cash' }),
    ]);
    expect(result.projection.yearly[0]?.accounts).toContainEqual({
      id: account.accountId,
      endBalanceMinor: 250_000n,
    });
    expect(result.excludedAccounts).toEqual([]);
  });

  test('projects an overdrawn current account instead of crashing the query', async () => {
    const t = createTest();
    const userId = 'projection_negative_cash_user';
    await seedAuthUser(t, userId);
    await setProProfile(t, userId);
    const scenarioId = await seedScenario(t, userId);
    const account = await seedAccount(t, { userId, name: 'Overdrawn checking', balanceMinor: -50_000n });
    await seedAccountAssumption(t, userId, scenarioId, account.accountId);

    const result = await t.withIdentity({ subject: userId }).query(getProjection, { scenarioId });

    expectSuccess(result);
    expect(result.projection.assumptions.accounts).toContainEqual(
      expect.objectContaining({ id: account.accountId, balanceMinor: -50_000n, kind: 'cash' }),
    );
    expect(result.projection.finalNetWorthMinor).toBe(-50_000n);
  });

  test('reactively picks up a newer balance snapshot', async () => {
    const t = createTest();
    const userId = 'projection_live_balance_user';
    await seedAuthUser(t, userId);
    await setProProfile(t, userId);
    const scenarioId = await seedScenario(t, userId);
    const account = await seedAccount(t, { userId, name: 'Checking', balanceMinor: 100_000n });
    await seedAccountAssumption(t, userId, scenarioId, account.accountId);
    const asUser = t.withIdentity({ subject: userId });
    const before = await asUser.query(getProjection, { scenarioId });
    expectSuccess(before);

    await t.run(async (ctx) => {
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: account.accountId,
        providerConnectionId: account.providerConnectionId,
        provider: 'mock',
        balanceType: 'closingBooked',
        amount: { amountMinor: 175_000n, currency: 'EUR' },
        fetchedAtMs: Date.now() + 1_000,
      });
    });
    const after = await asUser.query(getProjection, { scenarioId });
    expectSuccess(after);

    expect(before.projection.assumptions.accounts[0]?.balanceMinor).toBe(100_000n);
    expect(after.projection.assumptions.accounts[0]?.balanceMinor).toBe(175_000n);
    expect(after.projection.finalNetWorthMinor).toBeGreaterThan(before.projection.finalNetWorthMinor);
  });

  test('falls back to live liability rate and payment, while stored overrides win', async () => {
    const t = createTest();
    const userId = 'projection_liability_user';
    await seedAuthUser(t, userId);
    await setProProfile(t, userId);
    const scenarioId = await seedScenario(t, userId);
    const facility = await seedFacility(t, userId, scenarioId);
    const asUser = t.withIdentity({ subject: userId });
    const live = await asUser.query(getProjection, { scenarioId });
    expectSuccess(live);
    const liveLiability = live.projection.assumptions.accounts.find((account) => account.id === facility.facilityId);

    await t.run(async (ctx) => {
      await ctx.db.patch('forecastAccountAssumptions', facility.assumptionId, {
        liability: {
          annualRateBps: 725,
          paymentMonthly: { amountMinor: 65_000n, currency: 'EUR' },
          includedInLivingExpenses: true,
        },
        updatedAtMs: Date.now(),
      });
    });
    const overridden = await asUser.query(getProjection, { scenarioId });
    expectSuccess(overridden);
    const overriddenLiability = overridden.projection.assumptions.accounts.find(
      (account) => account.id === facility.facilityId,
    );

    expect(liveLiability?.liability).toEqual({
      annualRateBps: 475,
      paymentMonthlyMinor: 50_000n,
      includedInLivingExpenses: false,
    });
    expect(overriddenLiability?.liability).toEqual({
      annualRateBps: 725,
      paymentMonthlyMinor: 65_000n,
      includedInLivingExpenses: true,
    });
  });

  test('excludes and reports accounts in another currency', async () => {
    const t = createTest();
    const userId = 'projection_currency_user';
    await seedAuthUser(t, userId);
    await setProProfile(t, userId);
    const scenarioId = await seedScenario(t, userId);
    const euro = await seedAccount(t, { userId, name: 'Euro account', balanceMinor: 100_000n });
    const dollar = await seedAccount(t, { userId, name: 'Dollar account', currency: 'USD', balanceMinor: 200_000n });
    await seedAccountAssumption(t, userId, scenarioId, euro.accountId);
    await seedAccountAssumption(t, userId, scenarioId, dollar.accountId);

    const result = await t.withIdentity({ subject: userId }).query(getProjection, { scenarioId });

    expectSuccess(result);
    expect(result.projection.assumptions.accounts.map((account) => account.id)).toEqual([euro.accountId]);
    expect(result.excludedAccounts).toEqual([
      { accountId: dollar.accountId, name: 'Dollar account', reason: 'currencyMismatch' },
    ]);
  });

  test('passes enabled stored events into the engine and returns their markers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    const t = createTest();
    const userId = 'projection_event_user';
    await seedAuthUser(t, userId);
    await setProProfile(t, userId);
    const scenarioId = await seedScenario(t, userId);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('forecastLifeEvents', {
        userId,
        scenarioId,
        enabled: true,
        event: { kind: 'endOfPlan', age: 34 },
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const result = await t.withIdentity({ subject: userId }).query(getProjection, { scenarioId });

    expectSuccess(result);
    expect(result.events).toEqual([
      { monthIndex: 42, kind: 'endOfPlan', label: `endOfPlan ${new Date().getUTCFullYear() + 4}` },
    ]);
    expect(result.projection.events).toEqual(result.events);
    expect(result.invalidEvents).toEqual([]);
    expect(result.projection.yearly).toHaveLength(4);
  });

  test('internal query selects the lowest-sort-order scenario when omitted', async () => {
    const t = createTest();
    const userId = 'projection_internal_user';
    await setProProfile(t, userId);
    await seedScenario(t, userId, { sortOrder: 10, name: 'Later' });
    const firstId = await seedScenario(t, userId, { sortOrder: -1, name: 'First' });

    const result = await t.query(getProjectionForUser, { userId });

    expectSuccess(result);
    expect(result.scenario).toMatchObject({ id: firstId, name: 'First' });
  });

  test('requires authentication for the public projection query', async () => {
    const t = createTest();
    const scenarioId = await seedScenario(t, 'projection_auth_fixture');
    await expect(t.query(getProjection, { scenarioId })).rejects.toThrow('Unauthorized');
  });
});
