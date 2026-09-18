/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './auth.ts',
  './banking/*.ts',
  './lib/*.ts',
]);

const ENABLE_BANKING_ENV_KEYS = [
  'ENABLE_BANKING_APP_ID',
  'ENABLE_BANKING_PRIVATE_KEY',
  'ENABLE_BANKING_REDIRECT_URL',
] as const;

const previousEnv = new Map<string, string | undefined>();

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  return t;
}

type TestHarness = ReturnType<typeof createTest>;

async function seedAuthKitUser(t: TestHarness, userId: string) {
  const timestamp = '2026-01-01T00:00:00.000Z';
  const { components } = await import('./_generated/api');
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

function backupEnv() {
  for (const key of ENABLE_BANKING_ENV_KEYS) {
    previousEnv.set(key, process.env[key]);
    delete process.env[key];
  }
}

afterEach(() => {
  for (const key of ENABLE_BANKING_ENV_KEYS) {
    const previous = previousEnv.get(key);
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
  previousEnv.clear();
});

describe('Enable Banking availability', () => {
  test('reports unconfigured when env vars are missing', async () => {
    backupEnv();
    const t = createTest();
    const userId = 'user_availability_unset';
    await seedAuthKitUser(t, userId);

    const result = await t.withIdentity({ subject: userId }).query(api.banking.providerAvailability.getProviderAvailability, {});

    expect(result).toEqual({ configured: false });
  });

  test('reports configured when the three required env vars are set', async () => {
    backupEnv();
    process.env.ENABLE_BANKING_APP_ID = 'app_test';
    process.env.ENABLE_BANKING_PRIVATE_KEY = 'key_test';
    process.env.ENABLE_BANKING_REDIRECT_URL = 'https://example.com/callback';
    const t = createTest();
    const userId = 'user_availability_set';
    await seedAuthKitUser(t, userId);

    const result = await t.withIdentity({ subject: userId }).query(api.banking.providerAvailability.getProviderAvailability, {});

    expect(result).toEqual({ configured: true });
  });

  test('diagnose hides missing-env details from the client', async () => {
    backupEnv();
    const t = createTest();
    const userId = 'user_availability_diagnose';
    await seedAuthKitUser(t, userId);

    const result = await t.withIdentity({ subject: userId }).action(api.banking.enableBanking.diagnoseConnection, {
      country: 'IT',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('unavailable');
    expect(result.message).toBeNull();
  });

  test('listAspsps rejects missing config without leaking env var names', async () => {
    backupEnv();
    const t = createTest();
    const userId = 'user_availability_list';
    await seedAuthKitUser(t, userId);

    await expect(
      t.withIdentity({ subject: userId }).action(api.banking.enableBanking.listAspsps, { country: 'IT' }),
    ).rejects.toThrow('Enable Banking is not configured.');
  });
});
