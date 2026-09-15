import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation } from './_generated/server';
import { ensureDefaultCategoriesForUser } from './banking/categoryTaxonomy';
import { CARD_STATEMENT_SYNTHETIC_KIND } from './banking/cardStatementSettlement';
import { latestBookedBalance } from './banking/balances';
import { isCardBackedCreditFacilityType } from './banking/credit';
import { effectiveFacilityUsedAmount, linkedCardAccountForFacility } from './banking/overdraft';
import { reconcileCardPaymentBuckets } from './banking/plan';
import { invalidatePlanSnapshots, invalidatePlanSnapshotsByPlanId } from './banking/planSnapshotInvalidation';
import { loadActiveOwnedInstallmentPlans, reconcileInstallmentPlanBuckets } from './banking/planSystemBuckets';
import { addMonthsToCycleMonth, defaultUsageCycleDueDate } from './banking/statementCycles';
import type { GenericDataModel, GenericDatabaseWriter } from 'convex/server';
import type { GenericId } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';

export const repairManualCardStatementCycleAfterBalanceCorrection = internalMutation({
  args: {
    creditFacilityId: v.id('creditFacilities'),
    statementCycleMonth: v.string(),
    nextOpenCycleMonth: v.string(),
    expectedUsedAmount: v.object({ amountMinor: v.int64(), currency: v.string() }),
  },
  handler: async (ctx, args) => {
    if (args.nextOpenCycleMonth !== addMonthsToCycleMonth(args.statementCycleMonth, 1)) {
      throw new ConvexError('The open cycle must immediately follow the repaired statement cycle');
    }

    const facility = await ctx.db.get('creditFacilities', args.creditFacilityId);
    if (
      !facility ||
      facility.facilityType !== 'cardCreditLine' ||
      facility.repaymentType !== 'statementBalance' ||
      facility.status !== 'active'
    ) {
      throw new ConvexError('Active card statement facility not found');
    }
    const cardAccount = await linkedCardAccountForFacility(ctx, facility);
    if (!cardAccount || cardAccount.provider !== 'manual') {
      throw new ConvexError('The repair only supports a linked manual card');
    }
    if (
      args.expectedUsedAmount.currency !== facility.limitAmount.currency ||
      args.expectedUsedAmount.amountMinor <= 0n
    ) {
      throw new ConvexError('Expected card usage must be positive and match the facility currency');
    }

    const { usedAmount } = await effectiveFacilityUsedAmount(ctx, facility);
    if (
      usedAmount.currency !== args.expectedUsedAmount.currency ||
      usedAmount.amountMinor !== args.expectedUsedAmount.amountMinor
    ) {
      throw new ConvexError('Current card usage no longer matches the expected repair amount');
    }

    const loadCycle = async (cycleMonth: string) =>
      await ctx.db
        .query('creditFacilityUsageCycles')
        .withIndex('by_creditFacilityId_and_cycleMonth', (q) =>
          q.eq('creditFacilityId', facility._id).eq('cycleMonth', cycleMonth),
        )
        .unique();
    const statementCycle = await loadCycle(args.statementCycleMonth);
    const nextOpenCycle = await loadCycle(args.nextOpenCycleMonth);
    if (
      !statementCycle ||
      !nextOpenCycle ||
      statementCycle.userId !== facility.userId ||
      nextOpenCycle.userId !== facility.userId
    ) {
      throw new ConvexError('Expected statement cycles were not found');
    }

    const expectedStatementDueDate = defaultUsageCycleDueDate(facility, args.statementCycleMonth);
    const expectedOpenDueDate = defaultUsageCycleDueDate(facility, args.nextOpenCycleMonth);
    const alreadyRepaired =
      statementCycle.status === 'scheduled' &&
      statementCycle.trackedAmount.currency === args.expectedUsedAmount.currency &&
      statementCycle.trackedAmount.amountMinor === args.expectedUsedAmount.amountMinor &&
      statementCycle.dueDate === expectedStatementDueDate &&
      nextOpenCycle.status === 'open' &&
      nextOpenCycle.trackedAmount.currency === args.expectedUsedAmount.currency &&
      nextOpenCycle.trackedAmount.amountMinor === 0n &&
      nextOpenCycle.dueDate === expectedOpenDueDate;
    if (!alreadyRepaired && (statementCycle.status !== 'cancelled' || nextOpenCycle.status !== 'cancelled')) {
      throw new ConvexError('Statement cycles no longer match the cancelled repair state');
    }
    if (statementCycle.transactionId || nextOpenCycle.transactionId) {
      throw new ConvexError('A cycle linked to a transaction cannot be repaired');
    }

    const openCycles = await ctx.db
      .query('creditFacilityUsageCycles')
      .withIndex('by_creditFacilityId_and_status', (q) => q.eq('creditFacilityId', facility._id).eq('status', 'open'))
      .take(100);
    const laterOpenCycles: Array<Doc<'creditFacilityUsageCycles'>> = [];
    for (const cycle of openCycles) {
      if (cycle.cycleMonth > args.nextOpenCycleMonth) {
        laterOpenCycles.push(cycle);
      }
    }
    for (const cycle of laterOpenCycles) {
      if (cycle.userId !== facility.userId || cycle.trackedAmount.amountMinor !== 0n || cycle.transactionId) {
        throw new ConvexError('A later open cycle contains data and cannot be removed');
      }
    }

    if (alreadyRepaired && laterOpenCycles.length === 0) {
      return {
        repaired: false,
        statementCycleId: statementCycle._id,
        openCycleId: nextOpenCycle._id,
        removedOpenCycleIds: [] as Array<Id<'creditFacilityUsageCycles'>>,
      };
    }

    const now = Date.now();
    await ctx.db.patch('creditFacilityUsageCycles', statementCycle._id, {
      status: 'scheduled',
      trackedAmount: args.expectedUsedAmount,
      dueDate: expectedStatementDueDate,
      transactionId: undefined,
      paidAtMs: undefined,
      closedAtMs: statementCycle.closedAtMs ?? now,
      updatedAtMs: now,
    });
    await ctx.db.patch('creditFacilityUsageCycles', nextOpenCycle._id, {
      status: 'open',
      trackedAmount: { amountMinor: 0n, currency: args.expectedUsedAmount.currency },
      dueDate: expectedOpenDueDate,
      transactionId: undefined,
      paidAtMs: undefined,
      closedAtMs: undefined,
      updatedAtMs: now,
    });
    for (const cycle of laterOpenCycles) {
      await ctx.db.delete('creditFacilityUsageCycles', cycle._id);
    }
    await invalidatePlanSnapshots(ctx, facility.userId, [
      `${args.statementCycleMonth}-01`,
      expectedStatementDueDate,
      `${args.nextOpenCycleMonth}-01`,
    ]);

    return {
      repaired: true,
      statementCycleId: statementCycle._id,
      openCycleId: nextOpenCycle._id,
      removedOpenCycleIds: laterOpenCycles.map((cycle) => cycle._id),
    };
  },
});

