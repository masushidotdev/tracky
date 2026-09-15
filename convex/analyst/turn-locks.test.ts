/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import schema from '../schema';
import { claimAnalystTurn } from './turnLocks';

const modules = import.meta.glob(['../_generated/*.js', './turnLocks.ts']);

function createTest() {
  return convexTest(schema, modules);
}

describe('analyst turn locks', () => {
  test('allows only one active generation per thread and releases by identity', async () => {
    const t = createTest();
    const firstLockId = await t.run(async (ctx) => await claimAnalystTurn(ctx, 'user_a', 'thread_a'));

    await expect(t.run(async (ctx) => await claimAnalystTurn(ctx, 'user_a', 'thread_a'))).rejects.toThrow(
      'Analyst response already in progress',
    );

    await t.run(async (ctx) => {
      const lock = await ctx.db.get('analystTurnLocks', firstLockId);
      expect(lock?.threadId).toBe('thread_a');
      await ctx.db.delete('analystTurnLocks', firstLockId);
    });

    await expect(t.run(async (ctx) => await claimAnalystTurn(ctx, 'user_a', 'thread_a'))).resolves.toBeDefined();
  });
});
