import { allDocs } from 'content-collections';
import type { ComponentType } from 'react';
import type { MDXComponents } from 'mdx/types';

import type { DocsEntry, DocsLocale } from '@/lib/docs/types';
import { buildDocsSections, findDocForLocale, normalizeDocs } from '@/lib/docs/manifest-core';

export type DocsModule = {
  default: ComponentType<{ components?: MDXComponents }>;
};

const docsModules = import.meta.glob<DocsModule>('/src/content/user-docs/**/*.{md,mdx}');

export const docsManifest: Array<DocsEntry> = normalizeDocs(allDocs);

export function getDocsSections(locale: DocsLocale) {
  return buildDocsSections(docsManifest, locale);
}

export function getDoc(slug: string, locale: DocsLocale) {
  return findDocForLocale(docsManifest, slug, locale);
}

export async function loadDocsModule(sourcePath: string): Promise<DocsModule> {
  if (!Object.hasOwn(docsModules, sourcePath)) {
    throw new Error(`No compiled MDX module found for ${sourcePath}`);
  }

  return docsModules[sourcePath]();
}
