import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { FaqItem, MarketingAuth } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  FinalCta,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import {
  B1ArticleEntry,
  B1ArticleFaqList,
  B1Figure,
  RelatedLinksSection,
} from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { SITE_ORIGIN } from '@/lib/marketing/pages';
import {
  blogPostingJsonLd,
  breadcrumbJsonLd,
  buildMarketingHead,
  faqJsonLd,
  ogImageFor,
  softwareAppJsonLd,
} from '@/lib/marketing/seo';

const RELEASE_URL = 'https://github.com/masushidotdev/tracky/releases/tag/v0.1.0';
const REPO_URL = 'https://github.com/masushidotdev/tracky';
const CHANGELOG_URL = 'https://github.com/masushidotdev/tracky/blob/main/CHANGELOG.md';
const PUBLISH_DATE = '2026-11-24';
const BLOG_IMAGE_BASE = `${SITE_ORIGIN}/blog/tracky-v0-1-0`;

type HighlightFigure = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

type HighlightItem = {
  num: string;
  title: string;
  body: string;
  figures?: Array<HighlightFigure>;
};

const highlights: Array<HighlightItem> = [
  {
    num: '01',
    title: 'Zero-based Plan, targets & card payment buckets',
    body: 'Category budgets are now a full zero-based Plan built around Ready to Assign, Assigned, Activity, and Available. You get focused views for underfunded, overspent, snoozed, available, and hidden buckets, an Edit Plan mode with drag-and-drop or keyboard reordering, weekly/monthly/yearly/custom targets, and preview-before-confirmation Auto-Assign. Credit cards live in a dedicated Card payments group: covered card spending moves into the card payment bucket instead of reducing Ready to Assign. Multi-plan switching is also in place (more than one plan is reserved for Pro).',
    figures: [
      {
        src: `${BLOG_IMAGE_BASE}/og-feature-plan.png`,
        alt: "Tracky's zero-based Plan",
        caption: "Tracky's zero-based Plan",
        width: 1200,
        height: 630,
      },
    ],
  },
  {
    num: '02',
    title: 'Mortgages, loans & honest balances',
    body: 'Add Account asks for account type first: cash, credit card, mortgage, car loan, or personal loan. Loans get dedicated pages with payoff charts, repayment progress, optional contractual payoff dates, paired Plan categories, and payment history — routed to the debited settlement account in Cash Flow and single-counted in net worth. Plain cash accounts, manual credit cards with statement settlement, and manual asset accounts (savings, investments, assets) sit alongside them. Arranged overdraft limits no longer inflate balances: Tracky uses your accounting position everywhere and displays overdraft availability separately.',
  },
  {
    num: '03',
    title: 'Ledger, browser CSV import, Cash Flow, Reports & Goals',
    body: 'The ledger ships with unified smart filtering, full-dataset column sorting across the most recent 5,000 transactions (disclosing when that limit is exceeded), a bottom bulk-action bar, a collapsible Scheduled transactions band, inline movement entry, up to 10 colored tags per row, and private notes. For manual accounts, browser-side CSV import parses bank exports locally with guided column mapping, duplicate and error badges, automatic category rules, and idempotent re-imports. Daily views add per-currency Safe-to-spend, bank-statement-style Cash Flow with deduplicated bill due-date reminders, Reports with Sankey/breakdown/trend charts and CSV export, and Goals with a debt payoff calculator (avalanche, snowball, or planned order). Multi-scenario Forecast lives behind the reserved Pro tier and always reads as estimates.',
    figures: [
      {
        src: `${BLOG_IMAGE_BASE}/import-mapping.png`,
        alt: 'CSV import: map your columns (demo data)',
        caption: 'CSV import: map your columns (demo data)',
        width: 1440,
        height: 800,
      },
      {
        src: `${BLOG_IMAGE_BASE}/import-preview.png`,
        alt: 'Preview before importing; duplicates are flagged (demo data)',
        caption: 'Preview before importing; duplicates are flagged (demo data)',
        width: 1440,
        height: 800,
      },
    ],
  },
  {
    num: '04',
    title: 'Optional AI Analyst & calibrated advisory layer',
    body: 'The AI Analyst stays off by default behind VITE_ANALYST_ENABLED=true and is disabled on the hosted demo. When you enable it in your own deployment, you get Convex-native persisted threads, real financial read tools, charts and tables, explicit in-chat approval before any sensitive write, and an optional two-way Telegram Bot channel. A bounded advisory layer (jev) assists transfer matching, CSV import triage, and subscription monitoring with confidence thresholds, daily spend caps, and deterministic fallbacks. Treat the Analyst as an exploration aid, never financial advice.',
  },
  {
    num: '05',
    title: 'Immediate account erasure, opt-in analytics & security hardening',
    body: 'Deleting your account from Settings now starts immediate, irreversible erasure: you can download a full JSON export first, server-side progress finishes even if you close the tab, bank consents are revoked best-effort, and your WorkOS sign-in is removed last. Product analytics and error tracking use client-only EU PostHog behind an explicit Accept banner, toggleable anytime in Settings, and never send transaction amounts or account names. Under the hood, v0.1.0 removes all application Convex Node actions in favor of standard-runtime Web Crypto RS256 JWT signing and native fetch OTLP export, verifies Resend webhook signatures before delegation, tightens HTTP framing and content-type headers, neutralizes CSV formula injection in report exports, and requires patched Node >=22.23.4 <23.',
  },
];

