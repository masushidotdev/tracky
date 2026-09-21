// Generates public/sitemap.xml from the marketing pages registry.
// Run: node scripts/generate-sitemap.mjs (also runs pre-build).
// Served statically by the Worker at /sitemap.xml.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'src/lib/marketing/pages.ts'), 'utf8');

function extractConst(name) {
  const match = source.match(new RegExp(`export const ${name} = '([^']+)'`));
  if (!match) throw new Error(`missing ${name}`);
  return match[1];
}

const origin = extractConst('SITE_ORIGIN');
const lastmod = extractConst('MARKETING_LASTMOD');
const paths = [...source.matchAll(/(?:en|it): '([^']+)'/g)].map((m) => m[1]);

// Priority/changefreq live next to each entry; keep static 0.8/monthly for
// non-home and 1.0/weekly for home + pricing.
const priorities = { '/': '1.0', '/pricing': '0.9' };

const urls = paths
  .map((path) => {
    const priority = priorities[path] ?? '0.8';
    const changefreq = path === '/' || path === '/it/' || path === '/pricing' ? 'weekly' : 'monthly';
    return `  <url>\n    <loc>${origin}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  })
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
writeFileSync(join(root, 'public/sitemap.xml'), xml);
console.log(`sitemap.xml: ${paths.length} urls`);
