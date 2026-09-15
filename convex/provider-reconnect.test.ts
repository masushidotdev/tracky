/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, components, internal } from './_generated/api';
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

const USER_ID = 'user_reconnect';

async function seedAuthKitUser(t: TestHarness) {
  const timestamp = '2026-07-22T00:00:00.000Z';
  await t.mutation(components.workOSAuthKit.lib.onWebhookEvent, {
    apiKey: 'sk_test',
    event: {
      id: `evt_${USER_ID}`,
      createdAt: timestamp,
      event: 'user.created',
      data: {
        object: 'user',
        id: USER_ID,
        email: `${USER_ID}@example.com`,
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

/** A bank already connected once, with one account carrying its history. */
async function seedExistingConnection(t: TestHarness) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 3, 1);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId: USER_ID,
      provider: 'enableBanking',
      status: 'active',
      displayName: 'Test Bank',
      sessionId: 'session_old',
      aspspName: 'Test Bank',
      aspspCountry: 'IT',
      psuType: 'personal',
      nextSyncAfterMs: now,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId: USER_ID,
      providerConnectionId,
      provider: 'enableBanking',
      providerAccountId: 'uid_old',
      providerAccountHash: 'hash_main',
      name: 'Main account',
      institutionName: 'Test Bank',
      currency: 'EUR',
      ibanMasked: 'IT29...1668',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { providerConnectionId, accountId };
  });
}

/** The payload a second authorisation of the same bank delivers: the same account, new uid. */
function sessionWithSameAccount() {
  return {
    session_id: 'session_new',
    aspsp: { name: 'Test Bank', country: 'IT' },
    psu_type: 'personal' as const,
    access: { valid_until: '2027-01-18T00:00:00Z' },
    accounts: [
      {
        uid: 'uid_new',
        name: 'Main account',
        currency: 'EUR',
        cash_account_type: 'CACC',
        identification_hash: 'hash_main',
        account_id: { iban: 'IT2900000000000000001668' },
        account_servicer: { name: 'Test Bank' },
      },
    ],
  };
}

async function startAuthRequest(t: TestHarness, state: string) {
  await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 22);
    await ctx.db.insert('providerAuthRequests', {
      userId: USER_ID,
      provider: 'enableBanking',
      state,
      status: 'redirected',
      redirectUrl: 'https://example.test/callback',
      aspspName: 'Test Bank',
      aspspCountry: 'IT',
      psuType: 'personal',
      expiresAtMs: now + 60 * 60 * 1000,
      createdAtMs: now,
    });
  });
}

describe('reconnecting a bank', () => {
  test('adopts the account it already has instead of importing a duplicate', async () => {
    const t = createTest();
    await seedAuthKitUser(t);
    const existing = await seedExistingConnection(t);
    await startAuthRequest(t, 'state_reconnect');

    await t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
      state: 'state_reconnect',
      session: sessionWithSameAccount(),
    });

    const accounts = await t.run(async (ctx) =>
      ctx.db
        .query('financialAccounts')
        .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
        .take(20),
    );

    // One row, not two: the second connection recognised the account by its identity hash.
    expect(accounts).toHaveLength(1);
    expect(accounts[0]._id).toBe(existing.accountId);
    // The surviving row moves to the fresh consent, or it would keep syncing through the old one.
    expect(accounts[0].providerConnectionId).not.toBe(existing.providerConnectionId);
    expect(accounts[0].providerAccountId).toBe('uid_new');
    expect(accounts[0].status).toBe('active');
  });

  test('leaves accounts of other connections alone when a bank is reconnected', async () => {
    const t = createTest();
    await seedAuthKitUser(t);
    await seedExistingConnection(t);
    await startAuthRequest(t, 'state_reconnect');

    const otherAccountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 3, 1);
      const otherConnectionId = await ctx.db.insert('providerConnections', {
        userId: USER_ID,
        provider: 'enableBanking',
        status: 'active',
        displayName: 'Other Bank',
        sessionId: 'session_other',
        aspspName: 'Other Bank',
        aspspCountry: 'IT',
        psuType: 'personal',
        nextSyncAfterMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return await ctx.db.insert('financialAccounts', {
        userId: USER_ID,
        providerConnectionId: otherConnectionId,
        provider: 'enableBanking',
        providerAccountId: 'uid_other',
        providerAccountHash: 'hash_other',
        name: 'Other account',
        institutionName: 'Other Bank',
        currency: 'EUR',
        ibanMasked: 'IT44...1638',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
      state: 'state_reconnect',
      session: sessionWithSameAccount(),
    });

    const other = await t.run(async (ctx) => ctx.db.get('financialAccounts', otherAccountId));

    // Identity matching reads across the user, but the pause sweep must stay per connection.
    expect(other?.status).toBe('active');
    expect(other?.syncEnabled).toBe(true);
  });
});

