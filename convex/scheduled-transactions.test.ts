/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './banking/*.ts', './lib/*.ts']);

const TODAY = '2026-07-15';
const FUTURE = '2026-07-20';

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthKitUser(t: TestHarness, userId: string) {
  const timestamp = '2026-01-01T00:00:00.000Z';
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

const userId = 'user_scheduled';

async function seedFixture(t: TestHarness) {
  await seedAuthKitUser(t, userId);
  const asUser = t.withIdentity({ subject: userId });
  const manualAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
    name: 'Contanti',
    accountType: 'CACC',
    currency: 'EUR',
  });

  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const groceriesCategoryId = await ctx.db.insert('categories', {
      userId,
      name: 'Groceries',
      systemKey: 'expense:groceries',
      kind: 'expense',
      budgetEligible: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const linkedAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'checking',
      name: 'Checking',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { groceriesCategoryId, linkedAccountId, providerConnectionId };
  });

  return { asUser, manualAccountId, ...seeded };
}

async function balanceSnapshots(t: TestHarness, accountId: Id<'financialAccounts'>) {
  return await t.run(async (ctx) =>
    ctx.db
      .query('accountBalances')
      .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', accountId))
      .take(20),
  );
}

async function latestBalanceMinor(t: TestHarness, accountId: Id<'financialAccounts'>) {
  const snapshots = await balanceSnapshots(t, accountId);
  return snapshots.at(-1)?.amount.amountMinor;
}

