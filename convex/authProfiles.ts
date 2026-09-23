import { ConvexError, v } from 'convex/values';
import { components } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import { ensureDefaultCategoriesForUser } from './banking/categoryTaxonomy';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

type NullableString = string | null | undefined;

type WorkosUserProfilePayload = {
  id: string;
  email?: NullableString;
  name?: NullableString;
  firstName?: NullableString;
  lastName?: NullableString;
  emailVerified?: boolean;
  profilePictureUrl?: NullableString;
  externalId?: NullableString;
  locale?: NullableString;
  createdAt?: NullableString;
  updatedAt?: NullableString;
};

type ProfileSyncArgs = {
  authUserId: string;
  email?: NullableString;
  name?: NullableString;
  firstName?: NullableString;
  lastName?: NullableString;
  emailVerified?: boolean;
  profilePictureUrl?: NullableString;
  externalId?: NullableString;
  locale?: NullableString;
  workosCreatedAt?: NullableString;
  workosUpdatedAt?: NullableString;
};

type UserProfilePatch = {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  profilePictureUrl?: string;
  externalId?: string;
  locale?: string;
  workosCreatedAt?: string;
  workosUpdatedAt?: string;
};

const optionalNullableStringValidator = v.optional(v.union(v.null(), v.string()));

const syncProfileArgsValidator = {
  authUserId: v.string(),
  email: optionalNullableStringValidator,
  name: optionalNullableStringValidator,
  firstName: optionalNullableStringValidator,
  lastName: optionalNullableStringValidator,
  emailVerified: v.optional(v.boolean()),
  profilePictureUrl: optionalNullableStringValidator,
  externalId: optionalNullableStringValidator,
  locale: optionalNullableStringValidator,
  workosCreatedAt: optionalNullableStringValidator,
  workosUpdatedAt: optionalNullableStringValidator,
};

function normalizeString(value: NullableString): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function displayName(args: Pick<ProfileSyncArgs, 'firstName' | 'lastName' | 'name' | 'email'>): string | undefined {
  const name = normalizeString(args.name);
  if (name) {
    return name;
  }

  const firstName = normalizeString(args.firstName);
  const lastName = normalizeString(args.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || normalizeString(args.email);
}

function compactProfilePatch(patch: UserProfilePatch): UserProfilePatch {
  const compacted: UserProfilePatch = {};

  if (patch.email !== undefined) {
    compacted.email = patch.email;
  }
  if (patch.name !== undefined) {
    compacted.name = patch.name;
  }
  if (patch.firstName !== undefined) {
    compacted.firstName = patch.firstName;
  }
  if (patch.lastName !== undefined) {
    compacted.lastName = patch.lastName;
  }
  if (patch.emailVerified !== undefined) {
    compacted.emailVerified = patch.emailVerified;
  }
  if (patch.profilePictureUrl !== undefined) {
    compacted.profilePictureUrl = patch.profilePictureUrl;
  }
  if (patch.externalId !== undefined) {
    compacted.externalId = patch.externalId;
  }
  if (patch.locale !== undefined) {
    compacted.locale = patch.locale;
  }
  if (patch.workosCreatedAt !== undefined) {
    compacted.workosCreatedAt = patch.workosCreatedAt;
  }
  if (patch.workosUpdatedAt !== undefined) {
    compacted.workosUpdatedAt = patch.workosUpdatedAt;
  }

  return compacted;
}

function profilePatchFromSyncArgs(args: ProfileSyncArgs): UserProfilePatch {
  return {
    email: normalizeString(args.email),
    name: displayName(args),
    firstName: normalizeString(args.firstName),
    lastName: normalizeString(args.lastName),
    emailVerified: args.emailVerified,
    profilePictureUrl: normalizeString(args.profilePictureUrl),
    externalId: normalizeString(args.externalId),
    locale: normalizeString(args.locale),
    workosCreatedAt: normalizeString(args.workosCreatedAt),
    workosUpdatedAt: normalizeString(args.workosUpdatedAt),
  };
}

async function getProfileByAuthUserId(ctx: QueryCtx | MutationCtx, authUserId: string) {
  return await ctx.db
    .query('userProfiles')
    .withIndex('by_authUserId', (q) => q.eq('authUserId', authUserId))
    .unique();
}

async function upsertUserProfile(ctx: MutationCtx, args: ProfileSyncArgs): Promise<Id<'userProfiles'> | null> {
  const deletion = await ctx.db.query('accountDeletions')
    .withIndex('by_userId', (q) => q.eq('userId', args.authUserId)).unique();
  if (deletion) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(args.authUserId));
  const userHash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const tombstone = await ctx.db.query('deletedUsers')
    .withIndex('by_userHash', (q) => q.eq('userHash', userHash)).unique();
  if (tombstone) return null;
  const now = Date.now();
  const existing = await getProfileByAuthUserId(ctx, args.authUserId);
  const patch = profilePatchFromSyncArgs(args);

  if (existing) {
    await ctx.db.patch('userProfiles', existing._id, {
      ...patch,
      status: 'active',
      updatedAtMs: now,
      lastSyncedAtMs: now,
      deletedAtMs: undefined,
    });
    return existing._id;
  }

  const profileId = await ctx.db.insert('userProfiles', {
    authUserId: args.authUserId,
    ...compactProfilePatch(patch),
    status: 'active',
    createdAtMs: now,
    updatedAtMs: now,
    lastSyncedAtMs: now,
  });
  // New accounts start with the default taxonomy; without this the category
  // picker and reports start empty until the first bank sync.
  await ensureDefaultCategoriesForUser(ctx, args.authUserId);
  return profileId;
}