export const seedDefaultCategoriesPage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const profiles = await ctx.db
      .query('userProfiles')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .paginate(args.paginationOpts);

    for (const profile of profiles.page) {
      await ensureDefaultCategoriesForUser(ctx, profile.authUserId);
    }

    return {
      processed: profiles.page.length,
      continueCursor: profiles.continueCursor,
      isDone: profiles.isDone,
    };
  },
});

export const seedDefaultCategories = internalAction({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ processed: number }> => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 10, 1), 25);
    let cursor: string | null = args.cursor ?? null;
    let page: { processed: number; continueCursor: string; isDone: boolean } = await ctx.runMutation(
      internal.migrations.seedDefaultCategoriesPage,
      { paginationOpts: { numItems: batchSize, cursor } },
    );
    let processed = page.processed;

    while (!page.isDone) {
      cursor = page.continueCursor;
      page = await ctx.runMutation(internal.migrations.seedDefaultCategoriesPage, {
        paginationOpts: { numItems: batchSize, cursor },
      });
      processed += page.processed;
    }

    return { processed };
  },
});

const legacyPlanningDropTargetValidator = v.union(
  v.literal('plannedExpenses'),
  v.literal('plannedTransfers'),
  v.literal('orphanedPlannedExpenseOccurrencePayments'),
  v.literal('plannedTransactionsProvenance'),
);

type LegacyPlanningDropTarget =
  | 'plannedExpenses'
  | 'plannedTransfers'
  | 'orphanedPlannedExpenseOccurrencePayments'
  | 'plannedTransactionsProvenance';

type LegacyPlanningDropPage = {
  affected: number;
  continueCursor: string;
  isDone: boolean;
};

type LegacyPlannedTransaction = Doc<'plannedTransactions'> & {
  migratedFromExpenseId?: string;
  migratedFromTransferId?: string;
};

type LegacyPlanningDropResult = {
  plannedExpenses: { deleted: number };
  plannedTransfers: { deleted: number };
  orphanedPlannedExpenseOccurrencePayments: { deleted: number };
  plannedTransactions: { provenanceCleared: number };
};

