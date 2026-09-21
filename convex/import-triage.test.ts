/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, components, internal } from './_generated/api';
import schema from './schema';
import { JEV_TRIAGE_NOTE_PREFIX, routeTriage } from './banking/importTriage';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/*.ts',
  './lib/*.ts',
]);

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

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

describe('jev import triage routing', () => {
  test('auto-applies only above both thresholds', () => {
    expect(routeTriage({ choice: 'expense', confidence: 0.9, autoApply: 0.8 })).toBe('auto');
    expect(routeTriage({ choice: 'expense', confidence: 1, autoApply: 0.59 })).toBe('suggest');
    expect(routeTriage({ choice: 'transfer', confidence: 0.72, autoApply: 0.44 })).toBe('suggest');
    expect(routeTriage({ choice: 'expense', confidence: 0.3, autoApply: 0.2 })).toBe('queue');
  });

  test('uses a stable note prefix for traceability without a new source literal', () => {
    expect(JEV_TRIAGE_NOTE_PREFIX).toBe('jev:triage:v1');
  });
});

describe('jev triage quota reservation', () => {
  test('reserves one slot per row and stops at the daily budget', async () => {
    const t = createTest();
    const userId = 'user_quota';
    await seedAuthKitUser(t, userId);
    const asUser = t.withIdentity({ subject: userId });
    const accountId = await asUser.mutation(api.banking.manualAccounts.createManualAccount, {
      name: 'Quota account',
      accountType: 'CACC',
      currency: 'EUR',
    });
    const txIds = await t.run(async (ctx) => {
      const now = Date.now();
      const conn = await ctx.db.insert('providerConnections', {
        userId,
        provider: 'mock',
        status: 'active',
        displayName: 'Mock',
        createdAtMs: now,
        updatedAtMs: now,
      });
      const ids = [];
      for (let i = 0; i < 3; i += 1) {
        ids.push(
          await ctx.db.insert('transactions', {
            userId,
            accountId,
            providerConnectionId: conn,
            provider: 'manual',
            dedupeKey: `csv|quota-${i}`,
            status: 'BOOK',
            direction: 'DBIT',
            amount: { amountMinor: 100n, currency: 'EUR' },
            bookingDate: '2026-09-10',
            transactionDate: '2026-09-10',
            description: `XQZ 9917 TRN ${i}`,
            classificationKind: 'uncategorized',
            classificationSource: 'system',
            importedAtMs: now,
            updatedAtMs: now,
          }),
        );
      }
      return ids;
    });
    const results = [];
    for (const transactionId of txIds) {
      results.push(
        await t.mutation(internal.banking.importTriage.requestRowTriage, {
          userId,
          transactionId,
          today: '2026-09-21',
          dailyBudget: 2,
        }),
      );
    }
    expect(results.map((r) => r.queued)).toEqual([true, true, false]);
    const spent = await t.run(async (ctx) => {
      const settings = await ctx.db.query('userSettings').withIndex('by_userId', (q) => q.eq('userId', userId)).unique();
      return (settings as { jevTriageUsage?: { count?: number } } | null)?.jevTriageUsage?.count ?? 0;
    });
    // Exactly 2 slots consumed: the third row failed closed without scheduling.
    expect(spent).toBe(2);
  });
});
