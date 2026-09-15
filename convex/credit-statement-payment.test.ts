/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { api, components } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/credit.ts',
  './banking/creditMath.ts',
  './banking/statementCycles.ts',
  './banking/overdraft.ts',
  './banking/balances.ts',
  './lib/*.ts',
]);

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

type StatementFixture = {
  userId: string;
  accountId: Id<'financialAccounts'>;
  creditFacilityId: Id<'creditFacilities'>;
  usageCycleId: Id<'creditFacilityUsageCycles'>;
  transactionId: Id<'transactions'>;
};

async function seedStatementFixture(t: TestHarness): Promise<StatementFixture> {
  const userId = 'user_test';
  await seedAuthKitUser(t, userId);
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 5, 30);
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
      providerAccountId: 'acme_checking',
      name: 'Acme Bank',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const creditFacilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Acme Card',
      facilityType: 'cardCreditLine',
      status: 'active',
      source: 'manual',
      linkedAccountId: accountId,
      provider: 'manual',
      limitAmount: { amountMinor: 500000n, currency: 'EUR' },
      usedAmount: { amountMinor: 0n, currency: 'EUR' },
      repaymentType: 'statementBalance',
      paymentDayOfMonth: 7,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const usageCycleId = await ctx.db.insert('creditFacilityUsageCycles', {
      userId,
      creditFacilityId,
      cycleMonth: '2026-06',
      status: 'scheduled',
      trackedAmount: { amountMinor: 203193n, currency: 'EUR' },
      dueDate: '2026-07-07',
      closedAtMs: now,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const transactionId = await ctx.db.insert('transactions', {
      userId,
      accountId,
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

    return { userId, accountId, creditFacilityId, usageCycleId, transactionId };
  });
}

describe('usage cycle payment candidates', () => {
  test('suggests the matching statement debit on the linked account', async () => {
    const t = createTest();
    const fixture = await seedStatementFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    const candidates = await asUser.query(api.banking.credit.listUsageCyclePaymentCandidates, {
      asOfDate: '2026-07-08',
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      usageCycleId: fixture.usageCycleId,
      cycleMonth: '2026-06',
      confirmable: true,
    });
    expect(candidates[0].transaction._id).toBe(fixture.transactionId);
    expect(candidates[0].amountDelta.amountMinor).toBe(0n);
  });

  test('skips transactions classified as transfer', async () => {
    const t = createTest();
    const fixture = await seedStatementFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionId, { classificationKind: 'transfer' });
    });

    const candidates = await t
      .withIdentity({ subject: fixture.userId })
      .query(api.banking.credit.listUsageCyclePaymentCandidates, { asOfDate: '2026-07-08' });

    expect(candidates).toHaveLength(0);
  });
});

describe('confirmUsageCyclePaymentTransaction', () => {
  test('marks the cycle paid and reclassifies the transaction as internal', async () => {
    const t = createTest();
    const fixture = await seedStatementFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    await asUser.mutation(api.banking.credit.confirmUsageCyclePaymentTransaction, {
      usageCycleId: fixture.usageCycleId,
      transactionId: fixture.transactionId,
    });

    const { cycle, transaction } = await t.run(async (ctx) => ({
      cycle: await ctx.db.get('creditFacilityUsageCycles', fixture.usageCycleId),
      transaction: await ctx.db.get('transactions', fixture.transactionId),
    }));
    expect(cycle).toMatchObject({ status: 'paid', transactionId: fixture.transactionId });
    expect(cycle?.paidAtMs).toBeTypeOf('number');
    expect(transaction).toMatchObject({
      classificationKind: 'internal',
      classificationSource: 'user',
      classificationConfidence: 1,
    });
  });

  test('is idempotent and hides the cycle from further candidates', async () => {
    const t = createTest();
    const fixture = await seedStatementFixture(t);
    const asUser = t.withIdentity({ subject: fixture.userId });

    const first = await asUser.mutation(api.banking.credit.confirmUsageCyclePaymentTransaction, {
      usageCycleId: fixture.usageCycleId,
      transactionId: fixture.transactionId,
    });
    const second = await asUser.mutation(api.banking.credit.confirmUsageCyclePaymentTransaction, {
      usageCycleId: fixture.usageCycleId,
      transactionId: fixture.transactionId,
    });
    expect(second).toBe(first);

    const candidates = await asUser.query(api.banking.credit.listUsageCyclePaymentCandidates, {
      asOfDate: '2026-07-08',
    });
    expect(candidates).toHaveLength(0);
  });

  test('rejects a transaction classified as transfer', async () => {
    const t = createTest();
    const fixture = await seedStatementFixture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch('transactions', fixture.transactionId, { classificationKind: 'transfer' });
    });

    await expect(
      t.withIdentity({ subject: fixture.userId }).mutation(api.banking.credit.confirmUsageCyclePaymentTransaction, {
        usageCycleId: fixture.usageCycleId,
        transactionId: fixture.transactionId,
      }),
    ).rejects.toThrow('Only booked debit transactions can be linked to statement payments');
  });

  test('rejects a transaction from a different user', async () => {
    const t = createTest();
    const fixture = await seedStatementFixture(t);
    const intruderUserId = 'user_intruder';
    await seedAuthKitUser(t, intruderUserId);

    await expect(
      t.withIdentity({ subject: intruderUserId }).mutation(api.banking.credit.confirmUsageCyclePaymentTransaction, {
        usageCycleId: fixture.usageCycleId,
        transactionId: fixture.transactionId,
      }),
    ).rejects.toThrow('Credit usage cycle not found');
  });
});
