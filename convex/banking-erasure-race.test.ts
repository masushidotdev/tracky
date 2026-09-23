/// <reference types="vite/client" />

import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js', './accountDeletion.ts', './accountDeletionActions.ts',
  './auth.ts', './banking/*.ts', './lib/*.ts',
]);

async function testSigningKey(): Promise<string> {
  const pair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5', modulusLength: 1024,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
  }, true, ['sign', 'verify']);
  const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const body = btoa(String.fromCharCode(...bytes)).match(/.{1,64}/g)?.join('\n');
  const label = ['PRIVATE', 'KEY'].join(' ');
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ENABLE_BANKING_APP_ID;
  delete process.env.ENABLE_BANKING_PRIVATE_KEY;
  delete process.env.ENABLE_BANKING_API_BASE;
  delete process.env.ENABLE_BANKING_REDIRECT_URL;
});

test.each([
  { firstDeleteFails: false },
  { firstDeleteFails: true },
])('revokes an external session created during deletion (first DELETE fails: $firstDeleteFails)', async ({ firstDeleteFails }) => {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  const userId = 'user_callback_erasure';
  const state = 'callback_erasure';
  await t.mutation(internal.banking.providerMutations.createAuthRequest, {
    userId, provider: 'enableBanking', state,
    redirectUrl: 'https://example.test/callback', aspspName: 'Test Bank',
    aspspCountry: 'IT', psuType: 'personal', expiresAtMs: Date.now() + 60_000,
  });
  process.env.ENABLE_BANKING_APP_ID = 'app_test';
  process.env.ENABLE_BANKING_PRIVATE_KEY = await testSigningKey();
  process.env.ENABLE_BANKING_API_BASE = 'https://enablebanking.example.test';
  process.env.ENABLE_BANKING_REDIRECT_URL = 'https://example.test/callback';
  const calls: Array<string> = [];
  let deleteAttempts = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    calls.push(`${options?.method} ${new URL(url).pathname}`);
    if (options?.method === 'POST' && new URL(url).pathname === '/sessions') {
      // The provider has created consent, but Convex has not saved it yet.
      await t.run(async (ctx) => {
        await ctx.db.insert('accountDeletions', {
          userId, userHash: 'a'.repeat(64), status: 'wiping', currentStep: 'disconnect',
          requestedAtMs: Date.now(), updatedAtMs: Date.now(), attemptCount: 0,
          workosDeleted: false,
        });
      });
      return new Response(JSON.stringify({ session_id: 'orphan_session' }), { status: 200 });
    }
    if (options?.method === 'DELETE' && new URL(url).pathname === '/sessions/orphan_session') {
      deleteAttempts += 1;
      if (firstDeleteFails && deleteAttempts === 1) {
        return new Response(JSON.stringify({ error: 'temporarily unavailable' }), { status: 503 });
      }
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${options?.method} ${url}`);
  });

  const result = await t.action(internal.banking.enableBanking.exchangeCallback, { state, code: 'auth_code' });
  expect(result.status).toBe('failed');
  expect(calls).toEqual(['POST /sessions', 'DELETE /sessions/orphan_session']);
  const detached = await t.run(async (ctx) => ctx.db.query('detachedConsentRevocations').first());
  if (firstDeleteFails) {
    expect(detached?.sessionId).toBe('orphan_session');
    expect(detached?.attemptCount).toBe(0);
    await t.action(internal.accountDeletionActions.retryDetachedConsent, { revocationId: detached!._id });
    expect(calls).toEqual(['POST /sessions', 'DELETE /sessions/orphan_session', 'DELETE /sessions/orphan_session']);
  } else {
    expect(detached).toBeNull();
  }
  await t.run(async (ctx) => {
    expect(await ctx.db.query('providerConnections').take(1)).toHaveLength(0);
    expect(await ctx.db.query('detachedConsentRevocations').take(1)).toHaveLength(0);
  });
});
