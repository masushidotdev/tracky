export function applySecurityHeaders(response: Response): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  // SSR and server functions can contain session tokens and financial data,
  // including on a public route visited by a signed-in user. Hashed static
  // assets are served by Cloudflare before this request middleware.
  response.headers.set('Cache-Control', 'private, no-store');
}
