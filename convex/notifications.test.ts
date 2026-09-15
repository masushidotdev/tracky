/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { insertPlannedExpense } from './plannedTransactionsTestHelpers';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './notifications.ts',
  './banking/*.ts',
  './lib/*.ts',
]);

function createTest() {
  return convexTest(schema, modules);
}

async function seedPlannedExpense(
  t: ReturnType<typeof createTest>,
  input: {
    userId: string;
    dueDate: string;
    recurrenceInterval?: 'day' | 'week' | 'month' | 'year';
    recurrenceIntervalCount?: number;
    status?: 'planned' | 'funding';
  },
) {
  return await t.run(async (ctx): Promise<Id<'plannedTransactions'>> => {
    const now = Date.UTC(2026, 6, 1);
    return await insertPlannedExpense(ctx, {
      userId: input.userId,
      name: 'Electricity',
      amount: { amountMinor: 12345n, currency: 'EUR' },
      direction: 'outflow',
      dueDate: input.dueDate,
      recurrenceInterval: input.recurrenceInterval,
      recurrenceIntervalCount: input.recurrenceIntervalCount,
      status: input.status ?? 'planned',
      source: 'manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
  });
}

async function seedNotificationPlan(
  t: ReturnType<typeof createTest>,
  userId: string,
  buckets: Array<{
    name: string;
    assignedMinor: bigint;
    spendingMinor: bigint;
    hidden?: boolean;
    groupHidden?: boolean;
    snoozed?: boolean;
  }>,
) {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 6, 1);
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
      providerAccountId: `${userId}_plan`,
      name: 'Current account',
      accountType: 'CACC',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('accountBalances', {
      userId,
      accountId,
      providerConnectionId,
      provider: 'mock',
      balanceType: 'closingBooked',
      amount: { amountMinor: 100_000n, currency: 'EUR' },
      fetchedAtMs: now,
    });
    const planId = await ctx.db.insert('plans', {
      userId,
      name: 'Plan',
      currency: 'EUR',
      startPeriod: '2026-07',
      accountIds: [accountId],
      isDefault: true,
      sortOrder: 1000,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const bucketIds: Record<string, Id<'planBuckets'>> = {};
    const categoryIds: Record<string, Id<'categories'>> = {};

    for (const [index, definition] of buckets.entries()) {
      const groupId = await ctx.db.insert('planGroups', {
        planId,
        userId,
        name: `Group ${index}`,
        sortOrder: (index + 1) * 1000,
        collapsed: false,
        hidden: definition.groupHidden ?? false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const categoryId = await ctx.db.insert('categories', {
        userId,
        name: definition.name,
        kind: 'expense',
        applicableKinds: ['expense'],
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      categoryIds[definition.name] = categoryId;
      const bucketId = await ctx.db.insert('planBuckets', {
        planId,
        userId,
        groupId,
        name: definition.name,
        sortOrder: 1000,
        hidden: definition.hidden ?? false,
        isUnplanned: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      bucketIds[definition.name] = bucketId;
      await ctx.db.insert('planBucketCategories', {
        planId,
        userId,
        bucketId,
        categoryId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('planAssignments', {
        planId,
        userId,
        bucketId,
        period: '2026-07',
        assignedMinor: definition.assignedMinor,
        currency: 'EUR',
        createdAtMs: now,
        updatedAtMs: now,
      });
      if (definition.snoozed) {
        await ctx.db.insert('planTargets', {
          planId,
          userId,
          bucketId,
          cadence: 'monthly',
          behaviour: 'setAside',
          amountMinor: definition.assignedMinor,
          currency: 'EUR',
          dayOfMonth: 31,
          repeats: true,
          snoozedPeriods: ['2026-07'],
        });
      }
      await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: `${userId}_${index}`,
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: definition.spendingMinor, currency: 'EUR' },
        bookingDate: '2026-07-15',
        description: definition.name,
        classificationKind: 'expense',
        classificationSource: 'user',
        categoryId,
        importedAtMs: now,
        updatedAtMs: now,
      });
    }

    const unplannedGroupId = await ctx.db.insert('planGroups', {
      planId,
      userId,
      name: 'Other',
      sortOrder: (buckets.length + 1) * 1000,
      collapsed: false,
      hidden: false,
      createdAtMs: now,
      updatedAtMs: now,
    });
    await ctx.db.insert('planBuckets', {
      planId,
      userId,
      groupId: unplannedGroupId,
      name: 'Unplanned',
      sortOrder: 1000,
      hidden: false,
      isUnplanned: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { planId, bucketIds, categoryIds, accountId, providerConnectionId };
  });
}

describe('notifications', () => {
  test('collects upcoming payment candidates and dedupes persisted notifications', async () => {
    const t = createTest();
    const userId = 'user_test';

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 1);
      await ctx.db.insert('subscriptions', {
        userId,
        name: 'Acme Streaming',
        merchantName: 'Acme Streaming',
        amount: {
          amountMinor: 1299n,
          currency: 'EUR',
        },
        interval: 'month',
        intervalCount: 1,
        status: 'active',
        startDate: '2026-01-15',
        nextDueDate: '2026-07-08',
        trialPeriodDays: 0,
        source: 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const candidates = await t.query(internal.notifications.collectCandidatesForUser, {
      userId,
      asOfDate: '2026-07-06',
    });
    const subscriptionCandidate = candidates.find((candidate) =>
      candidate.dedupeKey.startsWith('subscription:'),
    );

    expect(subscriptionCandidate).toMatchObject({
      bodyKey: 'notifications.payment.subscription.body',
      severity: 'info',
      type: 'upcomingPayment',
    });

    const first = await t.mutation(internal.notifications.upsertCandidates, { candidates });
    const second = await t.mutation(internal.notifications.upsertCandidates, { candidates });

    expect(first.inserted).toBeGreaterThan(0);
    expect(first.insertedIds).toHaveLength(first.inserted);
    expect(second.inserted).toBe(0);
    expect(second.insertedIds).toEqual([]);
    expect(second.updated).toBe(candidates.length);

    const notifications = await t.run(async (ctx) => {
      return await ctx.db
        .query('notifications')
        .withIndex('by_userId_and_createdAtMs', (q) => q.eq('userId', userId))
        .take(10);
    });

    expect(notifications).toHaveLength(candidates.length);
    expect(notifications.some((notification) => notification.dedupeKey.startsWith('subscription:'))).toBe(true);
  });

  test('accepts and dedupes proactive analyst notification types', async () => {
    const t = createTest();
    const candidate = {
      userId: 'user_test',
      type: 'analystReport' as const,
      severity: 'info' as const,
      titleKey: 'notifications.report.title',
      bodyKey: 'notifications.report.body',
      params: { period: '2026-06', threadId: 'thread_1' },
      dedupeKey: 'analyst:report:monthly:2026-06',
    };
    const first = await t.mutation(internal.notifications.upsertCandidates, { candidates: [candidate] });
    const second = await t.mutation(internal.notifications.upsertCandidates, { candidates: [candidate] });
    expect(first).toMatchObject({ inserted: 1, updated: 0 });
    expect(first.insertedIds).toHaveLength(1);
    expect(second).toEqual({ inserted: 0, updated: 1, insertedIds: [] });
  });

  test('emits a bill reminder at the default lead boundary but not before it', async () => {
    const t = createTest();
    const userId = 'user_bill_boundary';
    const plannedExpenseId = await seedPlannedExpense(t, { userId, dueDate: '2026-07-10' });

    const before = await t.query(internal.notifications.collectCandidatesForUser, {
      userId,
      asOfDate: '2026-07-06',
    });
    const atBoundary = await t.query(internal.notifications.collectCandidatesForUser, {
      userId,
      asOfDate: '2026-07-07',
    });

    expect(before.some((candidate) => candidate.type === 'billReminder')).toBe(false);
    expect(atBoundary.find((candidate) => candidate.type === 'billReminder')).toMatchObject({
      dedupeKey: `billReminder:${plannedExpenseId}:2026-07-10:3`,
      severity: 'info',
      titleKey: 'notifications.billReminder.title',
      bodyKey: 'notifications.billReminder.body',
      params: {
        name: 'Electricity',
        date: '2026-07-10',
        amount: '123.45',
        currency: 'EUR',
      },
    });
  });

  test('suppresses paid planned-expense occurrences', async () => {
    const t = createTest();
    const userId = 'user_bill_paid';
    const plannedExpenseId = await seedPlannedExpense(t, { userId, dueDate: '2026-07-10' });
    await t.run(async (ctx) => {
      await ctx.db.insert('plannedExpenseOccurrencePayments', {
        userId,
        plannedTransactionId: plannedExpenseId,
        dueDate: '2026-07-10',
        status: 'paid',
        source: 'manual',
        paidAtMs: Date.UTC(2026, 6, 5),
        updatedAtMs: Date.UTC(2026, 6, 5),
      });
    });

    const candidates = await t.query(internal.notifications.collectCandidatesForUser, {
      userId,
      asOfDate: '2026-07-07',
    });
    expect(candidates.some((candidate) => candidate.type === 'billReminder')).toBe(false);
  });

  test('advances a recurring expense with a past stored due date to its next occurrence', async () => {
    const t = createTest();
    const userId = 'user_bill_recurring';
    const plannedExpenseId = await seedPlannedExpense(t, {
      userId,
      dueDate: '2026-06-10',
      recurrenceInterval: 'month',
      recurrenceIntervalCount: 1,
    });

    const candidates = await t.query(internal.notifications.collectCandidatesForUser, {
      userId,
      asOfDate: '2026-07-07',
    });
    expect(candidates.find((candidate) => candidate.type === 'billReminder')?.dedupeKey).toBe(
      `billReminder:${plannedExpenseId}:2026-07-10:3`,
    );
  });

  test('honors custom lead days and dedupes the same reminder on a second persistence run', async () => {
    const t = createTest();
    const userId = 'user_bill_custom';
    const plannedExpenseId = await seedPlannedExpense(t, { userId, dueDate: '2026-07-10' });
    await t.run(async (ctx) => {
      await ctx.db.insert('userSettings', {
        userId,
        notifications: {
          billReminderLeadDays: [1, 5],
          emailEnabled: false,
          telegramEnabled: false,
        },
        createdAtMs: Date.UTC(2026, 6, 1),
        updatedAtMs: Date.UTC(2026, 6, 1),
      });
    });

    const candidates = await t.query(internal.notifications.collectCandidatesForUser, {
      userId,
      asOfDate: '2026-07-06',
    });
    const reminder = candidates.find((candidate) => candidate.type === 'billReminder');
    expect(reminder?.dedupeKey).toBe(`billReminder:${plannedExpenseId}:2026-07-10:5`);

    const first = await t.mutation(internal.notifications.upsertCandidates, { candidates });
    const second = await t.mutation(internal.notifications.upsertCandidates, { candidates });
    expect(first.insertedIds).toHaveLength(first.inserted);
    expect(second).toEqual({ inserted: 0, updated: candidates.length, insertedIds: [] });
  });

  test('evaluates users whose only notification source is a planned expense', async () => {
    const t = createTest();
    const userId = 'user_planned_only';
    await seedPlannedExpense(t, { userId, dueDate: '2026-07-10' });

    const userIds = await t.query(internal.notifications.listNotificationUserIds, { limit: 50 });
    expect(userIds).toContain(userId);
    const candidates = await t.query(internal.notifications.collectCandidatesForUser, {
      userId,
      asOfDate: '2026-07-07',
    });
    expect(candidates.some((candidate) => candidate.type === 'billReminder')).toBe(true);
  });

  test('emits exactly one Plan overspend candidate with a semantic dedupe key', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T08:00:00.000Z'));
    try {
      const t = createTest();
      const userId = 'user_plan_overspend';
      const fixture = await seedNotificationPlan(t, userId, [
        { name: 'Groceries', assignedMinor: 10_000n, spendingMinor: 11_000n },
        { name: 'Hidden bucket', assignedMinor: 1_000n, spendingMinor: 2_000n, hidden: true },
        { name: 'Hidden group', assignedMinor: 1_000n, spendingMinor: 2_000n, groupHidden: true },
        { name: 'Snoozed bucket', assignedMinor: 1_000n, spendingMinor: 2_000n, snoozed: true },
      ]);

      const userIds = await t.query(internal.notifications.listNotificationUserIds, { limit: 50 });
      const candidates = await t.query(internal.notifications.collectCandidatesForUser, {
        userId,
        asOfDate: '2026-07-20',
      });
      const overspendCandidates = candidates.filter((candidate) => candidate.type === 'budgetOverspend');

      expect(userIds).toContain(userId);
      expect(overspendCandidates).toEqual([
        {
          userId,
          type: 'budgetOverspend',
          severity: 'critical',
          titleKey: 'notifications.plan.overspent.title',
          bodyKey: 'notifications.plan.overspent.body',
          params: { bucket: 'Groceries', percent: 110, period: '2026-07' },
          dedupeKey: `plan:${fixture.planId}:2026-07:${fixture.bucketIds.Groceries}:overspent`,
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not count the following month toward Plan alerts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T08:00:00.000Z'));
    try {
      const t = createTest();
      const userId = 'user_plan_month_boundary';
      const fixture = await seedNotificationPlan(t, userId, [
        { name: 'Groceries', assignedMinor: 10_000n, spendingMinor: 8_999n },
      ]);
      await t.run(async (ctx) => {
        await ctx.db.insert('transactions', {
          userId,
          accountId: fixture.accountId,
          providerConnectionId: fixture.providerConnectionId,
          provider: 'mock',
          dedupeKey: 'plan_2026-08-01',
          status: 'BOOK',
          direction: 'DBIT',
          amount: { amountMinor: 10_000n, currency: 'EUR' },
          bookingDate: '2026-08-01',
          description: 'Following month purchase',
          classificationKind: 'expense',
          classificationSource: 'user',
          categoryId: fixture.categoryIds.Groceries,
          importedAtMs: Date.UTC(2026, 6, 1),
          updatedAtMs: Date.UTC(2026, 6, 1),
        });
      });

      const candidates = await t.query(internal.notifications.collectCandidatesForUser, {
        userId,
        asOfDate: '2026-07-20',
      });
      expect(candidates.some((candidate) => candidate.type === 'budgetOverspend')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a second full evaluation inserts no duplicate bill reminder', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T08:00:00.000Z'));
    try {
      const t = createTest();
      await seedPlannedExpense(t, { userId: 'user_evaluation_dedupe', dueDate: '2026-07-10' });

      const first = await t.action(internal.notifications.evaluateNotifications, { limit: 50 });
      const second = await t.action(internal.notifications.evaluateNotifications, { limit: 50 });

      expect(first).toMatchObject({ inserted: 1, updated: 0, usersChecked: 1 });
      expect(second).toMatchObject({ inserted: 0, updated: 1, usersChecked: 1 });
    } finally {
      vi.useRealTimers();
    }
  });
});
