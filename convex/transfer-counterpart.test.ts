/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { api, components } from './_generated/api';
import schema from './schema';
import { insertPlannedTransfer } from './plannedTransactionsTestHelpers';
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

async function seedFixture(t: TestHarness) {
  await seedAuthKitUser(t, userId);
  const asUser = t.withIdentity({ subject: userId });
  const cardAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
    name: 'Acme Flex',
    accountType: 'CARD',
    currency: 'EUR',
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
    const acmeAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'acme_personal',
      name: 'Acme Personal',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const secondAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'acme_second',
      name: 'Acme Second',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { providerConnectionId, acmeAccountId, secondAccountId };
  });

  return { asUser, cardAccountId, ...seeded };
}

async function insertImportedTransaction(
  t: TestHarness,
  args: {
    accountId: Id<'financialAccounts'>;
    providerConnectionId: Id<'providerConnections'>;
    dedupeKey: string;
    direction: 'CRDT' | 'DBIT';
    amountMinor: bigint;
    bookingDate: string;
    description: string;
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 10);
    return await ctx.db.insert('transactions', {
      userId,
      accountId: args.accountId,
      providerConnectionId: args.providerConnectionId,
      provider: 'mock',
      dedupeKey: args.dedupeKey,
      status: 'BOOK',
      direction: args.direction,
      amount: { amountMinor: args.amountMinor, currency: 'EUR' },
      bookingDate: args.bookingDate,
      description: args.description,
      classificationKind: args.direction === 'CRDT' ? 'income' : 'expense',
      classificationSource: 'provider',
      importedAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function latestBalanceMinor(t: TestHarness, accountId: Id<'financialAccounts'>) {
  return await t.run(async (ctx) => {
    const snapshots = await ctx.db
      .query('accountBalances')
      .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', accountId))
      .order('desc')
      .take(1);
    return snapshots[0]?.amount.amountMinor;
  });
}

describe('createCounterpartTransfer', () => {
  test('creates the matching manual leg and confirms the transfer in one step', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const sourceId = await insertImportedTransaction(t, {
      accountId: fixture.acmeAccountId,
      providerConnectionId: fixture.providerConnectionId,
      dedupeKey: 'acme_topup',
      direction: 'CRDT',
      amountMinor: 5000n,
      bookingDate: '2026-07-10',
      description: 'Apple Pay Top-Up by *4242',
    });

    const result = await fixture.asUser.mutation(api.banking.manualTransactions.createCounterpartTransfer, {
      sourceTransactionId: sourceId,
      accountId: fixture.cardAccountId,
      amount: { amountMinor: 5000n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Acme Top-up',
    });

    expect(result.transferMatchId).toBeDefined();

    const { source, leg, match } = await t.run(async (ctx) => ({
      source: await ctx.db.get('transactions', sourceId),
      leg: await ctx.db.get('transactions', result.transactionId),
      match: await ctx.db.get('transferMatches', result.transferMatchId),
    }));

    expect(source?.classificationKind).toBe('transfer');
    expect(leg?.classificationKind).toBe('transfer');
    expect(source?.transferMatchId).toBe(result.transferMatchId);
    expect(leg?.transferMatchId).toBe(result.transferMatchId);
    expect(leg?.direction).toBe('DBIT');
    expect(leg?.accountId).toBe(fixture.cardAccountId);
    expect(match).toMatchObject({
      outgoingTransactionId: result.transactionId,
      incomingTransactionId: sourceId,
      status: 'confirmed',
      source: 'user',
    });

    expect(await latestBalanceMinor(t, fixture.cardAccountId)).toBe(-5000n);
  });

  test('does not let the auto-candidate hook steal a tempting third transaction', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const sourceId = await insertImportedTransaction(t, {
      accountId: fixture.acmeAccountId,
      providerConnectionId: fixture.providerConnectionId,
      dedupeKey: 'acme_topup',
      direction: 'CRDT',
      amountMinor: 5000n,
      bookingDate: '2026-07-10',
      description: 'Apple Pay Top-Up by *4242',
    });

    // Same amount, same date, different account: exactly what
    // createTransferCandidateForTransaction's auto-confirm heuristic (confidence
    // 0.9 for a same-amount same-day pair) would grab if it ran on the new leg.
    const decoyId = await insertImportedTransaction(t, {
      accountId: fixture.secondAccountId,
      providerConnectionId: fixture.providerConnectionId,
      dedupeKey: 'acme_topup_decoy',
      direction: 'CRDT',
      amountMinor: 5000n,
      bookingDate: '2026-07-10',
      description: 'Unrelated credit',
    });

    const result = await fixture.asUser.mutation(api.banking.manualTransactions.createCounterpartTransfer, {
      sourceTransactionId: sourceId,
      accountId: fixture.cardAccountId,
      amount: { amountMinor: 5000n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Acme Top-up',
    });

    const { match, decoy } = await t.run(async (ctx) => ({
      match: await ctx.db.get('transferMatches', result.transferMatchId),
      decoy: await ctx.db.get('transactions', decoyId),
    }));

    expect(match).toMatchObject({
      outgoingTransactionId: result.transactionId,
      incomingTransactionId: sourceId,
    });
    expect(decoy?.transferMatchId).toBeUndefined();
    expect(decoy?.classificationKind).toBe('income');
  });

  test('rejects same-account, cross-currency, wrong-category-kind, and already-matched sources', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const sourceId = await insertImportedTransaction(t, {
      accountId: fixture.acmeAccountId,
      providerConnectionId: fixture.providerConnectionId,
      dedupeKey: 'acme_topup',
      direction: 'CRDT',
      amountMinor: 5000n,
      bookingDate: '2026-07-10',
      description: 'Apple Pay Top-Up by *4242',
    });

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.createCounterpartTransfer, {
        sourceTransactionId: sourceId,
        accountId: fixture.acmeAccountId,
        amount: { amountMinor: 5000n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'Same account',
      }),
    ).rejects.toThrow('Transfers require transactions from different accounts');

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.createCounterpartTransfer, {
        sourceTransactionId: sourceId,
        accountId: fixture.cardAccountId,
        amount: { amountMinor: 5000n, currency: 'USD' },
        bookingDate: '2026-07-10',
        description: 'Wrong currency',
      }),
    ).rejects.toThrow('Transfers across currencies are not supported yet');

    const expenseCategoryId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert('categories', {
        userId,
        name: 'Groceries',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.createCounterpartTransfer, {
        sourceTransactionId: sourceId,
        accountId: fixture.cardAccountId,
        amount: { amountMinor: 5000n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'Wrong category kind',
        categoryId: expenseCategoryId,
      }),
    ).rejects.toThrow('Only transfer categories can be used for the matching leg');

    await t.run(async (ctx) => {
      const matchId = await ctx.db.insert('transferMatches', {
        userId,
        outgoingTransactionId: sourceId,
        incomingTransactionId: sourceId,
        status: 'confirmed',
        amountDelta: { amountMinor: 0n, currency: 'EUR' },
        source: 'user',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
      await ctx.db.patch('transactions', sourceId, { transferMatchId: matchId });
    });

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.createCounterpartTransfer, {
        sourceTransactionId: sourceId,
        accountId: fixture.cardAccountId,
        amount: { amountMinor: 5000n, currency: 'EUR' },
        bookingDate: '2026-07-10',
        description: 'Already matched',
      }),
    ).rejects.toThrow('This transaction is already matched as a transfer');
  });
});