describe('repairDuplicateAccountIdentities', () => {
  test('merges copies that live in different connections', async () => {
    const t = createTest();
    await seedAuthKitUser(t);
    const existing = await seedExistingConnection(t);

    const { duplicateId, newConnectionId } = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 22);
      const connectionId = await ctx.db.insert('providerConnections', {
        userId: USER_ID,
        provider: 'enableBanking',
        status: 'active',
        displayName: 'Test Bank',
        sessionId: 'session_new',
        aspspName: 'Test Bank',
        aspspCountry: 'IT',
        psuType: 'personal',
        nextSyncAfterMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const accountId = await ctx.db.insert('financialAccounts', {
        userId: USER_ID,
        providerConnectionId: connectionId,
        provider: 'enableBanking',
        providerAccountId: 'uid_new',
        providerAccountHash: 'hash_main',
        name: 'Main account',
        institutionName: 'Test Bank',
        currency: 'EUR',
        ibanMasked: 'IT29...1668',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { duplicateId: accountId, newConnectionId: connectionId };
    });

    const result = await t
      .withIdentity({ subject: USER_ID })
      .mutation(api.banking.accounts.repairDuplicateAccountIdentities, {});

    const state = await t.run(async (ctx) => ({
      canonical: await ctx.db.get('financialAccounts', existing.accountId),
      duplicate: await ctx.db.get('financialAccounts', duplicateId),
    }));

    expect(result).toEqual({ repairedGroups: 1, pausedAccounts: 1 });
    // The oldest row survives, so its transactions and plan mappings stay put...
    expect(state.canonical?.status).toBe('active');
    expect(state.canonical?.providerAccountId).toBe('uid_new');
    // ...and it takes over the newest working connection.
    expect(state.canonical?.providerConnectionId).toBe(newConnectionId);
    expect(state.duplicate?.status).toBe('paused');
    expect(state.duplicate?.syncEnabled).toBe(false);
  });

  test('leaves manual accounts alone even though they share no provider identity', async () => {
    const t = createTest();
    await seedAuthKitUser(t);

    const { cardId, savingsId } = await t.run(async (ctx) => {
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId: USER_ID,
        provider: 'manual',
        status: 'active',
        displayName: 'Manual',
        createdAtMs: Date.UTC(2026, 6, 15),
        updatedAtMs: Date.UTC(2026, 6, 15),
      });
      const card = await ctx.db.insert('financialAccounts', {
        userId: USER_ID,
        providerConnectionId,
        provider: 'manual',
        name: 'AcmeCard Flex Classic',
        alias: 'Flexia',
        accountType: 'CARD',
        accountSubtype: 'PRIV',
        currency: 'EUR',
        status: 'active',
        syncEnabled: false,
        createdAtMs: Date.UTC(2026, 6, 15),
        updatedAtMs: Date.UTC(2026, 6, 15),
      });
      const savings = await ctx.db.insert('financialAccounts', {
        userId: USER_ID,
        providerConnectionId,
        provider: 'manual',
        name: 'Instant Access Savings',
        alias: 'Acme Savings',
        accountType: 'SVGS',
        accountSubtype: 'PRIV',
        currency: 'EUR',
        status: 'active',
        syncEnabled: false,
        createdAtMs: Date.UTC(2026, 6, 22),
        updatedAtMs: Date.UTC(2026, 6, 22),
      });
      return { cardId: card, savingsId: savings };
    });

    const result = await t
      .withIdentity({ subject: USER_ID })
      .mutation(api.banking.accounts.repairDuplicateAccountIdentities, {});

    const state = await t.run(async (ctx) => ({
      card: await ctx.db.get('financialAccounts', cardId),
      savings: await ctx.db.get('financialAccounts', savingsId),
    }));

    expect(result).toEqual({ repairedGroups: 0, pausedAccounts: 0 });
    // The card kept being a card: a credit facility derives its usage from the CARD type, so
    // overwriting it with the savings account silently emptied the statement.
    expect(state.card?.accountType).toBe('CARD');
    expect(state.card?.name).toBe('AcmeCard Flex Classic');
    expect(state.card?.syncEnabled).toBe(false);
    expect(state.savings?.status).toBe('active');
    expect(state.savings?.syncEnabled).toBe(false);
  });
});
