import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { FaqItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  CodePlate,
  FaqSection,
  FinalCta,
  GITHUB_REPO_URL,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { RelatedLinksSection } from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const openSourceEnFaq: Array<FaqItem> = [
  {
    q: 'Is Tracky really an open-source budget tracker I can self-host under the MIT license?',
    a: 'Yes. The repository at masushidotdev/tracky is MIT-licensed, so you can read, modify, self-host, and redistribute it with the copyright notice intact. The hosted demo and self-hosted builds run the same public codebase.',
  },
  {
    q: 'Does the hosted demo include bank sync and the AI Analyst?',
    a: 'No. The hosted demo keeps third-party integrations switched off so you can evaluate zero-based planning, Cash Flow, Reports, and browser-side CSV import with no key setup. PSD2 bank sync (Enable Banking, with automatic sync evaluated every six hours) and the approval-gated AI Analyst turn on in your own deployment with your own credentials. Treat the Analyst as an exploration aid, never financial advice.',
  },
  {
    q: 'What do I need to run my own instance?',
    a: 'For Docker self-hosting (recommended for a personal machine or single-node VPS), you need Docker 24+ with Compose v2, Node.js 22 to run node scripts/selfhost-setup.mjs, and a free WorkOS AuthKit account—Convex runs locally inside Docker with zero product telemetry. For local development or Convex Cloud deployment, you need Node.js (>=22.23.4 <23), npm, and your own Convex deployment (npx convex dev can provision a dev WorkOS environment automatically). Enable Banking, AI Gateway, Resend, and Telegram are all optional.',
  },
  {
    q: 'How do projections, subscription suggestions, and virtual money boxes behave?',
    a: 'Projections are planning estimates built from recorded balances and dated commitments, never guaranteed outcomes—always verify against your bank. Subscription detection arrives as a suggestion for you to confirm merchant, amount, and cadence. Money boxes are virtual envelopes inside the app that do not move bank balances, and every currency keeps separate totals without silent FX conversion.',
  },
];

export const Route = createFileRoute('/open-source')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Open source & self-hosting (MIT) — Tracky',
      description:
        'Tracky is MIT-licensed on GitHub: Convex backend, TanStack Start frontend, bilingual EN/IT docs, and Docker Compose self-hosting with zero telemetry.',
      locale: 'en',
      path: '/open-source',
      ogImage: ogImageFor('open-source'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/open-source', inLanguage: ['en', 'it'] }),
        faqJsonLd(openSourceEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Open source', path: '/open-source' },
        ]),
      ],
    }),
  component: OpenSourceEn,
});

function OpenSourceEn() {
  const auth = Route.useLoaderData();
  return <OpenSourceEnView auth={auth} />;
}

