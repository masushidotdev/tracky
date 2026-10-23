// Web Crypto keeps signed provider calls in Convex's standard runtime.
const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/\s/g, '')), (character) => character.charCodeAt(0));
}

function der(tag: number, bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const length: Array<number> = [];
  for (let value = bytes.length; value > 0; value = Math.floor(value / 256)) length.unshift(value & 255);
  const prefix = bytes.length < 128 ? [bytes.length] : [128 | length.length, ...length];
  return new Uint8Array([tag, ...prefix, ...bytes]);
}

function pkcs8Bytes(raw: string): Uint8Array<ArrayBuffer> {
  const pem = (raw.includes('BEGIN') ? raw : new TextDecoder().decode(decodeBase64(raw))).replace(/\\n/g, '\n');
  const match = /^\s*-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----([\s\S]+?)-----END \1-----\s*$/.exec(pem);
  if (!match) throw new Error('Enable Banking requires an unencrypted RSA PEM private key');
  const bytes = decodeBase64(match[2]);
  if (match[1] === 'PRIVATE KEY') return bytes;
  // Wrap the existing PKCS#1 RSAPrivateKey in the standard PKCS#8 PrivateKeyInfo.
  // RSA encryption OID 1.2.840.113549.1.1.1 with NULL parameters; signing stays in Web Crypto.
  const algorithm = [48, 13, 6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 1, 5, 0];
  return der(48, new Uint8Array([2, 1, 0, ...algorithm, ...der(4, bytes)]));
}

export async function createEnableBankingJwt(appId: string, privateKey: string, ttlSeconds = 3600): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'RS256', kid: appId };
  const payload = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + ttlSeconds };
  const signingInput = [header, payload].map((value) => base64Url(encoder.encode(JSON.stringify(value)))).join('.');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

export function createBankingState(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(24)));
}
