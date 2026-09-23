/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { components, internal } from '../_generated/api';
import schema from '../schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const discoveredModules = import.meta.glob([
  '../_generated/*.js',
  '../auth.ts',
  '../authProfiles.ts',
  './memoryStore.ts',
  './memoryCore.ts',
  './models.ts',
  '../lib/accountDeletionGuard.ts',
]);
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, loader]) => [
    path.startsWith('../') ? `./${path.slice(3)}` : `./analyst/${path.slice(2)}`,
    loader,
  ]),
);

const listMyMemories = makeFunctionReference<
  'query',
  { kind?: 'fact' | 'preference' | 'goal' },
  Array<{ _id: string; kind: 'fact' | 'preference' | 'goal'; content: string; createdAtMs: number }>
>('analyst/memoryStore:listMyMemories');
const deleteMyMemory = makeFunctionReference<'mutation', { memoryId: never }, null>(
  'analyst/memoryStore:deleteMyMemory',
);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

async function seedAuthUser(t: ReturnType<typeof createTest>, userId: string) {
  const timestamp = '2026-07-16T08:00:00.000Z';
  await t.mutation(components.workOSAuthKit.lib.onWebhookEvent, {
    apiKey: 'sk_test',
    event: {
      id: `evt_${userId}`,
      createdAt: timestamp,
      event: 'user.created',
      data: {
        object: 'user',
        id: userId,
        email: `${userId}@example.com`,
        firstName: 'Memory',
        lastName: 'User',
        emailVerified: true,
        profilePictureUrl: null,
        lastSignInAt: null,
        externalId: null,
        metadata: {},
        locale: 'en-US',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
  });
}

describe('user-scoped Analyst memory storage', () => {
  test('rejects an in-flight memory write after deletion starts', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('accountDeletions', {
        userId: 'user_erasing', userHash: 'pending-hash', status: 'wiping', currentStep: 'agentThreads',
        requestedAtMs: 1, updatedAtMs: 1, attemptCount: 0, workosDeleted: false,
      });
    });
    await expect(t.mutation(internal.analyst.memoryStore.upsertMemoryForUser, {
      userId: 'user_erasing', kind: 'fact', content: 'Private memory',
      embedding: Array.from({ length: 1_536 }, () => 0.01),
    })).rejects.toThrow('deletion_in_progress');
    expect(await t.run(async (ctx) => await ctx.db.query('agentMemories').take(10))).toHaveLength(0);
  });

  test('deduplicates normalized content and hydrates only for the owner', async () => {
    const t = convexTest(schema, modules);
    const embedding = Array.from({ length: 1_536 }, () => 0.01);
    const first = await t.mutation(internal.analyst.memoryStore.upsertMemoryForUser, {
      userId: 'user_a',
      kind: 'preference',
      content: 'Prefers monthly budgets',
      embedding,
    });
    const second = await t.mutation(internal.analyst.memoryStore.upsertMemoryForUser, {
      userId: 'user_a',
      kind: 'preference',
      content: '  PREFERS   monthly budgets ',
      embedding,
    });
    expect(second).toBe(first);
    expect(await t.query(internal.analyst.memoryStore.hydrateMemoriesForUser, { userId: 'user_b', memoryIds: [first] })).toEqual([]);
    expect(await t.query(internal.analyst.memoryStore.hydrateMemoriesForUser, { userId: 'user_a', memoryIds: [first] })).toMatchObject([
      { kind: 'preference', content: 'PREFERS   monthly budgets' },
    ]);
  });

  test('rejects wrong embedding dimensions', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.analyst.memoryStore.upsertMemoryForUser, {
        userId: 'user_a',
        kind: 'fact',
        content: 'A fact',
        embedding: [0.1],
      }),
    ).rejects.toThrow('Invalid memory embedding');
  });

  test('lists only the current user memories, supports kind filtering, and never returns embeddings', async () => {
    const t = createTest();
    await seedAuthUser(t, 'user_a');
    await seedAuthUser(t, 'user_b');
    const embedding = Array.from({ length: 1_536 }, () => 0.01);
    await t.mutation(internal.analyst.memoryStore.upsertMemoryForUser, {
      userId: 'user_a',
      kind: 'fact',
      content: 'Uses EUR',
      embedding,
    });
    await t.mutation(internal.analyst.memoryStore.upsertMemoryForUser, {
      userId: 'user_a',
      kind: 'goal',
      content: 'Save for a home',
      embedding,
    });
    await t.mutation(internal.analyst.memoryStore.upsertMemoryForUser, {
      userId: 'user_b',
      kind: 'fact',
      content: 'Private to B',
      embedding,
    });

    const asUserA = t.withIdentity({ subject: 'user_a' });
    const all = await asUserA.query(listMyMemories, {});
    const facts = await asUserA.query(listMyMemories, { kind: 'fact' });

    expect(all.map((memory) => memory.content).sort()).toEqual(['Save for a home', 'Uses EUR']);
    expect(facts).toMatchObject([{ kind: 'fact', content: 'Uses EUR' }]);
    expect(all.every((memory) => !('embedding' in memory))).toBe(true);
  });

  test('deletes owned memories and rejects deletion by another user', async () => {
    const t = createTest();
    await seedAuthUser(t, 'memory_owner');
    await seedAuthUser(t, 'memory_other');
    const memoryId = await t.mutation(internal.analyst.memoryStore.upsertMemoryForUser, {
      userId: 'memory_owner',
      kind: 'preference',
      content: 'Prefers weekly summaries',
      embedding: Array.from({ length: 1_536 }, () => 0.01),
    });

    await expect(
      t.withIdentity({ subject: 'memory_other' }).mutation(deleteMyMemory, { memoryId: memoryId as never }),
    ).rejects.toThrow('Memory not found');
    await t.withIdentity({ subject: 'memory_owner' }).mutation(deleteMyMemory, { memoryId: memoryId as never });
    expect(await t.withIdentity({ subject: 'memory_owner' }).query(listMyMemories, {})).toEqual([]);
  });
});
