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
  await t.run(async (ctx) => {
    const openingBalance = await ctx.db
      .query('accountBalances')
      .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', cardAccountId))
      .unique();
    if (!openingBalance) throw new Error('Opening card balance not found');
    // Equal fetchedAtMs values are one provider snapshot, not successive manual balances.
    await ctx.db.patch('accountBalances', openingBalance._id, { fetchedAtMs: 1 });
  });
  // Outstanding card balance: -800.00 EUR.
  await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
    accountId: cardAccountId,
    direction: 'DBIT',
    amount: { amountMinor: 80000n, currency: 'EUR' },
    bookingDate: '2026-07-01',
    description: 'Saldo iniziale carta',
    classificationKind: 'internal',
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
      linkedAccountId: cardAccountId,
      settlementAccountId: checkingAccountId,
      provider: 'manual',
      limitAmount: { amountMinor: 250000n, currency: 'EUR' },
      usedAmount: { amountMinor: 0n, currency: 'EUR' },
      repaymentType: 'statementBalance',
      paymentDayOfMonth: 5,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const legacyFacilityId = await ctx.db.insert('creditFacilities', {
      userId,
      name: 'Legacy card',
      facilityType: 'cardCreditLine',
      status: 'active',
      source: 'manual',
      linkedAccountId: checkingAccountId,
      provider: 'manual',
      limitAmount: { amountMinor: 100000n, currency: 'EUR' },
      usedAmount: { amountMinor: 12300n, currency: 'EUR' },
      repaymentType: 'statementBalance',
      paymentDayOfMonth: 5,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { checkingAccountId, cardFacilityId, legacyFacilityId };
  });

  return { asUser, cardAccountId, ...seeded };
}

