/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test, vi } from 'vitest';
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

const userId = 'user_test';

async function seedFixture(t: TestHarness, options?: { trackedAmountMinor?: bigint }) {
  await seedAuthKitUser(t, userId);
  const asUser = t.withIdentity({ subject: userId });

  const cardAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
    name: 'Acme Flex',
    accountType: 'CARD',
    currency: 'EUR',
  });
  await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
    accountId: cardAccountId,
    direction: 'DBIT',
    amount: { amountMinor: 203193n, currency: 'EUR' },
    bookingDate: '2026-06-15',
    description: 'Saldo iniziale carta',
    classificationKind: 'internal',
  });

  const seeded = await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const checkingAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'acme_checking',
      name: 'Acme Bank',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const cardFacilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: 'AcmeCard Flex Classic',
      facilityType: 'cardCreditLine',
      status: 'active',
      source: 'manual',
      linkedAccountId: cardAccountId,
      settlementAccountId: checkingAccountId,
      provider: 'manual',
      limitAmount: { amountMinor: 250000n, currency: 'EUR' },
      usedAmount: { amountMinor: 0n, currency: 'EUR' },
      repaymentType: 'statementBalance',
      paymentDayOfMonth: 7,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const usageCycleId = await ctx.db.insert('creditFacilityUsageCycles', {
      userId,
      creditFacilityId: cardFacilityId,
      cycleMonth: '2026-06',
      status: 'scheduled',
      trackedAmount: { amountMinor: options?.trackedAmountMinor ?? 203193n, currency: 'EUR' },
      dueDate: '2026-07-07',
      closedAtMs: now,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const settlementDebitId = await ctx.db.insert('transactions', {
      userId,
      accountId: checkingAccountId,
      providerConnectionId,
      provider: 'mock',
      dedupeKey: 'card_statement_payment',
      status: 'BOOK',
      direction: 'DBIT',
      amount: { amountMinor: 203193n, currency: 'EUR' },
      bookingDate: '2026-07-07',
      description: 'PAGAMENTO PER UTILIZZO CARTE DI CREDITO',
      classificationKind: 'expense',
      classificationSource: 'system',
      importedAtMs: now,
      updatedAtMs: now,
    });
    return { checkingAccountId, cardFacilityId, usageCycleId, settlementDebitId };
  });

  return { asUser, cardAccountId, ...seeded };
}

async function createSettlementCardLeg(
  t: TestHarness,
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  bookingDate = '2026-07-07',
) {
  // The card-side CRDT leg auto-matches the imported checking DBIT (same
  // amount -> confidence 0.9 >= auto-confirm threshold).
  return await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
    accountId: fixture.cardAccountId,
    direction: 'CRDT',
    amount: { amountMinor: 203193n, currency: 'EUR' },
    bookingDate,
    description: 'Pagamento estratto conto',
  });
}

async function ensureSettlementTransfer(
  t: TestHarness,
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  cardLegId: Id<'transactions'>,
) {
  const cardLeg = await t.run(async (ctx) => await ctx.db.get('transactions', cardLegId));
  if (!cardLeg?.transferMatchId) {
    await fixture.asUser.mutation(api.banking.transfers.createManualTransferMatch, {
      outgoingTransactionId: fixture.settlementDebitId,
      incomingTransactionId: cardLegId,
    });
  }
}

