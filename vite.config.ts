import { defineConfig, loadEnv } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import viteReact from '@vitejs/plugin-react';
import contentCollections from '@content-collections/vite';
import mdx from '@mdx-js/rollup';
import posthog from '@posthog/rollup-plugin';
import rehypeShiki from '@shikijs/rehype';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';

export default defineConfig(({ command, mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };

  const posthogApiKey = process.env.POSTHOG_API_KEY;
  const posthogProjectId = process.env.POSTHOG_PROJECT_ID;

  return {
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      port: 3000,
    },
    plugins: [
      // Runs the SSR environment on workerd, locally and in the build, so the
      // deployed Worker and `vite dev` resolve server env vars the same way.
      // Server-side secrets come from `.dev.vars` locally, from Worker secrets
      // once deployed.
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      {
        enforce: 'pre',
        ...mdx({
          remarkPlugins: [remarkFrontmatter, remarkGfm, remarkMdxFrontmatter],
          rehypePlugins: [
            rehypeSlug,
            [
              rehypeAutolinkHeadings,
              {
                behavior: 'wrap',
                properties: { className: ['docs-heading-anchor'] },
              },
            ],
            [
              rehypeShiki,
              {
                themes: {
                  light: 'github-light',
                  dark: 'github-dark',
                },
              },
            ],
          ],
        }),
      },
      contentCollections(),
      tanstackStart(),
      viteReact({ include: /\.(js|jsx|md|mdx|ts|tsx)$/ }),
      command === 'build' && posthogApiKey && posthogProjectId
        ? posthog({
            personalApiKey: posthogApiKey,
            projectId: posthogProjectId,
            host: process.env.POSTHOG_HOST,
            sourcemaps: {
              enabled: true,
              deleteAfterUpload: true,
            },
          })
        : null,
    ],
  };
});
