import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const DEFAULT_PUBLIC_URL = 'http://localhost:3000';
export const DEFAULT_CONVEX_URL = 'http://127.0.0.1:3210';
export const DEFAULT_CONVEX_SITE_URL = 'http://127.0.0.1:3211';
export const DEFAULT_WORKOS_API_BASE_URL = 'https://api.workos.com';
export const WORKOS_WEBHOOK_EVENTS = ['user.created', 'user.updated', 'user.deleted'];
export const WORKOS_WEBHOOK_PATH = '/workos/webhook';

const TEMPLATE_PLACEHOLDERS = new Map([
  ['INSTANCE_SECRET', 'replace_with_openssl_rand_hex_32'],
  ['WORKOS_CLIENT_ID', 'client_replace_with_your_workos_client_id'],
  ['WORKOS_API_KEY', 'sk_replace_with_your_workos_api_key'],
  ['WORKOS_COOKIE_PASSWORD', 'replace_with_at_least_32_random_characters_here'],
]);

/**
 * Mask a secret for terminal output. Never prints the full secret.
 * @param {string | undefined | null} value
 * @returns {string}
 */
export function maskSecret(value) {
  if (!value || typeof value !== 'string') return '(unset)';
  const trimmed = value.trim();
  if (!trimmed) return '(unset)';
  if (trimmed.length >= 16) {
    const underscoreIdx = trimmed.indexOf('_');
    if (underscoreIdx > 0 && underscoreIdx <= 6) {
      const prefix = trimmed.slice(0, underscoreIdx + 1);
      return `${prefix}…${trimmed.slice(-4)}`;
    }
  }
  return '(set)';
}

/**
 * Redact known secret values and common WorkOS secret token patterns from a string.
 * @param {string} text
 * @param {Iterable<string | undefined | null>} [secrets]
 * @returns {string}
 */
export function redactSecrets(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 4) {
      out = out.split(secret).join('[REDACTED]');
    }
  }
  out = out.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  out = out.replace(/\bsk_[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
  out = out.replace(/\bwhsec_[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
  return out;
}

/**
 * Determine whether an env value is missing or still a template placeholder.
 * @param {string} key
 * @param {string | undefined | null} value
 * @returns {boolean}
 */
export function isPlaceholderValue(key, value) {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (TEMPLATE_PLACEHOLDERS.get(key) === trimmed) return true;
  if (/^(?:client_|sk_|whsec_)?replace_with_/i.test(trimmed)) return true;
  return false;
}

/**
 * Parse a dotenv file into values, raw lines, and key order.
 * @param {string} content
 * @returns {{ values: Map<string, string>, rawLines: Map<string, string>, order: string[] }}
 */
export function parseEnvFile(content) {
  const values = new Map();
  const rawLines = new Map();
  const order = [];
  if (!content) return { values, rawLines, order };

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trimStart()
      : trimmed;
    const eqIdx = withoutExport.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = withoutExport.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    if (!values.has(key)) order.push(key);
    values.set(key, value);
    rawLines.set(key, rawLine);
  }

  return { values, rawLines, order };
}

/**
 * Format an env value safely for `.env`.
 * @param {string} value
 * @returns {string}
 */
export function formatEnvValue(value) {
  const str = String(value);
  if (/[\r\n]/.test(str)) {
    throw new Error('Environment variable values must not contain newline characters.');
  }
  if (/[\s#"'`$\\]/.test(str)) {
    return JSON.stringify(str);
  }
  return str;
}

/**
 * Validate WorkOS Client ID format loosely without echoing it.
 * @param {string} value
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateClientId(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return { ok: false, error: 'WORKOS_CLIENT_ID is required.' };
  }
  if (/[\s\r\n]/.test(trimmed) || !trimmed.startsWith('client_') || trimmed.length <= 'client_'.length) {
    return {
      ok: false,
      error: 'WORKOS_CLIENT_ID must start with "client_" and contain no whitespace.',
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * Validate WorkOS API Key format loosely without echoing the key.
 * @param {string} value
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateApiKey(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return { ok: false, error: 'WORKOS_API_KEY is required.' };
  }
  if (/[\s\r\n]/.test(trimmed) || !trimmed.startsWith('sk_') || trimmed.length <= 'sk_'.length) {
    return {
      ok: false,
      error: 'WORKOS_API_KEY must start with "sk_" and contain no whitespace.',
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * Normalize an http(s) URL (strips trailing slash from path, rejects credentials/query/hash).
 * @param {string} rawUrl
 * @param {string} label
 * @returns {{ parsed: URL, normalized: string }}
 */
function parseHttpUrl(rawUrl, label) {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmed) {
    throw new Error(`${label} must be a non-empty URL.`);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be a valid URL (e.g. http://localhost:3000 or https://tracky.example.com).`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use http:// or https://.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not contain embedded credentials.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${label} must not contain query parameters or fragments.`);
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  const normalized = `${parsed.origin}${cleanPath}`;
  return { parsed, normalized };
}

/**
 * Check whether a hostname is loopback, private RFC1918/ULA, link-local, or mDNS/local.
 * @param {string} hostname
 * @returns {boolean}
 */
function isPrivateOrLocalHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host === '::1' ||
    host === '::' ||
    host === '0.0.0.0'
  ) {
    return true;
  }

  // IPv4 checks
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }

  // IPv6 ULA / link-local
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    return true;
  }

  // Bare single-label hostname (no dot)
  if (!host.includes('.') && !host.includes(':')) {
    return true;
  }

  return false;
}