async function seedCardPaymentPlan(t: TestHarness, fixture: Awaited<ReturnType<typeof seedFixture>>) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const planId = await ctx.db.insert('plans', {
      userId,
      name: 'July plan',
      currency: 'EUR',
      startPeriod: '2026-07',
      accountIds: [fixture.checkingAccountId, fixture.cardAccountId],
      isDefault: true,
      sortOrder: 0,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const groupId = await ctx.db.insert('planGroups', {
      planId,
      userId,
      name: 'Credit cards',
      sortOrder: 0,
      collapsed: false,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const cardBucketId = await ctx.db.insert('planBuckets', {
      planId,
      userId,
      groupId,
      name: 'Acme Flex',
      sortOrder: 0,
      hidden: false,
      isUnplanned: false,
      cardAccountId: fixture.cardAccountId,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('planBuckets', {
      planId,
      userId,
      groupId,
      name: 'Not planned',
      sortOrder: 1,
      hidden: false,
      isUnplanned: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('planAssignments', {
      planId,
      userId,
      bucketId: cardBucketId,
      period: '2026-07',
      assignedMinor: 203193n,
      currency: 'EUR',
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { planId, cardBucketId };
  });
}

async function setCardBalanceSnapshot(
  t: TestHarness,
  fixture: Pick<Awaited<ReturnType<typeof seedFixture>>, 'cardAccountId'>,
  amountMinor: bigint,
  referenceDate?: string,
) {
  await t.run(async (ctx) => {
    const account = await ctx.db.get('financialAccounts', fixture.cardAccountId);
    if (!account?.providerConnectionId) throw new Error('Card fixture is missing its provider connection');
    await ctx.db.insert('accountBalances', {
      userId: account.userId,
      accountId: account._id,
      providerConnectionId: account.providerConnectionId,
      provider: 'manual',
      balanceType: 'closingBooked',
      amount: { amountMinor, currency: 'EUR' },
      referenceDate,
      fetchedAtMs: Date.now(),
    });
  });
}

async function seedProviderCardFixture(t: TestHarness) {
  const providerUserId = 'user_provider_card';
  await seedAuthKitUser(t, providerUserId);
  const seeded = await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId: providerUserId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const checkingAccountId = await ctx.db.insert('financialAccounts', {
      userId: providerUserId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'provider_checking',
      name: 'Provider checking',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const cardAccountId = await ctx.db.insert('financialAccounts', {
      userId: providerUserId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'provider_card',
      name: 'Provider card',
      accountType: 'CARD',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const syncStateId = await ctx.db.insert('accountSyncStates', {
      userId: providerUserId,
      providerConnectionId,
      accountId: cardAccountId,
      provider: 'mock',
      status: 'active',
      backfillFromDate: '2026-01-01',
      nextSyncAfterMs: now,
      syncCadenceHours: 6,
      consecutiveFailures: 0,
      updatedAtMs: now,
    });
    await ctx.db.insert('accountBalances', {
      userId: providerUserId,
      accountId: cardAccountId,
      providerConnectionId,
      provider: 'mock',
      balanceType: 'closingBooked',
      amount: { amountMinor: -203193n, currency: 'EUR' },
      referenceDate: '2026-07-07',
      fetchedAtMs: now,
    });
    const cardFacilityId = await ctx.db.insert('creditFacilities', {
      userId: providerUserId,
      name: 'Provider card facility',
      facilityType: 'cardCreditLine',
      status: 'active',
      source: 'provider',
      linkedAccountId: cardAccountId,
      settlementAccountId: checkingAccountId,
      provider: 'mock',
      limitAmount: { amountMinor: 250000n, currency: 'EUR' },
      usedAmount: { amountMinor: 0n, currency: 'EUR' },
      repaymentType: 'statementBalance',
      paymentDayOfMonth: 7,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const usageCycleId = await ctx.db.insert('creditFacilityUsageCycles', {
      userId: providerUserId,
      creditFacilityId: cardFacilityId,
      cycleMonth: '2026-06',
      status: 'scheduled',
      trackedAmount: { amountMinor: 203193n, currency: 'EUR' },
      dueDate: '2026-07-07',
      closedAtMs: now,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const settlementDebitId = await ctx.db.insert('transactions', {
      userId: providerUserId,
      accountId: checkingAccountId,
      providerConnectionId,
      provider: 'mock',
      providerTransactionId: 'cash_statement_debit',
      dedupeKey: 'cash_statement_debit',
      status: 'BOOK',
      direction: 'DBIT',
      amount: { amountMinor: 203193n, currency: 'EUR' },
      bookingDate: '2026-07-07',
      description: 'PAGAMENTO PER UTILIZZO CARTA',
      classificationKind: 'expense',
      classificationSource: 'system',
      importedAtMs: now,
      updatedAtMs: now,
    });
    return {
      cardAccountId,
      providerConnectionId,
      settlementDebitId,
      syncStateId,
      usageCycleId,
    };
  });
  return { asUser: t.withIdentity({ subject: providerUserId }), userId: providerUserId, ...seeded };
}

describe('explicit card statement payment registration', () => {
  test('keeps a later-dated manual balance unchanged while creating the leg and paying the cycle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00.000Z'));
    try {
      const t = createTest();
      const fixture = await seedFixture(t);
      await setCardBalanceSnapshot(t, fixture, -120_000n, '2026-07-27');

      const candidates = await fixture.asUser.query(api.banking.credit.listCardStatementPaymentCandidates, {
        cardAccountId: fixture.cardAccountId,
        period: '2026-07',
      });
      expect(candidates.candidates).toMatchObject([
        {
          transaction: { _id: fixture.settlementDebitId },
          balanceEffect: {
            currentAmount: { amountMinor: -120_000n, currency: 'EUR' },
            resultingAmount: { amountMinor: -120_000n, currency: 'EUR' },
            balanceWillChange: false,
            reason: 'alreadyIncluded',
          },
        },
      ]);

      const result = await fixture.asUser.mutation(api.banking.credit.registerCardStatementPayment, {
        cardAccountId: fixture.cardAccountId,
        transactionId: fixture.settlementDebitId,
      });
      const stored = await t.run(async (ctx) => {
        const balances = await ctx.db
          .query('accountBalances')
          .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', fixture.cardAccountId))
          .order('desc')
          .take(10);
        return {
          synthetic: await ctx.db.get('transactions', result.syntheticTransactionId),
          cycle: await ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId),
          latestBalance: balances[0],
        };
      });

      expect(stored.synthetic).toMatchObject({
        accountId: fixture.cardAccountId,
        direction: 'CRDT',
        classificationKind: 'transfer',
      });
      expect(stored.cycle).toMatchObject({
        status: 'paid',
        transactionId: result.syntheticTransactionId,
      });
      expect(stored.latestBalance.amount.amountMinor).toBe(-120_000n);
    } finally {
      vi.useRealTimers();
    }
  });

  test('updates a manual balance whose reference date precedes the payment and keeps the bucket funded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00.000Z'));
    try {
      const t = createTest();
      const fixture = await seedFixture(t);
      await setCardBalanceSnapshot(t, fixture, -203_193n, '2026-07-01');
      const { planId, cardBucketId } = await seedCardPaymentPlan(t, fixture);

      const candidates = await fixture.asUser.query(api.banking.credit.listCardStatementPaymentCandidates, {
        cardAccountId: fixture.cardAccountId,
        period: '2026-07',
      });
      expect(candidates.candidates[0]?.balanceEffect).toEqual({
        currentAmount: { amountMinor: -203_193n, currency: 'EUR' },
        resultingAmount: { amountMinor: 0n, currency: 'EUR' },
        balanceWillChange: true,
        reason: 'applied',
      });

      const result = await fixture.asUser.mutation(api.banking.credit.registerCardStatementPayment, {
        cardAccountId: fixture.cardAccountId,
        transactionId: fixture.settlementDebitId,
      });
      const stored = await t.run(async (ctx) => {
        const balances = await ctx.db
          .query('accountBalances')
          .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', fixture.cardAccountId))
          .order('desc')
          .take(1);
        return {
          synthetic: await ctx.db.get('transactions', result.syntheticTransactionId),
          outgoing: await ctx.db.get('transactions', fixture.settlementDebitId),
          match: await ctx.db.get('transferMatches', result.transferMatchId),
          cycle: await ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId),
          latestBalance: balances[0],
        };
      });
      const month = await fixture.asUser.query(api.banking.planRead.getPlanMonth, {
        planId,
        period: '2026-07',
      });
      const bucket = month.groups
        .flatMap((group) => group.buckets)
        .find((candidate) => candidate.bucketId === cardBucketId);

      expect(stored.synthetic).toMatchObject({
        accountId: fixture.cardAccountId,
        direction: 'CRDT',
        classificationKind: 'transfer',
        transferMatchId: result.transferMatchId,
      });
      expect(stored.outgoing).toMatchObject({
        classificationKind: 'transfer',
        transferMatchId: result.transferMatchId,
      });
      expect(stored.match).toMatchObject({
        status: 'confirmed',
        outgoingTransactionId: fixture.settlementDebitId,
        incomingTransactionId: result.syntheticTransactionId,
      });
      expect(stored.cycle).toMatchObject({
        status: 'paid',
        transactionId: result.syntheticTransactionId,
      });
      expect(stored.latestBalance.amount.amountMinor).toBe(0n);
      expect(bucket).toMatchObject({
        activityMinor: -203193n,
        availableMinor: 0n,
        cardDebtMinor: 0n,
        underfundedMinor: 0n,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('keeps the legacy balance update when the latest manual snapshot has no reference date', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await setCardBalanceSnapshot(t, fixture, -203_193n);

    const result = await fixture.asUser.mutation(api.banking.credit.registerCardStatementPayment, {
      cardAccountId: fixture.cardAccountId,
      transactionId: fixture.settlementDebitId,
    });
    const latestBalance = await t.run(async (ctx) => {
      const balances = await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', fixture.cardAccountId))
        .order('desc')
        .take(1);
      return balances[0];
    });

    expect(result.syntheticTransactionId).toBeDefined();
    expect(latestBalance.amount.amountMinor).toBe(0n);
  });

  test('rejects a registration that would make the manual card balance positive', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await setCardBalanceSnapshot(t, fixture, -120_000n, '2026-07-01');

    await expect(
      fixture.asUser.mutation(api.banking.credit.registerCardStatementPayment, {
        cardAccountId: fixture.cardAccountId,
        transactionId: fixture.settlementDebitId,
      }),
    ).rejects.toThrow('Card statement payment would make the card balance positive');

    const stored = await t.run(async (ctx) => {
      const synthetic = await ctx.db
        .query('transactions')
        .withIndex('by_accountId_and_dedupeKey', (q) =>
          q
            .eq('accountId', fixture.cardAccountId)
            .eq('dedupeKey', `tracky|card-statement|${fixture.settlementDebitId}`),
        )
        .unique();
      const balances = await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', fixture.cardAccountId))
        .order('desc')
        .take(1);
      return {
        synthetic,
        latestBalance: balances[0],
        cycle: await ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId),
      };
    });
    expect(stored.synthetic).toBeNull();
    expect(stored.latestBalance.amount.amountMinor).toBe(-120_000n);
    expect(stored.cycle?.status).toBe('scheduled');
  });

  test('closes the previous card month through closeUsageCycleCore when no scheduled cycle exists', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.delete('creditFacilityUsageCycles', fixture.usageCycleId);
    });

    const candidates = await fixture.asUser.query(api.banking.credit.listCardStatementPaymentCandidates, {
      cardAccountId: fixture.cardAccountId,
      period: '2026-07',
    });
    expect(candidates.candidates).toMatchObject([
      {
        transaction: { _id: fixture.settlementDebitId },
        requiresCycleClose: true,
      },
    ]);

    const result = await fixture.asUser.mutation(api.banking.credit.registerCardStatementPayment, {
      cardAccountId: fixture.cardAccountId,
      transactionId: fixture.settlementDebitId,
    });
    const cycles = await t.run(async (ctx) =>
      ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_creditFacilityId_and_cycleMonth', (q) => q.eq('creditFacilityId', fixture.cardFacilityId))
        .take(10),
    );
    expect(cycles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: result.usageCycleId,
          cycleMonth: '2026-06',
          status: 'paid',
          transactionId: result.syntheticTransactionId,
        }),
        expect.objectContaining({ cycleMonth: '2026-07', status: 'open' }),
      ]),
    );
  });

  test('closes the missing cycle against the payment, not against a card that has moved on', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.delete('creditFacilityUsageCycles', fixture.usageCycleId);
    });
    // The June statement of 2.031,93 is being settled in July, by which point the card carries the
    // current month's purchases instead. Closing the cycle on today's usage could never match.
    await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'CRDT',
      amount: { amountMinor: 83193n, currency: 'EUR' },
      bookingDate: '2026-07-02',
      description: 'Rimborso',
      classificationKind: 'internal',
    });

    const result = await fixture.asUser.mutation(api.banking.credit.registerCardStatementPayment, {
      cardAccountId: fixture.cardAccountId,
      transactionId: fixture.settlementDebitId,
    });

    const cycle = await t.run(async (ctx) => ctx.db.get('creditFacilityUsageCycles', result.usageCycleId));
    expect(cycle).toMatchObject({
      cycleMonth: '2026-06',
      status: 'paid',
      trackedAmount: { amountMinor: 203193n, currency: 'EUR' },
    });
  });

  test('rejects double registration of the same settlement debit', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await fixture.asUser.mutation(api.banking.credit.registerCardStatementPayment, {
      cardAccountId: fixture.cardAccountId,
      transactionId: fixture.settlementDebitId,
    });

    await expect(
      fixture.asUser.mutation(api.banking.credit.registerCardStatementPayment, {
        cardAccountId: fixture.cardAccountId,
        transactionId: fixture.settlementDebitId,
      }),
    ).rejects.toThrow('This transaction is already registered as a transfer');
  });

  test('replaces a synthetic provider-card leg when the real provider leg arrives', async () => {
    vi.useFakeTimers();
    const t = createTest();
    const fixture = await seedProviderCardFixture(t);
    const candidates = await fixture.asUser.query(api.banking.credit.listCardStatementPaymentCandidates, {
      cardAccountId: fixture.cardAccountId,
      period: '2026-07',
    });
    expect(candidates.candidates[0]?.balanceEffect).toEqual({
      currentAmount: { amountMinor: -203_193n, currency: 'EUR' },
      resultingAmount: { amountMinor: -203_193n, currency: 'EUR' },
      balanceWillChange: false,
      reason: 'providerManaged',
    });
    const registered = await fixture.asUser.mutation(api.banking.credit.registerCardStatementPayment, {
      cardAccountId: fixture.cardAccountId,
      transactionId: fixture.settlementDebitId,
    });
    const balancesAfterRegistration = await t.run((ctx) =>
      ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', fixture.cardAccountId))
        .take(10),
    );
    expect(balancesAfterRegistration).toHaveLength(1);
    expect(balancesAfterRegistration[0].amount.amountMinor).toBe(-203_193n);

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: fixture.cardAccountId,
      providerConnectionId: fixture.providerConnectionId,
      syncStateId: fixture.syncStateId,
      provider: 'mock',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'real_card_statement_credit',
          status: 'BOOK',
          credit_debit_indicator: 'CRDT',
          transaction_amount: { amount: '2031.93', currency: 'EUR' },
          booking_date: '2026-07-07',
          remittance_information: ['PAGAMENTO ESTRATTO CARTA'],
          note: null,
        },
      ],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const stored = await t.run(async (ctx) => {
      const cardTransactions = await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
          q.eq('userId', fixture.userId).eq('accountId', fixture.cardAccountId),
        )
        .take(20);
      const real = cardTransactions.find(
        (transaction) => transaction.providerTransactionId === 'real_card_statement_credit',
      );
      return {
        cardTransactions,
        real,
        synthetic: await ctx.db.get('transactions', registered.syntheticTransactionId),
        match: await ctx.db.get('transferMatches', registered.transferMatchId),
        cycle: await ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId),
      };
    });

    expect(stored.synthetic).toBeNull();
    expect(stored.cardTransactions).toHaveLength(1);
    expect(stored.real).toMatchObject({
      provider: 'mock',
      classificationKind: 'transfer',
      transferMatchId: registered.transferMatchId,
    });
    expect(stored.match?.incomingTransactionId).toBe(stored.real?._id);
    expect(stored.cycle).toMatchObject({ status: 'paid', transactionId: stored.real?._id });
    vi.useRealTimers();
  });
});

