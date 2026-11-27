import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { FaqItem, MarketingAuth } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  FaqSection,
  FinalCta,
  GITHUB_REPO_URL,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { RelatedLinksSection } from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const faqEnItems: Array<FaqItem> = [
  {
    q: 'Is Tracky really €0, and is there a hidden trial?',
    a: 'Yes. Both the hosted demo and the MIT-licensed codebase cost €0 today, with no credit card and no trial timer. A Pro tier is reserved in code for higher daily AI Analyst limits (100 vs. 20 messages), multiple Plans, and multi-year Forecast scenarios, but billing does not exist yet and there is no checkout anywhere in Tracky.',
  },
  {
    q: 'Do I have to connect my bank account?',
    a: 'No. Manual checking, savings, card, loan, investment, and asset accounts plus browser-side CSV import into manual cash and card accounts cover the full budgeting workflow. Optional PSD2 bank sync via Enable Banking is only available on self-hosted instances where you configure your own Enable Banking app and keys (automatic sync is evaluated every six hours); it stays disabled on the hosted demo.',
  },
  {
    q: 'Is the AI Analyst available in the hosted demo?',
    a: 'No. The AI Analyst is environment-gated and disabled on the hosted demo, so its navigation stays hidden. On a self-hosted instance where you enable it with your own AI gateway key, it reads your authorized ledger, explains patterns, and previews every sensitive write for your explicit approval. Treat it as an exploration aid, never financial advice.',
  },
  {
    q: 'Can couples or freelancers use Tracky?',
    a: 'Yes, within a single-user workspace. Tracky derives your identity from your session and does not offer separate multi-user logins yet. One account owner can still run a shared household Plan reviewed together at one table, or separate personal and freelance accounts, track tax deadlines as planned items in Cash Flow, and export aggregated report CSVs per currency or a full JSON backup.',
  },
  {
    q: 'Who owns my data, and how do exports and deletion work?',
    a: 'You do. You can download aggregated CSV summaries per currency from Reports anytime, or request a full version 3 JSON export from Settings (including settings and Analyst memory text, excluding embeddings). Confirming Delete account in Settings starts immediate, irreversible erasure; you can also inspect or self-host the MIT codebase yourself. Different currencies always stay separate and are never silently converted.',
  },
  {
    q: 'How do I start with Tracky?',
    a: 'Open the hosted demo, create a manual account in its currency, and import a bank CSV with column mapping and duplicate detection—parsed locally in your browser. Review categories and any subscription suggestions, build your first zero-based Plan until Ready to Assign reaches zero, and add known bills to Cash Flow.',
  },
  {
    q: 'What changes if I self-host Tracky with Docker?',
    a: 'Core accounting rules, manual accounts, browser-side CSV import, zero-based Plan logic, Reports, and data ownership work identically. Self-hosting runs the TanStack Start app and Convex backend locally on Docker with product telemetry hard-disabled, while WorkOS AuthKit remains an external sign-in service. Optional integrations—Enable Banking, AI Analyst, Resend, and Telegram—stay off until you supply your own keys. Check Settings for active provider status and tier.',
  },
  {
    q: 'Are Tracky Cash Flow and Forecast projections guaranteed?',
    a: 'No. Cycle Cash Flow, Forecast scenarios, and Analyst long-term projections are planning estimates built from your recorded balances, dated items, and assumptions—never guarantees or financial advice. Always review the assumptions and last update before acting. Multi-year Forecast scenarios and long-term projections are reserved for the Pro tier, and billing upgrades are not available yet.',
  },
];

export const Route = createFileRoute('/faq')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'FAQ — Straight answers about Tracky',
      description:
        'Straight answers on Tracky: €0 pricing, manual accounts and CSV import, hosted demo vs. self-host limits, single-user workspace, data ownership, and forecasts.',
      locale: 'en',
      path: '/faq',
      ogImage: ogImageFor('faq'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/faq', inLanguage: ['en', 'it'] }),
        faqJsonLd(faqEnItems.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'FAQ', path: '/faq' },
        ]),
      ],
    }),
  component: FaqEn,
});

function FaqEn() {
  const auth = Route.useLoaderData();
  return <FaqEnView auth={auth} />;
}

