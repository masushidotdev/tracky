import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { ComparisonRow, FaqItem, MarketingAuth, StepItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  ComparisonTable,
  FaqSection,
  FinalCta,
  FitCheck,
  Section,
  SectionHead,
  StepCards,
} from '@/components/marketing/atelier';
import { RelatedLinksSection } from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const freelancersEnFaq: Array<FaqItem> = [
  {
    q: 'Does Tracky work for freelancers with irregular invoice income?',
    a: 'Yes. Because Tracky anchors your Plan to observed cash already in your accounts—never expected invoices—you assign money only when a client pays. Keep work and personal accounts separate, add upcoming tax deadlines as planned items, and inspect Cash Flow as estimates from known commitments.',
  },
  {
    q: 'How should I track taxes and quarterly deadlines in Tracky?',
    a: 'Record each tax deadline as a planned item with its due date, amount, and settlement account so it weighs on Cash Flow and Safe to spend immediately. Pair it with a virtual money box to track the tax share you set aside from each invoice. When you pay, link the real movement so the deadline stops weighing on future dates.',
  },
  {
    q: 'Can I import bank CSVs and export clean files for my accountant?',
    a: 'Yes. Import bank exports locally in your browser into active manual checking or card accounts with column mapping and duplicate skipping, keeping each currency in its matching account. From Reports, filter by account, category, or tag to export aggregated CSV summaries per currency, or download a full JSON backup from Settings.',
  },
  {
    q: 'Do money boxes move real bank cash, and are subscription detections guaranteed?',
    a: 'No to both. Money boxes are virtual reserves inside Tracky—they track what you set aside without moving bank balances, so record or link the real transfer when cash moves between accounts. Subscription detection arrives as suggestions for you to confirm merchant, amount, and cadence before treating a renewal as a commitment.',
  },
];

const comparisonRows: Array<ComparisonRow> = [
  {
    capability: 'Work vs. personal balances',
    demo: { text: 'One mixed checking balance makes large invoices look spendable', tone: 'no' },
    selfHost: { text: 'Separate manual work and personal accounts in one workspace', tone: 'yes' },
  },
  {
    capability: 'Tax deadlines & VAT / pension dates',
    demo: { text: 'Remembered in calendar notes, missing from bank balance', tone: 'no' },
    selfHost: { text: 'Planned dated items in Cash Flow + virtual tax money box', tone: 'yes' },
  },
  {
    capability: 'Irregular client payments',
    demo: { text: 'Slow months feel like emergencies because obligations stay hidden', tone: 'no' },
    selfHost: { text: 'Zero-based Plan assigns observed cash; Safe to spend shows pace', tone: 'yes' },
  },
  {
    capability: 'Software & tool renewals',
    demo: { text: 'Annual SaaS renewals hit unannounced', tone: 'no' },
    selfHost: { text: 'Confirmed subscriptions enter Cash Flow with due reminders', tone: 'yes' },
  },
  {
    capability: 'Multi-currency clients (EUR / USD / GBP)',
    demo: { text: 'Mixed exports or manual exchange estimates', tone: 'no' },
    selfHost: { text: 'One account per currency; separate totals everywhere', tone: 'yes' },
  },
  {
    capability: 'Accountant & tax-season handoff',
    demo: { text: 'Unfiltered bank statements mixing groceries and client expenses', tone: 'no' },
    selfHost: { text: 'Account-filtered aggregated Report CSVs & full JSON export', tone: 'yes' },
  },
];

const routineSteps: Array<StepItem> = [
  {
    num: 'Step 01',
    icon: 'import',
    title: 'Split work and personal accounts',
    body: 'Create separate manual accounts for business and personal cash (one per currency) and import bank CSVs locally in your browser with duplicate detection.',
  },
  {
    num: 'Step 02',
    icon: 'envelopes',
    title: 'Reserve taxes before assigning income',
    body: 'When a client invoice clears, track the tax share in a virtual money box and assign the remaining observed cash in your zero-based Plan until Ready to Assign hits zero.',
  },
  {
    num: 'Step 03',
    icon: 'cashflow',
    title: 'Put tax dates into Cash Flow',
    body: 'Add tax instalments, accountant fees, rent, and confirmed software subscriptions as dated items to see Safe to spend and the earliest projected cash dip.',
  },
  {
    num: 'Step 04',
    icon: 'reports',
    title: 'Reconcile & export for your accountant',
    body: 'Link real payments to planned items so nothing counts twice. Filter Reports by work account, category, or tags to export aggregated per-currency CSVs or a JSON backup.',
  },
];

export const Route = createFileRoute('/for-freelancers')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Budgeting for freelancers — Separate work, life & taxes · Tracky',
      description:
        'Separate work and personal accounts, map tax deadlines in Cash Flow, reserve taxes in virtual money boxes, and export per-currency CSV reports. €0 demo.',
      locale: 'en',
      path: '/for-freelancers',
      ogImage: ogImageFor('for-freelancers'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/for-freelancers', inLanguage: ['en', 'it'] }),
        faqJsonLd(freelancersEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'For freelancers', path: '/for-freelancers' },
        ]),
      ],
    }),
  component: FreelancersEn,
});

function FreelancersEn() {
  const auth = Route.useLoaderData();
  return <FreelancersEnView auth={auth} />;
}

