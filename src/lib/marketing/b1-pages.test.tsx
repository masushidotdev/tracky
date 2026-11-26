// @vitest-environment jsdom
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { marketingPages } from './pages';
import { extractVisibleText } from './test-html';
import { Route as FaqEnRoute, FaqEnView, faqEnItems } from '@/routes/faq';
import { Route as FaqItRoute, FaqItView, faqItItems } from '@/routes/it/domande-frequenti';
import { Route as OpenSourceEnRoute, OpenSourceEnView, openSourceEnFaq } from '@/routes/open-source';
import { Route as OpenSourceItRoute, OpenSourceItView, openSourceItFaq } from '@/routes/it/open-source';
import { Route as VsEnRoute, VsSpreadsheetsEnView, vsSpreadsheetsEnFaq } from '@/routes/vs-spreadsheets';
import { Route as VsItRoute, VsSpreadsheetsItView, vsSpreadsheetsItFaq } from '@/routes/it/vs-fogli-di-calcolo';
import { Route as CouplesEnRoute, CouplesEnView, couplesEnFaq } from '@/routes/for-couples-and-families';
import { Route as CouplesItRoute, CouplesItView, couplesItFaq } from '@/routes/it/per-coppie-e-famiglie';
import { Route as FreelancersEnRoute, FreelancersEnView, freelancersEnFaq } from '@/routes/for-freelancers';
import { Route as FreelancersItRoute, FreelancersItView, freelancersItFaq } from '@/routes/it/per-freelance-e-partita-iva';
import { Route as ReleaseV010EnRoute, ReleaseV010EnView, releaseV010EnFaq } from '@/routes/blog/tracky-v0-1-0';
import { Route as ReleaseV010ItRoute, ReleaseV010ItView, releaseV010ItFaq } from '@/routes/it/blog/tracky-v0-1-0';
import {
  Route as DockerEnRoute,
  SelfHostingDockerEnView,
  selfHostingDockerEnFaq,
} from '@/routes/blog/self-hosting-tracky-docker';
import {
  Route as DockerItRoute,
  SelfHostingDockerItView,
  selfHostingDockerItFaq,
} from '@/routes/it/blog/self-hosting-tracky-docker';

const loggedOutAuth = {
  user: null,
  signInUrl: 'https://auth.trytracky.app/sign-in',
  signUpUrl: 'https://auth.trytracky.app/sign-up',
};

const loggedInAuth = {
  user: { id: 'user_test_b1' },
  signInUrl: 'https://auth.trytracky.app/sign-in',
  signUpUrl: 'https://auth.trytracky.app/sign-up',
};

const knownMarketingPaths = new Set(marketingPages.flatMap((page) => [page.en, page.it]));

const forbiddenCopyPatterns = [
  /90\s*days/i,
  /90\s*giorni/i,
  /5\s*minut/i,
  /20\s*minut/i,
  /runs every 6 hours/i,
  /import-summary\.png/i,
  /33 transactions imported/i,
  /33 movimenti importati/i,
];

const forbiddenLegacyMarkers = [/mk-marquee/i, /\bvivi\b/i, /mk-final/i, /mk-duel/i, /mk-band/i];

