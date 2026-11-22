# Public Marketing & SEO Routes

## Sub-features

- Bilingual marketing pages in English (`/`, `/pricing`, `/faq`, `/open-source`, `/vs-spreadsheets`, `/features/*`, `/guides/*`, `/for-*`) and Italian (`/it`, `/it/prezzi`, `/it/domande-frequenti`, etc.; `/it/` returns `307` redirecting to `/it`).
- Crawl and metadata endpoints (`/robots.txt`, `/sitemap.xml`).
- SSR security headers applied by `securityMiddleware` (`src/start.ts` + `src/lib/security-response.ts`).
- Expected 404 responses for routes not yet implemented (`/privacy`, `/terms`).

## How to get to it (user POV)

1. Navigate directly to `https://www.trytracky.app/` (or `http://127.0.0.1:4173/` in local Worker `wrangler dev`).
2. Switch language or follow top-nav links (`Pricing`, `FAQ`, `Open Source`, `Start free →`).
3. Inspect `/robots.txt` and `/sitemap.xml` directly.

## Driving it with Playwright / curl

- Run `.cursor/skills/verify-tracky/scripts/verify-public.sh` from the repo root.
- Or with `curl`:
  - `curl -sS -D - http://127.0.0.1:4173/ | head -20` -> `HTTP/1.1 200 OK`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `Cache-Control: private, no-store`.
  - Check `/it`, `/pricing`, `/faq`, `/robots.txt`, `/sitemap.xml` return `200` (and `/it/` returns `307` -> `/it`).
  - Check `/privacy` and `/terms` currently return `404` (update this check when legal routes ship).
- In headless Chrome/Playwright: verify `<title>` starts with `Tracky`, primary CTA (`Start free →`) is visible, and console errors are empty.

## Gotchas

- `authkitMiddleware()` in `src/start.ts` validates `WORKOS_CLIENT_ID` and `WORKOS_COOKIE_PASSWORD` on **every** SSR request before route loaders run, even on public routes. Local `wrangler dev --config dist/server/wrangler.json` without `dist/server/.dev.vars` fails with HTTP `500 AuthKit configuration error`. Use temporary synthetic `dist/server/.dev.vars` (handled automatically by `verify-public.sh`) for secret-less preview verification.
- Pass `--ip 127.0.0.1` to `wrangler dev` so `curl http://127.0.0.1:4173` connects reliably on IPv4 loopback.
