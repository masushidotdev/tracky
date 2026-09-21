// UC1 — jev smart import triage for residual uncategorized rows.
// Pipeline order is fixed: provider regex/MCC mapping, then user category rules,
// then (only for the uncategorized residue) a `use node` action fans out one jev
// call: choice kind + score dirtiness + noul auto_apply. Routing lives in code.
// Q4: source stays 'system' + classificationConfidence; no new literal.
// Q5: JEV_IMPORT caps bound cost per batch/day.
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import { decide, jevChoice, jevNoul, minimizeJevText } from '../lib/jev';
import { JEV_IMPORT } from '../lib/jevThresholds';
import { normalizeMerchantKey } from './subscriptionDetection';
import type { Id } from '../_generated/dataModel';

export const JEV_TRIAGE_NOTE_PREFIX = 'jev:triage:v1';

const triageQuestions = {
  kind: {
    type: 'choice' as const,
    instructions: 'What kind of movement is this for a personal finance tracker?',
    criteria: {
      transfer: 'Money moved between two accounts of the same person',
      expense: 'Spending paid to a third party',
      income: 'Incoming money (salary, refund, sale)',
      internal: 'Internal bank movement (fees, interest, adjustments)',
    },
  },
  dirtiness: {
    type: 'score' as const,
    instructions: 'How dirty or cryptic is the description for automatic rules?',
    criteria: ['Clean', 'Mostly readable', 'Dirty', 'Undecipherable'],
  },
  auto_apply: {
    type: 'noul' as const,
    instructions: 'Can this be classified automatically without human review?',
  },
};

export type TriageRouting = 'auto' | 'suggest' | 'queue';

export function routeTriage(args: {
  choice?: string;
  confidence?: number;
  autoApply?: number;
}): TriageRouting {
  if ((args.confidence ?? 0) >= JEV_IMPORT.autoApplyChoiceConfidence && (args.autoApply ?? 0) >= JEV_IMPORT.autoApplyNoul) {
    return 'auto';
  }
  if ((args.confidence ?? 0) >= JEV_IMPORT.suggestChoiceConfidence) return 'suggest';
  return 'queue';
}

// Bounded daily spend per user (Q2/Q5). Stored in userSettings, fails open to
// determinism (queue) when the budget is exhausted.
export const triageBudgetForUser = internalQuery({
  args: { userId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique();
    const usage = (settings as { jevTriageUsage?: { date?: string; count?: number } } | null)?.jevTriageUsage;
    return usage?.date === args.today ? (usage.count ?? 0) : 0;
  },
});

export const recordTriageSpend = internalMutation({
  args: { userId: v.string(), today: v.string(), count: v.number() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique();
    const now = Date.now();
    if (!settings) {
      await ctx.db.insert('userSettings', {
        userId: args.userId,
        jevTriageUsage: { date: args.today, count: args.count },
        createdAtMs: now,
        updatedAtMs: now,
      });
      return;
    }
    // jevTriageUsage is schema-optional: previous may be absent on old rows.
    const previousUsage: { date?: string; count?: number } | undefined = (
      settings as typeof settings & { jevTriageUsage?: { date?: string; count?: number } }
    ).jevTriageUsage;
    const previousCount = previousUsage?.date === args.today ? (previousUsage.count ?? 0) : 0;
    await ctx.db.patch('userSettings', settings._id, {
      jevTriageUsage: { date: args.today, count: previousCount + args.count },
      updatedAtMs: now,
    });
  },
});

export const triageRowForUser = internalQuery({
  args: { userId: v.string(), transactionId: v.id('transactions') },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get('transactions', args.transactionId);
    if (!transaction || transaction.userId !== args.userId) return null;
    if (transaction.classificationKind !== 'uncategorized') return null;
    const account = await ctx.db.get('financialAccounts', transaction.accountId);
    return {
      description: minimizeJevText(transaction.description),
      counterpartyName: transaction.counterpartyName ? minimizeJevText(transaction.counterpartyName, 120) : null,
      merchantKey: normalizeMerchantKey(transaction.counterpartyName ?? transaction.description),
      amountMinor: transaction.amount.amountMinor,
      currency: transaction.amount.currency,
      direction: transaction.direction,
      bookingDate: transaction.bookingDate,
      accountCurrency: account?.currency ?? null,
    };
  },
});

