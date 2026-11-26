import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { FaqItem, MarketingAuth } from '@/components/marketing/atelier';
import type { B2StepItem } from '@/components/marketing/atelier/b2-sections';
import {
  AtelierSite,
  Breadcrumb,
  Chip,
  ChipRow,
  FaqSection,
  FinalCta,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { B2AppCta, B2GuideSteps, B2RelatedSection } from '@/components/marketing/atelier/b2-sections';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const guideSteps: Array<B2StepItem> = [
  {
    title: 'Gather two to three months of real bank history',
    body: 'Never audit subscriptions from memory—small monthly renewals and quarterly tools hide easily between everyday purchases. Export two to three months of bank or card CSVs (and check a full year when possible for annual renewals) so recurring merchant names, amounts, and spacing become visible.',
    note: 'In Tracky: import CSV history locally in your browser into a manual checking or card account—no bank credentials needed.',
  },
  {
    title: 'Scan repeating patterns as suggestions, not certainty',
    body: 'Look for charges from the same normalized merchant in the same currency with similar amounts repeating roughly every 25–35 days (monthly), 55–65 days (bi-monthly), 85–95 days (quarterly), or 355–375 days (yearly). Treat every pattern as a candidate to verify: regular coffee shops are not contracts, and real subscriptions sometimes change price.',
    note: 'In Tracky: recurring detection surfaces suggestions with a 5% (or 100 minor units) tolerance—you always confirm what is real.',
  },
  {
    title: 'Confirm genuine subscriptions with exact renewal details',
    body: 'For every recurring service you actually want to keep, record its name, current amount, currency, billing interval, next due date, and debit account. Keeping only confirmed Active subscriptions in your list ensures your upcoming cash-flow calendar stays grounded.',
    note: 'In Tracky: Active subscriptions automatically enter renewals and Cash Flow, while Paused or Ended ones stay out.',
  },
  {
    title: 'Spot duplicates and cancel directly with the provider',
    body: 'Compare merchant aliases, overlapping streaming or cloud plans, and unused trials that rolled into paid renewals. Always cancel directly inside the real service (or app store) first and save the confirmation—no budgeting app cancels contracts for you. Then mark the subscription Paused or Ended in your tracker.',
    note: 'In Tracky: marking a subscription Ended preserves historical movements without pulling future phantom renewals into Cash Flow.',
  },
  {
    title: 'Review upcoming renewals before the debit hits',
    body: 'Keep your subscription list short and inspect upcoming renewal dates alongside your cash-flow calendar. Checking renewals before the charge lands turns automatic debits back into deliberate choices—and catches price creep early.',
    note: 'In Tracky: active renewals appear directly inside Cash Flow and in-app notifications before they land.',
  },
];

export const guideSubscriptionsEnFaq: Array<FaqItem> = [
  {
    q: 'How can I find unused subscriptions without relying on memory?',
    a: 'Start with two to three months of bank or card CSV history and review recurring patterns based on normalized merchant names, matching currency, similar amounts, and date spacing. Confirm each merchant, amount, interval, and next due date yourself—every automatic match stays a suggestion rather than certainty.',
  },
  {
    q: 'Can Tracky cancel a subscription for me?',
    a: 'No. You always cancel directly inside the service provider, bank, or app store first. Once cancelled, mark the subscription Paused (kept without an active commitment) or Ended (history preserved, excluded from future matches and Cash Flow) inside Tracky.',
  },
  {
    q: 'How do Active, Paused, and Ended subscriptions affect Cash Flow?',
    a: 'Only Active subscriptions enter upcoming renewals and Cash Flow projections on their next due dates. Paused and Ended subscriptions stay out of future cash-flow calculations so cancelled services never distort your projected balance. All projections remain planning estimates, not guarantees.',
  },
  {
    q: 'Does the subscription audit workflow work in the hosted demo?',
    a: 'Yes. You can import your bank CSVs into manual accounts in the free hosted demo, review recurring suggestions, confirm real subscriptions, and see Active renewals appear inside Cash Flow—all without connecting a bank.',
  },
];

export const Route = createFileRoute('/guides/cancel-unused-subscriptions')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'How to find and cancel unused subscriptions · Tracky',
      description:
        'A five-step guide to auditing recurring charges from real bank history, spotting duplicate plans, cancelling cleanly, and tracking renewals in Cash Flow.',
      locale: 'en',
      path: '/guides/cancel-unused-subscriptions',
      ogImage: ogImageFor('guide-subscriptions'),
      jsonLd: [
        softwareAppJsonLd({
          url: 'https://www.trytracky.app/guides/cancel-unused-subscriptions',
          inLanguage: ['en', 'it'],
        }),
        faqJsonLd(guideSubscriptionsEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to find and cancel unused subscriptions',
          step: guideSteps.map((step) => ({ '@type': 'HowToStep', name: step.title, text: step.body })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Cancel unused subscriptions guide', path: '/guides/cancel-unused-subscriptions' },
        ]),
      ],
    }),
  component: GuideEn,
});

