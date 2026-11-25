// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import { marketingPages } from './pages';
import {
  blogPostingJsonLd,
  breadcrumbJsonLd,
  buildMarketingHead,
  faqJsonLd,
  ogImageFor,
  softwareAppJsonLd,
} from './seo';

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

  test('inventory covers 16 pages (32 URLs)', () => {
    expect(marketingPages).toHaveLength(16);
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

  test('FAQ, breadcrumb, and BlogPosting helpers shape valid blocks', () => {
    const faq = faqJsonLd([{ question: 'Is Tracky free?', answer: 'Yes.' }]);
    expect(faq['@type']).toBe('FAQPage');
    const crumbs = breadcrumbJsonLd([{ name: 'Home', path: '/' }]);
    expect(crumbs['@type']).toBe('BreadcrumbList');
    const post = blogPostingJsonLd({
      headline: 'Tracky v0.1.0',
      description: 'First public tagged release.',
      url: 'https://www.trytracky.app/blog/tracky-v0-1-0',
      image: ogImageFor('blog-v0-1-0'),
      datePublished: '2026-11-24',
      dateModified: '2026-11-24',
      inLanguage: 'en',
    });
    expect(post['@type']).toBe('BlogPosting');
    expect(post.datePublished).toBe('2026-11-24');
    expect(post.dateModified).toBe('2026-11-24');
    expect(post.author).toEqual({ '@type': 'Organization', name: 'Tracky contributors' });
  });

  test('blog release route resolves bilingual hreflang pair', () => {
    const head = buildMarketingHead({
      ...base,
      path: '/blog/tracky-v0-1-0',
      ogImage: ogImageFor('blog-v0-1-0'),
    });
    expect(head.links).toContainEqual({ rel: 'canonical', href: 'https://www.trytracky.app/blog/tracky-v0-1-0' });
    expect(head.links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'en',
      href: 'https://www.trytracky.app/blog/tracky-v0-1-0',
    });
    expect(head.links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'it',
      href: 'https://www.trytracky.app/it/blog/tracky-v0-1-0',
    });
    expect(head.links).toContainEqual({
      rel: 'alternate',
      hrefLang: 'x-default',
      href: 'https://www.trytracky.app/blog/tracky-v0-1-0',
    });
  });

  test('blog release routes (EN and IT) use dedicated og-blog-v0-1-0.png and file exists', () => {
    const blogOgImage = ogImageFor('blog-v0-1-0');
    expect(blogOgImage).toBe('https://www.trytracky.app/og/og-blog-v0-1-0.png');
    expect(blogOgImage).not.toContain('og-open-source.png');
    expect(existsSync(join(process.cwd(), 'public', 'og', 'og-blog-v0-1-0.png'))).toBe(true);

    for (const variant of [
      { locale: 'en' as const, path: '/blog/tracky-v0-1-0' },
      { locale: 'it' as const, path: '/it/blog/tracky-v0-1-0' },
    ]) {
      const url = `https://www.trytracky.app${variant.path}`;
      const head = buildMarketingHead({
        ...base,
        locale: variant.locale,
        path: variant.path,
        ogImage: blogOgImage,
        jsonLd: [
          blogPostingJsonLd({
            headline: 'Tracky v0.1.0',
            description: 'First public tagged release.',
            url,
            image: blogOgImage,
            datePublished: '2026-11-24',
            dateModified: '2026-11-24',
            inLanguage: variant.locale,
          }),
        ],
      });
      expect(head.meta).toContainEqual({ property: 'og:image', content: blogOgImage });
      expect(head.meta).toContainEqual({ name: 'twitter:image', content: blogOgImage });
      expect(JSON.parse(head.scripts[0].children)).toMatchObject({
        '@type': 'BlogPosting',
        image: blogOgImage,
      });
    }
  });

  test('OG image per-page mapping', () => {
    expect(ogImageFor('home')).toContain('og-home.png');
    expect(ogImageFor('pricing')).toContain('og-pricing.png');
    expect(ogImageFor('feature-plan')).toContain('og-feature-plan.png');
    expect(ogImageFor('faq')).toContain('og-faq.png');
    expect(ogImageFor('blog-v0-1-0')).toContain('og-blog-v0-1-0.png');
    expect(ogImageFor('blog-v0-1-0')).not.toContain('og-open-source.png');
    expect(ogImageFor('unknown-key')).toContain('og-default.png');
  });
});
