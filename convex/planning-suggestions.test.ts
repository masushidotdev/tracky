/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import { buildPlannedExpenseSuggestions } from './banking/planningSuggestions';
import schema from './schema';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob([
  './_generated/*.js',
  './banking/planningSuggestion*.ts',
  './banking/planningMath.ts',
  './banking/subscriptionDetection.ts',
  './lib/*.ts',
]);

function createTest() {
  return convexTest(schema, modules);
}

function annualInsuranceTransaction(id: string, bookingDate: string) {
  return {
    _id: id as Id<'transactions'>,
    bookingDate,
    description: 'Annual car insurance',
    counterpartyName: 'Generali Assicurazioni',
    direction: 'DBIT' as const,
    amount: {
      amountMinor: 72000n,
      currency: 'EUR',
    },
    classificationKind: 'expense' as const,
    classificationSource: 'provider' as const,
    categoryId: undefined,
  };
}

function monthlyIncomeTransaction(id: string, bookingDate: string, amountMinor = 250000n) {
  return {
    _id: id as Id<'transactions'>,
    bookingDate,
    description: 'Monthly payroll',
    counterpartyName: 'Acme Payroll',
    direction: 'CRDT' as const,
    amount: {
      amountMinor,
      currency: 'EUR',
    },
    classificationKind: 'income' as const,
    classificationSource: 'provider' as const,
    categoryId: undefined,
  };
}

