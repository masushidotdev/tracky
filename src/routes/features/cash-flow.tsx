import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { FaqItem, MarketingAuth } from '@/components/marketing/atelier';
import {
  AtelierSite,
  Breadcrumb,
  Chip,
  FaqSection,
  FinalCta,
  FitCheck,
  ScopePill,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import {
  B2AppCta,
  B2AvailabilityBand,
  B2PillarGrid,
  B2RelatedSection,
} from '@/components/marketing/atelier/b2-sections';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const cashFlowEnFaq: Array<FaqItem> = [
  {
    q: 'How is Tracky Cash Flow different from a statistical forecast?',
    a: 'Cash Flow applies arithmetic to your recorded commitments against your latest observed cash balances in true date order. It does not guess your future habits or guarantee outcomes: whenever your balances or recorded items change, the projected line and first negative date recalculate with them.',
  },
  {
    q: 'Where does the projection start, and what does the cycle setting change?',
    a: 'It starts from your latest known cash account balances and applies dated rows inside your chosen cycle window. Cycle preferences control frequency, count, and start day—changing the window you inspect without altering any underlying due date. Credit card balances never enter the cash line.',
  },
  {
    q: 'What does the unassigned group mean?',
    a: 'An expense or subscription without a source account, or a card statement without a settlement account, appears in the unassigned group. Tracky keeps it visible as a known commitment, but cannot tell which cash balance it reduces until you assign the matching account.',
  },
  {
    q: 'How do active subscriptions and virtual money boxes behave in Cash Flow?',
    a: 'Active subscriptions feed future renewal rows while paused or ended ones stay out; automatic detection remains a suggestion you confirm. Virtual money-box funding needs appear separately and never subtract from a bank balance on their own. Link real transactions when paid so nothing counts twice.',
  },
  {
    q: 'Can I rely on the first negative date as a guarantee?',
    a: 'Treat it as an early planning warning, never a guarantee. Open the flagged date, check earlier rows, opening balances, accounts, and currencies, and verify against your bank. Moving a date in Tracky only helps if the real due date changed; otherwise add real income or reduce an outflow.',
  },
];

export const Route = createFileRoute('/features/cash-flow')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Cash Flow projection: dated liquidity calendar · Tracky',
      description:
        'Lay paydays, bills, active subscriptions, instalments, and card statements over real balances to see your first negative date early.',
      locale: 'en',
      path: '/features/cash-flow',
      ogImage: ogImageFor('feature-cashflow'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/cash-flow', inLanguage: ['en', 'it'] }),
        faqJsonLd(cashFlowEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Cash Flow', path: '/features/cash-flow' },
        ]),
      ],
    }),
  component: CashflowEn,
});

function CashflowEn() {
  const auth = Route.useLoaderData();
  return <CashFlowEnView auth={auth} />;
}

