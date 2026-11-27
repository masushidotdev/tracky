import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { ComparisonRow, FaqItem, MarketingAuth } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  CodePlate,
  ComparisonTable,
  FaqSection,
  FinalCta,
  GITHUB_REPO_URL,
  PricingCards,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const pricingEnFaq: Array<FaqItem> = [
  {
    q: 'How does Tracky pricing work today?',
    a: 'Tracky costs €0 today for both the hosted demo and MIT-licensed self-hosting. You never enter credit card details because there is no checkout anywhere on the site or inside the app. Manual accounts, browser-side CSV import, zero-based Plan, Cash Flow, Reports, and virtual money boxes are all included on Free.',
  },
  {
    q: 'Can I buy Pro today, or is there a paid trial?',
    a: 'No. Pro exists in the codebase as a reserved tier, not a product for sale: there is no price, no trial countdown, and no checkout page. When or if it launches, Pro is scoped to raise the daily AI Analyst allowance from 20 to 100 messages and unlock multiple Plans and multi-year Forecast / FIRE scenarios (framed strictly as estimates). Everything in Free stays on Free.',
  },
  {
    q: 'Does Free include PSD2 bank sync, AI Analyst, and notifications?',
    a: 'Bank sync (Enable Banking) and AI Analyst depend on instance-level credentials, so both stay disabled on the hosted demo, which runs on manual accounts and CSV import. In-app bill reminders and subscription suggestions work on the hosted demo immediately. On a self-hosted instance you can bring your own Enable Banking app and keys (automatic sync is evaluated every six hours), AI gateway key, Resend key for email, and verified Telegram link.',
  },
  {
    q: 'What does self-hosting cost and what external accounts are required?',
    a: 'Tracky itself is MIT-licensed and free to self-host on your own machine or single-node VPS using Docker 24+ (Compose v2) and Node.js 22 for the setup script. You need a free WorkOS AuthKit account for authentication; optional integrations (Enable Banking, AI gateway, Resend, Telegram) use your own provider accounts and stay off unless configured.',
  },
  {
    q: 'What happens to my data if I stay on Free—or decide to leave?',
    a: 'Your data stays yours. You can export aggregated Reports to CSV per currency or request a full JSON export from Settings (including settings and Analyst memory text, excluding embeddings). If you confirm Delete account in Settings, immediate irreversible erasure begins; you can download an export first. Some external provider logs follow separate retention rules described in the privacy docs.',
  },
];

const comparisonRows: Array<ComparisonRow> = [
  {
    capability: 'Manual accounts (checking, savings, cards, loans, investments, assets)',
    demo: { text: 'Included', tone: 'yes' },
    selfHost: { text: 'Included', tone: 'yes' },
  },
  {
    capability: 'Browser-side CSV import (mapping, validation, duplicate skipping)',
    demo: { text: 'Included', tone: 'yes' },
    selfHost: { text: 'Included', tone: 'yes' },
  },
  {
    capability: 'Zero-based Plan, targets, Auto-Assign & card payment buckets',
    demo: { text: 'Included', tone: 'yes' },
    selfHost: { text: 'Included', tone: 'yes' },
  },
  {
    capability: 'Dashboard Safe to spend, cycle Cash Flow & in-app bill reminders',
    demo: { text: 'Included', tone: 'yes' },
    selfHost: { text: 'Included', tone: 'yes' },
  },
  {
    capability: 'Reports (Sankey, breakdowns, trends, CSV export), Goals & virtual money boxes',
    demo: { text: 'Included', tone: 'yes' },
    selfHost: { text: 'Included', tone: 'yes' },
  },
  {
    capability: 'Full JSON export & immediate account deletion in Settings',
    demo: { text: 'Included', tone: 'yes' },
    selfHost: { text: 'Included', tone: 'yes' },
  },
  {
    capability: 'PSD2 bank sync via Enable Banking (automatic sync evaluated every six hours)',
    demo: { text: 'Disabled on hosted demo', tone: 'no' },
    selfHost: { text: 'Optional — bring your own app ID & PEM key', tone: 'opt' },
  },
  {
    capability: 'Approval-gated AI Analyst (Free tier: 20 messages/day)',
    demo: { text: 'Disabled on hosted demo', tone: 'no' },
    selfHost: { text: 'Optional — bring your own AI gateway key', tone: 'opt' },
  },
  {
    capability: 'Email reports (Resend) & two-way Telegram delivery',
    demo: { text: 'Disabled on hosted demo', tone: 'no' },
    selfHost: { text: 'Optional — bring your own keys / verified link', tone: 'opt' },
  },
  {
    capability: 'Product telemetry & analytics',
    demo: { text: 'Opt-in EU PostHog (off until Accept)', tone: 'opt' },
    selfHost: { text: 'Hard-disabled at build time', tone: 'yes' },
  },
  {
    capability: 'Authentication (WorkOS AuthKit)',
    demo: { text: 'Managed on trytracky.app', tone: 'yes' },
    selfHost: { text: 'External WorkOS account (free dev tier)', tone: 'opt' },
  },
];

