import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import {
  confirmTransferCandidateMatch,
  createConfirmedTransferMatch,
  createTransferCandidateMatch,
  rejectTransferCandidateMatch,
  unlinkConfirmedTransferMatch,
} from './transferCore';

export const listTransferMatches = query({
  args: {
    status: v.optional(v.union(v.literal('candidate'), v.literal('confirmed'), v.literal('rejected'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const limit = Math.min(args.limit ?? 100, 200);

    if (args.status) {
      return await ctx.db
        .query('transferMatches')
        .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id).eq('status', args.status!))
        .take(limit);
    }

    return await ctx.db
      .query('transferMatches')
      .withIndex('by_userId_and_status', (q) => q.eq('userId', user.id))
      .take(limit);
  },
});

export const createManualTransferMatch = mutation({
  args: {
    outgoingTransactionId: v.id('transactions'),
    incomingTransactionId: v.id('transactions'),
    feeAmountMinor: v.optional(v.int64()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await createConfirmedTransferMatch(ctx, {
      userId: user.id,
      outgoingTransactionId: args.outgoingTransactionId,
      incomingTransactionId: args.incomingTransactionId,
      feeAmountMinor: args.feeAmountMinor,
      notes: args.notes,
      source: 'user',
    });
  },
});

export const confirmTransferCandidate = mutation({
  args: {
    transferMatchId: v.id('transferMatches'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await confirmTransferCandidateMatch(ctx, {
      userId: user.id,
      transferMatchId: args.transferMatchId,
    });
  },
});

export const rejectTransferCandidate = mutation({
  args: {
    transferMatchId: v.id('transferMatches'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await rejectTransferCandidateMatch(ctx, {
      userId: user.id,
      transferMatchId: args.transferMatchId,
    });
  },
});

export const unlinkTransferMatch = mutation({
  args: {
    transferMatchId: v.id('transferMatches'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    return await unlinkConfirmedTransferMatch(ctx, {
      userId: user.id,
      transferMatchId: args.transferMatchId,
    });
  },
});

export const rejectManualTransferCandidate = mutation({
  args: {
    outgoingTransactionId: v.id('transactions'),
    incomingTransactionId: v.id('transactions'),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const transferMatchId = await createTransferCandidateMatch(ctx, {
      userId: user.id,
      outgoingTransactionId: args.outgoingTransactionId,
      incomingTransactionId: args.incomingTransactionId,
      confidence: 0,
      notes: 'Rejected from manual review suggestions.',
    });

    if (!transferMatchId) {
      return null;
    }

    return await rejectTransferCandidateMatch(ctx, {
      userId: user.id,
      transferMatchId,
    });
  },
});
