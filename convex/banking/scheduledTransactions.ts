import { ConvexError, v } from 'convex/values';
import { internalMutation, mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { absoluteMinorUnits } from '../lib/money';
import {
  applyManualBalanceDelta,
  assertManualTransactionDeletable,
  balanceEffectMinor,
  todayIsoDate,
} from './manualTransactions';
import { reconcileImportedTransactionWithPlannedExpenses } from './planningReconciliation';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import { createTransferCandidateForTransaction } from './transferCandidates';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const MAX_PROMOTION_BATCH = 200;
const MAX_CANDIDATE_SCAN = 200;
const MAX_CANDIDATE_DAYS_WINDOW = 45;

// The row that arrives from the bank rarely matches the plan to the cent
// (variable bills, rounding, fees), so allow 2% inside a 3.00-20.00 band.
function reconciliationAmountTolerance(amountMinor: bigint) {
  const percentage = absoluteMinorUnits(amountMinor) / 50n;
  if (percentage < 300n) {
    return 300n;
  }

  return percentage > 2000n ? 2000n : percentage;
}

function isoDateOffset(date: string, offsetDays: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function daysBetween(left: string, right: string) {
  const leftMs = new Date(`${left}T00:00:00.000Z`).getTime();
  const rightMs = new Date(`${right}T00:00:00.000Z`).getTime();
  return Math.round(Math.abs(leftMs - rightMs) / (24 * 60 * 60 * 1000));
}

async function getOwnedScheduledTransaction(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  transactionId: Id<'transactions'>,
) {
  const transaction = await ctx.db.get('transactions', transactionId);
  if (!transaction || transaction.userId !== userId) {
    throw new ConvexError('Transaction not found');
  }

  if (transaction.status !== 'SCHD') {
    throw new ConvexError('This transaction is not scheduled');
  }

  return transaction;
}

// Daily promotion of scheduled rows whose date has arrived. Manual accounts
// only: a linked account's truth comes from the bank, so its scheduled rows wait
// for the imported row and are reconciled against it instead.
export const promoteDueScheduledTransactions = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const today = todayIsoDate();
    const dueTransactions = await ctx.db
      .query('transactions')
      .withIndex('by_status_and_bookingDate', (q) => q.eq('status', 'SCHD').lte('bookingDate', today))
      .take(Math.min(args.limit ?? MAX_PROMOTION_BATCH, MAX_PROMOTION_BATCH));

    const accountCache = new Map<Id<'financialAccounts'>, Doc<'financialAccounts'> | null>();
    let promoted = 0;

    for (const transaction of dueTransactions) {
      if (!accountCache.has(transaction.accountId)) {
        accountCache.set(transaction.accountId, await ctx.db.get('financialAccounts', transaction.accountId));
      }
      const account = accountCache.get(transaction.accountId) ?? null;
      if (!account || account.userId !== transaction.userId || account.provider !== 'manual') {
        continue;
      }

      // Patching the status out of SCHD is what makes this idempotent: the row
      // no longer matches the index this batch reads from.
      await ctx.db.patch('transactions', transaction._id, { status: 'BOOK', updatedAtMs: Date.now() });
      // The delta was deliberately skipped when the row was created, so this is
      // the one moment the money can move. Skipping it here would leave the
      // account permanently short.
      await applyManualBalanceDelta(
        ctx,
        account,
        balanceEffectMinor(transaction.direction, transaction.amount.amountMinor),
      );

      // Everything createManualTransaction does for a booked row, now that this
      // one finally is booked.
      await reconcileImportedTransactionWithPlannedExpenses(ctx, transaction._id);
      await createTransferCandidateForTransaction(ctx, {
        userId: transaction.userId,
        transactionId: transaction._id,
      });
      await invalidatePlanSnapshots(ctx, transaction.userId, [transaction.bookingDate]);
      promoted += 1;
    }

    return { promoted };
  },
});

