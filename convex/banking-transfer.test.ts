/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './banking/transfer*.ts', './lib/*.ts']);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

type TransferFixture = {
  userId: string;
  outgoingTransactionId: Id<'transactions'>;
  incomingTransactionId: Id<'transactions'>;
};

async function seedTransferFixture(t: TestHarness, sameAccount = false): Promise<TransferFixture> {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 0, 1);
    const userId = 'user_test';
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const sourceAccountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'source_account',
      name: 'Checking',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const destinationAccountId = sameAccount
      ? sourceAccountId
      : await ctx.db.insert('financialAccounts', {
          userId,
          providerConnectionId,
          provider: 'mock',
          providerAccountId: 'destination_account',
          name: 'Acme Bank',
          currency: 'EUR',
          status: 'active',
          syncEnabled: true,
          createdAtMs: now,
          updatedAtMs: now,
        });
    const outgoingTransactionId = await ctx.db.insert('transactions', {
      userId,
      accountId: sourceAccountId,
      providerConnectionId,
      provider: 'mock',
      dedupeKey: 'outgoing_transfer',
      status: 'BOOK',
      direction: 'DBIT',
      amount: {
        amountMinor: 10000n,
        currency: 'EUR',
      },
      bookingDate: '2026-01-10',
      description: 'Add money to Acme wallet',
      classificationKind: 'uncategorized',
      classificationSource: 'provider',
      importedAtMs: now,
      updatedAtMs: now,
    });
    const incomingTransactionId = await ctx.db.insert('transactions', {
      userId,
      accountId: destinationAccountId,
      providerConnectionId,
      provider: 'mock',
      dedupeKey: 'incoming_transfer',
      status: 'BOOK',
      direction: 'CRDT',
      amount: {
        amountMinor: 9900n,
        currency: 'EUR',
      },
      bookingDate: '2026-01-10',
      description: 'Apple Pay top-up',
      classificationKind: 'uncategorized',
      classificationSource: 'provider',
      importedAtMs: now,
      updatedAtMs: now,
    });

    return { userId, outgoingTransactionId, incomingTransactionId };
  });
}

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