export const requestRowTriage = internalMutation({
  args: { userId: v.string(), transactionId: v.id('transactions'), today: v.string(), dailyBudget: v.number() },
  handler: async (ctx, args): Promise<{ routing: TriageRouting; queued: boolean }> => {
    const transaction = await ctx.db.get('transactions', args.transactionId);
    if (!transaction || transaction.userId !== args.userId) return { routing: 'queue', queued: false };
    if (transaction.classificationKind !== 'uncategorized') return { routing: 'queue', queued: false };
    const settings = await ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .unique();
    const usage = (settings as { jevTriageUsage?: { date?: string; count?: number } } | null)?.jevTriageUsage;
    const spent = usage?.date === args.today ? (usage.count ?? 0) : 0;
    if (spent >= args.dailyBudget) return { routing: 'queue', queued: false };
    await ctx.scheduler.runAfter(0, internal.banking.importTriage.triageRow, {
      userId: args.userId,
      transactionId: args.transactionId,
      today: args.today,
    });
    return { routing: 'queue', queued: true };
  },
});

export const triageRow = internalAction({
  args: { userId: v.string(), transactionId: v.id('transactions'), today: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.runQuery(internal.banking.importTriage.triageRowForUser, {
      userId: args.userId,
      transactionId: args.transactionId,
    });
    if (!row) return null;
    try {
      const decision = await decide(row, triageQuestions);
      const kind = jevChoice(decision.answers.kind);
      const auto = jevNoul(decision.answers.auto_apply);
      const routing =
        kind !== undefined && auto !== undefined
          ? routeTriage({ choice: kind.choice, confidence: kind.confidence, autoApply: auto })
          : 'queue';
      await ctx.runMutation(internal.banking.importTriage.applyTriageVerdict, {
        userId: args.userId,
        transactionId: args.transactionId,
        routing,
        kind: kind?.choice,
        confidence: kind?.confidence,
        note: `${JEV_TRIAGE_NOTE_PREFIX} model=${decision.model} cost=${decision.usage?.cost ?? '?'} latencyMs=${decision.latencyMs}`,
      });
      await ctx.runMutation(internal.banking.importTriage.recordTriageSpend, {
        userId: args.userId,
        today: args.today,
        count: 1,
      });
    } catch {
      // Fail closed: the row stays uncategorized for human review.
    }
    return null;
  },
});

export const applyTriageVerdict = internalMutation({
  args: {
    userId: v.string(),
    transactionId: v.id('transactions'),
    routing: v.union(v.literal('auto'), v.literal('suggest'), v.literal('queue')),
    kind: v.optional(v.string()),
    confidence: v.optional(v.number()),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get('transactions', args.transactionId);
    if (!transaction || transaction.userId !== args.userId) return null;
    if (transaction.classificationKind !== 'uncategorized') return null;
    if (transaction.classificationSource === 'user') return null;
    const now = Date.now();
    if (args.routing === 'queue' || !args.kind) return transaction._id;
    const kind = ['transfer', 'expense', 'income', 'internal'].includes(args.kind)
      ? (args.kind as 'transfer' | 'expense' | 'income' | 'internal')
      : null;
    if (!kind) return transaction._id;
    if (args.routing === 'suggest') {
      // Suggestion is advisory only: confidence recorded, kind untouched, so the
      // review queue — not an overwrite — owns the decision.
      await ctx.db.patch('transactions', transaction._id, {
        classificationConfidence: args.confidence ?? transaction.classificationConfidence,
        note: [transaction.note, `${args.note} suggest=${kind}`].filter(Boolean).join(' ').slice(0, 500),
        updatedAtMs: now,
      });
      return transaction._id;
    }
    await ctx.db.patch('transactions', transaction._id, {
      classificationKind: kind,
      classificationSource: 'system',
      classificationConfidence: args.confidence ?? 0.8,
      note: [transaction.note, args.note].filter(Boolean).join(' ').slice(0, 500),
      updatedAtMs: now,
    });
    return transaction._id;
  },
});

export type { Id };
