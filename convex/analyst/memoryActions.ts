'use node';

import { embed, gateway } from 'ai';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './models';
import { formatMemoryContext } from './memoryCore';
import { analystFunctionRefs } from './functionRefs';
import type { ActionCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

export async function embedMemoryText(value: string) {
  const result = await embed({
    model: gateway.embeddingModel(EMBEDDING_MODEL),
    value: value.slice(0, 1_000),
  });
  if (result.embedding.length !== EMBEDDING_DIMENSIONS) throw new Error('Unexpected embedding dimensions');
  return result.embedding;
}

export async function failureSoftMemoryContext(load: () => Promise<Parameters<typeof formatMemoryContext>[0]>) {
  try {
    return formatMemoryContext(await load());
  } catch {
    return undefined;
  }
}

export async function retrieveMemoryContext(ctx: ActionCtx, userId: string, query: string) {
  const normalizedQuery = query.trim().slice(0, 1_000);
  if (!normalizedQuery) return undefined;
  return await failureSoftMemoryContext(async () => {
    const embedding = await embedMemoryText(normalizedQuery);
    const matches = await ctx.vectorSearch('agentMemories', 'by_embedding', {
      vector: embedding,
      limit: 5,
      filter: (q) => q.eq('userId', userId),
    });
    const hydrated = await ctx.runQuery(analystFunctionRefs.hydrateMemoriesForUser, {
      userId,
      memoryIds: matches.map((match) => match._id),
    });
    const scores = new Map<Id<'agentMemories'>, number>(matches.map((match) => [match._id, match._score]));
    return hydrated.map((memory) => ({
      kind: memory.kind,
      content: memory.content,
      score: scores.get(memory.id) ?? 0,
    }));
  });
}