export const releaseV010EnFaq: Array<FaqItem> = [
  {
    q: 'What is the difference between the hosted demo and self-hosting v0.1.0?',
    a: 'Both run the same MIT-licensed codebase. The hosted demo at trytracky.app costs €0 with no card and no checkout, and gives you manual accounts, browser-side CSV import, the zero-based Plan, Cash Flow, Reports, Goals, and virtual money boxes. Bank sync and the AI Analyst stay disabled on the hosted demo; you enable them on your own deployment with your own keys.',
  },
  {
    q: 'Is bank sync turned on by default?',
    a: 'No. PSD2 bank sync runs through Enable Banking using your own app and keys on a self-hosted instance. On the hosted demo — or any instance where Enable Banking is not configured — the connect button stays disabled and manual accounts plus CSV import carry the full workflow.',
  },
  {
    q: 'Can I buy Pro in v0.1.0?',
    a: 'No. A Pro tier exists in code for higher daily Analyst limits (100 vs. 20 messages), multiple plans, and long-term Forecast scenarios, but billing does not exist yet and there is no checkout page anywhere in the app.',
  },
  {
    q: 'What do I need to self-host Tracky v0.1.0?',
    a: 'You need Node.js (>=22.23.4 <23) and npm, your own Convex account, and your own WorkOS AuthKit environment. Enable Banking, AI Gateway, Resend, and Telegram are all optional. Clone the repo, run npm ci, copy .env.example to .env.local, provision Convex with npx convex dev, and start with npm run dev.',
  },
];

export const Route = createFileRoute('/blog/tracky-v0-1-0')({
  loader: loadMarketingAuth,
  head: () => {
    const title = 'Tracky v0.1.0 — First public open-source release';
    const description =
      'Tracky v0.1.0 is tagged under the MIT license: zero-based Plan, loans, browser CSV import, Cash Flow, Reports, immediate erasure, and security hardening.';
    const url = 'https://www.trytracky.app/blog/tracky-v0-1-0';
    const image = ogImageFor('blog-v0-1-0');

    return buildMarketingHead({
      title,
      description,
      locale: 'en',
      path: '/blog/tracky-v0-1-0',
      ogImage: image,
      jsonLd: [
        softwareAppJsonLd({ url, inLanguage: ['en', 'it'] }),
        blogPostingJsonLd({
          headline: title,
          description,
          url,
          image,
          datePublished: PUBLISH_DATE,
          dateModified: PUBLISH_DATE,
          inLanguage: 'en',
        }),
        faqJsonLd(releaseV010EnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Tracky v0.1.0', path: '/blog/tracky-v0-1-0' },
        ]),
      ],
    });
  },
  component: ReleaseV010En,
});

function ReleaseV010En() {
  const auth = Route.useLoaderData();
  return <ReleaseV010EnView auth={auth} />;
}

