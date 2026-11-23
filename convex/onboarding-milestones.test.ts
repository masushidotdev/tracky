/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';
import { api, components, internal } from './_generated/api';
import { shouldEmitFirstMilestone } from './lib/onboardingMilestones';
import schema from './schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './accountDeletion.ts',
  './auth.ts',
  './userSettings.ts',
  './banking/*.ts',
  './lib/*.ts',
]);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthUser(t: TestHarness, userId: string) {
  const timestamp = '2026-07-01T00:00:00.000Z';
  await t.mutation(components.workOSAuthKit.lib.onWebhookEvent, {
    event: {
      id: `evt_${userId}`,
      createdAt: timestamp,
      event: 'user.created',
      data: {
        object: 'user',
        id: userId,
        email: `${userId}@example.com`,
        firstName: 'Milestone',
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

function csvRow(dedupeKey: string, description = 'Coffee shop') {
  return {
    direction: 'DBIT' as const,
    amount: { amountMinor: 450n, currency: 'EUR' },
    bookingDate: '2026-07-10',
    description,
    dedupeKey,
  };
}

describe('shouldEmitFirstMilestone', () => {
  test('emits only when not yet marked and there is no prior data', () => {
    expect(shouldEmitFirstMilestone({ alreadyMarked: false, hadPriorData: false })).toBe('emit');
  });

  test('backfills silently when not yet marked but the existing user already has prior data', () => {
    expect(shouldEmitFirstMilestone({ alreadyMarked: false, hadPriorData: true })).toBe('backfill');
  });

  test('skips when already marked regardless of current data presence', () => {
    expect(shouldEmitFirstMilestone({ alreadyMarked: true, hadPriorData: false })).toBe('skip');
    expect(shouldEmitFirstMilestone({ alreadyMarked: true, hadPriorData: true })).toBe('skip');
  });
});

describe('first_csv_import_completed and first_transaction_created (csv)', () => {
  test('emits once on first CSV batch with imported > 0 and skips subsequent batches', async () => {
    const t = createTest();
    const userId = 'user_csv_first';
    await seedAuthUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Main checking',
      accountType: 'CACC',
      currency: 'EUR',
    });

    const first = await asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId,
      rows: [csvRow('csv|row-1')],
    });
    expect(first.imported).toBe(1);
    expect(first.milestonesEmitted).toEqual({ firstCsvImport: true, firstTransaction: true });

    // Second batch in a multi-batch or repeat import never re-emits.
    const second = await asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId,
      rows: [csvRow('csv|row-2')],
    });
    expect(second.imported).toBe(1);
    expect(second.milestonesEmitted).toEqual({ firstCsvImport: false, firstTransaction: false });

    const settings = await t.run(async (ctx) =>
      ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique(),
    );
    expect(settings?.onboardingMilestones?.firstCsvImportAtMs).toEqual(expect.any(Number));
    expect(settings?.onboardingMilestones?.firstTransactionAtMs).toEqual(expect.any(Number));
  });

  test('does not mark or emit when imported === 0 (all invalid or all duplicates)', async () => {
    const t = createTest();
    const userId = 'user_csv_zero';
    await seedAuthUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Main checking',
      accountType: 'CACC',
      currency: 'EUR',
    });

    // All-invalid batch (wrong currency -> imported === 0).
    const failedBatch = await asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId,
      rows: [
        {
          direction: 'DBIT',
          amount: { amountMinor: 500n, currency: 'USD' },
          bookingDate: '2026-07-10',
          description: 'USD coffee',
          dedupeKey: 'csv|bad-currency',
        },
      ],
    });
    expect(failedBatch.imported).toBe(0);
    expect(failedBatch.milestonesEmitted).toEqual({ firstCsvImport: false, firstTransaction: false });

    // Milestones must still be unmarked so the next real CSV import emits.
    const validBatch = await asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId,
      rows: [csvRow('csv|good-1')],
    });
    expect(validBatch.imported).toBe(1);
    expect(validBatch.milestonesEmitted).toEqual({ firstCsvImport: true, firstTransaction: true });

    // All-duplicate batch also emits false.
    const duplicateBatch = await asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId,
      rows: [csvRow('csv|good-1')],
    });
    expect(duplicateBatch.imported).toBe(0);
    expect(duplicateBatch.milestonesEmitted).toEqual({ firstCsvImport: false, firstTransaction: false });
  });

  test('backfills silently for an existing user who already imported CSV rows before rollout', async () => {
    const t = createTest();
    const userId = 'user_csv_legacy';
    await seedAuthUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Legacy checking',
      accountType: 'CACC',
      currency: 'EUR',
    });

    // Seed a pre-existing CSV transaction with no onboardingMilestones set.
    await t.run(async (ctx) => {
      const account = await ctx.db.get('financialAccounts', accountId);
      const now = Date.UTC(2026, 5, 1);
      await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId: account!.providerConnectionId!,
        provider: 'manual',
        dedupeKey: 'csv|pre-rollout',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 1000n, currency: 'EUR' },
        bookingDate: '2026-06-01',
        description: 'Legacy CSV row',
        classificationKind: 'expense',
        classificationSource: 'system',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    const result = await asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId,
      rows: [csvRow('csv|after-rollout')],
    });
    expect(result.imported).toBe(1);
    expect(result.milestonesEmitted).toEqual({ firstCsvImport: false, firstTransaction: false });

    const settings = await t.run(async (ctx) =>
      ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique(),
    );
    expect(settings?.onboardingMilestones?.firstCsvImportAtMs).toEqual(expect.any(Number));
    expect(settings?.onboardingMilestones?.firstTransactionAtMs).toEqual(expect.any(Number));
  });

  test('emits firstCsvImport but not firstTransaction when user already created a manual transaction', async () => {
    const t = createTest();
    const userId = 'user_manual_then_csv';
    await seedAuthUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Main checking',
      accountType: 'CACC',
      currency: 'EUR',
    });

    const manual = await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId,
      direction: 'DBIT',
      amount: { amountMinor: 500n, currency: 'EUR' },
      bookingDate: '2026-07-09',
      description: 'Manual entry',
    });
    expect(manual.milestonesEmitted).toEqual({ firstTransaction: true });

    const csv = await asUser.mutation(api.banking.csvImport.importManualTransactionsBatch, {
      accountId,
      rows: [csvRow('csv|first-csv-after-manual')],
    });
    expect(csv.milestonesEmitted).toEqual({ firstCsvImport: true, firstTransaction: false });
  });
});