export const dropLegacyPlanningRowsPage = internalMutation({
  args: {
    target: legacyPlanningDropTargetValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<LegacyPlanningDropPage> => {
    const legacyDb = ctx.db as GenericDatabaseWriter<GenericDataModel>;

    if (args.target === 'plannedExpenses' || args.target === 'plannedTransfers') {
      const rows = await legacyDb.query(args.target).paginate(args.paginationOpts);
      await Promise.all(
        rows.page.map((row) =>
          legacyDb.delete(args.target, row._id as GenericId<'plannedExpenses' | 'plannedTransfers'>),
        ),
      );
      return {
        affected: rows.page.length,
        continueCursor: rows.continueCursor,
        isDone: rows.isDone,
      };
    }

    if (args.target === 'orphanedPlannedExpenseOccurrencePayments') {
      const payments = await ctx.db.query('plannedExpenseOccurrencePayments').paginate(args.paginationOpts);
      const orphanedPayments = payments.page.filter((payment) => !payment.plannedTransactionId);
      await Promise.all(
        orphanedPayments.map((payment) => ctx.db.delete('plannedExpenseOccurrencePayments', payment._id)),
      );
      return {
        affected: orphanedPayments.length,
        continueCursor: payments.continueCursor,
        isDone: payments.isDone,
      };
    }

    const transactions = await ctx.db.query('plannedTransactions').paginate(args.paginationOpts);
    let provenanceCleared = 0;
    for (const transaction of transactions.page) {
      const legacyTransaction = transaction as LegacyPlannedTransaction;
      if (
        legacyTransaction.migratedFromExpenseId === undefined &&
        legacyTransaction.migratedFromTransferId === undefined
      ) {
        continue;
      }
      await legacyDb.patch('plannedTransactions', transaction._id, {
        migratedFromExpenseId: undefined,
        migratedFromTransferId: undefined,
      });
      provenanceCleared += 1;
    }
    return {
      affected: provenanceCleared,
      continueCursor: transactions.continueCursor,
      isDone: transactions.isDone,
    };
  },
});

export const dropLegacyPlanningRows = internalAction({
  args: {
    plannedExpensesCursor: v.optional(v.string()),
    plannedTransfersCursor: v.optional(v.string()),
    occurrencePaymentsCursor: v.optional(v.string()),
    plannedTransactionsCursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<LegacyPlanningDropResult> => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 10, 1), 25);

    const dropTarget = async (target: LegacyPlanningDropTarget, initialCursor?: string): Promise<number> => {
      let cursor: string | null = initialCursor ?? null;
      let page: LegacyPlanningDropPage = await ctx.runMutation(internal.migrations.dropLegacyPlanningRowsPage, {
        target,
        paginationOpts: { numItems: batchSize, cursor },
      });
      let affected = page.affected;

      while (!page.isDone) {
        cursor = page.continueCursor;
        page = await ctx.runMutation(internal.migrations.dropLegacyPlanningRowsPage, {
          target,
          paginationOpts: { numItems: batchSize, cursor },
        });
        affected += page.affected;
      }

      return affected;
    };

    return {
      plannedExpenses: {
        deleted: await dropTarget('plannedExpenses', args.plannedExpensesCursor),
      },
      plannedTransfers: {
        deleted: await dropTarget('plannedTransfers', args.plannedTransfersCursor),
      },
      orphanedPlannedExpenseOccurrencePayments: {
        deleted: await dropTarget('orphanedPlannedExpenseOccurrencePayments', args.occurrencePaymentsCursor),
      },
      plannedTransactions: {
        provenanceCleared: await dropTarget('plannedTransactionsProvenance', args.plannedTransactionsCursor),
      },
    };
  },
});

export const restoreExternalInstallmentPaymentActivityPage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const payments = await ctx.db.query('creditFacilityInstallmentPayments').paginate(args.paginationOpts);
    const affectedDatesByUser = new Map<string, Array<string>>();
    let changed = 0;
    let leftAlone = 0;

    for (const payment of payments.page) {
      if (!payment.transactionId) {
        leftAlone += 1;
        continue;
      }

      const facility = await ctx.db.get('creditFacilities', payment.creditFacilityId);
      const transaction = await ctx.db.get('transactions', payment.transactionId);
      if (
        !facility ||
        !transaction ||
        facility.userId !== payment.userId ||
        transaction.userId !== payment.userId ||
        isCardBackedCreditFacilityType(facility.facilityType) ||
        transaction.classificationKind !== 'internal'
      ) {
        leftAlone += 1;
        continue;
      }

      const hasCategory = transaction.categoryId !== undefined;
      await ctx.db.patch('transactions', transaction._id, {
        classificationKind: hasCategory ? 'expense' : 'uncategorized',
        classificationSource: hasCategory ? 'user' : 'system',
        classificationConfidence: hasCategory ? 1 : undefined,
        updatedAtMs: Date.now(),
      });
      const affectedDates = affectedDatesByUser.get(transaction.userId) ?? [];
      affectedDates.push(transaction.bookingDate);
      affectedDatesByUser.set(transaction.userId, affectedDates);
      changed += 1;
    }

    for (const [userId, dates] of affectedDatesByUser) {
      await invalidatePlanSnapshots(ctx, userId, dates);
    }

    return {
      processed: payments.page.length,
      changed,
      leftAlone,
      continueCursor: payments.continueCursor,
      isDone: payments.isDone,
    };
  },
});

export const restoreExternalInstallmentPaymentActivity = internalAction({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ processed: number; changed: number; leftAlone: number }> => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 10, 1), 25);
    let cursor: string | null = args.cursor ?? null;
    let page: {
      processed: number;
      changed: number;
      leftAlone: number;
      continueCursor: string;
      isDone: boolean;
    } = await ctx.runMutation(internal.migrations.restoreExternalInstallmentPaymentActivityPage, {
      paginationOpts: { numItems: batchSize, cursor },
    });
    let processed = page.processed;
    let changed = page.changed;
    let leftAlone = page.leftAlone;

    while (!page.isDone) {
      cursor = page.continueCursor;
      page = await ctx.runMutation(internal.migrations.restoreExternalInstallmentPaymentActivityPage, {
        paginationOpts: { numItems: batchSize, cursor },
      });
      processed += page.processed;
      changed += page.changed;
      leftAlone += page.leftAlone;
    }

    return { processed, changed, leftAlone };
  },
});