/**
 * Return true when the URL is a publicly reachable HTTPS URL suitable for WorkOS webhooks.
 * @param {string} urlString
 * @returns {boolean}
 */
export function isPublicHttpsUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'https:') return false;
    return !isPrivateOrLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Derive all Tracky self-host and WorkOS URLs from user inputs.
 * @param {{
 *   publicUrl?: string,
 *   convexUrl?: string,
 *   convexSiteUrl?: string,
 * }} [input]
 */
export function deriveUrls(input = {}) {
  const pub = parseHttpUrl(input.publicUrl || DEFAULT_PUBLIC_URL, 'Public URL');
  const convex = parseHttpUrl(input.convexUrl || DEFAULT_CONVEX_URL, 'Convex URL');
  const convexSite = parseHttpUrl(input.convexSiteUrl || DEFAULT_CONVEX_SITE_URL, 'Convex site URL');

  const isPublicHttpsSite = isPublicHttpsUrl(convexSite.normalized);
  const usesHttpsConvex = convex.parsed.protocol === 'https:' || convexSite.parsed.protocol === 'https:';

  return {
    publicUrl: pub.normalized,
    redirectUri: `${pub.normalized}/callback`,
    homepageUrl: pub.normalized,
    corsOrigin: pub.parsed.origin,
    appPublicUrl: pub.parsed.host,
    convexUrl: convex.normalized,
    convexSiteUrl: convexSite.normalized,
    webhookEndpointUrl: `${convexSite.normalized}${WORKOS_WEBHOOK_PATH}`,
    isPublicHttpsSite,
    doNotRequireSsl: usesHttpsConvex ? 'false' : 'true',
  };
}

/**
 * Resolve WorkOS API base URL.
 * WORKOS_API_BASE_URL is a test-only override restricted to loopback hosts
 * (127.0.0.1 / localhost / ::1) or https://api.workos.com so API keys cannot
 * accidentally be sent to an arbitrary third-party host.
 * @param {string | undefined} override
 * @returns {{ baseUrl: string, isTestOverride: boolean }}
 */
