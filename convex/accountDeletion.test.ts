/// <reference types="vite/client" />

import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import agentTest from '@convex-dev/agent/test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { afterEach, expect, test, vi } from 'vitest';
import { components } from './_generated/api';
import schema from './schema';
import type { Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js', './auth.ts', './authProfiles.ts', './userSettings.ts',
  './accountDeletion.ts', './accountDeletionActions.ts', './accountDeletionBanking.ts',
  './accountDeletionPlanning.ts', './banking/enableBanking.ts', './dataExport.ts',
]);
const deleteMyAccount = makeFunctionReference<'mutation', { deletionExportId?: Id<'dataExports'> }, null>('accountDeletion:deleteMyAccount');
const getDeletionStatus = makeFunctionReference<'query', Record<string, never>,
  { status: 'wiping' | 'failed' | 'done'; currentStep: string } | null>('accountDeletion:getDeletionStatus');
const requestDataExport = makeFunctionReference<'mutation', Record<string, never>, string>('dataExport:requestDataExport');
const requestDeletionDataExport = makeFunctionReference<'mutation', Record<string, never>, Id<'dataExports'>>('dataExport:requestDeletionDataExport');
const acknowledgeDeletionExportDownload = makeFunctionReference<'mutation', { exportId: Id<'dataExports'> }, null>('dataExport:acknowledgeDeletionExportDownload');
const captureDetachedConsent = makeFunctionReference<'mutation', { userId: string; sessionId: string }, null>('accountDeletion:captureDetachedConsent');
const markDetachedConsentRevoked = makeFunctionReference<'mutation', { sessionId: string }, null>('accountDeletion:markDetachedConsentRevoked');
const recordDetachedConsentAttempt = makeFunctionReference<'mutation', { revocationId: Id<'detachedConsentRevocations'>; ok: boolean; code?: string }, null>('accountDeletion:recordDetachedConsentAttempt');

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  agentTest.register(t);
  return t;
}