export const backfillPlanCardPaymentBucketsPage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const plans = await ctx.db.query('plans').paginate(args.paginationOpts);
    let changed = 0;
    let createdGroups = 0;
    let createdBuckets = 0;
    let detachedBuckets = 0;

    for (const plan of plans.page) {
      const accountRows = await Promise.all(
        plan.accountIds.map((accountId) => ctx.db.get('financialAccounts', accountId)),
      );
      const accounts: Array<Doc<'financialAccounts'>> = [];
      for (const account of accountRows) {
        if (account) accounts.push(account);
      }
      const result = await reconcileCardPaymentBuckets(ctx, plan, accounts);
      if (result.changed) changed += 1;
      if (result.createdGroup) createdGroups += 1;
      createdBuckets += result.createdBuckets;
      detachedBuckets += result.detachedBuckets;

      const snapshots = await ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', plan._id))
        .take(501);
      if (snapshots.length > 500) throw new ConvexError('Too many plan snapshots to migrate');
      await Promise.all(snapshots.map((snapshot) => ctx.db.delete('planMonthSnapshots', snapshot._id)));
    }

    return {
      processed: plans.page.length,
      changed,
      createdGroups,
      createdBuckets,
      detachedBuckets,
      continueCursor: plans.continueCursor,
      isDone: plans.isDone,
    };
  },
});

export const backfillPlanCardPaymentBuckets = internalAction({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    processed: number;
    changed: number;
    createdGroups: number;
    createdBuckets: number;
    detachedBuckets: number;
  }> => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 5, 1), 10);
    let cursor: string | null = args.cursor ?? null;
    let page: {
      processed: number;
      changed: number;
      createdGroups: number;
      createdBuckets: number;
      detachedBuckets: number;
      continueCursor: string;
      isDone: boolean;
    } = await ctx.runMutation(internal.migrations.backfillPlanCardPaymentBucketsPage, {
      paginationOpts: { numItems: batchSize, cursor },
    });
    const totals = {
      processed: page.processed,
      changed: page.changed,
      createdGroups: page.createdGroups,
      createdBuckets: page.createdBuckets,
      detachedBuckets: page.detachedBuckets,
    };

    while (!page.isDone) {
      cursor = page.continueCursor;
      page = await ctx.runMutation(internal.migrations.backfillPlanCardPaymentBucketsPage, {
        paginationOpts: { numItems: batchSize, cursor },
      });
      totals.processed += page.processed;
      totals.changed += page.changed;
      totals.createdGroups += page.createdGroups;
      totals.createdBuckets += page.createdBuckets;
      totals.detachedBuckets += page.detachedBuckets;
    }

    return totals;
  },
});

export const backfillPlanInstallmentBucketsPage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const plans = await ctx.db.query('plans').paginate(args.paginationOpts);
    let changed = 0;
    let createdGroups = 0;
    let createdBuckets = 0;
    let detachedBuckets = 0;

    for (const plan of plans.page) {
      const activeInstallmentPlans = await loadActiveOwnedInstallmentPlans(ctx, plan.userId);
      const result = await reconcileInstallmentPlanBuckets(ctx, plan, activeInstallmentPlans);
      if (result.changed) changed += 1;
      if (result.createdGroup) createdGroups += 1;
      createdBuckets += result.createdBuckets;
      detachedBuckets += result.detachedBuckets;
    }

    return {
      processed: plans.page.length,
      changed,
      createdGroups,
      createdBuckets,
      detachedBuckets,
      continueCursor: plans.continueCursor,
      isDone: plans.isDone,
    };
  },
});

export const backfillPlanInstallmentBuckets = internalAction({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    processed: number;
    changed: number;
    createdGroups: number;
    createdBuckets: number;
    detachedBuckets: number;
    snapshotRebuildScheduled: boolean;
  }> => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 5, 1), 10);
    let cursor: string | null = args.cursor ?? null;
    let page: {
      processed: number;
      changed: number;
      createdGroups: number;
      createdBuckets: number;
      detachedBuckets: number;
      continueCursor: string;
      isDone: boolean;
    } = await ctx.runMutation(internal.migrations.backfillPlanInstallmentBucketsPage, {
      paginationOpts: { numItems: batchSize, cursor },
    });
    const totals = {
      processed: page.processed,
      changed: page.changed,
      createdGroups: page.createdGroups,
      createdBuckets: page.createdBuckets,
      detachedBuckets: page.detachedBuckets,
    };

    while (!page.isDone) {
      cursor = page.continueCursor;
      page = await ctx.runMutation(internal.migrations.backfillPlanInstallmentBucketsPage, {
        paginationOpts: { numItems: batchSize, cursor },
      });
      totals.processed += page.processed;
      totals.changed += page.changed;
      totals.createdGroups += page.createdGroups;
      totals.createdBuckets += page.createdBuckets;
      totals.detachedBuckets += page.detachedBuckets;
    }

    const snapshotRebuildScheduled = totals.changed > 0;
    if (snapshotRebuildScheduled) {
      await ctx.scheduler.runAfter(0, internal.migrations.rebuildPlanSnapshotsAfterLogicChange, {});
    }
    return { ...totals, snapshotRebuildScheduled };
  },
});

