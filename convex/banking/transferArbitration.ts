// UC2 — jev arbitration for ambiguous transfer candidates + planning-reconcile pairs (UC6).
// Sync heuristic scores stay authoritative outside the arbitration band; inside it,
// a `use node` action asks jev and only a composite gate (choice + confidence +
// noul) may confirm. Any jev failure falls closed to a review candidate.
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import { decide, jevChoice, jevNoul, minimizeJevText } from '../lib/jev';
import { JEV_PLANNING_RECONCILE, JEV_TRANSFER } from '../lib/jevThresholds';
import {
  AUTO_CONFIRM_TRANSFER_CONFIDENCE,
  confirmTransferCandidateMatch,
  createConfirmedTransferMatch,
  createTransferCandidateMatch,
} from './transferCore';

type LegSummary = {
  leg: 'outgoing' | 'incoming';
  bookingDate: string;
  description: string;
  counterpartyName?: string | null;
  amountMinor: bigint;
  currency: string;
  accountName?: string | null;
};

function summarizeLeg(
  transaction: {
    direction: 'DBIT' | 'CRDT';
    bookingDate: string;
    description: string;
    counterpartyName?: string | null;
    amount: { amountMinor: bigint; currency: string };
  },
  accountName?: string | null,
): LegSummary {
  return {
    leg: transaction.direction === 'DBIT' ? 'outgoing' : 'incoming',
    bookingDate: transaction.bookingDate,
    description: minimizeJevText(transaction.description),
    counterpartyName: transaction.counterpartyName ? minimizeJevText(transaction.counterpartyName, 120) : null,
    amountMinor: transaction.amount.amountMinor,
    currency: transaction.amount.currency,
    accountName: accountName ? minimizeJevText(accountName, 120) : null,
  };
}

// Composite gate shared by UC2 and UC6: the choice label alone never decides.
export function jevAutoConfirmGate(answer: {
  action?: { choice?: string; confidence?: number };
  sameMoney?: { noul?: number };
}) {
  return (
    answer.action?.choice === 'auto-confirm' &&
    (answer.action.confidence ?? 0) >= JEV_TRANSFER.autoConfirmActionConfidence &&
    (answer.sameMoney?.noul ?? 0) >= JEV_TRANSFER.autoConfirmSameMoney
  );
}

const transferArbitrationQuestions = {
  same_money: {
    type: 'noul' as const,
    instructions: 'Do these two legs represent the same money moved between accounts of the same person?',
  },
  strength: {
    type: 'score' as const,
    instructions: 'How strong is the evidence that this is one internal transfer?',
    criteria: ['Weak', 'Plausible', 'Strong', 'Conclusive'],
  },
  action: {
    type: 'choice' as const,
    instructions: 'What should the system do with this candidate pair?',
    criteria: {
      'auto-confirm': 'Link the legs without asking',
      review: 'Show the user for confirmation',
      reject: 'Discard, they are independent movements',
    },
  },
};

export const requestTransferArbitration = internalMutation({
  args: {
    userId: v.string(),
    outgoingTransactionId: v.id('transactions'),
    incomingTransactionId: v.id('transactions'),
    heuristicConfidence: v.number(),
  },
  handler: async (ctx, args) => {
    const outgoing = await ctx.db.get('transactions', args.outgoingTransactionId);
    const incoming = await ctx.db.get('transactions', args.incomingTransactionId);
    if (!outgoing || !incoming || outgoing.userId !== args.userId || incoming.userId !== args.userId) {
      return null;
    }
    if (outgoing.transferMatchId || incoming.transferMatchId) return null;
    const outgoingAccount = await ctx.db.get('financialAccounts', outgoing.accountId);
    const incomingAccount = await ctx.db.get('financialAccounts', incoming.accountId);
    const existing = await ctx.db
      .query('transferMatches')
      .withIndex('by_outgoingTransactionId', (q) => q.eq('outgoingTransactionId', outgoing._id))
      .take(20);
    const matchId = existing.some(
      (match) => match.incomingTransactionId === incoming._id && match.status !== 'rejected',
    )
      ? (existing.find((match) => match.incomingTransactionId === incoming._id)?._id ?? null)
      : await createTransferCandidateMatch(ctx, {
          userId: args.userId,
          outgoingTransactionId: outgoing._id,
          incomingTransactionId: incoming._id,
          confidence: args.heuristicConfidence,
          notes: `Heuristic score ${args.heuristicConfidence.toFixed(2)} awaiting jev arbitration.`,
        });
    if (!matchId) return null;
    await ctx.scheduler.runAfter(0, internal.banking.transferArbitration.arbitrateTransferCandidate, {
      userId: args.userId,
      transferMatchId: matchId,
      heuristicConfidence: args.heuristicConfidence,
    });
    return matchId;
  },
});

