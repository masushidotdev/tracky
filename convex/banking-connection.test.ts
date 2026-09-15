/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob([
  './_generated/*.js',
  './banking/categoryRuleCore.ts',
  './banking/providerMutations.ts',
  './banking/providerQueries.ts',
  './banking/connectionHealth.ts',
  './lib/*.ts',
]);

function createTest() {
  return convexTest(schema, modules);
}

type TestHarness = ReturnType<typeof createTest>;

async function seedConnection(t: TestHarness) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 5, 19);
    const userId = 'user_test';
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'enableBanking',
      status: 'active',
      displayName: 'Test Bank',
      sessionId: 'session_test',
      aspspName: 'Test Bank',
      aspspCountry: 'IT',
      psuType: 'personal',
      accessValidUntil: '2026-06-01',
      nextSyncAfterMs: now,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountIds: Array<Id<'financialAccounts'>> = [];

    for (const providerAccountId of ['checking', 'savings']) {
      const accountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId,
        provider: 'enableBanking',
        providerAccountId,
        name: providerAccountId,
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      accountIds.push(accountId);
      await ctx.db.insert('accountSyncStates', {
        userId,
        providerConnectionId,
        accountId,
        provider: 'enableBanking',
        status: 'active',
        backfillFromDate: '2026-01-01',
        nextSyncAfterMs: now,
        syncCadenceHours: 6,
        consecutiveFailures: 0,
        updatedAtMs: now,
      });
    }

    return { accountIds, providerConnectionId };
  });
}

