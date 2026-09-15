import { describe, expect, it } from 'vitest';

import {
  buildDocsSections,
  getAdjacentDocs,
  normalizeDocs,
} from './manifest-core';
import type { DocsEntry } from './types';

function makeDoc(overrides: Partial<DocsEntry> & Pick<DocsEntry, 'slug' | 'title'>): DocsEntry {
  return {
    bodyPlainText: overrides.title,
    description: `${overrides.title} description`,
    draft: false,
    headings: [],
    keywords: [],
    locale: 'it',
    order: 10,
    related: [],
    searchText: overrides.title,
    section: 'Basics',
    sourcePath: `/src/content/user-docs/it/${overrides.slug}.mdx`,
    updatedAt: '2026-07-15',
    ...overrides,
  };
}

function withTranslations(entries: Array<DocsEntry>): Array<DocsEntry> {
  return entries.flatMap((entry) => [
    entry,
    {
      ...entry,
      locale: 'en',
      sourcePath: `/src/content/user-docs/en/${entry.slug}.mdx`,
    },
  ]);
}

describe('Docs manifest', () => {
  it('filters drafts and sorts sections and pages by order', () => {
    const entries = normalizeDocs([
      makeDoc({ slug: 'draft', title: 'Draft', order: 1, draft: true }),
      ...withTranslations([
        makeDoc({ slug: 'late', title: 'Late', order: 30, section: 'Advanced' }),
        makeDoc({ slug: 'start', title: 'Start', order: 10 }),
        makeDoc({ slug: 'next', title: 'Next', order: 20 }),
      ]),
    ]);

    expect(buildDocsSections(entries, 'it').map((section) => section.title)).toEqual(['Basics', 'Advanced']);
    expect(buildDocsSections(entries, 'it')[0]?.docs.map((doc) => doc.slug)).toEqual(['start', 'next']);
  });

  it('requires every published slug in both Italian and English', () => {
    expect(() => normalizeDocs([makeDoc({ slug: 'italian-only', title: 'Solo italiano' })])).toThrow(
      'Missing Docs translation for "italian-only": en',
    );
  });

  it('rejects duplicate locale and slug identities', () => {
    expect(() =>
      normalizeDocs([
        makeDoc({ slug: 'start', title: 'First' }),
        makeDoc({ slug: 'start', title: 'Second' }),
      ]),
    ).toThrow('Duplicate Docs page for it:start');
  });

  it('returns adjacent pages in navigation order', () => {
    const entries = normalizeDocs(withTranslations([
      makeDoc({ slug: 'third', title: 'Third', order: 30 }),
      makeDoc({ slug: 'first', title: 'First', order: 10 }),
      makeDoc({ slug: 'second', title: 'Second', order: 20 }),
    ]));

    const adjacent = getAdjacentDocs(entries, 'second', 'it');
    expect(adjacent.previous?.slug).toBe('first');
    expect(adjacent.next?.slug).toBe('third');
  });

  it('rejects related links that do not resolve to a published slug', () => {
    expect(() =>
      normalizeDocs(
        withTranslations([
          makeDoc({ slug: 'start', title: 'Start', related: ['missing-guide'] }),
        ]),
      ),
    ).toThrow('Unknown related Docs slug "missing-guide" referenced by it:start');
  });
});