export const Route = createFileRoute('/pricing')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Pricing — €0 today, MIT open source · Tracky',
      description:
        'Tracky costs €0 today: hosted demo and MIT-licensed Docker self-host, with no card and no checkout. Pro is reserved in code and not for sale.',
      locale: 'en',
      path: '/pricing',
      ogImage: ogImageFor('pricing'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/pricing', inLanguage: ['en', 'it'] }),
        faqJsonLd(pricingEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Pricing', path: '/pricing' },
        ]),
      ],
    }),
  component: PricingEn,
});

function PricingEn() {
  const auth = Route.useLoaderData();
  return <PricingEnView auth={auth} />;
}

export function PricingEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/pricing">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb ariaLabel="Breadcrumb" items={[{ label: 'Home', href: '/' }, { label: 'Pricing' }]} />

            <ChipRow>
              <Chip tone="marigold">€0 today</Chip>
              <Chip>No credit card</Chip>
              <Chip>No checkout</Chip>
              <Chip tone="cobalt">MIT open source</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              €0 today—hosted demo and MIT self-host, <span className="mka-accent-ink">with no checkout.</span>
            </h1>

            <p className="mka-hero-dek">
              Use the hosted demo at trytracky.app or run the same MIT-licensed codebase on your own Docker host. A Pro
              tier is reserved in the code for higher AI Analyst limits, multiple Plans, and long-term Forecast
              scenarios, but billing does not exist and nothing is for sale today.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/blog/self-hosting-tracky-docker">
                Self-host with Docker →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. FREE VS PRO CARDS */}
      <Section id="plans" tone="parchment">
        <SectionHead
          kicker="Plans"
          title="Free covers the full daily budgeting loop; Pro is reserved, not for sale."
          subtitle="Open Settings inside the app anytime to inspect your active tier and daily Analyst allowance. No payment form and no trial timer exist anywhere in Tracky."
        />

        <PricingCards
          free={{
            tag: 'Free — Available today',
            figure: '€0',
            description: 'Everything needed for zero-based budgeting, cycle cash flow, CSV imports, and reporting.',
            bullets: [
              'Zero-based Plan with Assigned, Activity, Available, targets, Auto-Assign & card buckets',
              'Dashboard Safe to spend, dated cycle Cash Flow & in-app bill reminders',
              'Manual checking, savings, card, loan, investment & asset accounts + browser-side CSV import',
              'Reports (Cash Flow Sankey, breakdowns, trends, CSV export), Goals & virtual money boxes',
              'Subscription suggestions you confirm, avalanche/snowball debt payoff & JSON backup export',
              'Full MIT source on GitHub (includes 20 messages/day AI Analyst allowance when self-hosted)',
            ],
            cta: (
              <>
                <AuthCta auth={auth} locale="en" ctaLocation="marketing" />
                <a className="mka-text-link" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                  Inspect MIT repo ↗
                </a>
              </>
            ),
          }}
          pro={{
            tag: 'Pro — Reserved, not for sale',
            figure: 'No price · No trial',
            description: 'Scaffolded in code so power-user limits stay transparent; nobody can be charged today.',
            bullets: [
              'Raises daily AI Analyst allowance from 20 to 100 messages/day',
              'Unlocks multiple Plans inside one workspace',
              'Adds long-term Forecast & FIRE scenarios (nominal estimates, never financial advice)',
              'No price, no trial clock, no checkout page—and core Free features stay untouched',
            ],
          }}
        />
      </Section>

      {/* 3. HOSTED DEMO VS SELF-HOST TABLE */}
      <Section id="comparison">
        <SectionHead
          kicker="Hosted demo vs. self-host"
          title="What is included in each environment."
          subtitle="Both run the same MIT codebase. The difference is strictly whether external third-party credentials are configured."
        />

        <ComparisonTable
          caption="Comparison of capabilities between the Tracky hosted demo and self-hosted Docker deployment"
          headers={['Capability', 'Hosted demo (€0)', 'Self-hosted Docker (MIT)']}
          rows={comparisonRows}
        />
      </Section>

      {/* 4. WHAT YOU NEED TO SELF-HOST */}
      <Section id="self-host" tone="parchment">
        <SectionHead
          kicker="Self-hosting prerequisites"
          title="What you need to run Tracky on your own server."
          subtitle="Designed for a personal machine or single-node VPS with a local Convex SQLite volume and zero product telemetry."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Required to start</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Docker 24+ with Docker Compose v2</strong>
                  <span>
                    Runs the self-hosted Convex backend (SQLite + blob volume) and the TanStack Start app locally in
                    containers.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Node.js 22 (for the setup script)</strong>
                  <span>
                    Runs <code>node scripts/selfhost-setup.mjs</code> with zero npm dependencies to configure WorkOS and
                    write a local <code>0600</code> <code>.env</code> file.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Free WorkOS AuthKit account</strong>
                  <span>
                    Authentication remains external via WorkOS AuthKit (free developer tier available) even on a
                    self-hosted Docker install.
                  </span>
                </div>
              </li>
            </ul>

            <CodePlate
              ariaLabel="Self-host setup commands"
              lines={[
                { text: '# Interactive setup (WorkOS + local .env)', comment: true },
                { text: 'node scripts/selfhost-setup.mjs' },
                { text: 'docker compose up -d' },
              ]}
            />

            <div className="mka-trust-actions">
              <a className="mka-text-link" href="/blog/self-hosting-tracky-docker">
                Read the Docker self-host guide →
              </a>
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/docs/self-hosting.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read docs/self-hosting.md ↗
              </a>
            </div>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Optional integrations (bring your own keys)</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  PSD2
                </span>
                <div>
                  <strong>Enable Banking app &amp; PEM key</strong>
                  <span>
                    Enables read-only PSD2 bank connections with automatic sync evaluated every six hours and bank-side
                    consent you can revoke anytime.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  AI
                </span>
                <div>
                  <strong>AI gateway key (AI Gateway / OpenRouter)</strong>
                  <span>
                    Turns on the approval-gated AI Analyst when built with <code>VITE_ANALYST_ENABLED=true</code>.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  MSG
                </span>
                <div>
                  <strong>Resend &amp; Telegram bot token</strong>
                  <span>
                    Enables scheduled email digests via Resend and two-way Telegram notifications once you link and
                    verify your chat.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>No hidden SaaS traps:</strong> Every optional integration stays off until you configure its
              environment variables, and Docker self-host builds hard-disable PostHog, Convex beacons, and Wrangler
              telemetry.
            </div>
          </div>
        </div>
      </Section>

      {/* 5. PLAIN TERMS & DATA OWNERSHIP */}
      <Section id="terms">
        <SectionHead
          kicker="Plain terms"
          title="Why €0 has no fine print—and how your data stays portable."
          subtitle="Budgeting software earns trust when the business model and exit path are as transparent as the math."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>What €0 includes every month</h3>
            <p>
              Your Free tier covers the entire daily budgeting loop with nothing gated behind a trial clock: zero-based
              Plan buckets, Cash Flow with dated commitments and in-app bill reminders, Reports with per-currency CSV
              exports, virtual money boxes, and subscription suggestions that flag likely renewals without claiming
              certainty.
            </p>
            <p>
              Everything runs on data you enter manually or import via browser-parsed CSV on the hosted demo, or with
              your own provider keys on a self-hosted instance. Projections always read as planning estimates built from
              recorded items, never financial advice.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Reserved Pro tier &amp; clean exit</h3>
            <p>
              Pro is visible in the codebase and Settings so power-user limits are never a surprise, not because
              anything is being sold today. There is no price, no payment form, and no auto-converting trial; if Pro
              ever launches, it would raise Analyst limits and add multi-plan / long-term Forecast scenarios while
              leaving Free untouched.
            </p>
            <p>
              Whenever you want a copy of your records, request a JSON export from Settings (memory text and settings
              included, embeddings excluded) or export Reports to CSV. Confirming Delete account triggers immediate,
              irreversible erasure.
            </p>
          </article>
        </div>
      </Section>

      {/* 6. FAQ */}
      <FaqSection
        id="faq"
        tone="parchment"
        kicker="Pricing FAQ"
        title="Questions about cost, Pro, and self-hosting."
        subtitle="Direct answers matching the shipped v0.2.0 codebase—no asterisks and no unverified promises."
        moreLink={{ href: '/faq', label: 'Read the full FAQ page →' }}
        items={pricingEnFaq}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="€0 today. No card, no trial clock, no checkout."
        meta="Free hosted demo · MIT self-host with Docker · Public release v0.2.0"
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
