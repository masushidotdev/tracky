# 0020: Public marketing pages with EN-root + /it/ SEO structure

Status: accepted

## Context

Tracky had no public marketing surface: `/` was a thin stub, everything under
`/app/*` 302-redirects logged-out users (including crawlers) to WorkOS login,
and `public/robots.txt` was `Disallow: /`. The approved reference is the
maximal Vivi experiment (`experiments/landings-v2/05-maximal-vivi.html`).

## Decision

Ship 15 marketing pages × 2 locales (30 URLs) as TanStack file routes that are
siblings of `_authenticated/` (never children, so no auth gate). EN lives at
root (`/`, `/pricing`, `/features/*`, …), Italian under `/it/*` with localized
slugs (`/it/prezzi`, `/it/funzioni/*`, …). hreflang triple en/it/x-default
(x-default → EN) on every page.

Per-page `head()` carries title, description, canonical, OG/Twitter and JSON-LD
(`SoftwareApplication` without ratings — no fake proof — plus `FAQPage`,
`HowTo`, `BreadcrumbList` where fitting). Shared builder:
`src/lib/marketing/seo.ts`; registry: `src/lib/marketing/pages.ts`.

Sitemap is generated at build time (`scripts/generate-sitemap.mjs` → static
`public/sitemap.xml`, 30 URLs) because TanStack Router maps `sitemap.xml.ts`
to `/sitemap/xml`. `public/robots.txt` stays `Disallow: /` until the go-live
flip (Allow + Sitemap line, keep `/app` + `/callback` disallowed).

Copy is OOS-honest: badges Demo / Self-host / Roadmap per page; bank-sync and
analyst labeled disabled on the hosted demo; Pro labeled coming-soon with no
checkout; zero invented users, ratings or savings figures.

Marketing loaders degrade to logged-out (`signInUrl/signUpUrl → /app`) when
WorkOS secrets are absent, so pages SSR on secret-less workers; `/app/*`
stays gated by `_authenticated` loaders. `<html lang>` derives from the SSR
route path in `RootDocument` (`/it/*` → `it`, else `en`), so Italian pages ship
correct language on first paint.

Marketing copy lives in colocated per-route dicts, not `src/lib/i18n.tsx`
(5k lines, silent-missing-key). Vivi theme is scoped CSS under `.mk`
(`src/styles/marketing/vivi.css`) with self-hosted fontsource display fonts,
coexisting with Tailwind/shadcn + next-themes.

## Boundary

robots flip = indexing starts; staging has no WorkOS secrets so SSR there
degrades (expected). OG images are solid-color placeholders until real exports.
`/app/docs/*` is not linked as SEO anchors (302 for crawlers).
