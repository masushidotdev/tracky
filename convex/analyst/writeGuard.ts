// UC5 — jev write-guard advisor, badge-only (Q3 ratified).
// Every interactive write stays approval-gated; jev only attaches advisory
// metadata (risk × reversibility × auto-approve) that the approval UI renders
// as a badge. It never bypasses needsApproval and never executes anything.
// Blast radius is computed in code (record count, amount, irreversibility),
// never delegated to the model.
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalAction, internalMutation, internalQuery, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { decide, jevChoice, jevNoul } from '../lib/jev';
import { routeWriteGuardBadge } from './writeGuardBadge';
import type { WriteGuardBadge } from './writeGuardBadge';

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

export type { WriteGuardBadge };

export const writeContextForUser = internalQuery({
  args: {
    userId: v.string(),
    toolName: v.string(),
    recordCount: v.number(),
    amountMinor: v.optional(v.number()),
  },
  handler: () => null,
});

// Advisory badge cache: computed once per approval request by cacheWriteBadge
// (called from streamReply after new approval-requested parts appear), read by
// the approval UI. Missing rows render no badge; approval is always required.
export const getBadgeForApproval = query({
  args: { threadId: v.string(), approvalId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const row = await ctx.db
      .query('writeGuardBadges')
      .withIndex('by_threadId_and_approvalId', (q) =>
        q.eq('threadId', args.threadId).eq('approvalId', args.approvalId),
      )
      .unique();
    if (!row || row.userId !== user.id) return null;
    return { badge: row.badge, toolName: row.toolName, recordCount: row.recordCount };
  },
});

// Record counts per write tool for the blast-radius rule: multi-record writes
// are never "safe". Inputs are advisory (the agent proposes them), so counts
// are clamped to the tool's schema maxima.
function recordCountForApproval(toolName: string, input: unknown): number {
  if (toolName === 'bulkRecategorize' && typeof input === 'object' && input !== null && 'changes' in input) {
    const changes = (input as { changes?: unknown }).changes;
    return Array.isArray(changes) ? Math.min(changes.length, 50) : 1;
  }
  return 1;
}

const WRITE_TOOL_NAMES = new Set([
  'setPlanAssigned',
  'setPlanTarget',
  'createMoneyBox',
  'createPlannedExpense',
  'rememberFact',
  'bulkRecategorize',
]);

type ApprovalRequestPart = {
  type?: unknown;
  approvalId?: unknown;
  toolCallId?: unknown;
  tool?: unknown;
  input?: unknown;
};

// Scans recent thread messages for approval requests without a cached badge
// and stores a pending row per request; adviseWriteBadges (action, called from
// streamReply) fills each pending row via jev, fail-closed to confirm.
// Split because mutations cannot fetch and cannot runAction.
export const scanApprovalsForThread = internalMutation({
  args: { userId: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    const { makeAnalystAgent } = await import('./agent');
    const agent = makeAnalystAgent('anthropic/claude-fable-5', 'en');
    const recent = await agent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    const pending: Array<{ approvalId: string; toolName: string; input: unknown }> = [];
    for (const stored of recent.page) {
      const content = (stored.message as { content?: unknown } | undefined)?.content;
      if (!Array.isArray(content)) continue;
      for (const rawPart of content) {
        const part = rawPart as ApprovalRequestPart;
        if (part.type !== 'tool-approval-request' || typeof part.approvalId !== 'string') continue;
        const toolName =
          typeof part.tool === 'string'
            ? part.tool
            : typeof (part as { toolName?: unknown }).toolName === 'string'
              ? (part as { toolName?: string }).toolName
              : undefined;
        if (!toolName || !WRITE_TOOL_NAMES.has(toolName)) continue;
        const existing = await ctx.db
          .query('writeGuardBadges')
          .withIndex('by_threadId_and_approvalId', (q) =>
            q.eq('threadId', args.threadId).eq('approvalId', part.approvalId as string),
          )
          .unique();
        if (existing) continue;
        const recordCount = recordCountForApproval(toolName, part.input);
        await ctx.db.insert('writeGuardBadges', {
          userId: args.userId,
          threadId: args.threadId,
          approvalId: part.approvalId,
          toolName,
          badge: 'confirm',
          recordCount,
          createdAtMs: Date.now(),
        });
        pending.push({ approvalId: part.approvalId, toolName, input: part.input });
      }
    }
    if (pending.length > 0) {
      await ctx.scheduler.runAfter(0, internal.analyst.writeGuard.adviseWriteBadges, {
        userId: args.userId,
        threadId: args.threadId,
        approvals: pending.slice(0, 10).map(({ approvalId, toolName, input }) => ({
          approvalId,
          toolName,
          summary: JSON.stringify(input ?? {}).slice(0, 500),
        })),
      });
    }
    return { pending: pending.length };
  },
});

export const adviseWriteBadges = internalAction({
  args: {
    userId: v.string(),
    threadId: v.string(),
    approvals: v.array(v.object({ approvalId: v.string(), toolName: v.string(), summary: v.string() })),
  },
  handler: async (ctx, args): Promise<null> => {
    for (const approval of args.approvals) {
      const row = await ctx.runQuery(internal.analyst.writeGuard.badgeRowForApproval, {
        userId: args.userId,
        threadId: args.threadId,
        approvalId: approval.approvalId,
      });
      if (!row) continue;
      try {
        const verdict = await decide(
          { tool: approval.toolName, summary: approval.summary.slice(0, 500), recordCount: row.recordCount },
          writeGuardQuestions,
        );
        const risk = jevChoice(verdict.answers.risk);
        const auto = jevNoul(verdict.answers.auto_approve);
        await ctx.runMutation(internal.analyst.writeGuard.setBadgeForApproval, {
          userId: args.userId,
          threadId: args.threadId,
          approvalId: approval.approvalId,
          badge: routeWriteGuardBadge({ risk: risk?.choice, autoApprove: auto, recordCount: row.recordCount }),
        });
      } catch {
        // Pending rows already hold the fail-closed 'confirm' badge.
      }
    }
    return null;
  },
});

export const badgeRowForApproval = internalQuery({
  args: { userId: v.string(), threadId: v.string(), approvalId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('writeGuardBadges')
      .withIndex('by_threadId_and_approvalId', (q) =>
        q.eq('threadId', args.threadId).eq('approvalId', args.approvalId),
      )
      .unique();
    if (!row || row.userId !== args.userId) return null;
    return { recordCount: row.recordCount };
  },
});

export const setBadgeForApproval = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    approvalId: v.string(),
    badge: v.union(v.literal('safe'), v.literal('confirm'), v.literal('block')),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('writeGuardBadges')
      .withIndex('by_threadId_and_approvalId', (q) =>
        q.eq('threadId', args.threadId).eq('approvalId', args.approvalId),
      )
      .unique();
    if (!row || row.userId !== args.userId) return null;
    await ctx.db.patch('writeGuardBadges', row._id, { badge: args.badge });
    return row._id;
  },
});

export const cacheWriteBadge = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    approvalId: v.string(),
    toolName: v.string(),
    badge: v.union(v.literal('safe'), v.literal('confirm'), v.literal('block')),
    recordCount: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('writeGuardBadges')
      .withIndex('by_threadId_and_approvalId', (q) =>
        q.eq('threadId', args.threadId).eq('approvalId', args.approvalId),
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert('writeGuardBadges', { ...args, createdAtMs: Date.now() });
  },
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
