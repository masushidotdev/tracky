/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, components } from './_generated/api';
import schema from './schema';

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

type TestHarness = ReturnType<typeof createTest>;

const userId = 'overdraft_double_count_user';
const BOOKED_MINOR = 62784n;
const OVERDRAFT_LIMIT_MINOR = 300000n;
const WITH_OVERDRAFT_MINOR = BOOKED_MINOR + OVERDRAFT_LIMIT_MINOR;

async function seedAuthKitUser(t: TestHarness) {
  const timestamp = '2026-07-27T00:00:00.000Z';
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

/**
 * The production shape of the provider account: one fetch, two `XPCD` rows both named
 * "Expected balance" and with no reference date, differing by exactly the arranged overdraft
 * that the app already tracks as a `creditFacilities` row.
 */
async function seedAcmeAccount(t: TestHarness) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 27);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Acme Bank',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: 'acme_checking',
      name: 'ACME HOLDER',
      institutionName: 'Acme Bank',
      accountType: 'CACC',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('accountSyncStates', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'mock',
      status: 'active',
      backfillFromDate: '2026-01-01',
      syncCadenceHours: 24,
      consecutiveFailures: 0,
      nextSyncAfterMs: now,
      updatedAtMs: now,
    });

    for (const amountMinor of [WITH_OVERDRAFT_MINOR, BOOKED_MINOR]) {
      await ctx.db.insert('accountBalances', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'XPCD',
        balanceName: 'Expected balance',
        amount: { amountMinor, currency: 'EUR' },
        fetchedAtMs: now,
      });
    }

    await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Scoperto Facile 3000',
      facilityType: 'accountOverdraft',
      status: 'active',
      source: 'manual',
      linkedAccountId: accountId,
      provider: 'manual',
      limitAmount: { amountMinor: OVERDRAFT_LIMIT_MINOR, currency: 'EUR' },
      usedAmount: { amountMinor: 0n, currency: 'EUR' },
      repaymentType: 'onDemand',
      createdAtMs: now,
      updatedAtMs: now,
    });

    return accountId;
  });
}

describe('overdraft is counted once, and only where it belongs', () => {
  test('the dashboard reads the accounting position and adds the arranged limit exactly once', async () => {
    const t = createTest();
    await seedAuthKitUser(t);
    await seedAcmeAccount(t);

    const overview = await t
      .withIdentity({ subject: userId })
      .query(api.banking.dashboard.getDashboardOverview, {});
    const cash = overview.cashTotals.find((total) => total.booked.currency === 'EUR');

    // Reading the provider's overdraft-inflated row as the balance made cash 3.627,84 and
    // availability 6.627,84, because every consumer adds the limit itself.
    expect(cash?.booked.amountMinor).toBe(BOOKED_MINOR);
    expect(cash?.available.amountMinor).toBe(WITH_OVERDRAFT_MINOR);
    expect(overview.netWorth?.[0]?.cash.amountMinor).toBe(BOOKED_MINOR);
  });

  test('the accounts section shows the accounting position beside the credit line, not folded into it', async () => {
    const t = createTest();
    await seedAuthKitUser(t);
    await seedAcmeAccount(t);

    const rows = await t.withIdentity({ subject: userId }).query(api.banking.accounts.listSyncOverview, {});
    const row = rows.find((candidate) => candidate.account.institutionName === 'Acme Bank');

    expect(row?.latestBalance?.amount.amountMinor).toBe(BOOKED_MINOR);
    expect(row?.overdraftLimit?.amountMinor).toBe(OVERDRAFT_LIMIT_MINOR);
    expect(row?.availableBalance?.amountMinor).toBe(WITH_OVERDRAFT_MINOR);
  });

  test('the balance history charts the accounting position', async () => {
    const t = createTest();
    await seedAuthKitUser(t);
    const accountId = await seedAcmeAccount(t);

    const history = await t
      .withIdentity({ subject: userId })
      .query(api.banking.accounts.getBalanceHistory, { accountId });

    expect(history.map((point) => point.amount.amountMinor)).toEqual([BOOKED_MINOR]);
  });

  test('an undrawn overdraft reports no usage', async () => {
    const t = createTest();
    await seedAuthKitUser(t);
    await seedAcmeAccount(t);

    const facilities = await t
      .withIdentity({ subject: userId })
      .query(api.banking.credit.listCreditFacilities, {});

    expect(facilities[0]?.usedAmount.amountMinor).toBe(0n);
  });
});