export function FreelancersEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/for-freelancers">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Breadcrumb"
              items={[{ label: 'Home', href: '/' }, { label: 'For freelancers' }]}
            />

            <ChipRow>
              <Chip tone="cobalt">Work &amp; life split</Chip>
              <Chip tone="marigold">Tax dates in Cash Flow</Chip>
              <Chip tone="sage">Per-currency CSV reports</Chip>
              <Chip>€0 hosted demo</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Irregular invoices. <span className="mka-accent-ink">Regular cash-flow control.</span>
            </h1>

            <p className="mka-hero-dek">
              When client payments arrive late while rent, software tools, and tax deadlines arrive on schedule, a
              single mixed checking balance lies to you. Tracky keeps work and personal accounts separate, places tax
              deadlines inside Cash Flow as dated commitments, and lets you export clean per-currency report CSVs when
              tax season arrives.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/features/cash-flow">
                See how Cash Flow works →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. MIXED POT VS SPLIT LEDGER */}
      <Section id="comparison" tone="parchment">
        <SectionHead
          kicker="The structural fix"
          title="Mixed checking pot vs. a split freelancer ledger."
          subtitle="Keep one workspace for visibility while separating business accounts, tax reserves, and personal spending."
        />

        <ComparisonTable
          caption="Comparison between mixing freelance and personal cash in one account versus using Tracky"
          headers={['Freelance pressure point', 'One mixed account', 'Split ledger in Tracky']}
          rows={comparisonRows}
        />
      </Section>

      {/* 3. FOUR-STEP WEEKLY ROUTINE */}
      <Section id="routine">
        <SectionHead
          kicker="Weekly routine"
          title="Four calm steps from cleared invoice to clear Safe to spend."
          subtitle="Tracky never counts unpaid invoices as cash—every step works strictly from observed balances and recorded commitments."
        />

        <StepCards steps={routineSteps} />
      </Section>

      {/* 4. EDITORIAL DETAILS */}
      <Section id="details" tone="parchment">
        <SectionHead
          kicker="Practical boundaries"
          title="Why separate accounts, virtual tax reserves, and honest projections matter."
          subtitle="Tracky is a personal budgeting and cash-flow tool, not an accounting ERP or tax advisor—here is exactly how to get the most from it."
        />

        <div className="mka-editorial-grid" style={{ marginBottom: '2rem' }}>
          <article className="mka-editorial-card">
            <h3>Why irregular income breaks a mixed account</h3>
            <p>
              When a large invoice lands in the same account you use for groceries, the balance feels comfortable until
              quarterly taxes or annual tool renewals arrive. Slow client months then feel like emergencies even when
              your full-year income is healthy.
            </p>
            <p>
              Separating work and personal manual accounts—and logging tax dates as planned items in Cash Flow—shows
              what is genuinely available after commitments. Remember that Cash Flow projections are planning estimates
              built from recorded items, never guarantees.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Virtual reserves, tags &amp; accountant exports</h3>
            <p>
              Use a virtual money box to track the tax reserve set aside from each paid invoice without duplicating bank
              balances; when you transfer real cash to a tax savings account, link the actual transfer. Tag business
              expenses (up to 10 colored tags per movement) and attach private notes for invoice references.
            </p>
            <p>
              When your accountant asks for summaries, filter <strong>Reports</strong> to your work accounts and export
              aggregated CSVs per currency (formatted with commas or semicolons for your locale), or download a full
              JSON backup from <strong>Settings</strong>.
            </p>
          </article>
        </div>

        <FitCheck
          yesTitle="Good fit for freelancers who…"
          yesItems={[
            'Want clear separation between work accounts, tax commitments, and personal zero-based buckets in one workspace.',
            'Bill clients in EUR, USD, or other currencies and want separate per-currency totals without invented FX rates.',
            'Prefer browser-side CSV imports or self-hosted Docker with optional Enable Banking sync.',
          ]}
          noTitle="Not built to replace…"
          noItems={[
            'Official invoicing, e-fattura / VAT filing, or statutory double-entry bookkeeping software.',
            'Tax or financial advice—always confirm tax obligations and calculations with your accountant.',
            'Multi-user team finance tools with separate logins for business partners or bookkeepers.',
          ]}
        />
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        kicker="Freelancer FAQ"
        title="Questions about irregular income, taxes, and exports."
        subtitle="Straight answers matching the shipped v0.1.0 capabilities."
        items={freelancersEnFaq}
      />

      {/* 6. RELATED LINKS */}
      <RelatedLinksSection
        tone="parchment"
        kicker="Explore next"
        title="Tools that keep freelance cash flow readable."
        items={[
          {
            kicker: 'Feature',
            title: 'Cash-flow calendar & Safe to spend',
            description: 'Stack tax dates, rent, and confirmed renewals over your observed balances.',
            href: '/features/cash-flow',
            ctaLabel: 'Read Cash Flow →',
          },
          {
            kicker: 'Feature',
            title: 'Reports & per-currency CSV export',
            description: 'Filter by work account, category, or tags and save up to 20 reusable views.',
            href: '/features/reports',
            ctaLabel: 'Read Reports →',
          },
          {
            kicker: 'Comparison',
            title: 'Tracky vs. spreadsheets',
            description: 'Keep CSV imports and exports without repairing fragile Excel formulas.',
            href: '/vs-spreadsheets',
            ctaLabel: 'Read comparison →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Invoice, reserve taxes, and see what is truly yours to spend."
        meta="€0 hosted demo · No credit card · MIT open source"
        primaryCta={<AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href="/pricing">
            See Pricing &amp; self-host →
          </a>
        }
      />
    </AtelierSite>
  );
}
