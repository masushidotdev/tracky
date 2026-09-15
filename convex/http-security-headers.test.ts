/// <reference types="vite/client" />

import agentTest from '@convex-dev/agent/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import resendTest from '@convex-dev/resend/test';
import workOSAuthKitTest from '@convex-dev/workos-authkit/test';
import { convexTest } from 'convex-test';
import { afterAll, describe, expect, test, vi } from 'vitest';
import schema from './schema';

process.env.WORKOS_CLIENT_ID ??= 'client_test';
process.env.WORKOS_API_KEY ??= 'sk_test';
process.env.WORKOS_WEBHOOK_SECRET ??= 'whsec_test';

const modules = import.meta.glob([
  './_generated/*.js',
  './analyst/emailEligibility.ts',
  './analyst/emails.ts',
  './analyst/functionRefs.ts',
  './analyst/models.ts',
  './analyst/rateLimits.ts',
  './analyst/telegram.ts',
  './analyst/telegramActions.ts',
  './analyst/telegramCore.ts',
  './analyst/telegramRefs.ts',
  './analyst/turnLocks.ts',
  './forecast/forecastCore.ts',
  './auth.ts',
  './authProfiles.ts',
  './banking/categoryRuleCore.ts',
  './banking/categoryTaxonomy.ts',
  './banking/connectionHealth.ts',
  './banking/enableBanking.ts',
  './banking/enableBankingErrors.ts',
  './banking/planSnapshotInvalidation.ts',
  './banking/planningReconciliation.ts',
  './banking/providerMutations.ts',
  './banking/providerQueries.ts',
  './banking/subscriptionDetection.ts',
  './banking/syncCadence.ts',
  './banking/syncWindow.ts',
  './entitlements.ts',
  './http.ts',
  './lib/*.ts',
]);

const SECRET = 'a'.repeat(40);

// The callback route reads ENABLE_BANKING_RETURN_URL once at module init: a
// set value turns the callback into a 303 redirect instead of inline HTML.
// Unset it for this suite so the HTML assertions below hold regardless of the
// ambient environment, restoring the original value afterwards.
const previousEnableBankingReturnUrl = process.env.ENABLE_BANKING_RETURN_URL;
delete process.env.ENABLE_BANKING_RETURN_URL;
afterAll(() => {
  if (previousEnableBankingReturnUrl === undefined) delete process.env.ENABLE_BANKING_RETURN_URL;
  else process.env.ENABLE_BANKING_RETURN_URL = previousEnableBankingReturnUrl;
});

function createTest() {
  const t = convexTest(schema, modules);
  workOSAuthKitTest.register(t);
  agentTest.register(t);
  rateLimiterTest.register(t);
  resendTest.register(t);
  return t;
}

function validTelegramBody() {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      text: 'not a link command but long enough to be stored',
      chat: { id: 42, type: 'private' },
      from: { id: 42, is_bot: false, language_code: 'en' },
    },
  };
}

describe('HTTP security headers', () => {
  test('telegram webhook responses carry nosniff', async () => {
    const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    try {
      const t = createTest();
      const response = await t.fetch('/telegram-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': SECRET,
        },
        body: JSON.stringify(validTelegramBody()),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    } finally {
      if (previousSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
      else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
    }
  });

  test('telegram rejection responses carry nosniff', async () => {
    const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    try {
      const response = await createTest().fetch('/telegram-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(response.status).toBe(401);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    } finally {
      if (previousSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
      else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
    }
  });

  test('enablebanking callback HTML denies framing', async () => {
    // No ENABLE_BANKING_RETURN_URL in test env: the route falls through to
    // the inline HTML branch (unknown state -> failed status).
    const response = await createTest().fetch('/enablebanking/callback?state=unknown-state', {
      method: 'GET',
    });
    expect([200, 400]).toContain(response.status);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  test('enablebanking callback without state still carries nosniff', async () => {
    const response = await createTest().fetch('/enablebanking/callback', { method: 'GET' });
    expect(response.status).toBe(400);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    // Plain-text error: framing directives stay on the HTML branch only.
    expect(response.headers.get('X-Frame-Options')).toBeNull();
    vi.restoreAllMocks();
  });
});
