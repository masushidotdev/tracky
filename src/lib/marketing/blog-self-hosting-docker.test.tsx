// @vitest-environment node
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { SelfHostingDockerEnView } from '@/routes/blog/self-hosting-tracky-docker';
import { SelfHostingDockerItView } from '@/routes/it/blog/self-hosting-tracky-docker';

const loggedOutAuth = {
  user: null,
  signInUrl: 'https://auth.trytracky.app/sign-in',
  signUpUrl: 'https://auth.trytracky.app/sign-up',
};

const requiredCommands = [
  'git clone https://github.com/masushidotdev/tracky.git',
  'cd tracky',
  'npm run selfhost:setup',
  'node scripts/selfhost-setup.mjs',
  'docker compose up -d',
  'cp .env.selfhost.example .env',
  'docker compose --profile tools run --rm convex-backfill',
  'docker compose --profile dashboard up -d',
  'docker compose up -d --build',
  'git pull',
];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
}

describe('Self-host Tracky with Docker blog routes markup', () => {
  test.each([
    {
      name: 'EN',
      Component: SelfHostingDockerEnView,
      expectedDateLabel: '26 Nov 2026',
    },
    {
      name: 'IT',
      Component: SelfHostingDockerItView,
      expectedDateLabel: '26 nov 2026',
    },
  ])(
    '$name renders one <article>, zero <figure>, absolute https links, required commands, and mk-final outside article',
    ({ Component, expectedDateLabel }) => {
      const html = renderToStaticMarkup(React.createElement(Component, { auth: loggedOutAuth }));

      const articleMatches = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? [];
      expect(articleMatches).toHaveLength(1);
      const articleHtml = articleMatches[0] ?? '';

      expect(articleHtml).toContain(`<time class="mk-badge" dateTime="2026-11-26">${expectedDateLabel}</time>`);

      const figureMatches = articleHtml.match(/<figure\b[^>]*>[\s\S]*?<\/figure>/g) ?? [];
      expect(figureMatches).toHaveLength(0);

      // All links inside <article> should be absolute HTTPS URLs (never relative or plain http).
      const hrefs = [...articleHtml.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href.startsWith('https://')).toBe(true);
      }

      // Every required command appears verbatim (HTML-escaped where needed) inside <article>.
      for (const command of requiredCommands) {
        const escaped = escapeHtml(command);
        expect(articleHtml.includes(command) || articleHtml.includes(escaped)).toBe(true);
      }

      // The final CTA panel and marquee band sit outside <article>.
      expect(articleHtml).not.toContain('mk-final');
      expect(html).toContain('mk-final');
      expect(articleHtml).not.toContain('mk-band');
      expect(html).toContain('mk-band');
    },
  );
});
