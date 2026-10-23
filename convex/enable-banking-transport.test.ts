// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { enableBankingRequest } from './banking/enableBanking';
import { enableBankingRequestUrl } from './banking/enableBankingTransport';

vi.hoisted(() => {
  process.env.WORKOS_CLIENT_ID ??= 'client_test';
  process.env.WORKOS_API_KEY ??= 'sk_test';
  process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';
});

describe('Enable Banking credential destination', () => {
  test('keeps encoded account identifiers on the provider origin', () => {
    const url = enableBankingRequestUrl(
      'https://api.enablebanking.com',
      `/accounts/${encodeURIComponent('//other.test/a')}/balances`,
    );
    expect(url.origin).toBe('https://api.enablebanking.com');
    expect(url.pathname).toBe('/accounts/%2F%2Fother.test%2Fa/balances');
  });
  test.each([
    'http://provider.test',
    'https://user:password@provider.test',
    'https://provider.test?token=x',
    'https://provider.test#x',
  ])('rejects unsafe provider configuration %s', (base) => {
    expect(() => enableBankingRequestUrl(base, '/sessions')).toThrow();
  });
  test.each(['//other.test/sessions', 'https://other.test/sessions', '/\\other.test/sessions', 'sessions'])(
    'rejects a destination outside the API path contract %s',
    (path) => {
      expect(() => enableBankingRequestUrl('https://api.enablebanking.com', path)).toThrow();
    },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('signed provider requests disable redirects and have a finite request budget', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  vi.stubEnv('ENABLE_BANKING_APP_ID', 'test-app');
  vi.stubEnv('ENABLE_BANKING_PRIVATE_KEY', privateKey);
  vi.stubEnv('ENABLE_BANKING_REDIRECT_URL', 'https://app.example.test/callback');
  vi.stubEnv('ENABLE_BANKING_API_BASE', 'https://api.example.test');
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetchMock);
  await enableBankingRequest('POST', '/sessions', { body: { code: 'example-code' } });
  expect(fetchMock).toHaveBeenCalledWith(
    new URL('https://api.example.test/sessions'),
    expect.objectContaining({
      redirect: 'error',
      signal: expect.any(AbortSignal),
      headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }),
    }),
  );
});
