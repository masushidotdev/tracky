import { SITE_ORIGIN, alternateFor } from './pages';

import type { AppLocale } from '@/lib/i18n';

export type MarketingHead = {
  title: string;
  description: string;
  locale: AppLocale;
  /** absolute path of this page, e.g. `/it/prezzi` */
  path: string;
  /** absolute OG image URL (already absolute) */
  ogImage: string;
  /** JSON-LD blocks to inject */
  jsonLd: Array<Record<string, unknown>>;
};

/**
 * Builds the head() payload shared by every marketing route:
 * canonical, hreflang triple (en/it/x-default→EN), OG/Twitter, JSON-LD.
 */
export function buildMarketingHead(input: MarketingHead) {
  const canonical = `${SITE_ORIGIN}${input.path}`;
  const alternates = alternateFor(input.path);
  const enHref = `${SITE_ORIGIN}${alternates?.en ?? input.path}`;
  const itHref = `${SITE_ORIGIN}${alternates?.it ?? input.path}`;
  const ogLocale = input.locale === 'it' ? 'it_IT' : 'en_US';
  const ogLocaleAlternate = input.locale === 'it' ? 'en_US' : 'it_IT';

  return {
    meta: [
      { title: input.title },
      { name: 'description', content: input.description },
      { name: 'robots', content: 'index, follow' },
      { property: 'og:title', content: input.title },
      { property: 'og:description', content: input.description },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: canonical },
      { property: 'og:image', content: input.ogImage },
      { property: 'og:locale', content: ogLocale },
      { property: 'og:locale:alternate', content: ogLocaleAlternate },
      { property: 'og:site_name', content: 'Tracky' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: input.title },
      { name: 'twitter:description', content: input.description },
      { name: 'twitter:image', content: input.ogImage },
    ],
    links: [
      { rel: 'canonical', href: canonical },
      { rel: 'alternate', hrefLang: 'en', href: enHref },
      { rel: 'alternate', hrefLang: 'it', href: itHref },
      { rel: 'alternate', hrefLang: 'x-default', href: enHref },
    ],
    scripts: input.jsonLd.map((block) => ({
      type: 'application/ld+json',
      children: JSON.stringify(block),
    })),
  };
}

/** Base SoftwareApplication block — no ratings, no fake proof. */
export function softwareAppJsonLd(args: { url: string; inLanguage: Array<'en' | 'it'> }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Tracky',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: args.url,
    license: 'https://github.com/masushidotdev/tracky/blob/main/LICENSE',
    author: { '@type': 'Organization', name: 'Tracky contributors' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    inLanguage: args.inLanguage,
  };
}

export function faqJsonLd(qa: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_ORIGIN}${item.path}`,
    })),
  };
}

export function ogImageFor(key: string): string {
  if (key === 'pricing') return `${SITE_ORIGIN}/og/og-pricing.png`;
  if (key === 'home') return `${SITE_ORIGIN}/og/og-home.png`;
  return `${SITE_ORIGIN}/og/og-default.png`;
}
