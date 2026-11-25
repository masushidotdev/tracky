/**
 * Decode percent-encoded byte sequences safely without throwing on malformed
 * `%` escapes (for example `/cdn-cgi/%ZZ`), which must never bypass blocking.
 *
 * @param {string} value
 * @returns {string}
 */
function safeDecodePercent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value.replace(/%([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  }
}

/**
 * Extract the pathname portion from an HTTP request target (origin-form or
 * absolute-form) without letting protocol-relative paths such as `//cdn-cgi/`
 * get interpreted as a hostname.
 *
 * @param {string} rawUrl
 * @returns {string}
 */
function extractRawPathname(rawUrl) {
  if (/^https?:\/\//i.test(rawUrl)) {
    try {
      return new URL(rawUrl).pathname;
    } catch {
      // Fall through to raw string handling.
    }
  }
  return rawUrl.split(/[?#]/, 1)[0] ?? '';
}

/**
 * Resolve `.` and `..` path segments.
 *
 * @param {string} pathname
 * @returns {string}
 */
function resolveDotSegments(pathname) {
  const resolved = [];
  for (const part of pathname.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return `/${resolved.join('/')}`;
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function matchesCdnCgi(pathname) {
  const lower = pathname.toLowerCase();
  return lower === '/cdn-cgi' || lower.startsWith('/cdn-cgi/');
}

/**
 * Return true when an incoming request URL targets Wrangler/Miniflare local
 * `/cdn-cgi/*` tooling endpoints (case-insensitive, after percent-decoding and
 * path normalization).
 *
 * @param {string | undefined} rawUrl
 * @returns {boolean}
 */
export function isBlockedEdgePath(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return false;
  }

  let current = extractRawPathname(rawUrl);

  for (let i = 0; i < 5; i += 1) {
    const slashNormalized = current.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    const prefixed = slashNormalized.startsWith('/')
      ? slashNormalized
      : `/${slashNormalized}`;

    if (
      matchesCdnCgi(prefixed) ||
      matchesCdnCgi(resolveDotSegments(prefixed))
    ) {
      return true;
    }

    const decoded = safeDecodePercent(current);
    if (decoded === current) {
      break;
    }
    current = decoded;
  }

  return false;
}
