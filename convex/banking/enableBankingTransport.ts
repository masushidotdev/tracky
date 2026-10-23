// Credentials must only reach the configured HTTPS origin. Provider API calls
// never need redirects; rejecting them also prevents replaying request bodies.
export function enableBankingRequestUrl(apiBase: string, path: string): URL {
  const base = new URL(apiBase);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('ENABLE_BANKING_API_BASE must be an HTTPS URL without credentials, query, or fragment.');
  }
  const url = new URL(path, base);
  if (!path.startsWith('/') || path.startsWith('//') || url.origin !== base.origin || url.username || url.password) {
    throw new Error('Enable Banking requests must stay on the configured origin.');
  }
  return url;
}
