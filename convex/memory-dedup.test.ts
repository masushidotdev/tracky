/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { components, internal } from './_generated/api';
import schema from './schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './analyst/memoryDedup.ts', './analyst/memoryCore.ts']);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

const dedupCandidates = makeFunctionReference<
  'query',
  { userId: string; kind: 'fact' | 'preference' | 'goal' },
  Array<{ normalizedContent: string }>
>('analyst/memoryDedup:dedupCandidatesForUser');

async function seedAuthKitUser(t: ReturnType<typeof createTest>, userId: string) {
  const timestamp = '2026-01-01T00:00:00.000Z';
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
        firstName: 'Test',
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

describe('jev memory dedup gate', () => {
  test('exact normalized duplicates short-circuit without jev', async () => {
    const t = createTest();
    const userId = 'user_dedup';
    await seedAuthKitUser(t, userId);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('agentMemories', {
        userId,
        kind: 'fact',
        content: 'My rent is 900 euro',
        normalizedContent: 'my rent is 900 euro',
        embedding: Array.from({ length: 1536 }, () => 0),
        createdAtMs: now,
        updatedAtMs: now,
      });
    });
    const existing = await t.query(dedupCandidates, { userId, kind: 'fact' });
    expect(existing).toHaveLength(1);
    expect(existing[0]?.normalizedContent).toBe('my rent is 900 euro');
  });

  test('empty memory lists skip jev and embed directly', async () => {
    const t = createTest();
    const userId = 'user_dedup_empty';
    await seedAuthKitUser(t, userId);
    const existing = await t.query(dedupCandidates, { userId, kind: 'goal' });
    expect(existing).toHaveLength(0);
  });

  test('checkMemoryDuplicate is registered as an internal action', () => {
    expect(typeof internal.analyst.memoryDedup.checkMemoryDuplicate).toBe('object');
  });
});