describe('unlinkTransferMatch', () => {
  test('reverts both legs to uncategorized and makes the manual leg deletable again', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const sourceId = await insertImportedTransaction(t, {
      accountId: fixture.acmeAccountId,
      providerConnectionId: fixture.providerConnectionId,
      dedupeKey: 'acme_topup',
      direction: 'CRDT',
      amountMinor: 5000n,
      bookingDate: '2026-07-10',
      description: 'Apple Pay Top-Up by *4242',
    });

    const result = await fixture.asUser.mutation(api.banking.manualTransactions.createCounterpartTransfer, {
      sourceTransactionId: sourceId,
      accountId: fixture.cardAccountId,
      amount: { amountMinor: 5000n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Acme Top-up',
    });

    await fixture.asUser.mutation(api.banking.transfers.unlinkTransferMatch, {
      transferMatchId: result.transferMatchId,
    });

    const { match, source, leg } = await t.run(async (ctx) => ({
      match: await ctx.db.get('transferMatches', result.transferMatchId),
      source: await ctx.db.get('transactions', sourceId),
      leg: await ctx.db.get('transactions', result.transactionId),
    }));

    expect(match).toBeNull();
    expect(source?.classificationKind).toBe('uncategorized');
    expect(source?.transferMatchId).toBeUndefined();
    expect(leg?.classificationKind).toBe('uncategorized');
    expect(leg?.transferMatchId).toBeUndefined();

    await expect(
      fixture.asUser.mutation(api.banking.manualTransactions.deleteManualTransaction, {
        transactionId: result.transactionId,
      }),
    ).resolves.toBeDefined();
  });

  test('refuses to unlink a match a completed planned transfer still points at', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const sourceId = await insertImportedTransaction(t, {
      accountId: fixture.acmeAccountId,
      providerConnectionId: fixture.providerConnectionId,
      dedupeKey: 'acme_topup_planned',
      direction: 'CRDT',
      amountMinor: 5000n,
      bookingDate: '2026-07-10',
      description: 'Apple Pay Top-Up by *4242',
    });

    const result = await fixture.asUser.mutation(api.banking.manualTransactions.createCounterpartTransfer, {
      sourceTransactionId: sourceId,
      accountId: fixture.cardAccountId,
      amount: { amountMinor: 5000n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Acme Top-up',
    });

    await t.run(async (ctx) => {
      const now = Date.now();
      await insertPlannedTransfer(ctx, {
        userId,
        toAccountId: fixture.acmeAccountId,
        name: 'Acme monthly top-up',
        amount: { amountMinor: 5000n, currency: 'EUR' },
        scheduledDate: '2026-07-10',
        status: 'completed',
        completedTransferMatchId: result.transferMatchId,
        completedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(
      fixture.asUser.mutation(api.banking.transfers.unlinkTransferMatch, {
        transferMatchId: result.transferMatchId,
      }),
    ).rejects.toThrow('Reopen the linked planned transfer');

    const match = await t.run(async (ctx) => await ctx.db.get('transferMatches', result.transferMatchId));
    expect(match?.status).toBe('confirmed');
  });

  test('reopens a card statement cycle the match had auto-settled', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 203193n, currency: 'EUR' },
      bookingDate: '2026-06-15',
      description: 'Saldo iniziale carta',
      classificationKind: 'internal',
    });

    const { usageCycleId, settlementDebitId } = await t.run(async (ctx) => {
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
        linkedAccountId: fixture.cardAccountId,
        settlementAccountId: checkingAccountId,
        provider: 'manual',
        limitAmount: { amountMinor: 250000n, currency: 'EUR' },
        usedAmount: { amountMinor: 0n, currency: 'EUR' },
        repaymentType: 'statementBalance',
        paymentDayOfMonth: 7,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const insertedUsageCycleId = await ctx.db.insert('creditFacilityUsageCycles', {
        userId,
        creditFacilityId: cardFacilityId,
        cycleMonth: '2026-06',
        status: 'scheduled',
        trackedAmount: { amountMinor: 203193n, currency: 'EUR' },
        dueDate: '2026-07-07',
        closedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const insertedSettlementDebitId = await ctx.db.insert('transactions', {
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
      return {
        checkingAccountId,
        cardFacilityId,
        usageCycleId: insertedUsageCycleId,
        settlementDebitId: insertedSettlementDebitId,
      };
    });

    const result = await fixture.asUser.mutation(api.banking.manualTransactions.createCounterpartTransfer, {
      sourceTransactionId: settlementDebitId,
      accountId: fixture.cardAccountId,
      amount: { amountMinor: 203193n, currency: 'EUR' },
      bookingDate: '2026-07-07',
      description: 'Pagamento estratto conto',
    });

    const paidCycle = await t.run(async (ctx) => await ctx.db.get('creditFacilityUsageCycles', usageCycleId));
    expect(paidCycle).toMatchObject({ status: 'paid', transactionId: result.transactionId });

    await fixture.asUser.mutation(api.banking.transfers.unlinkTransferMatch, {
      transferMatchId: result.transferMatchId,
    });

    const reopenedCycle = await t.run(async (ctx) => await ctx.db.get('creditFacilityUsageCycles', usageCycleId));
    expect(reopenedCycle?.status).toBe('scheduled');
    expect(reopenedCycle?.transactionId).toBeUndefined();
    expect(reopenedCycle?.paidAtMs).toBeUndefined();
  });
});
