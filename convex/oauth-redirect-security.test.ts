/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { afterAll, expect, test, vi } from 'vitest';
import schema from './schema';

vi.stubEnv('ENABLE_BANKING_RETURN_URL', 'https://app.example.test/app/settings/bank-connections');
vi.stubEnv('WORKOS_CLIENT_ID', 'client_test');
vi.stubEnv('WORKOS_API_KEY', 'sk_test');
vi.stubEnv('WORKOS_WEBHOOK_SECRET', 'whsec_test');
afterAll(() => vi.unstubAllEnvs());
const modules = import.meta.glob(['./**/*.ts', './_generated/*.js', '!./**/*.test.ts']);

test('bank callback redirects suppress the authorization URL Referer', async () => {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  const response = await t.fetch('/enablebanking/callback?state=unknown-state&code=example-code');
  expect(response.status).toBe(303);
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(response.headers.get('Location')).toBe(
    'https://app.example.test/app/settings/bank-connections?bankConnectionState=unknown-state&bankConnectionStatus=failed',
  );
  expect(response.headers.get('Location')).not.toContain('example-code');
});