const b1Pages = [
  {
    name: 'EN FAQ',
    locale: 'en' as const,
    path: '/faq',
    altPath: '/it/domande-frequenti',
    altLang: 'it',
    Component: FaqEnView,
    Route: FaqEnRoute,
    faq: faqEnItems,
    blogDate: null,
  },
  {
    name: 'IT FAQ',
    locale: 'it' as const,
    path: '/it/domande-frequenti',
    altPath: '/faq',
    altLang: 'en',
    Component: FaqItView,
    Route: FaqItRoute,
    faq: faqItItems,
    blogDate: null,
  },
  {
    name: 'EN Open Source',
    locale: 'en' as const,
    path: '/open-source',
    altPath: '/it/open-source',
    altLang: 'it',
    Component: OpenSourceEnView,
    Route: OpenSourceEnRoute,
    faq: openSourceEnFaq,
    blogDate: null,
  },
  {
    name: 'IT Open Source',
    locale: 'it' as const,
    path: '/it/open-source',
    altPath: '/open-source',
    altLang: 'en',
    Component: OpenSourceItView,
    Route: OpenSourceItRoute,
    faq: openSourceItFaq,
    blogDate: null,
  },
  {
    name: 'EN Vs Spreadsheets',
    locale: 'en' as const,
    path: '/vs-spreadsheets',
    altPath: '/it/vs-fogli-di-calcolo',
    altLang: 'it',
    Component: VsSpreadsheetsEnView,
    Route: VsEnRoute,
    faq: vsSpreadsheetsEnFaq,
    blogDate: null,
  },
  {
    name: 'IT Vs Spreadsheets',
    locale: 'it' as const,
    path: '/it/vs-fogli-di-calcolo',
    altPath: '/vs-spreadsheets',
    altLang: 'en',
    Component: VsSpreadsheetsItView,
    Route: VsItRoute,
    faq: vsSpreadsheetsItFaq,
    blogDate: null,
  },
  {
    name: 'EN For Couples & Families',
    locale: 'en' as const,
    path: '/for-couples-and-families',
    altPath: '/it/per-coppie-e-famiglie',
    altLang: 'it',
    Component: CouplesEnView,
    Route: CouplesEnRoute,
    faq: couplesEnFaq,
    blogDate: null,
  },
  {
    name: 'IT For Couples & Families',
    locale: 'it' as const,
    path: '/it/per-coppie-e-famiglie',
    altPath: '/for-couples-and-families',
    altLang: 'en',
    Component: CouplesItView,
    Route: CouplesItRoute,
    faq: couplesItFaq,
    blogDate: null,
  },
  {
    name: 'EN For Freelancers',
    locale: 'en' as const,
    path: '/for-freelancers',
    altPath: '/it/per-freelance-e-partita-iva',
    altLang: 'it',
    Component: FreelancersEnView,
    Route: FreelancersEnRoute,
    faq: freelancersEnFaq,
    blogDate: null,
  },
  {
    name: 'IT For Freelancers',
    locale: 'it' as const,
    path: '/it/per-freelance-e-partita-iva',
    altPath: '/for-freelancers',
    altLang: 'en',
    Component: FreelancersItView,
    Route: FreelancersItRoute,
    faq: freelancersItFaq,
    blogDate: null,
  },
  {
    name: 'EN Blog v0.1.0',
    locale: 'en' as const,
    path: '/blog/tracky-v0-1-0',
    altPath: '/it/blog/tracky-v0-1-0',
    altLang: 'it',
    Component: ReleaseV010EnView,
    Route: ReleaseV010EnRoute,
    faq: releaseV010EnFaq,
    blogDate: '2026-11-24',
  },
  {
    name: 'IT Blog v0.1.0',
    locale: 'it' as const,
    path: '/it/blog/tracky-v0-1-0',
    altPath: '/blog/tracky-v0-1-0',
    altLang: 'en',
    Component: ReleaseV010ItView,
    Route: ReleaseV010ItRoute,
    faq: releaseV010ItFaq,
    blogDate: '2026-11-24',
  },
  {
    name: 'EN Blog Self-hosting Docker',
    locale: 'en' as const,
    path: '/blog/self-hosting-tracky-docker',
    altPath: '/it/blog/self-hosting-tracky-docker',
    altLang: 'it',
    Component: SelfHostingDockerEnView,
    Route: DockerEnRoute,
    faq: selfHostingDockerEnFaq,
    blogDate: '2026-11-26',
  },
  {
    name: 'IT Blog Self-hosting Docker',
    locale: 'it' as const,
    path: '/it/blog/self-hosting-tracky-docker',
    altPath: '/blog/self-hosting-tracky-docker',
    altLang: 'en',
    Component: SelfHostingDockerItView,
    Route: DockerItRoute,
    faq: selfHostingDockerItFaq,
    blogDate: '2026-11-26',
  },
];

