/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import { enableBankingSyncWindow } from './banking/syncWindow';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './banking/categoryRuleCore.ts',
  './banking/categoryRules.ts',
  './banking/categoryTaxonomy.ts',
  './banking/enableBankingTransactionMapping.ts',
  './banking/importTriage.ts',
  './banking/providerMutations.ts',
  './banking/providerQueries.ts',
  './banking/transferCore.ts',
  './lib/*.ts',
]);

function createTest() {
  return convexTest(schema, modules);
}

type TestHarness = ReturnType<typeof createTest>;

afterEach(() => {
  vi.useRealTimers();
});

type SyncTarget = {
  userId: string;
  providerConnectionId: Id<'providerConnections'>;
  accountId: Id<'financialAccounts'>;
  syncStateId: Id<'accountSyncStates'>;
};

async function seedSyncTarget(t: TestHarness): Promise<SyncTarget> {
  return await t.run(async (ctx) => {
    const now = Date.UTC(2026, 0, 1);
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
      nextSyncAfterMs: now,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const accountId = await ctx.db.insert('financialAccounts', {
      userId,
      providerConnectionId,
      provider: 'enableBanking',
      providerAccountId: 'account_test',
      name: 'Main account',
      institutionName: 'Test Bank',
      currency: 'EUR',
      status: 'active',
      syncEnabled: true,
      createdAtMs: now,
      updatedAtMs: now,
    });
    const syncStateId = await ctx.db.insert('accountSyncStates', {
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

    return { userId, providerConnectionId, accountId, syncStateId };
  });
}

describe('banking import', () => {
  test('deduplicates transactions by account and provider key', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    const rawTransaction = {
      transaction_id: 'tx_001',
      status: 'BOOK',
      credit_debit_indicator: 'DBIT',
      transaction_amount: {
        currency: 'EUR',
        amount: '12.99',
      },
      booking_date: '2026-01-10',
      creditor: {
        name: 'Acme Streaming',
      },
      remittance_information: ['Acme Streaming monthly plan'],
    };

    const firstResult = await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [rawTransaction],
    });
    const secondResult = await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [rawTransaction],
    });

    const transactions = await t.run(async (ctx) => {
      return await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', target.userId))
        .take(10);
    });

    expect(firstResult.imported).toBe(1);
    expect(secondResult.imported).toBe(0);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.amount.amountMinor).toBe(1299n);
  });

  test('recovers a late-booked row inside the lookback window', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    const lastBookedDate = '2026-07-27';

    await t.run(async (ctx) => {
      await ctx.db.patch('accountSyncStates', target.syncStateId, { lastBookedDate });
    });

    const window = enableBankingSyncWindow({
      lastBookedDate,
      backfillFromDate: '2026-01-01',
      today: '2026-07-28',
    });
    const providerTransactions = [
      {
        entry_reference: 'late_acme_card_payment',
        status: 'BOOK',
        credit_debit_indicator: 'DBIT',
        transaction_amount: { currency: 'EUR', amount: '18.40' },
        booking_date: '2026-07-25',
        value_date: '2026-07-28',
        creditor: { name: 'Late merchant' },
      },
    ].filter(
      (transaction) =>
        transaction.booking_date >= window.dateFrom && transaction.booking_date <= window.dateTo,
    );

    const result = await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: providerTransactions,
    });
    const imported = await t.run(async (ctx) => {
      return await ctx.db
        .query('transactions')
        .withIndex('by_accountId_and_dedupeKey', (q) =>
          q.eq('accountId', target.accountId).eq('dedupeKey', 'late_acme_card_payment'),
        )
        .unique();
    });

    expect(window.dateFrom).toBe('2026-07-20');
    expect(result.imported).toBe(1);
    expect(imported?.bookingDate).toBe('2026-07-25');
  });

  test('imports a future-booked row without advancing the sync cursor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));

    const t = createTest();
    const target = await seedSyncTarget(t);
    await t.run(async (ctx) => {
      await ctx.db.patch('accountSyncStates', target.syncStateId, { lastBookedDate: '2026-07-27' });
    });

    const result = await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          entry_reference: 'future_acme_row',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { currency: 'EUR', amount: '25.00' },
          booking_date: '2026-08-03',
          creditor: { name: 'Future merchant' },
        },
      ],
    });
    const stored = await t.run(async (ctx) => {
      const transaction = await ctx.db
        .query('transactions')
        .withIndex('by_accountId_and_dedupeKey', (q) =>
          q.eq('accountId', target.accountId).eq('dedupeKey', 'future_acme_row'),
        )
        .unique();
      const syncState = await ctx.db.get('accountSyncStates', target.syncStateId);
      return { syncState, transaction };
    });

    expect(result.imported).toBe(1);
    expect(stored.transaction?.bookingDate).toBe('2026-08-03');
    expect(stored.syncState?.lastBookedDate).toBe('2026-07-27');
  });

  test('returns due error syncs but leaves backed-off errors alone', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    const nowMs = Date.UTC(2026, 7, 1, 12);
    const futureSyncStateId = await t.run(async (ctx) => {
      await ctx.db.patch('accountSyncStates', target.syncStateId, {
        status: 'error',
        nextSyncAfterMs: nowMs,
      });
      const accountId = await ctx.db.insert('financialAccounts', {
        userId: target.userId,
        providerConnectionId: target.providerConnectionId,
        provider: 'enableBanking',
        providerAccountId: 'account_not_due',
        name: 'Not due account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      });
      return await ctx.db.insert('accountSyncStates', {
        userId: target.userId,
        providerConnectionId: target.providerConnectionId,
        accountId,
        provider: 'enableBanking',
        status: 'error',
        backfillFromDate: '2026-01-01',
        nextSyncAfterMs: nowMs + 1,
        syncCadenceHours: 6,
        consecutiveFailures: 1,
        updatedAtMs: nowMs,
      });
    });

    const due = await t.query(internal.banking.providerQueries.listDueSyncStates, {
      nowMs,
      limit: 10,
    });

    expect(due.map((syncState) => syncState._id)).toContain(target.syncStateId);
    expect(due.map((syncState) => syncState._id)).not.toContain(futureSyncStateId);
  });

  test('applies increasing retry backoff when a sync fails repeatedly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));

    const t = createTest();
    const target = await seedSyncTarget(t);
    const nowMs = Date.now();

    await t.mutation(internal.banking.providerMutations.markSyncFailed, {
      syncStateId: target.syncStateId,
      errorCode: 'FIRST_FAILURE',
      errorMessage: 'First failure',
    });
    const firstFailure = await t.run(async (ctx) => {
      return await ctx.db.get('accountSyncStates', target.syncStateId);
    });

    await t.mutation(internal.banking.providerMutations.markSyncFailed, {
      syncStateId: target.syncStateId,
      errorCode: 'SECOND_FAILURE',
      errorMessage: 'Second failure',
    });
    const secondFailure = await t.run(async (ctx) => {
      return await ctx.db.get('accountSyncStates', target.syncStateId);
    });

    expect(firstFailure?.nextSyncAfterMs).toBe(nowMs + 30 * 60 * 1000);
    expect(secondFailure?.nextSyncAfterMs).toBe(nowMs + 60 * 60 * 1000);
    expect(secondFailure?.consecutiveFailures).toBe(2);
  });

  test('rewinds a sync cursor and lowers its backfill boundary for an ops re-scan', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    await t.run(async (ctx) => {
      await ctx.db.patch('accountSyncStates', target.syncStateId, {
        status: 'error',
        backfillFromDate: '2026-07-01',
        lastBookedDate: '2026-07-27',
        nextSyncAfterMs: Date.UTC(2026, 7, 2),
        consecutiveFailures: 3,
        lastErrorCode: 'SYNC_FAILED',
        lastErrorMessage: 'Sync failed',
      });
    });

    await t.mutation(internal.banking.providerMutations.rewindSyncCursor, {
      accountId: target.accountId,
      fromDate: '2026-06-15',
    });
    const syncState = await t.run(async (ctx) => {
      return await ctx.db.get('accountSyncStates', target.syncStateId);
    });

    expect(syncState).toMatchObject({
      backfillFromDate: '2026-06-15',
      lastBookedDate: '2026-06-15',
      status: 'active',
      nextSyncAfterMs: 0,
      consecutiveFailures: 0,
    });
    expect(syncState?.lastErrorCode).toBeUndefined();
    expect(syncState?.lastErrorMessage).toBeUndefined();
  });

  test('maps counterparties from structured parties and provider remittance variants', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          entry_reference: 'acme_fastweb',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { currency: 'EUR', amount: '28.95' },
          booking_date: '2026-07-17',
          creditor: { name: null },
          debtor: { name: null },
          remittance_information: ['Acme Telecom invoice INV-2026-0601', 'Acme Telecom'],
          bank_transaction_code: { code: 'TRANSFER', description: null, sub_code: null },
        },
        {
          entry_reference: 'acme_direct_debit',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { currency: 'EUR', amount: '35.00' },
          booking_date: '2026-07-16',
          remittance_information: ['PAGAMENTO ADUE COD. DISP.: 123 NOME: Utility Spa MANDATO: ABC'],
        },
        {
          entry_reference: 'acme_credit_transfer',
          status: 'BOOK',
          credit_debit_indicator: 'CRDT',
          transaction_amount: { currency: 'EUR', amount: '50.00' },
          booking_date: '2026-07-15',
          remittance_information: ['Bonifico a vostro favore MITT.: Sender Name BENEF.: Account Owner'],
        },
        {
          entry_reference: 'structured_wins',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { currency: 'EUR', amount: '12.00' },
          booking_date: '2026-07-14',
          creditor: { name: 'Structured Merchant' },
          remittance_information: ['NOME: Remittance Merchant MANDATO: 123'],
          bank_transaction_code: { code: 'TRANSFER' },
        },
        {
          entry_reference: 'unstructured_single_line',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { currency: 'EUR', amount: '20.00' },
          booking_date: '2026-07-13',
          remittance_information: ['Generic payment note without a party label'],
          bank_transaction_code: { code: 'ATM' },
        },
        {
          entry_reference: 'acme_incoming_transfer',
          status: 'BOOK',
          credit_debit_indicator: 'CRDT',
          transaction_amount: { currency: 'EUR', amount: '100.00' },
          booking_date: '2026-07-12',
          remittance_information: ['BONIFICO A VOSTRO FAVORE BONIFICO SEPA DA  Sender Spa PER  Invoice TRN 123'],
        },
        {
          entry_reference: 'acme_outgoing_transfer',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { currency: 'EUR', amount: '100.00' },
          booking_date: '2026-07-11',
          remittance_information: ['DISPOSIZIONE DI BONIFICO BONIFICO SEPA A  Recipient Name PER  Invoice TRN 123'],
        },
        {
          entry_reference: 'acme_sdd',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { currency: 'EUR', amount: '42.00' },
          booking_date: '2026-07-10',
          remittance_information: ['ADDEBITO SEPA DD SDD da IT00ZZZ012345 Creditor Spa mandato nr. ABC Per Invoice'],
        },
        {
          entry_reference: 'acme_card',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { currency: 'EUR', amount: '12.50' },
          booking_date: '2026-07-09',
          remittance_information: ['PAGAMENTO MASTERCARD CARTA *1234 DI EUR 12,50 Merchant Descriptor Roma'],
        },
      ],
    });

    const transactions = await t.run(async (ctx) => {
      return await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', target.userId))
        .take(10);
    });
    const byKey = new Map(transactions.map((transaction) => [transaction.dedupeKey, transaction]));

    expect(byKey.get('acme_fastweb')).toMatchObject({
      description: 'Acme Telecom invoice INV-2026-0601 / Acme Telecom',
      counterpartyName: 'Acme Telecom',
    });
    expect(byKey.get('acme_direct_debit')?.counterpartyName).toBe('Utility Spa');
    expect(byKey.get('acme_credit_transfer')?.counterpartyName).toBe('Sender Name');
    expect(byKey.get('structured_wins')?.counterpartyName).toBe('Structured Merchant');
    expect(byKey.get('unstructured_single_line')?.counterpartyName).toBeUndefined();
    expect(byKey.get('acme_incoming_transfer')?.counterpartyName).toBe('Sender Spa');
    expect(byKey.get('acme_outgoing_transfer')?.counterpartyName).toBe('Recipient Name');
    expect(byKey.get('acme_sdd')?.counterpartyName).toBe('Creditor Spa');
    expect(byKey.get('acme_card')?.counterpartyName).toBe('Merchant Descriptor Roma');
  });

  test('backfills a missing counterparty from stored provider metadata', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    const transactionId = await t.run(async (ctx) => {
      return await ctx.db.insert('transactions', {
        userId: target.userId,
        accountId: target.accountId,
        providerConnectionId: target.providerConnectionId,
        provider: 'enableBanking',
        dedupeKey: 'stored_fastweb',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 2895n, currency: 'EUR' },
        bookingDate: '2026-07-17',
        description: 'Acme Telecom invoice INV-2026-0601',
        remittanceInformation: ['Pagamento fattura', 'Acme Telecom'],
        providerMetadata: { bankTransactionCode: { code: 'TRANSFER' } },
        classificationKind: 'expense',
        classificationSource: 'system',
        importedAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    });

    const result = await t.mutation(
      internal.banking.providerMutations.backfillMissingEnableBankingCounterparties,
      {
        accountId: target.accountId,
        paginationOpts: { numItems: 100, cursor: null },
      },
    );
    const transaction = await t.run(async (ctx) => await ctx.db.get('transactions', transactionId));

    expect(result).toMatchObject({ scanned: 1, updated: 1, isDone: true });
    expect(transaction?.counterpartyName).toBe('Acme Telecom');
  });

  test('applies the highest-priority enabled category rule on import', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    const { categoryId, tagId } = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const insertedTagId = await ctx.db.insert('transactionTags', {
        userId: target.userId,
        name: 'Streaming',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const genericCategoryId = await ctx.db.insert('categories', {
        userId: target.userId,
        name: 'Generic merchants',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const streamingCategoryId = await ctx.db.insert('categories', {
        userId: target.userId,
        name: 'Streaming',
        kind: 'expense',
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('categoryRules', {
        userId: target.userId,
        matchField: 'description',
        matchType: 'contains',
        pattern: 'monthly',
        categoryId: genericCategoryId,
        enabled: true,
        priority: 100,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('categoryRules', {
        userId: target.userId,
        matchField: 'merchant',
        matchType: 'contains',
        pattern: 'acme streaming',
        categoryId: streamingCategoryId,
        addTagIds: [insertedTagId],
        hideFromReports: true,
        enabled: true,
        priority: 10,
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { categoryId: streamingCategoryId, tagId: insertedTagId };
    });

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'tx_rule_001',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: {
            currency: 'EUR',
            amount: '12.99',
          },
          booking_date: '2026-01-10',
          creditor: {
            name: 'Acme Streaming',
          },
          remittance_information: ['Acme Streaming monthly plan'],
        },
      ],
    });

    const transactions = await t.run(async (ctx) => {
      return await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', target.userId))
        .take(10);
    });

    expect(transactions[0]).toMatchObject({
      categoryId,
      classificationKind: 'expense',
      classificationSource: 'rule',
      classificationConfidence: 1,
      tagIds: [tagId],
      hiddenFromReports: true,
    });
  });

  test('retroactive category rules skip user-classified transactions', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    const {
      existingTagId,
      manualCategoryId,
      ruleCategoryId,
      ruleId,
      ruleTagId,
      systemTransactionId,
      userTransactionId,
    } = await t.run(
      async (ctx) => {
        const now = Date.UTC(2026, 0, 1);
        const insertedExistingTagId = await ctx.db.insert('transactionTags', {
          userId: target.userId,
          name: 'Existing',
          createdAtMs: now,
          updatedAtMs: now,
        });
        const insertedRuleTagId = await ctx.db.insert('transactionTags', {
          userId: target.userId,
          name: 'Streaming',
          createdAtMs: now,
          updatedAtMs: now,
        });
        const insertedManualCategoryId = await ctx.db.insert('categories', {
          userId: target.userId,
          name: 'Manual',
          kind: 'expense',
          budgetEligible: true,
          createdAtMs: now,
          updatedAtMs: now,
        });
        const insertedRuleCategoryId = await ctx.db.insert('categories', {
          userId: target.userId,
          name: 'Streaming',
          kind: 'expense',
          budgetEligible: true,
          createdAtMs: now,
          updatedAtMs: now,
        });
        const insertedRuleId = await ctx.db.insert('categoryRules', {
          userId: target.userId,
          matchField: 'merchant',
          matchType: 'contains',
          pattern: 'acme streaming',
          categoryId: insertedRuleCategoryId,
          addTagIds: [insertedRuleTagId],
          hideFromReports: true,
          enabled: true,
          priority: 10,
          createdAtMs: now,
          updatedAtMs: now,
        });
        const insertedSystemTransactionId = await ctx.db.insert('transactions', {
          userId: target.userId,
          accountId: target.accountId,
          providerConnectionId: target.providerConnectionId,
          provider: 'enableBanking',
          dedupeKey: 'retro_system',
          status: 'BOOK',
          direction: 'DBIT',
          amount: {
            amountMinor: -1299n,
            currency: 'EUR',
          },
          bookingDate: '2026-01-10',
          description: 'Acme Streaming monthly plan',
          counterpartyName: 'Acme Streaming',
          classificationKind: 'uncategorized',
          classificationSource: 'system',
          tagIds: [insertedExistingTagId],
          importedAtMs: now,
          updatedAtMs: now,
        });
        const insertedUserTransactionId = await ctx.db.insert('transactions', {
          userId: target.userId,
          accountId: target.accountId,
          providerConnectionId: target.providerConnectionId,
          provider: 'enableBanking',
          dedupeKey: 'retro_user',
          status: 'BOOK',
          direction: 'DBIT',
          amount: {
            amountMinor: -1299n,
            currency: 'EUR',
          },
          bookingDate: '2026-01-09',
          description: 'Acme Streaming monthly plan',
          counterpartyName: 'Acme Streaming',
          classificationKind: 'expense',
          classificationSource: 'user',
          classificationConfidence: 1,
          categoryId: insertedManualCategoryId,
          importedAtMs: now,
          updatedAtMs: now,
        });

        return {
          existingTagId: insertedExistingTagId,
          manualCategoryId: insertedManualCategoryId,
          ruleCategoryId: insertedRuleCategoryId,
          ruleId: insertedRuleId,
          ruleTagId: insertedRuleTagId,
          systemTransactionId: insertedSystemTransactionId,
          userTransactionId: insertedUserTransactionId,
        };
      },
    );

    const result = await t.mutation(internal.banking.categoryRules.applyRuleToExistingForUser, {
      userId: target.userId,
      ruleId,
      limit: 10,
    });
    const transactions = await t.run(async (ctx) => {
      return {
        systemTransaction: await ctx.db.get('transactions', systemTransactionId),
        userTransaction: await ctx.db.get('transactions', userTransactionId),
      };
    });

    expect(result).toMatchObject({ applied: 1, scanned: 2 });
    expect(transactions.systemTransaction).toMatchObject({
      categoryId: ruleCategoryId,
      classificationKind: 'expense',
      classificationSource: 'rule',
      tagIds: [existingTagId, ruleTagId],
      hiddenFromReports: true,
    });
    expect(transactions.userTransaction).toMatchObject({
      categoryId: manualCategoryId,
      classificationKind: 'expense',
      classificationSource: 'user',
    });
  });

  test('stores imported account balance snapshots as integer minor units', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);

    const result = await t.mutation(internal.banking.providerMutations.upsertAccountBalances, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      provider: 'enableBanking',
      balances: [
        {
          balance_type: 'interimAvailable',
          balance_amount: {
            currency: 'EUR',
            amount: '1234.56',
          },
          reference_date: '2026-01-10',
        },
      ],
    });

    const balances = await t.run(async (ctx) => {
      return await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', target.accountId))
        .order('desc')
        .take(10);
    });

    expect(result.inserted).toBe(1);
    expect(result.seen).toBe(1);
    expect(balances).toHaveLength(1);
    expect(balances[0]?.userId).toBe(target.userId);
    expect(balances[0]?.providerConnectionId).toBe(target.providerConnectionId);
    expect(balances[0]?.balanceType).toBe('interimAvailable');
    expect(balances[0]?.amount.amountMinor).toBe(123456n);
    expect(balances[0]?.amount.currency).toBe('EUR');
    expect(balances[0]?.referenceDate).toBe('2026-01-10');
  });

  test('imports account balances when provider sends null reference date', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);

    const result = await t.mutation(internal.banking.providerMutations.upsertAccountBalances, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      provider: 'enableBanking',
      balances: [
        {
          balance_type: 'interimAvailable',
          balance_amount: {
            currency: 'EUR',
            amount: '1234.56',
          },
          reference_date: null,
        },
      ],
    });

    const balances = await t.run(async (ctx) => {
      return await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) => q.eq('accountId', target.accountId))
        .order('desc')
        .take(10);
    });

    expect(result.inserted).toBe(1);
    expect(result.seen).toBe(1);
    expect(balances).toHaveLength(1);
    expect(balances[0]?.referenceDate).toBeUndefined();
  });

  test('records account import job status and import counts', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);

    const importJobId = await t.mutation(internal.banking.providerMutations.startImportJob, {
      userId: target.userId,
      provider: 'enableBanking',
      providerConnectionId: target.providerConnectionId,
      accountId: target.accountId,
      kind: 'accountBackfill',
      trigger: 'cron',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-10',
      transactionStatus: 'BOOK',
    });
    await t.mutation(internal.banking.providerMutations.completeImportJob, {
      importJobId,
      balancesSeen: 2,
      balancesImported: 2,
      transactionsSeen: 15,
      transactionsImported: 4,
      transactionPagesFetched: 2,
    });

    const job = await t.run(async (ctx) => {
      return await ctx.db.get('importJobs', importJobId);
    });

    expect(job?.status).toBe('succeeded');
    expect(job?.kind).toBe('accountBackfill');
    expect(job?.trigger).toBe('cron');
    expect(job?.providerConnectionId).toBe(target.providerConnectionId);
    expect(job?.accountId).toBe(target.accountId);
    expect(job?.balancesSeen).toBe(2);
    expect(job?.balancesImported).toBe(2);
    expect(job?.transactionsSeen).toBe(15);
    expect(job?.transactionsImported).toBe(4);
    expect(job?.transactionPagesFetched).toBe(2);
    expect(job?.completedAtMs).toBeDefined();
  });

  test('records rate-limited import jobs with next retry time', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    const retryAfterMs = Date.UTC(2026, 0, 1, 12);

    const importJobId = await t.mutation(internal.banking.providerMutations.startImportJob, {
      userId: target.userId,
      provider: 'enableBanking',
      providerConnectionId: target.providerConnectionId,
      accountId: target.accountId,
      kind: 'accountRefresh',
      trigger: 'manual',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-10',
      transactionStatus: 'BOOK',
    });
    await t.mutation(internal.banking.providerMutations.failImportJob, {
      importJobId,
      status: 'rateLimited',
      errorCode: 'ASPSP_RATE_LIMIT_EXCEEDED',
      errorMessage: 'Bank rate limit exceeded',
      nextRetryAtMs: retryAfterMs,
      balancesSeen: 1,
      balancesImported: 0,
      transactionsSeen: 10,
      transactionsImported: 0,
      transactionPagesFetched: 1,
    });

    const job = await t.run(async (ctx) => {
      return await ctx.db.get('importJobs', importJobId);
    });

    expect(job?.status).toBe('rateLimited');
    expect(job?.kind).toBe('accountRefresh');
    expect(job?.trigger).toBe('manual');
    expect(job?.errorCode).toBe('ASPSP_RATE_LIMIT_EXCEEDED');
    expect(job?.nextRetryAtMs).toBe(retryAfterMs);
    expect(job?.transactionsSeen).toBe(10);
    expect(job?.transactionPagesFetched).toBe(1);
  });

  test('seeds default categories and categorizes imported card transactions', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'tx_grocery',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: {
            currency: 'EUR',
            amount: '42.10',
          },
          booking_date: '2026-01-12',
          creditor: {
            name: 'Acme Market',
          },
          merchant_category_code: '5411',
        },
      ],
    });

    const result = await t.run(async (ctx) => {
      const transaction = (
        await ctx.db
          .query('transactions')
          .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', target.userId))
          .take(1)
      )[0];
      const category = transaction.categoryId ? await ctx.db.get('categories', transaction.categoryId) : null;
      const defaultCategories = await ctx.db
        .query('categories')
        .withIndex('by_userId', (q) => q.eq('userId', target.userId))
        .take(50);

      return { category, defaultCategories, transaction };
    });

    expect(result.defaultCategories.length).toBeGreaterThanOrEqual(20);
    expect(result.transaction.classificationKind).toBe('expense');
    expect(result.transaction.classificationSource).toBe('system');
    expect(result.category?.systemKey).toBe('expense:groceries');
    expect(result.category?.name).toBe('Groceries');
  });

  test('classifies recurring debit transactions as subscription suggestions', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'tx_2026_01',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: {
            currency: 'EUR',
            amount: '12.99',
          },
          booking_date: '2026-01-01',
          creditor: {
            name: 'Acme Streaming',
          },
        },
      ],
    });
    const importedTransaction = {
      transaction_id: 'tx_2026_02',
      status: 'BOOK',
      credit_debit_indicator: 'DBIT',
      transaction_amount: {
        currency: 'EUR',
        amount: '12.99',
      },
      booking_date: '2026-02-01',
      creditor: {
        name: 'Acme Streaming',
      },
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await t.mutation(internal.banking.providerMutations.upsertTransactions, {
        accountId: target.accountId,
        providerConnectionId: target.providerConnectionId,
        syncStateId: target.syncStateId,
        provider: 'enableBanking',
        transactionStatus: 'BOOK',
        transactions: [importedTransaction],
      });
    }

    const transactions = await t.run(async (ctx) => {
      return await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', target.userId))
        .order('asc')
        .take(10);
    });

    expect(transactions).toHaveLength(2);
    // First occurrence has no same-merchant prior: uncategorized residue for
    // jev triage (UC1). The second sees the prior and takes the subscription path.
    expect(transactions[0]?.classificationKind).toBe('uncategorized');
    expect(transactions[1]?.classificationKind).toBe('subscription');
    expect(transactions[1]?.classificationSource).toBe('system');
    expect(transactions[1]?.classificationConfidence).toBeGreaterThan(0.8);
  });

  test('links imported recurring debits to an existing subscription and advances next due date', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    const subscriptionId = await t.run(async (ctx) => {
      return await ctx.db.insert('subscriptions', {
        userId: target.userId,
        name: 'Acme Streaming',
        merchantName: 'Acme Streaming',
        description: 'Acme Streaming monthly plan',
        amount: {
          amountMinor: 1299n,
          currency: 'EUR',
        },
        interval: 'month',
        intervalCount: 1,
        status: 'active',
        startDate: '2026-01-01',
        trialPeriodDays: 0,
        source: 'transaction',
        confidence: 1,
        createdAtMs: Date.UTC(2026, 0, 1),
        updatedAtMs: Date.UTC(2026, 0, 1),
      });
    });

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'tx_2026_02',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: {
            currency: 'EUR',
            amount: '12.99',
          },
          booking_date: '2026-02-01',
          creditor: {
            name: 'Acme Streaming',
          },
        },
      ],
    });

    const result = await t.run(async (ctx) => {
      const subscription = await ctx.db.get('subscriptions', subscriptionId);
      const transactions = await ctx.db
        .query('transactions')
        .withIndex('by_userId_and_bookingDate', (q) => q.eq('userId', target.userId))
        .take(10);
      return { subscription, transaction: transactions[0], transactionCount: transactions.length };
    });

    expect(result.transactionCount).toBe(1);
    expect(result.transaction.subscriptionId).toBe(subscriptionId);
    expect(result.transaction.classificationKind).toBe('subscription');
    expect(result.subscription?.latestTransactionId).toBe(result.transaction._id);
    expect(result.subscription?.nextDueDate).toBe('2026-03-01');
  });

  test('creates persisted transfer candidates while importing matching account transactions', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    const destination = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const accountId = await ctx.db.insert('financialAccounts', {
        userId: target.userId,
        providerConnectionId: target.providerConnectionId,
        provider: 'enableBanking',
        providerAccountId: 'account_destination',
        name: 'Acme Bank',
        institutionName: 'Test Bank',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const syncStateId = await ctx.db.insert('accountSyncStates', {
        userId: target.userId,
        providerConnectionId: target.providerConnectionId,
        accountId,
        provider: 'enableBanking',
        status: 'active',
        backfillFromDate: '2026-01-01',
        nextSyncAfterMs: now,
        syncCadenceHours: 6,
        consecutiveFailures: 0,
        updatedAtMs: now,
      });

      return { accountId, syncStateId };
    });

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'tx_topup_out',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: {
            currency: 'EUR',
            amount: '100.00',
          },
          booking_date: '2026-01-10',
          creditor: {
            name: 'Acme top-up',
          },
        },
      ],
    });

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: destination.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: destination.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'tx_topup_in',
          status: 'BOOK',
          credit_debit_indicator: 'CRDT',
          transaction_amount: {
            currency: 'EUR',
            amount: '99.00',
          },
          booking_date: '2026-01-10',
          debtor: {
            name: 'Apple Pay top-up',
          },
        },
      ],
    });

    const candidate = await t.run(async (ctx) => {
      const candidates = await ctx.db
        .query('transferMatches')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', target.userId).eq('status', 'candidate'))
        .take(10);
      return candidates[0];
    });

    expect(candidate.source).toBe('system');
    expect(candidate.amountDelta.amountMinor).toBe(100n);
    expect(candidate.feeAmount?.amountMinor).toBe(100n);
    expect(candidate.confidence).toBeGreaterThan(0.7);
  });

  test('auto-confirms high-confidence transfer matches during import', async () => {
    const t = createTest();
    const target = await seedSyncTarget(t);
    const destination = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 0, 1);
      const accountId = await ctx.db.insert('financialAccounts', {
        userId: target.userId,
        providerConnectionId: target.providerConnectionId,
        provider: 'enableBanking',
        providerAccountId: 'account_auto_destination',
        name: 'Acme Bank',
        institutionName: 'Test Bank',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const syncStateId = await ctx.db.insert('accountSyncStates', {
        userId: target.userId,
        providerConnectionId: target.providerConnectionId,
        accountId,
        provider: 'enableBanking',
        status: 'active',
        backfillFromDate: '2026-01-01',
        nextSyncAfterMs: now,
        syncCadenceHours: 6,
        consecutiveFailures: 0,
        updatedAtMs: now,
      });

      return { accountId, syncStateId };
    });

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: target.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: target.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'tx_exact_topup_out',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: {
            currency: 'EUR',
            amount: '100.00',
          },
          booking_date: '2026-01-10',
          creditor: {
            name: 'Acme top-up',
          },
        },
      ],
    });

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId: destination.accountId,
      providerConnectionId: target.providerConnectionId,
      syncStateId: destination.syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'tx_exact_topup_in',
          status: 'BOOK',
          credit_debit_indicator: 'CRDT',
          transaction_amount: {
            currency: 'EUR',
            amount: '100.00',
          },
          booking_date: '2026-01-10',
          debtor: {
            name: 'Apple Pay top-up',
          },
        },
      ],
    });

    const result = await t.run(async (ctx) => {
      const matches = await ctx.db
        .query('transferMatches')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', target.userId).eq('status', 'confirmed'))
        .take(10);
      const match = matches.at(0);
      if (!match) {
        throw new Error('Expected a confirmed transfer match');
      }
      const outgoing = await ctx.db.get('transactions', match.outgoingTransactionId);
      const incoming = await ctx.db.get('transactions', match.incomingTransactionId);
      return { incoming, match, outgoing };
    });

    expect(result.match.source).toBe('system');
    expect(result.match.amountDelta.amountMinor).toBe(0n);
    expect(result.outgoing?.classificationKind).toBe('transfer');
    expect(result.incoming?.classificationKind).toBe('transfer');
  });
});
