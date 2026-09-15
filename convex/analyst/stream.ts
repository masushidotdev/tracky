'use node';

import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { makeAnalystAgent } from './agent';
import { modelIdValidator } from './models';
import { createAnalystTelemetry } from './telemetry';
import { analystFunctionRefs } from './functionRefs';
import { retrieveMemoryContext } from './memoryActions';
import { approvalContinuationContext } from './approvalBatch';

export const streamReply = internalAction({
  args: {
    threadId: v.string(),
    userId: v.string(),
    promptMessageId: v.string(),
    modelId: modelIdValidator,
    locale: v.string(),
    turnLockId: v.id('analystTurnLocks'),
    memoryQuery: v.optional(v.string()),
    approvalContinuation: v.optional(
      v.object({
        requestCount: v.number(),
        approvedCount: v.number(),
        deniedCount: v.number(),
        pendingCount: v.number(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<null> => {
    const { telemetry, flush } = createAnalystTelemetry(args);
    const memoryContext = args.memoryQuery
      ? await retrieveMemoryContext(ctx, args.userId, args.memoryQuery)
      : undefined;
    const agent = makeAnalystAgent(
      args.modelId,
      args.locale,
      undefined,
      memoryContext,
      args.approvalContinuation ? approvalContinuationContext(args.approvalContinuation) : undefined,
    );
    try {
      const result = await agent.streamText(
        ctx,
        { threadId: args.threadId, userId: args.userId },
        { promptMessageId: args.promptMessageId, experimental_telemetry: telemetry },
        { saveStreamDeltas: true, contextOptions: { recentMessages: 30 } },
      );
      await result.consumeStream();
      return null;
    } finally {
      try {
        await flush();
      } finally {
        await ctx.runMutation(analystFunctionRefs.releaseAnalystTurn, {
          turnLockId: args.turnLockId,
          userId: args.userId,
          threadId: args.threadId,
        });
      }
    }
  },
});