export function resolveWorkosApiBaseUrl(override) {
  const trimmed = typeof override === 'string' ? override.trim() : '';
  if (!trimmed) {
    return { baseUrl: DEFAULT_WORKOS_API_BASE_URL, isTestOverride: false };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('WORKOS_API_BASE_URL must be a valid URL.');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isOfficial = parsed.protocol === 'https:' && host === 'api.workos.com';
  const isLoopback =
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    (host === '127.0.0.1' || host === 'localhost' || host === '::1');

  if (!isOfficial && !isLoopback) {
    throw new Error(
      'WORKOS_API_BASE_URL is a test-only override and may only target https://api.workos.com or a loopback host (127.0.0.1, localhost, ::1).',
    );
  }

  const normalized = `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  return { baseUrl: normalized, isTestOverride: !isOfficial };
}

/**
 * Wrapper around fetch that redacts known secrets from thrown network errors.
 */
async function safeFetch(fetchImpl, url, init, secrets) {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`WorkOS API request failed: ${redactSecrets(msg, secrets)}`);
  }
}

/**
 * Mirror Convex CLI: POST /user_management/redirect_uris
 */
export async function configureWorkosRedirectUri({ fetchImpl, apiBaseUrl, apiKey, uri, secrets }) {
  const response = await safeFetch(
    fetchImpl,
    `${apiBaseUrl}/user_management/redirect_uris`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ uri }),
    },
    secrets,
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 422 && errorText.includes('already exists')) {
      return { status: 'unchanged' };
    }
    throw new Error(
      `Failed to configure WorkOS redirect URI (${response.status}): ${redactSecrets(errorText, secrets)}`,
    );
  }
  return { status: 'created' };
}

/**
 * Mirror Convex CLI: PUT /user_management/app_homepage_url
 */
export async function configureWorkosHomepageUrl({ fetchImpl, apiBaseUrl, apiKey, url, secrets }) {
  const response = await safeFetch(
    fetchImpl,
    `${apiBaseUrl}/user_management/app_homepage_url`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url }),
    },
    secrets,
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 422) {
      return { status: 'unchanged' };
    }
    throw new Error(
      `Failed to update WorkOS app homepage URL (${response.status}): ${redactSecrets(errorText, secrets)}`,
    );
  }
  return { status: 'created' };
}

/**
 * Mirror Convex CLI: POST /user_management/cors_origins
 */
export async function configureWorkosCorsOrigin({ fetchImpl, apiBaseUrl, apiKey, origin, secrets }) {
  const response = await safeFetch(
    fetchImpl,
    `${apiBaseUrl}/user_management/cors_origins`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ origin }),
    },
    secrets,
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (
      response.status === 409 &&
      (errorText.includes('duplicate_cors_origin') || errorText.includes('already exists'))
    ) {
      return { status: 'unchanged' };
    }
    throw new Error(
      `Failed to configure WorkOS CORS origin (${response.status}): ${redactSecrets(errorText, secrets)}`,
    );
  }
  return { status: 'created' };
}

/**
 * List WorkOS webhook endpoints matching endpointUrl.
 */
async function listMatchingWebhookEndpoints({ fetchImpl, apiBaseUrl, apiKey, endpointUrl, secrets }) {
  const matches = [];
  let after = undefined;

  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`${apiBaseUrl}/webhook_endpoints`);
    if (after) url.searchParams.set('after', after);

    const response = await safeFetch(
      fetchImpl,
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      secrets,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to list WorkOS webhook endpoints (${response.status}): ${redactSecrets(errorText, secrets)}`,
      );
    }

    const body = await response.json();
    const items = Array.isArray(body?.data) ? body.data : [];
    for (const item of items) {
      if (item && item.endpoint_url === endpointUrl && typeof item.id === 'string') {
        matches.push(item);
      }
    }

    const nextCursor = body?.list_metadata?.after;
    if (!nextCursor || typeof nextCursor !== 'string') break;
    after = nextCursor;
  }

  return matches;
}

/**
 * Delete a WorkOS webhook endpoint by ID.
 */
async function deleteWebhookEndpoint({ fetchImpl, apiBaseUrl, apiKey, id, secrets }) {
  const response = await safeFetch(
    fetchImpl,
    `${apiBaseUrl}/webhook_endpoints/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
    secrets,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to delete WorkOS webhook endpoint (${response.status}): ${redactSecrets(errorText, secrets)}`,
    );
  }
}

/**
 * Create (or rotate / preserve) a WorkOS webhook endpoint for Tracky user sync.
 */
export async function configureWorkosWebhook({
  fetchImpl,
  apiBaseUrl,
  apiKey,
  endpointUrl,
  existingWebhookSecret,
  rotateWebhook = false,
  secrets,
}) {
  if (rotateWebhook) {
    const existing = await listMatchingWebhookEndpoints({
      fetchImpl,
      apiBaseUrl,
      apiKey,
      endpointUrl,
      secrets,
    });
    for (const ep of existing) {
      await deleteWebhookEndpoint({
        fetchImpl,
        apiBaseUrl,
        apiKey,
        id: ep.id,
        secrets,
      });
    }
  }

  const response = await safeFetch(
    fetchImpl,
    `${apiBaseUrl}/webhook_endpoints`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        endpoint_url: endpointUrl,
        events: WORKOS_WEBHOOK_EVENTS,
      }),
    },
    secrets,
  );

  if (response.ok) {
    const data = await response.json();
    const secret = typeof data?.secret === 'string' ? data.secret.trim() : '';
    if (!secret) {
      throw new Error('WorkOS created the webhook endpoint but did not return a signing secret.');
    }
    return {
      status: rotateWebhook ? 'rotated' : 'created',
      secret,
      endpointId: typeof data?.id === 'string' ? data.id : undefined,
    };
  }

  const errorText = await response.text();
  const isDuplicate =
    response.status === 409 &&
    (errorText.includes('duplicate_endpoint') ||
      errorText.includes('already exists') ||
      errorText.toLowerCase().includes('duplicate'));

  if (isDuplicate) {
    if (!isPlaceholderValue('WORKOS_WEBHOOK_SECRET', existingWebhookSecret)) {
      return {
        status: 'unchanged',
        secret: existingWebhookSecret.trim(),
      };
    }

    throw new Error(
      `A WorkOS webhook endpoint already exists for ${endpointUrl}, but .env does not have WORKOS_WEBHOOK_SECRET. ` +
        `WorkOS only returns the signing secret when the endpoint is created. ` +
        `Either paste the existing signing secret into .env as WORKOS_WEBHOOK_SECRET, or re-run with --rotate-webhook to delete and recreate the endpoint.`,
    );
  }

  throw new Error(
    `Failed to create WorkOS webhook endpoint (${response.status}): ${redactSecrets(errorText, secrets)}`,
  );
}