async function seedUser(t: ReturnType<typeof createTest>, userId: string) {
  const timestamp = '2026-09-23T08:00:00.000Z';
  await t.mutation(components.workOSAuthKit.lib.onWebhookEvent, {
    apiKey: 'sk_test',
    event: {
      id: `evt_${userId}`, createdAt: timestamp, event: 'user.created',
      data: { object: 'user', id: userId, email: `${userId}@example.com`,
        firstName: 'Test', lastName: 'User', emailVerified: true,
        profilePictureUrl: null, lastSignInAt: null, externalId: null,
        metadata: {}, locale: 'en-US', createdAt: timestamp, updatedAt: timestamp },
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('double submit is rejected before the scheduled wipe starts', async () => {
  const t = createTest();
  await seedUser(t, 'user_delete_double');
  const asUser = t.withIdentity({ subject: 'user_delete_double' });
  expect(await asUser.mutation(deleteMyAccount, {})).toBeNull();
  await expect(asUser.mutation(deleteMyAccount, {})).rejects.toThrow('deletion_in_progress');
  expect(await asUser.query(getDeletionStatus, {})).toMatchObject({ status: 'wiping', currentStep: 'disconnect' });
  await expect(t.mutation(deleteMyAccount, {})).rejects.toThrow('Unauthorized');
  await expect(t.query(getDeletionStatus, {})).rejects.toThrow('Unauthorized');
  await expect(t.mutation(requestDeletionDataExport, {})).rejects.toThrow('Unauthorized');
});

test('deletion dialog can reuse an export despite the daily export limit', async () => {
  const t = createTest();
  await seedUser(t, 'user_export');
  const exportId = await t.run(async (ctx) => await ctx.db.insert('dataExports', {
    userId: 'user_export', status: 'completed', format: 'json',
    storageId: await ctx.storage.store(new Blob(['copy'], { type: 'application/json' })),
    requestedAtMs: Date.now(), completedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000,
  }));
  const asUser = t.withIdentity({ subject: 'user_export' });
  await expect(asUser.mutation(requestDataExport, {})).rejects.toThrow('already available');
  expect(await asUser.mutation(requestDeletionDataExport, {})).toBe(exportId);
});

test('an ordinary export does not block direct deletion', async () => {
  const t = createTest();
  await seedUser(t, 'user_direct_deletion');
  await t.run(async (ctx) => {
    await ctx.db.insert('dataExports', {
      userId: 'user_direct_deletion', status: 'completed', format: 'json',
      storageId: await ctx.storage.store(new Blob(['copy'], { type: 'application/json' })),
      requestedAtMs: Date.now(), completedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000,
    });
  });
  expect(await t.withIdentity({ subject: 'user_direct_deletion' }).mutation(deleteMyAccount, {})).toBeNull();
});

test('selected export requires a completed, acknowledged file before erasure', async () => {
  const t = createTest();
  await seedUser(t, 'user_selected_export');
  await seedUser(t, 'user_other_export');
  const selected = t.withIdentity({ subject: 'user_selected_export' });
  const other = t.withIdentity({ subject: 'user_other_export' });
  const exportId = await selected.mutation(requestDeletionDataExport, {});
  await expect(selected.mutation(deleteMyAccount, {})).rejects.toThrow('deletion_export_not_acknowledged');
  await expect(selected.mutation(acknowledgeDeletionExportDownload, { exportId }))
    .rejects.toThrow('deletion_export_not_ready');
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(['copy'], { type: 'application/json' }));
    await ctx.db.patch('dataExports', exportId, {
      status: 'completed', storageId, completedAtMs: Date.now(),
    });
  });
  await expect(other.mutation(acknowledgeDeletionExportDownload, { exportId }))
    .rejects.toThrow('deletion_export_not_ready');
  await expect(selected.mutation(deleteMyAccount, {})).rejects.toThrow('deletion_export_not_acknowledged');
  expect(await selected.mutation(acknowledgeDeletionExportDownload, { exportId })).toBeNull();
  expect(await selected.mutation(deleteMyAccount, { deletionExportId: exportId })).toBeNull();
});

test('a failed selected export does not prevent direct deletion', async () => {
  const t = createTest();
  await seedUser(t, 'user_failed_export');
  const asUser = t.withIdentity({ subject: 'user_failed_export' });
  const exportId = await asUser.mutation(requestDeletionDataExport, {});
  await t.run(async (ctx) => {
    await ctx.db.patch('dataExports', exportId, { status: 'failed', errorCode: 'export_failed' });
  });
  expect(await asUser.mutation(deleteMyAccount, {})).toBeNull();
});

test('scheduled wipe completes without an open browser and removes stored export files', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T10:00:00.000Z'));
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', fetchMock);
  const t = createTest();
  await seedUser(t, 'user_wipe');
  await seedUser(t, 'user_keep');
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(['portable private data'], { type: 'application/json' }));
    await ctx.db.insert('dataExports', {
      userId: 'user_wipe', status: 'completed', format: 'json', storageId: id,
      requestedAtMs: Date.now(), completedAtMs: Date.now(), expiresAtMs: Date.now() + 100_000,
    });
    await ctx.db.insert('userSettings', { userId: 'user_wipe', createdAtMs: 1, updatedAtMs: 1 });
    await ctx.db.insert('userSettings', { userId: 'user_keep', createdAtMs: 1, updatedAtMs: 1 });
    for (let index = 0; index < 105; index++) {
      await ctx.db.insert('planningPreferences', {
        userId: 'user_wipe', cycleInterval: 'month', cycleIntervalCount: 1,
        anchorDate: '2026-01-01', createdAtMs: index, updatedAtMs: index,
      });
    }
    return id;
  });
  await t.withIdentity({ subject: 'user_wipe' }).mutation(deleteMyAccount, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    expect(await ctx.db.query('userProfiles').withIndex('by_authUserId', (q) => q.eq('authUserId', 'user_wipe')).take(1)).toHaveLength(0);
    expect(await ctx.db.query('userSettings').withIndex('by_userId', (q) => q.eq('userId', 'user_wipe')).take(1)).toHaveLength(0);
    expect(await ctx.db.query('planningPreferences').withIndex('by_userId', (q) => q.eq('userId', 'user_wipe')).take(1)).toHaveLength(0);
    expect(await ctx.db.query('dataExports').withIndex('by_userId_and_requestedAtMs', (q) => q.eq('userId', 'user_wipe')).take(1)).toHaveLength(0);
    expect(await ctx.storage.get(storageId)).toBeNull();
    expect(await ctx.db.query('deletedUsers').take(10)).toMatchObject([{ userHash: expect.stringMatching(/^[a-f0-9]{64}$/) }]);
    expect(await ctx.db.query('userSettings').withIndex('by_userId', (q) => q.eq('userId', 'user_keep')).take(1)).toHaveLength(1);
  });
  expect(fetchMock).toHaveBeenCalledWith('https://api.workos.com/user_management/users/user_wipe',
    expect.objectContaining({ method: 'DELETE' }));
});

