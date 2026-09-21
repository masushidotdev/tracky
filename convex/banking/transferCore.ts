import { ConvexError } from 'convex/values';
import { absoluteMinorUnits } from '../lib/money';
import { settleScheduledCycleForCardCredit } from './cardStatementSettlement';
import { classificationKindForCategory } from './categoryTaxonomy';
import { invalidatePlanSnapshots } from './planSnapshotInvalidation';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

// Minimum candidate confidence at which an imported transaction pair is
// auto-confirmed as an internal transfer instead of waiting for user review.
export const AUTO_CONFIRM_TRANSFER_CONFIDENCE = 0.88;

export async function createConfirmedTransferMatch(
  ctx: MutationCtx,
  args: {
    userId: string;
    outgoingTransactionId: Id<'transactions'>;
    incomingTransactionId: Id<'transactions'>;
    feeAmountMinor?: bigint;
    notes?: string;
    source: 'system' | 'user';
  },
) {
  const outgoing = await ctx.db.get('transactions', args.outgoingTransactionId);
  const incoming = await ctx.db.get('transactions', args.incomingTransactionId);

  if (!outgoing || outgoing.userId !== args.userId) {
    throw new ConvexError('Outgoing transaction not found');
  }

  if (!incoming || incoming.userId !== args.userId) {
    throw new ConvexError('Incoming transaction not found');
  }

  if (outgoing.direction !== 'DBIT' || incoming.direction !== 'CRDT') {
    throw new ConvexError('Transfers require one debit and one credit transaction');
  }

  if (outgoing.accountId === incoming.accountId) {
    throw new ConvexError('Transfers require transactions from different accounts');
  }

  if (outgoing.transferMatchId || incoming.transferMatchId) {
    throw new ConvexError('One of these transactions is already matched as a transfer');
  }

  if (outgoing.amount.currency !== incoming.amount.currency) {
    throw new ConvexError('Transfers across currencies are not supported yet');
  }

  const deltaMinor = absoluteMinorUnits(outgoing.amount.amountMinor - incoming.amount.amountMinor);
  const now = Date.now();
  const transferMatchId = await ctx.db.insert('transferMatches', {
    userId: args.userId,
    outgoingTransactionId: outgoing._id,
    incomingTransactionId: incoming._id,
    status: 'confirmed',
    amountDelta: {
      amountMinor: deltaMinor,
      currency: outgoing.amount.currency,
    },
    feeAmount:
      args.feeAmountMinor === undefined
        ? undefined
        : {
            amountMinor: args.feeAmountMinor,
            currency: outgoing.amount.currency,
          },
    confidence: args.source === 'user' ? 1 : 0.9,
    source: args.source,
    notes: args.notes,
    createdAtMs: now,
    updatedAtMs: now,
  });

  await ctx.db.patch('transactions', outgoing._id, {
    classificationKind: 'transfer',
    classificationSource: args.source,
    classificationConfidence: args.source === 'user' ? 1 : 0.9,
    transferMatchId,
    updatedAtMs: now,
  });

  await ctx.db.patch('transactions', incoming._id, {
    classificationKind: 'transfer',
    classificationSource: args.source,
    classificationConfidence: args.source === 'user' ? 1 : 0.9,
    transferMatchId,
    updatedAtMs: now,
  });

  await settleScheduledCycleForCardCredit(ctx, {
    userId: args.userId,
    incomingTransactionId: incoming._id,
  });
  // Confirming a match reclassifies both legs as transfer, which removes them from plan activity.
  await invalidatePlanSnapshots(ctx, args.userId, [outgoing.bookingDate, incoming.bookingDate]);

  return transferMatchId;
}