export const repairManualCardStatementBalanceDoubleCountsPage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const transactions = await ctx.db.query('transactions').paginate(args.paginationOpts);
    const affectedDatesByUser = new Map<string, Array<string>>();
    let corrected = 0;
    let alreadyCorrected = 0;
    let leftAlone = 0;

    for (const transaction of transactions.page) {
      const metadata = transaction.providerMetadata;
      if (
        metadata?.trackySyntheticKind !== CARD_STATEMENT_SYNTHETIC_KIND ||
        transaction.direction !== 'CRDT' ||
        transaction.amount.currency !== 'EUR'
      ) {
        leftAlone += 1;
        continue;
      }
      if (metadata.trackyStatementBalanceCorrectionApplied === true) {
        alreadyCorrected += 1;
        continue;
      }

      const account = await ctx.db.get('financialAccounts', transaction.accountId);
      if (
        !account ||
        account.userId !== transaction.userId ||
        account.provider !== 'manual' ||
        account.accountType !== 'CARD' ||
        account.currency !== 'EUR' ||
        !account.providerConnectionId
      ) {
        leftAlone += 1;
        continue;
      }

      // The snapshot that was current when the legacy registration started was created before
      // the synthetic transaction. It can share the same millisecond timestamp, so creation order
      // is the tie-breaker. The balance written by the registration must equal prior + its credit.
      const previousBalances = await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) =>
          q.eq('accountId', account._id).lte('fetchedAtMs', transaction.importedAtMs),
        )
        .order('desc')
        .take(20);
      const previousBalance = previousBalances.find((balance) => balance._creationTime < transaction._creationTime);
      if (
        !previousBalance?.referenceDate ||
        transaction.bookingDate > previousBalance.referenceDate ||
        previousBalance.amount.currency !== 'EUR'
      ) {
        leftAlone += 1;
        continue;
      }

      const balancesWrittenAfterRegistration = await ctx.db
        .query('accountBalances')
        .withIndex('by_accountId_and_fetchedAtMs', (q) =>
          q.eq('accountId', account._id).gte('fetchedAtMs', transaction.importedAtMs),
        )
        .order('asc')
        .take(20);
      const legacyDeltaBalance = balancesWrittenAfterRegistration.find(
        (balance) =>
          balance._creationTime > transaction._creationTime &&
          balance.provider === 'manual' &&
          balance.amount.currency === 'EUR' &&
          balance.amount.amountMinor === previousBalance.amount.amountMinor + transaction.amount.amountMinor,
      );
      if (!legacyDeltaBalance) {
        leftAlone += 1;
        continue;
      }

      const latestBalance = await latestBookedBalance(ctx, account._id);
      if (!latestBalance || latestBalance.amount.currency !== 'EUR') {
        leftAlone += 1;
        continue;
      }

      const now = Date.now();
      await ctx.db.insert('accountBalances', {
        userId: account.userId,
        accountId: account._id,
        providerConnectionId: account.providerConnectionId,
        provider: 'manual',
        balanceType: 'closingBooked',
        balanceName: 'card-statement-reference-date-repair',
        amount: {
          amountMinor: latestBalance.amount.amountMinor - transaction.amount.amountMinor,
          currency: 'EUR',
        },
        referenceDate: latestBalance.referenceDate ?? previousBalance.referenceDate,
        fetchedAtMs: now,
      });
      await ctx.db.patch('transactions', transaction._id, {
        providerMetadata: {
          ...metadata,
          trackyStatementBalanceCorrectionApplied: true,
          trackyStatementBalanceCorrectionAppliedAtMs: now,
        },
        updatedAtMs: now,
      });
      const affectedDates = affectedDatesByUser.get(account.userId) ?? [];
      affectedDates.push(
        transaction.bookingDate,
        previousBalance.referenceDate,
        legacyDeltaBalance.referenceDate ?? transaction.bookingDate,
      );
      affectedDatesByUser.set(account.userId, affectedDates);
      corrected += 1;
    }

    for (const [userId, dates] of affectedDatesByUser) {
      await invalidatePlanSnapshots(ctx, userId, dates);
    }

    return {
      processed: transactions.page.length,
      corrected,
      alreadyCorrected,
      leftAlone,
      continueCursor: transactions.continueCursor,
      isDone: transactions.isDone,
    };
  },
});

