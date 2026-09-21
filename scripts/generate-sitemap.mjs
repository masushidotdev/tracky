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

// Mirror the marketingPages registry: each entry yields both localized URLs
// with that entry's own priority/changefreq (no path-based defaults).
const entries = [...source.matchAll(/en: '([^']+)',\s*it: '([^']+)',\s*priority: ([0-9.]+),\s*changefreq: '(\w+)'/g)].map(
  (m) => ({ en: m[1], it: m[2], priority: m[3], changefreq: m[4] }),
);
if (entries.length === 0) throw new Error('no marketingPages entries parsed');

const urls = entries
  .flatMap((entry) => [
    { path: entry.en, priority: entry.priority, changefreq: entry.changefreq },
    { path: entry.it, priority: entry.priority, changefreq: entry.changefreq },
  ])
  .map(
    (entry) =>
      `  <url>\n    <loc>${origin}${entry.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`,
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
writeFileSync(join(root, 'public/sitemap.xml'), xml);
console.log(`sitemap.xml: ${entries.length * 2} urls`);