describe('first_transaction_created (manual)', () => {
  test('emits on first manual transaction, skips second, and backfills legacy users', async () => {
    const t = createTest();
    const userId = 'user_manual_first';
    await seedAuthUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Cash wallet',
      accountType: 'CACC',
      currency: 'EUR',
    });

    const first = await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId,
      direction: 'DBIT',
      amount: { amountMinor: 1200n, currency: 'EUR' },
      bookingDate: '2026-07-10',
      description: 'Lunch',
    });
    expect(first.milestonesEmitted).toEqual({ firstTransaction: true });

    const second = await asUser.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId,
      direction: 'DBIT',
      amount: { amountMinor: 800n, currency: 'EUR' },
      bookingDate: '2026-07-11',
      description: 'Snack',
    });
    expect(second.milestonesEmitted).toEqual({ firstTransaction: false });

    // Legacy user with prior transaction and no persisted flag gets silent backfill.
    const legacyUserId = 'user_manual_legacy';
    await seedAuthUser(t, legacyUserId);
    const asLegacy = t.withIdentity({ subject: legacyUserId });
    const legacyAccountId = await asLegacy.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Legacy wallet',
      accountType: 'CACC',
      currency: 'EUR',
    });
    await t.run(async (ctx) => {
      const account = await ctx.db.get('financialAccounts', legacyAccountId);
      const now = Date.UTC(2026, 4, 1);
      await ctx.db.insert('transactions', {
        userId: legacyUserId,
        accountId: legacyAccountId,
        providerConnectionId: account!.providerConnectionId!,
        provider: 'manual',
        dedupeKey: 'manual|legacy',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: 300n, currency: 'EUR' },
        bookingDate: '2026-05-01',
        description: 'Older transaction',
        classificationKind: 'expense',
        classificationSource: 'user',
        importedAtMs: now,
        updatedAtMs: now,
      });
    });

    const legacyNext = await asLegacy.mutation(api.banking.manualTransactions.createManualTransaction, {
      accountId: legacyAccountId,
      direction: 'DBIT',
      amount: { amountMinor: 400n, currency: 'EUR' },
      bookingDate: '2026-07-12',
      description: 'Newer transaction',
    });
    expect(legacyNext.milestonesEmitted).toEqual({ firstTransaction: false });
    const legacySettings = await t.run(async (ctx) =>
      ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', legacyUserId))
        .unique(),
    );
    expect(legacySettings?.onboardingMilestones?.firstTransactionAtMs).toEqual(expect.any(Number));
  });
});

