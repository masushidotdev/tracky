import { describe, expect, it } from 'vitest';

import { createDocsSearch } from './search';
import type { DocsEntry } from './types';

function docsEntry(
  slug: string,
  title: string,
  bodyPlainText: string,
  options: Partial<DocsEntry> = {},
): DocsEntry {
  return {
    bodyPlainText,
    description: options.description ?? `${title} description`,
    draft: false,
    headings: options.headings ?? [],
    keywords: options.keywords ?? [],
    locale: options.locale ?? 'it',
    order: options.order ?? 10,
    related: options.related ?? [],
    searchText: `${title} ${bodyPlainText}`,
    section: options.section ?? 'Guide',
    slug,
    sourcePath: `/src/content/user-docs/${options.locale ?? 'it'}/${slug}.mdx`,
    title,
    updatedAt: '2026-07-15',
  };
}

describe('Docs search', () => {
  it('ranks a title match above the same term in body content', async () => {
    const search = await createDocsSearch(
      [
        docsEntry('planning', 'Planning', 'Costruisci e controlla la proiezione della liquidità.'),
        docsEntry(
          'other',
          'Guida generale',
          'Planning planning planning viene citato più volte nel corpo della pagina.',
        ),
      ],
      'it',
    );

    const results = await search('planning');

    expect(results.map((result) => result.slug)).toEqual(['planning', 'other']);
  });

  it('links to the best matching heading when the title does not match', async () => {
    const search = await createDocsSearch(
      [
        docsEntry('cards', 'Carte di credito', 'Il plafond torna disponibile dopo il pagamento.', {
          headings: [{ depth: 2, id: 'calcolo-del-plafond', text: 'Calcolo del plafond' }],
        }),
      ],
      'it',
    );

    const [result] = await search('calcolo plafond');

    expect(result).toMatchObject({
      anchor: 'calcolo-del-plafond',
      heading: 'Calcolo del plafond',
      slug: 'cards',
    });
  });

  it('keeps locale indexes isolated', async () => {
    const entries = [
      docsEntry('accounts', 'Conti manuali', 'Aggiungi un conto manuale.'),
      docsEntry('accounts', 'Manual accounts', 'Add a manual account.', { locale: 'en' }),
    ];

    const searchItalian = await createDocsSearch(entries, 'it');
    const searchEnglish = await createDocsSearch(entries, 'en');

    await expect(searchItalian('manuale')).resolves.toHaveLength(1);
    await expect(searchEnglish('manual')).resolves.toHaveLength(1);
  });
});
