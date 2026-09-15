/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { api, components } from './_generated/api';
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

describe('createManualAccount', () => {
  test('creates the account, a shared manual connection, and a zero opening balance', async () => {
    const t = createTest();
    const userId = 'user_test';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const cardAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Acme Flex',
      accountType: 'CARD',
      currency: 'eur',
    });
    const secondAccountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Cash',
      accountType: 'CACC',
      currency: 'EUR',
    });

    const { card, second, connections, balances } = await t.run(async (ctx) => ({
      card: await ctx.db.get('financialAccounts', cardAccountId),
      second: await ctx.db.get('financialAccounts', secondAccountId),
      connections: await ctx.db
        .query('providerConnections')
        .withIndex('by_userId_and_provider', (q) => q.eq('userId', userId).eq('provider', 'manual'))
        .take(10),
      balances: await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', cardAccountId))
        .take(10),
    }));

    expect(card).toMatchObject({
      provider: 'manual',
      accountType: 'CARD',
      currency: 'EUR',
      status: 'active',
      syncEnabled: false,
    });
    expect(connections).toHaveLength(1);
    expect(second?.providerConnectionId).toBe(card?.providerConnectionId);
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({
      balanceType: 'closingBooked',
      amount: { amountMinor: 0n, currency: 'EUR' },
    });
  });

  test('rejects blank names and invalid currencies', async () => {
    const t = createTest();
    const userId = 'user_test';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.banking.manualAccounts.createManualAccount, {
        name: '   ',
        accountType: 'CARD',
        currency: 'EUR',
      }),
    ).rejects.toThrow('Account name is required');
    await expect(
      asUser.mutation(api.banking.manualAccounts.createManualAccount, {
        name: 'Card',
        accountType: 'CARD',
        currency: 'EURO',
      }),
    ).rejects.toThrow('Currency must be a 3-letter code');
  });

  test('creates cash, savings, investment, and asset account types', async () => {
    const t = createTest();
    const userId = 'user_asset_types';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const accountIds = await Promise.all(
      (['CASH', 'SVGS', 'INVS', 'ASST'] as const).map((accountType) =>
        asUser.mutation(api.banking.manualAccounts.createManualAccount, {
          name: accountType,
          accountType,
          currency: 'EUR',
        }),
      ),
    );
    const accountTypes = await t.run(async (ctx) =>
      Promise.all(accountIds.map(async (accountId) => (await ctx.db.get('financialAccounts', accountId))?.accountType)),
    );

    expect(accountTypes).toEqual(['CASH', 'SVGS', 'INVS', 'ASST']);
  });
});

describe('setManualAccountBalance', () => {
  test('inserts a closing-booked snapshot with the requested reference date', async () => {
    const t = createTest();
    const userId = 'user_manual_balance';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Portfolio',
      accountType: 'INVS',
      currency: 'EUR',
    });

    const balanceId = await asUser.mutation(api.banking.manualAccounts.setManualAccountBalance, {
      accountId,
      amount: { amountMinor: 125_000n, currency: 'EUR' },
      referenceDate: '2026-07-15',
    });
    const balance = await t.run(async (ctx) => await ctx.db.get('accountBalances', balanceId));

    expect(balance).toMatchObject({
      userId,
      accountId,
      provider: 'manual',
      balanceType: 'closingBooked',
      amount: { amountMinor: 125_000n, currency: 'EUR' },
      referenceDate: '2026-07-15',
    });
  });

  test('allows the user to record a positive manual card balance', async () => {
    const t = createTest();
    const userId = 'user_positive_manual_card_balance';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Card with a credit',
      accountType: 'CARD',
      currency: 'EUR',
    });

    const balanceId = await asUser.mutation(api.banking.manualAccounts.setManualAccountBalance, {
      accountId,
      amount: { amountMinor: 1_000n, currency: 'EUR' },
      referenceDate: '2026-07-27',
    });

    expect(await t.run((ctx) => ctx.db.get('accountBalances', balanceId))).toMatchObject({
      accountId,
      amount: { amountMinor: 1_000n, currency: 'EUR' },
      referenceDate: '2026-07-27',
    });
  });

  test('rejects the wrong currency, a non-manual account, and another user account', async () => {
    const t = createTest();
    const ownerId = 'user_manual_balance_owner';
    const otherUserId = 'user_manual_balance_other';
    await seedAuthKitUser(t, ownerId);
    await seedAuthKitUser(t, otherUserId);
    const owner = t.withIdentity({ subject: ownerId });
    const otherUser = t.withIdentity({ subject: otherUserId });
    const manualAccountId = await owner.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Portfolio',
      accountType: 'INVS',
      currency: 'EUR',
    });
    const nonManualAccountId = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 15);
      const providerConnectionId = await ctx.db.insert('providerConnections', {
        userId: ownerId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock bank',
        createdAtMs: now,
        updatedAtMs: now,
      });
      return await ctx.db.insert('financialAccounts', {
        userId: ownerId,
        providerConnectionId,
        provider: 'mock',
        name: 'Synced portfolio',
        accountType: 'INVS',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await expect(
      owner.mutation(api.banking.manualAccounts.setManualAccountBalance, {
        accountId: manualAccountId,
        amount: { amountMinor: 1n, currency: 'USD' },
      }),
    ).rejects.toThrow('Amount currency must match the account currency');
    await expect(
      owner.mutation(api.banking.manualAccounts.setManualAccountBalance, {
        accountId: nonManualAccountId,
        amount: { amountMinor: 1n, currency: 'EUR' },
      }),
    ).rejects.toThrow('Only manual accounts accept manual balances');
    await expect(
      otherUser.mutation(api.banking.manualAccounts.setManualAccountBalance, {
        accountId: manualAccountId,
        amount: { amountMinor: 1n, currency: 'EUR' },
      }),
    ).rejects.toThrow('Account not found');
  });
});

describe('manual accounts in sync overview', () => {
  test('listSyncOverview includes the manual account with a null sync state', async () => {
    const t = createTest();
    const userId = 'user_test';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Acme Flex',
      accountType: 'CARD',
      currency: 'EUR',
    });

    const overview = await asUser.query(api.banking.accounts.listSyncOverview, {});
    const manualRow = overview.find((row) => row.account._id === accountId);
    expect(manualRow).toBeDefined();
    expect(manualRow?.syncState).toBeNull();
    expect(manualRow?.connection).toBeNull();
    expect(manualRow?.latestBalance?.amount.amountMinor).toBe(0n);
  });

  test('setAccountSyncEnabled rejects manual accounts', async () => {
    const t = createTest();
    const userId = 'user_test';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Acme Flex',
      accountType: 'CARD',
      currency: 'EUR',
    });

    await expect(
      asUser.mutation(api.banking.accounts.setAccountSyncEnabled, { accountId, syncEnabled: true }),
    ).rejects.toThrow('Manual accounts cannot be synced');
  });
});
