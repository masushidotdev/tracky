/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { expect, test } from 'vitest';
import { internal } from './_generated/api';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './migrations.ts', './banking/*.ts', './lib/*.ts']);

const moneyAmountValidator = v.object({ amountMinor: v.int64(), currency: v.string() });

const legacyPlanningCleanupSchema = defineSchema({
  plannedExpenses: defineTable({
    userId: v.string(),
    name: v.string(),
    amount: moneyAmountValidator,
    dueDate: v.string(),
    status: v.union(v.literal('planned'), v.literal('funding'), v.literal('paid'), v.literal('cancelled')),
    source: v.union(v.literal('manual'), v.literal('suggested'), v.literal('subscription')),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  }),
  plannedTransfers: defineTable({
    userId: v.string(),
    name: v.string(),
    amount: moneyAmountValidator,
    scheduledDate: v.string(),
    status: v.union(v.literal('planned'), v.literal('completed'), v.literal('cancelled')),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  }),
  plannedTransactions: defineTable({
    userId: v.string(),
    name: v.string(),
    amount: moneyAmountValidator,
    dueDate: v.string(),
    kind: v.union(v.literal('expense'), v.literal('income'), v.literal('transfer'), v.literal('internal')),
    direction: v.optional(v.union(v.literal('inflow'), v.literal('outflow'))),
    status: v.union(v.literal('planned'), v.literal('funding'), v.literal('paid'), v.literal('cancelled')),
    source: v.union(v.literal('manual'), v.literal('suggested'), v.literal('subscription')),
    migratedFromExpenseId: v.optional(v.id('plannedExpenses')),
    migratedFromTransferId: v.optional(v.id('plannedTransfers')),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
  }),
  plannedExpenseOccurrencePayments: defineTable({
    userId: v.string(),
    plannedTransactionId: v.optional(v.id('plannedTransactions')),
    dueDate: v.string(),
    status: v.union(v.literal('paid'), v.literal('reopened')),
    source: v.union(v.literal('manual'), v.literal('linkedTransaction'), v.literal('automatic')),
    paidAtMs: v.number(),
    updatedAtMs: v.number(),
  }),
});

test('drops legacy planning rows and clears merged-row provenance idempotently', async () => {
  const t = convexTest(legacyPlanningCleanupSchema, modules);
  const fixture = await t.run(async (ctx) => {
    const userId = 'legacy_planning_cleanup_user';
    const now = Date.UTC(2026, 7, 3, 12);
    const plannedExpenseId = await ctx.db.insert('plannedExpenses', {
      userId,
      name: 'Legacy weekly expense',
      amount: { amountMinor: 5_000n, currency: 'EUR' },
      dueDate: '2026-08-07',
      status: 'paid',
      source: 'manual',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const plannedTransferId = await ctx.db.insert('plannedTransfers', {
      userId,
      name: 'Legacy savings transfer',
      amount: { amountMinor: 20_000n, currency: 'EUR' },
      scheduledDate: '2026-08-10',
      status: 'planned',
      createdAtMs: now,
      updatedAtMs: now,
    });
    const mergedExpenseId = await ctx.db.insert('plannedTransactions', {
      userId,
      name: 'Merged weekly expense',
      amount: { amountMinor: 5_000n, currency: 'EUR' },
      dueDate: '2026-08-07',
      kind: 'expense',
      direction: 'outflow',
      status: 'paid',
      source: 'manual',
      migratedFromExpenseId: plannedExpenseId,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const mergedTransferId = await ctx.db.insert('plannedTransactions', {
      userId,
      name: 'Merged savings transfer',
      amount: { amountMinor: 20_000n, currency: 'EUR' },
      dueDate: '2026-08-10',
      kind: 'transfer',
      direction: 'outflow',
      status: 'planned',
      source: 'manual',
      migratedFromTransferId: plannedTransferId,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const orphanedPaymentId = await ctx.db.insert('plannedExpenseOccurrencePayments', {
      userId,
      dueDate: '2026-08-07',
      status: 'paid',
      source: 'manual',
      paidAtMs: now,
      updatedAtMs: now,
    });
    const linkedPaymentId = await ctx.db.insert('plannedExpenseOccurrencePayments', {
      userId,
      plannedTransactionId: mergedExpenseId,
      dueDate: '2026-08-14',
      status: 'paid',
      source: 'manual',
      paidAtMs: now,
      updatedAtMs: now,
    });

    return {
      plannedExpenseId,
      plannedTransferId,
      mergedExpenseId,
      mergedTransferId,
      orphanedPaymentId,
      linkedPaymentId,
    };
  });

  expect(await t.action(internal.migrations.dropLegacyPlanningRows, { batchSize: 1 })).toEqual({
    plannedExpenses: { deleted: 1 },
    plannedTransfers: { deleted: 1 },
    orphanedPlannedExpenseOccurrencePayments: { deleted: 1 },
    plannedTransactions: { provenanceCleared: 2 },
  });

  const rows = await t.run(async (ctx) => ({
    plannedExpense: await ctx.db.get('plannedExpenses', fixture.plannedExpenseId),
    plannedTransfer: await ctx.db.get('plannedTransfers', fixture.plannedTransferId),
    orphanedPayment: await ctx.db.get(
      'plannedExpenseOccurrencePayments',
      fixture.orphanedPaymentId,
    ),
    linkedPayment: await ctx.db.get('plannedExpenseOccurrencePayments', fixture.linkedPaymentId),
    mergedExpense: await ctx.db.get('plannedTransactions', fixture.mergedExpenseId),
    mergedTransfer: await ctx.db.get('plannedTransactions', fixture.mergedTransferId),
  }));

  expect(rows.plannedExpense).toBeNull();
  expect(rows.plannedTransfer).toBeNull();
  expect(rows.orphanedPayment).toBeNull();
  expect(rows.linkedPayment).toMatchObject({ plannedTransactionId: fixture.mergedExpenseId });
  expect(rows.mergedExpense).toMatchObject({ name: 'Merged weekly expense' });
  expect(rows.mergedExpense).not.toHaveProperty('migratedFromExpenseId');
  expect(rows.mergedTransfer).toMatchObject({ name: 'Merged savings transfer' });
  expect(rows.mergedTransfer).not.toHaveProperty('migratedFromTransferId');

  expect(await t.action(internal.migrations.dropLegacyPlanningRows, { batchSize: 1 })).toEqual({
    plannedExpenses: { deleted: 0 },
    plannedTransfers: { deleted: 0 },
    orphanedPlannedExpenseOccurrencePayments: { deleted: 0 },
    plannedTransactions: { provenanceCleared: 0 },
  });
});
