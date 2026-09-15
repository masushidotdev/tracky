/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, components } from './_generated/api';
import { effectiveOverdraftUsedAmount } from './banking/overdraft';
import schema from './schema';
import type { Doc, Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/balances.ts',
  './banking/credit.ts',
  './banking/creditMath.ts',
  './banking/overdraft.ts',
  './banking/statementCycles.ts',
  './lib/*.ts',
]);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthKitUser(t: TestHarness, userId: string) {
  const timestamp = '2026-07-15T00:00:00.000Z';
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

async function seedAccount(t: TestHarness, userId: string, currency = 'EUR') {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 15);
    const providerConnectionId = await ctx.db.insert('providerConnections', {
      userId,
      provider: 'mock',
      status: 'active',
      displayName: 'Mock provider',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'mock',
      providerAccountId: `account_${userId}_${currency}`,
      name: 'Checking account',
      currency,
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { accountId, providerConnectionId };
  });
}

async function seedOverdraft(
  t: TestHarness,
  input: { userId: string; linkedAccountId?: Id<'financialAccounts'>; usedAmountMinor: bigint },
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 15);
    return await ctx.db.insert('creditFacilities', {
      userId: input.userId,
      name: 'Account overdraft',
      facilityType: 'accountOverdraft',
      status: 'active',
      source: 'manual',
      linkedAccountId: input.linkedAccountId,
      provider: 'manual',
      limitAmount: { amountMinor: 100000n, currency: 'EUR' },
      usedAmount: { amountMinor: input.usedAmountMinor, currency: 'EUR' },
      repaymentType: 'onDemand',
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

describe('account overdraft usage', () => {
  test('derives usage from the linked account balance and falls back for a legacy unlinked facility', async () => {
    const t = createTest();
    const userId = 'overdraft_helper_user';
    const { accountId, providerConnectionId } = await seedAccount(t, userId);
    const linkedFacilityId = await seedOverdraft(t, { userId, linkedAccountId: accountId, usedAmountMinor: 90000n });
    const legacyFacilityId = await seedOverdraft(t, { userId, usedAmountMinor: 12000n });

    await t.run(async (ctx) => {
      await ctx.db.insert('accountBalances', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        balanceType: 'closingBooked',
        amount: { amountMinor: -34567n, currency: 'EUR' },
        fetchedAtMs: Date.UTC(2026, 6, 15),
      });
    });

    const result = await t.run(async (ctx) => {
      const linkedFacility = (await ctx.db.get('creditFacilities', linkedFacilityId)) as Doc<'creditFacilities'>;
      const legacyFacility = (await ctx.db.get('creditFacilities', legacyFacilityId)) as Doc<'creditFacilities'>;
      return {
        linked: await effectiveOverdraftUsedAmount(ctx, linkedFacility),
        legacy: await effectiveOverdraftUsedAmount(ctx, legacyFacility),
      };
    });

    expect(result.linked).toEqual({ amountMinor: 34567n, currency: 'EUR' });
    expect(result.legacy).toEqual({ amountMinor: 12000n, currency: 'EUR' });
  });

  test('rejects manual usage updates for overdrafts', async () => {
    const t = createTest();
    const userId = 'overdraft_usage_mutation_user';
    await seedAuthKitUser(t, userId);
    const { accountId } = await seedAccount(t, userId);
    const creditFacilityId = await seedOverdraft(t, { userId, linkedAccountId: accountId, usedAmountMinor: 0n });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.credit.updateCreditFacilityUsage, {
        creditFacilityId,
        usedAmount: { amountMinor: 5000n, currency: 'EUR' },
      }),
    ).rejects.toThrow('derived from the linked account balance');
  });

  test('requires a same-currency linked account on create and prevents unlinking on update', async () => {
    const t = createTest();
    const userId = 'overdraft_link_validation_user';
    await seedAuthKitUser(t, userId);
    const { accountId } = await seedAccount(t, userId);
    const { accountId: usdAccountId } = await seedAccount(t, userId, 'USD');

    const baseArgs = {
      name: 'Overdraft',
      facilityType: 'accountOverdraft' as const,
      limitAmount: { amountMinor: 100000n, currency: 'EUR' },
      repaymentType: 'onDemand' as const,
    };

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.credit.createCreditFacility, baseArgs),
    ).rejects.toThrow('require a linked account');
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.credit.createCreditFacility, {
        ...baseArgs,
        linkedAccountId: usdAccountId,
      }),
    ).rejects.toThrow('currency must match');

    const creditFacilityId = await t
      .withIdentity({ subject: userId })
      .mutation(api.banking.credit.createCreditFacility, {
        ...baseArgs,
        linkedAccountId: accountId,
        usedAmount: { amountMinor: 42000n, currency: 'EUR' },
      });
    const facility = await t.run(async (ctx) => await ctx.db.get('creditFacilities', creditFacilityId));
    expect(facility?.usedAmount).toEqual({ amountMinor: 0n, currency: 'EUR' });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.banking.credit.updateCreditFacility, {
        creditFacilityId,
        linkedAccountId: null,
      }),
    ).rejects.toThrow('cannot be unlinked');
  });
});