/**
 * Merge updates into `.env.selfhost.example` while preserving comments, key order,
 * existing user values, and any extra keys from an existing `.env`.
 * @param {{
 *   templateText: string,
 *   existingText: string | null,
 *   updates: Record<string, string>,
 * }} params
 */
export function mergeEnvTemplate({ templateText, existingText, updates }) {
  const existing = parseEnvFile(existingText ?? '');
  const eol = templateText.includes('\r\n') ? '\r\n' : '\n';
  const templateLines = templateText.split(/\r?\n/);
  // Remove trailing empty element produced by trailing newline so we can re-add cleanly
  const hadTrailingNewline = templateText.endsWith('\n');
  if (hadTrailingNewline && templateLines[templateLines.length - 1] === '') {
    templateLines.pop();
  }

  const emittedKeys = new Set();
  const outputLines = [];
  const addedKeys = [];
  const updatedKeys = [];
  const preservedKeys = [];

  const activeLineRe = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;
  const commentedKeyRe = /^\s*#\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;

  for (const line of templateLines) {
    const activeMatch = activeLineRe.exec(line);
    if (activeMatch) {
      const key = activeMatch[1];
      emittedKeys.add(key);

      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        const nextVal = updates[key];
        const prevVal = existing.values.get(key);
        const formatted = `${key}=${formatEnvValue(nextVal)}`;
        if (prevVal === nextVal && existing.rawLines.has(key)) {
          outputLines.push(existing.rawLines.get(key));
          preservedKeys.push(key);
        } else {
          outputLines.push(formatted);
          if (prevVal === undefined) {
            addedKeys.push(key);
          } else {
            updatedKeys.push(key);
          }
        }
      } else if (existing.rawLines.has(key)) {
        outputLines.push(existing.rawLines.get(key));
        preservedKeys.push(key);
      } else {
        outputLines.push(line);
      }
      continue;
    }

    const commentedMatch = commentedKeyRe.exec(line);
    if (commentedMatch) {
      const key = commentedMatch[1];
      if (!emittedKeys.has(key) && (Object.prototype.hasOwnProperty.call(updates, key) || existing.rawLines.has(key))) {
        emittedKeys.add(key);
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
          const nextVal = updates[key];
          const prevVal = existing.values.get(key);
          if (prevVal === nextVal && existing.rawLines.has(key)) {
            outputLines.push(existing.rawLines.get(key));
            preservedKeys.push(key);
          } else {
            outputLines.push(`${key}=${formatEnvValue(nextVal)}`);
            if (prevVal === undefined) addedKeys.push(key);
            else updatedKeys.push(key);
          }
        } else {
          outputLines.push(existing.rawLines.get(key));
          preservedKeys.push(key);
        }
        continue;
      }
    }

    outputLines.push(line);
  }

  // Append any extra keys from existing .env or updates that were not in the template
  const extraKeys = [];
  for (const key of existing.order) {
    if (!emittedKeys.has(key)) {
      emittedKeys.add(key);
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        const nextVal = updates[key];
        const prevVal = existing.values.get(key);
        if (prevVal === nextVal) {
          extraKeys.push(existing.rawLines.get(key));
          preservedKeys.push(key);
        } else {
          extraKeys.push(`${key}=${formatEnvValue(nextVal)}`);
          updatedKeys.push(key);
        }
      } else {
        extraKeys.push(existing.rawLines.get(key));
        preservedKeys.push(key);
      }
    }
  }

  for (const [key, val] of Object.entries(updates)) {
    if (!emittedKeys.has(key)) {
      emittedKeys.add(key);
      extraKeys.push(`${key}=${formatEnvValue(val)}`);
      addedKeys.push(key);
    }
  }

  if (extraKeys.length > 0) {
    if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
      outputLines.push('');
    }
    outputLines.push(...extraKeys);
  }

  const content = `${outputLines.join(eol)}${eol}`;
  const changed = existingText === null || content !== existingText;

  return {
    content,
    changed,
    addedKeys,
    updatedKeys,
    preservedKeys,
  };
}

/**
 * Atomically write a file with permissions 0600 (temp file in same directory + rename).
 * @param {string} targetPath
 * @param {string} content
 */
