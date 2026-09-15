/// <reference types="vite/client" />

import agentTest from '@convex-dev/agent/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import resendTest from '@convex-dev/resend/test';
import { convexTest } from 'convex-test';
import { Webhook } from 'svix';
import { beforeAll, describe, expect, test } from 'vitest';
import schema from './schema';

const SECRET = 'whsec_MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const modules = import.meta.glob([
  './_generated/*.js',
  './entitlements.ts',
  './http.ts',
  './analyst/emails.ts',
]);

async function withEnvironment(values: Record<string, string | undefined>, run: () => Promise<unknown>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createTest() {
  const t = convexTest(schema, modules);
  agentTest.register(t);
  rateLimiterTest.register(t);
  resendTest.register(t);
  return t;
}

beforeAll(async () => {
  // Resend snapshots its secret when the HTTP module first imports analyst/emails.
  await withEnvironment({
    RESEND_WEBHOOK_SECRET: SECRET,
    WORKOS_CLIENT_ID: 'client_test',
    WORKOS_API_KEY: 'sk_test',
    WORKOS_WEBHOOK_SECRET: 'whsec_test',
  }, () => modules['./http.ts']());
});

describe('Resend webhook signature verification', () => {
  test('returns 503 when the secret is unset after module initialization', async () => {
    await withEnvironment({ RESEND_WEBHOOK_SECRET: undefined }, async () => {
      const response = await createTest().fetch('/resend-webhook', {
        method: 'POST',
        body: '{}',
      });
      expect(response.status).toBe(503);
      expect(await response.text()).toBe('Resend webhook is not configured');
    });
  });

  test('returns 401 for an invalid signature', async () => {
    await withEnvironment({ RESEND_WEBHOOK_SECRET: SECRET }, async () => {
      const response = await createTest().fetch('/resend-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': 'msg_invalid',
          'svix-timestamp': String(Math.floor(Date.now() / 1_000)),
          'svix-signature': 'v1,bogus',
        },
        body: '{}',
      });
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Invalid signature');
    });
  });

  test('returns 201 for a valid signature and forwards the untouched body', async () => {
    await withEnvironment({ RESEND_WEBHOOK_SECRET: SECRET }, async () => {
      const now = new Date();
      const msgId = 'msg_valid';
      const rawBody = JSON.stringify({
        type: 'email.sent',
        created_at: now.toISOString(),
        data: {
          created_at: now.toISOString(),
          email_id: 'nonexistent-id',
          from: 'a@x.com',
          to: 'b@x.com',
          subject: 's',
        },
      }, null, 2);
      const response = await createTest().fetch('/resend-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': msgId,
          'svix-timestamp': String(Math.floor(now.getTime() / 1_000)),
          'svix-signature': new Webhook(SECRET).sign(msgId, now, rawBody),
        },
        body: rawBody,
      });
      expect(response.status).toBe(201);
    });
  });
});
