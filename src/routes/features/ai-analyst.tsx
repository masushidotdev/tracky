import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { FaqItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  Breadcrumb,
  Chip,
  CodePlate,
  FaqSection,
  FinalCta,
  FitCheck,
  GITHUB_REPO_URL,
  ScopePill,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { B2AppCta, B2AvailabilityBand, B2RelatedSection } from '@/components/marketing/atelier/b2-sections';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const aiAnalystEnFaq: Array<FaqItem> = [
  {
    q: 'Can the AI Analyst change my ledger without asking me first?',
    a: 'No. Every sensitive write—Plan assignments or targets, virtual money-box moves, planned items, memory updates, or bulk recategorizations—arrives as a preview showing amount, currency, account, category, date, and recurrence, and waits for your explicit approval. Advisory risk badges (safe, confirm, block) never skip approval, and denying leaves your data untouched.',
  },
  {
    q: 'Why is the AI Analyst disabled on the hosted demo?',
    a: 'AI Analyst is environment-gated and requires your own AI gateway credentials on a self-hosted instance. On the hosted demo its sidebar and command-palette entries are hidden and opening /app/analyst displays Feature disabled. Core budgeting, Cash Flow, Reports, and in-app bill reminders still work on the demo.',
  },
  {
    q: 'Are Analyst projections financial advice or guaranteed outcomes?',
    a: 'No. Analyst is an exploration aid, never financial advice. Long-term FIRE and retirement projections (reserved for the Pro tier, not for sale today) are nominal estimates built from tracked balances, recent Cash Flow, and stated assumptions you can override in chat—compare scenarios and verify decisions against your actual contracts.',
  },
  {
    q: 'How do bill reminders, financial notifications, and external channels work?',
    a: 'Bill reminders derive from planned expenses in planned or funding status with up to four lead-time thresholds (default three days, 0 to 30 days) and dedupe per occurrence. Plan, subscription, cash-flow, and sync notifications are evaluated every six hours and land in your in-app inbox first. Email (Resend) and Telegram stay off until you explicitly opt in and configure keys.',
  },
  {
    q: 'How do I link Telegram to my self-hosted instance?',
    a: 'Generate a one-time link command in Settings and send it privately to your configured bot. The code expires after ten minutes and works once; never share it. You can unlink Telegram anytime, and any request that requires approval continues to say so explicitly.',
  },
];

export const Route = createFileRoute('/features/ai-analyst')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'AI Analyst: self-hosted, approval-gated exploration aid · Tracky',
      description:
        'Query your ledger in plain language with approval-gated writes and optional email or Telegram alerts. Self-host only with your own keys; disabled on demo.',
      locale: 'en',
      path: '/features/ai-analyst',
      ogImage: ogImageFor('feature-analyst'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/ai-analyst', inLanguage: ['en', 'it'] }),
        faqJsonLd(aiAnalystEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'AI Analyst', path: '/features/ai-analyst' },
        ]),
      ],
    }),
  component: AnalystEn,
});

function AnalystEn() {
  const auth = Route.useLoaderData();
  return <AiAnalystEnView auth={auth} />;
}

