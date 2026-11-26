import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { FaqItem } from '@/components/marketing/atelier';
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
    title: 'Anchor your forecast to real cash balances',
    body: 'Start from the latest observed balance of every cash account in your main currency, keeping credit card debt outside your spendable cash pool. Fund your zero-based Plan first so you know what is already spoken for before looking ahead.',
    note: 'In Tracky: Cash Flow begins from your latest observed cash balances and keeps CARD accounts separate from aggregate liquidity.',
  },
  {
    title: 'Record known bills, paydays, and one-off commitments with dates',
    body: 'List every fixed bill, expected payday, planned transfer, loan instalment, card statement, and one-off scheduled payment with its real date, amount, and source account. Leaving off a source account hides which balance will actually absorb the debit.',
    note: 'In Tracky: assign a source account to every expense and a settlement account to every card statement so nothing sits in the unassigned group.',
  },
  {
    title: 'Confirm active subscriptions and drop stale ones',
    body: 'Bring recurring charges into your calendar only after verifying merchant, amount, billing interval, and next due date. Keep genuinely active renewals in the forecast and pause or end services you stopped paying so phantom charges do not skew your numbers.',
    note: 'In Tracky: automatic subscription detection is always a suggestion you confirm before it enters renewals and Cash Flow.',
  },
  {
    title: 'Read the dated running balance to spot the first negative date',
    body: 'Walk down the timeline row by row, applying balance before + inflow − outflow on each date. Pay attention to sequence: a healthy end-of-month balance still fails if rent and a card statement land three days before your salary clears. Flag the earliest date the series drops below zero.',
    note: 'In Tracky: Cash Flow shows both per-account and aggregate primary-currency series and highlights the first projected negative date.',
  },
  {
    title: 'Act early and reconcile payments as they land',
    body: 'When a dip appears, act while you have time: trim a discretionary outflow, add real income, or move a due date only if the true payment date changed. Once a payment clears at your bank, reconcile it against the planned row so it never subtracts from your forecast twice.',
    note: 'In Tracky: link arriving transactions or mark planned items paid—reconciled rows stay visible in history without double counting.',
  },
];

export const guideCashFlowEnFaq: Array<FaqItem> = [
  {
    q: 'What do I need before I start forecasting personal cash flow?',
    a: 'You need your latest observed cash balances in one main currency, a list of dated bills, paydays, instalments, and card statements with their source accounts, and your confirmed active subscriptions. Every cash-flow projection is an arithmetic planning estimate based on recorded items, not a guarantee.',
  },
  {
    q: 'Why does an unassigned row matter in a cash-flow calendar?',
    a: 'If an expense or subscription has no source account—or a credit card statement has no settlement account—you still see the obligation, but no account series can subtract it yet. Assigning the matching cash account in the same currency makes the projected balance accurate.',
  },
  {
    q: 'Can I trust automatic subscription detection without reviewing it?',
    a: 'No. Pattern matching looks at merchant names, currency, similar amounts, and spacing between dates, so regular grocery trips or price-changed plans can look misleading. Always verify merchant, amount, interval, and next due date before marking a subscription Active.',
  },
  {
    q: 'Do virtual money boxes or planned transfers move money at my bank?',
    a: 'No. Virtual money boxes and planned transfers track savings targets and intent inside your planning tool without moving real bank funds. Link a money box to a bucket to see Already set aside, and execute any actual transfer separately with your bank.',
  },
];

export const Route = createFileRoute('/guides/cash-flow-forecast')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'How to forecast personal cash flow in 5 steps · Tracky',
      description:
        'A practical five-step guide to personal cash-flow forecasting: real cash balances, dated commitments, active subscriptions, first negative date, and early action.',
      locale: 'en',
      path: '/guides/cash-flow-forecast',
      ogImage: ogImageFor('guide-cashflow'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/guides/cash-flow-forecast', inLanguage: ['en', 'it'] }),
        faqJsonLd(guideCashFlowEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to forecast cash-flow in Tracky',
          step: guideSteps.map((step) => ({ '@type': 'HowToStep', name: step.title, text: step.body })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Cash-flow forecast guide', path: '/guides/cash-flow-forecast' },
        ]),
      ],
    }),
  component: GuideEn,
});

function GuideEn() {
  const auth = Route.useLoaderData();
  return <GuideCashFlowEnView auth={auth} />;
}