describe('card statement settlement via transfer matching', () => {
  test('auto-confirmed settlement transfer marks the scheduled cycle paid', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const cardLegId = await createSettlementCardLeg(t, fixture);

    const { cardLeg, checkingLeg, cycle } = await t.run(async (ctx) => ({
      cardLeg: await ctx.db.get('transactions', cardLegId),
      checkingLeg: await ctx.db.get('transactions', fixture.settlementDebitId),
      cycle: await ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId),
    }));

    expect(cardLeg?.classificationKind).toBe('transfer');
    expect(checkingLeg?.classificationKind).toBe('transfer');
    expect(cardLeg?.transferMatchId).toBeDefined();
    expect(checkingLeg?.transferMatchId).toBe(cardLeg?.transferMatchId);
    expect(cycle).toMatchObject({ status: 'paid', transactionId: cardLegId });
    expect(cycle?.paidAtMs).toBeTypeOf('number');
  });

  test('settlement restores the card balance and derived availability', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    await createSettlementCardLeg(t, fixture);

    const facilities = await fixture.asUser.query(api.banking.credit.listCreditFacilities, {});
    const cardFacility = facilities.find((facility) => facility._id === fixture.cardFacilityId);
    expect(cardFacility?.usedAmount.amountMinor).toBe(0n);
    expect(cardFacility?.summary.availableAmount.amountMinor).toBe(250000n);
  });

  test('cycles far outside the amount tolerance stay scheduled', async () => {
    const t = createTest();
    const fixture = await seedFixture(t, { trackedAmountMinor: 500000n });

    await createSettlementCardLeg(t, fixture);

    const cycle = await t.run(async (ctx) => await ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId));
    expect(cycle?.status).toBe('scheduled');
    expect(cycle?.transactionId).toBeUndefined();
  });

  test('settles the same-amount cycle closest to the transfer date', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const laterCycleId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      return await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId: fixture.cardFacilityId,
        cycleMonth: '2026-07',
        status: 'scheduled',
        trackedAmount: { amountMinor: 203193n, currency: 'EUR' },
        dueDate: '2026-08-07',
        closedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const cardLegId = await createSettlementCardLeg(t, fixture, '2026-08-06');
    await ensureSettlementTransfer(t, fixture, cardLegId);

    const [earlierCycle, laterCycle] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId),
        ctx.db.get('creditFacilityUsageCycles', laterCycleId),
      ]),
    );
    expect(earlierCycle?.status).toBe('scheduled');
    expect(laterCycle).toMatchObject({ status: 'paid', transactionId: cardLegId });
  });

  test('does not settle a same-amount cycle outside the temporal window', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const cardLegId = await createSettlementCardLeg(t, fixture, '2026-09-30');
    await ensureSettlementTransfer(t, fixture, cardLegId);

    const cycle = await t.run(async (ctx) => await ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId));
    expect(cycle?.status).toBe('scheduled');
    expect(cycle?.transactionId).toBeUndefined();
  });

  test('manual confirm via createManualTransferMatch also settles the cycle', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    // Slightly different amount (fee) so the auto-confirm path is skipped and
    // the user matches by hand instead.
    const cardLegId = await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'CRDT',
      amount: { amountMinor: 202000n, currency: 'EUR' },
      bookingDate: '2026-07-09',
      description: 'Pagamento estratto conto',
    });
    const beforeCycle = await t.run(async (ctx) => await ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId));

    if (beforeCycle?.status === 'scheduled') {
      await ensureSettlementTransfer(t, fixture, cardLegId);
    }

    const cycle = await t.run(async (ctx) => await ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId));
    expect(cycle?.status).toBe('paid');
    expect(cycle?.transactionId).toBe(cardLegId);
  });
});

describe('legacy statement flow is disabled for CARD-linked facilities', () => {
  test('confirmUsageCyclePaymentTransaction rejects and candidates are hidden', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    await expect(
      fixture.asUser.mutation(api.banking.credit.confirmUsageCyclePaymentTransaction, {
        usageCycleId: fixture.usageCycleId,
        transactionId: fixture.settlementDebitId,
      }),
    ).rejects.toThrow('This card settles through transfer matching with its card account');

    const candidates = await fixture.asUser.query(api.banking.credit.listUsageCyclePaymentCandidates, {
      asOfDate: '2026-07-08',
    });
    expect(candidates.filter((candidate) => candidate.usageCycleId === fixture.usageCycleId)).toHaveLength(0);
  });
});