export function ReleaseV010EnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/blog/tracky-v0-1-0">
      <article>
        {/* 1. ARTICLE HERO */}
        <header className="mka-hero mka-hero--page">
          <div className="mka-container">
            <div className="mka-hero-single">
              <Breadcrumb
                ariaLabel="Breadcrumb"
                items={[{ label: 'Home', href: `${SITE_ORIGIN}/` }, { label: 'Tracky v0.1.0' }]}
              />

              <ChipRow>
                <Chip tone="cobalt">Release notes</Chip>
                <Chip tone="marigold">v0.1.0</Chip>
                <time className="mka-stamp" dateTime={PUBLISH_DATE}>
                  24 Nov 2026
                </time>
                <Chip tone="sage">MIT License</Chip>
              </ChipRow>

              <h1 className="mka-hero-headline">
                Tracky <span className="mka-accent-ink">v0.1.0</span> is out.
              </h1>

              <p className="mka-hero-dek">
                First public tagged release of Tracky, published on <strong>24 November 2026</strong> under the MIT
                license. One readable baseline covering the initial public release through PR #64 — try the free demo or
                self-host it with your own keys.
              </p>

              <aside aria-label="Release links" className="mka-hero-actions">
                <a className="mka-btn-primary mka-btn-primary--lg" href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
                  GitHub release v0.1.0 ↗
                </a>
                <a className="mka-btn-secondary" href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer">
                  Read CHANGELOG.md ↗
                </a>
              </aside>
            </div>
          </div>
        </header>

        {/* 2. INTRO */}
        <Section tone="parchment">
          <div className="mka-b1-prose">
            <p>
              Tracky has been public on GitHub since 15 September 2026. Today we tagged{' '}
              <a href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
                v0.1.0
              </a>{' '}
              as the first semantic release, wrapping up everything from the initial public commit (<code>654561d</code>)
              through PR #64 into a clean checkpoint you can inspect, pin, and run.
            </p>
            <p>
              If you are meeting Tracky for the first time: it is an MIT-licensed personal finance tracker built on
              Convex, TanStack Start, and WorkOS AuthKit. You can explore the{' '}
              <a href={`${SITE_ORIGIN}/pricing`}>free hosted demo</a> at <code>trytracky.app</code> with manual accounts
              and browser-side CSV import, or clone{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                masushidotdev/tracky
              </a>{' '}
              and run your own deployment.
            </p>
            <p>
              Below are the main pieces that landed in v0.1.0. For every bug fix, dependency update, and pull request
              reference, read the full{' '}
              <a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer">
                CHANGELOG.md
              </a>{' '}
              or the{' '}
              <a href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
                GitHub release notes
              </a>
              .
            </p>
          </div>
        </Section>

        {/* 3. HIGHLIGHTS + FIGURES */}
        <Section id="highlights">
          <SectionHead
            kicker="Release highlights"
            title="What shipped in v0.1.0"
            subtitle="Five areas that reached a cohesive, documented baseline in the tagged release."
          />

          <div className="mka-b1-article-stack">
            {highlights.map((item) => (
              <React.Fragment key={item.num}>
                <B1ArticleEntry num={item.num} title={item.title}>
                  <p>{item.body}</p>
                </B1ArticleEntry>
                {item.figures?.map((figure) => (
                  <B1Figure
                    key={figure.src}
                    src={figure.src}
                    alt={figure.alt}
                    caption={figure.caption}
                    width={figure.width}
                    height={figure.height}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </Section>

        {/* 4. HOSTED DEMO VS SELF-HOST + RUNNING YOUR OWN INSTANCE */}
        <Section id="deployment" tone="parchment">
          <SectionHead
            kicker="Deployment boundaries"
            title="Hosted demo vs. self-host"
            subtitle="Both run the same MIT code, with honest boundaries about what is enabled where. Nothing in v0.1.0 is behind a checkout, and Pro features stay reserved in code until billing exists."
          />

          <div className="mka-deploy-grid" style={{ marginBottom: '2.5rem' }}>
            <div className="mka-deploy-card">
              <div className="mka-deploy-head">
                <div>
                  <h3>Hosted demo (€0)</h3>
                  <p className="mka-deploy-sub">Ready at trytracky.app</p>
                </div>
                <Chip tone="marigold">No card</Chip>
              </div>
              <ul className="mka-check-list">
                <li>Zero-based Plan, Cash Flow, Reports, Goals</li>
                <li>Manual cash, card, asset, and loan accounts</li>
                <li>Browser-side CSV import with preview</li>
                <li>No card, no trial, no checkout</li>
              </ul>
            </div>

            <div className="mka-deploy-card">
              <div className="mka-deploy-head">
                <div>
                  <h3>Self-host (MIT)</h3>
                  <p className="mka-deploy-sub">Your deployment, your keys</p>
                </div>
                <Chip tone="cobalt">Open source</Chip>
              </div>
              <ul className="mka-check-list">
                <li>Your own Convex deployment + WorkOS AuthKit</li>
                <li>Optional PSD2 bank sync (your Enable Banking keys)</li>
                <li>Optional AI Analyst, Resend emails, Telegram Bot</li>
                <li>Full source + EN/IT user docs in the repo</li>
              </ul>
            </div>
          </div>

          <div className="mka-b1-prose">
            <h2 className="mka-section-title" style={{ marginBottom: '1rem' }}>
              Running your own instance
            </h2>
            <p>
              At tag v0.1.0, Tracky runs on Node.js (<code>&gt;=22.23.4 &lt;23</code>), npm, your own Convex deployment,
              and your own WorkOS AuthKit project. Clone the repository, run <code>npm ci</code>, copy{' '}
              <code>.env.example</code> to <code>.env.local</code> (fixed from a stale filename reference in PR #64),
              run <code>npx convex dev</code>, and start locally with <code>npm run dev</code>.
            </p>
            <p>
              <strong>Update (26 Nov 2026):</strong> Docker Compose self-hosting with a local self-hosted Convex backend
              later landed on <code>main</code> — see the{' '}
              <a href={`${SITE_ORIGIN}/blog/self-hosting-tracky-docker`}>step-by-step Docker self-hosting guide</a>.
            </p>
            <p>
              Only add Enable Banking, AI Gateway, Resend, or Telegram keys if you want those integrations. You can also
              browse the{' '}
              <a href={`${SITE_ORIGIN}/features/zero-based-plan`}>zero-based Plan overview</a>, the{' '}
              <a href={`${SITE_ORIGIN}/features/bank-connections`}>bank connections page</a>, or the{' '}
              <a href={`${SITE_ORIGIN}/open-source`}>open-source setup guide</a> before touching a terminal.
            </p>
          </div>
        </Section>

        {/* 5. FAQ */}
        <Section id="faq">
          <SectionHead
            kicker="Release FAQ"
            title="Questions about Tracky v0.1.0"
            subtitle="Quick answers on hosted demo vs. self-host, default bank sync, reserved Pro, and setup."
          />
          <B1ArticleFaqList items={releaseV010EnFaq} />
        </Section>
      </article>

      {/* OUTSIDE <article>: RELATED + FINAL CTA */}
      <RelatedLinksSection
        tone="parchment"
        kicker="Read next"
        title="Continue exploring Tracky."
        items={[
          {
            kicker: 'Docker guide',
            title: 'Self-host Tracky with Docker step by step',
            description: 'The follow-up guide covering Docker Compose, self-hosted Convex, zero telemetry, and backups.',
            href: '/blog/self-hosting-tracky-docker',
            ctaLabel: 'Read Docker guide →',
          },
          {
            kicker: 'Open source',
            title: 'Architecture, MIT license & contributing',
            description: 'Inspect the stack, security policy, and both deployment paths.',
            href: '/open-source',
            ctaLabel: 'Read Open Source →',
          },
          {
            kicker: 'Pricing',
            title: '€0 hosted demo vs. MIT self-host',
            description: 'See what is included free today and how reserved Pro limits are scoped.',
            href: '/pricing',
            ctaLabel: 'Read Pricing →',
          },
        ]}
      />

      <FinalCta
        headline="v0.1.0 is ready to try."
        meta="€0 hosted demo · MIT release on GitHub · Full changelog included"
        primaryCta={<AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
            View v0.1.0 on GitHub ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