export const repairManualCardStatementBalanceDoubleCounts = internalAction({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ processed: number; corrected: number; alreadyCorrected: number; leftAlone: number }> => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 10, 1), 25);
    let cursor: string | null = args.cursor ?? null;
    let page: {
      processed: number;
      corrected: number;
      alreadyCorrected: number;
      leftAlone: number;
      continueCursor: string;
      isDone: boolean;
    } = await ctx.runMutation(internal.migrations.repairManualCardStatementBalanceDoubleCountsPage, {
      paginationOpts: { numItems: batchSize, cursor },
    });
    const totals = {
      processed: page.processed,
      corrected: page.corrected,
      alreadyCorrected: page.alreadyCorrected,
      leftAlone: page.leftAlone,
    };

    while (!page.isDone) {
      cursor = page.continueCursor;
      page = await ctx.runMutation(internal.migrations.repairManualCardStatementBalanceDoubleCountsPage, {
        paginationOpts: { numItems: batchSize, cursor },
      });
      totals.processed += page.processed;
      totals.corrected += page.corrected;
      totals.alreadyCorrected += page.alreadyCorrected;
      totals.leftAlone += page.leftAlone;
    }

    return totals;
  },
});

export const repairLegacyManualCardInstallmentBalanceDoubleCountsPage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const installmentPlans = await ctx.db.query('creditFacilityInstallmentPlans').paginate(args.paginationOpts);
    const affectedDatesByUser = new Map<string, Array<string | undefined>>();
    let corrected = 0;
    let alreadyCorrected = 0;
    let leftAlone = 0;

    for (const installmentPlan of installmentPlans.page) {
      if (installmentPlan.status !== 'active') {
        leftAlone += 1;
        continue;
      }
      if (installmentPlan.manualCardBalanceCorrectionApplied === true) {
        alreadyCorrected += 1;
        continue;
      }

      const facility = await ctx.db.get('creditFacilities', installmentPlan.creditFacilityId);
      if (
        !facility ||
        facility.userId !== installmentPlan.userId ||
        !isCardBackedCreditFacilityType(facility.facilityType) ||
        !facility.linkedAccountId ||
        facility.limitAmount.currency !== 'EUR' ||
        installmentPlan.outstandingAmount.currency !== 'EUR'
      ) {
        leftAlone += 1;
        continue;
      }

      const account = await ctx.db.get('financialAccounts', facility.linkedAccountId);
      if (
        !account ||
        account.userId !== installmentPlan.userId ||
        account.provider !== 'manual' ||
        account.accountType !== 'CARD' ||
        account.currency !== 'EUR' ||
        !account.providerConnectionId
      ) {
        leftAlone += 1;
        continue;
      }

      const latestBalance = await latestBookedBalance(ctx, account._id);
      if (!latestBalance || latestBalance.amount.currency !== 'EUR') {
        leftAlone += 1;
        continue;
      }

      const debtMinor = latestBalance.amount.amountMinor < 0n ? -latestBalance.amount.amountMinor : 0n;
      const residualMinor =
        installmentPlan.outstandingAmount.amountMinor > 0n ? installmentPlan.outstandingAmount.amountMinor : 0n;
      const correctionMinor = debtMinor < residualMinor ? debtMinor : residualMinor;
      const now = Date.now();
      const correctionDate = new Date(now).toISOString().slice(0, 10);

      if (correctionMinor > 0n) {
        await ctx.db.insert('accountBalances', {
          userId: account.userId,
          accountId: account._id,
          providerConnectionId: account.providerConnectionId,
          provider: 'manual',
          balanceType: 'closingBooked',
          balanceName: 'legacy-card-installment-balance-repair',
          amount: {
            amountMinor: latestBalance.amount.amountMinor + correctionMinor,
            currency: 'EUR',
          },
          referenceDate: correctionDate,
          fetchedAtMs: now,
        });
        const affectedDates = affectedDatesByUser.get(account.userId) ?? [];
        affectedDates.push(installmentPlan.startDate, latestBalance.referenceDate, correctionDate);
        affectedDatesByUser.set(account.userId, affectedDates);
        corrected += 1;
      } else {
        leftAlone += 1;
      }

      // Mark every eligible plan, including one whose account already has no debt. Otherwise a
      // later card purchase followed by a reset migration could be mistaken for legacy debt.
      await ctx.db.patch('creditFacilityInstallmentPlans', installmentPlan._id, {
        manualCardBalanceCorrectionApplied: true,
        manualCardBalanceCorrectionAppliedAtMs: now,
        updatedAtMs: now,
      });
    }

    for (const [userId, dates] of affectedDatesByUser) {
      await invalidatePlanSnapshots(ctx, userId, dates);
    }

    return {
      processed: installmentPlans.page.length,
      corrected,
      alreadyCorrected,
      leftAlone,
      continueCursor: installmentPlans.continueCursor,
      isDone: installmentPlans.isDone,
    };
  },
});

