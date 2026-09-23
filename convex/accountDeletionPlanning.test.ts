/// <reference types="vite/client" />

import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import agentTest from '@convex-dev/agent/test';
import { expect, test } from 'vitest';
import { components } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob(['./_generated/*.js', './accountDeletionPlanning.ts']);
const wipePlanningBatch = makeFunctionReference<
  'mutation',
  { userId: string; stage: 'planning' | 'forecast' | 'misc' },
  { done: boolean }
>('accountDeletionPlanning:wipePlanningBatch');
const wipeAgentThread = makeFunctionReference<
  'action',
  { deletionId: Id<'accountDeletions'>; userId: string },
  { done: boolean }
>('accountDeletionPlanning:wipeAgentThread');

test('planning wipe is bounded, resumable, and scoped to one user', async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let index = 0; index < 105; index++) {
      await ctx.db.insert('planningPreferences', {
        userId: 'delete-me',
        cycleInterval: 'month',
        cycleIntervalCount: 1,
        anchorDate: '2026-01-01',
        createdAtMs: index,
        updatedAtMs: index,
      });
    }
    await ctx.db.insert('planningPreferences', {
      userId: 'keep-me',
      cycleInterval: 'month',
      cycleIntervalCount: 1,
      anchorDate: '2026-01-01',
      createdAtMs: 0,
      updatedAtMs: 0,
    });
  });

  expect(await t.mutation(wipePlanningBatch, { userId: 'delete-me', stage: 'planning' })).toEqual({ done: false });
  let counts = await t.run(async (ctx) => ({
    deleting: await ctx.db.query('planningPreferences').withIndex('by_userId', (q) => q.eq('userId', 'delete-me')).collect(),
    other: await ctx.db.query('planningPreferences').withIndex('by_userId', (q) => q.eq('userId', 'keep-me')).collect(),
  }));
  expect(counts.deleting).toHaveLength(5);
  expect(counts.other).toHaveLength(1);

  expect(await t.mutation(wipePlanningBatch, { userId: 'delete-me', stage: 'planning' })).toEqual({ done: false });
  expect(await t.mutation(wipePlanningBatch, { userId: 'delete-me', stage: 'planning' })).toEqual({ done: true });
  counts = await t.run(async (ctx) => ({
    deleting: await ctx.db.query('planningPreferences').withIndex('by_userId', (q) => q.eq('userId', 'delete-me')).collect(),
    other: await ctx.db.query('planningPreferences').withIndex('by_userId', (q) => q.eq('userId', 'keep-me')).collect(),
  }));
  expect(counts.deleting).toHaveLength(0);
  expect(counts.other).toHaveLength(1);
});

test('agent thread wipe resumes a remembered thread after its metadata is gone', async () => {
  const t = convexTest(schema, modules);
  agentTest.register(t);
  const first = await t.mutation(components.agent.threads.createThread, { userId: 'delete-me' });
  const second = await t.mutation(components.agent.threads.createThread, { userId: 'delete-me' });
  const deletionId = await t.run(async (ctx) => await ctx.db.insert('accountDeletions', {
    userId: 'delete-me',
    userHash: 'test-hash',
    status: 'wiping',
    currentStep: 'agentThreads',
    requestedAtMs: 1,
    updatedAtMs: 1,
    attemptCount: 0,
    workosDeleted: false,
    currentAgentThreadId: first._id,
  }));

  // Simulates a prior attempt that removed the thread but failed before
  // clearing the durable checkpoint. Repeating the component delete is safe.
  await t.action(components.agent.threads.deleteAllForThreadIdSync, { threadId: first._id });
  expect(await t.action(wipeAgentThread, { deletionId, userId: 'delete-me' })).toEqual({ done: false });
  let deletion = await t.run(async (ctx) => await ctx.db.get('accountDeletions', deletionId));
  expect(deletion?.currentAgentThreadId).toBeUndefined();

  expect(await t.action(wipeAgentThread, { deletionId, userId: 'delete-me' })).toEqual({ done: false });
  expect(await t.query(components.agent.threads.getThread, { threadId: second._id })).toBeNull();
  expect(await t.action(wipeAgentThread, { deletionId, userId: 'delete-me' })).toEqual({ done: true });
  deletion = await t.run(async (ctx) => await ctx.db.get('accountDeletions', deletionId));
  expect(deletion?.currentAgentThreadId).toBeUndefined();
});