test('bank consent failure never blocks identity deletion and keeps retry data without raw user ID', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T10:00:00.000Z'));
  delete process.env.ENABLE_BANKING_APP_ID;
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal('fetch', fetchMock);
  const t = createTest();
  await seedUser(t, 'user_revocation');
  await t.run(async (ctx) => {
    await ctx.db.insert('providerConnections', {
      userId: 'user_revocation', provider: 'enableBanking', status: 'active',
      displayName: 'Test Bank', sessionId: 'session_test', createdAtMs: 1, updatedAtMs: 1,
    });
  });
  await t.withIdentity({ subject: 'user_revocation' }).mutation(deleteMyAccount, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const status = await t.withIdentity({ subject: 'user_revocation' }).query(getDeletionStatus, {});
  expect(status).toEqual({ status: 'done', currentStep: 'done' });
  await t.run(async (ctx) => {
    const rows = await ctx.db.query('accountDeletions').withIndex('by_status', (q) => q.eq('status', 'done')).take(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBeUndefined();
    expect(rows[0]?.revocationResults).toMatchObject([{
      ok: false, sessionId: 'session_test', provider: 'enableBanking',
    }]);
    expect(await ctx.db.query('providerConnections').withIndex('by_userId', (q) => q.eq('userId', 'user_revocation')).take(1)).toHaveLength(0);
  });
  expect(fetchMock).toHaveBeenCalledWith('https://api.workos.com/user_management/users/user_revocation',
    expect.objectContaining({ method: 'DELETE' }));
});

test('temporary WorkOS failure retries after wipe and succeeds headlessly', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T10:00:00.000Z'));
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  const t = createTest();
  await seedUser(t, 'user_workos_retry');
  await t.withIdentity({ subject: 'user_workos_retry' }).mutation(deleteMyAccount, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(await t.withIdentity({ subject: 'user_workos_retry' }).query(getDeletionStatus, {}))
    .toEqual({ status: 'done', currentStep: 'done' });
});

test('an unlinked bank session survives a failed revoke for retry and drops its raw session ID on success', async () => {
  const t = createTest();
  await t.mutation(captureDetachedConsent, { userId: 'erased_user', sessionId: 'late_session' });
  await t.mutation(captureDetachedConsent, { userId: 'erased_user', sessionId: 'late_session' });
  const rows = await t.run(async (ctx) => ctx.db.query('detachedConsentRevocations').collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    userHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    sessionId: 'late_session',
    attemptCount: 0,
  });
  await t.mutation(recordDetachedConsentAttempt, {
    revocationId: rows[0]._id, ok: false, code: 'HTTP_503',
  });
  const pending = await t.run(async (ctx) => ctx.db.get('detachedConsentRevocations', rows[0]._id));
  expect(pending).toMatchObject({ attemptCount: 1, lastError: 'HTTP_503' });
  expect(pending?.nextRetryAtMs).toBeGreaterThanOrEqual(rows[0].nextRetryAtMs);
  await t.mutation(markDetachedConsentRevoked, { sessionId: 'late_session' });
  expect(await t.run(async (ctx) => ctx.db.get('detachedConsentRevocations', rows[0]._id))).toBeNull();
});

type FixtureValidator = {
  kind: string;
  isOptional: string;
  fields?: Record<string, FixtureValidator>;
  members?: Array<FixtureValidator>;
  json: { value?: unknown; tableName?: string };
};

test('headless erasure drains every app-owned table in the current schema', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T10:00:00.000Z'));
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))));
  const t = createTest();
  const userId = 'user_full_fixture';
  await seedUser(t, userId);
  const retainedTables = new Set(['accountDeletions', 'deletedUsers', 'detachedConsentRevocations']);
  const fixtureTables = Object.keys(schema.tables).filter((table) => !retainedTables.has(table));

  await t.run(async (ctx) => {
    const definitions = schema.tables as unknown as Record<string, { validator: { fields: Record<string, FixtureValidator> } }>;
    const inserted = new Map<string, string>();
    const inserting = new Set<string>();
    const insert = ctx.db.insert.bind(ctx.db) as (table: string, doc: Record<string, unknown>) => Promise<string>;

    async function sample(validator: FixtureValidator): Promise<unknown> {
      switch (validator.kind) {
        case 'string': return 'fixture';
        case 'float64': return 1;
        case 'int64': return 1n;
        case 'boolean': return true;
        case 'literal': return validator.json.value;
        case 'array': return [];
        case 'record': return {};
        case 'union': return await sample(validator.members![0]);
        case 'id': return await seedTable(validator.json.tableName!);
        case 'object': {
          const value: Record<string, unknown> = {};
          for (const [field, child] of Object.entries(validator.fields!)) {
            if (child.isOptional === 'required') value[field] = await sample(child);
          }
          return value;
        }
        default: throw new Error(`Unseeded validator kind: ${validator.kind}`);
      }
    }

    async function seedTable(table: string): Promise<string> {
      const prior = inserted.get(table);
      if (prior) return prior;
      if (inserting.has(table)) throw new Error(`Required fixture ID cycle at ${table}`);
      inserting.add(table);
      const fields = definitions[table].validator.fields;
      const doc: Record<string, unknown> = {};
      for (const [field, validator] of Object.entries(fields)) {
        if (field === 'userId' || field === 'authUserId') {
          doc[field] = userId;
        } else if (validator.isOptional === 'required') {
          doc[field] = await sample(validator);
        }
      }
      const id = await insert(table, doc);
      inserted.set(table, id);
      inserting.delete(table);
      return id;
    }

    for (const table of fixtureTables) {
      if (table === 'userProfiles') continue; // WorkOS webhook already seeded it.
      await seedTable(table);
    }
  });

  await t.withIdentity({ subject: userId }).mutation(deleteMyAccount, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    const query = ctx.db.query.bind(ctx.db) as (table: string) => { collect: () => Promise<Array<Record<string, unknown>>> };
    for (const table of fixtureTables) {
      const rows = await query(table).collect();
      expect(rows, table).toHaveLength(0);
    }
    expect(await query('deletedUsers').collect()).toHaveLength(1);
  });
});