export const listScheduledReconciliationCandidates = query({
  args: {
    scheduledTransactionId: v.id('transactions'),
    daysWindow: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const scheduled = await getOwnedScheduledTransaction(ctx, user.id, args.scheduledTransactionId);

    const requestedDaysWindow = args.daysWindow ?? 7;
    if (!Number.isInteger(requestedDaysWindow) || requestedDaysWindow < 0) {
      throw new ConvexError('Days window must be a non-negative integer');
    }
    const daysWindow = Math.min(requestedDaysWindow, MAX_CANDIDATE_DAYS_WINDOW);
    const limit = Math.min(args.limit ?? 10, 50);
    const toleranceMinor = reconciliationAmountTolerance(scheduled.amount.amountMinor);

    const rows = await ctx.db
      .query('transactions')
      .withIndex('by_userId_and_accountId_and_bookingDate', (q) =>
        q
          .eq('userId', user.id)
          .eq('accountId', scheduled.accountId)
          .gte('bookingDate', isoDateOffset(scheduled.bookingDate, -daysWindow))
          .lte('bookingDate', isoDateOffset(scheduled.bookingDate, daysWindow)),
      )
      .take(MAX_CANDIDATE_SCAN);

    return rows
      .filter(
        (candidate) =>
          candidate._id !== scheduled._id &&
          candidate.status === 'BOOK' &&
          candidate.direction === scheduled.direction &&
          candidate.amount.currency === scheduled.amount.currency &&
          absoluteMinorUnits(candidate.amount.amountMinor - scheduled.amount.amountMinor) <= toleranceMinor,
      )
      .map((candidate) => ({
        transactionId: candidate._id,
        bookingDate: candidate.bookingDate,
        description: candidate.description,
        counterpartyName: candidate.counterpartyName ?? null,
        amount: candidate.amount,
        direction: candidate.direction,
        categoryId: candidate.categoryId ?? null,
        amountDeltaMinor: absoluteMinorUnits(candidate.amount.amountMinor - scheduled.amount.amountMinor),
        dayDelta: daysBetween(candidate.bookingDate, scheduled.bookingDate),
      }))
      .sort((left, right) => {
        if (left.amountDeltaMinor !== right.amountDeltaMinor) {
          return left.amountDeltaMinor < right.amountDeltaMinor ? -1 : 1;
        }

        return left.dayDelta - right.dayDelta;
      })
      .slice(0, limit);
  },
});

// Links a scheduled row to the imported row that actually arrived. The booked
// row survives because it is the provider's: it carries a dedupeKey and is
// re-upserted on every sync, so it would come straight back. The scheduled row
// is deleted rather than kept alongside it, because any consumer that forgets to
// filter on status would otherwise count the same euro twice forever.
export const reconcileScheduledTransaction = mutation({
  args: {
    scheduledTransactionId: v.id('transactions'),
    bookedTransactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    if (args.scheduledTransactionId === args.bookedTransactionId) {
      throw new ConvexError('A scheduled transaction cannot be reconciled against itself');
    }

    const scheduled = await getOwnedScheduledTransaction(ctx, user.id, args.scheduledTransactionId);
    const booked = await ctx.db.get('transactions', args.bookedTransactionId);
    if (!booked || booked.userId !== user.id) {
      throw new ConvexError('Transaction not found');
    }

    if (booked.status !== 'BOOK') {
      throw new ConvexError('Only a booked transaction can settle a scheduled one');
    }

    if (booked.accountId !== scheduled.accountId) {
      throw new ConvexError('Both transactions must belong to the same account');
    }

    const staleMatchIds = await assertManualTransactionDeletable(ctx, scheduled);

    // Carry the user's intent onto the imported row wherever it has none of its
    // own; never overwrite what the provider or the user already decided there.
    const patch: Partial<Doc<'transactions'>> = {};
    if (!booked.categoryId && scheduled.categoryId) {
      patch.categoryId = scheduled.categoryId;
    }
    if (!booked.note && scheduled.note) {
      patch.note = scheduled.note;
    }
    if (!booked.tagIds?.length && scheduled.tagIds?.length) {
      patch.tagIds = scheduled.tagIds;
    }
    if (booked.classificationKind === 'uncategorized' && scheduled.classificationKind !== 'uncategorized') {
      patch.classificationKind = scheduled.classificationKind;
    }
    if (Object.keys(patch).length > 0) {
      patch.classificationSource = 'user';
      patch.classificationConfidence = 1;
      patch.updatedAtMs = Date.now();
      await ctx.db.patch('transactions', booked._id, patch);
    }

    for (const matchId of staleMatchIds) {
      await ctx.db.delete('transferMatches', matchId);
    }
    // The scheduled row never moved the balance, so nothing is reversed here.
    await ctx.db.delete('transactions', scheduled._id);
    await invalidatePlanSnapshots(ctx, user.id, [scheduled.bookingDate, booked.bookingDate]);

    return booked._id;
  },
});