describe('first_plan_created', () => {
  test('emits on first inserted plan, not on duplicate-name early return or recreate after delete', async () => {
    const t = createTest();
    const userId = 'user_plan_first';
    await seedAuthUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const first = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Main plan',
      currency: 'EUR',
      accountIds: [],
    });
    expect(first.milestonesEmitted).toEqual({ firstPlan: true });

    // Early return on existing plan name must never emit.
    const duplicate = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Main plan',
      currency: 'EUR',
      accountIds: [],
    });
    expect(duplicate.planId).toBe(first.planId);
    expect(duplicate.milestonesEmitted).toEqual({ firstPlan: false });

    // Deleting the plan and creating another still skips because firstPlanAtMs is persisted.
    vi.useFakeTimers();
    try {
      await asUser.mutation(api.banking.plan.deletePlan, { planId: first.planId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    const recreated = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Fresh plan',
      currency: 'EUR',
      accountIds: [],
    });
    expect(recreated.milestonesEmitted).toEqual({ firstPlan: false });
  });

  test('backfills silently for a pre-existing user who already had a plan before rollout', async () => {
    const t = createTest();
    const userId = 'user_plan_legacy';
    await seedAuthUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 4, 1);
      await ctx.db.insert('userSettings', {
        userId,
        planTier: 'pro',
        planUpdatedAtMs: now,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('plans', {
        userId,
        name: 'Existing plan',
        currency: 'EUR',
        startPeriod: '2026-05',
        startDate: '2026-05-01',
        accountIds: [],
        isDefault: true,
        sortOrder: 1000,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    const second = await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Second plan',
      currency: 'EUR',
      accountIds: [],
    });
    expect(second.milestonesEmitted).toEqual({ firstPlan: false });

    const settings = await t.run(async (ctx) =>
      ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique(),
    );
    expect(settings?.onboardingMilestones?.firstPlanAtMs).toEqual(expect.any(Number));
  });
});

