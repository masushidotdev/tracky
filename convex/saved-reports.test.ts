/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { components } from './_generated/api';
import schema from './schema';
import type { Doc, Id } from './_generated/dataModel';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './authProfiles.ts',
  './banking/savedReports.ts',
  './lib/*.ts',
]);

type SavedReportConfig = Doc<'savedReports'>['config'];

const refs = {
  list: makeFunctionReference<'query', Record<string, never>, Array<Doc<'savedReports'>>>(
    'banking/savedReports:listSavedReports',
  ),
  create: makeFunctionReference<
    'mutation',
    { name: string; config: SavedReportConfig },
    Id<'savedReports'>
  >('banking/savedReports:createSavedReport'),
  update: makeFunctionReference<
    'mutation',
    {
      savedReportId: Id<'savedReports'>;
      name?: string;
      config?: SavedReportConfig;
      sortOrder?: number;
    },
    Doc<'savedReports'> | null
  >('banking/savedReports:updateSavedReport'),
  remove: makeFunctionReference<'mutation', { savedReportId: Id<'savedReports'> }, null>(
    'banking/savedReports:deleteSavedReport',
  ),
};

const baseConfig: SavedReportConfig = {
  tab: 'spending',
  mode: 'breakdown',
  chartType: 'donut',
  groupBy: 'category',
  granularity: 'month',
  datePreset: 'last30Days',
};

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthKitUser(t: TestHarness, userId: string) {
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

describe('saved reports', () => {
  test('creates, lists, updates, and deletes a report', async () => {
    const t = createTest();
    const userId = 'user_saved_reports_crud';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const tagId = await t.run(async (ctx) =>
      await ctx.db.insert('transactionTags', {
        userId,
        name: 'Recurring',
        createdAtMs: Date.UTC(2026, 0, 1),
        updatedAtMs: Date.UTC(2026, 0, 1),
      }),
    );
    const config: SavedReportConfig = { ...baseConfig, tagIds: [tagId] };

    const savedReportId = await asUser.mutation(refs.create, { name: '  Monthly spending  ', config });
    expect(await asUser.query(refs.list, {})).toMatchObject([
      { _id: savedReportId, name: 'Monthly spending', sortOrder: 1, config },
    ]);

    const updatedConfig: SavedReportConfig = {
      ...config,
      tab: 'cashflow',
      mode: 'trends',
      chartType: 'barStacked',
    };
    const updated = await asUser.mutation(refs.update, {
      savedReportId,
      name: 'Cash flow',
      config: updatedConfig,
      sortOrder: 7,
    });
    expect(updated).toMatchObject({ name: 'Cash flow', config: updatedConfig, sortOrder: 7 });

    await asUser.mutation(refs.remove, { savedReportId });
    expect(await asUser.query(refs.list, {})).toEqual([]);
  });

  test('enforces the 20-report limit', async () => {
    const t = createTest();
    const userId = 'user_saved_reports_limit';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    for (let index = 0; index < 20; index += 1) {
      await asUser.mutation(refs.create, { name: `Report ${index + 1}`, config: baseConfig });
    }

    await expect(asUser.mutation(refs.create, { name: 'Report 21', config: baseConfig })).rejects.toThrow(
      'At most 20 saved reports',
    );
  });

  test('prevents another user from updating or deleting a report', async () => {
    const t = createTest();
    await seedAuthKitUser(t, 'user_saved_reports_owner');
    await seedAuthKitUser(t, 'user_saved_reports_other');
    const owner = t.withIdentity({ subject: 'user_saved_reports_owner' });
    const other = t.withIdentity({ subject: 'user_saved_reports_other' });
    const savedReportId = await owner.mutation(refs.create, { name: 'Private report', config: baseConfig });

    await expect(other.mutation(refs.update, { savedReportId, name: 'Changed' })).rejects.toThrow(
      'Saved report not found',
    );
    await expect(other.mutation(refs.remove, { savedReportId })).rejects.toThrow('Saved report not found');
    expect(await owner.query(refs.list, {})).toHaveLength(1);
    expect(await other.query(refs.list, {})).toEqual([]);
  });

  test('trims names and rejects empty or overlong names', async () => {
    const t = createTest();
    const userId = 'user_saved_reports_names';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    await expect(asUser.mutation(refs.create, { name: '   ', config: baseConfig })).rejects.toThrow(
      'Report name must contain 1 to 60 characters',
    );
    await expect(asUser.mutation(refs.create, { name: 'x'.repeat(61), config: baseConfig })).rejects.toThrow(
      'Report name must contain 1 to 60 characters',
    );
  });

  test('validates custom dates and amount bounds', async () => {
    const t = createTest();
    const userId = 'user_saved_reports_config';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(refs.create, {
        name: 'Missing custom dates',
        config: { ...baseConfig, datePreset: 'custom', dateFrom: '2026-01-01' },
      }),
    ).rejects.toThrow('Custom date reports require dateFrom and dateTo');
    await expect(
      asUser.mutation(refs.create, {
        name: 'Invalid amounts',
        config: { ...baseConfig, amountMinMinor: 2_000n, amountMaxMinor: 1_000n },
      }),
    ).rejects.toThrow('amountMinMinor must be less than or equal to amountMaxMinor');
  });

  test('requires authentication', async () => {
    const t = createTest();
    await expect(t.query(refs.list, {})).rejects.toThrow('Unauthorized');
    await expect(t.mutation(refs.create, { name: 'No auth', config: baseConfig })).rejects.toThrow('Unauthorized');
  });
});
