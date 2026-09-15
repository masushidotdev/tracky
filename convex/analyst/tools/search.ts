import { createTool } from '@convex-dev/agent';
import { gateway, generateText } from 'ai';
import { z } from 'zod';
import { SEARCH_MODEL } from '../models';
import type { Tool } from 'ai';

export const webSearch: Tool = createTool({
  description: 'Research current external information on the web and return an answer with sources.',
  inputSchema: z.object({ query: z.string().min(1), recency: z.string().optional() }),
  execute: async (ctx, input) => {
    if (!ctx.userId) throw new Error('Unauthorized');
    const result = await generateText({
      model: gateway(SEARCH_MODEL),
      prompt: `Research this question using current web information. ${input.recency ? `Recency: ${input.recency}.` : ''}\n\n${input.query}`,
    });
    return {
      answer: result.text,
      sources: result.sources.map((source) =>
        source.sourceType === 'url'
          ? { title: source.title, url: source.url }
          : { title: source.title, mediaType: source.mediaType },
      ),
    };
  },
});
