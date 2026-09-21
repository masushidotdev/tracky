import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';

const faq = [
  {
    q: 'Is Tracky really an open source budget tracker I can self-host under the MIT license?',
    a: 'Yes. The code at masushidotdev/tracky is MIT licensed, so you can use, modify, and distribute it with the copyright notice intact. You run your own Convex backend and Worker frontend with your own keys. The badge on this page mirrors the repo license — one codebase, readable by everyone.',
  },
  {
    q: 'Does the hosted demo include bank sync and the analyst?',
    a: 'No. The demo is a limited deployment of the same code, so you can explore without wiring up services. Bank sync and the analyst switch on in your own deployment with your own services and keys. Treat the analyst as a helper, never as financial advice or a financial advisor.',
  },
  {
    q: 'What do I need to run my own instance?',
    a: 'Your own Convex deployment, your own WorkOS environment, and optionally your own Enable Banking app for bank connections. The repo gives you the exact setup: npm ci, a filled-in .env.local, npx convex dev, and npm run dev. Never point a checkout at someone else\'s backend.',
  },
  {
    q: 'Are projections, subscriptions, and money boxes reliable?',
    a: 'Projections are estimates from stored data, never guaranteed balances — always verify against your bank. Subscription detection is a suggestion, not certainty: confirm merchant, amount, and cadence. Money boxes are virtual envelopes inside the app, and each currency keeps its own separate totals — nothing is ever converted.',
  },
];

export const Route = createFileRoute('/open-source')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Tracky is MIT open source — self-host it',
      description:
        'Tracky is MIT-licensed on GitHub: Convex backend, TanStack frontend, bilingual docs. Try the hosted demo or run your own.',
      locale: 'en',
      path: '/open-source',
      ogImage: ogImageFor('open-source'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/open-source', inLanguage: ['en', 'it'] }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Open source', path: '/open-source' },
        ]),
      ],
    }),
  component: OssEn,
});

function OssEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/open-source">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">MIT</span>
            <span className="mk-badge">GitHub</span>
            <span className="mk-badge">Self-host</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Read it.
            <br />
            <span className="stroke">Fork it.</span>
            <br />
            <span className="hl">Run it.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Tracky is <b>MIT-licensed</b> at <b>masushidotdev/tracky</b>: Convex backend, TanStack Start frontend,
            bilingual user docs, decisions recorded in the open. The hosted demo is one deployment of this code —
            yours can enable bank sync, analyst and Pro-gated features on your own keys.
          </p>
        </Reveal>
        <Reveal>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <MagnetCta href="https://github.com/masushidotdev/tracky">★ Star on GitHub →</MagnetCta>
            <MagnetCta href={user ? '/app' : signUpUrl} variant="pill" onClick={() =>
                user
                  ? undefined
                  : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
              }>
                {user ? 'Open the demo →' : 'Try the demo →'}
            </MagnetCta>
          </div>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>You want a budget tracker you can actually inspect. Tracky is an open source budget tracker you can self-host: MIT licensed at masushidotdev/tracky, with a Convex backend and a TanStack Start frontend you can read line by line. No black boxes between you and your money.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Try the hosted demo first and click through Dashboard, Plan, Reports, and Cash Flow. When you like what you see, run your own deployment with your own keys: your setup can switch on bank sync, the analyst, and Pro-gated features that stay off on the shared demo.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Projections are always estimates computed from stored data, and totals in different currencies are never converted. Everything is documented in English and Italian, and every product decision is recorded in the open, so you can see why things work the way they do.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Fork the repo, open a focused pull request, and your improvement can land for everyone. Give it a star to follow along. Your money, your server, your rules — verified in code you can read.</p>
        </Reveal>
      </section>
      <MarqueeBand items={['MIT LICENSE', 'CONVEX + TANSTACK', 'BILINGUAL DOCS', 'DECISIONS IN OPEN', 'YOUR KEYS']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>An open source budget tracker you self-host, MIT licensed</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>The MIT license gives you the full playbook: use Tracky, modify it, and distribute your version, with the copyright notice kept in place. Under the hood you get a Convex backend with a typed schema, a TanStack Start frontend, and a Cloudflare Worker deployment — the same code that powers the hosted demo. User docs ship in English and Italian, and product decisions are recorded in the open, so you always know why a feature behaves the way it does. Read the code before you trust it with a single euro: that is the whole point.</p>
        </Reveal>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>From clone to your own deployment</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>Clone the repo, install with npm ci, copy .env.local.example to .env.local, and point the app at your own Convex deployment with npx convex dev. Each setup brings its own backend, its own WorkOS environment, and optionally its own Enable Banking app — you never touch anyone else's data. Run npm run dev locally, then deploy the Worker frontend against your Convex backend for production. With your own keys you switch on the full stack — bank sync, the analyst, and Pro-gated features — and you can contribute your improvements upstream.</p>
        </Reveal>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Try the demo, then contribute</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>Start with the hosted demo to feel the product before you self-host. When you are ready to give back, star masushidotdev/tracky and open a focused pull request — one concern per change, full test suite green, lint clean. Update the English and Italian user docs when behavior changes, and use only fake Acme-style fixture data: never commit real names, balances, or bank exports. Maintainers add the changelog entry at merge, so you can skip that file — small, honest contributions beat grand redesigns every time.</p>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Questions, answered.</h2>
        </Reveal>
        {faq.map((entry) => (
          <Reveal key={entry.q}>
            <details>
              <summary>{entry.q}</summary>
              <p style={{ marginTop: 8 }}>{entry.a}</p>
            </details>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Trust, compiled.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>MIT · GitHub · self-host in minutes</p>
            <MagnetCta href="https://github.com/masushidotdev/tracky">Read the code →</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
