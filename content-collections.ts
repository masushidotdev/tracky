import GithubSlugger from 'github-slugger';
import { toString } from 'mdast-util-to-string';
import { defineCollection, defineConfig } from '@content-collections/core';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

type HeadingNode = {
  depth: number;
};

function extractSearchMetadata(content: string) {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(content);
  const slugger = new GithubSlugger();
  const headings: Array<{ depth: number; id: string; text: string }> = [];

  visit(tree, 'heading', (node: HeadingNode) => {
    if (node.depth !== 2 && node.depth !== 3) {
      return;
    }

    const text = toString(node);
    if (text) {
      headings.push({
        depth: node.depth,
        id: slugger.slug(text),
        text,
      });
    }
  });

  return {
    headings,
    bodyPlainText: toString(tree).replace(/\s+/g, ' ').trim(),
  };
}

const docs = defineCollection({
  name: 'docs',
  directory: 'src/content/user-docs',
  include: '**/*.{md,mdx}',
  schema: z.object({
    content: z.string(),
    title: z.string().min(1),
    description: z.string().min(1),
    section: z.string().min(1),
    order: z.number().int().nonnegative(),
    locale: z.enum(['en', 'it']),
    updatedAt: z.union([z.string(), z.date()]),
    keywords: z.array(z.string()).default([]),
    related: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
  transform: (document) => {
    const pathParts = document._meta.path.split('/');
    const pathLocale = pathParts.shift();
    const slug = pathParts.join('/');

    if (pathLocale !== document.locale) {
      throw new Error(
        `Docs locale mismatch for ${document._meta.filePath}: folder is "${pathLocale}" but frontmatter is "${document.locale}".`,
      );
    }

    if (!slug || slug.includes('/')) {
      throw new Error(
        `Docs pages must use a flat locale/slug.mdx path so they can map to /app/docs/$slug: ${document._meta.filePath}`,
      );
    }

    const { content, ...metadata } = document;
    const searchMetadata = extractSearchMetadata(content);

    return {
      ...metadata,
      updatedAt:
        document.updatedAt instanceof Date
          ? document.updatedAt.toISOString().slice(0, 10)
          : document.updatedAt,
      slug,
      sourcePath: `/src/content/user-docs/${document._meta.filePath}`,
      ...searchMetadata,
      searchText: [
        document.title,
        document.description,
        document.section,
        ...document.keywords,
        ...searchMetadata.headings.map((heading) => heading.text),
        searchMetadata.bodyPlainText,
      ].join(' '),
    };
  },
});

export default defineConfig({
  content: [docs],
});
