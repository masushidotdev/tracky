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
  FitCheck,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { RelatedLinksSection } from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const couplesEnFaq: Array<FaqItem> = [
  {
    q: 'How does Tracky work for couples and families if it is a single-user workspace?',
    a: 'Tracky derives identity from a single session and does not offer separate multi-user logins yet. One account owner maintains a single household Plan over the household accounts—same balances, same buckets, and one activity ledger—that partners review together at one table instead of reconciling two separate spreadsheets.',
  },
  {
    q: 'How do we save for school fees, insurance, and holidays without surprises?',
    a: 'Give each goal a virtual money box with a target amount and date, and link it to its Plan bucket. Tracky displays the eligible savings as Already set aside inside Available so the bucket target asks only for what is still missing—an estimate that adjusts automatically each month without double-saving.',
  },
  {
    q: 'What happens when a household bucket goes over budget?',
    a: 'The bucket shows a clear shortfall so you can decide together instead of guessing. Move Available cash from another bucket to cover cash overspending, or fund the dedicated card payment bucket when an uncovered purchase went on a credit card. Left uncovered, cash overspending reduces next month’s Ready to Assign.',
  },
  {
    q: 'How should a couple or family get started with Tracky?',
    a: 'Open the free hosted demo with no card required, add the household manual accounts in their currency, and create one Plan with buckets for housing, groceries, school, insurance, and holidays. Link existing savings as virtual money boxes where helpful, then assign observed cash until Ready to Assign reaches zero.',
  },
];

const householdBuckets = [
  {
    tag: 'Monthly core',
    tone: 'cobalt' as const,
    title: 'Housing & utilities',
    body: 'Rent, mortgage payments, and recurring utility bills funded in one Plan bucket before the month starts.',
    foot: 'Linked to dated Cash Flow commitments so due dates stay visible.',
  },
  {
    tag: 'Day to day',
    tone: 'sage' as const,
    title: 'Groceries & household',
    body: 'One shared bucket and one activity ledger—review what is Available before shopping instead of guessing.',
    foot: 'Covered credit card purchases move automatically to the card payment bucket.',
  },
  {
    tag: 'Annual target',
    tone: 'marigold' as const,
    title: 'School & insurance',
    body: 'Set an annual target with a real due date. Skip a month and next month’s suggested ask adjusts automatically.',
    foot: 'Pair with a virtual money box to count savings as Already set aside.',
  },
  {
    tag: 'Sinking fund',
    tone: 'vermilion' as const,
    title: 'Holidays & repairs',
    body: 'Set aside a steady slice every month in a virtual money box without creating a second bank balance.',
    foot: 'Booked from funded cash, never from hoped-for future paychecks.',
  },
];

export const Route = createFileRoute('/for-couples-and-families')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Budgeting for couples & families — One household Plan · Tracky',
      description:
        'Run one household Plan on observed balances, shared buckets, and virtual money boxes for school, bills, and holidays. Single-user workspace, €0 demo.',
      locale: 'en',
      path: '/for-couples-and-families',
      ogImage: ogImageFor('for-couples'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/for-couples-and-families', inLanguage: ['en', 'it'] }),
        faqJsonLd(couplesEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'For couples & families', path: '/for-couples-and-families' },
        ]),
      ],
    }),
  component: CouplesEn,
});

function CouplesEn() {
  const auth = Route.useLoaderData();
  return <CouplesEnView auth={auth} />;
}