// Self-heal for accounts created before profile-time seeding existed: one
// indexed read when categories are present, a full seed only when empty.
async function ensureUserHasDefaultCategories(ctx: MutationCtx, userId: string) {
  const existing = await ctx.db
    .query('categories')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(1);
  if (existing.length === 0) {
    await ensureDefaultCategoriesForUser(ctx, userId);
  }
}

export async function syncUserProfileFromWorkosUser(ctx: MutationCtx, user: WorkosUserProfilePayload): Promise<Id<'userProfiles'> | null> {
  return await upsertUserProfile(ctx, {
    authUserId: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerified: user.emailVerified,
    profilePictureUrl: user.profilePictureUrl,
    externalId: user.externalId,
    locale: user.locale,
    workosCreatedAt: user.createdAt,
    workosUpdatedAt: user.updatedAt,
  });
}

export async function markUserProfileDeleted(ctx: MutationCtx, authUserId: string): Promise<Id<'userProfiles'> | null> {
  const existing = await getProfileByAuthUserId(ctx, authUserId);
  if (!existing) {
    return null;
  }

  const now = Date.now();
  await ctx.db.patch('userProfiles', existing._id, {
    status: 'deleted',
    updatedAtMs: now,
    lastSyncedAtMs: now,
    deletedAtMs: now,
  });
  return existing._id;
}

export const getCurrentUserProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    return await getProfileByAuthUserId(ctx, identity.subject);
  },
});

export const ensureCurrentUserProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError('Unauthorized');
    }

    const deletion = await ctx.db.query('accountDeletions')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject)).unique();
    if (deletion) throw new ConvexError('deletion_in_progress');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity.subject));
    const userHash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const tombstone = await ctx.db.query('deletedUsers')
      .withIndex('by_userHash', (q) => q.eq('userHash', userHash)).unique();
    if (tombstone) throw new ConvexError('deletion_in_progress');

    const workosUser: WorkosUserProfilePayload | null = await ctx.runQuery(
      components.workOSAuthKit.lib.getAuthUser,
      { id: identity.subject },
    );

    if (workosUser) {
      const profileId = await syncUserProfileFromWorkosUser(ctx, workosUser);
      if (!profileId) throw new ConvexError('deletion_in_progress');
      await ensureUserHasDefaultCategories(ctx, identity.subject);
      return profileId;
    }

    // Standard WorkOS access tokens intentionally contain session claims such
    // as `sub`, but not the user's email/profile fields. During the short window
    // before a webhook or backfill has populated the AuthKit component, leave
    // existing trusted lifecycle and recipient data unchanged. With no existing
    // profile, fail closed so a stale JWT cannot recreate a deleted user.
    const existing = await getProfileByAuthUserId(ctx, identity.subject);
    if (existing) {
      // No self-heal here: with no WorkOS data we cannot tell a pre-seeding
      // account from a post-deletion one, so leave trusted data untouched.
      return existing._id;
    }
    throw new ConvexError('WorkOS profile sync pending');
  },
});

export const syncWorkosUserProfile = internalMutation({
  args: syncProfileArgsValidator,
  handler: async (ctx, args) => {
    return await upsertUserProfile(ctx, args);
  },
});

export const markWorkosUserDeleted = internalMutation({
  args: {
    authUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await markUserProfileDeleted(ctx, args.authUserId);
  },
});
