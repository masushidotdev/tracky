// @vitest-environment node
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { marketingPages } from './pages';
import { Route as AiAnalystEnRoute, AiAnalystEnView, aiAnalystEnFaq } from '@/routes/features/ai-analyst';
import {
  Route as BankConnectionsEnRoute,
  BankConnectionsEnView,
  bankConnectionsEnFaq,
} from '@/routes/features/bank-connections';
import { Route as CashFlowEnRoute, CashFlowEnView, cashFlowEnFaq } from '@/routes/features/cash-flow';
import { Route as ReportsEnRoute, ReportsEnView, reportsEnFaq } from '@/routes/features/reports';
import {
  Route as ZeroBasedPlanEnRoute,
  ZeroBasedPlanEnView,
  zeroBasedPlanEnFaq,
} from '@/routes/features/zero-based-plan';
import {
  Route as GuideSubscriptionsEnRoute,
  GuideSubscriptionsEnView,
  guideSubscriptionsEnFaq,
} from '@/routes/guides/cancel-unused-subscriptions';
import {
  Route as GuideCashFlowEnRoute,
  GuideCashFlowEnView,
  guideCashFlowEnFaq,
} from '@/routes/guides/cash-flow-forecast';
import {
  Route as GuideZeroBasedEnRoute,
  GuideZeroBasedEnView,
  guideZeroBasedEnFaq,
} from '@/routes/guides/zero-based-budgeting';
import { Route as AiAnalystItRoute, AiAnalystItView, aiAnalystItFaq } from '@/routes/it/funzioni/analyst-ai';
import {
  Route as BankConnectionsItRoute,
  BankConnectionsItView,
  bankConnectionsItFaq,
} from '@/routes/it/funzioni/collegamento-bancario';
import { Route as CashFlowItRoute, CashFlowItView, cashFlowItFaq } from '@/routes/it/funzioni/flusso-di-cassa';
import {
  Route as ZeroBasedPlanItRoute,
  ZeroBasedPlanItView,
  zeroBasedPlanItFaq,
} from '@/routes/it/funzioni/piano-zero-based';
import { Route as ReportsItRoute, ReportsItView, reportsItFaq } from '@/routes/it/funzioni/report';
import {
  Route as GuideZeroBasedItRoute,
  GuideZeroBasedItView,
  guideZeroBasedItFaq,
} from '@/routes/it/guide/budget-zero-based';
import {
  Route as GuideSubscriptionsItRoute,
  GuideSubscriptionsItView,
  guideSubscriptionsItFaq,
} from '@/routes/it/guide/cancella-abbonamenti-inutili';
import {
  Route as GuideCashFlowItRoute,
  GuideCashFlowItView,
  guideCashFlowItFaq,
} from '@/routes/it/guide/previsione-flusso-di-cassa';

const loggedOutAuth = {
  user: null,
  signInUrl: 'https://auth.trytracky.app/sign-in',
  signUpUrl: 'https://auth.trytracky.app/sign-up',
};