export function OpenSourceEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/open-source">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb ariaLabel="Breadcrumb" items={[{ label: 'Home', href: '/' }, { label: 'Open source' }]} />

            <ChipRow>
              <Chip tone="cobalt">MIT License</Chip>
              <Chip>masushidotdev/tracky</Chip>
              <Chip tone="sage">Docker self-host</Chip>
              <Chip tone="marigold">Bilingual EN / IT docs</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Read every formula, fork the repository, <span className="mka-accent-ink">run it on your own host.</span>
            </h1>

            <p className="mka-hero-dek">
              Tracky is an MIT-licensed personal finance tracker built on Convex, TanStack Start, and WorkOS AuthKit.
              Every accounting rule, architecture decision record, and bilingual user doc lives in public on GitHub.
              Explore the hosted demo first, then self-host with Docker Compose and your own keys.
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-primary mka-btn-primary--lg" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                Inspect code on GitHub ↗
              </a>
              <AuthCta auth={auth} locale="en" ctaLocation="marketing" />
              <a className="mka-btn-secondary" href="/blog/self-hosting-tracky-docker">
                Docker self-host guide →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. ARCHITECTURE & PRIVACY BOUNDARIES */}
      <Section id="architecture" tone="parchment">
        <SectionHead
          kicker="Open architecture"
          title="No black boxes between you and your numbers."
          subtitle="Read the exact schema, calculation helpers, and security boundaries before trusting Tracky with a single euro."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">What is inside the repository</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  DB
                </span>
                <div>
                  <strong>Convex backend with typed schema &amp; standard runtime</strong>
                  <span>
                    All backend logic, indexes, planning invariants, and banking adapters live in <code>convex/</code>.
                    Application Convex actions run in the standard runtime (Web Crypto RS256 + native fetch), keeping
                    money in integer minor units plus currency codes.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  UI
                </span>
                <div>
                  <strong>TanStack Start frontend (Worker + workerd self-host)</strong>
                  <span>
                    Public pages and the authenticated workspace live in <code>src/</code>. Production deploys to
                    Cloudflare Workers; Docker self-hosting runs the built Worker locally on <code>workerd</code> behind
                    a port-3000 edge proxy.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  DOC
                </span>
                <div>
                  <strong>Bilingual user docs &amp; architecture decision records</strong>
                  <span>
                    User documentation ships in English and Italian under <code>src/content/user-docs/</code>, alongside{' '}
                    <code>docs/architecture.md</code>, <code>docs/self-hosting.md</code>, and <code>docs/decisions/</code>{' '}
                    recording trade-offs in the open.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Privacy, telemetry &amp; honest boundaries</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  0
                </span>
                <div>
                  <strong>Zero product telemetry in self-host</strong>
                  <span>
                    Docker self-host builds hard-disable PostHog (<code>VITE_POSTHOG_ENABLED=false</code>), Convex
                    beacons (<code>DISABLE_BEACON=true</code>), and Wrangler telemetry. On the hosted demo, EU PostHog
                    stays off unless you click Accept.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  KEY
                </span>
                <div>
                  <strong>Bring-your-own optional integrations</strong>
                  <span>
                    Enable Banking (PSD2 sync evaluated every six hours), AI Analyst, Resend email reports, and Telegram
                    stay disabled until you configure your own keys. Maintainers never see your bank credentials.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>One external requirement:</strong> Even when self-hosting with Docker, sign-in uses{' '}
              <strong>WorkOS AuthKit</strong> (an external SaaS with a free developer tier). Tracky is therefore not
              100% air-gapped or offline today.
            </div>
          </div>
        </div>
      </Section>

      {/* 3. TWO WAYS TO SELF-HOST / DEVELOP */}
      <Section id="run">
        <SectionHead
          kicker="Run your own instance"
          title="Docker Compose for self-hosting, or Convex Cloud for development."
          subtitle="Never point a checkout at someone else's backend. Choose the Docker stack for a single-node server, or run locally with Vite and Convex Cloud."
        />

        <div className="mka-deploy-grid">
          <article className="mka-deploy-card">
            <div className="mka-deploy-head">
              <div>
                <h3>Docker Compose (Self-host)</h3>
                <p className="mka-deploy-sub">Self-hosted Convex SQLite volume + local app container</p>
              </div>
              <Chip tone="sage">Recommended</Chip>
            </div>

            <ul className="mka-check-list">
              <li>Requires Docker 24+ (Compose v2), Node.js 22 (for setup script), and a free WorkOS AuthKit account</li>
              <li>Setup script has zero npm dependencies and writes a <code>0600</code> <code>.env</code> file</li>
              <li>Upstream Convex images pinned by digest; product telemetry hard-disabled</li>
              <li>Supports optional TLS reverse proxy (Caddy, Nginx, Traefik) and volume tar backups</li>
            </ul>

            <CodePlate
              ariaLabel="Docker Compose self-hosting commands"
              lines={[
                { text: 'git clone https://github.com/masushidotdev/tracky.git' },
                { text: 'cd tracky' },
                { text: 'node scripts/selfhost-setup.mjs' },
                { text: 'docker compose up -d' },
              ]}
            />

            <div className="mka-deploy-cta">
              <a className="mka-btn-secondary mka-btn-secondary--sm" href="/blog/self-hosting-tracky-docker">
                Step-by-step Docker guide →
              </a>
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/docs/self-hosting.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                docs/self-hosting.md ↗
              </a>
            </div>
          </article>

          <article className="mka-deploy-card">
            <div className="mka-deploy-head">
              <div>
                <h3>Local dev &amp; Convex Cloud</h3>
                <p className="mka-deploy-sub">Contributors &amp; Cloudflare Worker + Convex Cloud deployments</p>
              </div>
              <Chip tone="cobalt">Node 22 + npm</Chip>
            </div>

            <ul className="mka-check-list">
              <li>Requires Node.js <code>&gt;=22.23.4 &lt;23</code> (pinned in <code>.nvmrc</code>) and npm</li>
              <li><code>npx convex dev</code> provisions a Convex dev deployment and dev WorkOS AuthKit environment</li>
              <li><code>npm run dev</code> generates <code>WORKOS_COOKIE_PASSWORD</code> if missing and starts Vite + Convex</li>
              <li><code>npm run deploy</code> publishes Convex functions and the Cloudflare Worker</li>
            </ul>

            <CodePlate
              ariaLabel="Local development commands"
              lines={[
                { text: 'npm ci' },
                { text: 'npx convex dev' },
                { text: 'npm run dev' },
              ]}
            />

            <div className="mka-deploy-cta">
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/README.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                README.md ↗
              </a>
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/docs/deployment.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                docs/deployment.md ↗
              </a>
            </div>
          </article>
        </div>
      </Section>

      {/* 4. CONTRIBUTING & SECURITY */}
      <Section id="contribute" tone="parchment">
        <SectionHead
          kicker="Contributing & security"
          title="Small, verified pull requests and strict secret hygiene."
          subtitle="Tracky is built to stay readable as it grows. Every change pairs code, tests, and documentation in both English and Italian."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>How to contribute upstream</h3>
            <p>
              Try the hosted demo first, then open a focused pull request on <code>masushidotdev/tracky</code>—one
              concern per change, full test suite green (<code>npm test</code>), and zero TypeScript or ESLint warnings
              (<code>npm run lint</code>).
            </p>
            <ul className="mka-b1-plain-list">
              <li>
                <strong>Bilingual docs ship with behavior changes:</strong> update both{' '}
                <code>src/content/user-docs/en/</code> and <code>it/</code> when user-facing behavior changes.
              </li>
              <li>
                <strong>Fake data only:</strong> use Acme-style fixtures in tests and screenshots—never commit real
                names, IBANs, balances, or bank exports.
              </li>
              <li>
                <strong>Changelog handled at merge:</strong> maintainers maintain <code>CHANGELOG.md</code>, so PRs can
                skip it.
              </li>
            </ul>
          </article>

          <article className="mka-editorial-card">
            <h3>Security policy &amp; key handling</h3>
            <p>
              Secrets live in Convex encrypted environment variables or Cloudflare Worker secrets—never in git, client
              code, or browser-visible <code>VITE_*</code> variables. Installing dependencies enables{' '}
              <code>githooks/pre-commit</code> to block env files and PEM private-key material; CI runs the same checks
              plus IBAN pattern scans.
            </p>
            <p>
              Report vulnerabilities privately via GitHub Security Advisories (never in public issues), using fake data
              only. Read the full policy in{' '}
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                SECURITY.md ↗
              </a>
              .
            </p>
          </article>
        </div>
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        kicker="Open-source FAQ"
        title="Questions about the MIT license, self-hosting, and guardrails."
        subtitle="Direct answers backed by README.md, SECURITY.md, and docs/self-hosting.md."
        items={openSourceEnFaq}
      />

      {/* 6. RELATED LINKS */}
      <RelatedLinksSection
        tone="parchment"
        kicker="Related guides"
        title="Explore the rest of the project."
        items={[
          {
            kicker: 'Docker guide',
            title: 'Self-host Tracky with Docker step by step',
            description: 'Interactive setup script, manual openssl config, local backfill, reverse proxy TLS, and backups.',
            href: '/blog/self-hosting-tracky-docker',
            ctaLabel: 'Read Docker guide →',
          },
          {
            kicker: 'Release notes',
            title: 'Tracky v0.1.0 — First public release',
            description: 'What shipped in the tagged v0.1.0 baseline across Plan, loans, CSV import, Reports, and security.',
            href: '/blog/tracky-v0-1-0',
            ctaLabel: 'Read v0.1.0 notes →',
          },
          {
            kicker: 'Pricing',
            title: 'Hosted demo vs. Self-host comparison',
            description: 'See every feature included at €0 today and how the reserved Pro tier is scoped in code.',
            href: '/pricing',
            ctaLabel: 'Read Pricing →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Trust verified in code you can actually read."
        meta="MIT License · Public GitHub repository · Docker Compose self-hosting"
        primaryCta={<AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            Inspect code on GitHub ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
