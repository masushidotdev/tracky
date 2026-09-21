/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import { jevAutoConfirmGate } from './banking/transferArbitration';
import { JEV_TRANSFER } from './lib/jevThresholds';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/*.ts',
  './lib/*.ts',
]);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

async function seedAuthKitUser(t: ReturnType<typeof createTest>, userId: string) {
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

const userId = 'user_arbiter';

describe('jev transfer arbitration gate', () => {
  test('requires choice, confidence, and noul together', () => {
    expect(
      jevAutoConfirmGate({ action: { choice: 'auto-confirm', confidence: 0.9 }, sameMoney: { noul: 0.9 } }),
    ).toBe(true);
    // Label alone never decides: low confidence or low noul degrades to review.
    expect(
      jevAutoConfirmGate({ action: { choice: 'auto-confirm', confidence: 0.52 }, sameMoney: { noul: 0.56 } }),
    ).toBe(false);
    expect(
      jevAutoConfirmGate({ action: { choice: 'review', confidence: 0.95 }, sameMoney: { noul: 0.95 } }),
    ).toBe(false);
  });

  test('ambiguous heuristic scores persist a review candidate for arbitration', async () => {
    const t = createTest();
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const outAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Out account',
      accountType: 'CACC',
      currency: 'EUR',
    });
    const inAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'In account',
      accountType: 'CACC',
      currency: 'EUR',
    });
    // Same amount, 3 days apart: heuristic lands in the arbitration band.
    const outgoingId = await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: outAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 25000n, currency: 'EUR' },
      bookingDate: '2026-09-10',
      description: 'GIROCONTO VERSO ALTRO CONTO',
    });
    const incomingId = await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: inAccountId,
      direction: 'CRDT',
      amount: { amountMinor: 25000n, currency: 'EUR' },
      bookingDate: '2026-09-13',
      description: 'GIROCONTO DA ALTRO CONTO',
    });
    void outgoingId;
    void incomingId;

    const candidates = await t.run(async (ctx) => {
      return await ctx.db.query('transferMatches').withIndex('by_userId_and_status', (q) =>
        q.eq('userId', userId).eq('status', 'candidate'),
      ).collect();
    });
    expect(candidates).toHaveLength(1);
    // Deterministic auto-confirm (>=0.88) must not fire here; arbitration owns the band.
    for (const candidate of candidates) {
      expect(candidate.confidence ?? 0).toBeLessThan(0.88);
      expect(candidate.confidence ?? 0).toBeGreaterThanOrEqual(JEV_TRANSFER.arbitrateMin);
    }
  });

  test('failed arbitration keeps the review candidate (fail closed)', async () => {
    const t = createTest();
    await seedAuthKitUser(t, `${userId}-closed`);
    const uid = `${userId}-closed`;
    const asUser = t.withIdentity({ subject: uid });
    const outAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Out account',
      accountType: 'CACC',
      currency: 'EUR',
    });
    const inAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'In account',
      accountType: 'CACC',
      currency: 'EUR',
    });
    const matchId = await t.run(async (ctx) => {
      const now = Date.now();
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId: uid,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock provider',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const outgoingId = await ctx.db.insert('transactions', {
        userId: uid,
        accountId: outAccountId,
        providerConnectionId,
        provider: 'manual',
        dedupeKey: `csv|${uid}-out`,
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 4999n, currency: 'EUR' },
        bookingDate: '2026-09-05',
        transactionDate: '2026-09-05',
        description: 'PAGAMENTO CARTA ACME MARKET',
        classificationKind: 'expense',
        classificationSource: 'system',
        importedAtMs: now,
        updatedAtMs: now,
      });
      const incomingId = await ctx.db.insert('transactions', {
        userId: uid,
        accountId: inAccountId,
        providerConnectionId,
        provider: 'manual',
        dedupeKey: `csv|${uid}-in`,
        status: 'BOOK',
        direction: 'CRDT',
        amount: { amountMinor: 4799n, currency: 'EUR' },
        bookingDate: '2026-09-09',
        transactionDate: '2026-09-09',
        description: 'RIMBORSO ACME MARKET',
        classificationKind: 'income',
        classificationSource: 'system',
        importedAtMs: now,
        updatedAtMs: now,
      });
      return await ctx.db.insert('transferMatches', {
        userId: uid,
        outgoingTransactionId: outgoingId,
        incomingTransactionId: incomingId,
        status: 'candidate',
        amountDelta: { amountMinor: 200n, currency: 'EUR' },
        confidence: 0.7,
        source: 'system',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });
    // Verdict review (jev unavailable path) keeps the candidate row intact.
    await t.mutation(internal.banking.transferArbitration.applyArbitrationVerdict, {
      userId: uid,
      transferMatchId: matchId,
      verdict: 'review',
      confidence: 0.7,
      note: 'jev arbitration unavailable; heuristic candidate kept for review.',
    });
    const match = await t.run(async (ctx) => await ctx.db.get('transferMatches', matchId));
    expect(match?.status).toBe('candidate');
  });
});