function GuideEn() {
  const auth = Route.useLoaderData();
  return <GuideSubscriptionsEnView auth={auth} />;
}

export function GuideSubscriptionsEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/guides/cancel-unused-subscriptions">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Breadcrumb"
              items={[
                { label: 'Home', href: '/' },
                { label: 'Cancel unused subscriptions guide' },
              ]}
            />

            <ChipRow>
              <Chip tone="cobalt">Evergreen guide</Chip>
              <Chip>5 practical steps</Chip>
              <Chip tone="sage">Works in the free demo</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              How to find and <span className="mka-accent-ink">cancel unused subscriptions</span> from real statements.
            </h1>

            <p className="mka-hero-dek">
              Recurring charges rarely look dramatic one month at a time—which is why forgotten trials, overlapping
              streaming plans, and quiet annual renewals linger for years. Audit them systematically from real
              transaction history instead of guesswork.
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-secondary" href="#steps">
                Jump to the 5 steps ↓
              </a>
              <B2AppCta
                auth={auth}
                locale="en"
                loggedInHref="/app"
                loggedInLabel="Open the demo →"
                loggedOutLabel="Audit with CSV in the demo →"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. EDUCATIONAL FOUNDATION */}
      <Section id="why-subs-hide" tone="parchment">
        <SectionHead
          kicker="Why subscriptions slip by"
          title="Three patterns that hide recurring waste on bank statements."
          subtitle="Spotting them takes clean history and a quick review cadence—not a paid cancellation middleman."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>What makes recurring charges hard to catch</h3>
            <ul className="mka-b2-prose-list">
              <li>
                <strong>Billing descriptors differ from brand names:</strong> a service often bills under a parent
                company, payment processor, or app-store alias.
              </li>
              <li>
                <strong>Quarterly and annual intervals fade from memory:</strong> a renewal that hits once every three
                months or once a year is easy to overlook until the debit clears.
              </li>
              <li>
                <strong>Household duplicates pile up quietly:</strong> two people paying separately for the same
                streaming, music, or cloud storage plan happens more often than most expect.
              </li>
            </ul>
          </article>

          <article className="mka-editorial-card">
            <h3>A clean rule for every recurring charge</h3>
            <p>
              Keep only two buckets in your mind during an audit: services you deliberately choose to keep (with their
              exact renewal date visible ahead of time), and services you cancel directly at the source.
            </p>
            <p>
              Once cancelled with the provider, record the status as <strong>Paused</strong> or <strong>Ended</strong>{' '}
              in your ledger so you preserve past history while removing future charges from your cash-flow estimate.
            </p>
          </article>
        </div>
      </Section>

      {/* 3. FIVE STEPS */}
      <Section id="steps">
        <SectionHead
          kicker="Step-by-step method"
          title="Audit, clean up, and track subscriptions in five steps."
          subtitle="Work from real exported history so every decision rests on observed debits rather than memory."
        />

        <B2GuideSteps steps={guideSteps} stepPrefix="Step" />
      </Section>

      {/* 4. HOW TRACKY HELPS */}
      <Section id="how-tracky-helps" tone="parchment">
        <SectionHead
          kicker="How Tracky helps"
          title="Pattern suggestions you confirm—connected directly to Cash Flow."
          subtitle="Run the full audit at €0 in the hosted demo using browser-parsed CSV imports, or on your own MIT self-hosted Docker server."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">How Tracky supports your audit</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Recurring cadence detection as suggestions</strong>
                  <span>
                    Tracky inspects normalized merchant names, matching currency, similar amounts (within the greater of
                    5% or 100 minor units), and spacing across monthly, bi-monthly, quarterly, and yearly windows—always
                    presenting matches as suggestions for you to confirm.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Active, Paused, and Ended statuses</strong>
                  <span>
                    Convert any past debit or add a subscription manually with alias and debit account. Only{' '}
                    <strong>Active</strong> subscriptions enter renewals and Cash Flow; <strong>Paused</strong> and{' '}
                    <strong>Ended</strong> keep your ledger history intact without projecting future charges.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Upcoming renewal visibility</strong>
                  <span>
                    See active renewals directly in your Cash Flow calendar and receive in-app notifications when active
                    subscriptions or instalments come due within seven days.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Honest limits</h3>
            <ul className="mka-check-list">
              <li>Works in the hosted demo with browser-local CSV import (no bank login shared)</li>
              <li>Every detection stays a suggestion until you confirm merchant, amount, and cadence</li>
              <li>Reports let you group Spending by counterparty to spot duplicate charges fast</li>
              <li className="is-muted">Tracky never cancels subscriptions or contacts merchants on your behalf</li>
              <li className="is-muted">External email/Telegram renewal alerts are optional and self-host only</li>
            </ul>

            <div className="mka-trust-actions" style={{ marginTop: 'auto' }}>
              <a className="mka-text-link" href="/features/cash-flow">
                See how Active subscriptions feed Cash Flow →
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        tone="cotton"
        kicker="Guide FAQ"
        title="Questions about auditing and tracking subscriptions."
        subtitle="Clear answers on detection, cancellation, and Cash Flow status."
        moreLink={{ href: '/faq', label: 'Read the full FAQ →' }}
        items={guideSubscriptionsEnFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Keep reading"
        title="Build the rest of your planning routine."
        items={[
          {
            kicker: 'Evergreen guide',
            title: 'How to forecast personal cash flow',
            description: 'Combine your confirmed Active subscriptions with rent, paydays, and card statements in one calendar.',
            href: '/guides/cash-flow-forecast',
            linkLabel: 'Read Cash Flow guide →',
          },
          {
            kicker: 'Evergreen guide',
            title: 'How to build a zero-based budget',
            description: 'Turn confirmed monthly and yearly renewals into funded Plan buckets with Refill up to targets.',
            href: '/guides/zero-based-budgeting',
            linkLabel: 'Read Zero-based guide →',
          },
          {
            kicker: 'Feature · Demo + Self-host',
            title: 'Reports by counterparty & category',
            description: 'Filter spending by counterparty across the last 12 months to uncover annual renewals quickly.',
            href: '/features/reports',
            linkLabel: 'Explore Reports →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Keep the services you use. See every renewal before it lands."
        meta="€0 hosted demo · Browser-parsed CSV & subscription suggestions included · No credit card"
        primaryCta={
          <B2AppCta
            auth={auth}
            locale="en"
            loggedInHref="/app"
            loggedInLabel="Open the demo →"
            loggedOutLabel="Try the demo free →"
            variant="marigold"
          />
        }
        secondaryCta={
          <a className="mka-btn-outline-light" href="/features/cash-flow">
            Explore Cash Flow →
          </a>
        }
      />
    </AtelierSite>
  );
}
