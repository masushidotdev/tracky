'use node';

import { getThreadMetadata, updateThreadMetadata } from '@convex-dev/agent';
import { gateway, generateText } from 'ai';
import { v } from 'convex/values';
import { components } from '../_generated/api';
import { internalAction } from '../_generated/server';
import { UTILITY_MODEL } from './models';

export const generateTitle = internalAction({
  args: { threadId: v.string(), userId: v.string(), firstMessage: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const thread = await getThreadMetadata(ctx, components.agent, { threadId: args.threadId });
    if (thread.userId !== args.userId) return null;
    const result = await generateText({
      model: gateway(UTILITY_MODEL),
      prompt: `Write a concise title of at most 60 characters for this personal-finance conversation. Return only the title.\n\n${args.firstMessage}`,
    });
    const title =
      result.text
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .slice(0, 60) || 'New analyst chat';
    await updateThreadMetadata(ctx, components.agent, { threadId: args.threadId, patch: { title } });
    return null;
  },
});
