// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  deriveUrls,
  isPublicHttpsUrl,
  maskSecret,
  mergeEnvTemplate,
  parseEnvFile,
  resolveWorkosApiBaseUrl,
  runSelfhostSetup,
} from '../../scripts/selfhost-setup/lib.mjs';

const TEMPLATE_PATH = resolve(process.cwd(), '.env.selfhost.example');
const TEMPLATE_TEXT = readFileSync(TEMPLATE_PATH, 'utf8');

// Construct fake secrets at runtime so static secret scanners never mistake test fixtures for real keys.
const FAKE_CLIENT_ID = 'client_acme_01HZXTEST';
const FAKE_API_KEY = ['sk', 'test', 'AcmeFixtureKey9876543210'].join('_');
const FAKE_WEBHOOK_SECRET = ['whsec', 'AcmeFixtureWebhook98765432'].join('_');
const FAKE_WEBHOOK_SECRET_ROTATED = ['whsec', 'AcmeRotatedWebhook11223344'].join('_');
const FAKE_INSTANCE_SECRET = 'a'.repeat(64);
const FAKE_COOKIE_PASSWORD = 'acme_cookie_fixture_secret_value_1234567890abcdef';

const tempDirs: Array<string> = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'tracky-selfhost-setup-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, '.env.selfhost.example'), TEMPLATE_TEXT, 'utf8');
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('scripts/selfhost-setup/lib.mjs', () => {
  test('derives URLs for default localhost and custom public HTTPS domains', () => {
    const local = deriveUrls({});
    expect(local.publicUrl).toBe('http://localhost:3000');
    expect(local.redirectUri).toBe('http://localhost:3000/callback');
    expect(local.homepageUrl).toBe('http://localhost:3000');
    expect(local.corsOrigin).toBe('http://localhost:3000');
    expect(local.appPublicUrl).toBe('localhost:3000');
    expect(local.convexUrl).toBe('http://127.0.0.1:3210');
    expect(local.convexSiteUrl).toBe('http://127.0.0.1:3211');
    expect(local.webhookEndpointUrl).toBe('http://127.0.0.1:3211/workos/webhook');
    expect(local.isPublicHttpsSite).toBe(false);
    expect(local.doNotRequireSsl).toBe('true');

    const prod = deriveUrls({
      publicUrl: 'https://tracky.example.com/',
      convexUrl: 'https://convex.example.com/',
      convexSiteUrl: 'https://convex-site.example.com/',
    });
    expect(prod.publicUrl).toBe('https://tracky.example.com');
    expect(prod.redirectUri).toBe('https://tracky.example.com/callback');
    expect(prod.homepageUrl).toBe('https://tracky.example.com');
    expect(prod.corsOrigin).toBe('https://tracky.example.com');
    expect(prod.appPublicUrl).toBe('tracky.example.com');
    expect(prod.convexUrl).toBe('https://convex.example.com');
    expect(prod.convexSiteUrl).toBe('https://convex-site.example.com');
    expect(prod.webhookEndpointUrl).toBe('https://convex-site.example.com/workos/webhook');
    expect(prod.isPublicHttpsSite).toBe(true);
    expect(prod.doNotRequireSsl).toBe('false');

    expect(isPublicHttpsUrl('https://convex-site.example.com')).toBe(true);
    expect(isPublicHttpsUrl('http://convex-site.example.com')).toBe(false);
    expect(isPublicHttpsUrl('https://localhost:3211')).toBe(false);
    expect(isPublicHttpsUrl('https://127.0.0.1:3211')).toBe(false);
    expect(isPublicHttpsUrl('https://192.168.1.20:3211')).toBe(false);
    expect(isPublicHttpsUrl('https://tracky.local')).toBe(false);
  });

  test('restricts WORKOS_API_BASE_URL override to official WorkOS or loopback', () => {
    expect(resolveWorkosApiBaseUrl(undefined)).toEqual({
      baseUrl: 'https://api.workos.com',
      isTestOverride: false,
    });
    expect(resolveWorkosApiBaseUrl('http://127.0.0.1:4010/')).toEqual({
      baseUrl: 'http://127.0.0.1:4010',
      isTestOverride: true,
    });
    expect(() => resolveWorkosApiBaseUrl('https://evil.example.com')).toThrow(/test-only override/i);
  });

  test('mergeEnvTemplate preserves comments, key order, existing user values, and extra keys', () => {
    const existing = [
      'INSTANCE_NAME=acme-home',
      `INSTANCE_SECRET=${FAKE_INSTANCE_SECRET}`,
      'RESEND_API_KEY=re_acme_existing',
      'CUSTOM_USER_VAR=hello',
    ].join('\n');

    const merged = mergeEnvTemplate({
      templateText: TEMPLATE_TEXT,
      existingText: existing,
      updates: {
        INSTANCE_SECRET: FAKE_INSTANCE_SECRET,
        WORKOS_CLIENT_ID: FAKE_CLIENT_ID,
        WORKOS_API_KEY: FAKE_API_KEY,
      },
    });

    expect(merged.content).toContain('# Tracky self-hosting environment template.');
    expect(merged.content).toContain('INSTANCE_NAME=acme-home');
    expect(merged.content).toContain(`INSTANCE_SECRET=${FAKE_INSTANCE_SECRET}`);
    expect(merged.content).toContain(`WORKOS_CLIENT_ID=${FAKE_CLIENT_ID}`);
    expect(merged.content).toContain('RESEND_API_KEY=re_acme_existing');
    expect(merged.content).toContain('CUSTOM_USER_VAR=hello');

    // Second merge with identical updates is byte-for-byte idempotent
    const second = mergeEnvTemplate({
      templateText: TEMPLATE_TEXT,
      existingText: merged.content,
      updates: {
        INSTANCE_SECRET: FAKE_INSTANCE_SECRET,
        WORKOS_CLIENT_ID: FAKE_CLIENT_ID,
        WORKOS_API_KEY: FAKE_API_KEY,
      },
    });
    expect(second.changed).toBe(false);
    expect(second.content).toBe(merged.content);
  });

  test('localhost run skips webhook API calls, writes mode 0600 .env, prints backfill hint, and is idempotent on second run', async () => {
    const dir = makeTempDir();
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    let runNumber = 0;

    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });

      if (url.endsWith('/user_management/redirect_uris')) {
        return Promise.resolve(
          runNumber === 1
            ? jsonResponse(201, { id: 'redir_1' })
            : jsonResponse(422, { message: 'Redirect URI already exists' }),
        );
      }
      if (url.endsWith('/user_management/app_homepage_url')) {
        return Promise.resolve(
          runNumber === 1
            ? jsonResponse(200, { ok: true })
            : jsonResponse(422, { message: 'Homepage URL already set' }),
        );
      }
      if (url.endsWith('/user_management/cors_origins')) {
        return Promise.resolve(
          runNumber === 1
            ? jsonResponse(201, { id: 'cors_1' })
            : jsonResponse(409, { code: 'duplicate_cors_origin', message: 'already exists' }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    }) as unknown as typeof fetch;

    const logs1: Array<string> = [];
    runNumber = 1;
    const res1 = await runSelfhostSetup({
      argv: ['--yes'],
      cwd: dir,
      env: {
        WORKOS_CLIENT_ID: FAKE_CLIENT_ID,
        WORKOS_API_KEY: FAKE_API_KEY,
      },
      fetchImpl: fetchMock,
      log: (msg) => logs1.push(msg),
      warn: () => {},
      generateInstanceSecret: () => FAKE_INSTANCE_SECRET,
      generateCookiePassword: () => FAKE_COOKIE_PASSWORD,
      generatePlaceholderWebhookSecret: () => FAKE_WEBHOOK_SECRET,
    });

    expect(res1.dryRun).toBe(false);
    expect(res1.enableWebhook).toBe(false);
    expect(res1.envChanged).toBe(true);
    expect(res1.workos).toEqual({
      redirectUri: 'created',
      homepageUrl: 'created',
      corsOrigin: 'created',
      webhook: 'skipped',
    });
    expect(calls.some((c) => c.url.includes('webhook_endpoints'))).toBe(false);

    const envPath = join(dir, '.env');
    const envContent1 = readFileSync(envPath, 'utf8');
    expect(statSync(envPath).mode & 0o777).toBe(0o600);

    const parsed1 = parseEnvFile(envContent1).values;
    expect(parsed1.get('INSTANCE_SECRET')).toBe(FAKE_INSTANCE_SECRET);
    expect(parsed1.get('WORKOS_COOKIE_PASSWORD')).toBe(FAKE_COOKIE_PASSWORD);
    expect(parsed1.get('WORKOS_WEBHOOK_SECRET')).toBe(FAKE_WEBHOOK_SECRET);
    expect(parsed1.get('APP_PUBLIC_URL')).toBe('localhost:3000');
    expect(parsed1.get('WORKOS_REDIRECT_URI')).toBe('http://localhost:3000/callback');

    const output1 = logs1.join('\n');
    expect(output1).toContain('docker compose --profile tools run --rm convex-backfill');
    expect(output1).toContain(maskSecret(FAKE_API_KEY));
    expect(output1).not.toContain(FAKE_API_KEY);
    expect(output1).not.toContain(FAKE_INSTANCE_SECRET);
    expect(output1).not.toContain(FAKE_COOKIE_PASSWORD);
    expect(output1).not.toContain(FAKE_WEBHOOK_SECRET);

    // Second run: 422/409 treated as unchanged, existing secrets preserved, .env unchanged
    const logs2: Array<string> = [];
    runNumber = 2;
    const res2 = await runSelfhostSetup({
      argv: ['--yes'],
      cwd: dir,
      env: {},
      fetchImpl: fetchMock,
      log: (msg) => logs2.push(msg),
      warn: () => {},
      generateInstanceSecret: () => 'b'.repeat(64),
      generateCookiePassword: () => 'should_not_overwrite_existing_cookie_password_1234',
      generatePlaceholderWebhookSecret: () => FAKE_WEBHOOK_SECRET_ROTATED,
    });

    expect(res2.envChanged).toBe(false);
    expect(res2.workos).toEqual({
      redirectUri: 'unchanged',
      homepageUrl: 'unchanged',
      corsOrigin: 'unchanged',
      webhook: 'skipped',
    });
    expect(readFileSync(envPath, 'utf8')).toBe(envContent1);
    expect(logs2.join('\n')).toContain('unchanged');
  });

  test('fails with redacted error message when WorkOS returns an unexpected error', async () => {
    const dir = makeTempDir();
    const fetchMock = vi.fn(() => {
      return Promise.resolve(
        new Response(
          JSON.stringify({ message: `Unauthorized for key ${FAKE_API_KEY} Bearer ${FAKE_API_KEY}` }),
          { status: 401 },
        ),
      );
    }) as unknown as typeof fetch;

    const logs: Array<string> = [];
    await expect(
      runSelfhostSetup({
        argv: ['--yes'],
        cwd: dir,
        env: {
          WORKOS_CLIENT_ID: FAKE_CLIENT_ID,
          WORKOS_API_KEY: FAKE_API_KEY,
        },
        fetchImpl: fetchMock,
        log: (msg) => logs.push(msg),
        warn: () => {},
      }),
    ).rejects.toThrow(/401/);

    try {
      await runSelfhostSetup({
        argv: ['--yes'],
        cwd: dir,
        env: {
          WORKOS_CLIENT_ID: FAKE_CLIENT_ID,
          WORKOS_API_KEY: FAKE_API_KEY,
        },
        fetchImpl: fetchMock,
        log: (msg) => logs.push(msg),
        warn: () => {},
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      expect(msg).not.toContain(FAKE_API_KEY);
      expect(msg).toContain('[REDACTED]');
    }
    expect(logs.join('\n')).not.toContain(FAKE_API_KEY);
  });

  test('webhook paths: creates webhook, preserves secret on 409, blocks 409 without secret, and rotates with --rotate-webhook', async () => {
    const dir = makeTempDir();
    const webhookState: { exists: boolean; deletedIds: Array<string> } = {
      exists: false,
      deletedIds: [],
    };

    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';

      if (url.endsWith('/user_management/redirect_uris')) {
        return Promise.resolve(jsonResponse(422, { message: 'already exists' }));
      }
      if (url.endsWith('/user_management/app_homepage_url')) {
        return Promise.resolve(jsonResponse(422, { message: 'unchanged' }));
      }
      if (url.endsWith('/user_management/cors_origins')) {
        return Promise.resolve(jsonResponse(409, { code: 'duplicate_cors_origin' }));
      }
      if (url.endsWith('/webhook_endpoints') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { endpoint_url: string; events: Array<string> };
        expect(body.endpoint_url).toBe('https://convex-site.example.com/workos/webhook');
        expect(body.events).toEqual(['user.created', 'user.updated', 'user.deleted']);
        if (webhookState.exists) {
          return Promise.resolve(jsonResponse(409, { code: 'duplicate_endpoint', message: 'Endpoint already exists' }));
        }
        webhookState.exists = true;
        const secret = webhookState.deletedIds.length > 0 ? FAKE_WEBHOOK_SECRET_ROTATED : FAKE_WEBHOOK_SECRET;
        return Promise.resolve(jsonResponse(201, { id: 'we_acme_1', secret }));
      }
      if (url.includes('/webhook_endpoints') && method === 'GET') {
        return Promise.resolve(
          jsonResponse(200, {
            data: webhookState.exists
              ? [{ id: 'we_acme_1', endpoint_url: 'https://convex-site.example.com/workos/webhook' }]
              : [],
            list_metadata: { after: null },
          }),
        );
      }
      if (url.endsWith('/webhook_endpoints/we_acme_1') && method === 'DELETE') {
        webhookState.exists = false;
        webhookState.deletedIds.push('we_acme_1');
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
    }) as unknown as typeof fetch;

    const baseArgs = [
      '--yes',
      '--public-url',
      'https://tracky.example.com',
      '--convex-url',
      'https://convex.example.com',
      '--convex-site-url',
      'https://convex-site.example.com',
    ];

    // 1. Create webhook
    const createLogs: Array<string> = [];
    const created = await runSelfhostSetup({
      argv: baseArgs,
      cwd: dir,
      env: { WORKOS_CLIENT_ID: FAKE_CLIENT_ID, WORKOS_API_KEY: FAKE_API_KEY },
      fetchImpl: fetchMock,
      log: (msg) => createLogs.push(msg),
      warn: () => {},
      generateInstanceSecret: () => FAKE_INSTANCE_SECRET,
      generateCookiePassword: () => FAKE_COOKIE_PASSWORD,
    });

    expect(created.enableWebhook).toBe(true);
    expect(created.workos?.webhook).toBe('created');
    expect(parseEnvFile(readFileSync(join(dir, '.env'), 'utf8')).values.get('WORKOS_WEBHOOK_SECRET')).toBe(
      FAKE_WEBHOOK_SECRET,
    );
    expect(createLogs.join('\n')).not.toContain(FAKE_WEBHOOK_SECRET);

    // 2. Second run: 409 duplicate_endpoint + existing secret in .env => kept as unchanged
    const second = await runSelfhostSetup({
      argv: baseArgs,
      cwd: dir,
      env: {},
      fetchImpl: fetchMock,
      log: () => {},
      warn: () => {},
    });
    expect(second.workos?.webhook).toBe('unchanged');
    expect(second.envChanged).toBe(false);
    expect(webhookState.deletedIds).toEqual([]);

    // 3. Remove WORKOS_WEBHOOK_SECRET from .env: 409 without --rotate-webhook must fail & NOT delete
    const placeholderWebhook = ['whsec', 'replace_with_workos_webhook_secret'].join('_');
    const envWithoutWebhookSecret = readFileSync(join(dir, '.env'), 'utf8').replace(
      `WORKOS_WEBHOOK_SECRET=${FAKE_WEBHOOK_SECRET}`,
      `WORKOS_WEBHOOK_SECRET=${placeholderWebhook}`,
    );
    writeFileSync(join(dir, '.env'), envWithoutWebhookSecret, 'utf8');

    await expect(
      runSelfhostSetup({
        argv: baseArgs,
        cwd: dir,
        env: {},
        fetchImpl: fetchMock,
        log: () => {},
        warn: () => {},
      }),
    ).rejects.toThrow(/--rotate-webhook/);
    expect(webhookState.deletedIds).toEqual([]);

    // 4. Explicit --rotate-webhook deletes and recreates, storing rotated secret
    const rotated = await runSelfhostSetup({
      argv: [...baseArgs, '--rotate-webhook'],
      cwd: dir,
      env: {},
      fetchImpl: fetchMock,
      log: () => {},
      warn: () => {},
    });
    expect(rotated.workos?.webhook).toBe('rotated');
    expect(webhookState.deletedIds).toEqual(['we_acme_1']);
    expect(parseEnvFile(readFileSync(join(dir, '.env'), 'utf8')).values.get('WORKOS_WEBHOOK_SECRET')).toBe(
      FAKE_WEBHOOK_SECRET_ROTATED,
    );
  });

  test('dry-run makes zero fetch calls, writes zero files, and masks secrets', async () => {
    const dir = makeTempDir();
    const fetchMock = vi.fn(() => {
      return Promise.reject(new Error('fetch must not be called in --dry-run'));
    }) as unknown as typeof fetch;

    const logs: Array<string> = [];
    const result = await runSelfhostSetup({
      argv: ['--yes', '--dry-run', '--public-url', 'https://tracky.example.com'],
      cwd: dir,
      env: {
        WORKOS_CLIENT_ID: FAKE_CLIENT_ID,
        WORKOS_API_KEY: FAKE_API_KEY,
      },
      fetchImpl: fetchMock,
      log: (msg) => logs.push(msg),
      warn: () => {},
    });

    expect(result.dryRun).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(() => readFileSync(join(dir, '.env'), 'utf8')).toThrow();

    const output = logs.join('\n');
    expect(output).toContain('Dry run');
    expect(output).toContain('https://tracky.example.com/callback');
    expect(output).not.toContain(FAKE_API_KEY);
  });
});