export const repairLegacyManualCardInstallmentBalanceDoubleCounts = internalAction({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ processed: number; corrected: number; alreadyCorrected: number; leftAlone: number }> => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 10, 1), 25);
    let cursor: string | null = args.cursor ?? null;
    let page: {
      processed: number;
      corrected: number;
      alreadyCorrected: number;
      leftAlone: number;
      continueCursor: string;
      isDone: boolean;
    } = await ctx.runMutation(internal.migrations.repairLegacyManualCardInstallmentBalanceDoubleCountsPage, {
      paginationOpts: { numItems: batchSize, cursor },
    });
    const totals = {
      processed: page.processed,
      corrected: page.corrected,
      alreadyCorrected: page.alreadyCorrected,
      leftAlone: page.leftAlone,
    };

    while (!page.isDone) {
      cursor = page.continueCursor;
      page = await ctx.runMutation(internal.migrations.repairLegacyManualCardInstallmentBalanceDoubleCountsPage, {
        paginationOpts: { numItems: batchSize, cursor },
      });
      totals.processed += page.processed;
      totals.corrected += page.corrected;
      totals.alreadyCorrected += page.alreadyCorrected;
      totals.leftAlone += page.leftAlone;
    }

    return totals;
  },
});

export const rebuildPlanSnapshotsAfterLogicChangePage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const plans = await ctx.db.query('plans').paginate(args.paginationOpts);
    let deletedSnapshots = 0;

    for (const plan of plans.page) {
      const snapshots = await ctx.db
        .query('planMonthSnapshots')
        .withIndex('by_planId_and_period', (q) => q.eq('planId', plan._id))
        .take(501);
      if (snapshots.length > 500) throw new ConvexError('Too many plan snapshots to rebuild');
      await Promise.all(snapshots.map((snapshot) => ctx.db.delete('planMonthSnapshots', snapshot._id)));
      deletedSnapshots += snapshots.length;

      await ctx.scheduler.runAfter(0, internal.banking.planRead.recomputePlanSnapshots, {
        planId: plan._id,
        fromPeriod: plan.startPeriod,
      });
    }

    return {
      processed: plans.page.length,
      deletedSnapshots,
      continueCursor: plans.continueCursor,
      isDone: plans.isDone,
    };
  },
});

export const rebuildPlanSnapshotsAfterLogicChangeForPlan = internalMutation({
  args: { planId: v.id('plans') },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get('plans', args.planId);
    if (!plan) return { processed: 0, deletedSnapshots: 0 };
    const deletedSnapshots = await invalidatePlanSnapshotsByPlanId(ctx, plan._id);
    await ctx.scheduler.runAfter(0, internal.banking.planRead.recomputePlanSnapshots, {
      planId: plan._id,
      fromPeriod: plan.startPeriod,
    });
    return { processed: 1, deletedSnapshots };
  },
});

export const rebuildPlanSnapshotsAfterLogicChange = internalAction({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
    planId: v.optional(v.id('plans')),
  },
  handler: async (ctx, args): Promise<{ processed: number; deletedSnapshots: number }> => {
    if (args.planId) {
      return await ctx.runMutation(internal.migrations.rebuildPlanSnapshotsAfterLogicChangeForPlan, {
        planId: args.planId,
      });
    }
    const batchSize = Math.min(Math.max(args.batchSize ?? 5, 1), 10);
    let cursor: string | null = args.cursor ?? null;
    let page: {
      processed: number;
      deletedSnapshots: number;
      continueCursor: string;
      isDone: boolean;
    } = await ctx.runMutation(internal.migrations.rebuildPlanSnapshotsAfterLogicChangePage, {
      paginationOpts: { numItems: batchSize, cursor },
    });
    const totals = {
      processed: page.processed,
      deletedSnapshots: page.deletedSnapshots,
    };

    while (!page.isDone) {
      cursor = page.continueCursor;
      page = await ctx.runMutation(internal.migrations.rebuildPlanSnapshotsAfterLogicChangePage, {
        paginationOpts: { numItems: batchSize, cursor },
      });
      totals.processed += page.processed;
      totals.deletedSnapshots += page.deletedSnapshots;
    }

    return totals;
  },
});

export const backfillPlanStartDatesPage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const plans = await ctx.db.query('plans').paginate(args.paginationOpts);
    let updated = 0;
    let unchanged = 0;
    for (const plan of plans.page) {
      if (plan.startDate !== undefined) {
        unchanged += 1;
        continue;
      }
      await ctx.db.patch('plans', plan._id, { startDate: `${plan.startPeriod}-01` });
      updated += 1;
    }
    return {
      processed: plans.page.length,
      updated,
      unchanged,
      continueCursor: plans.continueCursor,
      isDone: plans.isDone,
    };
  },
});

export const backfillPlanStartDates = internalAction({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ processed: number; updated: number; unchanged: number }> => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 10, 1), 25);
    let cursor: string | null = args.cursor ?? null;
    let page: {
      processed: number;
      updated: number;
      unchanged: number;
      continueCursor: string;
      isDone: boolean;
    } = await ctx.runMutation(internal.migrations.backfillPlanStartDatesPage, {
      paginationOpts: { numItems: batchSize, cursor },
    });
    const totals = {
      processed: page.processed,
      updated: page.updated,
      unchanged: page.unchanged,
    };
    while (!page.isDone) {
      cursor = page.continueCursor;
      page = await ctx.runMutation(internal.migrations.backfillPlanStartDatesPage, {
        paginationOpts: { numItems: batchSize, cursor },
      });
      totals.processed += page.processed;
      totals.updated += page.updated;
      totals.unchanged += page.unchanged;
    }
    return totals;
  },
});

