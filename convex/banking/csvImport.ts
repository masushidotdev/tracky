import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { moneyAmountValidator } from '../lib/validators';
import { findFirstMatchingCategoryRule } from './categoryRuleCore';
import {
  applyManualBalanceDelta,
  assertBookingDate,
  balanceEffectMinor,
  getOwnedManualAccount,
  resolveManualClassification,
} from './manualTransactions';
import { reconcileImportedTransactionWithPlannedExpenses } from './planningReconciliation';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import { createTransferCandidateForTransaction } from './transferCandidates';
import type { Doc } from '../_generated/dataModel';

const directionValidator = v.union(v.literal('CRDT'), v.literal('DBIT'));

const csvImportRowValidator = v.object({
  direction: directionValidator,
  amount: moneyAmountValidator,
  bookingDate: v.string(),
  description: v.string(),
  counterpartyName: v.optional(v.string()),
  categoryId: v.optional(v.id('categories')),
  dedupeKey: v.string(),
});

function errorReason(error: unknown) {
  if (error instanceof ConvexError) {
    return typeof error.data === 'string' ? error.data : JSON.stringify(error.data);
  }
  return error instanceof Error ? error.message : 'Invalid transaction row';
}

function assertCsvDedupeKey(dedupeKey: string) {
  if (!dedupeKey.startsWith('csv|') || dedupeKey.length <= 4) {
    throw new ConvexError('CSV dedupe key must start with csv|');
  }
}

export const findExistingDedupeKeys = query({
  args: {
    accountId: v.id('financialAccounts'),
    dedupeKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    await getOwnedManualAccount(ctx, user.id, args.accountId);
    if (args.dedupeKeys.length > 500) {
      throw new ConvexError('At most 500 dedupe keys can be checked at once');
    }

    const existing: Array<string> = [];
    for (const dedupeKey of new Set(args.dedupeKeys)) {
      const transaction = await ctx.db
        .query('transactions')
        .withIndex('by_accountId_and_dedupeKey', (q) => q.eq('accountId', args.accountId).eq('dedupeKey', dedupeKey))
        .unique();
      if (transaction) {
        existing.push(dedupeKey);
      }
    }
    return existing;
  },
});

export const importManualTransactionsBatch = mutation({
  args: {
    accountId: v.id('financialAccounts'),
    rows: v.array(csvImportRowValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    if (args.rows.length > 100) {
      throw new ConvexError('At most 100 transactions can be imported per batch');
    }

    const account = await getOwnedManualAccount(ctx, user.id, args.accountId);
    const categoryRules = await ctx.db
      .query('categoryRules')
      .withIndex('by_userId_and_priority', (q) => q.eq('userId', user.id))
      .take(200);
    const seenDedupeKeys = new Set<string>();
    const failed: Array<{ index: number; reason: string }> = [];
    let imported = 0;
    let skippedDuplicates = 0;
    let aggregateBalanceDelta = 0n;
    const affectedDates: Array<string | undefined> = [];

    for (const [index, row] of args.rows.entries()) {
      if (seenDedupeKeys.has(row.dedupeKey)) {
        skippedDuplicates += 1;
        continue;
      }
      seenDedupeKeys.add(row.dedupeKey);

      const existing = await ctx.db
        .query('transactions')
        .withIndex('by_accountId_and_dedupeKey', (q) => q.eq('accountId', account._id).eq('dedupeKey', row.dedupeKey))
        .unique();
      if (existing) {
        skippedDuplicates += 1;
        continue;
      }

      let prepared:
        | {
            categoryId?: typeof row.categoryId;
            classificationKind: 'expense' | 'income' | 'transfer' | 'subscription' | 'internal';
            counterpartyName?: string;
            description: string;
            rulePatch?: Partial<Pick<Doc<'transactions'>, 'tagIds' | 'hiddenFromReports'>>;
          }
        | undefined;
      try {
        assertCsvDedupeKey(row.dedupeKey);
        assertBookingDate(row.bookingDate);
        if (row.amount.amountMinor <= 0n) {
          throw new ConvexError('Amount must be greater than zero');
        }
        if (row.amount.currency !== account.currency) {
          throw new ConvexError('Amount currency must match the account currency');
        }
        const description = row.description.trim();
        if (!description) {
          throw new ConvexError('Description is required');
        }

        const matchingRule =
          row.categoryId || row.direction !== 'DBIT'
            ? null
            : findFirstMatchingCategoryRule(categoryRules, {
                description,
                counterpartyName: row.counterpartyName,
              });
        const selectedCategoryId = row.categoryId ?? matchingRule?.categoryId;
        const classification = await resolveManualClassification(ctx, {
          userId: user.id,
          direction: row.direction,
          categoryId: selectedCategoryId,
        });
        prepared = {
          categoryId: classification.categoryId,
          classificationKind: classification.classificationKind,
          counterpartyName: row.counterpartyName?.trim() || undefined,
          description,
          rulePatch: matchingRule?.transactionPatch,
        };
      } catch (error) {
        failed.push({ index, reason: errorReason(error) });
        continue;
      }
      const now = Date.now();
      const transactionId = await ctx.db.insert('transactions', {
        userId: user.id,
        accountId: account._id,
        providerConnectionId: account.providerConnectionId!,
        provider: 'manual',
        dedupeKey: row.dedupeKey,
        status: 'BOOK',
        direction: row.direction,
        amount: row.amount,
        bookingDate: row.bookingDate,
        transactionDate: row.bookingDate,
        description: prepared.description,
        counterpartyName: prepared.counterpartyName,
        classificationKind: prepared.classificationKind,
        classificationSource: row.categoryId ? 'user' : 'system',
        classificationConfidence: 1,
        categoryId: prepared.categoryId,
        ...prepared.rulePatch,
        importedAtMs: now,
        updatedAtMs: now,
      });

      aggregateBalanceDelta += balanceEffectMinor(row.direction, row.amount.amountMinor);
      imported += 1;
      affectedDates.push(row.bookingDate);
      await reconcileImportedTransactionWithPlannedExpenses(ctx, transactionId);
      await createTransferCandidateForTransaction(ctx, { userId: user.id, transactionId });
    }

    await applyManualBalanceDelta(ctx, account, aggregateBalanceDelta);
    await invalidatePlanSnapshots(ctx, user.id, affectedDates);
    return { imported, skippedDuplicates, failed };
  },
});