export function GuideCashFlowEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/guides/cash-flow-forecast">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Breadcrumb"
              items={[
                { label: 'Home', href: '/' },
                { label: 'Cash-flow forecast guide' },
              ]}
            />

            <ChipRow>
              <Chip tone="cobalt">Evergreen guide</Chip>
              <Chip>5 practical steps</Chip>
              <Chip tone="sage">Estimates, not guarantees</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              How to forecast <span className="mka-accent-ink">personal cash flow</span> before bills collide.
            </h1>

            <p className="mka-hero-dek">
              A monthly budget tells you whether total income covers total expenses. A personal cash-flow forecast
              answers the timing question: will enough cash sit in the right account on the exact day rent, instalments,
              and card statements clear?
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-secondary" href="#steps">
                Jump to the 5 steps ↓
              </a>
              <B2AppCta
                auth={auth}
                locale="en"
                loggedInHref="/app/planning"
                loggedInLabel="Open Cash Flow →"
                loggedOutLabel="Build your calendar in the demo →"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. EDUCATIONAL FOUNDATION */}
      <Section id="why-timing-matters" tone="parchment">
        <SectionHead
          kicker="Why timing matters"
          title="A month can be profitable on paper and still overdraw on the 2nd."
          subtitle="Cash-flow forecasting is simple arithmetic in date order—no statistical guesswork required."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Order of dates changes everything</h3>
            <p>
              Suppose your checking account holds <strong>€1,800</strong>, rent of <strong>€900</strong> leaves on the
              2nd, subscriptions of <strong>€150</strong> clear mid-month, and a <strong>€2,200</strong> salary lands on
              the 27th. If your cycle starts on the 25th, salary lands first; if it starts on the 1st, outflows reduce
              your balance to €750 before payday arrives.
            </p>
            <p>
              Stacking commitments in true calendar sequence reveals short-term troughs that monthly averages completely
              hide.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Common forecasting mistakes to avoid</h3>
            <ul className="mka-b2-prose-list">
              <li>
                <strong>Counting expected paychecks as spendable today:</strong> treat future inflows as expected items,
                not cash already safe to spend.
              </li>
              <li>
                <strong>Treating credit card limits as cash:</strong> card spending creates debt; the real cash outflow
                hits your checking account on the statement due date.
              </li>
              <li>
                <strong>Forgetting to reconcile paid bills:</strong> leaving a paid bill open subtracts it twice and
                creates false alarms.
              </li>
            </ul>
          </article>
        </div>
      </Section>

      {/* 3. FIVE STEPS */}
      <Section id="steps">
        <SectionHead
          kicker="Step-by-step method"
          title="Build a reliable personal cash-flow calendar in five steps."
          subtitle="Every projection is a planning estimate built from known items—update it as balances and commitments evolve."
        />

        <B2GuideSteps steps={guideSteps} stepPrefix="Step" />
      </Section>

      {/* 4. HOW TRACKY HELPS */}
      <Section id="how-tracky-helps" tone="parchment">
        <SectionHead
          kicker="How Tracky helps"
          title="A dated Cash Flow calendar and Safe to spend built into the free demo."
          subtitle="Apply all five steps at €0 on trytracky.app using manual accounts and browser-parsed CSV import, or on your own MIT self-hosted Docker server."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">What Tracky automates cleanly</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>All dated commitments in one timeline</strong>
                  <span>
                    Combines planned income and expenses, active subscriptions, loan instalments, card statements,
                    planned transfers, and one-off scheduled ledger rows inside your chosen cycle window.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>First negative date &amp; Safe to spend</strong>
                  <span>
                    Flags the earliest projected negative date per account and across aggregate primary-currency cash,
                    while Dashboard <strong>Safe to spend</strong> subtracts remaining bills and money-box funding
                    without inflating today’s figure with future paydays.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>In-app bill reminders &amp; clean reconciliation</strong>
                  <span>
                    Planned expenses trigger configurable in-app reminders (default three days ahead, up to four
                    thresholds), and linking arriving payments prevents double counting.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Honest guardrails</h3>
            <ul className="mka-check-list">
              <li>Works in the hosted demo with zero bank credentials required</li>
              <li>Card balances never distort cash liquidity; statements hit settlement accounts</li>
              <li>Mixed currencies stay visible without silent FX conversion</li>
              <li className="is-muted">Creating planned items records intent only—you execute real bank payments yourself</li>
              <li className="is-muted">Multi-year Forecast scenarios are reserved for Pro (not for sale today)</li>
            </ul>

            <div className="mka-trust-actions" style={{ marginTop: 'auto' }}>
              <a className="mka-text-link" href="/features/cash-flow">
                Read full Cash Flow feature details →
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
        title="Common questions about personal cash-flow forecasting."
        subtitle="Practical answers on accounts, subscriptions, and virtual money boxes."
        moreLink={{ href: '/faq', label: 'Read the full FAQ →' }}
        items={guideCashFlowEnFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Keep reading"
        title="Related guides and features."
        items={[
          {
            kicker: 'Feature · Demo + Self-host',
            title: 'Cash Flow projection in Tracky',
            description: 'Explore account series, aggregate liquidity, unassigned rows, and cycle controls in detail.',
            href: '/features/cash-flow',
            linkLabel: 'Explore Cash Flow →',
          },
          {
            kicker: 'Evergreen guide',
            title: 'How to build a zero-based budget',
            description: 'Fund your buckets from observed cash first so your Cash Flow projection rests on clean numbers.',
            href: '/guides/zero-based-budgeting',
            linkLabel: 'Read Zero-based guide →',
          },
          {
            kicker: 'Evergreen guide',
            title: 'Find & cancel unused subscriptions',
            description: 'Verify which recurring charges belong in your forecast and drop duplicates before renewal.',
            href: '/guides/cancel-unused-subscriptions',
            linkLabel: 'Read Subscriptions guide →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Spot the cash dip early and adjust on your terms."
        meta="€0 hosted demo · Cash Flow calendar & in-app reminders included · Estimates, not guarantees"
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
          <a className="mka-btn-outline-light" href="/features/cash-flow">
            Cash Flow details →
          </a>
        }
      />
    </AtelierSite>
  );
}
