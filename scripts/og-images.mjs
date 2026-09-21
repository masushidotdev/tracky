// Generates public/og/*.png via the Cloudflare Browser Rendering screenshot API.
// The /og route renders a Vivi-styled 1200x630 template driven by ?title=&kicker=.
// Usage:
//   node scripts/og-images.mjs            # generate missing PNGs only
//   node scripts/og-images.mjs --force    # regenerate all
// Env (never commit): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN plus
// OG_BASE_URL (required when generation is enabled — the already-deployed
// origin serving /og, e.g. staging or production).
// Replaces the solid-color placeholders; runs before `vite build`.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'og');
mkdirSync(outDir, { recursive: true });

const force = process.argv.includes('--force');
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

// One card per marketing page key + shared default. Titles stay short: they
// render at 84px Archivo Black inside a 1200x630 frame.
const cards = {
  'og-default': ['Your money works. You live.', 'Tracky* — open source budget'],
  'og-home': ['Your money works. You live.', 'Tracky* — open source budget'],
  'og-pricing': ['Free forever. Pro later.', 'Tracky* — pricing'],
  'og-faq': ['Asked. Answered.', 'Tracky* — FAQ'],
  'og-feature-plan': ['Every euro, employed.', 'Tracky* — zero-based plan'],
  'og-feature-cashflow': ['The 27th, known today.', 'Tracky* — cash-flow'],
  'og-feature-banksync': ['Your bank, your keys.', 'Tracky* — bank sync'],
  'og-feature-analyst': ['It proposes. You sign.', 'Tracky* — AI analyst'],
  'og-feature-reports': ['Numbers that talk.', 'Tracky* — reports'],
  'og-for-couples': ['Same numbers. Zero fights.', 'Tracky* — couples & families'],
  'og-for-freelancers': ['Work money. Life money.', 'Tracky* — freelancers'],
  'og-open-source': ['Read it. Fork it. Run it.', 'Tracky* — MIT open source'],
  'og-vs-spreadsheets': ['Retire the sheet.', 'Tracky* — vs spreadsheets'],
  'og-guide-budget': ['First budget, 5 steps.', 'Tracky* — guide'],
  'og-guide-cashflow': ['Forecast cash, 5 steps.', 'Tracky* — guide'],
  'og-guide-subscriptions': ['Hunt subs, 5 steps.', 'Tracky* — guide'],
};

if (!accountId || !apiToken) {
  console.log('og-images: CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN missing — keeping existing PNGs.');
  process.exit(0);
}

// Require an explicit origin when generation is enabled: defaulting to prod
// would screenshot a stale deploy on first rollout (previous build still live)
// and then skip regeneration on later runs.
const base = process.env.OG_BASE_URL;
if (!base) {
  throw new Error('og-images: OG_BASE_URL is required when screenshot generation is enabled');
}

let done = 0;
for (const [name, [title, kicker]] of Object.entries(cards)) {
  const dest = join(outDir, `${name}.png`);
  if (!force && existsSync(dest)) continue;
  const url = `${base}/og?title=${encodeURIComponent(title)}&kicker=${encodeURIComponent(kicker)}`;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, viewport: { width: 1200, height: 630 }, waitForTimeout: 1500 }),
    },
  );
  if (!res.ok) throw new Error(`screenshot failed for ${name}: ${res.status} ${await res.text()}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`og-images: wrote ${name}.png`);
  done += 1;
  await new Promise((r) => setTimeout(r, 200));
}
console.log(`og-images: ${done} generated, ${Object.keys(cards).length - done} reused.`);