describe('first_bank_account_connected and first_transaction_created (bank)', () => {
  test('queues and atomically claims first bank account and first bank transaction once', async () => {
    const t = createTest();
    const userId = 'user_bank_first';
    await seedAuthUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    // Even if the user already has a manual account, their first bank-connected account emits.
    await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Cash wallet',
      accountType: 'CACC',
      currency: 'EUR',
    });

    const state = 'state_first_bank';
    await t.mutation(internal.banking.providerMutations.createAuthRequest, {
      userId,
      provider: 'enableBanking',
      state,
      redirectUrl: 'https://tracky.test/enablebanking/callback',
      aspspName: 'Test Bank',
      aspspCountry: 'IT',
      psuType: 'personal',
      expiresAtMs: Date.now() + 60_000,
    });

    const connectionId = await t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
      state,
      session: {
        session_id: 'session_first_1',
        aspsp: { name: 'Test Bank', country: 'IT' },
        psu_type: 'personal',
        accounts: [
          {
            uid: 'bank_checking_1',
            name: 'Checking',
            currency: 'EUR',
            cash_account_type: 'CACC',
            identification_hash: 'hash_checking_1',
            account_servicer: { name: 'Test Bank' },
          },
        ],
      },
    });

    // Claiming returns the bank account milestone once, then clears it.
    const claimedBank = await asUser.mutation(api.userSettings.claimPendingOnboardingMilestones, {});
    expect(claimedBank).toEqual({ firstBankAccountConnected: true, firstTransactionBank: false });
    const claimedAgain = await asUser.mutation(api.userSettings.claimPendingOnboardingMilestones, {});
    expect(claimedAgain).toEqual({ firstBankAccountConnected: false, firstTransactionBank: false });

    // Now sync the bank account's first transaction.
    const { accountId, syncStateId } = await t.run(async (ctx) => {
      const accounts = await ctx.db
        .query('financialAccounts')
        .withIndex('by_providerConnectionId', (q) => q.eq('providerConnectionId', connectionId))
        .take(5);
      const bankAccount = accounts[0];
      const syncState = await ctx.db
        .query('accountSyncStates')
        .withIndex('by_accountId', (q) => q.eq('accountId', bankAccount._id))
        .unique();
      return { accountId: bankAccount._id, syncStateId: syncState!._id };
    });

    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId,
      providerConnectionId: connectionId,
      syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'eb_tx_1',
          entry_reference: 'ref_1',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { currency: 'EUR', amount: '12.50' },
          booking_date: '2026-07-10',
          remittance_information: ['Supermarket'],
          note: null,
        },
      ],
    });

    const claimedTx = await asUser.mutation(api.userSettings.claimPendingOnboardingMilestones, {});
    expect(claimedTx).toEqual({ firstBankAccountConnected: false, firstTransactionBank: true });

    // A second bank transaction does not re-queue.
    await t.mutation(internal.banking.providerMutations.upsertTransactions, {
      accountId,
      providerConnectionId: connectionId,
      syncStateId,
      provider: 'enableBanking',
      transactionStatus: 'BOOK',
      transactions: [
        {
          transaction_id: 'eb_tx_2',
          entry_reference: 'ref_2',
          status: 'BOOK',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { currency: 'EUR', amount: '5.00' },
          booking_date: '2026-07-11',
          remittance_information: ['Bakery'],
          note: null,
        },
      ],
    });
    expect(await asUser.mutation(api.userSettings.claimPendingOnboardingMilestones, {})).toEqual({
      firstBankAccountConnected: false,
      firstTransactionBank: false,
    });
  });

  test('backfills existing bank users silently and ignores empty-account sessions', async () => {
    const t = createTest();
    const emptyUserId = 'user_bank_empty';
    await seedAuthUser(t, emptyUserId);
    const asEmpty = t.withIdentity({ subject: emptyUserId });

    await t.mutation(internal.banking.providerMutations.createAuthRequest, {
      userId: emptyUserId,
      provider: 'enableBanking',
      state: 'state_empty_accounts',
      redirectUrl: 'https://tracky.test/enablebanking/callback',
      aspspName: 'Empty Bank',
      aspspCountry: 'IT',
      psuType: 'personal',
      expiresAtMs: Date.now() + 60_000,
    });
    await t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
      state: 'state_empty_accounts',
      session: {
        session_id: 'session_empty',
        aspsp: { name: 'Empty Bank', country: 'IT' },
        psu_type: 'personal',
        accounts: [],
      },
    });
    expect(await asEmpty.mutation(api.userSettings.claimPendingOnboardingMilestones, {})).toEqual({
      firstBankAccountConnected: false,
      firstTransactionBank: false,
    });

    // Legacy user with a prior bank account and no onboardingMilestones gets silent backfill.
    const legacyUserId = 'user_bank_legacy';
    await seedAuthUser(t, legacyUserId);
    const asLegacy = t.withIdentity({ subject: legacyUserId });
    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 4, 1);
      const oldConn = await ctx.db.insert('providerConnections', {
        userId: legacyUserId,
        provider: 'enableBanking',
        status: 'active',
        displayName: 'Old Bank',
        sessionId: 'session_old',
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('financialAccounts', {
        userId: legacyUserId,
        providerConnectionId: oldConn,
        provider: 'enableBanking',
        providerAccountId: 'old_uid',
        name: 'Old checking',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
    });

    await t.mutation(internal.banking.providerMutations.createAuthRequest, {
      userId: legacyUserId,
      provider: 'enableBanking',
      state: 'state_second_bank',
      redirectUrl: 'https://tracky.test/enablebanking/callback',
      aspspName: 'Second Bank',
      aspspCountry: 'IT',
      psuType: 'personal',
      expiresAtMs: Date.now() + 60_000,
    });
    await t.mutation(internal.banking.providerMutations.completeEnableBankingSession, {
      state: 'state_second_bank',
      session: {
        session_id: 'session_second',
        aspsp: { name: 'Second Bank', country: 'IT' },
        psu_type: 'personal',
        accounts: [
          {
            uid: 'second_uid',
            name: 'Second checking',
            currency: 'EUR',
            cash_account_type: 'CACC',
            identification_hash: 'hash_second',
            account_servicer: { name: 'Second Bank' },
          },
        ],
      },
    });

    expect(await asLegacy.mutation(api.userSettings.claimPendingOnboardingMilestones, {})).toEqual({
      firstBankAccountConnected: false,
      firstTransactionBank: false,
    });
    const legacySettings = await t.run(async (ctx) =>
      ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', legacyUserId))
        .unique(),
    );
    expect(legacySettings?.onboardingMilestones?.firstBankAccountAtMs).toEqual(expect.any(Number));
  });

  test('account erasure wipes onboardingMilestones with userSettings', async () => {
    const t = createTest();
    const userId = 'user_milestone_wipe';
    await seedAuthUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.banking.plan.createPlan, {
      name: 'Wiped plan',
      currency: 'EUR',
      accountIds: [],
    });

    const deletionId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert('accountDeletions', {
        userId,
        userHash: 'a'.repeat(64),
        status: 'wiping',
        currentStep: 'profile',
        requestedAtMs: now,
        updatedAtMs: now,
        attemptCount: 0,
        workosDeleted: false,
      });
    });

    await t.mutation(internal.accountDeletion.eraseProfile, { deletionId });

    const remaining = await t.run(async (ctx) =>
      ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique(),
    );
    expect(remaining).toBeNull();
  });
});