const loggedInAuth = {
  user: { id: 'user_test_b2' },
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

const forbiddenCopyPatterns = [
  /90\s*days/i,
  /90\s*giorni/i,
  /5\s*minut/i,
  /20\s*minut/i,
  /runs every 6 hours/i,
  /33 transactions imported/i,
  /33 movimenti importati/i,
  /import-summary\.png/i,
];

const forbiddenLegacyMarkers = [/\bmk-marquee\b/, /\bvivi\b/i, /\bmk-final\b/, /\bmk-duel\b/, /\bmk-badge\b/];

const b2Pages = [
  {
    name: 'EN Feature: Zero-based Plan',
    kind: 'feature' as const,
    locale: 'en' as const,
    path: '/features/zero-based-plan',
    altPath: '/it/funzioni/piano-zero-based',
    altLang: 'it',
    loggedInTarget: '/app/plan',
    Component: ZeroBasedPlanEnView,
    Route: ZeroBasedPlanEnRoute,
    faq: zeroBasedPlanEnFaq,
  },
  {
    name: 'IT Feature: Piano zero-based',
    kind: 'feature' as const,
    locale: 'it' as const,
    path: '/it/funzioni/piano-zero-based',
    altPath: '/features/zero-based-plan',
    altLang: 'en',
    loggedInTarget: '/app/plan',
    Component: ZeroBasedPlanItView,
    Route: ZeroBasedPlanItRoute,
    faq: zeroBasedPlanItFaq,
  },
  {
    name: 'EN Feature: Cash Flow',
    kind: 'feature' as const,
    locale: 'en' as const,
    path: '/features/cash-flow',
    altPath: '/it/funzioni/flusso-di-cassa',
    altLang: 'it',
    loggedInTarget: '/app/planning',
    Component: CashFlowEnView,
    Route: CashFlowEnRoute,
    faq: cashFlowEnFaq,
  },
  {
    name: 'IT Feature: Flusso di cassa',
    kind: 'feature' as const,
    locale: 'it' as const,
    path: '/it/funzioni/flusso-di-cassa',
    altPath: '/features/cash-flow',
    altLang: 'en',
    loggedInTarget: '/app/planning',
    Component: CashFlowItView,
    Route: CashFlowItRoute,
    faq: cashFlowItFaq,
  },
  {
    name: 'EN Feature: Bank Connections',
    kind: 'feature' as const,
    locale: 'en' as const,
    path: '/features/bank-connections',
    altPath: '/it/funzioni/collegamento-bancario',
    altLang: 'it',
    loggedInTarget: '/app',
    Component: BankConnectionsEnView,
    Route: BankConnectionsEnRoute,
    faq: bankConnectionsEnFaq,
  },
  {
    name: 'IT Feature: Collegamento bancario',
    kind: 'feature' as const,
    locale: 'it' as const,
    path: '/it/funzioni/collegamento-bancario',
    altPath: '/features/bank-connections',
    altLang: 'en',
    loggedInTarget: '/app',
    Component: BankConnectionsItView,
    Route: BankConnectionsItRoute,
    faq: bankConnectionsItFaq,
  },
  {
    name: 'EN Feature: Reports',
    kind: 'feature' as const,
    locale: 'en' as const,
    path: '/features/reports',
    altPath: '/it/funzioni/report',
    altLang: 'it',
    loggedInTarget: '/app/reports',
    Component: ReportsEnView,
    Route: ReportsEnRoute,
    faq: reportsEnFaq,
  },
  {
    name: 'IT Feature: Report',
    kind: 'feature' as const,
    locale: 'it' as const,
    path: '/it/funzioni/report',
    altPath: '/features/reports',
    altLang: 'en',
    loggedInTarget: '/app/reports',
    Component: ReportsItView,
    Route: ReportsItRoute,
    faq: reportsItFaq,
  },
  {
    name: 'EN Feature: AI Analyst',
    kind: 'feature' as const,
    locale: 'en' as const,
    path: '/features/ai-analyst',
    altPath: '/it/funzioni/analyst-ai',
    altLang: 'it',
    loggedInTarget: '/app',
    Component: AiAnalystEnView,
    Route: AiAnalystEnRoute,
    faq: aiAnalystEnFaq,
  },
  {
    name: 'IT Feature: Analyst AI',
    kind: 'feature' as const,
    locale: 'it' as const,
    path: '/it/funzioni/analyst-ai',
    altPath: '/features/ai-analyst',
    altLang: 'en',
    loggedInTarget: '/app',
    Component: AiAnalystItView,
    Route: AiAnalystItRoute,
    faq: aiAnalystItFaq,
  },
  {
    name: 'EN Guide: Zero-based budgeting',
    kind: 'guide' as const,
    locale: 'en' as const,
    path: '/guides/zero-based-budgeting',
    altPath: '/it/guide/budget-zero-based',
    altLang: 'it',
    loggedInTarget: '/app/plan',
    Component: GuideZeroBasedEnView,
    Route: GuideZeroBasedEnRoute,
    faq: guideZeroBasedEnFaq,
  },
  {
    name: 'IT Guide: Budget zero-based',
    kind: 'guide' as const,
    locale: 'it' as const,
    path: '/it/guide/budget-zero-based',
    altPath: '/guides/zero-based-budgeting',
    altLang: 'en',
    loggedInTarget: '/app/plan',
    Component: GuideZeroBasedItView,
    Route: GuideZeroBasedItRoute,
    faq: guideZeroBasedItFaq,
  },
  {
    name: 'EN Guide: Cash-flow forecast',
    kind: 'guide' as const,
    locale: 'en' as const,
    path: '/guides/cash-flow-forecast',
    altPath: '/it/guide/previsione-flusso-di-cassa',
    altLang: 'it',
    loggedInTarget: '/app/planning',
    Component: GuideCashFlowEnView,
    Route: GuideCashFlowEnRoute,
    faq: guideCashFlowEnFaq,
  },
  {
    name: 'IT Guide: Previsione flusso di cassa',
    kind: 'guide' as const,
    locale: 'it' as const,
    path: '/it/guide/previsione-flusso-di-cassa',
    altPath: '/guides/cash-flow-forecast',
    altLang: 'en',
    loggedInTarget: '/app/planning',
    Component: GuideCashFlowItView,
    Route: GuideCashFlowItRoute,
    faq: guideCashFlowItFaq,
  },
  {
    name: 'EN Guide: Cancel unused subscriptions',
    kind: 'guide' as const,
    locale: 'en' as const,
    path: '/guides/cancel-unused-subscriptions',
    altPath: '/it/guide/cancella-abbonamenti-inutili',
    altLang: 'it',
    loggedInTarget: '/app',
    Component: GuideSubscriptionsEnView,
    Route: GuideSubscriptionsEnRoute,
    faq: guideSubscriptionsEnFaq,
  },
  {
    name: 'IT Guide: Cancella abbonamenti inutili',
    kind: 'guide' as const,
    locale: 'it' as const,
    path: '/it/guide/cancella-abbonamenti-inutili',
    altPath: '/guides/cancel-unused-subscriptions',
    altLang: 'en',
    loggedInTarget: '/app',
    Component: GuideSubscriptionsItView,
    Route: GuideSubscriptionsItRoute,
    faq: guideSubscriptionsItFaq,
  },
];

describe('Phase B2 Atelier pages (5 Features + 3 Guides EN/IT)', () => {
  test.each(b2Pages)(
    '$name renders Atelier layout, one h1, honest copy, matching FAQ JSON-LD, and valid locale links (logged out)',
    ({ Component, Route, faq, kind, locale, altPath, altLang }) => {
      const html = renderToStaticMarkup(React.createElement(Component, { auth: loggedOutAuth }));

      // Atelier root & landmarks
      expect(html.startsWith('<div class="mka">')).toBe(true);
      expect(html).toContain('<header class="mka-header">');
      expect(html).toContain('<main id="main">');
      expect(html).toContain('<footer class="mka-footer">');

      // Exactly one <h1>
      const h1Matches = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) ?? [];
      expect(h1Matches).toHaveLength(1);

      // No forbidden untruthful copy or legacy Vivi markers
      for (const pattern of forbiddenCopyPatterns) {
        expect(html).not.toMatch(pattern);
      }
      for (const marker of forbiddenLegacyMarkers) {
        expect(html).not.toMatch(marker);
      }

      // Language switch targets exact alternate path
      expect(html).toContain(`href="${altPath}" lang="${altLang}"`);

      // Logged-out auth links
      expect(html).toContain(`href="${loggedOutAuth.signUpUrl}"`);
      expect(html).toContain(`href="${loggedOutAuth.signInUrl}"`);
      expect(html).not.toMatch(/href="\/app(?:\/|")/);

      // Images have width, height, alt, and lazy loading
      const imgTags = html.match(/<img\b[^>]*>/g) ?? [];
      for (const img of imgTags) {
        expect(img).toMatch(/\bwidth="\d+"/);
        expect(img).toMatch(/\bheight="\d+"/);
        expect(img).toMatch(/\balt="[^"]+"/);
        expect(img).toMatch(/\bloading="lazy"/);
      }

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
      const softwareApp = jsonLdBlocks.find((b) => b['@type'] === 'SoftwareApplication');
      expect(softwareApp?.offers).toMatchObject({ price: '0', priceCurrency: 'EUR' });

      const breadcrumb = jsonLdBlocks.find((b) => b['@type'] === 'BreadcrumbList');
      expect(breadcrumb).toBeTruthy();

      // Visible FAQ matches JSON-LD 1:1
      const faqDetails = [...html.matchAll(/<details class="mka-faq-card"[^>]*>([\s\S]*?)<\/details>/g)];
      expect(faqDetails).toHaveLength(faq.length);

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

      // Guides carry HowTo JSON-LD + visible step list + "How Tracky helps" section
      if (kind === 'guide') {
        const howTo = jsonLdBlocks.find((b) => b['@type'] === 'HowTo') as
          | { step: Array<{ name: string; text: string }> }
          | undefined;
        expect(howTo?.step).toHaveLength(5);
        expect(html).toContain('id="how-tracky-helps"');
      }

      // Feature pages explicitly show availability band
      if (kind === 'feature') {
        expect(html).toContain('class="mka-b2-availability"');
      }

      // Internal link hygiene: known routes only, and IT pages never link to EN-only routes
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      for (const href of hrefs) {
        if (href.startsWith('https://') || href.startsWith('#')) continue;
        const basePath = href.split('#')[0];
        if (basePath.startsWith('/shots/')) continue;
        expect(knownMarketingPaths.has(basePath)).toBe(true);
        if (locale === 'it' && basePath !== altPath) {
          expect(basePath.startsWith('/it/')).toBe(true);
        }
      }
    },
  );

  test.each(b2Pages)('$name routes app CTAs cleanly when logged in', ({ Component, loggedInTarget, locale, altPath }) => {
    const html = renderToStaticMarkup(React.createElement(Component, { auth: loggedInAuth }));
    expect(html).toContain(`href="${loggedInTarget}"`);
    expect(html).not.toContain(`href="${loggedInAuth.signUpUrl}"`);
    expect(html).not.toContain(`href="${loggedInAuth.signInUrl}"`);

    if (locale === 'it') {
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      for (const href of hrefs) {
        if (!href.startsWith('/')) continue;
        const basePath = href.split('#')[0];
        if (basePath === altPath || basePath.startsWith('/app') || basePath.startsWith('/shots/')) continue;
        expect(basePath.startsWith('/it/')).toBe(true);
      }
    }
  });
});