describe('transfer matching', () => {
  test('creates a confirmed transfer and marks both transactions', async () => {
    const t = createTest();
    const fixture = await seedTransferFixture(t);

    const transferMatchId = await t.mutation(internal.banking.transferMutations.createTransferMatchForUser, {
      userId: fixture.userId,
      outgoingTransactionId: fixture.outgoingTransactionId,
      incomingTransactionId: fixture.incomingTransactionId,
      feeAmountMinor: 100n,
      notes: 'Card top-up with service fee',
      source: 'user',
    });

    const result = await t.run(async (ctx) => {
      const match = await ctx.db.get('transferMatches', transferMatchId);
      const outgoing = await ctx.db.get('transactions', fixture.outgoingTransactionId);
      const incoming = await ctx.db.get('transactions', fixture.incomingTransactionId);
      return { match, outgoing, incoming };
    });

    expect(result.match?.amountDelta.amountMinor).toBe(100n);
    expect(result.match?.feeAmount?.amountMinor).toBe(100n);
    expect(result.outgoing?.classificationKind).toBe('transfer');
    expect(result.incoming?.classificationKind).toBe('transfer');
    expect(result.outgoing?.transferMatchId).toBe(transferMatchId);
    expect(result.incoming?.transferMatchId).toBe(transferMatchId);
  });

  test('creates a persisted transfer candidate and confirms it idempotently', async () => {
    const t = createTest();
    const fixture = await seedTransferFixture(t);

    const firstCandidateId = await t.mutation(internal.banking.transferMutations.createTransferCandidateForUser, {
      userId: fixture.userId,
      outgoingTransactionId: fixture.outgoingTransactionId,
      incomingTransactionId: fixture.incomingTransactionId,
      confidence: 0.82,
      notes: 'Possible card top-up with service fee',
    });
    const secondCandidateId = await t.mutation(internal.banking.transferMutations.createTransferCandidateForUser, {
      userId: fixture.userId,
      outgoingTransactionId: fixture.outgoingTransactionId,
      incomingTransactionId: fixture.incomingTransactionId,
      confidence: 0.82,
      notes: 'Possible card top-up with service fee',
    });

    expect(secondCandidateId).toBe(firstCandidateId);
    if (!firstCandidateId) {
      throw new Error('Expected transfer candidate to be created');
    }

    const candidate = await t.run(async (ctx) => {
      return await ctx.db.get('transferMatches', firstCandidateId);
    });

    expect(candidate?.status).toBe('candidate');
    expect(candidate?.source).toBe('system');
    expect(candidate?.amountDelta.amountMinor).toBe(100n);
    expect(candidate?.feeAmount?.amountMinor).toBe(100n);

    const confirmedId = await t.mutation(internal.banking.transferMutations.confirmTransferCandidateForUser, {
      userId: fixture.userId,
      transferMatchId: firstCandidateId,
    });

    const result = await t.run(async (ctx) => {
      const match = await ctx.db.get('transferMatches', confirmedId);
      const outgoing = await ctx.db.get('transactions', fixture.outgoingTransactionId);
      const incoming = await ctx.db.get('transactions', fixture.incomingTransactionId);
      return { match, outgoing, incoming };
    });

    expect(result.match?.status).toBe('confirmed');
    expect(result.match?.source).toBe('user');
    expect(result.outgoing?.classificationKind).toBe('transfer');
    expect(result.incoming?.classificationKind).toBe('transfer');
    expect(result.outgoing?.transferMatchId).toBe(confirmedId);
    expect(result.incoming?.transferMatchId).toBe(confirmedId);
  });

  test('rejects transfer matches within the same account', async () => {
    const t = createTest();
    const fixture = await seedTransferFixture(t, true);

    await expect(
      t.mutation(internal.banking.transferMutations.createTransferMatchForUser, {
        userId: fixture.userId,
        outgoingTransactionId: fixture.outgoingTransactionId,
        incomingTransactionId: fixture.incomingTransactionId,
        source: 'user',
      }),
    ).rejects.toThrow('different accounts');
  });

  test('creates a manual transfer match through the authenticated public mutation', async () => {
    const t = createTest();
    const fixture = await seedTransferFixture(t);
    await seedAuthKitUser(t, fixture.userId);

    const transferMatchId = await t.withIdentity({ subject: fixture.userId }).mutation(
      api.banking.transfers.createManualTransferMatch,
      {
        outgoingTransactionId: fixture.outgoingTransactionId,
        incomingTransactionId: fixture.incomingTransactionId,
        feeAmountMinor: 100n,
        notes: 'Card top-up with service fee',
      },
    );

    const result = await t.run(async (ctx) => {
      const match = await ctx.db.get('transferMatches', transferMatchId);
      const outgoing = await ctx.db.get('transactions', fixture.outgoingTransactionId);
      const incoming = await ctx.db.get('transactions', fixture.incomingTransactionId);
      return { incoming, match, outgoing };
    });

    expect(result.match).toMatchObject({
      userId: fixture.userId,
      status: 'confirmed',
      source: 'user',
      confidence: 1,
      notes: 'Card top-up with service fee',
    });
    expect(result.match?.amountDelta.amountMinor).toBe(100n);
    expect(result.match?.feeAmount?.amountMinor).toBe(100n);
    expect(result.outgoing).toMatchObject({
      classificationKind: 'transfer',
      classificationSource: 'user',
      transferMatchId,
    });
    expect(result.incoming).toMatchObject({
      classificationKind: 'transfer',
      classificationSource: 'user',
      transferMatchId,
    });
  });

  test('does not create a manual transfer match for another user transactions', async () => {
    const t = createTest();
    const fixture = await seedTransferFixture(t);
    const intruderUserId = 'user_transfer_intruder';
    await seedAuthKitUser(t, fixture.userId);
    await seedAuthKitUser(t, intruderUserId);

    await expect(
      t.withIdentity({ subject: intruderUserId }).mutation(api.banking.transfers.createManualTransferMatch, {
        outgoingTransactionId: fixture.outgoingTransactionId,
        incomingTransactionId: fixture.incomingTransactionId,
        feeAmountMinor: 100n,
      }),
    ).rejects.toThrow('Outgoing transaction not found');

    const result = await t.run(async (ctx) => {
      const matches = await ctx.db
        .query('transferMatches')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', intruderUserId).eq('status', 'confirmed'))
        .take(10);
      const outgoing = await ctx.db.get('transactions', fixture.outgoingTransactionId);
      const incoming = await ctx.db.get('transactions', fixture.incomingTransactionId);
      return { incoming, matches, outgoing };
    });

    expect(result.matches).toHaveLength(0);
    expect(result.outgoing).toMatchObject({
      classificationKind: 'uncategorized',
      classificationSource: 'provider',
    });
    expect(result.outgoing?.transferMatchId).toBeUndefined();
    expect(result.incoming).toMatchObject({
      classificationKind: 'uncategorized',
      classificationSource: 'provider',
    });
    expect(result.incoming?.transferMatchId).toBeUndefined();
  });
});
