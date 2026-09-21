import { createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { internal } from '../../_generated/api';
import { analystFunctionRefs } from '../functionRefs';
import { embedMemoryText } from '../memoryActions';
import type { Tool } from 'ai';

export const rememberFactInputSchema = z.object({
  kind: z.enum(['fact', 'preference', 'goal']),
  content: z.string().trim().min(1).max(500),
});

export const rememberFact: Tool = createTool({
  description: 'Remember a durable user fact, preference, or goal for future Analyst turns. Requires approval.',
  inputSchema: rememberFactInputSchema,
  needsApproval: true,
  execute: async (ctx, input) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    // E3: jev dedup gate before the paid embedding. ToolCtx is action-backed,
    // so the internal action runs inline; failures fall open to embedding.
    try {
      const verdict: { duplicate: boolean; kind: string; confidence: number } | null = await ctx.runAction(
        internal.analyst.memoryDedup.checkMemoryDuplicate,
        { userId: ctx.userId, kind: input.kind, content: input.content },
      );
      if (verdict?.duplicate) {
        return { ok: true, kind: verdict.kind, remembered: false, duplicate: true };
      }
    } catch {
      // Fall open: embed and let normalizedContent dedup win.
    }
    const embedding = await embedMemoryText(input.content);
    await ctx.runMutation(analystFunctionRefs.upsertMemoryForUser, {
      userId: ctx.userId,
      kind: input.kind,
      content: input.content,
      sourceThreadId: ctx.threadId,
      embedding,
    });
    return { ok: true, kind: input.kind, remembered: true };
  },
});
