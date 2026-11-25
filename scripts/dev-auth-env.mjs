import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WORKOS_DEV_KEYS = [
  'WORKOS_CLIENT_ID',
  'WORKOS_API_KEY',
  'WORKOS_REDIRECT_URI',
  'WORKOS_COOKIE_PASSWORD',
];

/**
 * Parse a dotenv-formatted string into a Map of key -> unquoted value.
 * Preserves last assignment when a key appears more than once.
 * @param {string} content
 * @returns {Map<string, string>}
 */
export function parseEnvContent(content) {
  const result = new Map();
  if (!content) return result;

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trimStart()
      : trimmed;
    const eqIndex = withoutExport.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = withoutExport.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    result.set(key, value);
  }

  return result;
}

/**
 * Generate a 48-character URL-safe random cookie password (288 bits of entropy).
 * @returns {string}
 */
export function generateCookiePassword() {
  return randomBytes(36).toString('base64url');
}

/**
 * Check whether a parsed env map defines a key with a non-empty value.
 * @param {Map<string, string>} envMap
 * @param {string} key
 * @returns {boolean}
 */
function hasNonEmptyKey(envMap, key) {
  const value = envMap.get(key);
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Append or fill WORKOS_COOKIE_PASSWORD in `.env.local` content while preserving
 * all existing lines and formatting.
 * @param {string | null} existingContent
 * @param {string} password
 * @returns {string}
 */
export function applyCookiePasswordToEnvLocal(existingContent, password) {
  const assignment = `WORKOS_COOKIE_PASSWORD=${password}`;
  if (existingContent === null || existingContent.length === 0) {
    return `${assignment}\n`;
  }

  const lines = existingContent.split(/\r?\n/);
  const hasTrailingNewline = existingContent.endsWith('\n');
  const eol = existingContent.includes('\r\n') ? '\r\n' : '\n';

  // If there is an existing empty WORKOS_COOKIE_PASSWORD= assignment, fill it in place.
  const emptyPattern = /^(\s*(?:export\s+)?)WORKOS_COOKIE_PASSWORD\s*=\s*(?:""|'')?\s*(?:#.*)?$/;
  let replaced = false;
  const updatedLines = lines.map((line) => {
    if (!replaced && emptyPattern.test(line)) {
      replaced = true;
      return assignment;
    }
    return line;
  });

  if (replaced) {
    return updatedLines.join(eol);
  }

  const prefix = hasTrailingNewline ? existingContent : `${existingContent}${eol}`;
  return `${prefix}${assignment}${eol}`;
}

/**
 * Pure analysis of `.env.local` and `.dev.vars` for local dev WorkOS auth setup.
 * Never returns or logs secret values in warnings.
 * @param {{
 *   envLocalContent: string | null,
 *   devVarsContent: string | null,
 *   generatePassword?: () => string,
 * }} input
 */
export function analyzeDevAuthEnv({
  envLocalContent,
  devVarsContent,
  generatePassword = generateCookiePassword,
}) {
  const envLocalMap = parseEnvContent(envLocalContent ?? '');
  const devVarsExists = devVarsContent !== null;
  const devVarsMap = parseEnvContent(devVarsContent ?? '');

  const hasCookiePasswordInEnvLocal = hasNonEmptyKey(envLocalMap, 'WORKOS_COOKIE_PASSWORD');
  const hasCookiePasswordInDevVars = hasNonEmptyKey(devVarsMap, 'WORKOS_COOKIE_PASSWORD');

  let addedCookiePassword = false;
  let nextEnvLocalContent = envLocalContent;

  if (!hasCookiePasswordInEnvLocal && !hasCookiePasswordInDevVars) {
    const generated = generatePassword();
    nextEnvLocalContent = applyCookiePasswordToEnvLocal(envLocalContent, generated);
    envLocalMap.set('WORKOS_COOKIE_PASSWORD', generated);
    addedCookiePassword = true;
  }

  const missingInDevVars = devVarsExists
    ? WORKOS_DEV_KEYS.filter(
        (key) => hasNonEmptyKey(envLocalMap, key) && !hasNonEmptyKey(devVarsMap, key),
      )
    : [];

  return {
    addedCookiePassword,
    nextEnvLocalContent,
    devVarsExists,
    missingInDevVars,
  };
}

/**
 * Format the divergence warning when `.dev.vars` exists and lacks WorkOS keys
 * present in `.env.local`. Never includes secret values.
 * @param {string[]} missingKeys
 * @returns {string}
 */
export function formatDevVarsWarning(missingKeys) {
  return [
    `[dev-auth-env] Warning: .dev.vars exists, so @cloudflare/vite-plugin loads SSR secrets from .dev.vars and ignores .env.local.`,
    `[dev-auth-env] Missing in .dev.vars (present in .env.local): ${missingKeys.join(', ')}`,
    `[dev-auth-env] Fix: copy those keys from .env.local into .dev.vars, or delete .dev.vars to let local dev load .env.local directly.`,
  ].join('\n');
}

/**
 * Ensure `WORKOS_COOKIE_PASSWORD` is defined for local dev and warn if `.dev.vars`
 * shadows `.env.local` without all WorkOS keys. Never modifies `.dev.vars` and never
 * prints any secret value.
 * @param {{
 *   cwd?: string,
 *   generatePassword?: () => string,
 *   log?: (msg: string) => void,
 *   warn?: (msg: string) => void,
 * }} [options]
 */
export function ensureDevAuthEnv(options = {}) {
  const {
    cwd = process.cwd(),
    generatePassword = generateCookiePassword,
    log = (msg) => console.log(msg),
    warn = (msg) => console.warn(msg),
  } = options;

  const envLocalPath = resolve(cwd, '.env.local');
  const devVarsPath = resolve(cwd, '.dev.vars');

  const envLocalExisted = existsSync(envLocalPath);
  const envLocalContent = envLocalExisted ? readFileSync(envLocalPath, 'utf8') : null;
  const devVarsContent = existsSync(devVarsPath) ? readFileSync(devVarsPath, 'utf8') : null;

  const result = analyzeDevAuthEnv({
    envLocalContent,
    devVarsContent,
    generatePassword,
  });

  if (result.addedCookiePassword && result.nextEnvLocalContent !== null) {
    if (!envLocalExisted) {
      writeFileSync(envLocalPath, result.nextEnvLocalContent, { encoding: 'utf8', mode: 0o600 });
      chmodSync(envLocalPath, 0o600);
    } else {
      writeFileSync(envLocalPath, result.nextEnvLocalContent, { encoding: 'utf8' });
    }
    log('[dev-auth-env] Added generated WORKOS_COOKIE_PASSWORD to .env.local (value hidden).');
  }

  if (result.missingInDevVars.length > 0) {
    warn(formatDevVarsWarning(result.missingInDevVars));
  }

  return result;
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  ensureDevAuthEnv();
}
