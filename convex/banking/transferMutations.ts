import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import {
  confirmTransferCandidateMatch,
  createConfirmedTransferMatch,
  createTransferCandidateMatch,
  rejectTransferCandidateMatch,
} from './transferCore';

export const createTransferMatchForUser = internalMutation({
  args: {
    userId: v.string(),
    outgoingTransactionId: v.id('transactions'),
    incomingTransactionId: v.id('transactions'),
    feeAmountMinor: v.optional(v.int64()),
    notes: v.optional(v.string()),
    source: v.union(v.literal('system'), v.literal('user')),
  },
  handler: async (ctx, args) => {
    return await createConfirmedTransferMatch(ctx, args);
  },
});

export const createTransferCandidateForUser = internalMutation({
  args: {
    userId: v.string(),
    outgoingTransactionId: v.id('transactions'),
    incomingTransactionId: v.id('transactions'),
    confidence: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await createTransferCandidateMatch(ctx, args);
  },
});

export const confirmTransferCandidateForUser = internalMutation({
  args: {
    userId: v.string(),
    transferMatchId: v.id('transferMatches'),
  },
  handler: async (ctx, args) => {
    return await confirmTransferCandidateMatch(ctx, args);
  },
});

export const rejectTransferCandidateForUser = internalMutation({
  args: {
    userId: v.string(),
    transferMatchId: v.id('transferMatches'),
  },
  handler: async (ctx, args) => {
    return await rejectTransferCandidateMatch(ctx, args);
  },
});