export function AiAnalystEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/features/ai-analyst">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb ariaLabel="Breadcrumb" items={[{ label: 'Home', href: '/' }, { label: 'AI Analyst' }]} />

            <div className="mka-b2-hero-badges">
              <ScopePill scope="selfhost" label="Self-host only" />
              <Chip>Disabled on hosted demo</Chip>
              <Chip tone="cobalt">Approval-gated writes</Chip>
              <Chip>Not financial advice</Chip>
            </div>

            <h1 className="mka-hero-headline">
              It proposes changes. <span className="mka-accent-ink">You review and sign every one.</span>
            </h1>

            <p className="mka-hero-dek">
              Tracky’s AI Analyst is an environment-gated exploration aid for self-hosted instances: ask plain-language
              questions over your authorized ledger, compare what-if scenarios, and inspect anomaly flags. Every
              sensitive write shows a full preview and waits for your approval—never autonomous, never financial advice.
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-primary mka-btn-primary--lg" href="/blog/self-hosting-tracky-docker">
                Self-host with Docker →
              </a>
              <B2AppCta
                auth={auth}
                locale="en"
                loggedInHref="/app"
                loggedInLabel="Open the demo →"
                loggedOutLabel="Try core budgeting in the demo →"
                variant="primary"
              />
            </div>

            <p className="mka-hero-meta">
              <span>Bring your own AI gateway key</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Free tier: 20 messages/day when enabled</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Email &amp; Telegram off by default</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. EXPLICIT AVAILABILITY */}
      <Section id="availability" tone="parchment">
        <SectionHead
          kicker="Where it runs"
          title="Environment-gated: off on the hosted demo, opt-in on self-host."
          subtitle="Running AI models and external messaging channels requires instance-level API keys that stay strictly under your control."
        />

        <B2AvailabilityBand
          demoTone="default"
          demoBadge="Disabled on hosted demo"
          demoTitle="Hosted demo (trytracky.app)"
          demoBody={
            <>
              AI Analyst is disabled on the hosted demo: its sidebar and command-palette entries are hidden and{' '}
              <code>/app/analyst</code> shows Feature disabled. In-app bill reminders and subscription suggestions still
              work on the demo.
            </>
          }
          selfHostTone="cobalt"
          selfHostBadge="Optional · Your keys"
          selfHostTitle="Self-hosted Docker (MIT)"
          selfHostBody={
            <>
              Rebuild the app image with <code>VITE_ANALYST_ENABLED=true</code> and supply{' '}
              <code>AI_GATEWAY_API_KEY</code> or <code>OPENROUTER_API_KEY</code> (plus optional <code>RESEND_*</code>{' '}
              and <code>TELEGRAM_*</code> keys). Free includes 20 Analyst messages/day; Pro (100/day &amp; FIRE
              projections) is reserved in code and not for sale.
            </>
          }
        />
      </Section>

      {/* 3. WHAT IT DOES VS NEVER DOES */}
      <Section id="boundaries">
        <SectionHead
          kicker="Clear boundaries"
          title="Human-in-the-loop assistance, never autopilot."
          subtitle="Read-only exploration is immediate; any change to your Plan, money boxes, planned items, memory, or categories waits for your confirmation."
        />

        <FitCheck
          yesTitle="What AI Analyst does when enabled"
          yesItems={[
            'Reads authorized accounts, transactions, spending, Plan progress, Cash Flow, money boxes, credit, subscriptions, and planned items.',
            'Explains spending patterns with charts and tables, and simulates what-if changes across multiple named conversations.',
            'Prepares previewed proposals for Plan assignments, targets, money-box moves, planned items, memory updates, or bulk recategorization—tagged with an advisory risk badge (safe, confirm, block).',
            'Pairs with scheduled background checks for spending anomalies, possible duplicates, bill reminders, and low projected balances.',
          ]}
          noTitle="What AI Analyst never does"
          noItems={[
            'Never gives certified financial, tax, or investment advice—every output is an exploration aid.',
            'Never writes a sensitive change to your ledger autonomously or skips your explicit approval.',
            'Never cancels a subscription or initiates a bank payment on your behalf.',
            'Never emails or messages Telegram without your explicit opt-in and verified bot link.',
          ]}
        />
      </Section>

      {/* 4. AUTOMATIONS, NOTIFICATIONS & SETUP */}
      <Section id="automations" tone="parchment">
        <SectionHead
          kicker="Automations & self-host setup"
          title="Background checks on a clear schedule—and how to enable them."
          subtitle="Notification checks dedupe per occurrence and threshold, landing in your in-app inbox first before any optional external channel."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Scheduled evaluations &amp; reminders</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  6H
                </span>
                <div>
                  <strong>Evaluated every six hours</strong>
                  <span>
                    Automatic sync and financial notification checks evaluate Plan buckets at or above 90%
                    funded-and-spent (warning) or in the red (critical), active subscriptions and instalments due within
                    seven days, the first projected negative cash-flow date, and sync/consent issues.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  1D
                </span>
                <div>
                  <strong>Daily baseline &amp; cycle checks</strong>
                  <span>
                    Daily jobs close due card cycles and compute account health scores and statistical baseline
                    anomalies. Only actionable deviations push; quieter findings stay in your inbox digest. Subscription
                    price-increase or forgotten-charge flags always show their evidence.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  BILL
                </span>
                <div>
                  <strong>Configurable bill reminders</strong>
                  <span>
                    Built from planned expenses in <code>planned</code> or <code>funding</code> status (default three
                    days ahead; up to four thresholds from 0 to 30 days in Settings), with deduplication per occurrence
                    and threshold. Monthly reports generate on day 2 and subscription reviews on day 3.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Enabling Analyst &amp; optional channels on Docker</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  AI
                </span>
                <div>
                  <strong>Build flag + AI gateway key</strong>
                  <span>
                    Set <code>VITE_ANALYST_ENABLED=true</code> before rebuilding <code>app</code> and provide{' '}
                    <code>AI_GATEWAY_API_KEY</code> or <code>OPENROUTER_API_KEY</code> in <code>.env</code>.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  MSG
                </span>
                <div>
                  <strong>Opt-in Resend email &amp; two-way Telegram</strong>
                  <span>
                    Configure <code>RESEND_*</code> for email delivery or <code>TELEGRAM_*</code> for two-way Telegram
                    (linked via a single-use Settings command expiring after 10 minutes). External delivery covers bill
                    reminders, upcoming subscriptions/instalments, and low projected-balance warnings once opted in.
                  </span>
                </div>
              </li>
            </ul>

            <CodePlate
              ariaLabel="AI Analyst self-host environment variables"
              lines={[
                { text: '# Add to .env on your self-hosted instance, then rebuild app', comment: true },
                { text: 'VITE_ANALYST_ENABLED=true' },
                { text: 'AI_GATEWAY_API_KEY=...   # or OPENROUTER_API_KEY' },
                { text: 'docker compose up -d --build' },
              ]}
            />

            <div className="mka-disclosure-box">
              <strong>Reserved Pro tools:</strong> Long-term FIRE and retirement projections (default 30-year horizon,
              2% inflation, 5% return, 4% withdrawal rate—all overridable in chat as nominal estimates) and the
              100-message/day limit belong to the reserved Pro tier, which is not for sale today.
            </div>
          </div>
        </div>
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        tone="cotton"
        kicker="AI Analyst FAQ"
        title="Questions about approvals, demo availability, and notifications."
        subtitle="Verified against docs/self-hosting.md and Tracky’s Analyst documentation."
        moreLink={{ href: '/faq', label: 'Read the full FAQ →' }}
        items={aiAnalystEnFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Continue exploring"
        title="Self-hosting and core planning pages."
        items={[
          {
            kicker: 'Self-hosting guide',
            title: 'Self-hosting Tracky with Docker',
            description: 'Configure Docker Compose, WorkOS AuthKit, TLS reverse proxy, and optional integration keys.',
            href: '/blog/self-hosting-tracky-docker',
            linkLabel: 'Read Docker guide →',
          },
          {
            kicker: 'Feature · Self-host only',
            title: 'PSD2 bank connections',
            description: 'Pair self-hosted AI Analyst with read-only Enable Banking connections using your own keys.',
            href: '/features/bank-connections',
            linkLabel: 'Explore bank sync →',
          },
          {
            kicker: 'Overview',
            title: 'Pricing & tier transparency',
            description: 'See Free (20 messages/day) vs. reserved Pro (not for sale) and full Demo vs. Self-host comparison.',
            href: '/pricing',
            linkLabel: 'View pricing →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Assistance you audit, never autopilot."
        meta="Self-hosted · Approval-gated writes · Bring your own keys · MIT open source"
        primaryCta={
          <a className="mka-btn-marigold" href="/blog/self-hosting-tracky-docker">
            Read the Docker self-host guide →
          </a>
        }
        secondaryCta={
          <a className="mka-btn-outline-light" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            Inspect MIT repo ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