export function CouplesEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/for-couples-and-families">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Breadcrumb"
              items={[{ label: 'Home', href: '/' }, { label: 'For couples & families' }]}
            />

            <ChipRow>
              <Chip tone="cobalt">One household Plan</Chip>
              <Chip tone="sage">Virtual money boxes</Chip>
              <Chip>Single-user workspace</Chip>
              <Chip tone="marigold">€0 hosted demo</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              One household ledger. <span className="mka-accent-ink">The same numbers at one table.</span>
            </h1>

            <p className="mka-hero-dek">
              When one partner pays rent and the other covers groceries, surprises happen even when everyone spends
              carefully. Tracky lets one account owner maintain a single zero-based household Plan—same observed
              balances, same buckets, and virtual money boxes for school, insurance, and holidays—so you review the
              month together from one clear screen.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/features/zero-based-plan">
                Explore Zero-based Plan →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HOUSEHOLD BUCKETS */}
      <Section id="buckets" tone="parchment">
        <SectionHead
          kicker="Household structure"
          title="Four core buckets that replace monthly guesswork."
          subtitle="Give every observed euro a job before the month begins, and pre-fund irregular annual costs with linked virtual money boxes."
        />

        <div className="mka-b1-cards-4">
          {householdBuckets.map((card) => (
            <article className="mka-b1-card" key={card.title}>
              <span className={`mka-b1-card-tag mka-b1-card-tag--${card.tone}`}>{card.tag}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <div className="mka-b1-card-foot">{card.foot}</div>
            </article>
          ))}
        </div>
      </Section>

      {/* 3. HOW A HOUSEHOLD USES TRACKY */}
      <Section id="workflow">
        <SectionHead
          kicker="How it works together"
          title="From two blind spots to one shared review."
          subtitle="A zero-based Plan replaces retrospective arguments with forward-looking choices on real cash."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Why two wallets create a blind spot</h3>
            <p>
              Rent leaves one account, groceries leave another, and both partners estimate what is still free to spend.
              School fees land in September, annual car insurance arrives in March, and a holiday gets booked on hope
              rather than funded cash.
            </p>
            <p>
              Nobody is being reckless—the household simply lacks one shared place where observed cash is assigned to
              real jobs before spending starts.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>One monthly sit-down on real balances</h3>
            <p>
              Income lands in <strong>Ready to Assign</strong> and gets distributed across housing, groceries, school,
              and holidays until Ready to Assign reaches zero. Linking a virtual money box to a Plan bucket displays
              existing savings as <strong>Already set aside</strong>, so targets ask only for what is still missing.
            </p>
            <p>
              If a category runs over, the shortfall is visible immediately: move <strong>Available</strong> cash from
              another bucket, or fund the card payment bucket if it went on a credit card. No guesswork, no silent
              rollover.
            </p>
          </article>
        </div>
      </Section>

      {/* 4. CANDID FIT CHECK (SINGLE-USER TRANSPARENCY) */}
      <Section id="fit" tone="parchment">
        <SectionHead
          kicker="Honest fit check"
          title="When Tracky fits a household—and when it does not yet."
          subtitle="We would rather be clear about our single-user workspace model up front than surprise you after setup."
        />

        <FitCheck
          yesTitle="Works well if your household…"
          yesItems={[
            'Sits down together weekly or monthly to review one shared Plan, one ledger, and one set of observed balances.',
            'Wants annual bills (school fees, insurance, property tax) funded steadily through dated targets and linked virtual money boxes.',
            'Uses manual accounts and browser-side CSV imports—or self-hosts with Docker for optional PSD2 bank sync.',
            'Needs clear credit card rules so covered card spending waits safely for the monthly statement.',
          ]}
          noTitle="Not the right fit yet if you…"
          noItems={[
            'Require separate multi-user logins, individual permissions, or per-partner audit trails inside one workspace.',
            'Need automatic cross-currency consolidation merging EUR and USD household accounts into one combined total.',
            'Want turnkey hosted bank sync without self-hosting or registering your own Enable Banking keys.',
          ]}
        />
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        kicker="Household FAQ"
        title="Questions couples and families ask before starting."
        subtitle="Clear answers on single-user access, virtual money boxes, and covering overspending."
        items={couplesEnFaq}
      />

      {/* 6. RELATED LINKS */}
      <RelatedLinksSection
        tone="parchment"
        kicker="Explore next"
        title="Guides for setting up your household Plan."
        items={[
          {
            kicker: 'Feature',
            title: 'Zero-based Plan & targets',
            description: 'Weekly, monthly, yearly, and custom targets plus Auto-Assign previews.',
            href: '/features/zero-based-plan',
            ctaLabel: 'Read Plan details →',
          },
          {
            kicker: 'Guide',
            title: 'Zero-based budgeting guide',
            description: 'Walk through assigning observed cash down to zero and handling rollovers.',
            href: '/guides/zero-based-budgeting',
            ctaLabel: 'Read budgeting guide →',
          },
          {
            kicker: 'Pricing',
            title: '€0 hosted demo vs. MIT self-host',
            description: 'See everything included free today with no card and no checkout.',
            href: '/pricing',
            ctaLabel: 'Read Pricing →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="One table. One Plan. The same observed numbers."
        meta="€0 hosted demo · No credit card · MIT open source"
        primaryCta={<AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href="/faq">
            Read the full FAQ →
          </a>
        }
      />
    </AtelierSite>
  );
}