export const arbitrateTransferCandidate = internalAction({
  args: { userId: v.string(), transferMatchId: v.id('transferMatches'), heuristicConfidence: v.number() },
  handler: async (ctx, args): Promise<null> => {
    const match = await ctx.runQuery(internal.banking.transferArbitration.arbitrationMatchForUser, {
      userId: args.userId,
      transferMatchId: args.transferMatchId,
    });
    if (!match || match.status !== 'candidate') return null;
    try {
      const decision = await decide(
        { outgoing: match.outgoing, incoming: match.incoming, heuristicConfidence: args.heuristicConfidence },
        transferArbitrationQuestions,
      );
      const actionChoice = jevChoice(decision.answers.action);
      const moneyValue = jevNoul(decision.answers.same_money);
      const shouldConfirm =
        actionChoice !== undefined &&
        moneyValue !== undefined &&
        jevAutoConfirmGate({ action: { choice: actionChoice.choice, confidence: actionChoice.confidence }, sameMoney: { noul: moneyValue } });
      await ctx.runMutation(internal.banking.transferArbitration.applyArbitrationVerdict, {
        userId: args.userId,
        transferMatchId: args.transferMatchId,
        verdict: actionChoice?.choice === 'reject' ? 'reject' : shouldConfirm ? 'confirm' : 'review',
        confidence: actionChoice?.confidence ?? args.heuristicConfidence,
        note: `jev:${decision.model} same_money=${moneyValue?.toFixed(2) ?? '?'} cost=${decision.usage?.cost ?? '?'} latencyMs=${decision.latencyMs}`,
      });
    } catch {
      // Fail closed: the review candidate created above stays for the user.
      await ctx.runMutation(internal.banking.transferArbitration.applyArbitrationVerdict, {
        userId: args.userId,
        transferMatchId: args.transferMatchId,
        verdict: 'review',
        confidence: args.heuristicConfidence,
        note: 'jev arbitration unavailable; heuristic candidate kept for review.',
      });
    }
    return null;
  },
});

export const arbitrationMatchForUser = internalQuery({
  args: { userId: v.string(), transferMatchId: v.id('transferMatches') },
  handler: async (ctx, args) => {
    const match = await ctx.db.get('transferMatches', args.transferMatchId);
    if (!match || match.userId !== args.userId) return null;
    const outgoing = await ctx.db.get('transactions', match.outgoingTransactionId);
    const incoming = await ctx.db.get('transactions', match.incomingTransactionId);
    if (!outgoing || !incoming) return null;
    const outgoingAccount = await ctx.db.get('financialAccounts', outgoing.accountId);
    const incomingAccount = await ctx.db.get('financialAccounts', incoming.accountId);
    return {
      status: match.status,
      outgoing: summarizeLeg(outgoing, outgoingAccount?.name ?? outgoingAccount?.alias),
      incoming: summarizeLeg(incoming, incomingAccount?.name ?? incomingAccount?.alias),
    };
  },
});

export const applyArbitrationVerdict = internalMutation({
  args: {
    userId: v.string(),
    transferMatchId: v.id('transferMatches'),
    verdict: v.union(v.literal('confirm'), v.literal('review'), v.literal('reject')),
    confidence: v.number(),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get('transferMatches', args.transferMatchId);
    if (!match || match.userId !== args.userId || match.status !== 'candidate') return null;
    if (args.verdict === 'reject') {
      await ctx.db.patch('transferMatches', match._id, {
        status: 'rejected',
        notes: args.note.slice(0, 500),
        updatedAtMs: Date.now(),
      });
      return match._id;
    }
    if (args.verdict === 'confirm') {
      // UC6 uses the same composite gate; planning pairs confirm through the
      // identical path as transfer legs (transferMatches row already exists).
      // System provenance: the match records jev confidence + note, never a
      // fake user confirmation.
      if (
        args.confidence >= JEV_PLANNING_RECONCILE.autoConfirmActionConfidence ||
        args.confidence >= AUTO_CONFIRM_TRANSFER_CONFIDENCE
      ) {
        return await confirmTransferCandidateMatch(ctx, {
          userId: args.userId,
          transferMatchId: match._id,
          provenance: { source: 'system', confidence: args.confidence, note: args.note },
        });
      }
      await ctx.db.patch('transferMatches', match._id, {
        confidence: args.confidence,
        notes: args.note.slice(0, 500),
        updatedAtMs: Date.now(),
      });
      return match._id;
    }
    await ctx.db.patch('transferMatches', match._id, {
      confidence: args.confidence,
      notes: args.note.slice(0, 500),
      updatedAtMs: Date.now(),
    });
    return match._id;
  },
});

// UC6: ambiguous planning-reconcile pairs (candidates.length > 1 or amount drift)
// arbitrate through the same composite gate instead of first-match-or-nothing.
export const requestPlanningPairArbitration = internalMutation({
  args: {
    userId: v.string(),
    outgoingTransactionId: v.id('transactions'),
    incomingTransactionId: v.id('transactions'),
    heuristicConfidence: v.number(),
  },
  handler: async (ctx, args) => {
    const outgoing = await ctx.db.get('transactions', args.outgoingTransactionId);
    const incoming = await ctx.db.get('transactions', args.incomingTransactionId);
    if (!outgoing || !incoming || outgoing.userId !== args.userId || incoming.userId !== args.userId) {
      return null;
    }
    const matchId = await createTransferCandidateMatch(ctx, {
      userId: args.userId,
      outgoingTransactionId: outgoing._id,
      incomingTransactionId: incoming._id,
      confidence: args.heuristicConfidence,
      notes: `Planning-reconcile ambiguity awaiting jev arbitration.`,
    });
    if (!matchId) return null;
    await ctx.scheduler.runAfter(0, internal.banking.transferArbitration.arbitrateTransferCandidate, {
      userId: args.userId,
      transferMatchId: matchId,
      heuristicConfidence: args.heuristicConfidence,
    });
    return matchId;
  },
});

export { createConfirmedTransferMatch };
