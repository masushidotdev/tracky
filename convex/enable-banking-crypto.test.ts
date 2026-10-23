// @vitest-environment node
import { generateKeyPairSync, verify } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { createBankingState, createEnableBankingJwt } from './banking/enableBankingCrypto';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
afterEach(() => vi.unstubAllGlobals());

test.each(['pkcs1', 'pkcs8'] as const)(
  'Web Crypto preserves provider-compatible RS256 signatures with %s keys',
  async (type) => {
    const pem = keys.privateKey.export({ type, format: 'pem' }).toString();
    for (const configured of [pem, pem.replace(/\n/g, '\\n'), Buffer.from(pem).toString('base64')]) {
      // Exercise the actual implementation without Node's Buffer global.
      vi.stubGlobal('Buffer', undefined);
      const jwt = await createEnableBankingJwt('application-id', configured);
      vi.unstubAllGlobals();
      const [header, payload, signature] = jwt.split('.');
      expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
        typ: 'JWT',
        alg: 'RS256',
        kid: 'application-id',
      });
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      expect(claims).toMatchObject({ iss: 'enablebanking.com', aud: 'api.enablebanking.com' });
      expect(claims.exp - claims.iat).toBe(3600);
      expect(
        verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), keys.publicKey, Buffer.from(signature, 'base64url')),
      ).toBe(true);
      expect(
        verify(
          'RSA-SHA256',
          Buffer.from(`${header}.${payload}tampered`),
          keys.publicKey,
          Buffer.from(signature, 'base64url'),
        ),
      ).toBe(false);
    }
  },
);

test('OAuth state retains 192 random bits and URL-safe encoding', () => {
  const states = Array.from({ length: 32 }, createBankingState);
  expect(new Set(states).size).toBe(states.length);
  for (const state of states) {
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(Buffer.from(state, 'base64url')).toHaveLength(24);
  }
});

test('malformed signing keys fail before provider traffic', async () => {
  await expect(createEnableBankingJwt('test', 'malformed')).rejects.toThrow();
});