export function CashFlowEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/features/cash-flow">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb ariaLabel="Breadcrumb" items={[{ label: 'Home', href: '/' }, { label: 'Cash Flow' }]} />

            <div className="mka-b2-hero-badges">
              <ScopePill scope="both" label="Demo + Self-host" />
              <Chip tone="marigold">€0 today</Chip>
              <Chip>Planning estimate, not a guarantee</Chip>
            </div>

            <h1 className="mka-hero-headline">
              See your dated liquidity calendar <span className="mka-accent-ink">before bills collide.</span>
            </h1>

            <p className="mka-hero-dek">
              Tracky Cash Flow places known commitments—planned income and expenses, active subscriptions, instalments,
              card statements, and scheduled ledger movements—onto your latest observed cash balances in date order. Spot
              the <strong>first negative date</strong> while you still have options.
            </p>

            <div className="mka-hero-actions">
              <B2AppCta
                auth={auth}
                locale="en"
                loggedInHref="/app/planning"
                loggedInLabel="Open Cash Flow →"
                loggedOutLabel="Try Cash Flow in the demo →"
              />
              <a className="mka-btn-secondary" href="/guides/cash-flow-forecast">
                Read the 5-step guide →
              </a>
            </div>

            <p className="mka-hero-meta">
              <span>Works in the hosted demo</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Recomputed from current data</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>In-app bill reminders included</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. AVAILABILITY & PILLARS */}
      <Section id="overview" tone="parchment">
        <SectionHead
          kicker="Availability & inputs"
          title="A dated arithmetic calendar—not a black-box prediction."
          subtitle="Cycle Cash Flow, Safe to spend, and in-app bill reminders work at €0 in both the hosted demo and self-hosted Docker."
        />

        <B2AvailabilityBand
          demoTone="sage"
          demoBadge="Included at €0"
          demoTitle="Hosted demo (trytracky.app)"
          demoBody="Full cycle Cash Flow, Dashboard Safe to spend, first negative date alerts, and in-app bill reminders work right away on manual accounts and CSV imports. Multi-year Forecast scenarios are reserved for Pro (not for sale)."
          selfHostTone="sage"
          selfHostBadge="Included · MIT"
          selfHostTitle="Self-hosted Docker"
          selfHostBody="Identical projection engine on your own server, plus optional PSD2 bank sync and opt-in email (Resend) or Telegram delivery for low-balance and bill reminders when you configure your own keys."
        />

        <div style={{ marginTop: '1.75rem' }}>
          <B2PillarGrid
            items={[
              {
                tag: 'Row sources',
                title: 'Every recorded commitment in date order',
                body: 'Combines planned expenses and income, active subscriptions, instalments, card statements, planned transfers, and one-off scheduled ledger rows inside the chosen cycle.',
                footer: (
                  <>
                    <strong>No gaps:</strong> The ledger shows the next unpaid occurrence; Cash Flow lists every
                    occurrence in your selected cycle.
                  </>
                ),
              },
              {
                tag: 'Running math',
                title: 'Account & aggregate cash series',
                body: (
                  <>
                    Each row updates <code>balance after = balance before + inflow − outflow</code> for its account and
                    the primary-currency aggregate cash line.
                  </>
                ),
                footer: (
                  <>
                    <strong>Overdraft aware:</strong> For accounts with an overdraft facility, projected availability
                    receives the same dated movement.
                  </>
                ),
              },
              {
                tag: 'Early signal',
                title: 'First negative date & Safe to spend',
                body: 'Flags the earliest date a cash account or aggregate series dips below zero, while Dashboard Safe to spend subtracts remaining bills and money-box funding due.',
                footer: (
                  <>
                    <strong>Conservative by design:</strong> Scheduled inflows stay expected income and never inflate
                    Safe to spend before arrival.
                  </>
                ),
              },
            ]}
          />
        </div>
      </Section>

      {/* 3. HOW IT WORKS & GUARDRAILS */}
      <Section id="rules">
        <SectionHead
          kicker="Rules & guardrails"
          title="Why timing order matters—and what Cash Flow refuses to blur."
          subtitle="Knowing you earn enough over the whole month does not stop an overdraft on the 2nd if your salary arrives on the 27th."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Three timing rules built into the calendar</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Payday order is preserved exactly</strong>
                  <span>
                    A cycle starting on the 25th shows a salary on the 27th before rent on the 2nd; a cycle starting on
                    the 1st applies rent first. Preferences change the visible window, never the true due dates.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Card statements hit the settlement account</strong>
                  <span>
                    Credit card balances are debt, never cash liquidity, so they never trigger fake negative-cash
                    alerts. Instead, the closing statement appears on its due date against your settlement checking
                    account.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Reconciled items never count twice</strong>
                  <span>
                    Once a real transaction arrives and you link it or mark the planned occurrence paid, the row remains
                    traceable in history without subtracting from projected balances a second time.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Honest limits &amp; what stays separate</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--vermilion" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Unassigned items wait for an account</strong>
                  <span>
                    Expenses or subscriptions without a source account—or statements without a settlement account—stay
                    in the unassigned group until you assign an account in the matching currency.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Other currencies are never silently converted</strong>
                  <span>
                    Rows in a currency different from the account or primary series remain visible while their series is
                    marked not projected—no invented FX rates.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Money boxes stay virtual</strong>
                  <span>
                    Money-box funding needs appear alongside the calendar without modifying bank balances on their own.
                    Recording a contribution tracks intent; you move real cash at your bank separately.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>Cash Flow records intent, not bank orders:</strong> Creating a planned transfer, bill, or
              scheduled transaction never moves money at your bank or creditor. Projections are planning estimates built
              from your data, never financial advice.
            </div>
          </div>
        </div>
      </Section>

      {/* 4. FIT CHECK */}
      <Section id="fit" tone="parchment">
        <SectionHead
          kicker="Candid fit check"
          title="Who gets the most value from a dated Cash Flow calendar."
        />

        <FitCheck
          yesTitle="Good fit if you…"
          yesItems={[
            'Receive income on specific dates while rent, utilities, instalments, and card statements clear on others.',
            'Want to spot the earliest projected dip before a direct debit fails or an overdraft fee lands.',
            'Keep one main currency for cash accounts and reconcile paid bills so projections stay clean.',
            'Want Safe to spend to reflect real observed cash minus remaining commitments—not wishful future inflows.',
          ]}
          noTitle="Not the right fit if you…"
          noItems={[
            'Expect an AI model to guess unrecorded discretionary spending automatically.',
            'Want the app to initiate transfers or pay bills directly at your bank.',
            'Need multi-currency cash pooled into one combined forecast using live FX conversion.',
            'Want multi-year Forecast scenarios on Free today (multi-year Forecast is reserved for Pro, not for sale yet).',
          ]}
        />
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        tone="cotton"
        kicker="Cash Flow FAQ"
        title="Questions about cycles, unassigned rows, and negative dates."
        subtitle="Direct answers aligned with Tracky’s projection rules."
        moreLink={{ href: '/faq', label: 'Read the full FAQ →' }}
        items={cashFlowEnFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Continue exploring"
        title="Pair Cash Flow with the rest of your workflow."
        items={[
          {
            kicker: 'Step-by-step guide',
            title: 'How to forecast personal cash flow',
            description: 'Five practical steps: fund your Plan, add planned items, confirm subscriptions, read the first negative date, and act early.',
            href: '/guides/cash-flow-forecast',
            linkLabel: 'Read the guide →',
          },
          {
            kicker: 'Feature · Demo + Self-host',
            title: 'Zero-based Plan & targets',
            description: 'Assign observed cash into buckets before spending so your Cash Flow starts from an honest base.',
            href: '/features/zero-based-plan',
            linkLabel: 'Explore the Plan →',
          },
          {
            kicker: 'Step-by-step guide',
            title: 'Find & cancel unused subscriptions',
            description: 'Audit recurring debits from CSV history so only real active subscriptions shape your future renewals.',
            href: '/guides/cancel-unused-subscriptions',
            linkLabel: 'Read the guide →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Spot a cash-flow dip before your bank does."
        meta="€0 hosted demo · Cash Flow & in-app bill reminders included · Estimates, not guarantees"
        primaryCta={
          <B2AppCta
            auth={auth}
            locale="en"
            loggedInHref="/app/planning"
            loggedInLabel="Open Cash Flow →"
            loggedOutLabel="Try the demo free →"
            variant="marigold"
          />
        }
        secondaryCta={
          <a className="mka-btn-outline-light" href="/pricing">
            Compare Demo vs. Self-host →
          </a>
        }
      />
    </AtelierSite>
  );
}
