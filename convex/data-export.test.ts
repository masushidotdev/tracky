/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { components } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob(['./_generated/*.js', './auth.ts', './authProfiles.ts', './dataExport.ts']);

const requestDataExport = makeFunctionReference<'mutation', Record<string, never>, Id<'dataExports'>>(
  'dataExport:requestDataExport',
);
const runDataExport = makeFunctionReference<'action', { exportId: Id<'dataExports'> }, null>(
  'dataExport:runDataExport',
);
const cleanupExpiredExports = makeFunctionReference<'action', Record<string, never>, number>(
  'dataExport:cleanupExpiredExports',
);
const listMyDataExports = makeFunctionReference<
  'query',
  Record<string, never>,
  Array<{
    _id: Id<'dataExports'>;
    status: 'queued' | 'running' | 'completed' | 'failed';
    downloadUrl: string | null;
  }>
>('dataExport:listMyDataExports');

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
        firstName: 'Export',
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

describe('data export', () => {
  test('queues a request and rejects a duplicate while it is active', async () => {
    const t = createTest();
    await seedAuthUser(t, 'export_requester');
    const asUser = t.withIdentity({ subject: 'export_requester' });

    const exportId = await asUser.mutation(requestDataExport, {});
    const queued = await t.run(async (ctx) => await ctx.db.get('dataExports', exportId));
    expect(queued).toMatchObject({ userId: 'export_requester', status: 'queued', format: 'json' });
    await expect(asUser.mutation(requestDataExport, {})).rejects.toThrow('already available or in progress');
  });

  test('rejects a new request when an export completed within the last 24 hours', async () => {
    const t = createTest();
    const userId = 'recent_export_user';
    await seedAuthUser(t, userId);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('dataExports', {
        userId,
        status: 'completed',
        format: 'json',
        requestedAtMs: now - 60_000,
        completedAtMs: now - 30_000,
        expiresAtMs: now + 7 * 24 * 60 * 60 * 1_000,
      });
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(requestDataExport, {}),
    ).rejects.toThrow('already available or in progress');
  });

  test('writes JSON containing transaction minor units as strings and excludes memory embeddings', async () => {
    const t = createTest();
    const userId = 'export_payload';
    await seedAuthUser(t, userId);
    const fixture = await t.run(async (ctx) => {
      const now = Date.UTC(2026, 6, 16);
      const connectionId = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock bank',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const accountId = await ctx.db.insert('financialAccounts', {
        userId,
        providerConnectionId: connectionId,
        provider: 'mock',
        name: 'Current account',
        currency: 'EUR',
        status: 'active',
        syncEnabled: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      await ctx.db.insert('transactions', {
        userId,
        accountId,
        providerConnectionId: connectionId,
        provider: 'mock',
        dedupeKey: 'export_transaction',
        status: 'BOOK',
        direction: 'DBIT',
        amount: { amountMinor: -1234n, currency: 'EUR' },
        bookingDate: '2026-07-15',
        description: 'Exported purchase',
        classificationKind: 'expense',
        classificationSource: 'user',
        importedAtMs: now,
        updatedAtMs: now,
      });
      const categoryId = await ctx.db.insert('categories', {
        userId,
        name: 'Groceries',
        kind: 'expense',
        applicableKinds: ['expense'],
        budgetEligible: true,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const planId = await ctx.db.insert('plans', {
        userId,
        name: 'Household',
        currency: 'EUR',
        startPeriod: '2026-07',
        accountIds: [accountId],
        isDefault: true,
        sortOrder: 1000,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const groupId = await ctx.db.insert('planGroups', {
        planId,
        userId,
        name: 'Everyday',
        sortOrder: 1000,
        collapsed: false,
        hidden: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const bucketId = await ctx.db.insert('planBuckets', {
        planId,
        userId,
        groupId,
        name: 'Groceries',
        sortOrder: 1000,
        hidden: false,
        isUnplanned: false,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const mappingId = await ctx.db.insert('planBucketCategories', {
        planId,
        userId,
        bucketId,
        categoryId,
        createdAtMs: now,
        updatedAtMs: now,
      });
      const assignmentId = await ctx.db.insert('planAssignments', {
        planId,
        userId,
        bucketId,
        period: '2026-07',
        assignedMinor: 10_000n,
        currency: 'EUR',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const targetId = await ctx.db.insert('planTargets', {
        planId,
        userId,
        bucketId,
        cadence: 'monthly',
        behaviour: 'setAside',
        amountMinor: 12_000n,
        currency: 'EUR',
        dayOfMonth: 31,
        repeats: true,
        snoozedPeriods: [],
      });
      await ctx.db.insert('planMonthSnapshots', {
        planId,
        userId,
        period: '2026-06',
        entries: [{ bucketId, assignedMinor: 8_000n, activityMinor: -7_000n, availableEndMinor: 1_000n }],
        computedAtMs: now,
      });
      await ctx.db.insert('agentMemories', {
        userId,
        kind: 'fact',
        content: 'Uses EUR',
        normalizedContent: 'uses eur',
        embedding: Array.from({ length: 1_536 }, () => 0.01),
        createdAtMs: now,
        updatedAtMs: now,
      });
      return { planId, groupId, bucketId, mappingId, assignmentId, targetId };
    });

    const exportId = await t.withIdentity({ subject: userId }).mutation(requestDataExport, {});
    await t.action(runDataExport, { exportId });
    const completed = await t.run(async (ctx) => await ctx.db.get('dataExports', exportId));
    expect(completed?.status).toBe('completed');
    expect(completed?.storageId).toBeDefined();

    const json = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(completed!.storageId!);
      return await blob!.text();
    });
    const payload = JSON.parse(json) as {
      version: number;
      tables: {
        transactions: Array<{ amount: { amountMinor: string; currency: string }; description: string }>;
        plans: Array<Record<string, unknown>>;
        planGroups: Array<Record<string, unknown>>;
        planBuckets: Array<Record<string, unknown>>;
        planBucketCategories: Array<Record<string, unknown>>;
        planAssignments: Array<Record<string, unknown>>;
        planTargets: Array<Record<string, unknown>>;
        agentMemories: Array<Record<string, unknown>>;
      };
    };
    expect(payload.version).toBe(3);
    expect(payload.tables.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Exported purchase',
          amount: { amountMinor: '-1234', currency: 'EUR' },
        }),
      ]),
    );
    expect(payload.tables).not.toHaveProperty('budgets');
    expect(payload.tables.plans).toEqual([
      expect.objectContaining({ _id: fixture.planId, name: 'Household', currency: 'EUR' }),
    ]);
    expect(payload.tables.planGroups).toEqual([
      expect.objectContaining({ _id: fixture.groupId, planId: fixture.planId, name: 'Everyday' }),
    ]);
    expect(payload.tables.planBuckets).toEqual([
      expect.objectContaining({ _id: fixture.bucketId, groupId: fixture.groupId, name: 'Groceries' }),
    ]);
    expect(payload.tables.planBucketCategories).toEqual([
      expect.objectContaining({ _id: fixture.mappingId, bucketId: fixture.bucketId }),
    ]);
    expect(payload.tables.planAssignments).toEqual([
      expect.objectContaining({
        _id: fixture.assignmentId,
        bucketId: fixture.bucketId,
        period: '2026-07',
        assignedMinor: '10000',
      }),
    ]);
    expect(payload.tables.planTargets).toEqual([
      expect.objectContaining({
        _id: fixture.targetId,
        bucketId: fixture.bucketId,
        amountMinor: '12000',
        cadence: 'monthly',
      }),
    ]);
    expect(payload.tables).not.toHaveProperty('planMonthSnapshots');
    expect(payload.tables.agentMemories).toEqual([{ kind: 'fact', content: 'Uses EUR' }]);
    expect(json).not.toContain('embedding');
  });

  test('marks the export failed when the run cannot be claimed', async () => {
    const t = createTest();
    const exportId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert('dataExports', {
        userId: 'failed_user',
        status: 'running',
        format: 'json',
        requestedAtMs: now,
        expiresAtMs: now + 7 * 24 * 60 * 60 * 1_000,
      });
    });

    await t.action(runDataExport, { exportId });
    const failed = await t.run(async (ctx) => await ctx.db.get('dataExports', exportId));
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'export_failed' });
  });

  test('cleanup removes expired storage and metadata', async () => {
    const t = createTest();
    const { exportId, storageId } = await t.run(async (ctx) => {
      const storedBlobId = await ctx.storage.store(new Blob(['expired'], { type: 'application/json' }));
      const rowId = await ctx.db.insert('dataExports', {
        userId: 'expired_user',
        status: 'completed',
        format: 'json',
        storageId: storedBlobId,
        requestedAtMs: Date.now() - 8 * 24 * 60 * 60 * 1_000,
        completedAtMs: Date.now() - 8 * 24 * 60 * 60 * 1_000,
        expiresAtMs: Date.now() - 1,
      });
      return { exportId: rowId, storageId: storedBlobId };
    });

    expect(await t.action(cleanupExpiredExports, {})).toBe(1);
    await t.run(async (ctx) => {
      expect(await ctx.db.get('dataExports', exportId)).toBeNull();
      expect(await ctx.storage.get(storageId)).toBeNull();
    });
  });

  test('lists download URLs only for completed non-expired exports and scopes them to the user', async () => {
    const t = createTest();
    await seedAuthUser(t, 'list_owner');
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const storageId = await ctx.storage.store(new Blob(['{}'], { type: 'application/json' }));
      const available = await ctx.db.insert('dataExports', {
        userId: 'list_owner',
        status: 'completed',
        format: 'json',
        storageId,
        requestedAtMs: now,
        completedAtMs: now,
        expiresAtMs: now + 60_000,
      });
      const expired = await ctx.db.insert('dataExports', {
        userId: 'list_owner',
        status: 'completed',
        format: 'json',
        storageId,
        requestedAtMs: now - 1,
        completedAtMs: now - 1,
        expiresAtMs: now - 1,
      });
      await ctx.db.insert('dataExports', {
        userId: 'someone_else',
        status: 'completed',
        format: 'json',
        storageId,
        requestedAtMs: now,
        completedAtMs: now,
        expiresAtMs: now + 60_000,
      });
      return { available, expired };
    });

    const rows = await t.withIdentity({ subject: 'list_owner' }).query(listMyDataExports, {});
    expect(rows.map((row) => row._id)).toEqual([ids.available, ids.expired]);
    expect(rows[0]?.downloadUrl).toEqual(expect.any(String));
    expect(rows[1]?.downloadUrl).toBeNull();
  });

  test('requires authentication for public export functions', async () => {
    const t = createTest();
    await expect(t.mutation(requestDataExport, {})).rejects.toThrow('Unauthorized');
    await expect(t.query(listMyDataExports, {})).rejects.toThrow('Unauthorized');
  });
});
