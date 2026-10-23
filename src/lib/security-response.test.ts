import { expect, test } from 'vitest';
import { applySecurityHeaders } from './security-response';

test('dynamic responses cannot cache session data and retain cookies and body', async () => {
  const response = new Response('session payload', {
    headers: { 'Set-Cookie': 'session=example; HttpOnly; Secure', 'Cache-Control': 'public, max-age=3600' },
  });
  applySecurityHeaders(response);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
  expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(await response.text()).toBe('session payload');
});
