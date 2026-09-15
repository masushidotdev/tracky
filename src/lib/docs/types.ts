import type { AppLocale } from '@/lib/i18n';

export type DocsLocale = AppLocale;

export type DocsHeading = {
  depth: number;
  id: string;
  text: string;
};

export type DocsEntry = {
  bodyPlainText: string;
  description: string;
  draft: boolean;
  headings: Array<DocsHeading>;
  keywords: Array<string>;
  locale: DocsLocale;
  order: number;
  related: Array<string>;
  searchText: string;
  section: string;
  slug: string;
  sourcePath: string;
  title: string;
  updatedAt: string;
};

export type DocsSection = {
  title: string;
  docs: Array<DocsEntry>;
};
