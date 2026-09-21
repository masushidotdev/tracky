import { absoluteMinorUnits } from '../lib/money';
import { internal } from '../_generated/api';
import { JEV_TRANSFER } from '../lib/jevThresholds';
import {
  AUTO_CONFIRM_TRANSFER_CONFIDENCE,
  createConfirmedTransferMatch,
  createTransferCandidateMatch,
} from './transferCore';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export function daysBetween(left: string, right: string) {
  const leftDate = new Date(`${left}T00:00:00.000Z`).getTime();
  const rightDate = new Date(`${right}T00:00:00.000Z`).getTime();
  return Math.round(Math.abs(leftDate - rightDate) / (24 * 60 * 60 * 1000));
}

export function isoDateOffset(date: string, offsetDays: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function transferAmountTolerance(amountMinor: bigint) {
  const percentageTolerance = amountMinor / 50n;
  const minimumTolerance = percentageTolerance > 300n ? percentageTolerance : 300n;
  return minimumTolerance > 1000n ? 1000n : minimumTolerance;
}

function transferCandidateConfidence(amountDeltaMinor: bigint, dayDelta: number) {
  const amountScore = amountDeltaMinor === 0n ? 0.9 : amountDeltaMinor <= 300n ? 0.82 : 0.72;
  return Math.max(0.6, amountScore - Math.min(dayDelta, 7) * 0.02);
}

// Looks for the opposite leg of a just-created transaction (imported or manual)
// and either auto-confirms the transfer match or records a review candidate.
export async function createTransferCandidateForTransaction(
  ctx: MutationCtx,
  args: {
    userId: string;
    transactionId: Id<'transactions'>;
  },
) {
  const transaction = await ctx.db.get('transactions', args.transactionId);
  if (!transaction || transaction.userId !== args.userId) {
    return null;
  }

  if (transaction.classificationKind === 'transfer' || transaction.classificationKind === 'internal') {
    return null;
  }

  // A transfer match asserts that the same money left one account and reached
  // another. A scheduled row is an intent, so it can be neither leg: it gets its
  // chance once it is promoted (or reconciled against the row that arrived).
  if (transaction.status === 'SCHD') {
    return null;
  }

  const fromDate = isoDateOffset(transaction.bookingDate, -7);
  const toDate = isoDateOffset(transaction.bookingDate, 7);
  const possibleMatches = await ctx.db
    .query('transactions')
    .withIndex('by_userId_and_bookingDate', (q) =>
      q.eq('userId', args.userId).gte('bookingDate', fromDate).lte('bookingDate', toDate),
    )
    .take(200);
  const toleranceMinor = transferAmountTolerance(transaction.amount.amountMinor);
  const rankedCandidates = possibleMatches
    .filter((candidate) => {
      if (candidate._id === transaction._id || candidate.accountId === transaction.accountId) {
        return false;
      }

      if (candidate.direction === transaction.direction || candidate.amount.currency !== transaction.amount.currency) {
        return false;
      }

      if (
        candidate.transferMatchId ||
        candidate.status === 'SCHD' ||
        candidate.classificationKind === 'transfer' ||
        candidate.classificationKind === 'internal'
      ) {
        return false;
      }

      return absoluteMinorUnits(candidate.amount.amountMinor - transaction.amount.amountMinor) <= toleranceMinor;
    })
    .map((candidate) => ({
      transaction: candidate,
      amountDeltaMinor: absoluteMinorUnits(candidate.amount.amountMinor - transaction.amount.amountMinor),
      dayDelta: daysBetween(candidate.bookingDate, transaction.bookingDate),
    }))
    .sort((left, right) => {
      if (left.amountDeltaMinor !== right.amountDeltaMinor) {
        return left.amountDeltaMinor < right.amountDeltaMinor ? -1 : 1;
      }

      return left.dayDelta - right.dayDelta;
    });

  if (rankedCandidates.length === 0) {
    return null;
  }

  const bestCandidate = rankedCandidates[0];
  const outgoingTransactionId = transaction.direction === 'DBIT' ? transaction._id : bestCandidate.transaction._id;
  const incomingTransactionId = transaction.direction === 'CRDT' ? transaction._id : bestCandidate.transaction._id;
  const confidence = transferCandidateConfidence(bestCandidate.amountDeltaMinor, bestCandidate.dayDelta);
  const notes =
    bestCandidate.amountDeltaMinor === 0n
      ? 'Matched imported debit and credit with the same amount.'
      : 'Matched imported debit and credit with a possible transfer fee.';

  if (confidence >= AUTO_CONFIRM_TRANSFER_CONFIDENCE) {
    return await createConfirmedTransferMatch(ctx, {
      userId: args.userId,
      outgoingTransactionId,
      incomingTransactionId,
      feeAmountMinor: bestCandidate.amountDeltaMinor === 0n ? undefined : bestCandidate.amountDeltaMinor,
      notes,
      source: 'system',
    });
  }

  // Ambiguous band: persist a review candidate now, then let jev arbitration
  // confirm it through the composite gate (scheduled by the caller below).
  const needsArbitration = confidence >= JEV_TRANSFER.arbitrateMin && confidence < JEV_TRANSFER.arbitrateMax;

  const matchId = await createTransferCandidateMatch(ctx, {
    userId: args.userId,
    outgoingTransactionId,
    incomingTransactionId,
    confidence,
    notes,
  });

  if (needsArbitration && matchId) {
    await ctx.scheduler.runAfter(0, internal.banking.transferArbitration.arbitrateTransferCandidate, {
      userId: args.userId,
      transferMatchId: matchId,
      heuristicConfidence: confidence,
    });
  }

  return matchId;
}
