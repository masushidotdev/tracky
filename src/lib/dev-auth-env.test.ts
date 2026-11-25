// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  analyzeDevAuthEnv,
  ensureDevAuthEnv,
  generateCookiePassword,
  parseEnvContent,
} from '../../scripts/dev-auth-env.mjs';

const tempDirs: Array<string> = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'tracky-dev-auth-env-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('scripts/dev-auth-env.mjs', () => {
  test('generateCookiePassword produces a 48+ char random URL-safe secret', () => {
    const a = generateCookiePassword();
    const b = generateCookiePassword();
    expect(a.length).toBeGreaterThanOrEqual(48);
    expect(b.length).toBeGreaterThanOrEqual(48);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('creates .env.local with mode 0600 when neither .env.local nor .dev.vars exists and never prints the value', () => {
    const dir = makeTempDir();
    const logs: Array<string> = [];
    const warns: Array<string> = [];
    const fakePassword = 'acme_generated_cookie_password_12345678901234567890';

    const result = ensureDevAuthEnv({
      cwd: dir,
      generatePassword: () => fakePassword,
      log: (msg) => logs.push(msg),
      warn: (msg) => warns.push(msg),
    });

    expect(result.addedCookiePassword).toBe(true);
    expect(result.missingInDevVars).toEqual([]);
    expect(warns).toEqual([]);

    const envLocalPath = join(dir, '.env.local');
    const content = readFileSync(envLocalPath, 'utf8');
    expect(content).toBe(`WORKOS_COOKIE_PASSWORD=${fakePassword}\n`);

    const mode = statSync(envLocalPath).mode & 0o777;
    expect(mode).toBe(0o600);

    const allOutput = [...logs, ...warns].join('\n');
    expect(allOutput).not.toContain(fakePassword);
  });

  test('preserves existing .env.local content and is idempotent on second run', () => {
    const dir = makeTempDir();
    const envLocalPath = join(dir, '.env.local');
    const initial = [
      '# Convex generated',
      'CONVEX_DEPLOYMENT=dev:acme-duck-123',
      'WORKOS_CLIENT_ID=client_acme_01',
    ].join('\n');
    writeFileSync(envLocalPath, initial, 'utf8');

    const fakePassword = 'acme_cookie_secret_value_abcdefghijklmnopqrstuvwxyz';
    const first = ensureDevAuthEnv({
      cwd: dir,
      generatePassword: () => fakePassword,
      log: () => {},
      warn: () => {},
    });

    expect(first.addedCookiePassword).toBe(true);
    const afterFirst = readFileSync(envLocalPath, 'utf8');
    expect(afterFirst).toContain('# Convex generated\nCONVEX_DEPLOYMENT=dev:acme-duck-123\nWORKOS_CLIENT_ID=client_acme_01\n');
    expect(parseEnvContent(afterFirst).get('WORKOS_COOKIE_PASSWORD')).toBe(fakePassword);

    const second = ensureDevAuthEnv({
      cwd: dir,
      generatePassword: () => 'should_not_be_used_second_time_12345678901234567890',
      log: () => {},
      warn: () => {},
    });

    expect(second.addedCookiePassword).toBe(false);
    expect(readFileSync(envLocalPath, 'utf8')).toBe(afterFirst);
  });

  test('does not touch .env.local when .dev.vars already defines WORKOS_COOKIE_PASSWORD', () => {
    const dir = makeTempDir();
    const devVarsPath = join(dir, '.dev.vars');
    const devVarsInitial = 'WORKOS_COOKIE_PASSWORD=acme_existing_dev_vars_cookie_secret_1234567890\n';
    writeFileSync(devVarsPath, devVarsInitial, 'utf8');

    const warns: Array<string> = [];
    const result = ensureDevAuthEnv({
      cwd: dir,
      log: () => {},
      warn: (msg) => warns.push(msg),
    });

    expect(result.addedCookiePassword).toBe(false);
    expect(result.missingInDevVars).toEqual([]);
    expect(warns).toEqual([]);
    expect(readFileSync(devVarsPath, 'utf8')).toBe(devVarsInitial);
  });

  test('warns with missing key names (never values) when .dev.vars exists and shadows .env.local, and never modifies .dev.vars', () => {
    const dir = makeTempDir();
    const fakeApiKey = ['sk', 'acme', 'secretkey9988776655'].join('_');
    const fakeCookie = 'acme_cookie_value_must_never_be_printed_1234567890';
    const envLocalPath = join(dir, '.env.local');
    const devVarsPath = join(dir, '.dev.vars');

    writeFileSync(
      envLocalPath,
      [
        'WORKOS_CLIENT_ID=client_acme_01',
        `WORKOS_API_KEY=${fakeApiKey}`,
        'WORKOS_REDIRECT_URI=http://localhost:3000/callback',
      ].join('\n') + '\n',
      'utf8',
    );

    const devVarsInitial = 'WORKOS_CLIENT_ID=client_acme_01\n';
    writeFileSync(devVarsPath, devVarsInitial, 'utf8');

    const logs: Array<string> = [];
    const warns: Array<string> = [];

    const result = ensureDevAuthEnv({
      cwd: dir,
      generatePassword: () => fakeCookie,
      log: (msg) => logs.push(msg),
      warn: (msg) => warns.push(msg),
    });

    expect(result.addedCookiePassword).toBe(true);
    expect(result.missingInDevVars).toEqual([
      'WORKOS_API_KEY',
      'WORKOS_REDIRECT_URI',
      'WORKOS_COOKIE_PASSWORD',
    ]);

    // .dev.vars must never be modified
    expect(readFileSync(devVarsPath, 'utf8')).toBe(devVarsInitial);

    const warningText = warns.join('\n');
    expect(warningText).toContain('WORKOS_API_KEY');
    expect(warningText).toContain('WORKOS_REDIRECT_URI');
    expect(warningText).toContain('WORKOS_COOKIE_PASSWORD');
    expect(warningText).not.toContain('WORKOS_CLIENT_ID');
    expect(warningText).toContain('delete .dev.vars');

    const allOutput = [...logs, ...warns].join('\n');
    expect(allOutput).not.toContain(fakeApiKey);
    expect(allOutput).not.toContain(fakeCookie);
  });

  test('pure analyzeDevAuthEnv fills empty WORKOS_COOKIE_PASSWORD= line in place', () => {
    const result = analyzeDevAuthEnv({
      envLocalContent: 'WORKOS_CLIENT_ID=client_acme_01\nWORKOS_COOKIE_PASSWORD=\n',
      devVarsContent: null,
      generatePassword: () => 'acme_filled_cookie_secret_123456789012345678901234',
    });

    expect(result.addedCookiePassword).toBe(true);
    expect(result.nextEnvLocalContent).toBe(
      'WORKOS_CLIENT_ID=client_acme_01\nWORKOS_COOKIE_PASSWORD=acme_filled_cookie_secret_123456789012345678901234\n',
    );
  });
});
