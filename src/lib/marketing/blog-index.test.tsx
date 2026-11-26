// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { SITE_ORIGIN, marketingPages } from './pages';
import { AtelierSite } from '@/components/marketing/atelier';
import { Route as BlogIndexEnRoute, BlogIndexEnView, blogIndexEnPosts } from '@/routes/blog/index';
import { Route as BlogIndexItRoute, BlogIndexItView, blogIndexItPosts } from '@/routes/it/blog/index';

const loggedOutAuth = {
  user: null,
  signInUrl: 'https://auth.trytracky.app/sign-in',
  signUpUrl: 'https://auth.trytracky.app/sign-up',
};

const loggedInAuth = {
  user: { id: 'user_test_blog' },
  signInUrl: 'https://auth.trytracky.app/sign-in',
  signUpUrl: 'https://auth.trytracky.app/sign-up',
};

const knownMarketingPaths = new Set(marketingPages.flatMap((page) => [page.en, page.it]));

describe('Blog index pages (EN and IT)', () => {
  test.each([
    {
      name: 'EN /blog',
      locale: 'en' as const,
      path: '/blog',
      altPath: '/it/blog',
      altLang: 'it',
      Component: BlogIndexEnView,
      Route: BlogIndexEnRoute,
      posts: blogIndexEnPosts,
      expectedDockerHref: '/blog/self-hosting-tracky-docker',
      expectedV010Href: '/blog/tracky-v0-1-0',
      expectedTags: ['Guide', 'Release'],
      expectedReadCta: 'Read the article →',
    },
    {
      name: 'IT /it/blog',
      locale: 'it' as const,
      path: '/it/blog',
      altPath: '/blog',
      altLang: 'en',
      Component: BlogIndexItView,
      Route: BlogIndexItRoute,
      posts: blogIndexItPosts,
      expectedDockerHref: '/it/blog/self-hosting-tracky-docker',
      expectedV010Href: '/it/blog/tracky-v0-1-0',
      expectedTags: ['Guida', 'Rilascio'],
      expectedReadCta: "Leggi l'articolo →",
    },
  ])(
    '$name renders one h1, newest-first post cards, time tags, valid links, and SEO head',
    ({
      locale,
      path,
      altPath,
      altLang,
      Component,
      Route,
      posts,
      expectedDockerHref,
      expectedV010Href,
      expectedTags,
      expectedReadCta,
    }) => {
      const html = renderToStaticMarkup(React.createElement(Component, { auth: loggedOutAuth }));

      expect(html.startsWith('<div class="mka">')).toBe(true);

      // Exactly one <h1>
      const h1Matches = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) ?? [];
      expect(h1Matches).toHaveLength(1);

      // Both post cards rendered newest-first
      const dockerIdx = html.indexOf(`href="${expectedDockerHref}"`);
      const v010Idx = html.indexOf(`href="${expectedV010Href}"`);
      expect(dockerIdx).toBeGreaterThan(-1);
      expect(v010Idx).toBeGreaterThan(-1);
      expect(dockerIdx).toBeLessThan(v010Idx);

      // Time tags and tag chips
      expect(html).toContain('<time class="mka-blog-card-date" dateTime="2026-11-26">');
      expect(html).toContain('<time class="mka-blog-card-date" dateTime="2026-11-24">');
      for (const tag of expectedTags) {
        expect(html).toContain(tag);
      }

      // Read link label (escaped apostrophe in IT)
      const escapedReadCta = expectedReadCta.replaceAll("'", '&#x27;');
      expect(html.includes(expectedReadCta) || html.includes(escapedReadCta)).toBe(true);

      // GitHub releases and repo links
      expect(html).toContain('href="https://github.com/masushidotdev/tracky/releases"');
      expect(html).toContain('href="https://github.com/masushidotdev/tracky"');

      // Language switch maps /blog <-> /it/blog
      expect(html).toContain(`href="${altPath}" lang="${altLang}"`);

      // All internal links point to known marketing routes; IT has no EN-prefixed internal links except lang switch
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      for (const href of hrefs) {
        if (href.startsWith('https://') || href.startsWith('#')) continue;
        const basePath = href.split('#')[0];
        expect(knownMarketingPaths.has(basePath)).toBe(true);
        if (locale === 'it' && basePath !== altPath) {
          expect(basePath.startsWith('/it/')).toBe(true);
        }
      }

      // Logged-in CTA routes to /app and IT keeps all other internal links under /it/
      const loggedInHtml = renderToStaticMarkup(React.createElement(Component, { auth: loggedInAuth }));
      expect(loggedInHtml).toContain('href="/app"');
      if (locale === 'it') {
        const loggedInHrefs = [...loggedInHtml.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
        for (const href of loggedInHrefs) {
          if (href.startsWith('https://') || href.startsWith('#')) continue;
          const basePath = href.split('#')[0];
          if (basePath === altPath || basePath === '/app') continue;
          expect(basePath.startsWith('/it/')).toBe(true);
        }
      }

      // Route head: canonical, hreflang triple, OG default image, JSON-LD (Blog + BreadcrumbList)
      const head = Route.options.head!({} as never) as {
        meta: Array<{ title?: string; name?: string; property?: string; content?: string }>;
        links: Array<{ rel: string; hrefLang?: string; href: string }>;
        scripts: Array<{ type: string; children: string }>;
      };

      expect(head.links).toContainEqual({ rel: 'canonical', href: `${SITE_ORIGIN}${path}` });
      expect(head.links).toContainEqual({ rel: 'alternate', hrefLang: 'en', href: `${SITE_ORIGIN}/blog` });
      expect(head.links).toContainEqual({ rel: 'alternate', hrefLang: 'it', href: `${SITE_ORIGIN}/it/blog` });
      expect(head.links).toContainEqual({ rel: 'alternate', hrefLang: 'x-default', href: `${SITE_ORIGIN}/blog` });
      expect(head.meta).toContainEqual({ property: 'og:image', content: `${SITE_ORIGIN}/og/og-default.png` });

      const jsonLdBlocks = head.scripts.map((s) => JSON.parse(s.children) as Record<string, unknown>);
      const breadcrumbLd = jsonLdBlocks.find((b) => b['@type'] === 'BreadcrumbList');
      expect(breadcrumbLd).toBeTruthy();

      const blogLd = jsonLdBlocks.find((b) => b['@type'] === 'Blog') as
        | {
            inLanguage: string;
            blogPost: Array<{ headline: string; url: string; datePublished: string; inLanguage: string }>;
          }
        | undefined;
      expect(blogLd).toBeTruthy();
      expect(blogLd?.inLanguage).toBe(locale);
      expect(blogLd?.blogPost).toHaveLength(posts.length);
      expect(blogLd?.blogPost[0]).toMatchObject({
        headline: posts[0].title,
        url: `${SITE_ORIGIN}${posts[0].href}`,
        datePublished: '2026-11-26',
        inLanguage: locale,
      });
      expect(blogLd?.blogPost[1]).toMatchObject({
        headline: posts[1].title,
        url: `${SITE_ORIGIN}${posts[1].href}`,
        datePublished: '2026-11-24',
        inLanguage: locale,
      });
    },
  );
});