function useFixedToday(isoDate = TODAY) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${isoDate}T12:00:00.000Z`));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('a future booking date makes a manual transaction scheduled', () => {
  test('writes SCHD and leaves the balance untouched', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);

    const scheduledId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.manualAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 12_000n, currency: 'EUR' },
      bookingDate: FUTURE,
      description: 'Affitto agosto',
      categoryId: fixture.groceriesCategoryId,
    });

    const scheduled = await t.run(async (ctx) => ctx.db.get('transactions', scheduledId));
    expect(scheduled).toMatchObject({ status: 'SCHD', provider: 'manual', classificationKind: 'expense' });
    // Only the opening zero snapshot every manual account is created with.
    expect(await balanceSnapshots(t, fixture.manualAccountId)).toHaveLength(1);
    expect(await latestBalanceMinor(t, fixture.manualAccountId)).toBe(0n);
  });

  test('today and earlier still book and move the balance', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);

    const todayId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.manualAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 2_500n, currency: 'EUR' },
      bookingDate: TODAY,
      description: 'Spesa di oggi',
    });

    expect(await t.run(async (ctx) => (await ctx.db.get('transactions', todayId))?.status)).toBe('BOOK');
    expect(await latestBalanceMinor(t, fixture.manualAccountId)).toBe(-2_500n);
  });

  test('keeps a scheduled charge out of the spending breakdown until it is promoted', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);
    await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.manualAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 12_000n, currency: 'EUR' },
      bookingDate: FUTURE,
      description: 'Spesa programmata',
      categoryId: fixture.groceriesCategoryId,
    });

    expect(await fixture.asUser.query(api.banking.transactions.getSpendingByCategory, { period: '2026-07' })).toEqual(
      [],
    );

    vi.setSystemTime(new Date(`${FUTURE}T12:00:00.000Z`));
    await t.mutation(internal.banking.scheduledTransactions.promoteDueScheduledTransactions, {});

    const spending = await fixture.asUser.query(api.banking.transactions.getSpendingByCategory, { period: '2026-07' });
    expect(spending).toMatchObject([{ categoryId: fixture.groceriesCategoryId, amount: { amountMinor: 12_000n } }]);
  });

  test('an edit that pushes a booked row into the future un-applies its balance effect', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);
    const transactionId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.manualAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 2_500n, currency: 'EUR' },
      bookingDate: TODAY,
      description: 'Spesa di oggi',
    });
    expect(await latestBalanceMinor(t, fixture.manualAccountId)).toBe(-2_500n);

    vi.advanceTimersByTime(1);
    await fixture.asUser.mutation(api.banking.manualTransactions.updateManualTransaction, {
      transactionId,
      direction: 'DBIT',
      amount: { amountMinor: 2_500n, currency: 'EUR' },
      bookingDate: FUTURE,
      description: 'Spesa rimandata',
    });

    expect(await t.run(async (ctx) => (await ctx.db.get('transactions', transactionId))?.status)).toBe('SCHD');
    expect(await latestBalanceMinor(t, fixture.manualAccountId)).toBe(0n);
  });
});

describe('linked accounts accept scheduled transactions only', () => {
  test('accepts a future-dated row and refuses a booked one, without touching the bank balance', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);

    const scheduledId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.linkedAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 45_000n, currency: 'EUR' },
      bookingDate: FUTURE,
      description: 'Bolletta luce',
    });
    expect(await t.run(async (ctx) => (await ctx.db.get('transactions', scheduledId))?.status)).toBe('SCHD');
    expect(await balanceSnapshots(t, fixture.linkedAccountId)).toHaveLength(0);

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
        accountId: fixture.linkedAccountId,
        direction: 'DBIT',
        amount: { amountMinor: 45_000n, currency: 'EUR' },
        bookingDate: TODAY,
        description: 'Gia pagata',
      }),
    ).rejects.toThrow('a linked account only accepts scheduled ones');
  });
});

describe('promoteDueScheduledTransactions', () => {
  test('promotes on the due date, moves the balance exactly then, and only once', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);
    const scheduledId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.manualAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 12_000n, currency: 'EUR' },
      bookingDate: FUTURE,
      description: 'Affitto',
    });

    // Not due yet.
    expect(await t.mutation(internal.banking.scheduledTransactions.promoteDueScheduledTransactions, {})).toEqual({
      promoted: 0,
    });
    expect(await balanceSnapshots(t, fixture.manualAccountId)).toHaveLength(1);

    vi.setSystemTime(new Date(`${FUTURE}T12:00:00.000Z`));
    expect(await t.mutation(internal.banking.scheduledTransactions.promoteDueScheduledTransactions, {})).toEqual({
      promoted: 1,
    });
    expect(await t.run(async (ctx) => (await ctx.db.get('transactions', scheduledId))?.status)).toBe('BOOK');
    expect(await latestBalanceMinor(t, fixture.manualAccountId)).toBe(-12_000n);

    // Re-running the cron must not charge the account a second time.
    vi.advanceTimersByTime(1);
    expect(await t.mutation(internal.banking.scheduledTransactions.promoteDueScheduledTransactions, {})).toEqual({
      promoted: 0,
    });
    expect(await balanceSnapshots(t, fixture.manualAccountId)).toHaveLength(2);
    expect(await latestBalanceMinor(t, fixture.manualAccountId)).toBe(-12_000n);
  });

  test('never promotes a scheduled row on a linked account', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);
    const scheduledId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.linkedAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 45_000n, currency: 'EUR' },
      bookingDate: FUTURE,
      description: 'Bolletta luce',
    });

    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    expect(await t.mutation(internal.banking.scheduledTransactions.promoteDueScheduledTransactions, {})).toEqual({
      promoted: 0,
    });
    expect(await t.run(async (ctx) => (await ctx.db.get('transactions', scheduledId))?.status)).toBe('SCHD');
    expect(await balanceSnapshots(t, fixture.linkedAccountId)).toHaveLength(0);
  });
});

async function seedScheduledAndBooked(t: TestHarness, fixture: Awaited<ReturnType<typeof seedFixture>>) {
  const scheduledId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
    accountId: fixture.linkedAccountId,
    direction: 'DBIT',
    amount: { amountMinor: 45_000n, currency: 'EUR' },
    bookingDate: FUTURE,
    description: 'Bolletta luce',
    categoryId: fixture.groceriesCategoryId,
  });

  const { bookedId, tagId } = await t.run(async (ctx) => {
    const now = Date.now();
    const insertedTagId = await ctx.db.insert('transactionTags', {
      userId,
      name: 'Utenze',
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.patch('transactions', scheduledId, { note: 'Domiciliazione Enel', tagIds: [insertedTagId] });
    const insertedBookedId = await ctx.db.insert('transactions', {
      userId,
      accountId: fixture.linkedAccountId,
      providerConnectionId: fixture.providerConnectionId,
      provider: 'mock',
      dedupeKey: 'mock|enel-july',
      status: 'BOOK',
      direction: 'DBIT',
      amount: { amountMinor: 45_120n, currency: 'EUR' },
      bookingDate: '2026-07-21',
      description: 'ENEL ENERGIA SPA',
      classificationKind: 'uncategorized',
      classificationSource: 'provider',
      importedAtMs: now,
      updatedAtMs: now,
    });
    return { bookedId: insertedBookedId, tagId: insertedTagId };
  });

  return { scheduledId, bookedId, tagId };
}

describe('reconcileScheduledTransaction', () => {
  test('offers the booked row that arrived as a candidate', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);
    const { scheduledId, bookedId } = await seedScheduledAndBooked(t, fixture);

    const candidates = await fixture.asUser.query(
      api.banking.scheduledTransactions.listScheduledReconciliationCandidates,
      { scheduledTransactionId: scheduledId },
    );

    expect(candidates).toMatchObject([
      { transactionId: bookedId, bookingDate: '2026-07-21', amountDeltaMinor: 120n, dayDelta: 1 },
    ]);
  });

  test('keeps the booked row, carries the intent over, and leaves no scheduled row behind', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);
    const { scheduledId, bookedId, tagId } = await seedScheduledAndBooked(t, fixture);

    const result = await fixture.asUser.mutation(api.banking.scheduledTransactions.reconcileScheduledTransaction, {
      scheduledTransactionId: scheduledId,
      bookedTransactionId: bookedId,
    });
    expect(result).toBe(bookedId);

    const [booked, scheduled] = await t.run(async (ctx) => [
      await ctx.db.get('transactions', bookedId),
      await ctx.db.get('transactions', scheduledId),
    ]);

    expect(scheduled).toBeNull();
    expect(booked).toMatchObject({
      _id: bookedId,
      status: 'BOOK',
      dedupeKey: 'mock|enel-july',
      amount: { amountMinor: 45_120n, currency: 'EUR' },
      categoryId: fixture.groceriesCategoryId,
      classificationKind: 'expense',
      note: 'Domiciliazione Enel',
      tagIds: [tagId],
    });
  });

  test('never overwrites what the booked row already decided for itself', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);
    const { scheduledId, bookedId } = await seedScheduledAndBooked(t, fixture);
    const ownCategoryId = await t.run(async (ctx) => {
      const now = Date.now();
      const categoryId = await ctx.db.insert('categories', {
        userId,
        name: 'Utilities',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.patch('transactions', bookedId, {
        categoryId,
        classificationKind: 'expense',
        note: 'Nota della banca',
      });
      return categoryId;
    });

    await fixture.asUser.mutation(api.banking.scheduledTransactions.reconcileScheduledTransaction, {
      scheduledTransactionId: scheduledId,
      bookedTransactionId: bookedId,
    });

    expect(await t.run(async (ctx) => ctx.db.get('transactions', bookedId))).toMatchObject({
      categoryId: ownCategoryId,
      note: 'Nota della banca',
    });
  });

  test('rejects a mismatched pair', async () => {
    useFixedToday();
    const t = createTest();
    const fixture = await seedFixture(t);
    const { scheduledId, bookedId } = await seedScheduledAndBooked(t, fixture);
    const otherAccountBookedId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert('transactions', {
        userId,
        accountId: fixture.manualAccountId,
        providerConnectionId: fixture.providerConnectionId,
        provider: 'manual',
        dedupeKey: 'manual|elsewhere',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 45_000n, currency: 'EUR' },
        bookingDate: '2026-07-21',
        description: 'Elsewhere',
        classificationKind: 'expense',
        classificationSource: 'user',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(
      fixture.asUser.mutation(api.banking.scheduledTransactions.reconcileScheduledTransaction, {
        scheduledTransactionId: bookedId,
        bookedTransactionId: bookedId,
      }),
    ).rejects.toThrow('cannot be reconciled against itself');
    await expect(
      fixture.asUser.mutation(api.banking.scheduledTransactions.reconcileScheduledTransaction, {
        scheduledTransactionId: bookedId,
        bookedTransactionId: scheduledId,
      }),
    ).rejects.toThrow('not scheduled');
    await expect(
      fixture.asUser.mutation(api.banking.scheduledTransactions.reconcileScheduledTransaction, {
        scheduledTransactionId: scheduledId,
        bookedTransactionId: otherAccountBookedId,
      }),
    ).rejects.toThrow('same account');

    const otherUserId = 'user_scheduled_other';
    await seedAuthKitUser(t, otherUserId);
    await expect(
      t.withIdentity({ subject: otherUserId }).mutation(
        api.banking.scheduledTransactions.reconcileScheduledTransaction,
        { scheduledTransactionId: scheduledId, bookedTransactionId: bookedId },
      ),
    ).rejects.toThrow('Transaction not found');
  });
});
