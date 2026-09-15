/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { makeFunctionReference } from 'convex/server';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { components } from './_generated/api';
import { dailyLimitNameForTier } from './analyst/rateLimits';
import { entitlementsForTier, resolveTier } from './lib/entitlements';
import schema from './schema';
import type { Entitlements, PlanTier } from './lib/entitlements';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './entitlements.ts',
  './lib/entitlements.ts',
  './userSettings.ts',
]);

const getMyEntitlements = makeFunctionReference<'query', Record<string, never>, Entitlements>(
  'entitlements:getMyEntitlements',
);
const getEntitlementsForUser = makeFunctionReference<'query', { userId: string }, Entitlements>(
  'entitlements:getEntitlementsForUser',
);
const setUserPlanTier = makeFunctionReference<'mutation', { userId: string; planTier: PlanTier }, null>(
  'userSettings:setUserPlanTier',
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
        firstName: 'Entitlement',
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

describe('entitlements', () => {
  test('defaults to free without creating user settings', async () => {
    const t = createTest();
    const userId = 'user_free';
    await seedAuthUser(t, userId);

    const entitlements = await t.withIdentity({ subject: userId }).query(getMyEntitlements, {});

    expect(entitlements).toEqual(entitlementsForTier('free'));
    expect(await t.query(getEntitlementsForUser, { userId })).toEqual(entitlementsForTier('free'));
    await t.run(async (ctx) => {
      expect(await ctx.db.query('userSettings').withIndex('by_userId').take(10)).toHaveLength(0);
    });
  });

  test('returns pro after the internal billing seam upserts the tier', async () => {
    const t = createTest();
    const userId = 'user_pro';
    await seedAuthUser(t, userId);

    await t.mutation(setUserPlanTier, { userId, planTier: 'pro' });

    expect(await t.withIdentity({ subject: userId }).query(getMyEntitlements, {})).toEqual(
      entitlementsForTier('pro'),
    );
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query('userSettings')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique();
      expect(settings).toMatchObject({ userId, planTier: 'pro' });
      expect(settings?.createdAtMs).toEqual(expect.any(Number));
      expect(settings?.planUpdatedAtMs).toEqual(expect.any(Number));
      expect(settings?.updatedAtMs).toBe(settings?.planUpdatedAtMs);
    });
  });

  test('requires authentication for the public query', async () => {
    const t = createTest();
    await expect(t.query(getMyEntitlements, {})).rejects.toThrow('Unauthorized');
  });

  test('resolves complete feature and limit maps for both tiers', () => {
    expect(resolveTier(undefined)).toBe('free');
    expect(resolveTier({})).toBe('free');
    expect(resolveTier({ planTier: 'pro' })).toBe('pro');
    expect(entitlementsForTier('free')).toEqual({
      tier: 'free',
      features: { 'analyst.longTermProjection': false, 'forecast.scenarios': false, 'plan.multiplePlans': false },
      limits: { analystDailyMessages: 20 },
    });
    expect(entitlementsForTier('pro')).toEqual({
      tier: 'pro',
      features: { 'analyst.longTermProjection': true, 'forecast.scenarios': true, 'plan.multiplePlans': true },
      limits: { analystDailyMessages: 100 },
    });
  });

  test('selects the named daily limit for each tier', () => {
    expect(dailyLimitNameForTier('free')).toBe('analystDailyFree');
    expect(dailyLimitNameForTier('pro')).toBe('analystDailyPro');
  });
});