describe('AtelierSite blog navigation, footer, and aria-current', () => {
  test('EN shell renders Blog nav link and footer link pointing to /blog', () => {
    const html = renderToStaticMarkup(
      React.createElement(AtelierSite, {
        locale: 'en',
        auth: loggedOutAuth,
        currentPath: '/blog',
        children: React.createElement('div', null, 'content'),
      }),
    );

    expect(html).toContain('<a href="/blog" aria-current="page">Blog</a>');
    expect(html).toContain('href="/it/blog" lang="it"');

    const footerMatch = html.match(/<footer class="mka-footer">([\s\S]*?)<\/footer>/);
    expect(footerMatch?.[1]).toContain('<a href="/blog">Blog</a>');
    expect(footerMatch?.[1]).toContain('href="/blog/self-hosting-tracky-docker"');
    expect(footerMatch?.[1]).toContain('href="/blog/tracky-v0-1-0"');
  });

  test('IT shell renders Blog nav link and footer link under /it/, with all non-switch links under /it/', () => {
    const html = renderToStaticMarkup(
      React.createElement(AtelierSite, {
        locale: 'it',
        auth: loggedOutAuth,
        currentPath: '/it/blog',
        children: React.createElement('div', null, 'contenuto'),
      }),
    );

    expect(html).toContain('<a href="/it/blog" aria-current="page">Blog</a>');
    expect(html).toContain('href="/blog" lang="en"');

    const footerMatch = html.match(/<footer class="mka-footer">([\s\S]*?)<\/footer>/);
    expect(footerMatch?.[1]).toContain('<a href="/it/blog">Blog</a>');
    expect(footerMatch?.[1]).toContain('href="/it/blog/self-hosting-tracky-docker"');
    expect(footerMatch?.[1]).toContain('href="/it/blog/tracky-v0-1-0"');

    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      if (href.startsWith('https://') || href.startsWith('#')) continue;
      const basePath = href.split('#')[0];
      if (basePath === '/blog' || basePath === '/app') continue;
      expect(basePath.startsWith('/it/')).toBe(true);
    }
  });

  test('aria-current="page" is set on Blog item for blog posts and not for non-blog pages', () => {
    const enPostHtml = renderToStaticMarkup(
      React.createElement(AtelierSite, {
        locale: 'en',
        auth: loggedOutAuth,
        currentPath: '/blog/tracky-v0-1-0',
        children: React.createElement('div', null, 'post'),
      }),
    );
    expect(enPostHtml).toContain('<a href="/blog" aria-current="page">Blog</a>');
    expect(enPostHtml).toContain('href="/it/blog/tracky-v0-1-0" lang="it"');

    const itPostHtml = renderToStaticMarkup(
      React.createElement(AtelierSite, {
        locale: 'it',
        auth: loggedOutAuth,
        currentPath: '/it/blog/self-hosting-tracky-docker',
        children: React.createElement('div', null, 'post'),
      }),
    );
    expect(itPostHtml).toContain('<a href="/it/blog" aria-current="page">Blog</a>');
    expect(itPostHtml).toContain('href="/blog/self-hosting-tracky-docker" lang="en"');

    const pricingHtml = renderToStaticMarkup(
      React.createElement(AtelierSite, {
        locale: 'en',
        auth: loggedOutAuth,
        currentPath: '/pricing',
        children: React.createElement('div', null, 'pricing'),
      }),
    );
    expect(pricingHtml).toContain('<a href="/blog">Blog</a>');
    expect(pricingHtml).not.toContain('<a href="/blog" aria-current="page">Blog</a>');
  });
});

describe('Blog registry and sitemap', () => {
  test('marketingPages includes the blog key before blog posts', () => {
    const blogEntry = marketingPages.find((entry) => entry.key === 'blog');
    expect(blogEntry).toEqual({
      key: 'blog',
      en: '/blog',
      it: '/it/blog',
      priority: 0.8,
      changefreq: 'weekly',
    });

    const blogIdx = marketingPages.findIndex((entry) => entry.key === 'blog');
    const v010Idx = marketingPages.findIndex((entry) => entry.key === 'blog-v0-1-0');
    expect(blogIdx).toBeGreaterThan(-1);
    expect(blogIdx).toBeLessThan(v010Idx);
  });

  test('public/sitemap.xml contains /blog and /it/blog', () => {
    const sitemap = readFileSync(join(process.cwd(), 'public', 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('<loc>https://www.trytracky.app/blog</loc>');
    expect(sitemap).toContain('<loc>https://www.trytracky.app/it/blog</loc>');
  });
});