const danglingMoneyBoxReferenceTargetValidator = v.union(
  v.literal('planBuckets'),
  v.literal('plannedTransactions'),
  v.literal('subscriptions'),
  v.literal('moneyBoxContributions'),
);

type DanglingMoneyBoxReferenceTarget =
  | 'planBuckets'
  | 'plannedTransactions'
  | 'subscriptions'
  | 'moneyBoxContributions';

type DanglingMoneyBoxReferencePage = {
  processed: number;
  affected: number;
  continueCursor: string;
  isDone: boolean;
};

type DanglingMoneyBoxReferenceResult = {
  planBuckets: { cleared: number };
  plannedTransactions: { cleared: number };
  subscriptions: { cleared: number };
  moneyBoxContributions: { deleted: number };
};

export const cleanupDanglingMoneyBoxReferencesPage = internalMutation({
  args: {
    target: danglingMoneyBoxReferenceTargetValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<DanglingMoneyBoxReferencePage> => {
    const now = Date.now();
    let affected = 0;

    if (args.target === 'planBuckets') {
      const rows = await ctx.db.query('planBuckets').paginate(args.paginationOpts);
      for (const row of rows.page) {
        if (!row.moneyBoxId || (await ctx.db.get('moneyBoxes', row.moneyBoxId))) continue;
        await ctx.db.patch('planBuckets', row._id, { moneyBoxId: undefined, updatedAtMs: now });
        affected += 1;
      }
      return { processed: rows.page.length, affected, continueCursor: rows.continueCursor, isDone: rows.isDone };
    }

    if (args.target === 'plannedTransactions') {
      const rows = await ctx.db.query('plannedTransactions').paginate(args.paginationOpts);
      for (const row of rows.page) {
        if (!row.moneyBoxId || (await ctx.db.get('moneyBoxes', row.moneyBoxId))) continue;
        await ctx.db.patch('plannedTransactions', row._id, { moneyBoxId: undefined, updatedAtMs: now });
        affected += 1;
      }
      return { processed: rows.page.length, affected, continueCursor: rows.continueCursor, isDone: rows.isDone };
    }

    if (args.target === 'subscriptions') {
      const rows = await ctx.db.query('subscriptions').paginate(args.paginationOpts);
      for (const row of rows.page) {
        if (!row.moneyBoxId || (await ctx.db.get('moneyBoxes', row.moneyBoxId))) continue;
        await ctx.db.patch('subscriptions', row._id, { moneyBoxId: undefined, updatedAtMs: now });
        affected += 1;
      }
      return { processed: rows.page.length, affected, continueCursor: rows.continueCursor, isDone: rows.isDone };
    }

    const rows = await ctx.db.query('moneyBoxContributions').paginate(args.paginationOpts);
    for (const row of rows.page) {
      if (await ctx.db.get('moneyBoxes', row.moneyBoxId)) continue;
      await ctx.db.delete('moneyBoxContributions', row._id);
      affected += 1;
    }
    return { processed: rows.page.length, affected, continueCursor: rows.continueCursor, isDone: rows.isDone };
  },
});

export const cleanupDanglingMoneyBoxReferences = internalAction({
  args: {
    planBucketsCursor: v.optional(v.string()),
    plannedTransactionsCursor: v.optional(v.string()),
    subscriptionsCursor: v.optional(v.string()),
    moneyBoxContributionsCursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DanglingMoneyBoxReferenceResult> => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 10, 1), 25);

    const cleanupTarget = async (target: DanglingMoneyBoxReferenceTarget, initialCursor?: string): Promise<number> => {
      let cursor: string | null = initialCursor ?? null;
      let page: DanglingMoneyBoxReferencePage = await ctx.runMutation(
        internal.migrations.cleanupDanglingMoneyBoxReferencesPage,
        { target, paginationOpts: { numItems: batchSize, cursor } },
      );
      let affected = page.affected;

      while (!page.isDone) {
        cursor = page.continueCursor;
        page = await ctx.runMutation(internal.migrations.cleanupDanglingMoneyBoxReferencesPage, {
          target,
          paginationOpts: { numItems: batchSize, cursor },
        });
        affected += page.affected;
      }

      return affected;
    };

    return {
      planBuckets: { cleared: await cleanupTarget('planBuckets', args.planBucketsCursor) },
      plannedTransactions: {
        cleared: await cleanupTarget('plannedTransactions', args.plannedTransactionsCursor),
      },
      subscriptions: { cleared: await cleanupTarget('subscriptions', args.subscriptionsCursor) },
      moneyBoxContributions: {
        deleted: await cleanupTarget('moneyBoxContributions', args.moneyBoxContributionsCursor),
      },
    };
  },
});
