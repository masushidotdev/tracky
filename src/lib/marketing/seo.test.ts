import { describe, expect, test } from 'vitest';

import { marketingPages } from './pages';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from './seo';

describe('marketing pages registry', () => {
  test('every page has EN and IT paths, IT under /it/', () => {
    for (const page of marketingPages) {
      expect(page.en.startsWith('/')).toBe(true);
      expect(page.it.startsWith('/it/')).toBe(true);
    }
  });

  test('no path collides with the authenticated app', () => {
    for (const page of marketingPages) {
      expect(page.en.startsWith('/app')).toBe(false);
      expect(page.it.startsWith('/app')).toBe(false);
    }
  });

  test('keys and paths are unique', () => {
    const keys = marketingPages.map((page) => page.key);
    const paths = marketingPages.flatMap((page) => [page.en, page.it]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test('inventory covers 15 pages (30 URLs)', () => {
    expect(marketingPages).toHaveLength(15);
  });
});

describe('buildMarketingHead', () => {
  const base = {
    title: 'Tracky — Free open-source budget planner',
    description: 'Tracky is a free, MIT-licensed budget planner with a zero-based plan and cash-flow forecast.',
    locale: 'en' as const,
    path: '/pricing',
    ogImage: 'https://www.trytracky.app/og/og-pricing.png',
    jsonLd: [softwareAppJsonLd({ url: 'https://www.trytracky.app/pricing', inLanguage: ['en', 'it'] })],
  };

  test('emits canonical + hreflang triple with x-default on EN', () => {
    const head = buildMarketingHead(base);
    expect(head.links).toContainEqual({ rel: 'canonical', href: 'https://www.trytracky.app/pricing' });
    expect(head.links).toContainEqual({ rel: 'alternate', hrefLang: 'en', href: 'https://www.trytracky.app/pricing' });
    expect(head.links).toContainEqual({ rel: 'alternate', hrefLang: 'it', href: 'https://www.trytracky.app/it/prezzi' });
    expect(head.links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'x-default',
      href: 'https://www.trytracky.app/pricing',
    });
  });

  test('IT path resolves the same hreflang pair', () => {
    const head = buildMarketingHead({ ...base, locale: 'it', path: '/it/prezzi' });
    expect(head.links).toContainEqual({ rel: 'canonical', href: 'https://www.trytracky.app/it/prezzi' });
    expect(head.links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'x-default',
      href: 'https://www.trytracky.app/pricing',
    });
    const ogLocale = head.meta.find((entry) => entry.property === 'og:locale');
    expect(ogLocale).toMatchObject({ content: 'it_IT' });
  });

  test('emits OG/Twitter tags', () => {
    const head = buildMarketingHead(base);
    expect(head.meta).toContainEqual({ property: 'og:type', content: 'website' });
    expect(head.meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' });
  });

  test('SoftwareApplication block carries no fake ratings', () => {
    const block = softwareAppJsonLd({ url: 'https://www.trytracky.app/', inLanguage: ['en', 'it'] });
    expect(block).not.toHaveProperty('aggregateRating');
    expect(block).not.toHaveProperty('review');
    expect(block.offers).toMatchObject({ price: '0', priceCurrency: 'EUR' });
  });

  test('FAQ and breadcrumb helpers shape valid blocks', () => {
    const faq = faqJsonLd([{ question: 'Is Tracky free?', answer: 'Yes.' }]);
    expect(faq['@type']).toBe('FAQPage');
    const crumbs = breadcrumbJsonLd([{ name: 'Home', path: '/' }]);
    expect(crumbs['@type']).toBe('BreadcrumbList');
  });

  test('OG image per-page mapping', () => {
    expect(ogImageFor('home')).toContain('og-home.png');
    expect(ogImageFor('pricing')).toContain('og-pricing.png');
    expect(ogImageFor('feature-plan')).toContain('og-feature-plan.png');
    expect(ogImageFor('faq')).toContain('og-faq.png');
    expect(ogImageFor('unknown-key')).toContain('og-default.png');
  });
});