export function writeFileAtomic0600(targetPath, content) {
  const dir = dirname(targetPath);
  const tmpName = `.tracky-env-tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  const tmpPath = join(dir, tmpName);
  try {
    writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
    chmodSync(tmpPath, 0o600);
    renameSync(tmpPath, targetPath);
  } catch (error) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    throw error;
  }
}

/**
 * Parse CLI arguments for scripts/selfhost-setup.mjs.
 * @param {string[]} argv
 */
export function parseCliArgs(argv) {
  const args = {
    yes: false,
    dryRun: false,
    help: false,
    webhook: null, // true | false | null (auto)
    rotateWebhook: false,
    publicUrl: undefined,
    convexUrl: undefined,
    convexSiteUrl: undefined,
    outFile: '.env',
    templateFile: '.env.selfhost.example',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const readValue = (flagName) => {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${flagName}.`);
      }
      i += 1;
      return next;
    };

    if (token === '--yes' || token === '-y') {
      args.yes = true;
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token === '--webhook') {
      if (args.webhook === false) {
        throw new Error('Cannot combine --webhook and --no-webhook.');
      }
      args.webhook = true;
    } else if (token === '--no-webhook') {
      if (args.webhook === true) {
        throw new Error('Cannot combine --webhook and --no-webhook.');
      }
      args.webhook = false;
    } else if (token === '--rotate-webhook') {
      args.rotateWebhook = true;
    } else if (token === '--public-url') {
      args.publicUrl = readValue('--public-url');
    } else if (token.startsWith('--public-url=')) {
      args.publicUrl = token.slice('--public-url='.length);
    } else if (token === '--convex-url') {
      args.convexUrl = readValue('--convex-url');
    } else if (token.startsWith('--convex-url=')) {
      args.convexUrl = token.slice('--convex-url='.length);
    } else if (token === '--convex-site-url') {
      args.convexSiteUrl = readValue('--convex-site-url');
    } else if (token.startsWith('--convex-site-url=')) {
      args.convexSiteUrl = token.slice('--convex-site-url='.length);
    } else if (token === '--out') {
      args.outFile = readValue('--out');
    } else if (token.startsWith('--out=')) {
      args.outFile = token.slice('--out='.length);
    } else if (token === '--template') {
      args.templateFile = readValue('--template');
    } else if (token.startsWith('--template=')) {
      args.templateFile = token.slice('--template='.length);
    } else {
      throw new Error(`Unknown argument: ${token}. Run with --help for usage.`);
    }
  }

  if (args.rotateWebhook && args.webhook === false) {
    throw new Error('Cannot combine --rotate-webhook and --no-webhook.');
  }

  return args;
}

export function formatUsage() {
  return [
    'Usage: node scripts/selfhost-setup.mjs [options]',
    '',
    'Configures WorkOS AuthKit and writes .env for Docker self-hosting.',
    '',
    'Options:',
    '  --yes, -y                 Non-interactive mode (reads WORKOS_CLIENT_ID / WORKOS_API_KEY from env or .env)',
    '  --public-url <url>        Public app URL (default: http://localhost:3000)',
    '  --convex-url <url>        Public Convex API URL (default: http://127.0.0.1:3210)',
    '  --convex-site-url <url>   Public Convex HTTP actions URL (default: http://127.0.0.1:3211)',
    '  --webhook                 Register WorkOS user-sync webhook (requires public HTTPS --convex-site-url)',
    '  --no-webhook              Skip webhook registration and use placeholder secret + backfill mode',
    '  --rotate-webhook          Delete and recreate an existing WorkOS webhook to obtain a new signing secret',
    '  --dry-run                 Show planned WorkOS API calls and .env updates without executing or writing',
    '  --out <path>              Target env file path (default: .env)',
    '  --template <path>         Template file path (default: .env.selfhost.example)',
    '  --help, -h                Show this help message',
  ].join('\n');
}

export function generateInstanceSecret() {
  return randomBytes(32).toString('hex');
}

export function generateCookiePassword() {
  return randomBytes(36).toString('base64url');
}

export function generatePlaceholderWebhookSecret() {
  return `whsec_${randomBytes(16).toString('hex')}`;
}

/**
 * Derive an existing public URL from an existing `.env`'s WORKOS_REDIRECT_URI if valid.
 * @param {Map<string, string>} existingValues
 * @returns {string | undefined}
 */
function inferExistingPublicUrl(existingValues) {
  const redirect = existingValues.get('WORKOS_REDIRECT_URI');
  if (!redirect) return undefined;
  try {
    const parsed = new URL(redirect);
    const basePath = parsed.pathname.endsWith('/callback')
      ? parsed.pathname.slice(0, -'/callback'.length)
      : parsed.pathname;
    const cleanPath = basePath.replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return undefined;
  }
}

/**
 * Main testable runner for self-host onboarding.
 * @param {{
 *   argv?: string[],
 *   cwd?: string,
 *   env?: Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch,
 *   isTTY?: boolean,
 *   prompt?: (question: string, defaultValue?: string) => Promise<string>,
 *   promptSecret?: (question: string) => Promise<string>,
 *   promptConfirm?: (question: string, defaultYes?: boolean) => Promise<boolean>,
 *   log?: (msg: string) => void,
 *   warn?: (msg: string) => void,
 *   generateInstanceSecret?: () => string,
 *   generateCookiePassword?: () => string,
 *   generatePlaceholderWebhookSecret?: () => string,
 * }} [options]
 */
