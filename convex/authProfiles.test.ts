/// <reference types="vite/client" />

import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { describe, expect, test } from 'vitest';
import { api, components, internal } from './_generated/api';
import { DEFAULT_CATEGORIES } from './banking/categoryTaxonomy';
import schema from './schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './authProfiles.ts',
  './banking/categoryTaxonomy.ts',
]);

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
        email: 'verified@example.com',
        firstName: 'Verified',
        lastName: 'User',
        emailVerified: true,
        profilePictureUrl: 'https://example.com/avatar.png',
        lastSignInAt: null,
        externalId: null,
        metadata: {},
        locale: 'it-IT',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
  });
}

describe('WorkOS user profile sync', () => {
  test('ensures the authenticated profile from server-side WorkOS data rather than sparse JWT claims', async () => {
    const t = createTest();
    const authUserId = 'user_authenticated';
    await seedAuthKitUser(t, authUserId);

    const profileId = await t
      .withIdentity({ subject: authUserId })
      .mutation(api.authProfiles.ensureCurrentUserProfile, {});
    const profile = await t.run(async (ctx) => await ctx.db.get('userProfiles', profileId));

    expect(profile).toMatchObject({
      authUserId,
      email: 'verified@example.com',
      name: 'Verified User',
      firstName: 'Verified',
      lastName: 'User',
      emailVerified: true,
      profilePictureUrl: 'https://example.com/avatar.png',
      locale: 'it-IT',
      status: 'active',
    });
  });

  test('seeds default categories when a profile is created via the user.created event', async () => {
    const t = createTest();
    const authUserId = 'user_seeded_categories';
    const timestamp = '2026-01-01T00:00:00.000Z';
    await t.mutation(internal.auth.authKitEvent, {
      event: 'user.created',
      data: {
        id: authUserId,
        email: `${authUserId}@example.com`,
        firstName: 'Seeded',
        lastName: 'User',
        emailVerified: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });

    const categories = await t.run(async (ctx) =>
      ctx.db
        .query('categories')
        .withIndex('by_userId', (q) => q.eq('userId', authUserId))
        .collect(),
    );

    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    for (const definition of DEFAULT_CATEGORIES) {
      expect(categories.some((category) => category.systemKey === definition.systemKey)).toBe(true);
    }
  });

  test('self-heals missing categories on bootstrap for pre-seeding accounts', async () => {
    const t = createTest();
    const authUserId = 'user_preseding_no_categories';
    await seedAuthKitUser(t, authUserId);
    await t.run(async (ctx) => {
      const categories = await ctx.db
        .query('categories')
        .withIndex('by_userId', (q) => q.eq('userId', authUserId))
        .collect();
      await Promise.all(categories.map((category) => ctx.db.delete('categories', category._id)));
    });

    await t.withIdentity({ subject: authUserId }).mutation(api.authProfiles.ensureCurrentUserProfile, {});

    const categories = await t.run(async (ctx) =>
      ctx.db
        .query('categories')
        .withIndex('by_userId', (q) => q.eq('userId', authUserId))
        .collect(),
    );
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  test('does not erase trusted profile fields while the WorkOS component is awaiting sync', async () => {
    const t = createTest();
    const authUserId = 'user_pending_component_sync';
    const profileId = await t.mutation(internal.authProfiles.syncWorkosUserProfile, {
      authUserId,
      email: 'existing@example.com',
      name: 'Existing User',
      emailVerified: true,
      locale: 'en-US',
    });

    const result = await t
      .withIdentity({ subject: authUserId })
      .mutation(api.authProfiles.ensureCurrentUserProfile, {});
    expect(result).toBeNull();
    const profile = await t.run(async (ctx) => await ctx.db.get('userProfiles', profileId!));

    expect(profile).toMatchObject({
      email: 'existing@example.com',
      name: 'Existing User',
      emailVerified: true,
      locale: 'en-US',
      status: 'active',
    });
  });

  test('does not reactivate a deleted profile from a stale JWT while the WorkOS component has no user', async () => {
    const t = createTest();
    const authUserId = 'user_deleted';
    const profileId = await t.mutation(internal.authProfiles.syncWorkosUserProfile, {
      authUserId,
      email: 'deleted@example.com',
      emailVerified: true,
    });
    await t.mutation(internal.authProfiles.markWorkosUserDeleted, { authUserId });

    await t.withIdentity({ subject: authUserId }).mutation(api.authProfiles.ensureCurrentUserProfile, {});
    const profile = await t.run(async (ctx) => await ctx.db.get('userProfiles', profileId!));

    expect(profile?.status).toBe('deleted');
    expect(profile?.deletedAtMs).toEqual(expect.any(Number));
    expect(profile?.email).toBe('deleted@example.com');
    expect(profile?.emailVerified).toBe(true);
  });

  test('does not create an active profile from a stale JWT when WorkOS deletion preceded bootstrap', async () => {
    const t = createTest();
    const authUserId = 'user_deleted_before_bootstrap';

    expect(
      await t.withIdentity({ subject: authUserId }).mutation(api.authProfiles.ensureCurrentUserProfile, {}),
    ).toBeNull();
    const profile = await t.run(async (ctx) => {
      return await ctx.db
        .query('userProfiles')
        .withIndex('by_authUserId', (q) => q.eq('authUserId', authUserId))
        .unique();
    });

    expect(profile).toBeNull();

    await seedAuthKitUser(t, authUserId);
    expect(
      await t.withIdentity({ subject: authUserId }).mutation(api.authProfiles.ensureCurrentUserProfile, {}),
    ).not.toBeNull();
  });

  test('upserts, soft-deletes, and reactivates app-level profiles', async () => {
    const t = createTest();
    const authUserId = 'user_workos_123';

    const profileId = await t.mutation(internal.authProfiles.syncWorkosUserProfile, {
      authUserId,
      email: 'alex@example.com',
      firstName: 'Alex',
      lastName: 'Rivera',
      emailVerified: true,
      workosCreatedAt: '2026-01-01T00:00:00.000Z',
      workosUpdatedAt: '2026-01-01T00:00:00.000Z',
    });

    await t.mutation(internal.authProfiles.syncWorkosUserProfile, {
      authUserId,
      email: 'updated@example.com',
      name: 'Updated User',
      firstName: null,
      lastName: 'User',
      emailVerified: false,
      profilePictureUrl: 'https://example.com/avatar.png',
      workosUpdatedAt: '2026-01-02T00:00:00.000Z',
    });

    const updated = await t.run(async (ctx) => {
      return await ctx.db.get('userProfiles', profileId!);
    });

    expect(updated?.authUserId).toBe(authUserId);
    expect(updated?.email).toBe('updated@example.com');
    expect(updated?.name).toBe('Updated User');
    expect(updated?.firstName).toBeUndefined();
    expect(updated?.lastName).toBe('User');
    expect(updated?.emailVerified).toBe(false);
    expect(updated?.status).toBe('active');
    expect(updated?.profilePictureUrl).toBe('https://example.com/avatar.png');
    expect(updated?.workosUpdatedAt).toBe('2026-01-02T00:00:00.000Z');

    await t.mutation(internal.authProfiles.markWorkosUserDeleted, { authUserId });

    const deleted = await t.run(async (ctx) => {
      return await ctx.db.get('userProfiles', profileId!);
    });

    expect(deleted?.status).toBe('deleted');
    expect(deleted?.deletedAtMs).toEqual(expect.any(Number));

    const reactivatedProfileId = await t.mutation(internal.authProfiles.syncWorkosUserProfile, {
      authUserId,
      email: 'reactivated@example.com',
      name: 'Reactivated User',
      emailVerified: true,
      workosUpdatedAt: '2026-01-03T00:00:00.000Z',
    });

    const reactivated = await t.run(async (ctx) => {
      return await ctx.db.get('userProfiles', reactivatedProfileId!);
    });

    expect(reactivatedProfileId).toBe(profileId);
    expect(reactivated?.status).toBe('active');
    expect(reactivated?.deletedAtMs).toBeUndefined();
    expect(reactivated?.email).toBe('reactivated@example.com');
  });
});
