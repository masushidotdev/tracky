import type { DocsLocale } from '@/lib/docs/types';

const docsCopy = {
  en: {
    allGuides: 'All guides',
    description: 'Guides, workflows, calculations, and tutorials for using Tracky.',
    emptyDescription: 'Published guides will appear here.',
    emptyTitle: 'No documentation available',
    guide: 'guide',
    guides: 'guides',
    menu: 'Browse documentation',
    navigation: 'Documentation navigation',
    navigationDescription: 'Browse guides grouped by topic.',
    notFoundDescription: 'This guide is not available in the published documentation.',
    notFoundTitle: 'Guide not found',
    next: 'Next',
    onThisPage: 'On this page',
    previous: 'Previous',
    title: 'Docs',
    updated: 'Updated',
  },
  it: {
    allGuides: 'Tutte le guide',
    description: 'Guide, workflow, calcoli e tutorial per usare Tracky.',
    emptyDescription: 'Le guide pubblicate appariranno qui.',
    emptyTitle: 'Nessuna documentazione disponibile',
    guide: 'guida',
    guides: 'guide',
    menu: 'Sfoglia la documentazione',
    navigation: 'Navigazione documentazione',
    navigationDescription: 'Sfoglia le guide raggruppate per argomento.',
    notFoundDescription: 'Questa guida non è disponibile nella documentazione pubblicata.',
    notFoundTitle: 'Guida non trovata',
    next: 'Successiva',
    onThisPage: 'In questa pagina',
    previous: 'Precedente',
    title: 'Docs',
    updated: 'Aggiornato',
  },
} as const;

export function getDocsCopy(locale: DocsLocale) {
  return docsCopy[locale];
}
