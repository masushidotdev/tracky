import type { DocsEntry, DocsHeading, DocsLocale } from '@/lib/docs/types';

const DEFAULT_RESULT_LIMIT = 6;
const MAX_SEARCH_CANDIDATES = 24;
const SNIPPET_LENGTH = 132;

type SearchDocument = {
  id: string;
  slug: string;
  title: string;
  description: string;
  section: string;
  keywords: Array<string>;
  headings: Array<string>;
  body: string;
};

export type DocsSearchResult = {
  anchor?: string;
  excerpt: string;
  heading?: string;
  score: number;
  section: string;
  slug: string;
  title: string;
};

function normalize(value: string, locale: DocsLocale) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase(locale)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function queryTokens(query: string, locale: DocsLocale) {
  return [...new Set(normalize(query, locale).split(' ').filter(Boolean))];
}

function fieldMatchScore(value: string, query: string, tokens: Array<string>, locale: DocsLocale) {
  const normalizedValue = normalize(value, locale);
  if (!normalizedValue) {
    return 0;
  }

  if (normalizedValue === query) {
    return 8;
  }
  if (normalizedValue.includes(query)) {
    return 6;
  }

  const matches = tokens.reduce(
    (count, token) => count + (normalizedValue.includes(token) ? 1 : 0),
    0,
  );
  if (matches === 0) {
    return 0;
  }

  return matches === tokens.length ? 4 : matches / tokens.length;
}

function priorityScore(entry: DocsEntry, query: string, tokens: Array<string>, locale: DocsLocale) {
  const title = fieldMatchScore(entry.title, query, tokens, locale);
  const headings = Math.max(
    0,
    ...entry.headings.map((heading) => fieldMatchScore(heading.text, query, tokens, locale)),
  );
  const keywords = fieldMatchScore(entry.keywords.join(' '), query, tokens, locale);
  const description = fieldMatchScore(entry.description, query, tokens, locale);
  const body = fieldMatchScore(entry.bodyPlainText, query, tokens, locale);

  return title * 100 + Math.max(headings, keywords) * 50 + description * 15 + body;
}

function bestHeading(
  headings: Array<DocsHeading>,
  query: string,
  tokens: Array<string>,
  locale: DocsLocale,
) {
  let best: { heading: DocsHeading; score: number } | undefined;

  for (const heading of headings) {
    const score = fieldMatchScore(heading.text, query, tokens, locale);
    if (score > (best?.score ?? 0)) {
      best = { heading, score };
    }
  }

  return best;
}

function createExcerpt(entry: DocsEntry, tokens: Array<string>, locale: DocsLocale) {
  const body = entry.bodyPlainText.replace(/\s+/g, ' ').trim();
  const wordPattern = /[\p{L}\p{N}]+/gu;
  let index = -1;
  let word = wordPattern.exec(body);

  while (word) {
    const matchedWord = word[0];
    if (tokens.some((token) => normalize(matchedWord, locale).includes(token))) {
      index = word.index;
      break;
    }
    word = wordPattern.exec(body);
  }

  if (index < 0) {
    return entry.description.length <= SNIPPET_LENGTH
      ? entry.description
      : `${entry.description.slice(0, SNIPPET_LENGTH - 1).trimEnd()}…`;
  }

  const start = Math.max(0, index - Math.floor(SNIPPET_LENGTH / 3));
  const end = Math.min(body.length, start + SNIPPET_LENGTH);
  return `${start > 0 ? '…' : ''}${body.slice(start, end).trim()}${end < body.length ? '…' : ''}`;
}

export async function createDocsSearch(entries: ReadonlyArray<DocsEntry>, locale: DocsLocale) {
  const { create, insertMultiple, search } = await import('@orama/orama');
  const localizedEntries = entries.filter((entry) => entry.locale === locale && !entry.draft);
  const entriesBySlug = new Map(localizedEntries.map((entry) => [entry.slug, entry]));
  const database = create({
    schema: {
      id: 'string',
      slug: 'string',
      title: 'string',
      description: 'string',
      section: 'string',
      keywords: 'string[]',
      headings: 'string[]',
      body: 'string',
    } as const,
    language: locale === 'it' ? 'italian' : 'english',
  });

  await insertMultiple(
    database,
    localizedEntries.map(
      (entry): SearchDocument => ({
        id: `${entry.locale}:${entry.slug}`,
        slug: entry.slug,
        title: entry.title,
        description: entry.description,
        section: entry.section,
        keywords: entry.keywords,
        headings: entry.headings.map((heading) => heading.text),
        body: entry.bodyPlainText,
      }),
    ),
  );

  return async (rawQuery: string, limit = DEFAULT_RESULT_LIMIT): Promise<Array<DocsSearchResult>> => {
    const normalizedQuery = normalize(rawQuery, locale);
    const tokens = queryTokens(rawQuery, locale);
    if (normalizedQuery.length < 2 || tokens.length === 0) {
      return [];
    }

    const results = await search(database, {
      term: rawQuery.trim(),
      properties: ['title', 'headings', 'keywords', 'description', 'body'],
      boost: {
        title: 8,
        headings: 5,
        keywords: 5,
        description: 2.5,
        body: 1,
      },
      limit: MAX_SEARCH_CANDIDATES,
      tolerance: rawQuery.trim().length >= 5 ? 1 : 0,
    });

    return results.hits
      .flatMap((hit) => {
        const entry = entriesBySlug.get(hit.document.slug);
        if (!entry) {
          return [];
        }

        const titleScore = fieldMatchScore(entry.title, normalizedQuery, tokens, locale);
        const headingMatch = bestHeading(entry.headings, normalizedQuery, tokens, locale);
        const useHeading = titleScore === 0 && (headingMatch?.score ?? 0) > 0;
        const score =
          priorityScore(entry, normalizedQuery, tokens, locale) + Math.log1p(hit.score);

        return [
          {
            anchor: useHeading ? headingMatch?.heading.id : undefined,
            excerpt: createExcerpt(entry, tokens, locale),
            heading: useHeading ? headingMatch?.heading.text : undefined,
            score,
            section: entry.section,
            slug: entry.slug,
            title: entry.title,
          },
        ];
      })
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, locale))
      .slice(0, limit);
  };
}

type DocsSearch = Awaited<ReturnType<typeof createDocsSearch>>;

const localizedSearches = new Map<DocsLocale, Promise<DocsSearch>>();

async function loadLocalizedSearch(locale: DocsLocale) {
  const { docsManifest } = await import('@/lib/docs/content');
  return createDocsSearch(docsManifest, locale);
}

export function getDocsSearch(locale: DocsLocale): Promise<DocsSearch> {
  const cached = localizedSearches.get(locale);
  if (cached) {
    return cached;
  }

  const pendingSearch = loadLocalizedSearch(locale).catch((error: unknown) => {
    localizedSearches.delete(locale);
    throw error;
  });
  localizedSearches.set(locale, pendingSearch);
  return pendingSearch;
}

export async function searchDocs(query: string, locale: DocsLocale, limit = DEFAULT_RESULT_LIMIT) {
  const searchLocalizedDocs = await getDocsSearch(locale);
  return searchLocalizedDocs(query, limit);
}