export function FaqEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/faq">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb ariaLabel="Breadcrumb" items={[{ label: 'Home', href: '/' }, { label: 'FAQ' }]} />

            <ChipRow>
              <Chip tone="marigold">€0 today</Chip>
              <Chip>No bank required</Chip>
              <Chip tone="cobalt">MIT open source</Chip>
              <Chip tone="sage">Your data</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Straight answers before you <span className="mka-accent-ink">trust Tracky with your ledger.</span>
            </h1>

            <p className="mka-hero-dek">
              No marketing fog: what costs money (nothing today), what requires a bank connection (nothing), what stays
              switched off on the hosted demo (PSD2 bank sync and AI Analyst), and how your data stays portable and
              erasable. Every answer below matches the shipped v0.2.0 codebase and documentation.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/pricing">
                Compare Demo vs. Self-host →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. AT A GLANCE: WHAT WORKS EVERYWHERE VS INSTANCE-DEPENDENT */}
      <Section id="overview" tone="parchment">
        <SectionHead
          kicker="Quick orientation"
          title="What works everywhere—and what depends on your deployment."
          subtitle="Start with the boundary that matters most to you. Core budgeting is identical in the hosted demo and self-hosted Docker; third-party integrations depend on instance credentials."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Included everywhere (Demo + Self-host)</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Manual accounts &amp; browser-parsed CSV import</strong>
                  <span>
                    Checking, savings, card, loan, investment, and asset accounts. Bank CSVs are parsed locally in your
                    browser with duplicate skipping; raw files are never uploaded.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Zero-based Plan, Cash Flow &amp; Reports</strong>
                  <span>
                    Ready to Assign, Assigned/Activity/Available, card payment buckets, dated commitments, Safe to
                    spend, Sankey and trend Reports, Goals, and virtual money boxes.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Exports &amp; immediate account erasure</strong>
                  <span>
                    Per-currency aggregated CSV exports from Reports, full JSON export (version 3) in Settings, and
                    immediate irreversible account deletion whenever you choose.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Instance-configured (Self-host only)</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  PSD2
                </span>
                <div>
                  <strong>Enable Banking bank sync</strong>
                  <span>
                    Disabled on the hosted demo. On your own deployment, bring your own Enable Banking app ID and PEM
                    key; automatic sync is evaluated every six hours.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  AI
                </span>
                <div>
                  <strong>Approval-gated AI Analyst, Resend &amp; Telegram</strong>
                  <span>
                    Disabled on the hosted demo. Enable in self-host with your own AI gateway key, Resend key, and
                    verified Telegram bot link. Every sensitive write waits for your approval.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>Check live status anytime:</strong> Open <strong>Settings</strong> inside the app to inspect your
              active tier (Free or reserved Pro), daily Analyst allowance, and which providers are configured on your
              instance.
            </div>
          </div>
        </div>
      </Section>

      {/* 3. FULL FAQ */}
      <FaqSection
        id="questions"
        kicker="All eight questions"
        title="Cost, connections, privacy, and honest expectations."
        subtitle="Read the first six questions for daily use on the hosted demo, and the final two for Docker self-hosting and projection limits."
        items={faqEnItems}
        defaultOpenFirst
      />

      {/* 4. HOW TO VERIFY EVERY ANSWER */}
      <Section id="verify" tone="parchment">
        <SectionHead
          kicker="Verify it yourself"
          title="How to use this FAQ alongside the app and repository."
          subtitle="You do not have to take documentation at face value—every claim maps to a screen in the demo or a file on GitHub."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Start with the question that blocks you</h3>
            <p>
              If cost, bank linking, or demo boundaries are your main concern, open the hosted demo with zero setup and
              test manual accounts, browser-side CSV preview, zero-based Plan buckets, and dated Cash Flow directly.
              Nothing asks for a card or links a live bank.
            </p>
            <p>
              When an answer describes a guardrail—such as credit card limits staying out of spendable cash or
              currencies staying separate—you can confirm that exact behavior inside your own test workspace.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Planning estimates, never financial advice</h3>
            <p>
              Cash Flow calendars, subscription suggestions, and reserved Pro Forecast scenarios are computed strictly
              from recorded balances, dated items, and explicit assumptions. Treat every projection as a planning
              estimate and verify against your actual bank balances before making decisions.
            </p>
            <p>
              For self-hosting details—including Docker Compose setup, zero-telemetry build flags, and the external
              WorkOS AuthKit requirement—read the step-by-step Docker guide or inspect the repository directly.
            </p>
          </article>
        </div>
      </Section>

      {/* 5. RELATED LINKS */}
      <RelatedLinksSection
        kicker="Keep reading"
        title="Where to go next."
        items={[
          {
            kicker: 'Pricing',
            title: '€0 hosted demo vs. MIT self-host',
            description: 'Full side-by-side matrix of capabilities, Free vs. reserved Pro tier, and prerequisites.',
            href: '/pricing',
            ctaLabel: 'Read Pricing →',
          },
          {
            kicker: 'Open source',
            title: 'Architecture, MIT license & self-hosting',
            description: 'Inspect the Convex + TanStack Start stack, security rules, and both ways to run Tracky.',
            href: '/open-source',
            ctaLabel: 'Read Open Source →',
          },
          {
            kicker: 'Docker guide',
            title: 'Self-host Tracky with Docker Compose',
            description: 'Exact setup script commands, local backfill, reverse proxy TLS, backups, and honest limits.',
            href: '/blog/self-hosting-tracky-docker',
            ctaLabel: 'Read Docker guide →',
          },
        ]}
      />

      {/* 6. FINAL CTA */}
      <FinalCta
        headline="Still curious? Open the ledger and verify it yourself."
        meta="€0 hosted demo · No credit card · MIT open source"
        primaryCta={<AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            Inspect MIT repo ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
