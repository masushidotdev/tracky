/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './banking/*.ts', './lib/*.ts']);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;
type UserHarness = ReturnType<TestHarness['withIdentity']>;

let balanceTimestampOffset = 0;

type SeedTransaction = {
  accountId: Id<'financialAccounts'>;
  categoryId?: Id<'categories'>;
  period: string;
  bookingDate?: string;
  amountMinor: bigint;
  direction?: 'DBIT' | 'CRDT';
  classificationKind?: 'expense' | 'income' | 'internal' | 'uncategorized' | 'transfer';
  dedupeKey: string;
};

async function seedAuthKitUser(t: TestHarness, userId: string) {
  const timestamp = '2026-05-01T00:00:00.000Z';
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
        firstName: 'Test',
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

async function setPlanTier(t: TestHarness, userId: string, planTier: 'free' | 'pro') {
  await t.run(async (ctx) => {
    const now = Date.now();
    const settings = await ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique();
    if (settings) {
      await ctx.db.patch('userSettings', settings._id, { planTier, planUpdatedAtMs: now, updatedAtMs: now });
    } else {
      await ctx.db.insert('userSettings', {
        userId,
        planTier,
        planUpdatedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
    }
  });
}

/** Confirms the pairing the way the transfer flow does: a match row plus the id on both legs. */
async function matchTransfer(
  t: TestHarness,
  userId: string,
  outgoingTransactionId: Id<'transactions'>,
  incomingTransactionId: Id<'transactions'>,
  amountDeltaMinor = 0n,
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const matchId = await ctx.db.insert('transferMatches', {
      userId,
      outgoingTransactionId,
      incomingTransactionId,
      status: 'confirmed',
      amountDelta: { amountMinor: amountDeltaMinor, currency: 'EUR' },
      feeAmount: amountDeltaMinor === 0n ? undefined : { amountMinor: amountDeltaMinor, currency: 'EUR' },
      source: 'system',
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.patch('transactions', outgoingTransactionId, { transferMatchId: matchId });
    await ctx.db.patch('transactions', incomingTransactionId, { transferMatchId: matchId });
  });
}

async function seedCategory(t: TestHarness, userId: string, name: string) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert('categories', {
      userId,
      name,
      kind: 'expense',
      applicableKinds: ['expense'],
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedAccount(
  t: TestHarness,
  userId: string,
  name: string,
  accountType = 'CACC',
  options: {
    currency?: string;
    status?: 'pending' | 'active' | 'reauthorizationRequired' | 'paused' | 'error';
  } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    let connection = await ctx.db
      .query('providerConnections')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
    if (!connection) {
      const connectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'manual',
        status: 'active',
        displayName: 'Manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
      connection = await ctx.db.get('providerConnections', connectionId);
    }
    if (!connection) throw new Error('Provider connection setup failed');
    return await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId: connection._id,
      provider: 'manual',
      name,
      accountType,
      currency: options.currency ?? 'EUR',
      status: options.status ?? 'active',
      syncEnabled: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedBalance(t: TestHarness, userId: string, accountId: Id<'financialAccounts'>, amountMinor: bigint) {
  await t.run(async (ctx) => {
    const account = await ctx.db.get('financialAccounts', accountId);
    if (!account?.providerConnectionId) throw new Error('Balance account setup failed');
    await ctx.db.insert('accountBalances', {
      userId,
      accountId,
      providerConnectionId: account.providerConnectionId,
      provider: 'manual',
      balanceType: 'closingBooked',
      amount: { amountMinor, currency: 'EUR' },
      fetchedAtMs: Date.now() + balanceTimestampOffset,
    });
    balanceTimestampOffset += 1;
  });
}

async function seedOverdraftFacility(
  t: TestHarness,
  userId: string,
  accountId: Id<'financialAccounts'>,
  limitMinor: bigint,
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Current account overdraft',
      facilityType: 'accountOverdraft',
      status: 'active',
      source: 'manual',
      linkedAccountId: accountId,
      provider: 'manual',
      limitAmount: { amountMinor: limitMinor, currency: 'EUR' },
      usedAmount: { amountMinor: 0n, currency: 'EUR' },
      repaymentType: 'onDemand',
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedCardInstallmentPlan(
  t: TestHarness,
  userId: string,
  cardAccountId: Id<'financialAccounts'>,
  input: {
    name?: string;
    outstandingMinor?: bigint;
    outstandingCurrency?: string;
    monthlyPaymentMinor?: bigint;
    monthlyPaymentCurrency?: string;
    status?: 'active' | 'paid' | 'cancelled';
  } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const name = input.name ?? 'Instalment plan';
    const outstandingMinor = input.outstandingMinor ?? 120_000n;
    const outstandingCurrency = input.outstandingCurrency ?? 'EUR';
    const monthlyPaymentMinor = input.monthlyPaymentMinor ?? 40_000n;
    const monthlyPaymentCurrency = input.monthlyPaymentCurrency ?? 'EUR';
    const status = input.status ?? 'active';
    const facilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Card credit line',
      facilityType: 'cardCreditLine',
      status: 'active',
      source: 'manual',
      linkedAccountId: cardAccountId,
      provider: 'manual',
      limitAmount: { amountMinor: 200_000n, currency: 'EUR' },
      usedAmount: { amountMinor: outstandingMinor, currency: 'EUR' },
      repaymentType: 'statementBalance',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const installmentPlanId = await ctx.db.insert('creditFacilityInstallmentPlans', {
      userId,
      creditFacilityId: facilityId,
      name,
      principalAmount: { amountMinor: outstandingMinor, currency: outstandingCurrency },
      outstandingAmount: { amountMinor: outstandingMinor, currency: outstandingCurrency },
      monthlyPaymentAmount: { amountMinor: monthlyPaymentMinor, currency: monthlyPaymentCurrency },
      installmentCount: 3,
      remainingInstallments: status === 'active' ? 3 : 0,
      startDate: '2026-06-10',
      nextPaymentDate: status === 'active' ? '2026-07-10' : undefined,
      endDate: '2026-09-10',
      status,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { facilityId, installmentPlanId };
  });
}

async function seedTransaction(t: TestHarness, userId: string, input: SeedTransaction) {
  return await t.run(async (ctx) => {
    const account = await ctx.db.get('financialAccounts', input.accountId);
    if (!account?.providerConnectionId) throw new Error('Transaction account setup failed');
    const now = Date.now();
    const direction = input.direction ?? 'DBIT';
    const transactionId = await ctx.db.insert('transactions', {
      userId,
      accountId: account._id,
      providerConnectionId: account.providerConnectionId,
      provider: 'manual',
      dedupeKey: input.dedupeKey,
      status: 'BOOK',
      direction,
      amount: { amountMinor: input.amountMinor, currency: 'EUR' },
      bookingDate: input.bookingDate ?? `${input.period}-15`,
      description: input.dedupeKey,
      classificationKind: input.classificationKind ?? 'expense',
      classificationSource: 'user',
      categoryId: input.categoryId,
      importedAtMs: now,
      updatedAtMs: now,
    });
    const latestBalance = await ctx.db
      .query('accountBalances')
      .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', account._id))
      .order('desc')
      .first();
    const signedAmountMinor = direction === 'CRDT' ? input.amountMinor : -input.amountMinor;
    await ctx.db.insert('accountBalances', {
      userId,
      accountId: account._id,
      providerConnectionId: account.providerConnectionId,
      provider: 'manual',
      balanceType: 'closingBooked',
      amount: { amountMinor: (latestBalance?.amount.amountMinor ?? 0n) + signedAmountMinor, currency: 'EUR' },
      fetchedAtMs: Date.now() + balanceTimestampOffset,
    });
    balanceTimestampOffset += 1;
    return transactionId;
  });
}

async function seedMoneyBox(
  t: TestHarness,
  userId: string,
  input: {
    accountId?: Id<'financialAccounts'>;
    savedMinor: bigint;
    currency?: string;
    heldOutsideBalance?: boolean;
    status?: 'active' | 'completed' | 'archived';
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const currency = input.currency ?? 'EUR';
    return await ctx.db.insert('moneyBoxes', {
      userId,
      accountId: input.accountId,
      name: 'Pocket',
      targetAmount: { amountMinor: 100_000n, currency },
      savedAmount: { amountMinor: input.savedMinor, currency },
      targetDate: '2026-12-31',
      status: input.status ?? 'active',
      source: 'manual',
      heldOutsideBalance: input.heldOutsideBalance,
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function createPlan(t: TestHarness, userId: string, name: string, accountIds: Array<Id<'financialAccounts'>>) {
  if (accountIds.length > 0) {
    const hasBalance = await t.run(async (ctx) => {
      for (const accountId of accountIds) {
        const balance = await ctx.db
          .query('accountBalances')
          .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', accountId))
          .order('desc')
          .first();
        if (balance) return true;
      }
      return false;
    });
    if (!hasBalance) await seedBalance(t, userId, accountIds[0], 10_000n);
  }
  const asUser = t.withIdentity({ subject: userId });
  const { planId } = await asUser.mutation(api.banking.plan.createPlan, { name, currency: 'EUR', accountIds });
  await t.run(async (ctx) => {
    await ctx.db.patch('plans', planId, { startPeriod: '2026-05', startDate: '2026-05-01' });
  });
  return { asUser, planId };
}

async function planBuckets(t: TestHarness, planId: Id<'plans'>) {
  return await t.run(async (ctx) =>
    ctx.db
      .query('planBuckets')
      .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
      .take(100),
  );
}

async function bucketForCategory(t: TestHarness, planId: Id<'plans'>, categoryId: Id<'categories'>) {
  const mapping = await t.run(async (ctx) =>
    ctx.db
      .query('planBucketCategories')
      .withIndex('by_planId_and_categoryId', (q) => q.eq('planId', planId).eq('categoryId', categoryId))
      .unique(),
  );
  if (!mapping) throw new Error('Category mapping not found');
  return mapping.bucketId;
}

async function cardBucketForAccount(t: TestHarness, planId: Id<'plans'>, accountId: Id<'financialAccounts'>) {
  const bucket = (await planBuckets(t, planId)).find((candidate) => candidate.cardAccountId === accountId);
  if (!bucket) throw new Error('Card payment bucket not found');
  return bucket;
}

async function createCardDebtFixture(
  t: TestHarness,
  userId: string,
  input: {
    cardDebtMinor?: bigint;
    installment?: Parameters<typeof seedCardInstallmentPlan>[3] | false;
  } = {},
) {
  await seedAuthKitUser(t, userId);
  const checkingId = await seedAccount(t, userId, 'Checking');
  const cardId = await seedAccount(t, userId, 'Card', 'CARD');
  await seedBalance(t, userId, checkingId, 200_000n);
  await seedBalance(t, userId, cardId, -(input.cardDebtMinor ?? 120_000n));
  const installment =
    input.installment === false ? null : await seedCardInstallmentPlan(t, userId, cardId, input.installment ?? {});
  const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, cardId]);
  return { asUser, planId, checkingId, cardId, installment };
}

async function setAssigned(
  asUser: UserHarness,
  planId: Id<'plans'>,
  bucketId: Id<'planBuckets'>,
  period: string,
  amountMinor: bigint,
) {
  await asUser.mutation(api.banking.plan.setAssigned, { planId, bucketId, period, amountMinor });
}

async function createAutoAssignFixture(t: TestHarness, userId: string) {
  await seedAuthKitUser(t, userId);
  const firstCategoryId = await seedCategory(t, userId, 'First');
  const secondCategoryId = await seedCategory(t, userId, 'Second');
  const accountId = await seedAccount(t, userId, 'Checking');
  await seedBalance(t, userId, accountId, 10_000n);
  const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
  const firstBucketId = await bucketForCategory(t, planId, firstCategoryId);
  const secondBucketId = await bucketForCategory(t, planId, secondCategoryId);
  // Seed activity before assignments schedule historical snapshots. Direct test inserts
  // bypass the production transaction mutations that invalidate those snapshots.
  await seedTransaction(t, userId, {
    accountId,
    categoryId: firstCategoryId,
    period: '2026-06',
    amountMinor: 400n,
    dedupeKey: `${userId}_first_spend`,
  });
  await seedTransaction(t, userId, {
    accountId,
    categoryId: secondCategoryId,
    period: '2026-06',
    amountMinor: 600n,
    dedupeKey: `${userId}_second_spend`,
  });
  for (const [period, firstMinor, secondMinor] of [
    ['2026-05', 3_000n, 1_000n],
    ['2026-06', 1_000n, 2_000n],
    ['2026-07', 300n, 700n],
  ] as const) {
    await setAssigned(asUser, planId, firstBucketId, period, firstMinor);
    await setAssigned(asUser, planId, secondBucketId, period, secondMinor);
  }
  for (const bucketId of [firstBucketId, secondBucketId]) {
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 5_000n,
      repeats: true,
    });
  }
  return { asUser, planId, firstBucketId, secondBucketId };
}

afterEach(() => {
  balanceTimestampOffset = 0;
  vi.useRealTimers();
});

// The header breakdown is only trustworthy if it adds back up to Ready to Assign: carry + income
// + cash drawn from a card + card credit spent + pre-origin cash movement + unexplained + internal
// movement + transfer net − assigned + the signed money-box reserve adjustment − |cash overspending|.
function reconciledReadyToAssign(month: {
  breakdown: {
    carryFromPreviousMonthMinor: bigint;
    incomeMinor: bigint;
    liquidityFromCardMinor: bigint;
    uncoveredCardSpendMinor: bigint;
    beforePlanStartMinor: bigint;
    unexplainedMinor: bigint;
    moneyBoxReserveMinor: bigint;
    internalMinor: bigint;
    transferNetMinor: bigint;
    assignedMinor: bigint;
    cashOverspendingMinor: bigint;
  };
}) {
  const {
    carryFromPreviousMonthMinor,
    incomeMinor,
    liquidityFromCardMinor,
    uncoveredCardSpendMinor,
    beforePlanStartMinor,
    unexplainedMinor,
    moneyBoxReserveMinor,
    internalMinor,
    transferNetMinor,
    assignedMinor,
    cashOverspendingMinor,
  } = month.breakdown;
  return (
    carryFromPreviousMonthMinor +
    incomeMinor +
    liquidityFromCardMinor +
    uncoveredCardSpendMinor +
    beforePlanStartMinor +
    unexplainedMinor +
    internalMinor +
    transferNetMinor -
    assignedMinor +
    cashOverspendingMinor +
    moneyBoxReserveMinor
  );
}

describe('plan month read model', () => {
  test('exposes the current overdraft and remaining linked facility without changing Plan accounting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_overdraft_facility_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Acme Bank');
    await seedBalance(t, userId, accountId, -83_320n);
    await seedOverdraftFacility(t, userId, accountId, 300_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(result).toHaveProperty('overdraft', {
      amountMinor: 83_320n,
      remainingFacilityMinor: 216_680n,
      progressMinor: 0n,
      targetDate: null,
      monthlyStepMinor: null,
    });
    expect(result.readyToAssignMinor).toBe(-83_320n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
    expect(reconciledReadyToAssign(result)).toBe(result.readyToAssignMinor);
  });

  test('exposes an overdrawn account without inventing a remaining facility', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_overdraft_without_facility_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, -25_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(result).toHaveProperty('overdraft', {
      amountMinor: 25_000n,
      remainingFacilityMinor: null,
      progressMinor: 0n,
      targetDate: null,
      monthlyStepMinor: null,
    });
    expect(result.readyToAssignMinor).toBe(-25_000n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
  });

  test('omits the overdraft summary when every cash account is non-negative', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_no_overdraft_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 25_000n);
    await seedOverdraftFacility(t, userId, accountId, 300_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(result).toHaveProperty('overdraft', null);
    expect(result.readyToAssignMinor).toBe(25_000n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
  });

  test('reports positive progress when reconstructed overdraft fell from the previous month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_overdraft_progress_down_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, -100_000n);
    await seedTransaction(t, userId, {
      accountId,
      period: '2026-07',
      amountMinor: 25_000n,
      direction: 'CRDT',
      classificationKind: 'income',
      dedupeKey: 'overdraft_progress_income',
    });
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(result.overdraft).toMatchObject({ amountMinor: 75_000n, progressMinor: 25_000n });
  });

  test('reports negative progress when reconstructed overdraft grew from the previous month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_overdraft_progress_up_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, -75_000n);
    await seedTransaction(t, userId, {
      accountId,
      period: '2026-07',
      amountMinor: 25_000n,
      dedupeKey: 'overdraft_progress_expense',
    });
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(result.overdraft).toMatchObject({ amountMinor: 100_000n, progressMinor: -25_000n });
  });

  test('suggests the bigint monthly pace needed to clear the real overdraft by its Plan target date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_overdraft_target_pace_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, -120_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);

    await asUser.mutation(api.banking.plan.setOverdraftTargetDate, {
      planId,
      targetDate: '2026-09-30',
    });
    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const stored = await t.run(async (ctx) => ctx.db.get('plans', planId));

    expect(result.overdraft).toMatchObject({
      amountMinor: 120_000n,
      targetDate: '2026-09-30',
      monthlyStepMinor: 40_000n,
    });
    expect(stored?.overdraftTargetDate).toBe('2026-09-30');
  });

  test('keeps Ready to Assign and unexplained movement invariant when overdraft guidance is set', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_overdraft_target_inert_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, -83_320n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    await asUser.mutation(api.banking.plan.setOverdraftTargetDate, {
      planId,
      targetDate: '2026-10-31',
    });
    const after = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(after.readyToAssignMinor).toBe(before.readyToAssignMinor);
    expect(after.breakdown.unexplainedMinor).toBe(before.breakdown.unexplainedMinor);
    expect(after.breakdown).toEqual(before.breakdown);
  });

  test('returns no active plan before setup and the default plan afterwards', async () => {
    const t = createTest();
    const userId = 'plan_read_active_user';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    expect(await asUser.query(api.banking.planRead.getActivePlan, {})).toBeNull();

    const accountId = await seedAccount(t, userId, 'Checking');
    const { planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    expect(await asUser.query(api.banking.planRead.getActivePlan, {})).toEqual({
      id: planId,
      name: 'Main plan',
      currency: 'EUR',
      startPeriod: '2026-05',
      startDate: '2026-05-01',
      accounts: [
        {
          id: accountId,
          name: 'Checking',
          accountType: 'CACC',
          currency: 'EUR',
          status: 'active',
        },
      ],
    });
  });

  test('starts bucket activity at startDate while reconciling earlier cash movement explicitly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_effective_start_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 100_000n);
    await seedTransaction(t, userId, {
      accountId,
      categoryId,
      period: '2026-07',
      bookingDate: '2026-07-20',
      amountMinor: 20_000n,
      dedupeKey: 'before_plan_start',
    });
    await seedTransaction(t, userId, {
      accountId,
      period: '2026-07',
      bookingDate: '2026-07-21',
      amountMinor: 5_000n,
      classificationKind: 'internal',
      dedupeKey: 'before_plan_start_internal',
    });
    const asUser = t.withIdentity({ subject: userId });
    const { planId } = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Fresh plan',
      currency: 'EUR',
      accountIds: [accountId],
    });
    await seedTransaction(t, userId, {
      accountId,
      categoryId,
      period: '2026-07',
      bookingDate: '2026-07-25',
      amountMinor: 10_000n,
      dedupeKey: 'after_plan_start',
    });
    await seedTransaction(t, userId, {
      accountId,
      period: '2026-07',
      bookingDate: '2026-07-26',
      amountMinor: 3_000n,
      classificationKind: 'internal',
      dedupeKey: 'after_plan_start_internal',
    });

    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const bucket = month.groups
      .flatMap((group) => group.buckets)
      .find((candidate) => candidate.categoryIds.includes(categoryId));
    const activity = await asUser.query(api.banking.planRead.listPlanBucketTransactions, {
      planId,
      bucketId: bucket!.bucketId,
      period: '2026-07',
    });
    const internalActivity = await asUser.query(api.banking.planRead.listPlanOutOfPlanTransactions, {
      planId,
      period: '2026-07',
      kind: 'internal',
    });

    expect(bucket?.activityMinor).toBe(-10_000n);
    expect(bucket?.availableMinor).toBe(-10_000n);
    expect(month.breakdown.beforePlanStartMinor).toBe(-25_000n);
    expect(month.breakdown.internalMinor).toBe(-3_000n);
    expect(month.breakdown.cashOverspendingMinor).toBe(-10_000n);
    expect(month.breakdown.unexplainedMinor).toBe(0n);
    expect(activity.rows.map((row) => row.description)).toEqual(['after_plan_start']);
    expect(internalActivity.rows.map((row) => row.description)).toEqual(['after_plan_start_internal']);
    expect(reconciledReadyToAssign(month)).toBe(month.readyToAssignMinor);
  });

  test('keeps full calendar-month activity when startDate is absent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_legacy_start_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 100_000n);
    await seedTransaction(t, userId, {
      accountId,
      categoryId,
      period: '2026-07',
      bookingDate: '2026-07-20',
      amountMinor: 20_000n,
      dedupeKey: 'legacy_month_spend',
    });
    const asUser = t.withIdentity({ subject: userId });
    const { planId } = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Legacy plan',
      currency: 'EUR',
      accountIds: [accountId],
    });
    await t.run((ctx) => ctx.db.patch('plans', planId, { startDate: undefined }));

    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const bucket = month.groups
      .flatMap((group) => group.buckets)
      .find((candidate) => candidate.categoryIds.includes(categoryId));

    expect(bucket?.activityMinor).toBe(-20_000n);
    expect(month.breakdown.beforePlanStartMinor).toBe(0n);
    expect(month.breakdown.unexplainedMinor).toBe(0n);
  });

  test('reports which requested accounts were kept or dropped when creating a plan', async () => {
    const t = createTest();
    const userId = 'plan_read_account_eligibility_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Checking');
    const pausedId = await seedAccount(t, userId, 'Paused', 'CACC', { status: 'paused' });
    const usdId = await seedAccount(t, userId, 'USD checking', 'CACC', { currency: 'USD' });
    const assetId = await seedAccount(t, userId, 'Brokerage', 'INVS');
    const asUser = t.withIdentity({ subject: userId });

    const result = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Main plan',
      currency: 'EUR',
      accountIds: [checkingId, pausedId, usdId, assetId],
    });

    expect(result.keptAccountIds).toEqual([checkingId]);
    expect(result.droppedAccounts).toEqual([
      { accountId: pausedId, reason: 'inactive' },
      { accountId: usdId, reason: 'currencyMismatch' },
      { accountId: assetId, reason: 'ineligibleType' },
    ]);
    expect(await t.run(async (ctx) => (await ctx.db.get('plans', result.planId))?.accountIds)).toEqual([checkingId]);
  });

  test('anchors creation-month liquidity to current account balances across recalculation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_balance_anchor_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const diningId = await seedCategory(t, userId, 'Dining');
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const cardAccountId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, cashAccountId, 100_000n);
    await seedBalance(t, userId, cardAccountId, -20_000n);
    await seedTransaction(t, userId, {
      accountId: cashAccountId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 10_000n,
      dedupeKey: 'creation_month_cash_purchase',
    });
    await seedTransaction(t, userId, {
      accountId: cardAccountId,
      categoryId: diningId,
      period: '2026-07',
      amountMinor: 5_000n,
      dedupeKey: 'creation_month_card_purchase',
    });
    await seedTransaction(t, userId, {
      accountId: cashAccountId,
      period: '2026-07',
      amountMinor: 30_000n,
      direction: 'CRDT',
      classificationKind: 'income',
      dedupeKey: 'creation_month_income',
    });

    const asUser = t.withIdentity({ subject: userId });
    const { planId } = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Main plan',
      currency: 'EUR',
      accountIds: [cashAccountId, cardAccountId],
    });
    const expectedLiquidityMinor = 120_000n;
    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    // Overspent buckets reserve nothing and no longer credit Ready to Assign, so the liquidity
    // identity carries the overspending term instead of hiding it.
    expect(before.totals.availableMinor + before.readyToAssignMinor).toBe(
      expectedLiquidityMinor + before.breakdown.cashOverspendingMinor,
    );

    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const afterFirst = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const afterSecond = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(afterFirst).toEqual(before);
    expect(afterSecond).toEqual(before);
  });

  test('names money drawn from a card instead of leaving it unexplained', async () => {
    const t = createTest();
    const userId = 'plan_read_card_advance_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Checking');
    const cardId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, checkingId, 100_000n);
    await seedBalance(t, userId, cardId, 0n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, cardId]);
    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });

    // A cash advance: the card is debited, the checking account credited, both legs matched.
    const cardLegId = await seedTransaction(t, userId, {
      accountId: cardId,
      period: '2026-05',
      amountMinor: 30_000n,
      classificationKind: 'transfer',
      dedupeKey: 'advance_card_leg',
    });
    const cashLegId = await seedTransaction(t, userId, {
      accountId: checkingId,
      period: '2026-05',
      amountMinor: 30_000n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'advance_cash_leg',
    });
    await matchTransfer(t, userId, cardLegId, cashLegId);

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    // Borrowed, not earned: it raises what can be assigned, and the card's debt by the same amount.
    expect(result.breakdown.liquidityFromCardMinor).toBe(30_000n);
    expect(result.breakdown.incomeMinor).toBe(before.breakdown.incomeMinor);
    expect(result.breakdown.transferNetMinor).toBe(0n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
    expect(reconciledReadyToAssign(result)).toBe(result.readyToAssignMinor);
  });

  test('lets a refund credited to a card reduce the debt it contracted', async () => {
    const t = createTest();
    const userId = 'plan_read_card_refund_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Checking');
    const cardId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, checkingId, 100_000n);
    await seedBalance(t, userId, cardId, -5_000n);
    const categoryId = await seedCategory(t, userId, 'Shopping');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, cardId]);

    await seedTransaction(t, userId, {
      accountId: cardId,
      period: '2026-05',
      amountMinor: 8_000n,
      categoryId,
      dedupeKey: 'card_purchase',
    });
    await seedTransaction(t, userId, {
      accountId: cardId,
      period: '2026-05',
      amountMinor: 3_000n,
      direction: 'CRDT',
      categoryId,
      dedupeKey: 'card_refund',
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    // Net of the refund: 8.000 spent, 3.000 given back. Counting only the debits would leave 3.000
    // stranded in the unexplained line.
    expect(result.breakdown.uncoveredCardSpendMinor).toBe(5_000n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
    expect(reconciledReadyToAssign(result)).toBe(result.readyToAssignMinor);
  });

  test('recognises a statement payment whose legs book in different months', async () => {
    const t = createTest();
    const userId = 'plan_read_cross_month_settlement_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Checking');
    const cardId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, checkingId, 100_000n);
    await seedBalance(t, userId, cardId, 0n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, cardId]);

    // Cash leaves in May, the card is credited in June — the shape a month-end payment really takes.
    const cashLegId = await seedTransaction(t, userId, {
      accountId: checkingId,
      period: '2026-05',
      amountMinor: 20_000n,
      classificationKind: 'transfer',
      dedupeKey: 'cross_month_cash_leg',
    });
    const cardLegId = await seedTransaction(t, userId, {
      accountId: cardId,
      period: '2026-06',
      amountMinor: 20_000n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'cross_month_card_leg',
    });
    await matchTransfer(t, userId, cashLegId, cardLegId);

    const may = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    // The lone leg used to be read as money leaving the plan, because the counterpart was looked for
    // in the same month only.
    expect(may.breakdown.transferNetMinor).toBe(0n);
    const transfers = await asUser.query(api.banking.planRead.listPlanOutOfPlanTransactions, {
      planId,
      period: '2026-05',
      kind: 'transfer',
    });
    expect(transfers.rows).toEqual([]);
  });

  test('keeps a fee-bearing cash transfer neutral when its legs book in different months', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_cross_month_cash_transfer_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Acme Bank');
    const savingsId = await seedAccount(t, userId, 'Acme Bank');
    await seedBalance(t, userId, checkingId, 100_000n);
    await seedBalance(t, userId, savingsId, 0n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, savingsId]);

    const outgoingId = await seedTransaction(t, userId, {
      accountId: checkingId,
      bookingDate: '2026-07-31',
      period: '2026-07',
      amountMinor: 70_247n,
      classificationKind: 'transfer',
      dedupeKey: 'acme_transfer_out',
    });
    const incomingId = await seedTransaction(t, userId, {
      accountId: savingsId,
      bookingDate: '2026-08-03',
      period: '2026-08',
      amountMinor: 70_000n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'acme_transfer_in',
    });
    await matchTransfer(t, userId, outgoingId, incomingId, 247n);

    const [july, august, julyTransfers, augustTransfers] = await Promise.all([
      asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' }),
      asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-08' }),
      asUser.query(api.banking.planRead.listPlanOutOfPlanTransactions, {
        planId,
        period: '2026-07',
        kind: 'transfer',
      }),
      asUser.query(api.banking.planRead.listPlanOutOfPlanTransactions, {
        planId,
        period: '2026-08',
        kind: 'transfer',
      }),
    ]);

    expect(july.breakdown).toMatchObject({
      bucketActivityMinor: -247n,
      transferNetMinor: 0n,
      unexplainedMinor: 0n,
    });
    expect(july.unplanned).toMatchObject({ activityMinor: -247n });
    expect(august.breakdown).toMatchObject({
      bucketActivityMinor: 0n,
      transferNetMinor: 0n,
      unexplainedMinor: 0n,
    });
    expect(julyTransfers.rows).toEqual([]);
    expect(augustTransfers.rows).toEqual([]);
    expect(reconciledReadyToAssign(july)).toBe(july.readyToAssignMinor);
    expect(reconciledReadyToAssign(august)).toBe(august.readyToAssignMinor);

    const [julyActivity, augustActivity] = await Promise.all([
      asUser.query(api.banking.planRead.listPlanBucketTransactions, {
        planId,
        bucketId: july.unplanned.bucketId,
        period: '2026-07',
      }),
      asUser.query(api.banking.planRead.listPlanBucketTransactions, {
        planId,
        bucketId: august.unplanned.bucketId,
        period: '2026-08',
      }),
    ]);
    expect(julyActivity).toMatchObject({
      totalMinor: -247n,
      rows: [
        {
          _id: outgoingId,
          accountId: checkingId,
          direction: 'DBIT',
          amount: { amountMinor: 247n, currency: 'EUR' },
        },
      ],
    });
    expect(augustActivity).toMatchObject({ totalMinor: 0n, rows: [] });
  });

  test('charges a statement payment to Unplanned when the card has no payment bucket', async () => {
    const t = createTest();
    const userId = 'plan_read_orphan_settlement_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Checking');
    const cardId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, checkingId, 100_000n);
    await seedBalance(t, userId, cardId, 0n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, cardId]);
    const cardBucket = await cardBucketForAccount(t, planId, cardId);
    await t.run(async (ctx) => {
      await ctx.db.delete('planBuckets', cardBucket._id);
    });

    const cashLegId = await seedTransaction(t, userId, {
      accountId: checkingId,
      period: '2026-05',
      amountMinor: 20_000n,
      classificationKind: 'transfer',
      dedupeKey: 'orphan_cash_leg',
    });
    const cardLegId = await seedTransaction(t, userId, {
      accountId: cardId,
      period: '2026-05',
      amountMinor: 20_000n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'orphan_card_leg',
    });
    await matchTransfer(t, userId, cashLegId, cardLegId);

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    // Dropping it left the cash leg in the liquidity change with nothing to answer for it, and the
    // payment came back out as negative income.
    expect(result.unplanned.activityMinor).toBe(-20_000n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
    expect(reconciledReadyToAssign(result)).toBe(result.readyToAssignMinor);
  });

  test('charges a matched statement transfer to the card bucket instead of out-of-plan transfers', async () => {
    const t = createTest();
    const userId = 'plan_read_matched_card_settlement_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Checking');
    const cardId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, checkingId, 100_000n);
    await seedBalance(t, userId, cardId, -20_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, cardId]);
    const cardBucket = await cardBucketForAccount(t, planId, cardId);
    await setAssigned(asUser, planId, cardBucket._id, '2026-05', 20_000n);
    const beforeSettlement = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    expect(beforeSettlement.readyToAssignMinor).toBe(80_000n);

    // Both legs exist and are transfer-matched — the shape the bank actually delivers when the
    // statement is charged to the checking account.
    const cashLegId = await seedTransaction(t, userId, {
      accountId: checkingId,
      period: '2026-05',
      amountMinor: 20_000n,
      classificationKind: 'transfer',
      dedupeKey: 'statement_cash_leg',
    });
    const cardLegId = await seedTransaction(t, userId, {
      accountId: cardId,
      period: '2026-05',
      amountMinor: 20_000n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'statement_card_leg',
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      const matchId = await ctx.db.insert('transferMatches', {
        userId,
        outgoingTransactionId: cashLegId,
        incomingTransactionId: cardLegId,
        status: 'confirmed',
        amountDelta: { amountMinor: 0n, currency: 'EUR' },
        source: 'system',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.patch('transactions', cashLegId, { transferMatchId: matchId });
      await ctx.db.patch('transactions', cardLegId, { transferMatchId: matchId });
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    // Cash and card debt both fell by the payment, so nothing changed about what can be assigned.
    expect(result.readyToAssignMinor).toBe(80_000n);
    const settledBucket = result.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.cardAccountId === cardId);
    expect(settledBucket).toMatchObject({ assignedMinor: 20_000n, activityMinor: -20_000n, availableMinor: 0n });
    // Neither leg is money leaving the plan, and neither may leak into income or unexplained movement.
    expect(result.breakdown.transferNetMinor).toBe(0n);
    expect(result.breakdown.incomeMinor).toBe(0n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
    const transfers = await asUser.query(api.banking.planRead.listPlanOutOfPlanTransactions, {
      planId,
      period: '2026-05',
      kind: 'transfer',
    });
    expect(transfers.rows).toEqual([]);
  });

  test('uses card debt as the unchanged fallback need when the card bucket has no target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_card_payment_buckets_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Checking');
    const negativeCardId = await seedAccount(t, userId, 'Daily card', 'CARD');
    const positiveCardId = await seedAccount(t, userId, 'Credit card', 'CARD');
    await seedBalance(t, userId, checkingId, 100_000n);
    await seedBalance(t, userId, negativeCardId, -20_000n);
    await seedBalance(t, userId, positiveCardId, 5_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, negativeCardId, positiveCardId]);
    const withoutFacility = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const initialCardBuckets = withoutFacility.groups.find((group) => group.name === 'Card payments')?.buckets ?? [];
    expect(initialCardBuckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Daily card',
          cardAccountId: negativeCardId,
          cardDebtMinor: 20_000n,
          neededMinor: 20_000n,
          underfundedMinor: 20_000n,
          availableMinor: 0n,
        }),
        expect.objectContaining({
          name: 'Credit card',
          cardAccountId: positiveCardId,
          cardDebtMinor: 0n,
          neededMinor: 0n,
          underfundedMinor: 0n,
        }),
      ]),
    );
    expect(withoutFacility).not.toHaveProperty('cardReservations');
    expect(withoutFacility.totals.targetsMinor).toBe(0n);
    expect(withoutFacility.readyToAssignMinor).toBe(100_000n);
    const negativeCardBucketId = initialCardBuckets.find((bucket) => bucket.cardAccountId === negativeCardId)!.bucketId;
    const autoAssign = await asUser.mutation(api.banking.plan.autoAssign, {
      planId,
      period: '2026-07',
      strategy: 'underfunded',
      dryRun: true,
    });
    expect(autoAssign.rows).toEqual([
      expect.objectContaining({ bucketId: negativeCardBucketId, amountMinor: 20_000n }),
    ]);
    // Selectable on purpose: the Auto-Assign dialog lists every bucket the month payload carries,
    // and a card payment bucket holds real money, so rejecting it would break the dialog's own list.
    const selectedAutoAssign = await asUser.mutation(api.banking.plan.autoAssign, {
      planId,
      period: '2026-07',
      strategy: 'underfunded',
      bucketIds: [negativeCardBucketId],
      dryRun: true,
    });
    expect(selectedAutoAssign.rows).toEqual([
      expect.objectContaining({ bucketId: negativeCardBucketId, amountMinor: 20_000n }),
    ]);
    const past = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-06' });
    const pastNegativeCardBucket = past.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.cardAccountId === negativeCardId);
    expect(pastNegativeCardBucket).toMatchObject({ cardDebtMinor: 0n, neededMinor: 0n, underfundedMinor: 0n });

    // The statement is charged next month, so an unfunded card must still read as unfunded there —
    // reporting nothing needed would call it settled in the very month the money leaves.
    const cardBucketFor = async (period: string) => {
      const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period });
      return month.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === negativeCardId);
    };
    expect(await cardBucketFor('2026-08')).toMatchObject({
      cardDebtMinor: 20_000n,
      neededMinor: 20_000n,
      underfundedMinor: 20_000n,
      status: 'underfunded',
    });

    // Funding it once carries forward and settles the month of the charge too.
    await setAssigned(asUser, planId, negativeCardBucketId, '2026-07', 20_000n);
    expect(await cardBucketFor('2026-07')).toMatchObject({ availableMinor: 20_000n, status: 'funded' });
    expect(await cardBucketFor('2026-08')).toMatchObject({
      carryInMinor: 20_000n,
      cardDebtMinor: 20_000n,
      underfundedMinor: 0n,
      status: 'funded',
    });
    await setAssigned(asUser, planId, negativeCardBucketId, '2026-07', 0n);

    await t.run(async (ctx) => {
      const now = Date.now();
      const facilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Daily card statement',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        linkedAccountId: negativeCardId,
        provider: 'manual',
        limitAmount: { amountMinor: 100_000n, currency: 'EUR' },
        usedAmount: { amountMinor: 20_000n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId: facilityId,
        cycleMonth: '2026-07',
        status: 'scheduled',
        trackedAmount: { amountMinor: 20_000n, currency: 'EUR' },
        dueDate: '2026-08-05',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const negativeCardBucket = result.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.cardAccountId === negativeCardId);
    expect(negativeCardBucket).toMatchObject({ dueDate: '2026-08-05', cardDebtMinor: 20_000n });
    expect(result.totals).toEqual(withoutFacility.totals);
    expect(result.readyToAssignMinor).toBe(100_000n);
    expect(result.totals.availableMinor + result.readyToAssignMinor).toBe(100_000n);
  });

  test('asks only the instalment when an active plan covers the full card debt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const { asUser, planId, cardId, installment } = await createCardDebtFixture(
      t,
      'plan_read_full_card_instalment_coverage_user',
    );

    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const cardBucket = month.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId);
    const installmentBucket = month.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.installmentPlanId === installment?.installmentPlanId);

    expect(cardBucket).toMatchObject({
      cardDebtMinor: 120_000n,
      installmentCoveredDebtMinor: 120_000n,
      neededMinor: 0n,
      underfundedMinor: 0n,
    });
    expect(installmentBucket).toMatchObject({
      installmentPlanId: installment?.installmentPlanId,
      neededMinor: 40_000n,
      underfundedMinor: 40_000n,
      dueDate: '2026-07-10',
    });
  });

  test('asks the uncovered difference when multiple plans cover only part of the card debt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_partial_card_instalment_coverage_user';
    const { asUser, planId, checkingId, cardId } = await createCardDebtFixture(t, userId, {
      installment: { name: 'First partial plan', outstandingMinor: 40_000n, monthlyPaymentMinor: 15_000n },
    });
    await seedCardInstallmentPlan(t, userId, cardId, {
      name: 'Second partial plan',
      outstandingMinor: 30_000n,
      monthlyPaymentMinor: 10_000n,
    });
    await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [checkingId, cardId],
    });

    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const cardBucket = month.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId);

    expect(cardBucket).toMatchObject({
      cardDebtMinor: 120_000n,
      installmentCoveredDebtMinor: 70_000n,
      neededMinor: 50_000n,
      underfundedMinor: 50_000n,
    });
  });

  test('asks for new card spending above the active instalment coverage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_new_card_spend_above_instalment_user';
    const { asUser, planId, cardId } = await createCardDebtFixture(t, userId);

    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    expect(
      before.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId),
    ).toMatchObject({ cardDebtMinor: 120_000n, installmentCoveredDebtMinor: 120_000n, neededMinor: 0n });

    await seedTransaction(t, userId, {
      accountId: cardId,
      period: '2026-07',
      amountMinor: 30_000n,
      dedupeKey: 'new_spend_after_instalment_plan',
    });
    const after = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    expect(
      after.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId),
    ).toMatchObject({
      cardDebtMinor: 150_000n,
      installmentCoveredDebtMinor: 120_000n,
      neededMinor: 30_000n,
      underfundedMinor: 30_000n,
    });
  });

  test('tracks the difference as instalment outstanding and card balance fall independently', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const { asUser, planId, cardId, installment } = await createCardDebtFixture(
      t,
      'plan_read_declining_card_instalment_coverage_user',
    );
    if (!installment) throw new Error('Instalment fixture not found');
    const cardBucketForMonth = async () => {
      const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
      return month.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId);
    };

    expect(await cardBucketForMonth()).toMatchObject({
      cardDebtMinor: 120_000n,
      installmentCoveredDebtMinor: 120_000n,
      neededMinor: 0n,
    });

    await t.run((ctx) =>
      ctx.db.patch('creditFacilityInstallmentPlans', installment.installmentPlanId, {
        outstandingAmount: { amountMinor: 80_000n, currency: 'EUR' },
        remainingInstallments: 2,
        updatedAtMs: Date.now(),
      }),
    );
    expect(await cardBucketForMonth()).toMatchObject({
      cardDebtMinor: 120_000n,
      installmentCoveredDebtMinor: 80_000n,
      neededMinor: 40_000n,
    });

    await seedBalance(t, 'plan_read_declining_card_instalment_coverage_user', cardId, -80_000n);
    expect(await cardBucketForMonth()).toMatchObject({
      cardDebtMinor: 80_000n,
      installmentCoveredDebtMinor: 80_000n,
      neededMinor: 0n,
    });
  });

  test('keeps the old fallback without an eligible EUR card instalment plan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_no_eligible_card_instalment_user';
    const { asUser, planId, checkingId, cardId } = await createCardDebtFixture(t, userId, {
      installment: false,
    });
    const cardBucketForMonth = async () => {
      const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
      return month.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId);
    };

    expect(await cardBucketForMonth()).toMatchObject({
      cardDebtMinor: 120_000n,
      installmentCoveredDebtMinor: 0n,
      neededMinor: 120_000n,
    });

    await seedCardInstallmentPlan(t, userId, cardId, {
      name: 'Cancelled outstanding',
      outstandingMinor: 100_000n,
      status: 'cancelled',
    });
    await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [checkingId, cardId],
    });
    expect(await cardBucketForMonth()).toMatchObject({
      installmentCoveredDebtMinor: 0n,
      neededMinor: 120_000n,
    });

    await seedCardInstallmentPlan(t, userId, cardId, {
      name: 'Foreign outstanding',
      outstandingMinor: 100_000n,
      outstandingCurrency: 'USD',
    });
    await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [checkingId, cardId],
    });
    expect(await cardBucketForMonth()).toMatchObject({
      installmentCoveredDebtMinor: 0n,
      neededMinor: 120_000n,
    });

    await seedCardInstallmentPlan(t, userId, cardId, {
      name: 'Eligible outstanding',
      outstandingMinor: 100_000n,
    });
    await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [checkingId, cardId],
    });
    expect(await cardBucketForMonth()).toMatchObject({
      installmentCoveredDebtMinor: 100_000n,
      neededMinor: 20_000n,
    });
  });

  test('keeps an explicit card target ahead of the instalment-adjusted fallback', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const { asUser, planId, cardId } = await createCardDebtFixture(
      t,
      'plan_read_card_instalment_target_precedence_user',
    );
    const cardBucket = await cardBucketForAccount(t, planId, cardId);
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: cardBucket._id,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 30_000n,
      repeats: true,
    });

    const targeted = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    expect(
      targeted.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId),
    ).toMatchObject({
      cardDebtMinor: 120_000n,
      installmentCoveredDebtMinor: 120_000n,
      neededMinor: 30_000n,
      underfundedMinor: 30_000n,
      target: { amountMinor: 30_000n },
    });

    await asUser.mutation(api.banking.plan.clearTarget, { bucketId: cardBucket._id });
    const derived = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    expect(
      derived.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId),
    ).toMatchObject({ target: null, neededMinor: 0n, underfundedMinor: 0n });
  });

  test('changes card need without changing Ready to Assign, unexplained movement, or the panel identity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_card_instalment_accounting_invariants_user';
    const { asUser, planId, checkingId, cardId } = await createCardDebtFixture(t, userId, {
      installment: false,
    });
    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    await seedCardInstallmentPlan(t, userId, cardId);
    await asUser.mutation(api.banking.plan.updatePlanAccounts, {
      planId,
      accountIds: [checkingId, cardId],
    });
    const after = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const afterCardBucket = after.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.cardAccountId === cardId);

    expect(afterCardBucket).toMatchObject({
      cardDebtMinor: 120_000n,
      installmentCoveredDebtMinor: 120_000n,
      neededMinor: 0n,
    });
    expect(after.readyToAssignMinor).toBe(before.readyToAssignMinor);
    expect(after.breakdown.unexplainedMinor).toBe(before.breakdown.unexplainedMinor);
    expect(after.breakdown).toEqual(before.breakdown);
    expect(reconciledReadyToAssign(after)).toBe(after.readyToAssignMinor);
    expect(after.totals.availableMinor + after.readyToAssignMinor).toBe(after.liquidityMinor);
  });

  test('uses a balance-by target instead of card debt for the monthly card-bucket need', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_card_balance_by_target_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Checking');
    const cardId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, checkingId, 200_000n);
    await seedBalance(t, userId, cardId, -120_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, cardId]);
    const cardBucket = await cardBucketForAccount(t, planId, cardId);
    await t.run(async (ctx) => {
      const now = Date.now();
      const facilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Card statement',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        linkedAccountId: cardId,
        provider: 'manual',
        limitAmount: { amountMinor: 200_000n, currency: 'EUR' },
        usedAmount: { amountMinor: 120_000n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId: facilityId,
        cycleMonth: '2026-07',
        status: 'scheduled',
        trackedAmount: { amountMinor: 120_000n, currency: 'EUR' },
        dueDate: '2026-08-05',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: cardBucket._id,
      cadence: 'custom',
      behaviour: 'balanceBy',
      amountMinor: 120_000n,
      dueDate: '2026-09-30',
      repeats: false,
    });
    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const result = month.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId);

    expect(result).toMatchObject({
      cardDebtMinor: 120_000n,
      dueDate: '2026-08-05',
      neededMinor: 40_000n,
      underfundedMinor: 40_000n,
      target: {
        behaviour: 'balanceBy',
        amountMinor: 120_000n,
        dueDate: '2026-09-30',
      },
    });
    expect(month.totals.targetsMinor).toBe(40_000n);
  });

  test('uses a fixed monthly target instead of full card debt for the card-bucket need', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_card_monthly_target_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Checking');
    const cardId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, checkingId, 200_000n);
    await seedBalance(t, userId, cardId, -120_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, cardId]);
    const cardBucket = await cardBucketForAccount(t, planId, cardId);

    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: cardBucket._id,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 30_000n,
      repeats: true,
    });
    const month = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const result = month.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId);

    expect(result).toMatchObject({
      cardDebtMinor: 120_000n,
      neededMinor: 30_000n,
      underfundedMinor: 30_000n,
      target: { cadence: 'monthly', behaviour: 'setAside', amountMinor: 30_000n },
    });
  });

  test('keeps a card balance-by target coherent across assign, statement payment, and the next month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_card_balance_by_cycle_user';
    await seedAuthKitUser(t, userId);
    const checkingId = await seedAccount(t, userId, 'Checking');
    const cardId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, checkingId, 200_000n);
    await seedBalance(t, userId, cardId, -120_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, cardId]);
    const cardBucket = await cardBucketForAccount(t, planId, cardId);
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: cardBucket._id,
      cadence: 'custom',
      behaviour: 'balanceBy',
      amountMinor: 120_000n,
      dueDate: '2026-09-30',
      repeats: false,
    });
    await setAssigned(asUser, planId, cardBucket._id, '2026-07', 40_000n);

    const cashLegId = await seedTransaction(t, userId, {
      accountId: checkingId,
      period: '2026-08',
      amountMinor: 40_000n,
      classificationKind: 'transfer',
      dedupeKey: 'target_cycle_cash_leg',
    });
    const cardLegId = await seedTransaction(t, userId, {
      accountId: cardId,
      period: '2026-08',
      amountMinor: 40_000n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'target_cycle_card_leg',
    });
    await matchTransfer(t, userId, cashLegId, cardLegId);

    const augustBeforeAssign = await asUser.query(api.banking.planRead.getPlanMonth, {
      planId,
      period: '2026-08',
    });
    expect(
      augustBeforeAssign.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId),
    ).toMatchObject({
      carryInMinor: 40_000n,
      activityMinor: -40_000n,
      availableMinor: 0n,
      neededMinor: 40_000n,
      underfundedMinor: 40_000n,
    });

    await setAssigned(asUser, planId, cardBucket._id, '2026-08', 40_000n);
    const augustAfterAssign = await asUser.query(api.banking.planRead.getPlanMonth, {
      planId,
      period: '2026-08',
    });
    expect(
      augustAfterAssign.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId),
    ).toMatchObject({ availableMinor: 40_000n, underfundedMinor: 0n, status: 'funded' });

    const september = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-09' });
    expect(
      september.groups.flatMap((group) => group.buckets).find((bucket) => bucket.cardAccountId === cardId),
    ).toMatchObject({
      carryInMinor: 40_000n,
      neededMinor: 80_000n,
      underfundedMinor: 80_000n,
      status: 'underfunded',
    });
  });

  test.each([undefined, false])(
    'keeps a money box with heldOutsideBalance=%s entirely outside Plan accounting',
    async (heldOutsideBalance) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-22T12:00:00.000Z'));
      const t = createTest();
      const userId = `plan_money_box_inert_${String(heldOutsideBalance)}`;
      await seedAuthKitUser(t, userId);
      const accountId = await seedAccount(t, userId, 'Checking');
      await seedBalance(t, userId, accountId, 10_000n);
      const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
      const withoutMoneyBox = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

      await seedMoneyBox(t, userId, { accountId, savedMinor: 2_500n, heldOutsideBalance });
      const withMoneyBox = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
      const expectedBreakdown = {
        carryFromPreviousMonthMinor: 10_000n,
        bucketActivityMinor: 0n,
        internalMinor: 0n,
        transferNetMinor: 0n,
        incomeMinor: 0n,
        liquidityFromCardMinor: 0n,
        uncoveredCardSpendMinor: 0n,
        beforePlanStartMinor: 0n,
        unexplainedMinor: 0n,
        moneyBoxReserveMinor: 0n,
        assignedMinor: 0n,
        cashOverspendingMinor: 0n,
      };

      expect(withoutMoneyBox.liquidityMinor).toBe(10_000n);
      expect(withoutMoneyBox.readyToAssignMinor).toBe(10_000n);
      expect(withoutMoneyBox.breakdown).toEqual(expectedBreakdown);
      expect(withMoneyBox.liquidityMinor).toBe(10_000n);
      expect(withMoneyBox.readyToAssignMinor).toBe(10_000n);
      expect(withMoneyBox.breakdown).toEqual(expectedBreakdown);
      expect(withMoneyBox.breakdown).toEqual(withoutMoneyBox.breakdown);
    },
  );

  test('adds held-outside money linked to a Plan account to liquidity and Ready to Assign', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_money_box_liquidity_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 10_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    await seedMoneyBox(t, userId, {
      accountId,
      savedMinor: 2_500n,
      heldOutsideBalance: true,
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(result.liquidityMinor).toBe(12_500n);
    expect(result.readyToAssignMinor).toBe(12_500n);
    expect(result.breakdown).toEqual({
      carryFromPreviousMonthMinor: 12_500n,
      bucketActivityMinor: 0n,
      internalMinor: 0n,
      transferNetMinor: 0n,
      incomeMinor: 0n,
      liquidityFromCardMinor: 0n,
      uncoveredCardSpendMinor: 0n,
      beforePlanStartMinor: 0n,
      unexplainedMinor: 0n,
      moneyBoxReserveMinor: 0n,
      assignedMinor: 0n,
      cashOverspendingMinor: 0n,
    });
  });

  test('keeps a transfer contribution to held-outside money neutral in liquidity, Ready to Assign, and income', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_money_box_contribution_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 10_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const moneyBoxId = await seedMoneyBox(t, userId, {
      accountId,
      savedMinor: 0n,
      heldOutsideBalance: true,
    });
    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const transactionId = await seedTransaction(t, userId, {
      accountId,
      period: '2026-07',
      amountMinor: 1_000n,
      classificationKind: 'transfer',
      dedupeKey: 'money_box_contribution',
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId,
        kind: 'contribution',
        amount: { amountMinor: 1_000n, currency: 'EUR' },
        contributionDate: '2026-07-15',
        source: 'transaction',
        transactionId,
        createdAtMs: now,
      });
      await ctx.db.patch('moneyBoxes', moneyBoxId, {
        savedAmount: { amountMinor: 1_000n, currency: 'EUR' },
        updatedAtMs: now,
      });
    });

    const after = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(before.liquidityMinor).toBe(10_000n);
    expect(before.readyToAssignMinor).toBe(10_000n);
    expect(after.liquidityMinor).toBe(10_000n);
    expect(after.readyToAssignMinor).toBe(10_000n);
    expect(after.breakdown).toEqual({
      carryFromPreviousMonthMinor: 10_000n,
      bucketActivityMinor: 0n,
      internalMinor: 0n,
      transferNetMinor: 0n,
      incomeMinor: 0n,
      liquidityFromCardMinor: 0n,
      uncoveredCardSpendMinor: 0n,
      beforePlanStartMinor: 0n,
      unexplainedMinor: 0n,
      moneyBoxReserveMinor: 0n,
      assignedMinor: 0n,
      cashOverspendingMinor: 0n,
    });
    expect(after.breakdown.incomeMinor).toBe(0n);
  });

  test('keeps a transfer withdrawal from held-outside money neutral in liquidity, Ready to Assign, and income', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_money_box_withdrawal_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 9_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const moneyBoxId = await seedMoneyBox(t, userId, {
      accountId,
      savedMinor: 1_000n,
      heldOutsideBalance: true,
    });
    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const transactionId = await seedTransaction(t, userId, {
      accountId,
      period: '2026-07',
      amountMinor: 1_000n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'money_box_withdrawal',
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId,
        kind: 'withdrawal',
        amount: { amountMinor: 1_000n, currency: 'EUR' },
        contributionDate: '2026-07-15',
        source: 'transaction',
        transactionId,
        createdAtMs: now,
      });
      await ctx.db.patch('moneyBoxes', moneyBoxId, {
        savedAmount: { amountMinor: 0n, currency: 'EUR' },
        updatedAtMs: now,
      });
    });

    const after = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(before.liquidityMinor).toBe(10_000n);
    expect(before.readyToAssignMinor).toBe(10_000n);
    expect(after.liquidityMinor).toBe(10_000n);
    expect(after.readyToAssignMinor).toBe(10_000n);
    expect(after.breakdown).toEqual({
      carryFromPreviousMonthMinor: 10_000n,
      bucketActivityMinor: 0n,
      internalMinor: 0n,
      transferNetMinor: 0n,
      incomeMinor: 0n,
      liquidityFromCardMinor: 0n,
      uncoveredCardSpendMinor: 0n,
      beforePlanStartMinor: 0n,
      unexplainedMinor: 0n,
      moneyBoxReserveMinor: 0n,
      assignedMinor: 0n,
      cashOverspendingMinor: 0n,
    });
    expect(after.breakdown.incomeMinor).toBe(0n);
  });

  test('ignores held-outside money that cannot be placed inside the Plan perimeter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_money_box_perimeter_user';
    await seedAuthKitUser(t, userId);
    const planAccountId = await seedAccount(t, userId, 'Checking');
    const outsideAccountId = await seedAccount(t, userId, 'Outside');
    await seedBalance(t, userId, planAccountId, 10_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [planAccountId]);
    await seedMoneyBox(t, userId, {
      accountId: outsideAccountId,
      savedMinor: 1_000n,
      heldOutsideBalance: true,
    });
    await seedMoneyBox(t, userId, {
      accountId: planAccountId,
      savedMinor: 2_000n,
      currency: 'USD',
      heldOutsideBalance: true,
    });
    await seedMoneyBox(t, userId, {
      savedMinor: 3_000n,
      heldOutsideBalance: true,
    });
    await seedMoneyBox(t, userId, {
      accountId: planAccountId,
      savedMinor: 4_000n,
      heldOutsideBalance: true,
      status: 'archived',
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    expect(result.liquidityMinor).toBe(10_000n);
    expect(result.readyToAssignMinor).toBe(10_000n);
    expect(result.breakdown).toEqual({
      carryFromPreviousMonthMinor: 10_000n,
      bucketActivityMinor: 0n,
      internalMinor: 0n,
      transferNetMinor: 0n,
      incomeMinor: 0n,
      liquidityFromCardMinor: 0n,
      uncoveredCardSpendMinor: 0n,
      beforePlanStartMinor: 0n,
      unexplainedMinor: 0n,
      moneyBoxReserveMinor: 0n,
      assignedMinor: 0n,
      cashOverspendingMinor: 0n,
    });
  });

  test('adds targets, underfunded status, snooze, and Cost to Be Me without changing Ready to Assign', async () => {
    const t = createTest();
    const userId = 'plan_read_target_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const bucketId = await bucketForCategory(t, planId, categoryId);
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId,
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 5_000n,
      repeats: true,
    });
    await asUser.mutation(api.banking.plan.setExpectedIncome, { planId, expectedIncomeMinor: 6_000n });

    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const beforeBucket = before.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.bucketId === bucketId)!;
    expect(beforeBucket).toMatchObject({
      target: { cadence: 'monthly', behaviour: 'setAside', amountMinor: 5_000n },
      neededMinor: 5_000n,
      underfundedMinor: 5_000n,
      snoozed: false,
      status: 'underfunded',
    });
    expect(before.plan.expectedIncomeMinor).toBe(6_000n);
    expect(before.totals).toMatchObject({ underfundedMinor: 5_000n, targetsMinor: 5_000n });

    await asUser.mutation(api.banking.plan.snoozeTarget, { bucketId, period: '2026-07', snoozed: true });
    const after = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const afterBucket = after.groups.flatMap((group) => group.buckets).find((bucket) => bucket.bucketId === bucketId)!;
    expect(afterBucket).toMatchObject({ neededMinor: 5_000n, underfundedMinor: 0n, snoozed: true, status: 'funded' });
    expect(after.totals).toMatchObject({ underfundedMinor: 0n, targetsMinor: 5_000n });
    expect(after.readyToAssignMinor).toBe(before.readyToAssignMinor);
  });

  test.each(
    [
      ['underfunded', [4_700n, 4_300n]],
      ['assignedLastMonth', [1_000n, 2_000n]],
      ['spentLastMonth', [400n, 600n]],
      ['averageAssigned', [2_000n, 1_500n]],
      ['resetAssigned', [-300n, -700n]],
      ['resetAvailable', [-3_900n, -3_100n]],
    ].flatMap(([strategy, amounts]) => [
      { strategy, amounts, selected: false },
      { strategy, amounts, selected: true },
    ]) as Array<{
      strategy:
        | 'underfunded'
        | 'assignedLastMonth'
        | 'spentLastMonth'
        | 'averageAssigned'
        | 'resetAssigned'
        | 'resetAvailable';
      amounts: Array<bigint>;
      selected: boolean;
    }>,
  )('previews and applies $strategy with selected=$selected', async ({ strategy, amounts, selected }) => {
    const t = createTest();
    const fixture = await createAutoAssignFixture(t, `plan_auto_${strategy}_${selected ? 'selected' : 'all'}`);
    const before = await fixture.asUser.query(api.banking.planRead.getPlanMonth, {
      planId: fixture.planId,
      period: '2026-07',
    });
    const bucketIds = selected ? [fixture.firstBucketId] : undefined;
    const preview = await fixture.asUser.mutation(api.banking.plan.autoAssign, {
      planId: fixture.planId,
      period: '2026-07',
      strategy,
      bucketIds,
      dryRun: true,
    });
    const assignmentsAfterPreview = await t.run(async (ctx) =>
      ctx.db
        .query('planAssignments')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', fixture.planId).eq('period', '2026-07'))
        .take(10),
    );

    const expectedByBucket = new Map([
      [fixture.firstBucketId, amounts[0]],
      [fixture.secondBucketId, amounts[1]],
    ]);
    expect(preview.applied).toBe(false);
    expect(preview.rows).toHaveLength(selected ? 1 : 2);
    for (const row of preview.rows) expect(row.amountMinor).toBe(expectedByBucket.get(row.bucketId));
    expect(assignmentsAfterPreview.find((row) => row.bucketId === fixture.firstBucketId)?.assignedMinor).toBe(300n);
    expect(assignmentsAfterPreview.find((row) => row.bucketId === fixture.secondBucketId)?.assignedMinor).toBe(700n);

    const applied = await fixture.asUser.mutation(api.banking.plan.autoAssign, {
      planId: fixture.planId,
      period: '2026-07',
      strategy,
      bucketIds,
      dryRun: false,
    });
    const after = await fixture.asUser.query(api.banking.planRead.getPlanMonth, {
      planId: fixture.planId,
      period: '2026-07',
    });
    expect(applied.applied).toBe(true);
    expect(after.readyToAssignMinor).toBe(before.readyToAssignMinor - applied.totalAssignedMinor);
    expect(applied.resultingReadyToAssignMinor).toBe(after.readyToAssignMinor);
  });

  test('orders Underfunded Auto-Assign as overspending, dated, month-end, then long-term targets', async () => {
    const t = createTest();
    const userId = 'plan_auto_priority_user';
    await seedAuthKitUser(t, userId);
    const categoryIds = await Promise.all(
      ['Overspent', 'Dated', 'Monthly', 'Yearly'].map((name) => seedCategory(t, userId, name)),
    );
    const accountId = await seedAccount(t, userId, 'Checking');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const bucketIds = await Promise.all(categoryIds.map((categoryId) => bucketForCategory(t, planId, categoryId)));
    await seedTransaction(t, userId, {
      accountId,
      categoryId: categoryIds[0],
      period: '2026-07',
      amountMinor: 100n,
      dedupeKey: 'priority_overspending',
    });
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: bucketIds[1],
      cadence: 'custom',
      behaviour: 'balanceBy',
      amountMinor: 1_000n,
      dueDate: '2026-07-31',
      repeats: false,
    });
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: bucketIds[2],
      cadence: 'monthly',
      behaviour: 'setAside',
      amountMinor: 300n,
      repeats: true,
    });
    await asUser.mutation(api.banking.plan.setTarget, {
      bucketId: bucketIds[3],
      cadence: 'yearly',
      behaviour: 'setAside',
      amountMinor: 1_200n,
      dueDate: '2026-12-15',
      repeats: true,
    });

    const preview = await asUser.mutation(api.banking.plan.autoAssign, {
      planId,
      period: '2026-07',
      strategy: 'underfunded',
      dryRun: true,
    });

    expect(preview.rows.map((row) => row.bucketId)).toEqual(bucketIds);
    expect(preview.rows.map((row) => row.amountMinor)).toEqual([100n, 1_000n, 300n, 200n]);
  });

  test('skips a snoozed target during Underfunded Auto-Assign', async () => {
    const t = createTest();
    const fixture = await createAutoAssignFixture(t, 'plan_auto_snoozed_user');
    await fixture.asUser.mutation(api.banking.plan.snoozeTarget, {
      bucketId: fixture.secondBucketId,
      period: '2026-07',
      snoozed: true,
    });

    const preview = await fixture.asUser.mutation(api.banking.plan.autoAssign, {
      planId: fixture.planId,
      period: '2026-07',
      strategy: 'underfunded',
      dryRun: true,
    });

    expect(preview.rows.map((row) => row.bucketId)).toEqual([fixture.firstBucketId]);
    expect(preview.totalAssignedMinor).toBe(4_700n);
  });

  test('keeps eligible spending from an account outside the plan out of bucket totals and details', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_outside_activity_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const planAccountId = await seedAccount(t, userId, 'Checking');
    const outsideAccountId = await seedAccount(t, userId, 'Outside');
    await seedBalance(t, userId, planAccountId, 10_000n);
    await seedBalance(t, userId, outsideAccountId, 5_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [planAccountId]);
    const bucketId = await bucketForCategory(t, planId, groceriesId);
    await seedTransaction(t, userId, {
      accountId: outsideAccountId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 1_000n,
      dedupeKey: 'outside_groceries',
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const details = await asUser.query(api.banking.planRead.listPlanBucketTransactions, {
      planId,
      bucketId,
      period: '2026-07',
    });
    const bucket = result.groups
      .flatMap((group) => group.buckets)
      .find((candidate) => candidate.bucketId === bucketId)!;

    expect(bucket.activityMinor).toBe(0n);
    expect(result.totals.activityMinor).toBe(0n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
    expect(details.rows).toEqual([]);
  });

  test('keeps plan card spending in category activity while excluding cards outside the plan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_card_activity_perimeter_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const planCardId = await seedAccount(t, userId, 'Plan card', 'CARD');
    const outsideCardId = await seedAccount(t, userId, 'Outside card', 'CARD');
    await seedBalance(t, userId, cashAccountId, 10_000n);
    await seedBalance(t, userId, planCardId, 0n);
    await seedBalance(t, userId, outsideCardId, 0n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [cashAccountId, planCardId]);
    const bucketId = await bucketForCategory(t, planId, groceriesId);
    await seedTransaction(t, userId, {
      accountId: planCardId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 2_000n,
      dedupeKey: 'plan_card_groceries',
    });
    await seedTransaction(t, userId, {
      accountId: outsideCardId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 3_000n,
      dedupeKey: 'outside_card_groceries',
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const details = await asUser.query(api.banking.planRead.listPlanBucketTransactions, {
      planId,
      bucketId,
      period: '2026-07',
    });
    const bucket = result.groups
      .flatMap((group) => group.buckets)
      .find((candidate) => candidate.bucketId === bucketId)!;

    expect(bucket.activityMinor).toBe(-2_000n);
    // The card lent it, so it has a name now instead of sitting in the unexplained line.
    expect(result.breakdown.uncoveredCardSpendMinor).toBe(2_000n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
    expect(details.rows).toMatchObject([{ accountId: planCardId, description: 'plan_card_groceries' }]);
  });

  test('keeps an excluded money-box contribution out of bucket totals and details', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_money_box_bucket_activity_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 10_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const bucketId = await bucketForCategory(t, planId, groceriesId);
    const moneyBoxId = await seedMoneyBox(t, userId, {
      accountId,
      savedMinor: 0n,
      heldOutsideBalance: true,
    });
    const transactionId = await seedTransaction(t, userId, {
      accountId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 1_000n,
      dedupeKey: 'excluded_money_box_contribution',
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('moneyBoxContributions', {
        userId,
        moneyBoxId,
        kind: 'contribution',
        amount: { amountMinor: 1_000n, currency: 'EUR' },
        contributionDate: '2026-07-15',
        source: 'transaction',
        transactionId,
        createdAtMs: now,
      });
      await ctx.db.patch('moneyBoxes', moneyBoxId, {
        savedAmount: { amountMinor: 1_000n, currency: 'EUR' },
        updatedAtMs: now,
      });
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const details = await asUser.query(api.banking.planRead.listPlanBucketTransactions, {
      planId,
      bucketId,
      period: '2026-07',
    });
    const bucket = result.groups
      .flatMap((group) => group.buckets)
      .find((candidate) => candidate.bucketId === bucketId)!;

    expect(bucket.activityMinor).toBe(0n);
    expect(result.breakdown.bucketActivityMinor).toBe(0n);
    expect(details.rows).toEqual([]);
  });

  test('separates direct income from unexplained liquidity and keeps the header identity closed', async () => {
    const t = createTest();
    const userId = 'plan_read_breakdown_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const groceriesBucketId = await bucketForCategory(t, planId, groceriesId);
    await setAssigned(asUser, planId, groceriesBucketId, '2026-05', 12_000n);
    await seedTransaction(t, userId, {
      accountId,
      period: '2026-05',
      amountMinor: 5_000n,
      direction: 'CRDT',
      classificationKind: 'income',
      dedupeKey: 'salary',
    });
    await seedTransaction(t, userId, {
      accountId,
      period: '2026-05',
      amountMinor: 2_000n,
      direction: 'CRDT',
      classificationKind: 'uncategorized',
      dedupeKey: 'unclassified_credit',
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });

    expect(result.breakdown).toEqual({
      carryFromPreviousMonthMinor: 10_000n,
      bucketActivityMinor: 0n,
      internalMinor: 0n,
      transferNetMinor: 0n,
      incomeMinor: 5_000n,
      liquidityFromCardMinor: 0n,
      uncoveredCardSpendMinor: 0n,
      beforePlanStartMinor: 0n,
      unexplainedMinor: 2_000n,
      moneyBoxReserveMinor: 0n,
      assignedMinor: 12_000n,
      cashOverspendingMinor: 0n,
    });
    expect(result.readyToAssignMinor).toBe(5_000n);
    expect(reconciledReadyToAssign(result)).toBe(result.readyToAssignMinor);
  });

  test('decomposes bucket activity, financing, perimeter transfers, and income exactly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_out_of_plan_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const checkingId = await seedAccount(t, userId, 'Checking');
    const savingsId = await seedAccount(t, userId, 'Savings');
    const cardId = await seedAccount(t, userId, 'Card', 'CARD');
    const excludedId = await seedAccount(t, userId, 'Excluded');
    await seedBalance(t, userId, checkingId, 100_000n);
    await seedBalance(t, userId, savingsId, 20_000n);
    await seedBalance(t, userId, cardId, -15_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [checkingId, savingsId, cardId]);
    const groceriesBucketId = await bucketForCategory(t, planId, groceriesId);
    const cardBucket = await cardBucketForAccount(t, planId, cardId);
    await setAssigned(asUser, planId, groceriesBucketId, '2026-05', 20_000n);
    await setAssigned(asUser, planId, cardBucket._id, '2026-05', 12_000n);

    await seedTransaction(t, userId, {
      accountId: checkingId,
      categoryId: groceriesId,
      period: '2026-05',
      amountMinor: 12_000n,
      dedupeKey: 'categorised_purchase',
    });
    await seedTransaction(t, userId, {
      accountId: cardId,
      categoryId: groceriesId,
      period: '2026-05',
      amountMinor: 3_000n,
      dedupeKey: 'card_purchase',
    });
    await seedTransaction(t, userId, {
      accountId: checkingId,
      period: '2026-05',
      amountMinor: 7_000n,
      classificationKind: 'transfer',
      dedupeKey: 'plan_transfer_debit',
    });
    await seedTransaction(t, userId, {
      accountId: savingsId,
      period: '2026-05',
      amountMinor: 7_000n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'plan_transfer_credit',
    });
    const excludedTransferDebitId = await seedTransaction(t, userId, {
      accountId: checkingId,
      period: '2026-05',
      amountMinor: 9_000n,
      classificationKind: 'transfer',
      dedupeKey: 'excluded_transfer_debit',
    });
    const excludedTransferCreditId = await seedTransaction(t, userId, {
      accountId: excludedId,
      period: '2026-05',
      amountMinor: 9_000n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'excluded_transfer_credit',
    });
    await matchTransfer(t, userId, excludedTransferDebitId, excludedTransferCreditId);
    await seedTransaction(t, userId, {
      accountId: checkingId,
      period: '2026-05',
      amountMinor: 40_000n,
      direction: 'CRDT',
      classificationKind: 'income',
      dedupeKey: 'salary',
    });

    const beforeLoan = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    await seedTransaction(t, userId, {
      accountId: checkingId,
      period: '2026-05',
      amountMinor: 25_000n,
      classificationKind: 'internal',
      dedupeKey: 'loan_instalment',
    });
    const beforeSettlement = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    expect(beforeSettlement.readyToAssignMinor).toBe(beforeLoan.readyToAssignMinor - 25_000n);

    const settlementTransactionId = await seedTransaction(t, userId, {
      accountId: checkingId,
      period: '2026-05',
      amountMinor: 15_000n,
      classificationKind: 'internal',
      dedupeKey: 'card_statement_settlement',
    });
    await seedBalance(t, userId, cardId, -3_000n);
    await t.run(async (ctx) => {
      const now = Date.now();
      const creditFacilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Card statement',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        linkedAccountId: cardId,
        settlementAccountId: checkingId,
        provider: 'manual',
        limitAmount: { amountMinor: 100_000n, currency: 'EUR' },
        usedAmount: { amountMinor: 15_000n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId,
        cycleMonth: '2026-05',
        status: 'paid',
        trackedAmount: { amountMinor: 15_000n, currency: 'EUR' },
        dueDate: '2026-05-15',
        transactionId: settlementTransactionId,
        paidAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    expect(result.readyToAssignMinor).toBe(beforeSettlement.readyToAssignMinor);
    const [internalTransactions, transferTransactions] = await Promise.all([
      asUser.query(api.banking.planRead.listPlanOutOfPlanTransactions, {
        planId,
        period: '2026-05',
        kind: 'internal',
      }),
      asUser.query(api.banking.planRead.listPlanOutOfPlanTransactions, {
        planId,
        period: '2026-05',
        kind: 'transfer',
      }),
    ]);
    const categoryBuckets = [...result.groups.flatMap((group) => group.buckets), result.unplanned];
    const availableSum = categoryBuckets.reduce((sum, bucket) => sum + bucket.availableMinor, 0n);
    const activitySum = categoryBuckets.reduce((sum, bucket) => sum + bucket.activityMinor, 0n);
    const coveredCardSpendSum = categoryBuckets.reduce((sum, bucket) => sum + bucket.coveredCardSpendMinor, 0n);
    const settlementCardBucket = categoryBuckets.find((bucket) => bucket.cardAccountId === cardId);
    expect(settlementCardBucket).toMatchObject({
      activityMinor: -15_000n,
      coveredCardSpendMinor: 3_000n,
      availableMinor: 0n,
    });

    // The settlement is the card bucket's activity, so it leaves out-of-plan internal movement and
    // does not become unexplained. Only the loan instalment stays: it repays a debt no bucket was
    // ever charged for.
    expect(result.breakdown).toEqual({
      carryFromPreviousMonthMinor: 120_000n,
      bucketActivityMinor: -30_000n,
      internalMinor: -25_000n,
      transferNetMinor: -9_000n,
      incomeMinor: 40_000n,
      liquidityFromCardMinor: 0n,
      uncoveredCardSpendMinor: 0n,
      beforePlanStartMinor: 0n,
      unexplainedMinor: 0n,
      moneyBoxReserveMinor: 0n,
      assignedMinor: 32_000n,
      cashOverspendingMinor: 0n,
    });
    expect(internalTransactions).toMatchObject({
      truncated: false,
      rows: [
        {
          accountId: checkingId,
          name: 'Checking',
          description: 'loan_instalment',
          signedAmount: { amountMinor: -25_000n, currency: 'EUR' },
        },
      ],
    });
    expect(internalTransactions.rows.reduce((sum, transaction) => sum + transaction.signedAmount.amountMinor, 0n)).toBe(
      result.breakdown.internalMinor,
    );
    expect(transferTransactions.truncated).toBe(false);
    expect(transferTransactions.rows).toHaveLength(3);
    expect(transferTransactions.rows.map((transaction) => transaction.description)).toEqual(
      expect.arrayContaining(['plan_transfer_debit', 'plan_transfer_credit', 'excluded_transfer_debit']),
    );
    expect(transferTransactions.rows.map((transaction) => transaction.description)).not.toContain(
      'excluded_transfer_credit',
    );
    expect(transferTransactions.rows.map((transaction) => transaction.name)).toEqual(
      expect.arrayContaining(['Checking', 'Savings']),
    );
    expect(transferTransactions.rows.reduce((sum, transaction) => sum + transaction.signedAmount.amountMinor, 0n)).toBe(
      result.breakdown.transferNetMinor,
    );
    expect(
      result.breakdown.bucketActivityMinor +
        coveredCardSpendSum +
        result.breakdown.internalMinor +
        result.breakdown.transferNetMinor +
        result.breakdown.incomeMinor +
        result.breakdown.unexplainedMinor,
    ).toBe(-21_000n);
    expect(activitySum).toBe(-30_000n);
    expect(result.totals.activityMinor).toBe(activitySum);
    expect(availableSum).toBe(5_000n);
    expect(result.totals.availableMinor).toBe(availableSum);
    expect(result.readyToAssignMinor).toBe(94_000n);
    expect(reconciledReadyToAssign(result)).toBe(result.readyToAssignMinor);
  });

  test('rolls positive availability, resets overspending, and preserves the liquidity invariant', async () => {
    const t = createTest();
    const userId = 'plan_read_rollover_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const funId = await seedCategory(t, userId, 'Fun');
    const accountId = await seedAccount(t, userId, 'Checking');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const groceriesBucketId = await bucketForCategory(t, planId, groceriesId);
    const funBucketId = await bucketForCategory(t, planId, funId);
    await setAssigned(asUser, planId, groceriesBucketId, '2026-05', 6_000n);
    await setAssigned(asUser, planId, funBucketId, '2026-05', 1_000n);
    await seedTransaction(t, userId, {
      accountId,
      categoryId: groceriesId,
      period: '2026-05',
      amountMinor: 2_000n,
      dedupeKey: 'may_groceries',
    });
    await seedTransaction(t, userId, {
      accountId,
      categoryId: funId,
      period: '2026-05',
      amountMinor: 2_000n,
      dedupeKey: 'may_fun',
    });
    await seedTransaction(t, userId, {
      accountId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 1_000n,
      dedupeKey: 'july_groceries',
    });

    const may = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    const june = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-06' });
    const july = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const buckets = (result: typeof may) => [...result.groups.flatMap((group) => group.buckets), result.unplanned];
    const byId = (result: typeof may, bucketId: Id<'planBuckets'>) =>
      buckets(result).find((bucket) => bucket.bucketId === bucketId)!;

    expect(byId(may, groceriesBucketId)).toMatchObject({ carryInMinor: 0n, availableMinor: 4_000n });
    expect(byId(may, funBucketId)).toMatchObject({ carryInMinor: 0n, availableMinor: -1_000n });
    expect(byId(june, groceriesBucketId)).toMatchObject({ carryInMinor: 4_000n, availableMinor: 4_000n });
    expect(byId(june, funBucketId)).toMatchObject({ carryInMinor: 0n, availableMinor: 0n });
    expect(may.breakdown).toEqual({
      carryFromPreviousMonthMinor: 10_000n,
      bucketActivityMinor: -4_000n,
      internalMinor: 0n,
      transferNetMinor: 0n,
      incomeMinor: 0n,
      liquidityFromCardMinor: 0n,
      uncoveredCardSpendMinor: 0n,
      beforePlanStartMinor: 0n,
      unexplainedMinor: 0n,
      moneyBoxReserveMinor: 0n,
      assignedMinor: 7_000n,
      cashOverspendingMinor: -1_000n,
    });
    expect(june.breakdown).toEqual({
      carryFromPreviousMonthMinor: may.readyToAssignMinor,
      bucketActivityMinor: 0n,
      internalMinor: 0n,
      transferNetMinor: 0n,
      incomeMinor: 0n,
      liquidityFromCardMinor: 0n,
      uncoveredCardSpendMinor: 0n,
      beforePlanStartMinor: 0n,
      unexplainedMinor: 0n,
      moneyBoxReserveMinor: 0n,
      assignedMinor: 0n,
      cashOverspendingMinor: 0n,
    });
    // May's overspending is charged to May. June used to inherit the penalty a month late.
    expect(june.readyToAssignMinor).toBe(may.readyToAssignMinor);
    expect(reconciledReadyToAssign(may)).toBe(may.readyToAssignMinor);
    expect(reconciledReadyToAssign(june)).toBe(june.readyToAssignMinor);
    expect(reconciledReadyToAssign(july)).toBe(july.readyToAssignMinor);
    expect(byId(july, groceriesBucketId)).toMatchObject({ carryInMinor: 4_000n, availableMinor: 3_000n });

    for (const result of [may, june, july]) {
      const transactionFlow = result.period === '2026-05' ? -4_000n : result.period === '2026-06' ? -4_000n : -5_000n;
      const liquidityMinor = 10_000n + transactionFlow;
      expect(result.totals.availableMinor + result.readyToAssignMinor).toBe(
        liquidityMinor + result.breakdown.cashOverspendingMinor,
      );
      expect(result.truncated).toBe(false);
    }
  });

  test('sums many categories per bucket while keeping different plans coherent on the same transactions', async () => {
    const t = createTest();
    const userId = 'plan_read_multi_plan_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const cafeId = await seedCategory(t, userId, 'Cafe');
    const accountId = await seedAccount(t, userId, 'Checking');
    const first = await createPlan(t, userId, 'Detailed', [accountId]);
    await setPlanTier(t, userId, 'pro');
    const second = await createPlan(t, userId, 'Compact', [accountId]);
    const compactBucketId = await bucketForCategory(t, second.planId, groceriesId);
    await second.asUser.mutation(api.banking.plan.mapCategoriesToBucket, {
      bucketId: compactBucketId,
      categoryIds: [groceriesId, cafeId],
    });
    await seedTransaction(t, userId, {
      accountId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 1_000n,
      dedupeKey: 'groceries',
    });
    await seedTransaction(t, userId, {
      accountId,
      categoryId: cafeId,
      period: '2026-07',
      amountMinor: 500n,
      dedupeKey: 'cafe',
    });

    const detailed = await first.asUser.query(api.banking.planRead.getPlanMonth, {
      planId: first.planId,
      period: '2026-07',
    });
    const compact = await second.asUser.query(api.banking.planRead.getPlanMonth, {
      planId: second.planId,
      period: '2026-07',
    });
    const detailedActivity = detailed.groups.flatMap((group) => group.buckets).map((bucket) => bucket.activityMinor);
    const compactBucket = compact.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.bucketId === compactBucketId)!;

    expect(detailedActivity).toEqual(expect.arrayContaining([-1_000n, -500n]));
    expect(compactBucket).toMatchObject({
      categoryIds: expect.arrayContaining([groceriesId, cafeId]),
      activityMinor: -1_500n,
    });
    expect(detailed.totals.activityMinor).toBe(-1_500n);
    expect(compact.totals.activityMinor).toBe(-1_500n);
    expect(detailed.totals.availableMinor + detailed.readyToAssignMinor).toBe(
      8_500n + detailed.breakdown.cashOverspendingMinor,
    );
    expect(compact.totals.availableMinor + compact.readyToAssignMinor).toBe(
      8_500n + compact.breakdown.cashOverspendingMinor,
    );
  });

  test('keeps hidden buckets in the read model and accounting totals', async () => {
    const t = createTest();
    const userId = 'plan_read_hidden_bucket_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 10_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const bucketId = await bucketForCategory(t, planId, categoryId);
    await setAssigned(asUser, planId, bucketId, '2026-07', 4_000n);
    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    await asUser.mutation(api.banking.plan.hideBucket, { bucketId, hidden: true });
    await expect(
      asUser.mutation(api.banking.plan.hideBucket, { bucketId: before.unplanned.bucketId, hidden: true }),
    ).rejects.toThrow('The Unplanned bucket cannot be hidden');
    const after = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const hiddenBucket = after.groups.flatMap((group) => group.buckets).find((bucket) => bucket.bucketId === bucketId);

    expect(hiddenBucket).toMatchObject({ hidden: true, assignedMinor: 4_000n, availableMinor: 4_000n });
    expect(after.unplanned.hidden).toBe(false);
    expect(after.totals).toEqual(before.totals);
    expect(after.readyToAssignMinor).toBe(before.readyToAssignMinor);
    expect(after.readyToAssignMinor).toBe(6_000n);
  });

  test('routes uncategorized and unmapped eligible transactions to Unplanned', async () => {
    const t = createTest();
    const userId = 'plan_read_unplanned_user';
    await seedAuthKitUser(t, userId);
    await seedCategory(t, userId, 'Mapped');
    const accountId = await seedAccount(t, userId, 'Checking');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const unmappedId = await seedCategory(t, userId, 'Added later');
    await seedTransaction(t, userId, {
      accountId,
      categoryId: unmappedId,
      period: '2026-07',
      amountMinor: 700n,
      dedupeKey: 'unmapped',
    });
    await seedTransaction(t, userId, {
      accountId,
      period: '2026-07',
      amountMinor: 300n,
      classificationKind: 'uncategorized',
      dedupeKey: 'uncategorized',
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const activity = await asUser.query(api.banking.planRead.listPlanBucketTransactions, {
      planId,
      bucketId: result.unplanned.bucketId,
      period: '2026-07',
    });

    expect(result.unplanned.activityMinor).toBe(-1_000n);
    expect(result.unplanned.categoryIds).toContain(unmappedId);
    expect(result.totals.activityMinor).toBe(-1_000n);
    expect(activity.truncated).toBe(false);
    expect(activity.rows.map((row) => row.description)).toEqual(expect.arrayContaining(['unmapped', 'uncategorized']));
  });

  test('treats an unlinked cash-only card payment as ordinary cash outflow', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_unlinked_card_payment_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const cardAccountId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, cashAccountId, 100_000n);
    await seedBalance(t, userId, cardAccountId, -30_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [cashAccountId, cardAccountId]);
    const bucketId = await bucketForCategory(t, planId, groceriesId);
    await setAssigned(asUser, planId, bucketId, '2026-07', 15_000n);
    await seedTransaction(t, userId, {
      accountId: cardAccountId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 10_000n,
      dedupeKey: 'card_purchase_before_unlinked_payment',
    });

    const beforePayment = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    await seedTransaction(t, userId, {
      accountId: cashAccountId,
      period: '2026-07',
      amountMinor: 25_000n,
      classificationKind: 'internal',
      dedupeKey: 'unlinked_card_statement_payment',
    });
    // No usage cycle and no card-side transaction: only the observed card balance records repayment.
    await seedBalance(t, userId, cardAccountId, -15_000n);
    const afterPayment = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    const expectedLiquidityMinor = 75_000n;
    expect(afterPayment.readyToAssignMinor).toBe(beforePayment.readyToAssignMinor - 25_000n);
    expect(afterPayment.totals.availableMinor + afterPayment.readyToAssignMinor).toBe(expectedLiquidityMinor);
    expect(reconciledReadyToAssign(afterPayment)).toBe(afterPayment.readyToAssignMinor);
  });

  test('leaves Ready to Assign unchanged when card spending is credit overspending', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_card_overspending_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const cardAccountId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, cashAccountId, 8_000n);
    await seedBalance(t, userId, cardAccountId, 0n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [cashAccountId, cardAccountId]);
    const bucketId = await bucketForCategory(t, planId, groceriesId);
    const beforePurchase = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });

    await seedTransaction(t, userId, {
      accountId: cardAccountId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 2_000n,
      dedupeKey: 'unfunded_card_purchase',
    });
    const afterPurchase = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const spendingBucket = afterPurchase.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.bucketId === bucketId)!;
    const cardBucket = afterPurchase.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.cardAccountId === cardAccountId)!;

    expect(afterPurchase.readyToAssignMinor).toBe(beforePurchase.readyToAssignMinor);
    expect(spendingBucket.availableMinor).toBe(-2_000n);
    expect(spendingBucket).toHaveProperty('creditOverspendMinor', 2_000n);
    expect(cardBucket).toMatchObject({ coveredCardSpendMinor: 0n, availableMinor: 0n });
    expect(afterPurchase.breakdown.cashOverspendingMinor).toBe(-2_000n);
    expect(afterPurchase.breakdown.unexplainedMinor).toBe(0n);
  });

  test('exposes mixed cash and credit overspending without changing Ready to Assign or unexplained movement', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_mixed_overspending_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const cardAccountId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, cashAccountId, 10_000n);
    await seedBalance(t, userId, cardAccountId, 0n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [cashAccountId, cardAccountId]);
    const bucketId = await bucketForCategory(t, planId, groceriesId);
    await setAssigned(asUser, planId, bucketId, '2026-07', 1_000n);

    await seedTransaction(t, userId, {
      accountId: cashAccountId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 1_500n,
      dedupeKey: 'mixed_cash_purchase',
    });
    await seedTransaction(t, userId, {
      accountId: cardAccountId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 1_000n,
      dedupeKey: 'mixed_card_purchase',
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const spendingBucket = result.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.bucketId === bucketId)!;

    expect(spendingBucket.availableMinor).toBe(-1_500n);
    expect(spendingBucket).toHaveProperty('creditOverspendMinor', 1_000n);
    expect(result.readyToAssignMinor).toBe(8_500n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
    expect(reconciledReadyToAssign(result)).toBe(result.readyToAssignMinor);
  });

  test('exposes zero credit overspending for a cash-only overspent bucket', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_cash_overspending_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, cashAccountId, 10_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [cashAccountId]);
    const bucketId = await bucketForCategory(t, planId, groceriesId);
    await setAssigned(asUser, planId, bucketId, '2026-07', 1_000n);
    await seedTransaction(t, userId, {
      accountId: cashAccountId,
      categoryId: groceriesId,
      period: '2026-07',
      amountMinor: 1_500n,
      dedupeKey: 'cash_only_purchase',
    });

    const result = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const spendingBucket = result.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.bucketId === bucketId)!;

    expect(spendingBucket.availableMinor).toBe(-500n);
    expect(spendingBucket).toHaveProperty('creditOverspendMinor', 0n);
    expect(result.readyToAssignMinor).toBe(8_500n);
    expect(result.breakdown.unexplainedMinor).toBe(0n);
  });

  test('moves covered card spending into the payment bucket and keeps a funded settlement neutral', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_card_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const cardAccountId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, cashAccountId, 8_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [cashAccountId, cardAccountId]);
    const bucketId = await bucketForCategory(t, planId, groceriesId);
    await setAssigned(asUser, planId, bucketId, '2026-05', 5_000n);
    const beforePurchase = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    await seedTransaction(t, userId, {
      accountId: cardAccountId,
      categoryId: groceriesId,
      period: '2026-05',
      amountMinor: 2_000n,
      dedupeKey: 'card_purchase',
    });

    const purchaseMonth = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' });
    const cashSettlementId = await seedTransaction(t, userId, {
      accountId: cashAccountId,
      period: '2026-06',
      amountMinor: 2_000n,
      classificationKind: 'transfer',
      dedupeKey: 'settlement_cash',
    });
    const cardSettlementId = await seedTransaction(t, userId, {
      accountId: cardAccountId,
      period: '2026-06',
      amountMinor: 2_000n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'settlement_card',
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      const transferMatchId = await ctx.db.insert('transferMatches', {
        userId,
        outgoingTransactionId: cashSettlementId,
        incomingTransactionId: cardSettlementId,
        status: 'confirmed',
        amountDelta: { amountMinor: 0n, currency: 'EUR' },
        source: 'user',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await Promise.all([
        ctx.db.patch('transactions', cashSettlementId, { transferMatchId }),
        ctx.db.patch('transactions', cardSettlementId, { transferMatchId }),
      ]);
      const creditFacilityId = await ctx.db.insert('creditFacilities', {
        userId,
        name: 'Card statement',
        facilityType: 'cardCreditLine',
        status: 'active',
        source: 'manual',
        linkedAccountId: cardAccountId,
        settlementAccountId: cashAccountId,
        provider: 'manual',
        limitAmount: { amountMinor: 20_000n, currency: 'EUR' },
        usedAmount: { amountMinor: 0n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId,
        cycleMonth: '2026-06',
        status: 'paid',
        trackedAmount: { amountMinor: 2_000n, currency: 'EUR' },
        dueDate: '2026-06-15',
        transactionId: cashSettlementId,
        paidAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });
    const coldSettlementMonth = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-06' });
    const purchaseBucket = purchaseMonth.groups
      .flatMap((group) => group.buckets)
      .find((candidate) => candidate.bucketId === bucketId)!;

    const purchaseCardBucket = purchaseMonth.groups
      .flatMap((group) => group.buckets)
      .find((candidate) => candidate.cardAccountId === cardAccountId)!;
    const settlementCardBucket = coldSettlementMonth.groups
      .flatMap((group) => group.buckets)
      .find((candidate) => candidate.cardAccountId === cardAccountId)!;
    expect(purchaseMonth.readyToAssignMinor).toBe(beforePurchase.readyToAssignMinor);
    expect(purchaseBucket).toMatchObject({ activityMinor: -2_000n, availableMinor: 3_000n });
    expect(purchaseCardBucket).toMatchObject({
      activityMinor: 0n,
      coveredCardSpendMinor: 2_000n,
      availableMinor: 2_000n,
    });
    expect(purchaseMonth.totals.availableMinor + purchaseMonth.readyToAssignMinor).toBe(8_000n);
    expect(coldSettlementMonth.liquidityMinor).toBe(purchaseMonth.liquidityMinor - 2_000n);
    expect(settlementCardBucket).toMatchObject({ activityMinor: -2_000n, availableMinor: 0n });
    expect(coldSettlementMonth.totals.availableMinor + coldSettlementMonth.readyToAssignMinor).toBe(6_000n);
    expect(coldSettlementMonth.readyToAssignMinor).toBe(purchaseMonth.readyToAssignMinor);

    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const warmSettlementMonth = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-06' });
    expect(warmSettlementMonth).toEqual(coldSettlementMonth);
  });

  test('lists covered purchases in a card bucket even when there is no statement payment', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_card_covered_purchase_detail_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Healthcare');
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const cardAccountId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, cashAccountId, 20_000n);
    await seedBalance(t, userId, cardAccountId, 0n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [cashAccountId, cardAccountId]);
    const categoryBucketId = await bucketForCategory(t, planId, categoryId);
    const cardBucket = await cardBucketForAccount(t, planId, cardAccountId);
    await setAssigned(asUser, planId, categoryBucketId, '2026-05', 7_550n);
    await seedTransaction(t, userId, {
      accountId: cardAccountId,
      categoryId,
      period: '2026-05',
      amountMinor: 7_550n,
      dedupeKey: 'covered_healthcare_purchase',
    });

    const [month, activity] = await Promise.all([
      asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-05' }),
      asUser.query(api.banking.planRead.listPlanBucketTransactions, {
        planId,
        bucketId: cardBucket._id,
        period: '2026-05',
      }),
    ]);
    const cardMonthBucket = month.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.bucketId === cardBucket._id)!;
    const coveredRows = activity.rows.filter((row) => row.kind === 'coveredPurchase');

    expect(cardMonthBucket).toMatchObject({ activityMinor: 0n, coveredCardSpendMinor: 7_550n });
    expect(coveredRows).toMatchObject([
      {
        description: 'covered_healthcare_purchase',
        direction: 'CRDT',
        amount: { amountMinor: 7_550n, currency: 'EUR' },
      },
    ]);
    expect(coveredRows.reduce((sum, row) => sum + row.amount.amountMinor, 0n)).toBe(
      cardMonthBucket.coveredCardSpendMinor,
    );
    expect(activity.totalMinor).toBe(7_550n);
  });

  test('keeps covered purchases distinct from statement payments in card bucket activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_card_purchase_and_payment_detail_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Healthcare');
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const cardAccountId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, cashAccountId, 20_000n);
    await seedBalance(t, userId, cardAccountId, 0n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [cashAccountId, cardAccountId]);
    const categoryBucketId = await bucketForCategory(t, planId, categoryId);
    const cardBucket = await cardBucketForAccount(t, planId, cardAccountId);
    await setAssigned(asUser, planId, categoryBucketId, '2026-05', 4_000n);
    await seedTransaction(t, userId, {
      accountId: cardAccountId,
      categoryId,
      period: '2026-05',
      amountMinor: 4_000n,
      dedupeKey: 'covered_card_purchase',
    });
    await seedTransaction(t, userId, {
      accountId: cardAccountId,
      period: '2026-05',
      amountMinor: 1_500n,
      direction: 'CRDT',
      classificationKind: 'transfer',
      dedupeKey: 'card_statement_payment',
    });

    const activity = await asUser.query(api.banking.planRead.listPlanBucketTransactions, {
      planId,
      bucketId: cardBucket._id,
      period: '2026-05',
    });

    expect(activity.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: 'covered_card_purchase', kind: 'coveredPurchase' }),
        expect.objectContaining({ description: 'card_statement_payment', kind: 'payment' }),
      ]),
    );
    expect(activity.totalMinor).toBe(2_500n);
  });

  test('shows only the covered share of a partially covered card purchase', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_partial_card_purchase_detail_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Healthcare');
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const cardAccountId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, cashAccountId, 20_000n);
    await seedBalance(t, userId, cardAccountId, 0n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [cashAccountId, cardAccountId]);
    const categoryBucketId = await bucketForCategory(t, planId, categoryId);
    const cardBucket = await cardBucketForAccount(t, planId, cardAccountId);
    await setAssigned(asUser, planId, categoryBucketId, '2026-05', 5_000n);
    await seedTransaction(t, userId, {
      accountId: cardAccountId,
      categoryId,
      period: '2026-05',
      amountMinor: 7_550n,
      dedupeKey: 'partially_covered_card_purchase',
    });

    const activity = await asUser.query(api.banking.planRead.listPlanBucketTransactions, {
      planId,
      bucketId: cardBucket._id,
      period: '2026-05',
    });

    expect(activity.rows).toMatchObject([
      {
        description: 'partially_covered_card_purchase',
        kind: 'coveredPurchase',
        direction: 'CRDT',
        amount: { amountMinor: 5_000n, currency: 'EUR' },
      },
    ]);
    expect(activity.totalMinor).toBe(5_000n);
  });

  test('invalidates plan snapshots when a card balance is written', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_card_balance_invalidation_user';
    await seedAuthKitUser(t, userId);
    const cashAccountId = await seedAccount(t, userId, 'Checking');
    const cardAccountId = await seedAccount(t, userId, 'Card', 'CARD');
    await seedBalance(t, userId, cashAccountId, 10_000n);
    await seedBalance(t, userId, cardAccountId, -2_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [cashAccountId, cardAccountId]);
    const snapshotId = await t.run(async (ctx) => {
      const cardBucket = (
        await ctx.db
          .query('planBuckets')
          .withIndex('by_planId_and_groupId_and_sortOrder', (q) => q.eq('planId', planId))
          .take(100)
      ).find((bucket) => bucket.cardAccountId === cardAccountId)!;
      return await ctx.db.insert('planMonthSnapshots', {
        planId,
        userId,
        period: '2026-05',
        entries: [
          {
            bucketId: cardBucket._id,
            assignedMinor: 0n,
            activityMinor: 0n,
            coveredCardSpendMinor: 0n,
            availableEndMinor: 0n,
          },
        ],
        readyToAssignEndMinor: 10_000n,
        cashOverspendingMinor: 0n,
        computedAtMs: Date.now(),
      });
    });

    await asUser.mutation(api.banking.manualAccounts.setManualAccountBalance, {
      accountId: cardAccountId,
      amount: { amountMinor: -1_000n, currency: 'EUR' },
      referenceDate: '2026-05-31',
    });

    expect(await t.run(async (ctx) => ctx.db.get('planMonthSnapshots', snapshotId))).toBeNull();
  });

  test('recomputes later snapshots after a past assignment and keeps warm and cold reads identical', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_snapshot_user';
    await seedAuthKitUser(t, userId);
    const groceriesId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const bucketId = await bucketForCategory(t, planId, groceriesId);
    await setAssigned(asUser, planId, bucketId, '2026-05', 4_000n);
    await seedTransaction(t, userId, {
      accountId,
      categoryId: groceriesId,
      period: '2026-05',
      amountMinor: 1_000n,
      dedupeKey: 'may_spend',
    });
    await seedTransaction(t, userId, {
      accountId,
      categoryId: groceriesId,
      period: '2026-06',
      amountMinor: 500n,
      dedupeKey: 'june_spend',
    });

    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const warmBefore = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    await t.run(async (ctx) => {
      const snapshots = await ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
        .take(20);
      await Promise.all(snapshots.map((snapshot) => ctx.db.delete('planMonthSnapshots', snapshot._id)));
    });
    const coldBefore = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    expect(warmBefore).toEqual(coldBefore);

    await setAssigned(asUser, planId, bucketId, '2026-05', 5_000n);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const warmAfter = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const maySnapshot = await t.run(async (ctx) =>
      ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId).eq('period', '2026-05'))
        .unique(),
    );
    await t.run(async (ctx) => {
      const snapshots = await ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
        .take(20);
      await Promise.all(snapshots.map((snapshot) => ctx.db.delete('planMonthSnapshots', snapshot._id)));
    });
    const coldAfter = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const updatedBucket = warmAfter.groups
      .flatMap((group) => group.buckets)
      .find((bucket) => bucket.bucketId === bucketId)!;

    expect(maySnapshot?.entries.find((entry) => entry.bucketId === bucketId)?.availableEndMinor).toBe(4_000n);
    expect(updatedBucket.availableMinor).toBe(3_500n);
    expect(warmAfter).toEqual(coldAfter);
  });

  test('reflects a current-month transaction immediately with only older snapshots present', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_current_late_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const bucketId = await bucketForCategory(t, planId, categoryId);
    await setAssigned(asUser, planId, bucketId, '2026-05', 5_000n);
    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-09' });
    const julySnapshot = await t.run(async (ctx) =>
      ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId).eq('period', '2026-07'))
        .unique(),
    );
    await seedTransaction(t, userId, {
      accountId,
      categoryId,
      period: '2026-09',
      amountMinor: 700n,
      dedupeKey: 'late_current_month',
    });
    const after = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-09' });
    const afterBucket = after.groups.flatMap((group) => group.buckets).find((bucket) => bucket.bucketId === bucketId)!;

    expect(julySnapshot).not.toBeNull();
    expect(afterBucket).toMatchObject({ activityMinor: -700n, availableMinor: 4_300n });
    expect(after.readyToAssignMinor).toBe(before.readyToAssignMinor);
  });

  test('reflects a previous-month transaction immediately with only older snapshots present', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_previous_late_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const bucketId = await bucketForCategory(t, planId, categoryId);
    await setAssigned(asUser, planId, bucketId, '2026-05', 5_000n);
    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const before = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-08' });
    await seedTransaction(t, userId, {
      accountId,
      categoryId,
      period: '2026-08',
      amountMinor: 600n,
      dedupeKey: 'late_previous_month',
    });
    const after = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-08' });
    const afterBucket = after.groups.flatMap((group) => group.buckets).find((bucket) => bucket.bucketId === bucketId)!;

    expect(afterBucket).toMatchObject({ activityMinor: -600n, availableMinor: 4_400n });
    expect(after.readyToAssignMinor).toBe(before.readyToAssignMinor);
  });

  test('invalidates an old transaction month and every later cached month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_old_transaction_invalidation_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 10_000n);
    // Equal fetchedAtMs values are one provider snapshot, not successive manual balances.
    vi.advanceTimersByTime(1);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const bucketId = await bucketForCategory(t, planId, categoryId);
    await setAssigned(asUser, planId, bucketId, '2026-05', 5_000n);
    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId,
      direction: 'DBIT',
      amount: { amountMinor: 1_000n, currency: 'EUR' },
      bookingDate: '2026-06-15',
      description: 'Late groceries',
      categoryId,
    });
    const remainingPeriods = await t.run(async (ctx) =>
      (
        await ctx.db
          .query('planMonthSnapshots')
          .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
          .take(20)
      ).map((snapshot) => snapshot.period),
    );
    const july = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const groceries = july.groups.flatMap((group) => group.buckets).find((bucket) => bucket.bucketId === bucketId)!;

    expect(remainingPeriods).toEqual(['2026-05']);
    expect(groceries).toMatchObject({ carryInMinor: 4_000n, activityMinor: 0n, availableMinor: 4_000n });
    expect(july.totals).toMatchObject({ assignedMinor: 0n, activityMinor: 0n, availableMinor: 4_000n });
    expect(july.liquidityMinor).toBe(9_000n);
    expect(july.readyToAssignMinor).toBe(5_000n);
  });

  test('keeps cached snapshots for writes inside the stability window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_stable_window_write_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 10_000n);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const snapshotsBefore = await t.run(async (ctx) =>
      ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
        .take(20),
    );

    await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId,
      direction: 'DBIT',
      amount: { amountMinor: 700n, currency: 'EUR' },
      bookingDate: '2026-08-15',
      description: 'Recent groceries',
      categoryId,
    });
    const snapshotsAfter = await t.run(async (ctx) =>
      ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
        .take(20),
    );

    expect(snapshotsBefore.map((snapshot) => snapshot.period)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(snapshotsAfter).toEqual(snapshotsBefore);
  });

  test('invalidates from the earlier month when editing an old transaction date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_date_edit_invalidation_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 10_000n);
    // Equal fetchedAtMs values are one provider snapshot, not successive manual balances.
    vi.advanceTimersByTime(1);
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const bucketId = await bucketForCategory(t, planId, categoryId);
    await setAssigned(asUser, planId, bucketId, '2026-05', 5_000n);
    const transactionId = await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId,
      direction: 'DBIT',
      amount: { amountMinor: 1_000n, currency: 'EUR' },
      bookingDate: '2026-06-15',
      description: 'Groceries',
      categoryId,
    });
    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await asUser.mutation(api.banking.manualTransactions.updateManualTransaction, {
      transactionId,
      direction: 'DBIT',
      amount: { amountMinor: 1_000n, currency: 'EUR' },
      bookingDate: '2026-07-15',
      description: 'Groceries',
      categoryId,
    });
    const remainingPeriods = await t.run(async (ctx) =>
      (
        await ctx.db
          .query('planMonthSnapshots')
          .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
          .take(20)
      ).map((snapshot) => snapshot.period),
    );
    const june = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-06' });
    const july = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-07' });
    const juneGroceries = june.groups.flatMap((group) => group.buckets).find((bucket) => bucket.bucketId === bucketId)!;
    const julyGroceries = july.groups.flatMap((group) => group.buckets).find((bucket) => bucket.bucketId === bucketId)!;

    expect(remainingPeriods).toEqual(['2026-05']);
    expect(juneGroceries).toMatchObject({ carryInMinor: 5_000n, activityMinor: 0n, availableMinor: 5_000n });
    expect(june.liquidityMinor).toBe(10_000n);
    expect(june.readyToAssignMinor).toBe(5_000n);
    expect(julyGroceries).toMatchObject({ carryInMinor: 5_000n, activityMinor: -1_000n, availableMinor: 4_000n });
    expect(july.liquidityMinor).toBe(9_000n);
    expect(july.readyToAssignMinor).toBe(5_000n);
  });

  test('matches a cold computation when the newest seed snapshot has a two-month gap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_snapshot_gap_user';
    await seedAuthKitUser(t, userId);
    const categoryId = await seedCategory(t, userId, 'Groceries');
    const accountId = await seedAccount(t, userId, 'Checking');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    const bucketId = await bucketForCategory(t, planId, categoryId);
    await setAssigned(asUser, planId, bucketId, '2026-05', 5_000n);
    for (const [period, amountMinor] of [
      ['2026-06', 100n],
      ['2026-07', 200n],
      ['2026-08', 300n],
    ] as const) {
      await seedTransaction(t, userId, {
        accountId,
        categoryId,
        period,
        amountMinor,
        dedupeKey: `gap_${period}`,
      });
    }
    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => {
      for (const period of ['2026-06', '2026-07']) {
        const snapshot = await ctx.db
          .query('planMonthSnapshots')
          .withIndex('by_planId_and_period', (q) => q.eq('planId', planId).eq('period', period))
          .unique();
        if (snapshot) await ctx.db.delete('planMonthSnapshots', snapshot._id);
      }
    });

    const warm = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-08' });
    const maySnapshot = await t.run(async (ctx) =>
      ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId).eq('period', '2026-05'))
        .unique(),
    );
    await t.run(async (ctx) => {
      const snapshots = await ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
        .take(20);
      await Promise.all(snapshots.map((snapshot) => ctx.db.delete('planMonthSnapshots', snapshot._id)));
    });
    const cold = await asUser.query(api.banking.planRead.getPlanMonth, { planId, period: '2026-08' });

    expect(maySnapshot).not.toBeNull();
    expect(warm).toEqual(cold);
    expect(warm.truncated).toBe(false);
  });

  test('skips a truncated snapshot without stopping a later cache write', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_truncated_snapshot_chain_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    await seedBalance(t, userId, accountId, 10_000n);
    const { planId } = await createPlan(t, userId, 'Main plan', [accountId]);

    await t.run(async (ctx) => {
      await ctx.db.insert('planMonthSnapshots', {
        planId,
        userId,
        period: '2026-06',
        entries: [],
        computedAtMs: 1,
      });
    });
    for (let offset = 0; offset < 5_001; offset += 500) {
      const count = Math.min(500, 5_001 - offset);
      await t.run(async (ctx) => {
        const account = await ctx.db.get('financialAccounts', accountId);
        if (!account?.providerConnectionId) throw new Error('Transaction account setup failed');
        await Promise.all(
          Array.from({ length: count }, async (_, index) => {
            const row = offset + index;
            await ctx.db.insert('transactions', {
              userId,
              accountId,
              providerConnectionId: account.providerConnectionId!,
              provider: 'manual',
              dedupeKey: `truncated_may_${row}`,
              status: 'BOOK',
              direction: 'DBIT',
              amount: { amountMinor: 1n, currency: 'EUR' },
              bookingDate: '2026-05-15',
              description: `May row ${row}`,
              classificationKind: 'uncategorized',
              classificationSource: 'system',
              importedAtMs: Date.now(),
              updatedAtMs: Date.now(),
            });
          }),
        );
      });
    }

    const result = await t.mutation(internal.banking.planRead.recomputePlanSnapshots, {
      planId,
      fromPeriod: '2026-05',
      limit: 3,
    });
    const snapshots = await t.run(async (ctx) =>
      ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
        .take(10),
    );
    const may = snapshots.find((snapshot) => snapshot.period === '2026-05');
    const june = snapshots.find((snapshot) => snapshot.period === '2026-06');
    const july = snapshots.find((snapshot) => snapshot.period === '2026-07');

    expect(may).toBeUndefined();
    expect(june?.computedAtMs).toBe(1);
    expect(july).toBeDefined();
    expect(result).toEqual({ period: '2026-07', truncated: true });
    expect(july).not.toHaveProperty('readyToAssignEndMinor');
    expect(july).not.toHaveProperty('cashOverspendingMinor');
    expect(july?.entries.every((entry) => entry.coveredCardSpendMinor === undefined)).toBe(true);
  });

  test('removes snapshots for the current and previous periods during recomputation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    const t = createTest();
    const userId = 'plan_read_snapshot_stability_user';
    await seedAuthKitUser(t, userId);
    const accountId = await seedAccount(t, userId, 'Checking');
    const { asUser, planId } = await createPlan(t, userId, 'Main plan', [accountId]);
    await t.run(async (ctx) => {
      for (const period of ['2026-08', '2026-09']) {
        await ctx.db.insert('planMonthSnapshots', {
          planId,
          userId,
          period,
          entries: [],
          readyToAssignEndMinor: 0n,
          cashOverspendingMinor: 0n,
          computedAtMs: Date.now(),
        });
      }
    });

    await asUser.mutation(api.banking.planRead.recalculatePlan, { planId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const snapshotPeriods = await t.run(async (ctx) =>
      (
        await ctx.db
          .query('planMonthSnapshots')
          .withIndex('by_planId_and_period', (q) => q.eq('planId', planId))
          .take(20)
      ).map((snapshot) => snapshot.period),
    );

    expect(snapshotPeriods).toContain('2026-07');
    expect(snapshotPeriods).not.toContain('2026-08');
    expect(snapshotPeriods).not.toContain('2026-09');
    expect(snapshotPeriods.every((period) => period <= '2026-07')).toBe(true);
  });
});
