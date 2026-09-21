// UC3 — jev subscription sentinel. The deterministic detector
// (subscriptionDetection + subscriptionReviewCore) stays authoritative for
// amounts and cadence; jev classifies ambiguous series (price hikes, zombies,
// one-off clusters) and proposes planned-expense creation. Never auto-cancels:
// zombie verdicts are alerts with evidence, never writes.
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import { decide, jevChoice, jevNoul, minimizeJevText } from '../lib/jev';
import { JEV_SUBSCRIPTION } from '../lib/jevThresholds';
import { subscriptionSentinelQuestions } from '../analyst/proactive/jevGates';
import { findRelatedSubscriptionTransactions } from './subscriptionDetection';

export const sentinelSeriesForUser = internalQuery({
  args: { userId: v.string(), transactionId: v.id('transactions'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get('transactions', args.transactionId);
    if (!transaction || transaction.userId !== args.userId) return null;
    // findRelatedSubscriptionTransactions already includes the anchor
    // transaction in every branch, so prepending it would duplicate the row
    // and let two distinct charges pass the minCharges gate.
    const related = await findRelatedSubscriptionTransactions(ctx, transaction);
    const series = related
      .filter((row) => row.userId === args.userId)
      .sort((left, right) => left.bookingDate.localeCompare(right.bookingDate))
      .slice(-8);
    if (series.length < JEV_SUBSCRIPTION.minCharges) return null;
    return series.map((row) => ({
      bookingDate: row.bookingDate,
      description: minimizeJevText(row.description),
      counterpartyName: row.counterpartyName ? minimizeJevText(row.counterpartyName, 120) : null,
      amountMinor: row.amount.amountMinor,
      currency: row.amount.currency,
      direction: row.direction,
    }));
  },
});

export const requestSentinelReview = internalMutation({
  args: { userId: v.string(), transactionId: v.id('transactions') },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.banking.subscriptionSentinel.classifySeries, {
      userId: args.userId,
      transactionId: args.transactionId,
    });
    return null;
  },
});

export const classifySeries = internalAction({
  args: { userId: v.string(), transactionId: v.id('transactions') },
  handler: async (ctx, args): Promise<null> => {
    const series = await ctx.runQuery(internal.banking.subscriptionSentinel.sentinelSeriesForUser, {
      userId: args.userId,
      transactionId: args.transactionId,
    });
    if (!series) return null;
    try {
      const decision = await decide({ series }, subscriptionSentinelQuestions);
      const status = jevChoice(decision.answers.status);
      const createPlanned = jevNoul(decision.answers.create_planned);
      // Telemetry to console, never to the user's memo field.
      console.log(
        `[jev:sentinel:v1] model=${decision.model} cost=${decision.usage?.cost ?? '?'} latencyMs=${decision.latencyMs} status=${status?.choice ?? 'active'}`,
      );
      await ctx.runMutation(internal.banking.subscriptionSentinel.recordSentinelVerdict, {
        userId: args.userId,
        transactionId: args.transactionId,
        status: status?.choice ?? 'active',
        confidence: status?.confidence ?? 0,
        createPlanned: createPlanned ?? 0,
      });
    } catch {
      // Fail closed: no verdict row, deterministic detection is unaffected.
    }
    return null;
  },
});

// Advisory verdict only. Currently a no-op sink for the classifier output:
// recording must never scribble on the user's memo field, and creation of
// plannedTransactions rows stays a user-confirmed action. Kept as the seam
// where a future review-queue surface reads verdicts without touching notes.
export const recordSentinelVerdict = internalMutation({
  args: {
    userId: v.string(),
    transactionId: v.id('transactions'),
    status: v.string(),
    confidence: v.number(),
    createPlanned: v.number(),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get('transactions', args.transactionId);
    if (!transaction || transaction.userId !== args.userId) return null;
    return transaction._id;
  },
});