describe('bank connection state', () => {
  test('lists active sync states for a newly authorized connection', async () => {
    const t = createTest();
    const fixture = await seedConnection(t);

    const syncStates = await t.query(internal.banking.providerQueries.listActiveSyncStatesForConnection, {
      providerConnectionId: fixture.providerConnectionId,
      limit: 10,
    });

    expect(syncStates).toHaveLength(2);
    expect(syncStates.every((syncState) => syncState.status === 'active')).toBe(true);
  });

  test('marks connection, accounts, and sync states as requiring reauthorization', async () => {
    const t = createTest();
    const fixture = await seedConnection(t);

    await t.mutation(internal.banking.providerMutations.markConnectionReauthorizationRequired, {
      providerConnectionId: fixture.providerConnectionId,
      errorCode: 'ACCESS_EXPIRED',
      errorMessage: 'Bank consent expired. Reconnect this bank to resume sync.',
    });

    const result = await t.run(async (ctx) => {
      const connection = await ctx.db.get('providerConnections', fixture.providerConnectionId);
      const accounts = [];
      const syncStates = [];

      for (const accountId of fixture.accountIds) {
        const account = await ctx.db.get('financialAccounts', accountId);
        if (account) {
          accounts.push(account);
          const syncState = await ctx.db
            .query('accountSyncStates')
            .withIndex('by_accountId', (q) => q.eq('accountId', account._id))
            .unique();
          syncStates.push(syncState);
        }
      }

      return { accounts, connection, syncStates };
    });

    expect(result.connection?.status).toBe('reauthorizationRequired');
    expect(result.connection?.statusDetail).toBe('Bank consent expired. Reconnect this bank to resume sync.');
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts.every((account) => account.status === 'reauthorizationRequired')).toBe(true);
    expect(result.accounts.every((account) => account.syncEnabled === false)).toBe(true);
    expect(result.syncStates.every((syncState) => syncState?.status === 'reauthorizationRequired')).toBe(true);
    expect(result.syncStates.every((syncState) => syncState?.lastErrorCode === 'ACCESS_EXPIRED')).toBe(true);
  });

  test('reauthorizes an existing connection without duplicating existing accounts', async () => {
    const t = createTest();
    const fixture = await seedConnection(t);
    const state = 'reauth_state';

    await t.mutation(internal.banking.providerMutations.markConnectionReauthorizationRequired, {
      providerConnectionId: fixture.providerConnectionId,
      errorCode: 'ACCESS_EXPIRED',
      errorMessage: 'Bank consent expired. Reconnect this bank to resume sync.',
    });
    await t.mutation(internal.banking.providerMutations.createAuthRequest, {
      userId: 'user_test',
      provider: 'enableBanking',
      state,
      redirectUrl: 'https://tracky.test/enablebanking/callback',
      aspspName: 'Test Bank',
      aspspCountry: 'IT',
      psuType: 'personal',
      providerConnectionId: fixture.providerConnectionId,
      expiresAtMs: Date.UTC(2026, 5, 19) + 30 * 60 * 1000,
    });

    const returnedConnectionId = await t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
      state,
      session: {
        session_id: 'session_renewed',
        aspsp: {
          name: 'Test Bank',
          country: 'IT',
        },
        psu_type: 'personal',
        access: {
          valid_until: '2026-12-01',
        },
        accounts: [
          {
            uid: 'checking',
            name: 'Renewed checking',
            currency: 'EUR',
            cash_account_type: 'CACC',
            identification_hash: 'hash_checking_new',
            account_servicer: {
              name: 'Test Bank',
            },
          },
          {
            uid: 'new_card',
            name: 'New card',
            currency: 'EUR',
            cash_account_type: 'CARD',
            identification_hash: 'hash_card',
            account_servicer: {
              name: 'Test Bank',
            },
          },
        ],
      },
    });

    const result = await t.run(async (ctx) => {
      const connection = await ctx.db.get('providerConnections', fixture.providerConnectionId);
      const accounts = await ctx.db
        .query('financialAccounts')
        .withIndex('by_providerConnectionId', (q) => q.eq('providerConnectionId', fixture.providerConnectionId))
        .take(10);
      const syncStates = [];
      for (const account of accounts) {
        const syncState = await ctx.db
          .query('accountSyncStates')
          .withIndex('by_accountId', (q) => q.eq('accountId', account._id))
          .unique();
        syncStates.push({ account, syncState });
      }
      const authRequest = await ctx.db.query('providerAuthRequests').withIndex('by_state', (q) => q.eq('state', state)).unique();

      return { accounts, authRequest, connection, syncStates };
    });
    const checking = result.accounts.find((account) => account.providerAccountId === 'checking');
    const savings = result.accounts.find((account) => account.providerAccountId === 'savings');
    const newCard = result.accounts.find((account) => account.providerAccountId === 'new_card');
    const checkingSync = result.syncStates.find((row) => row.account.providerAccountId === 'checking')?.syncState;
    const savingsSync = result.syncStates.find((row) => row.account.providerAccountId === 'savings')?.syncState;

    expect(returnedConnectionId).toBe(fixture.providerConnectionId);
    expect(result.connection?.status).toBe('active');
    expect(result.connection?.sessionId).toBe('session_renewed');
    expect(result.connection?.accessValidUntil).toBe('2026-12-01');
    expect(result.connection?.statusDetail).toBeUndefined();
    expect(result.accounts).toHaveLength(3);
    expect(checking?._id).toBe(fixture.accountIds[0]);
    expect(checking?.name).toBe('Renewed checking');
    expect(checking?.status).toBe('active');
    expect(checking?.syncEnabled).toBe(true);
    expect(checkingSync?.status).toBe('active');
    expect(checkingSync?.lastErrorCode).toBeUndefined();
    expect(savings?._id).toBe(fixture.accountIds[1]);
    expect(savings?.status).toBe('paused');
    expect(savings?.syncEnabled).toBe(false);
    expect(savingsSync?.status).toBe('paused');
    expect(newCard?.status).toBe('active');
    expect(newCard?.syncEnabled).toBe(true);
    expect(result.authRequest?.status).toBe('completed');
  });

  test('reauthorizes accounts by stable identification hash when provider uid changes', async () => {
    const t = createTest();
    const fixture = await seedConnection(t);
    const state = 'reauth_changed_uid_state';

    await t.run(async (ctx) => {
      await ctx.db.patch('financialAccounts', fixture.accountIds[0], {
        providerAccountHash: 'stable_checking_hash',
        ibanMasked: 'IT29...1668',
      });
      await ctx.db.patch('financialAccounts', fixture.accountIds[1], {
        providerAccountHash: 'stable_savings_hash',
        ibanMasked: 'IT44...1638',
      });
    });
    await t.mutation(internal.banking.providerMutations.createAuthRequest, {
      userId: 'user_test',
      provider: 'enableBanking',
      state,
      redirectUrl: 'https://tracky.test/enablebanking/callback',
      aspspName: 'Test Bank',
      aspspCountry: 'IT',
      psuType: 'personal',
      providerConnectionId: fixture.providerConnectionId,
      expiresAtMs: Date.UTC(2026, 5, 19) + 30 * 60 * 1000,
    });

    await t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
      state,
      session: {
        session_id: 'session_renewed_changed_uid',
        aspsp: {
          name: 'Test Bank',
          country: 'IT',
        },
        psu_type: 'personal',
        access: {
          valid_until: '2026-12-01',
        },
        accounts: [
          {
            uid: 'checking_after_renew',
            name: 'Renewed checking',
            currency: 'EUR',
            cash_account_type: 'CACC',
            identification_hash: 'stable_checking_hash',
            account_id: {
              iban: 'IT2900366901600857565591668',
            },
            account_servicer: {
              name: 'Test Bank',
            },
          },
          {
            uid: 'savings_after_renew',
            name: 'Renewed savings',
            currency: 'EUR',
            cash_account_type: 'CACC',
            identification_hash: 'stable_savings_hash',
            account_id: {
              iban: 'IT4400366901600285204951638',
            },
            account_servicer: {
              name: 'Test Bank',
            },
          },
        ],
      },
    });

    const result = await t.run(async (ctx) => {
      const accounts = await ctx.db
        .query('financialAccounts')
        .withIndex('by_providerConnectionId', (q) => q.eq('providerConnectionId', fixture.providerConnectionId))
        .take(10);
      const syncStates = [];
      for (const account of accounts) {
        const syncState = await ctx.db
          .query('accountSyncStates')
          .withIndex('by_accountId', (q) => q.eq('accountId', account._id))
          .unique();
        syncStates.push({ account, syncState });
      }
      return { accounts, syncStates };
    });

    const checking = result.accounts.find((account) => account._id === fixture.accountIds[0]);
    const savings = result.accounts.find((account) => account._id === fixture.accountIds[1]);

    expect(result.accounts).toHaveLength(2);
    expect(checking?.providerAccountId).toBe('checking_after_renew');
    expect(checking?.name).toBe('Renewed checking');
    expect(checking?.status).toBe('active');
    expect(savings?.providerAccountId).toBe('savings_after_renew');
    expect(savings?.name).toBe('Renewed savings');
    expect(savings?.status).toBe('active');
    expect(result.syncStates.every((row) => row.syncState?.status === 'active')).toBe(true);
  });
});