describe('planned expense suggestions', () => {
  test('detects sizeable annual payments and previews monthly funding', () => {
    const suggestions = buildPlannedExpenseSuggestions({
      transactions: [
        annualInsuranceTransaction('tx_2026', '2026-01-10'),
        annualInsuranceTransaction('tx_2025', '2025-01-10'),
      ],
      existingPlannedExpenses: [],
      limit: 5,
      minAmountMinor: 20000n,
      asOfDate: '2026-06-01',
      nowMs: Date.UTC(2026, 5, 1),
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.name).toBe('Generali Assicurazioni');
    expect(suggestions[0]?.dueDate).toBe('2027-01-10');
    expect(suggestions[0]?.recurrenceIntervalCount).toBe(12);
    expect(suggestions[0]?.funding.monthlyRequiredAmount.amountMinor).toBe(9000n);
    expect(suggestions[0]?.confidence).toBeGreaterThan(0.85);
  });

  test('detects recurring monthly income after three similar credits', () => {
    const suggestions = buildPlannedExpenseSuggestions({
      transactions: [
        monthlyIncomeTransaction('salary_2026_03', '2026-03-31', 251000n),
        monthlyIncomeTransaction('salary_2026_02', '2026-02-28', 250000n),
        monthlyIncomeTransaction('salary_2026_01', '2026-01-31', 250500n),
      ],
      existingPlannedExpenses: [],
      limit: 5,
      minAmountMinor: 20000n,
      asOfDate: '2026-04-15',
      nowMs: Date.UTC(2026, 3, 15),
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.name).toBe('Acme Payroll');
    expect(suggestions[0]?.direction).toBe('inflow');
    expect(suggestions[0]?.dueDate).toBe('2026-04-30');
    expect(suggestions[0]?.recurrenceIntervalCount).toBe(1);
  });

  test('does not suggest two-credit income patterns or monthly debit patterns', () => {
    const twoCreditSuggestions = buildPlannedExpenseSuggestions({
      transactions: [
        monthlyIncomeTransaction('salary_2026_03', '2026-03-31'),
        monthlyIncomeTransaction('salary_2026_02', '2026-02-28'),
      ],
      existingPlannedExpenses: [],
      limit: 5,
      minAmountMinor: 20000n,
      asOfDate: '2026-04-15',
      nowMs: Date.UTC(2026, 3, 15),
    });
    const monthlyDebitSuggestions = buildPlannedExpenseSuggestions({
      transactions: [
        { ...annualInsuranceTransaction('rent_2026_03', '2026-03-31'), counterpartyName: 'Landlord', amount: { amountMinor: 90000n, currency: 'EUR' } },
        { ...annualInsuranceTransaction('rent_2026_02', '2026-02-28'), counterpartyName: 'Landlord', amount: { amountMinor: 90000n, currency: 'EUR' } },
        { ...annualInsuranceTransaction('rent_2026_01', '2026-01-31'), counterpartyName: 'Landlord', amount: { amountMinor: 90000n, currency: 'EUR' } },
      ],
      existingPlannedExpenses: [],
      limit: 5,
      minAmountMinor: 20000n,
      asOfDate: '2026-04-15',
      nowMs: Date.UTC(2026, 3, 15),
    });

    expect(twoCreditSuggestions).toHaveLength(0);
    expect(monthlyDebitSuggestions).toHaveLength(0);
  });

  test('suppresses suggestions already linked to planned expenses', () => {
    const latestTransaction = annualInsuranceTransaction('tx_2026', '2026-01-10');
    const suggestions = buildPlannedExpenseSuggestions({
      transactions: [latestTransaction, annualInsuranceTransaction('tx_2025', '2025-01-10')],
      existingPlannedExpenses: [
        {
          _id: 'planned_existing' as Id<'plannedTransactions'>,
          name: 'Generali Assicurazioni',
          amount: latestTransaction.amount,
          dueDate: '2027-01-10',
          status: 'funding',
          latestTransactionId: latestTransaction._id,
        },
      ],
      limit: 5,
      minAmountMinor: 20000n,
      asOfDate: '2026-06-01',
      nowMs: Date.UTC(2026, 5, 1),
    });

    expect(suggestions).toHaveLength(0);
  });

  test('accepts a suggestion into a planned expense and money box idempotently', async () => {
    const t = createTest();
    const userId = 'user_test';
    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
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
        providerAccountId: 'main',
        name: 'Main account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });

      const firstTransactionId = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: 'insurance_2025',
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: 72000n,
          currency: 'EUR',
        },
        bookingDate: '2025-01-10',
        description: 'Annual car insurance',
        counterpartyName: 'Generali Assicurazioni',
        classificationKind: 'expense',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });
      const latestTransactionId = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: 'insurance_2026',
        status: 'BOOK',
        direction: 'DBIT',
        amount: {
          amountMinor: 72000n,
          currency: 'EUR',
        },
        bookingDate: '2026-01-10',
        description: 'Annual car insurance',
        counterpartyName: 'Generali Assicurazioni',
        classificationKind: 'uncategorized',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });

      return { firstTransactionId, latestTransactionId };
    });

    expect(ids.firstTransactionId).toBeTruthy();
    const suggestions = await t.query(internal.banking.planningSuggestionFunctions.listForUser, {
      userId,
      limit: 5,
      asOfDate: '2026-06-01',
    });

    expect(suggestions).toHaveLength(1);

    const firstResult = await t.mutation(internal.banking.planningSuggestionFunctions.acceptForUser, {
      userId,
      suggestionKey: suggestions[0].suggestionKey,
      asOfDate: '2026-06-01',
    });
    const secondResult = await t.mutation(internal.banking.planningSuggestionFunctions.acceptForUser, {
      userId,
      suggestionKey: suggestions[0].suggestionKey,
      asOfDate: '2026-06-01',
    });

    const result = await t.run(async (ctx) => {
      const plannedExpense = await ctx.db.get('plannedTransactions', firstResult.plannedExpenseId);
      const moneyBox = firstResult.moneyBoxId ? await ctx.db.get('moneyBoxes', firstResult.moneyBoxId) : null;
      const latestTransaction = await ctx.db.get('transactions', ids.latestTransactionId);
      return { plannedExpense, moneyBox, latestTransaction };
    });

    expect(secondResult.plannedExpenseId).toBe(firstResult.plannedExpenseId);
    expect(secondResult.moneyBoxId).toBe(firstResult.moneyBoxId);
    expect(result.plannedExpense?.source).toBe('suggested');
    expect(result.plannedExpense?.dueDate).toBe('2027-01-10');
    expect(result.plannedExpense?.latestTransactionId).toBe(ids.latestTransactionId);
    expect(result.moneyBox?.source).toBe('suggested');
    expect(result.moneyBox?.targetAmount.amountMinor).toBe(72000n);
    expect(result.latestTransaction?.classificationKind).toBe('expense');
    expect(result.latestTransaction?.classificationSource).toBe('user');
  });

  test('accepts income suggestions without money boxes and classifies latest transaction as income', async () => {
    const t = createTest();
    const userId = 'user_income_suggestion';
    const ids = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
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
        providerAccountId: 'main',
        name: 'Main account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });

      for (const transaction of [
        { dedupeKey: 'salary_2026_01', bookingDate: '2026-01-31', amountMinor: 250000n },
        { dedupeKey: 'salary_2026_02', bookingDate: '2026-02-28', amountMinor: 250500n },
      ]) {
        await ctx.db.insert('transactions', {
          userId,
          accountId,
          providerConnectionId,
          provider: 'mock',
          dedupeKey: transaction.dedupeKey,
          status: 'BOOK',
          direction: 'CRDT',
          amount: {
            amountMinor: transaction.amountMinor,
            currency: 'EUR',
          },
          bookingDate: transaction.bookingDate,
          description: 'Monthly payroll',
          counterpartyName: 'Acme Payroll',
          classificationKind: 'income',
          classificationSource: 'provider',
          importedAtMs: now,
          updatedAtMs: now,
        });
      }
      const latestTransactionId = await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId,
        provider: 'mock',
        dedupeKey: 'salary_2026_03',
        status: 'BOOK',
        direction: 'CRDT',
        amount: {
          amountMinor: 251000n,
          currency: 'EUR',
        },
        bookingDate: '2026-03-31',
        description: 'Monthly payroll',
        counterpartyName: 'Acme Payroll',
        classificationKind: 'uncategorized',
        classificationSource: 'provider',
        importedAtMs: now,
        updatedAtMs: now,
      });

      return { latestTransactionId };
    });

    const suggestions = await t.query(internal.banking.planningSuggestionFunctions.listForUser, {
      userId,
      limit: 5,
      asOfDate: '2026-04-15',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.direction).toBe('inflow');

    const result = await t.mutation(internal.banking.planningSuggestionFunctions.acceptForUser, {
      userId,
      suggestionKey: suggestions[0].suggestionKey,
      createMoneyBox: true,
      asOfDate: '2026-04-15',
    });
    const persisted = await t.run(async (ctx) => {
      const plannedExpense = await ctx.db.get('plannedTransactions', result.plannedExpenseId);
      const latestTransaction = await ctx.db.get('transactions', ids.latestTransactionId);
      const moneyBoxes = await ctx.db
        .query('moneyBoxes')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', userId).eq('status', 'active'))
        .take(10);
      return { plannedExpense, latestTransaction, moneyBoxes };
    });

    expect(result.moneyBoxId).toBeNull();
    expect(persisted.moneyBoxes).toHaveLength(0);
    expect(persisted.plannedExpense?.direction).toBe('inflow');
    expect(persisted.latestTransaction?.classificationKind).toBe('income');
    expect(persisted.latestTransaction?.classificationSource).toBe('user');
  });
});
