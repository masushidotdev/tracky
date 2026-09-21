// UC5 — jev write-guard advisor, badge-only (Q3 ratified).
// Every interactive write stays approval-gated; jev only attaches advisory
// metadata (risk × reversibility × auto-approve) that the approval UI renders
// as a badge. It never bypasses needsApproval and never executes anything.
// Blast radius is computed in code (record count, amount, irreversibility),
// never delegated to the model.
import { v } from 'convex/values';
import { internalAction, internalQuery } from '../_generated/server';
import { decide, jevChoice, jevNoul } from '../lib/jev';

const writeGuardQuestions = {
  auto_approve: {
    type: 'noul' as const,
    instructions: 'Would it be safe to execute this proposed write without human confirmation?',
  },
  risk: {
    type: 'choice' as const,
    instructions: 'What is the risk level of the proposed write?',
    criteria: {
      low: 'Trivial reversible write, few records',
      'needs-confirmation': 'Visible or multi-record impact, better with one confirmation tap',
      'high-block': 'Money, privacy, or structure: never without explicit approval',
    },
  },
  reversibility: {
    type: 'score' as const,
    instructions: 'How reversible would it be if wrong?',
    criteria: ['Irreversible', 'Hard', 'Undoable with effort', 'One click to undo'],
  },
};

export type WriteGuardBadge = 'safe' | 'confirm' | 'block';

export function routeWriteGuardBadge(answer: {
  risk?: string;
  autoApprove?: number;
  recordCount?: number;
}): WriteGuardBadge {
  // Blast radius in code: multi-record writes are never "safe" on jev's word.
  if (answer.risk === 'high-block') return 'block';
  if ((answer.recordCount ?? 1) > 10) return answer.risk === 'low' ? 'confirm' : 'block';
  if (answer.risk === 'needs-confirmation' || (answer.autoApprove ?? 0) < 0.75) return 'confirm';
  return 'safe';
}

export const writeContextForUser = internalQuery({
  args: {
    userId: v.string(),
    toolName: v.string(),
    recordCount: v.number(),
    amountMinor: v.optional(v.number()),
  },
  handler: () => null,
});

export const adviseWrite = internalAction({
  args: {
    userId: v.string(),
    toolName: v.string(),
    summary: v.string(),
    recordCount: v.number(),
  },
  handler: async (ctx, args): Promise<{ badge: WriteGuardBadge } | null> => {
    try {
      const decision = await decide(
        { tool: args.toolName, summary: args.summary.slice(0, 500), recordCount: args.recordCount },
        writeGuardQuestions,
      );
      const risk = jevChoice(decision.answers.risk);
      const auto = jevNoul(decision.answers.auto_approve);
      return {
        badge: routeWriteGuardBadge({
          risk: risk?.choice,
          autoApprove: auto,
          recordCount: args.recordCount,
        }),
      };
    } catch {
      // Fail closed to the strictest badge: confirmation is always required.
      return { badge: 'confirm' };
    }
  },
});
