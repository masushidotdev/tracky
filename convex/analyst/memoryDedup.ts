// E3 — jev memory dedup gate. Before paying for an embedding + vector write,
// one cheap jev call checks the candidate against the user's existing memories:
// noul duplicate + choice kind. Duplicates return the existing memory id without
// touching the embedding model; genuinely new content flows to upsertMemoryForUser.
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import { decide, jevChoice, jevNoul, minimizeJevText } from '../lib/jev';
import { JEV_MEMORY } from '../lib/jevThresholds';
import { normalizeMemoryContent } from './memoryCore';

const memoryKindValidator = v.union(v.literal('fact'), v.literal('preference'), v.literal('goal'));

const dedupQuestions = {
  duplicate: {
    type: 'noul' as const,
    instructions: 'Does the candidate say the same thing as one of the existing memories (same fact, preference, or goal)?',
  },
  kind: {
    type: 'choice' as const,
    instructions: 'What kind of durable memory is the candidate?',
    criteria: {
      fact: 'A stable fact about the user or their finances',
      preference: 'How the user likes things done or presented',
      goal: 'Something the user wants to achieve',
    },
  },
};

export const dedupCandidatesForUser = internalQuery({
  args: { userId: v.string(), kind: memoryKindValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('agentMemories')
      .withIndex('by_userId_and_kind', (q) => q.eq('userId', args.userId).eq('kind', args.kind))
      .order('desc')
      .take(20);
  },
});

export const checkMemoryDuplicate = internalAction({
  args: { userId: v.string(), kind: memoryKindValidator, content: v.string() },
  handler: async (ctx, args): Promise<{ duplicate: boolean; kind: string; confidence: number } | null> => {
    const normalized = normalizeMemoryContent(args.content);
    const existing = await ctx.runQuery(internal.analyst.memoryDedup.dedupCandidatesForUser, {
      userId: args.userId,
      kind: args.kind,
    });
    if (existing.some((memory) => memory.normalizedContent === normalized)) {
      return { duplicate: true, kind: args.kind, confidence: 1 };
    }
    if (existing.length === 0) return { duplicate: false, kind: args.kind, confidence: 1 };
    try {
      const decision = await decide(
        {
          candidate: minimizeJevText(args.content),
          existing: existing.slice(0, 10).map((memory) => minimizeJevText(memory.content, 200)),
        },
        dedupQuestions,
      );
      const noul = jevNoul(decision.answers.duplicate);
      const kind = jevChoice(decision.answers.kind);
      return {
        duplicate: noul !== undefined ? noul >= JEV_MEMORY.duplicateNoul : false,
        kind: kind?.choice ?? args.kind,
        confidence: noul ?? 0,
      };
    } catch {
      // Fail open to the deterministic path: embed and let normalizedContent win.
      return { duplicate: false, kind: args.kind, confidence: 0 };
    }
  },
});

export const rememberFactDedupNote = internalMutation({
  args: { userId: v.string(), content: v.string() },
  handler: () => null,
});
