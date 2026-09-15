import { AuthKit } from '@convex-dev/workos-authkit';
import { ConvexError } from 'convex/values';
import { components, internal } from './_generated/api';
import { markUserProfileDeleted, syncUserProfileFromWorkosUser } from './authProfiles';
import type { AuthFunctions } from '@convex-dev/workos-authkit';
import type { DataModel } from './_generated/dataModel';

const authFunctions: AuthFunctions = internal.auth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  authFunctions,
});

type AuthKitContext = Parameters<typeof authKit.getAuthUser>[0];
export type AuthUser = NonNullable<Awaited<ReturnType<typeof authKit.getAuthUser>>>;

export async function requireAuthUser(ctx: AuthKitContext): Promise<AuthUser> {
  const user = await authKit.getAuthUser(ctx);

  if (!user) {
    throw new ConvexError('Unauthorized');
  }

  return user;
}

export const { authKitEvent } = authKit.events({
  'user.created': async (ctx, event) => {
    await syncUserProfileFromWorkosUser(ctx, event.data);
  },
  'user.updated': async (ctx, event) => {
    await syncUserProfileFromWorkosUser(ctx, event.data);
  },
  'user.deleted': async (ctx, event) => {
    await markUserProfileDeleted(ctx, event.data.id);
  },
});

export const { backfillUsers } = authKit.utils();
