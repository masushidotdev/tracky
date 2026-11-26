// @vitest-environment node
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { marketingPages } from './pages';
import { Route as HomeEnRoute, HomeEnView, homeEnFaq } from '@/routes/index';
import { Route as HomeItRoute, HomeItView, homeItFaq } from '@/routes/it/index';
import { Route as PricingEnRoute, PricingEnView, pricingEnFaq } from '@/routes/pricing';
import { Route as PricingItRoute, PricingItView, pricingItFaq } from '@/routes/it/prezzi';

const loggedOutAuth = {
  user: null,
  signInUrl: 'https://auth.trytracky.app/sign-in',
  signUpUrl: 'https://auth.trytracky.app/sign-up',
};

const loggedInAuth = {
  user: { id: 'user_test_123' },
  signInUrl: 'https://auth.trytracky.app/sign-in',
  signUpUrl: 'https://auth.trytracky.app/sign-up',
};

const knownMarketingPaths = new Set(marketingPages.flatMap((page) => [page.en, page.it]));

function decodeEntities(html: string): string {
  return html
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

const forbiddenPatterns = [
  /90\s*days/i,
  /90\s*giorni/i,
  /5\s*minut/i,
  /20\s*minut/i,
  /runs every 6 hours/i,
  /33 transactions imported/i,
  /33 movimenti importati/i,
  /import-summary\.png/i,
];

const pages = [
  {
    name: 'EN Home',
    locale: 'en' as const,
    path: '/',
    altPath: '/it/',
    altLang: 'it',
    isHome: true,
    Component: HomeEnView,
    Route: HomeEnRoute,
    faq: homeEnFaq,
  },
  {
    name: 'IT Home',
    locale: 'it' as const,
    path: '/it/',
    altPath: '/',
    altLang: 'en',
    isHome: true,
    Component: HomeItView,
    Route: HomeItRoute,
    faq: homeItFaq,
  },
  {
    name: 'EN Pricing',
    locale: 'en' as const,
    path: '/pricing',
    altPath: '/it/prezzi',
    altLang: 'it',
    isHome: false,
    Component: PricingEnView,
    Route: PricingEnRoute,
    faq: pricingEnFaq,
  },
  {
    name: 'IT Pricing',
    locale: 'it' as const,
    path: '/it/prezzi',
    altPath: '/pricing',
    altLang: 'en',
    isHome: false,
    Component: PricingItView,
    Route: PricingItRoute,
    faq: pricingItFaq,
  },
];

describe('Atelier marketing pages (Home & Pricing EN/IT)', () => {
  test.each(pages)(
    '$name renders semantic landmarks, one h1, matching FAQ JSON-LD, valid links, and clean copy',
    ({ Component, Route, faq, locale, altPath, altLang, isHome }) => {
      const html = renderToStaticMarkup(React.createElement(Component, { auth: loggedOutAuth }));

      // Scoped under .mka root
      expect(html.startsWith('<div class="mka">')).toBe(true);

      // Semantic landmarks & accessible mobile drawer
      expect(html).toContain('<header class="mka-header">');
      expect(html).toContain('<main id="main">');
      expect(html).toContain('<footer class="mka-footer">');
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain('aria-controls="mka-mobile-drawer"');

      // Exactly one <h1>
      const h1Matches = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) ?? [];
      expect(h1Matches).toHaveLength(1);

      // No forbidden legacy / untruthful strings
      for (const pattern of forbiddenPatterns) {
        expect(html).not.toMatch(pattern);
      }

      // Language switch points to the exact alternate path with lang attribute
      expect(html).toContain(`href="${altPath}" lang="${altLang}"`);

      // Logged-out CTA hrefs point to signUpUrl and Sign in points to signInUrl
      expect(html).toContain(`href="${loggedOutAuth.signUpUrl}"`);
      expect(html).toContain(`href="${loggedOutAuth.signInUrl}"`);
      expect(html).not.toContain('href="/app"');

      // Visible FAQ matches JSON-LD 1:1
      const faqDetails = [...html.matchAll(/<details class="mka-faq-card"[^>]*>([\s\S]*?)<\/details>/g)];
      expect(faqDetails).toHaveLength(faq.length);

      const head = Route.options.head!({} as never) as {
        meta: Array<{ title?: string; name?: string; content?: string }>;
        scripts: Array<{ type: string; children: string }>;
      };

      const titleEntry = head.meta.find((m) => typeof m.title === 'string');
      expect(titleEntry?.title).toContain('Tracky');

      const descEntry = head.meta.find((m) => m.name === 'description');
      expect(descEntry?.content).toBeTruthy();
      expect((descEntry?.content ?? '').length).toBeLessThanOrEqual(160);

      const jsonLdBlocks = head.scripts.map((s) => JSON.parse(s.children) as Record<string, unknown>);
      const softwareApp = jsonLdBlocks.find((b) => b['@type'] === 'SoftwareApplication');
      expect(softwareApp?.offers).toMatchObject({ price: '0', priceCurrency: 'EUR' });

      const faqLd = jsonLdBlocks.find((b) => b['@type'] === 'FAQPage') as
        | { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }
        | undefined;
      expect(faqLd?.mainEntity).toHaveLength(faq.length);

      faqDetails.forEach((match, idx) => {
        const block = match[1];
        const summaryMatch = block.match(/<summary>([\s\S]*?)<\/summary>/);
        const bodyMatch = block.match(/<p class="mka-faq-body">([\s\S]*?)<\/p>/);
        const visibleQuestion = stripTags(summaryMatch?.[1] ?? '').replace(/^\d+\s*/, '').replace(/\s*\+$/, '');
        const visibleAnswer = stripTags(bodyMatch?.[1] ?? '');

        expect(visibleQuestion).toBe(faqLd?.mainEntity[idx].name);
        expect(visibleAnswer).toBe(faqLd?.mainEntity[idx].acceptedAnswer.text);
      });

      // Home proof tabs and screenshot attributes
      if (isHome) {
        expect(html).toContain('role="tablist"');
        expect(html).toContain('role="tab"');
        expect(html).toContain('role="tabpanel"');
        expect(html).toContain('src="/shots/import-preview.png"');
        expect(html).toContain('src="/shots/import-mapping.png"');
        expect(html).toContain('width="1440" height="800" loading="lazy"');
      }

      // Every internal link points to a known marketing route (or anchor) and IT links stay under /it/
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      for (const href of hrefs) {
        if (href.startsWith('https://') || href.startsWith('#')) continue;
        const basePath = href.split('#')[0];
        expect(knownMarketingPaths.has(basePath)).toBe(true);
        if (locale === 'it' && basePath !== altPath) {
          expect(basePath.startsWith('/it/')).toBe(true);
        }
      }
    },
  );

  test.each(pages)('$name routes primary CTAs to /app when logged in', ({ Component }) => {
    const html = renderToStaticMarkup(React.createElement(Component, { auth: loggedInAuth }));
    expect(html).toContain('href="/app"');
    expect(html).not.toContain(`href="${loggedInAuth.signUpUrl}"`);
    expect(html).not.toContain(`href="${loggedInAuth.signInUrl}"`);
  });
});
