import type { DocsEntry, DocsLocale, DocsSection } from '@/lib/docs/types';

function compareDocs(left: DocsEntry, right: DocsEntry) {
  return left.order - right.order || left.title.localeCompare(right.title, left.locale);
}

export function normalizeDocs(entries: ReadonlyArray<DocsEntry>): Array<DocsEntry> {
  const visibleEntries = entries.filter((entry) => !entry.draft);
  const identities = new Set<string>();
  const localesBySlug = new Map<string, Set<DocsLocale>>();

  for (const entry of visibleEntries) {
    const identity = `${entry.locale}:${entry.slug}`;
    if (identities.has(identity)) {
      throw new Error(`Duplicate Docs page for ${identity}`);
    }
    identities.add(identity);

    const locales = localesBySlug.get(entry.slug) ?? new Set<DocsLocale>();
    locales.add(entry.locale);
    localesBySlug.set(entry.slug, locales);
  }

  for (const [slug, locales] of localesBySlug) {
    for (const locale of ['en', 'it'] satisfies Array<DocsLocale>) {
      if (!locales.has(locale)) {
        throw new Error(`Missing Docs translation for "${slug}": ${locale}`);
      }
    }
  }

  const publishedSlugs = new Set(localesBySlug.keys());
  for (const entry of visibleEntries) {
    for (const relatedSlug of entry.related) {
      if (!publishedSlugs.has(relatedSlug)) {
        throw new Error(
          `Unknown related Docs slug "${relatedSlug}" referenced by ${entry.locale}:${entry.slug}`,
        );
      }
    }
  }

  return [...visibleEntries].sort(compareDocs);
}

export function selectDocsForLocale(
  entries: ReadonlyArray<DocsEntry>,
  locale: DocsLocale,
): Array<DocsEntry> {
  const bySlug = new Map<string, Array<DocsEntry>>();

  for (const entry of entries) {
    const translations = bySlug.get(entry.slug) ?? [];
    translations.push(entry);
    bySlug.set(entry.slug, translations);
  }

  return [...bySlug.values()]
    .map(
      (translations) =>
        translations.find((entry) => entry.locale === locale) ??
        translations.find((entry) => entry.locale === 'it') ??
        translations.find((entry) => entry.locale === 'en') ??
        translations[0],
    )
    .sort(compareDocs);
}

export function buildDocsSections(
  entries: ReadonlyArray<DocsEntry>,
  locale: DocsLocale,
): Array<DocsSection> {
  const sections = new Map<string, Array<DocsEntry>>();

  for (const entry of selectDocsForLocale(entries, locale)) {
    const sectionDocs = sections.get(entry.section) ?? [];
    sectionDocs.push(entry);
    sections.set(entry.section, sectionDocs);
  }

  return [...sections.entries()]
    .map(([title, docs]) => ({ title, docs: docs.sort(compareDocs) }))
    .sort((left, right) => {
      const leftOrder = left.docs[0]?.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.docs[0]?.order ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.title.localeCompare(right.title, locale);
    });
}

export function findDocForLocale(
  entries: ReadonlyArray<DocsEntry>,
  slug: string,
  locale: DocsLocale,
): DocsEntry | undefined {
  return selectDocsForLocale(entries, locale).find((entry) => entry.slug === slug);
}

export function getAdjacentDocs(
  entries: ReadonlyArray<DocsEntry>,
  slug: string,
  locale: DocsLocale,
): { next?: DocsEntry; previous?: DocsEntry } {
  const localizedDocs = selectDocsForLocale(entries, locale);
  const index = localizedDocs.findIndex((entry) => entry.slug === slug);

  if (index === -1) {
    return {};
  }

  return {
    previous: localizedDocs[index - 1],
    next: localizedDocs[index + 1],
  };
}