describe('derived card facility usage', () => {
  test('listCreditFacilities derives usage from the card balance and flags it', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const facilities = await fixture.asUser.query(api.banking.credit.listCreditFacilities, {});
    const cardFacility = facilities.find((facility) => facility._id === fixture.cardFacilityId);
    const legacyFacility = facilities.find((facility) => facility._id === fixture.legacyFacilityId);

    expect(cardFacility?.usedAmount.amountMinor).toBe(80000n);
    expect(cardFacility?.currentStatementAmount.amountMinor).toBe(80000n);
    expect(cardFacility?.usageDerived).toBe(true);
    expect(cardFacility?.summary.availableAmount.amountMinor).toBe(170000n);
    // Linked to a CACC account: stays on manual usage.
    expect(legacyFacility?.usedAmount.amountMinor).toBe(12300n);
    expect(legacyFacility?.currentStatementAmount.amountMinor).toBe(12300n);
    expect(legacyFacility?.usageDerived).toBe(false);
  });

  test('a CARD account is rejected as settlement account (swapped selects)', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    await expect(
      fixture.asUser.mutation(api.banking.credit.updateCreditFacility, {
        creditFacilityId: fixture.cardFacilityId,
        settlementAccountId: fixture.cardAccountId,
      }),
    ).rejects.toThrow('The settlement account must be a cash account, not a card');
  });

  test('settlement accounts must be owned, active, non-CARD, and use the facility currency', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    const { pausedAccountId, usdAccountId, foreignAccountId } = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 2);
      const base = {
        provider: 'mock' as const,
        status: 'active' as const,
        syncEnabled: false,
        createdAtMs: now,
        updatedAtMs: now,
      };
      const pausedId = await ctx.db.insert('financialAccounts', {
        ...base,
        userId,
        name: 'Paused checking',
        accountType: 'CACC',
        currency: 'EUR',
        status: 'paused',
      });
      const usdId = await ctx.db.insert('financialAccounts', {
        ...base,
        userId,
        name: 'USD checking',
        accountType: 'CACC',
        currency: 'USD',
      });
      const foreignId = await ctx.db.insert('financialAccounts', {
        ...base,
        userId: 'another_user',
        name: 'Foreign checking',
        accountType: 'CACC',
        currency: 'EUR',
      });
      return { pausedAccountId: pausedId, usdAccountId: usdId, foreignAccountId: foreignId };
    });

    await expect(
      fixture.asUser.mutation(api.banking.credit.updateCreditFacility, {
        creditFacilityId: fixture.cardFacilityId,
        settlementAccountId: pausedAccountId,
      }),
    ).rejects.toThrow('The settlement account must be active');
    await expect(
      fixture.asUser.mutation(api.banking.credit.updateCreditFacility, {
        creditFacilityId: fixture.cardFacilityId,
        settlementAccountId: usdAccountId,
      }),
    ).rejects.toThrow('The settlement account currency must match the credit facility currency');
    await expect(
      fixture.asUser.mutation(api.banking.credit.updateCreditFacility, {
        creditFacilityId: fixture.cardFacilityId,
        settlementAccountId: foreignAccountId,
      }),
    ).rejects.toThrow('Account not found');

    await expect(
      fixture.asUser.mutation(api.banking.credit.updateCreditFacility, {
        creditFacilityId: fixture.cardFacilityId,
        settlementAccountId: fixture.checkingAccountId,
      }),
    ).resolves.toBe(fixture.cardFacilityId);
  });

  test('manual usage updates are rejected for CARD-linked facilities', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    await expect(
      fixture.asUser.mutation(api.banking.credit.updateCreditFacilityUsage, {
        creditFacilityId: fixture.cardFacilityId,
        usedAmount: { amountMinor: 100n, currency: 'EUR' },
      }),
    ).rejects.toThrow('Card credit usage is derived from the linked card account balance');

    await fixture.asUser.mutation(api.banking.credit.updateCreditFacilityUsage, {
      creditFacilityId: fixture.legacyFacilityId,
      usedAmount: { amountMinor: 100n, currency: 'EUR' },
    });
  });

  test('closing the month snapshots the derived amount without resetting it', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    const cycleId = await fixture.asUser.mutation(api.banking.credit.closeCreditFacilityUsageCycle, {
      creditFacilityId: fixture.cardFacilityId,
      cycleMonth: '2026-07',
    });

    const cycle = await t.run(async (ctx) => await ctx.db.get('creditFacilityUsageCycles', cycleId));
    expect(cycle).toMatchObject({
      status: 'scheduled',
      trackedAmount: { amountMinor: 80000n, currency: 'EUR' },
      dueDate: '2026-08-05',
    });

    const facilities = await fixture.asUser.query(api.banking.credit.listCreditFacilities, {});
    const cardFacility = facilities.find((facility) => facility._id === fixture.cardFacilityId);
    // Derived usage stays occupied until the settlement credits the card.
    expect(cardFacility?.usedAmount.amountMinor).toBe(80000n);
    // The same amount is already scheduled, so the newly opened cycle starts at zero.
    expect(cardFacility?.currentStatementAmount.amountMinor).toBe(0n);
  });

  test('closes only usage not covered by an earlier statement and targets the earliest open cycle', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    await fixture.asUser.mutation(api.banking.credit.closeCreditFacilityUsageCycle, {
      creditFacilityId: fixture.cardFacilityId,
      cycleMonth: '2026-07',
    });
    await fixture.asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: fixture.cardAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 2500n, currency: 'EUR' },
      bookingDate: '2026-08-10',
      description: 'New cycle purchase',
      classificationKind: 'expense',
    });

    const beforeClose = await fixture.asUser.query(api.banking.credit.listCreditFacilities, {});
    expect(
      beforeClose.find((facility) => facility._id === fixture.cardFacilityId)?.currentStatementAmount.amountMinor,
    ).toBe(2500n);

    const cycleId = await fixture.asUser.mutation(api.banking.credit.closeCreditFacilityUsageCycle, {
      creditFacilityId: fixture.cardFacilityId,
    });
    const stored = await t.run(async (ctx) => ({
      cycle: await ctx.db.get('creditFacilityUsageCycles', cycleId),
      cycles: await ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_creditFacilityId_and_status', (q) =>
          q.eq('creditFacilityId', fixture.cardFacilityId).eq('status', 'scheduled'),
        )
        .take(10),
    }));
    const afterClose = await fixture.asUser.query(api.banking.credit.listCreditFacilities, {});
    const facility = afterClose.find((candidate) => candidate._id === fixture.cardFacilityId);

    expect(stored.cycle).toMatchObject({
      cycleMonth: '2026-08',
      dueDate: '2026-09-05',
      trackedAmount: { amountMinor: 2500n, currency: 'EUR' },
      status: 'scheduled',
    });
    expect(stored.cycles.map((cycle) => cycle.trackedAmount.amountMinor).sort()).toEqual([2500n, 80000n]);
    expect(facility?.usedAmount.amountMinor).toBe(82500n);
    expect(facility?.currentStatementAmount.amountMinor).toBe(0n);
  });

  test('planning routes the scheduled statement to the settlement account and stops double-projecting', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    await fixture.asUser.mutation(api.banking.credit.closeCreditFacilityUsageCycle, {
      creditFacilityId: fixture.cardFacilityId,
      cycleMonth: '2026-07',
    });

    const summary = await t.query(internal.banking.planning.getFutureCashflowForUser, {
      userId,
      asOfDate: '2026-07-15',
      monthsAhead: 2,
    });

    const statementItems = summary.upcomingItems.filter(
      (item: { source: string; creditFacilityId?: Id<'creditFacilities'> }) =>
        item.source === 'creditStatement' && item.creditFacilityId === fixture.cardFacilityId,
    );
    // One scheduled statement, no projection on top (derived - scheduled = 0).
    expect(statementItems).toHaveLength(1);
    expect(statementItems[0].key).toMatch(/^creditStatement:/);
    expect(statementItems[0].amount.amountMinor).toBe(80000n);

    const settlementGroup = summary.upcomingItemsByAccount.find(
      (group: { accountId: string }) => group.accountId === fixture.checkingAccountId,
    );
    expect(
      settlementGroup?.items.some(
        (item: { source: string; creditFacilityId?: Id<'creditFacilities'> }) =>
          item.source === 'creditStatement' && item.creditFacilityId === fixture.cardFacilityId,
      ),
    ).toBe(true);

    const cardGroup = summary.upcomingItemsByAccount.find(
      (group: { accountId: string }) => group.accountId === fixture.cardAccountId,
    );
    expect(cardGroup?.items.some((item: { source: string }) => item.source === 'creditStatement') ?? false).toBe(false);
  });

  test('planning excludes CARD balances from aggregate liquidity and negative dates', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);
    await t.run(async (ctx) => {
      const account = await ctx.db.get('financialAccounts', fixture.checkingAccountId);
      if (!account?.providerConnectionId) throw new Error('Missing checking account connection');
      await ctx.db.patch('creditFacilities', fixture.legacyFacilityId, {
        status: 'paused',
        updatedAtMs: Date.UTC(2026, 6, 15),
      });
      await ctx.db.insert('accountBalances', {
        userId,
        accountId: account._id,
        providerConnectionId: account.providerConnectionId,
        provider: account.provider,
        balanceType: 'closingBooked',
        amount: { amountMinor: 100000n, currency: 'EUR' },
        referenceDate: '2026-07-15',
        fetchedAtMs: Date.UTC(2026, 6, 15),
      });
    });
    await fixture.asUser.mutation(api.banking.credit.closeCreditFacilityUsageCycle, {
      creditFacilityId: fixture.cardFacilityId,
      cycleMonth: '2026-07',
    });

    const view = await t.query(internal.banking.planning.getPlanningCashflowViewForUser, {
      userId,
      asOfDate: '2026-07-15',
      cycleOffset: 1,
    });

    expect(view.aggregateEndBalance).toEqual({ amountMinor: 20000n, currency: 'EUR' });
    expect(view.aggregateSeries.at(-1)?.projectedBalanceAfter).toEqual({ amountMinor: 20000n, currency: 'EUR' });
    expect(view.firstNegativeDate).toBeUndefined();
    expect(view.aggregateFirstNegativeDate).toBeUndefined();
  });
});