export async function createTransferCandidateMatch(
  ctx: MutationCtx,
  args: {
    userId: string;
    outgoingTransactionId: Id<'transactions'>;
    incomingTransactionId: Id<'transactions'>;
    confidence: number;
    notes?: string;
  },
) {
  const outgoing = await ctx.db.get('transactions', args.outgoingTransactionId);
  const incoming = await ctx.db.get('transactions', args.incomingTransactionId);

  if (!outgoing || outgoing.userId !== args.userId || !incoming || incoming.userId !== args.userId) {
    return null;
  }

  if (outgoing.direction !== 'DBIT' || incoming.direction !== 'CRDT') {
    return null;
  }

  if (outgoing.accountId === incoming.accountId || outgoing.amount.currency !== incoming.amount.currency) {
    return null;
  }

  if (outgoing.transferMatchId || incoming.transferMatchId) {
    return null;
  }

  const existingForOutgoing = await ctx.db
    .query('transferMatches')
    .withIndex('by_outgoingTransactionId', (q) => q.eq('outgoingTransactionId', outgoing._id))
    .take(20);
  if (
    existingForOutgoing.some((match) => match.incomingTransactionId === incoming._id && match.status !== 'rejected')
  ) {
    return existingForOutgoing.find((match) => match.incomingTransactionId === incoming._id)?._id ?? null;
  }

  const amountDeltaMinor = absoluteMinorUnits(outgoing.amount.amountMinor - incoming.amount.amountMinor);
  const now = Date.now();
  return await ctx.db.insert('transferMatches', {
    userId: args.userId,
    outgoingTransactionId: outgoing._id,
    incomingTransactionId: incoming._id,
    status: 'candidate',
    amountDelta: {
      amountMinor: amountDeltaMinor,
      currency: outgoing.amount.currency,
    },
    feeAmount:
      amountDeltaMinor === 0n
        ? undefined
        : {
            amountMinor: amountDeltaMinor,
            currency: outgoing.amount.currency,
          },
    confidence: args.confidence,
    source: 'system',
    notes: args.notes,
    createdAtMs: now,
    updatedAtMs: now,
  });
}

export async function confirmTransferCandidateMatch(
  ctx: MutationCtx,
  args: {
    userId: string;
    transferMatchId: Id<'transferMatches'>;
    // System-provenance mode for jev arbitration: records calibrated system
    // confidence + note instead of claiming user confirmation. Defaults to the
    // historical user path so existing callers are unaffected.
    provenance?: {
      source: 'system';
      confidence: number;
      note: string;
    };
  },
) {
  const match = await ctx.db.get('transferMatches', args.transferMatchId);
  if (!match || match.userId !== args.userId) {
    throw new ConvexError('Transfer candidate not found');
  }

  if (match.status !== 'candidate') {
    throw new ConvexError('Transfer match is not pending review');
  }

  const outgoing = await ctx.db.get('transactions', match.outgoingTransactionId);
  const incoming = await ctx.db.get('transactions', match.incomingTransactionId);
  if (!outgoing || outgoing.userId !== args.userId || !incoming || incoming.userId !== args.userId) {
    throw new ConvexError('Transfer candidate transactions not found');
  }

  if (outgoing.transferMatchId || incoming.transferMatchId) {
    throw new ConvexError('One of these transactions is already matched as a transfer');
  }

  const now = Date.now();
  const systemProvenance = args.provenance?.source === 'system' ? args.provenance : undefined;
  const provenanceSource = systemProvenance ? ('system' as const) : ('user' as const);
  const provenanceConfidence = systemProvenance ? systemProvenance.confidence : 1;
  await ctx.db.patch('transferMatches', match._id, {
    status: 'confirmed',
    source: provenanceSource,
    confidence: provenanceConfidence,
    ...(systemProvenance ? { notes: systemProvenance.note.slice(0, 500) } : {}),
    updatedAtMs: now,
  });

  await ctx.db.patch('transactions', outgoing._id, {
    classificationKind: 'transfer',
    classificationSource: provenanceSource,
    classificationConfidence: provenanceConfidence,
    transferMatchId: match._id,
    updatedAtMs: now,
  });

  await ctx.db.patch('transactions', incoming._id, {
    classificationKind: 'transfer',
    classificationSource: provenanceSource,
    classificationConfidence: provenanceConfidence,
    transferMatchId: match._id,
    updatedAtMs: now,
  });

  await settleScheduledCycleForCardCredit(ctx, {
    userId: args.userId,
    incomingTransactionId: incoming._id,
  });
  await invalidatePlanSnapshots(ctx, args.userId, [outgoing.bookingDate, incoming.bookingDate]);

  return match._id;
}

