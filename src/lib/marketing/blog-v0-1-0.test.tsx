// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { ReleaseV010EnView } from '@/routes/blog/tracky-v0-1-0';
import { ReleaseV010ItView } from '@/routes/it/blog/tracky-v0-1-0';

const loggedOutAuth = {
  user: null,
  signInUrl: 'https://auth.trytracky.app/sign-in',
  signUpUrl: 'https://auth.trytracky.app/sign-up',
};

describe('Tracky v0.1.0 blog routes markup', () => {
  test.each([
    {
      name: 'EN',
      Component: ReleaseV010EnView,
      expectedCaptions: [
        "Tracky's zero-based Plan",
        'CSV import: map your columns (demo data)',
        'Preview before importing; duplicates are flagged (demo data)',
      ],
    },
    {
      name: 'IT',
      Component: ReleaseV010ItView,
      expectedCaptions: [
        'Il Plan a base zero di Tracky',
        'Import CSV: mappa le colonne (dati demo)',
        "Anteprima prima dell'import; i duplicati sono segnalati (dati demo)",
      ],
    },
  ])('$name renders one <article> with three <figure> images and absolute article links', ({ Component, expectedCaptions }) => {
    const html = renderToStaticMarkup(React.createElement(Component, { auth: loggedOutAuth }));

    const articleMatches = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? [];
    expect(articleMatches).toHaveLength(1);
    const articleHtml = articleMatches[0] ?? '';

    expect(articleHtml).toContain('<time class="mka-stamp" dateTime="2026-11-24">');

    const figureMatches = articleHtml.match(/<figure\b[^>]*>[\s\S]*?<\/figure>/g) ?? [];
    expect(figureMatches).toHaveLength(3);

    for (const [index, figureHtml] of figureMatches.entries()) {
      expect(figureHtml).toMatch(/<img\b[^>]*src="https:\/\/www\.trytracky\.app\/blog\/tracky-v0-1-0\/[^"]+\.png"/);
      expect(figureHtml).toMatch(/<img\b[^>]*alt="[^"]+"/);
      expect(figureHtml).toContain('loading="lazy"');
      expect(figureHtml).toContain('<figcaption>');
      const expectedCaption = expectedCaptions[index] ?? '';
      const escapedCaption = expectedCaption.replaceAll("'", '&#x27;');
      expect(figureHtml.includes(expectedCaption) || figureHtml.includes(escapedCaption)).toBe(true);
    }

    // All links inside <article> should be absolute HTTPS URLs (never relative paths).
    const hrefs = [...articleHtml.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith('https://')).toBe(true);
    }

    // The repeated final CTA panel sits outside <article>.
    expect(articleHtml).not.toContain('mka-poster-cta');
    expect(html).toContain('mka-poster-cta');
  });

  test('all three in-article PNG assets exist in public/blog/tracky-v0-1-0', () => {
    for (const filename of ['og-feature-plan.png', 'import-mapping.png', 'import-preview.png']) {
      expect(existsSync(join(process.cwd(), 'public', 'blog', 'tracky-v0-1-0', filename))).toBe(true);
    }
  });
});