export async function runSelfhostSetup(options = {}) {
  const {
    argv = [],
    cwd = process.cwd(),
    env = process.env,
    fetchImpl = globalThis.fetch,
    isTTY = Boolean(process.stdin.isTTY),
    prompt,
    promptSecret,
    promptConfirm,
    log = (msg) => console.log(msg),
    warn = (msg) => console.warn(msg),
    generateInstanceSecret: genInstanceSecret = generateInstanceSecret,
    generateCookiePassword: genCookiePassword = generateCookiePassword,
    generatePlaceholderWebhookSecret: genPlaceholderWebhook = generatePlaceholderWebhookSecret,
  } = options;

  const args = parseCliArgs(argv);
  if (args.help) {
    log(formatUsage());
    return { help: true };
  }

  const interactive = !args.yes && isTTY && typeof prompt === 'function' && typeof promptSecret === 'function';
  const envPath = resolve(cwd, args.outFile);
  const templatePath = resolve(cwd, args.templateFile);

  if (!existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }
  const templateText = readFileSync(templatePath, 'utf8');
  const existingText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : null;
  const existingEnv = parseEnvFile(existingText ?? '');

  // Resolve WORKOS_CLIENT_ID
  let clientId = !isPlaceholderValue('WORKOS_CLIENT_ID', env.WORKOS_CLIENT_ID)
    ? env.WORKOS_CLIENT_ID.trim()
    : !isPlaceholderValue('WORKOS_CLIENT_ID', existingEnv.values.get('WORKOS_CLIENT_ID'))
      ? existingEnv.values.get('WORKOS_CLIENT_ID').trim()
      : '';

  if (!clientId && interactive) {
    clientId = (await prompt('WorkOS Client ID (client_...)')).trim();
  }
  const clientIdCheck = validateClientId(clientId);
  if (!clientIdCheck.ok) {
    throw new Error(clientIdCheck.error);
  }
  clientId = clientIdCheck.value;

  // Resolve WORKOS_API_KEY
  let apiKey = !isPlaceholderValue('WORKOS_API_KEY', env.WORKOS_API_KEY)
    ? env.WORKOS_API_KEY.trim()
    : !isPlaceholderValue('WORKOS_API_KEY', existingEnv.values.get('WORKOS_API_KEY'))
      ? existingEnv.values.get('WORKOS_API_KEY').trim()
      : '';

  if (!apiKey && interactive) {
    apiKey = (await promptSecret('WorkOS API Key (sk_..., input hidden)')).trim();
  }
  const apiKeyCheck = validateApiKey(apiKey);
  if (!apiKeyCheck.ok) {
    throw new Error(apiKeyCheck.error);
  }
  apiKey = apiKeyCheck.value;

  // Resolve URLs
  const defaultPublicUrl = inferExistingPublicUrl(existingEnv.values) || DEFAULT_PUBLIC_URL;
  let publicUrlInput = args.publicUrl;
  if (!publicUrlInput) {
    publicUrlInput = interactive
      ? (await prompt('Public app URL', defaultPublicUrl)).trim() || defaultPublicUrl
      : defaultPublicUrl;
  }

  const defaultConvexUrl = existingEnv.values.get('VITE_CONVEX_URL') || DEFAULT_CONVEX_URL;
  let convexUrlInput = args.convexUrl;
  if (!convexUrlInput) {
    convexUrlInput = interactive
      ? (await prompt('Convex API URL (VITE_CONVEX_URL)', defaultConvexUrl)).trim() || defaultConvexUrl
      : defaultConvexUrl;
  }

  const defaultConvexSiteUrl = existingEnv.values.get('CONVEX_SITE_ORIGIN') || DEFAULT_CONVEX_SITE_URL;
  let convexSiteUrlInput = args.convexSiteUrl;
  if (!convexSiteUrlInput) {
    convexSiteUrlInput = interactive
      ? (await prompt('Convex HTTP actions / site URL (CONVEX_SITE_ORIGIN)', defaultConvexSiteUrl)).trim() ||
        defaultConvexSiteUrl
      : defaultConvexSiteUrl;
  }

  const urls = deriveUrls({
    publicUrl: publicUrlInput,
    convexUrl: convexUrlInput,
    convexSiteUrl: convexSiteUrlInput,
  });

  // Determine webhook mode
  let enableWebhook = false;
  if (args.webhook === true || args.rotateWebhook) {
    if (!urls.isPublicHttpsSite) {
      throw new Error(
        `WorkOS webhooks require a public HTTPS Convex site URL, but got "${urls.convexSiteUrl}". ` +
          `Pass a public https:// URL via --convex-site-url or omit --webhook for local/LAN backfill mode.`,
      );
    }
    enableWebhook = true;
  } else if (args.webhook === false) {
    enableWebhook = false;
  } else if (urls.isPublicHttpsSite) {
    if (interactive && typeof promptConfirm === 'function') {
      enableWebhook = await promptConfirm(
        `Register WorkOS user-sync webhook at ${urls.webhookEndpointUrl}?`,
        true,
      );
    } else {
      enableWebhook = true;
    }
  }

  const { baseUrl: apiBaseUrl, isTestOverride } = resolveWorkosApiBaseUrl(env.WORKOS_API_BASE_URL);
  if (isTestOverride) {
    warn(`[selfhost-setup] Using test-only WORKOS_API_BASE_URL override: ${apiBaseUrl}`);
  }

  // Existing secrets check (never overwrite existing real values!)
  const existingInstanceSecret = existingEnv.values.get('INSTANCE_SECRET');
  const existingCookiePassword = existingEnv.values.get('WORKOS_COOKIE_PASSWORD');
  const existingWebhookSecret = existingEnv.values.get('WORKOS_WEBHOOK_SECRET');

  const hasInstanceSecret = !isPlaceholderValue('INSTANCE_SECRET', existingInstanceSecret);
  const hasCookiePassword = !isPlaceholderValue('WORKOS_COOKIE_PASSWORD', existingCookiePassword);
  const hasWebhookSecret = !isPlaceholderValue('WORKOS_WEBHOOK_SECRET', existingWebhookSecret);

  if (args.dryRun) {
    log('[selfhost-setup] Dry run — no WorkOS API calls will be made and no files will be written.');
    log(`  WorkOS Client ID:   ${clientId}`);
    log(`  WorkOS API Key:     ${maskSecret(apiKey)}`);
    log(`  Redirect URI:       POST ${apiBaseUrl}/user_management/redirect_uris -> ${urls.redirectUri}`);
    log(`  App Homepage URL:   PUT  ${apiBaseUrl}/user_management/app_homepage_url -> ${urls.homepageUrl}`);
    log(`  CORS Origin:        POST ${apiBaseUrl}/user_management/cors_origins -> ${urls.corsOrigin}`);
    if (enableWebhook) {
      log(
        `  Webhook Endpoint:   ${args.rotateWebhook ? 'ROTATE (DELETE + POST)' : 'POST'} ${apiBaseUrl}/webhook_endpoints -> ${urls.webhookEndpointUrl}`,
      );
    } else {
      log(`  Webhook Endpoint:   skipped (local/LAN or --no-webhook; backfill mode)`);
    }
    log(`  Target .env:        ${envPath}`);
    log(`  APP_PUBLIC_URL:     ${urls.appPublicUrl}`);
    log(`  VITE_CONVEX_URL:    ${urls.convexUrl}`);
    log(`  CONVEX_SITE_ORIGIN: ${urls.convexSiteUrl}`);
    log(`  DO_NOT_REQUIRE_SSL: ${urls.doNotRequireSsl}`);
    log(`  INSTANCE_SECRET:    ${hasInstanceSecret ? '(preserve existing)' : '(generate 32-byte hex)'}`);
    log(`  WORKOS_COOKIE_PASSWORD: ${hasCookiePassword ? '(preserve existing)' : '(generate random 48-char)'}`);
    log(
      `  WORKOS_WEBHOOK_SECRET:  ${
        enableWebhook
          ? args.rotateWebhook
            ? '(rotate via WorkOS API)'
            : hasWebhookSecret
              ? '(keep existing if endpoint exists, else store created secret)'
              : '(store secret from WorkOS API)'
          : hasWebhookSecret
            ? '(preserve existing)'
            : '(generate placeholder whsec_ secret)'
      }`,
    );

    return {
      dryRun: true,
      urls,
      enableWebhook,
      envChanged: false,
      workos: {
        redirectUri: 'planned',
        homepageUrl: 'planned',
        corsOrigin: 'planned',
        webhook: enableWebhook ? 'planned' : 'skipped',
      },
    };
  }

  // Track known secrets for redaction on any error
  const knownSecrets = [apiKey, existingInstanceSecret, existingCookiePassword, existingWebhookSecret].filter(
    Boolean,
  );

  // Execute WorkOS API configuration calls
  const redirectResult = await configureWorkosRedirectUri({
    fetchImpl,
    apiBaseUrl,
    apiKey,
    uri: urls.redirectUri,
    secrets: knownSecrets,
  });
  log(`[workos] Redirect URI (${urls.redirectUri}): ${redirectResult.status}`);

  const homepageResult = await configureWorkosHomepageUrl({
    fetchImpl,
    apiBaseUrl,
    apiKey,
    url: urls.homepageUrl,
    secrets: knownSecrets,
  });
  log(`[workos] App homepage URL (${urls.homepageUrl}): ${homepageResult.status}`);

  const corsResult = await configureWorkosCorsOrigin({
    fetchImpl,
    apiBaseUrl,
    apiKey,
    origin: urls.corsOrigin,
    secrets: knownSecrets,
  });
  log(`[workos] CORS origin (${urls.corsOrigin}): ${corsResult.status}`);

  let webhookStatus = 'skipped';
  let webhookSecret;
  if (enableWebhook) {
    const webhookResult = await configureWorkosWebhook({
      fetchImpl,
      apiBaseUrl,
      apiKey,
      endpointUrl: urls.webhookEndpointUrl,
      existingWebhookSecret,
      rotateWebhook: args.rotateWebhook,
      secrets: knownSecrets,
    });
    webhookStatus = webhookResult.status;
    webhookSecret = webhookResult.secret;
    knownSecrets.push(webhookSecret);
    log(`[workos] Webhook endpoint (${urls.webhookEndpointUrl}): ${webhookStatus}`);
  } else {
    webhookSecret = hasWebhookSecret ? existingWebhookSecret.trim() : genPlaceholderWebhook();
    knownSecrets.push(webhookSecret);
    log(`[workos] Webhook endpoint: skipped (${hasWebhookSecret ? 'keeping existing WORKOS_WEBHOOK_SECRET' : 'generated placeholder secret'})`);
  }

  const instanceSecret = hasInstanceSecret ? existingInstanceSecret.trim() : genInstanceSecret();
  const cookiePassword = hasCookiePassword ? existingCookiePassword.trim() : genCookiePassword();

  const updates = {
    INSTANCE_SECRET: instanceSecret,
    WORKOS_CLIENT_ID: clientId,
    WORKOS_API_KEY: apiKey,
    WORKOS_WEBHOOK_SECRET: webhookSecret,
    WORKOS_COOKIE_PASSWORD: cookiePassword,
    WORKOS_REDIRECT_URI: urls.redirectUri,
    VITE_CONVEX_URL: urls.convexUrl,
    APP_PUBLIC_URL: urls.appPublicUrl,
    CONVEX_CLOUD_ORIGIN: urls.convexUrl,
    CONVEX_SITE_ORIGIN: urls.convexSiteUrl,
    NEXT_PUBLIC_DEPLOYMENT_URL: urls.convexUrl,
    DO_NOT_REQUIRE_SSL: urls.doNotRequireSsl,
  };

  const merged = mergeEnvTemplate({
    templateText,
    existingText,
    updates,
  });

  if (merged.changed) {
    writeFileAtomic0600(envPath, merged.content);
    log(`[env] Wrote ${args.outFile} (mode 0600).`);
  } else {
    log(`[env] ${args.outFile}: unchanged.`);
  }

  log('');
  log('Summary:');
  log(`  WORKOS_CLIENT_ID:       ${clientId}`);
  log(`  WORKOS_API_KEY:         ${maskSecret(apiKey)}`);
  log(`  WORKOS_COOKIE_PASSWORD: ${hasCookiePassword ? '(preserved)' : '(generated)'}`);
  log(`  INSTANCE_SECRET:        ${hasInstanceSecret ? '(preserved)' : '(generated)'}`);
  log(
    `  WORKOS_WEBHOOK_SECRET:  ${
      enableWebhook
        ? webhookStatus === 'unchanged'
          ? '(preserved)'
          : `(${webhookStatus})`
        : hasWebhookSecret
          ? '(preserved)'
          : '(placeholder generated)'
    }`,
  );
  log('');
  log(`Next step: docker compose up -d`);

  if (!enableWebhook) {
    log('');
    log('User provisioning (local/LAN mode without inbound WorkOS webhook):');
    log('  Tracky only opens the app once the user record exists in Convex.');
    log('  After each new user signs up, run this command once to import WorkOS users:');
    log('');
    log('    docker compose --profile tools run --rm convex-backfill');
    log('');
    log('  Note: without an inbound webhook, user.updated and user.deleted events will not sync automatically.');
  }

  return {
    dryRun: false,
    urls,
    enableWebhook,
    envChanged: merged.changed,
    secretsGenerated: {
      instanceSecret: !hasInstanceSecret,
      cookiePassword: !hasCookiePassword,
      webhookPlaceholder: !enableWebhook && !hasWebhookSecret,
    },
    workos: {
      redirectUri: redirectResult.status,
      homepageUrl: homepageResult.status,
      corsOrigin: corsResult.status,
      webhook: webhookStatus,
    },
  };
}
