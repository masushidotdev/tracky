/**
 * Central registry of public marketing pages.
 * Every entry needs both an EN and an IT path. The sitemap route,
 * hreflang builder, nav/footer and tests all consume this list.
 */
export type MarketingPage = {
  /** stable key, used for OG image lookup and tests */
  key: string;
  /** absolute EN path, e.g. `/pricing` */
  en: string;
  /** absolute IT path, e.g. `/it/prezzi` */
  it: string;
  /** sitemap priority 0..1 */
  priority: number;
  /** sitemap changefreq */
  changefreq: 'weekly' | 'monthly';
};

export const SITE_ORIGIN = 'https://www.trytracky.app';

export const marketingPages: Array<MarketingPage> = [
  { key: 'home', en: '/', it: '/it/', priority: 1.0, changefreq: 'weekly' },
  { key: 'pricing', en: '/pricing', it: '/it/prezzi', priority: 0.9, changefreq: 'monthly' },
  { key: 'faq', en: '/faq', it: '/it/domande-frequenti', priority: 0.8, changefreq: 'monthly' },
  {
    key: 'feature-plan',
    en: '/features/zero-based-plan',
    it: '/it/funzioni/piano-zero-based',
    priority: 0.9,
    changefreq: 'monthly',
  },
  {
    key: 'feature-cashflow',
    en: '/features/cash-flow',
    it: '/it/funzioni/flusso-di-cassa',
    priority: 0.9,
    changefreq: 'monthly',
  },
  {
    key: 'feature-banksync',
    en: '/features/bank-connections',
    it: '/it/funzioni/collegamento-bancario',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    key: 'feature-analyst',
    en: '/features/ai-analyst',
    it: '/it/funzioni/analyst-ai',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    key: 'feature-reports',
    en: '/features/reports',
    it: '/it/funzioni/report',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    key: 'for-couples',
    en: '/for-couples-and-families',
    it: '/it/per-coppie-e-famiglie',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    key: 'for-freelancers',
    en: '/for-freelancers',
    it: '/it/per-freelance-e-partita-iva',
    priority: 0.8,
    changefreq: 'monthly',
  },
  { key: 'open-source', en: '/open-source', it: '/it/open-source', priority: 0.8, changefreq: 'monthly' },
  {
    key: 'vs-spreadsheets',
    en: '/vs-spreadsheets',
    it: '/it/vs-fogli-di-calcolo',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    key: 'guide-budget',
    en: '/guides/zero-based-budgeting',
    it: '/it/guide/budget-zero-based',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    key: 'guide-cashflow',
    en: '/guides/cash-flow-forecast',
    it: '/it/guide/previsione-flusso-di-cassa',
    priority: 0.7,
    changefreq: 'monthly',
  },
  {
    key: 'guide-subscriptions',
    en: '/guides/cancel-unused-subscriptions',
    it: '/it/guide/cancella-abbonamenti-inutili',
    priority: 0.7,
    changefreq: 'monthly',
  },
];

/** Bump when marketing copy changes; used as sitemap lastmod. */
export const MARKETING_LASTMOD = '2026-09-21';

export function alternateFor(path: string): { en: string; it: string } | null {
  const page = marketingPages.find((entry) => entry.en === path || entry.it === path);
  if (!page) return null;
  return { en: page.en, it: page.it };
}
