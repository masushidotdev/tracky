/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

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

const USER_ID = 'user_oauth_replay';

function sessionPayload() {
  return {
    session_id: 'session_first',
    aspsp: { name: 'Test Bank', country: 'IT' },
    psu_type: 'personal' as const,
    access: { valid_until: '2027-01-18T00:00:00Z' },
    accounts: [
      {
        uid: 'uid_main',
        name: 'Main account',
        currency: 'EUR',
        cash_account_type: 'CACC',
        identification_hash: 'hash_main',
        account_servicer: { name: 'Test Bank' },
      },
    ],
  };
}

async function startAuthRequest(t: TestHarness, state: string) {
  await t.mutation(internal.banking.providerMutations.createAuthRequest, {
    userId: USER_ID,
    provider: 'enableBanking',
    state,
    redirectUrl: 'https://example.test/callback',
    aspspName: 'Test Bank',
    aspspCountry: 'IT',
    psuType: 'personal',
    expiresAtMs: Date.now() + 30 * 60 * 1000,
  });
}

async function tableCounts(t: TestHarness) {
  return await t.run(async (ctx) => ({
    connections: (await ctx.db.query('providerConnections').take(100)).length,
    accounts: (await ctx.db.query('financialAccounts').take(500)).length,
    importJobs: (await ctx.db.query('importJobs').take(100)).length,
  }));
}

describe('OAuth callback idempotency', () => {
  test('replaying completeEnableBankingSession on a completed request throws without duplicating', async () => {
    const t = createTest();
    const state = 'state_first_completion';
    await startAuthRequest(t, state);

    const connectionId = await t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
      state,
      session: sessionPayload(),
    });
    const before = await tableCounts(t);

    await expect(
      t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
        state,
        session: { ...sessionPayload(), session_id: 'session_replayed' },
      }),
    ).rejects.toThrow('already completed');

    const after = await tableCounts(t);
    const request = await t.run(async (ctx) =>
      ctx.db.query('providerAuthRequests').withIndex('by_state', (q) => q.eq('state', state)).unique(),
    );

    expect(connectionId).toBeDefined();
    expect(after).toEqual(before);
    expect(request?.status).toBe('completed');
  });

  test('replaying exchangeCallback on a completed request returns early with no side effects', async () => {
    const t = createTest();
    const state = 'state_completed_replay';
    await startAuthRequest(t, state);
    await t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
      state,
      session: sessionPayload(),
    });
    const before = await tableCounts(t);

    // Same state+code hitting the callback again (browser retry, double
    // redirect): must not POST /sessions again, create a job, or schedule syncs.
    const result = await t.action(internal.banking.enableBanking.exchangeCallback, {
      state,
      code: 'replayed-code',
    });

    const after = await tableCounts(t);
    const request = await t.run(async (ctx) =>
      ctx.db.query('providerAuthRequests').withIndex('by_state', (q) => q.eq('state', state)).unique(),
    );

    expect(result).toEqual({ status: 'completed', scheduledSyncs: 0 });
    expect(after).toEqual(before);
    expect(request?.status).toBe('completed');
  });

  test('only the first claimant proceeds; a concurrent callback gets an in-progress result', async () => {
    const t = createTest();
    const state = 'state_concurrent_claim';
    await startAuthRequest(t, state);

    const first = await t.mutation(internal.banking.providerMutations.claimAuthRequestForCallback, {
      state,
    });
    expect(first.outcome).toBe('claimed');
    const before = await tableCounts(t);

    // A second callback racing the first must not start external work: no
    // import job, no session exchange, retryable signal instead.
    const result = await t.action(internal.banking.enableBanking.exchangeCallback, {
      state,
      code: 'replayed-code',
    });

    const after = await tableCounts(t);
    const request = await t.run(async (ctx) =>
      ctx.db.query('providerAuthRequests').withIndex('by_state', (q) => q.eq('state', state)).unique(),
    );

    expect(result).toEqual({ status: 'failed', reason: 'CALLBACK_IN_PROGRESS' });
    expect(after).toEqual(before);
    expect(request?.status).toBe('processing');
  });

  test('a stale processing claim can be taken over', async () => {
    const t = createTest();
    const state = 'state_stale_claim';
    await startAuthRequest(t, state);
    await t.mutation(internal.banking.providerMutations.claimAuthRequestForCallback, { state });
    await t.run(async (ctx) => {
      const request = await ctx.db
        .query('providerAuthRequests')
        .withIndex('by_state', (q) => q.eq('state', state))
        .unique();
      if (!request) throw new Error('auth request missing');
      await ctx.db.patch('providerAuthRequests', request._id, { processingStartedAtMs: 1 });
    });

    const reclaim = await t.mutation(internal.banking.providerMutations.claimAuthRequestForCallback, {
      state,
    });
    expect(reclaim.outcome).toBe('claimed');
  });

  test('failAuthRequest never overwrites a request completed by another callback', async () => {
    const t = createTest();
    const state = 'state_fail_after_complete';
    await startAuthRequest(t, state);
    await t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
      state,
      session: sessionPayload(),
    });
    const completedAtMs = await t.run(async (ctx) =>
      (
        await ctx.db
          .query('providerAuthRequests')
          .withIndex('by_state', (q) => q.eq('state', state))
          .unique()
      )?.completedAtMs,
    );

    // The losing callback's exchange failed (single-use code already spent):
    // its failure path must leave the winner's completion intact.
    await t.mutation(internal.banking.providerMutations.failAuthRequest, {
      state,
      errorCode: 'CODE_ALREADY_USED',
      errorMessage: 'authorization code already redeemed',
    });

    const request = await t.run(async (ctx) =>
      ctx.db.query('providerAuthRequests').withIndex('by_state', (q) => q.eq('state', state)).unique(),
    );
    expect(request?.status).toBe('completed');
    expect(request?.errorCode).toBeUndefined();
    expect(request?.completedAtMs).toBe(completedAtMs);
  });
});