describe('dashboard net worth with CARD accounts', () => {
  test('counts the card debt exactly once and never as cash', async () => {
    const t = createTest();
    const fixture = await seedFixture(t);

    await fixture.asUser.mutation(api.banking.credit.closeCreditFacilityUsageCycle, {
      creditFacilityId: fixture.cardFacilityId,
      cycleMonth: '2026-07',
    });
    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 15);
      await ctx.db.insert('creditFacilityInstallmentPlans', {
        userId,
        creditFacilityId: fixture.cardFacilityId,
        name: 'Purchase converted to installments',
        principalAmount: { amountMinor: 50000n, currency: 'EUR' },
        outstandingAmount: { amountMinor: 50000n, currency: 'EUR' },
        monthlyPaymentAmount: { amountMinor: 10000n, currency: 'EUR' },
        installmentCount: 5,
        remainingInstallments: 5,
        startDate: '2026-07-01',
        nextPaymentDate: '2026-08-01',
        endDate: '2026-12-01',
        status: 'active',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const overview = await fixture.asUser.query(api.banking.dashboard.getDashboardOverview, {});
    const netWorth = overview.netWorth?.find((entry: { cash: { currency: string } }) => entry.cash.currency === 'EUR');

    // Cash: card balance (-800) excluded entirely; checking has no balance rows.
    expect(netWorth?.cash.amountMinor).toBe(0n);
    // Debts: 800 from the card balance once. Both the scheduled cycle and the
    // active installment plan on that facility are views over the same debt.
    expect(netWorth?.debts.amountMinor).toBe(80000n);
    expect(netWorth?.netWorth.amountMinor).toBe(-80000n);
  });
});