// Re-derives the classification a leg falls back to once its transfer match
// is gone: the category's kind wins when the leg still has one, otherwise the
// direction's plain expense/income fallback, otherwise uncategorized.
async function reclassifyUnlinkedLeg(ctx: MutationCtx, transaction: Doc<'transactions'>, now: number) {
  let classificationKind: Doc<'transactions'>['classificationKind'] = 'uncategorized';
  if (transaction.categoryId) {
    const category = await ctx.db.get('categories', transaction.categoryId);
    if (category) {
      const fallbackKind = transaction.direction === 'DBIT' ? ('expense' as const) : ('income' as const);
      classificationKind = classificationKindForCategory(category, fallbackKind);
    }
  }

  await ctx.db.patch('transactions', transaction._id, {
    transferMatchId: undefined,
    classificationKind,
    classificationSource: 'user',
    classificationConfidence: 1,
    updatedAtMs: now,
  });
}

export async function unlinkConfirmedTransferMatch(
  ctx: MutationCtx,
  args: {
    userId: string;
    transferMatchId: Id<'transferMatches'>;
  },
) {
  const match = await ctx.db.get('transferMatches', args.transferMatchId);
  if (!match || match.userId !== args.userId) {
    throw new ConvexError('Transfer match not found');
  }

  if (match.status !== 'confirmed') {
    throw new ConvexError('Transfer match is not confirmed');
  }

  // A paid planned transfer points at this match: unlinking would leave it
  // pointing at a match that no longer exists.
  const linkedPlannedTransfer = await ctx.db
    .query('plannedTransactions')
    .withIndex('by_completedTransferMatchId', (q) => q.eq('completedTransferMatchId', match._id))
    .first();
  if (linkedPlannedTransfer && linkedPlannedTransfer.userId === args.userId) {
    throw new ConvexError('Reopen the linked planned transfer before unlinking this transfer');
  }

  const outgoing = await ctx.db.get('transactions', match.outgoingTransactionId);
  const incoming = await ctx.db.get('transactions', match.incomingTransactionId);
  if (!outgoing || outgoing.userId !== args.userId || !incoming || incoming.userId !== args.userId) {
    throw new ConvexError('Transfer match transactions not found');
  }

  const now = Date.now();

  // Revert the card statement auto-settlement this match may have triggered,
  // so the cycle becomes payable again instead of silently staying "paid"
  // with a transaction reference that no longer represents a transfer.
  const usageCycle = await ctx.db
    .query('creditFacilityUsageCycles')
    .withIndex('by_transactionId', (q) => q.eq('transactionId', incoming._id))
    .first();
  if (usageCycle && usageCycle.userId === args.userId && usageCycle.status === 'paid') {
    await ctx.db.patch('creditFacilityUsageCycles', usageCycle._id, {
      status: 'scheduled',
      transactionId: undefined,
      paidAtMs: undefined,
      updatedAtMs: now,
    });
  }

  await reclassifyUnlinkedLeg(ctx, outgoing, now);
  await reclassifyUnlinkedLeg(ctx, incoming, now);

  await ctx.db.delete('transferMatches', match._id);
  await invalidatePlanSnapshots(ctx, args.userId, [outgoing.bookingDate, incoming.bookingDate]);

  return match._id;
}

export async function rejectTransferCandidateMatch(
  ctx: MutationCtx,
  args: {
    userId: string;
    transferMatchId: Id<'transferMatches'>;
  },
) {
  const match = await ctx.db.get('transferMatches', args.transferMatchId);
  if (!match || match.userId !== args.userId) {
    throw new ConvexError('Transfer candidate not found');
  }

  if (match.status !== 'candidate') {
    throw new ConvexError('Transfer match is not pending review');
  }

  await ctx.db.patch('transferMatches', match._id, {
    status: 'rejected',
    updatedAtMs: Date.now(),
  });

  return match._id;
}
