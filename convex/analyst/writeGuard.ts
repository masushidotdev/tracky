// UC5 — deterministic write-guard badges, badge-only (Q3 ratified).
// Every interactive write stays approval-gated; the approval UI renders an
// advisory badge (safe/confirm/block) computed in code from an allowlist of
// toolName + recordCount. No approval input is serialized or sent to any
// external endpoint (Q6/CWE-359): names, memos, and amounts never leave Convex.
// It never bypasses needsApproval and never executes anything.
import { v } from 'convex/values';
import { internalMutation, internalQuery, query } from '../_generated/server';
import { requireAuthUser } from '../auth';
import { isAccountDeletionStarted } from '../lib/accountDeletionGuard';
import { recordCountForApproval, riskForTool, routeWriteGuardBadge } from './writeGuardBadge';
import type { WriteGuardBadge } from './writeGuardBadge';

export type { WriteGuardBadge };

// Advisory badge cache: one row per approval request, inserted by
// scanApprovalsForThread (called from streamReply after new
// approval-requested parts appear), read by the approval UI. Missing rows
// render no badge; approval is always required.
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
// and inserts one deterministically-routed row per request. No external calls,
// no scheduler: the badge is final at insert time.
export const scanApprovalsForThread = internalMutation({
  args: { userId: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    if (await isAccountDeletionStarted(ctx, args.userId)) return { pending: 0 };
    const { makeAnalystAgent } = await import('./agent');
    const agent = makeAnalystAgent('anthropic/claude-fable-5', 'en');
    const recent = await agent.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: { cursor: null, numItems: 20 },
    });
    // Deterministic allowlist routing (Q6/CWE-359): the badge derives from
    // toolName + recordCount only. No approval input is serialized or sent to
    // any external endpoint — user names, memos, and amounts never leave Convex.
    let cached = 0;
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
        const approvalId = part.approvalId;
        const existing = await ctx.db
          .query('writeGuardBadges')
          .withIndex('by_threadId_and_approvalId', (q) =>
            q.eq('threadId', args.threadId).eq('approvalId', approvalId),
          )
          .unique();
        if (existing) continue;
        const recordCount = recordCountForApproval(toolName, part.input);
        await ctx.db.insert('writeGuardBadges', {
          userId: args.userId,
          threadId: args.threadId,
          approvalId,
          toolName,
          badge: routeWriteGuardBadge({ risk: riskForTool(toolName), recordCount }),
          recordCount,
          createdAtMs: Date.now(),
        });
        cached += 1;
      }
    }
    return { pending: cached };
  },
});