describe('Atelier Phase b1 marketing pages (14 routes EN/IT)', () => {
  test.each(b1Pages)(
    '$name renders Atelier landmarks, one h1, clean copy, no Vivi markers, valid links, and 1:1 FAQ JSON-LD (logged-out)',
    ({ Component, Route, faq, locale, altPath, altLang, blogDate }) => {
      const html = renderToStaticMarkup(React.createElement(Component, { auth: loggedOutAuth }));

      // Atelier root & landmarks
      expect(html.startsWith('<div class="mka">')).toBe(true);
      expect(html).toContain('<header class="mka-header">');
      expect(html).toContain('<main id="main">');
      expect(html).toContain('<footer class="mka-footer">');

      // Exactly one <h1>
      const h1Matches = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) ?? [];
      expect(h1Matches).toHaveLength(1);

      // No forbidden untruthful claims
      for (const pattern of forbiddenCopyPatterns) {
        expect(html).not.toMatch(pattern);
      }

      // No legacy Vivi markers
      for (const marker of forbiddenLegacyMarkers) {
        expect(html).not.toMatch(marker);
      }

      // Language switch matches counterpart route
      expect(html).toContain(`href="${altPath}" lang="${altLang}"`);

      // Logged-out auth CTA routing
      expect(html).toContain(`href="${loggedOutAuth.signUpUrl}"`);
      expect(html).toContain(`href="${loggedOutAuth.signInUrl}"`);
      expect(html).not.toContain('href="/app"');

      // Head metadata & JSON-LD checks
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
      const faqLd = jsonLdBlocks.find((b) => b['@type'] === 'FAQPage') as
        | { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }
        | undefined;
      expect(faqLd?.mainEntity).toHaveLength(faq.length);

      const faqDetails = [...html.matchAll(/<details class="mka-faq-card"[^>]*>([\s\S]*?)<\/details>/g)];
      expect(faqDetails).toHaveLength(faq.length);

      faqDetails.forEach((match, idx) => {
        const block = match[1];
        const summaryMatch = block.match(/<summary>([\s\S]*?)<\/summary>/);
        const bodyMatch = block.match(/<p class="mka-faq-body">([\s\S]*?)<\/p>/);
        const visibleQuestion = extractVisibleText(summaryMatch?.[1] ?? '')
          .replace(/^\d+\s*/, '')
          .replace(/\s*\+$/, '');
        const visibleAnswer = extractVisibleText(bodyMatch?.[1] ?? '');

        expect(visibleQuestion).toBe(faqLd?.mainEntity[idx].name);
        expect(visibleAnswer).toBe(faqLd?.mainEntity[idx].acceptedAnswer.text);
      });

      if (blogDate) {
        const blogLd = jsonLdBlocks.find((b) => b['@type'] === 'BlogPosting');
        expect(blogLd?.datePublished).toBe(blogDate);
      }

      // Internal link hygiene: every relative href belongs to known routes (or /app); IT links stay under /it
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      for (const href of hrefs) {
        if (href.startsWith('https://') || href.startsWith('#')) continue;
        const basePath = href.split('#')[0];
        expect(knownMarketingPaths.has(basePath) || basePath === '/app').toBe(true);
        if (locale === 'it' && basePath !== altPath && basePath !== '/app') {
          expect(basePath.startsWith('/it')).toBe(true);
        }
      }
    },
  );

  test.each(b1Pages)('$name routes primary CTAs to /app when logged in', ({ Component }) => {
    const html = renderToStaticMarkup(React.createElement(Component, { auth: loggedInAuth }));
    expect(html).toContain('href="/app"');
    expect(html).not.toContain(`href="${loggedInAuth.signUpUrl}"`);
    expect(html).not.toContain(`href="${loggedInAuth.signInUrl}"`);

    // Exactly one <h1> in logged-in render as well
    const h1Matches = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) ?? [];
    expect(h1Matches).toHaveLength(1);
  });
});
