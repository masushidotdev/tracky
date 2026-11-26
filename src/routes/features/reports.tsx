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

export const reportsEnFaq: Array<FaqItem> = [
  {
    q: 'What does the Reports CSV export contain?',
    a: 'Export CSV downloads the current trend series and breakdown totals as report-<tab>-<from>-<to>.csv, grouped by currency. It contains aggregated report values rather than individual drill-down transactions. Tracky uses a comma separator for decimal-point locales and a semicolon for decimal-comma locales so spreadsheets open cleanly.',
  },
  {
    q: 'How are multiple currencies handled in Reports?',
    a: 'Every currency gets its own section with Income, Expenses, Net, and Savings rate (net divided by income, or zero when there is no income). Charts, drill-down lists, and CSV rows stay grouped by currency—Tracky never converts or merges amounts behind your back.',
  },
  {
    q: 'What is the difference between Breakdown and Trends?',
    a: 'Breakdown compares groups across the selected date range using a donut or horizontal bars (or a flow diagram on the Cash Flow tab). Trends splits the same data into monthly, quarterly, or yearly intervals with grouped or stacked bars.',
  },
  {
    q: 'How do Saved reports work?',
    a: 'Configure your tab, mode, chart style, date preset, grouping, accounts, categories, tags, and amount limits, then save the view under a recognizable name. You can store up to 20 views; they save configuration only, so relative ranges like This month follow the current month automatically.',
  },
  {
    q: 'Why do some transactions stay out of Reports?',
    a: 'Transfers and internal movements are excluded from Spending and Income so only classified expenses and income count. Transactions marked Hidden from reports never appear in totals or drill-down rows. Charts display the ten largest groups and roll smaller ones into Other—open any named group to inspect its individual transactions.',
  },
];

export const Route = createFileRoute('/features/reports')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Reports: Cash Flow Sankey, breakdowns & CSV export · Tracky',
      description:
        'Cash Flow Sankey, Spending, and Income reports with Breakdown vs. Trends, drill-down, up to 20 saved views, and per-currency CSV export.',
      locale: 'en',
      path: '/features/reports',
      ogImage: ogImageFor('feature-reports'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/reports', inLanguage: ['en', 'it'] }),
        faqJsonLd(reportsEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Reports', path: '/features/reports' },
        ]),
      ],
    }),
  component: ReportsEn,
});

function ReportsEn() {
  const auth = Route.useLoaderData();
  return <ReportsEnView auth={auth} />;
}

export function ReportsEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/features/reports">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb ariaLabel="Breadcrumb" items={[{ label: 'Home', href: '/' }, { label: 'Reports' }]} />

            <div className="mka-b2-hero-badges">
              <ScopePill scope="both" label="Demo + Self-host" />
              <Chip tone="marigold">€0 today</Chip>
              <Chip>Per-currency sections</Chip>
              <Chip>Aggregated CSV export</Chip>
            </div>

            <h1 className="mka-hero-headline">
              Spending, income, and cash-flow reports <span className="mka-accent-ink">with clean numbers.</span>
            </h1>

            <p className="mka-hero-dek">
              Explore where money comes from and where it goes across three focused tabs—<strong>Cash Flow</strong>{' '}
              Sankey, <strong>Spending</strong>, and <strong>Income</strong>. Switch between Breakdown and Trends, drill
              into underlying transactions, save up to 20 reusable views, and export per-currency CSV totals.
            </p>

            <div className="mka-hero-actions">
              <B2AppCta
                auth={auth}
                locale="en"
                loggedInHref="/app/reports"
                loggedInLabel="Open Reports →"
                loggedOutLabel="Try Reports in the demo →"
              />
              <a className="mka-btn-secondary" href="/vs-spreadsheets">
                Compare with spreadsheets →
              </a>
            </div>

            <p className="mka-hero-meta">
              <span>Works in the hosted demo</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Transfers excluded automatically</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Never invents exchange rates</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. AVAILABILITY & THE THREE TABS */}
      <Section id="overview" tone="parchment">
        <SectionHead
          kicker="Availability & tabs"
          title="Three tabs built for distinct financial questions."
          subtitle="Every tab, filter, saved view, and CSV export is included at €0 on both the hosted demo and self-hosted Docker."
        />

        <B2AvailabilityBand
          demoTone="sage"
          demoBadge="Included at €0"
          demoTitle="Hosted demo (trytracky.app)"
          demoBody="Cash Flow Sankey, Spending, Income, Breakdown and Trends modes, transaction drill-down, up to 20 saved views, and aggregated CSV export work immediately on manual accounts and CSV imports."
          selfHostTone="sage"
          selfHostBadge="Included · MIT"
          selfHostTitle="Self-hosted Docker"
          selfHostBody="Runs the identical reporting engine locally. If you enable the optional AI Analyst on your self-hosted instance, it can query the same exact date-range aggregations in chat."
        />

        <div style={{ marginTop: '1.75rem' }}>
          <B2PillarGrid
            items={[
              {
                tag: 'Tab 01',
                title: 'Cash Flow',
                body: 'Compares incoming and outgoing money. Composition mode draws a Sankey flow diagram connecting income sources to spending groups and categories.',
                footer: (
                  <>
                    <strong>KPIs per currency:</strong> Income, Expenses, Net, and Savings rate (net ÷ income).
                  </>
                ),
              },
              {
                tag: 'Tab 02',
                title: 'Spending',
                body: 'Tracks classified debit expenses only—leaving transfers and internal movements out—using donut or horizontal bars in Breakdown, or grouped/stacked bars in Trends.',
                footer: (
                  <>
                    <strong>Instant drill-down:</strong> Select any named segment, legend row, or bar to inspect the
                    newest matching transactions.
                  </>
                ),
              },
              {
                tag: 'Tab 03',
                title: 'Income',
                body: 'Focuses strictly on classified credit income with the same clean transfer exclusion, ready to group by category, counterparty, or account across months, quarters, or years.',
                footer: (
                  <>
                    <strong>Focused clarity:</strong> Charts keep the ten largest groups visible and bundle smaller
                    entries into <strong>Other</strong>.
                  </>
                ),
              },
            ]}
          />
        </div>
      </Section>

      {/* 3. FILTERS, SAVED VIEWS & CSV */}
      <Section id="workflow">
        <SectionHead
          kicker="Filtering & export"
          title="Filter down to the exact answer, save the view, or export CSV."
          subtitle="Reports stay read-only over your ledger so you can slice periods, tags, and counterparties without altering a single booking."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Granular filters &amp; up to 20 saved views</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Relative or custom date ranges</strong>
                  <span>
                    Pick presets such as last 30 days, this month, this year, or last 12 months—or exact start and end
                    dates. Relative presets evaluate when you open the report, so <strong>This month</strong> always
                    follows the current month.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Group &amp; slice across dimensions</strong>
                  <span>
                    Group by category, category group, counterparty, or account; switch Trends between monthly,
                    quarterly, and yearly intervals; filter by accounts, categories, tags (matching at least one
                    selected tag), and min/max amounts.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Save, restore, rename, or delete views</strong>
                  <span>
                    Store up to 20 named report configurations in <strong>Saved reports</strong>. Saving a view stores
                    settings only—never duplicate transaction copies.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Currency discipline &amp; CSV export</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  FX
                </span>
                <div>
                  <strong>Separate sections per currency</strong>
                  <span>
                    EUR, USD, and other currencies are always totaled, charted, drilled down, and exported separately.
                    Use account filters whenever you want to focus on one currency or institution.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  CSV
                </span>
                <div>
                  <strong>Spreadsheet-ready aggregated export</strong>
                  <span>
                    <strong>Export CSV</strong> downloads trend series and breakdown totals as{' '}
                    <code>report-&lt;tab&gt;-&lt;from&gt;-&lt;to&gt;.csv</code>, choosing a comma for decimal-point
                    locales and a semicolon for decimal-comma locales.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--vermilion" aria-hidden="true">
                  HIDE
                </span>
                <div>
                  <strong>Hidden transactions stay hidden</strong>
                  <span>
                    Any movement marked <strong>Hidden from reports</strong> (manually or via an auto-categorization
                    rule) stays out of every total and drill-down list.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>Aggregated vs. full backup:</strong> Reports CSV exports aggregated totals and trend series, not
              individual drill-down rows. Whenever you need a full raw copy of your workspace, request a full JSON export
              from <strong>Settings</strong>.
            </div>
          </div>
        </div>
      </Section>

      {/* 4. FIT CHECK */}
      <Section id="fit" tone="parchment">
        <SectionHead
          kicker="Candid fit check"
          title="Who Tracky Reports are built for—and what they intentionally leave out."
        />

        <FitCheck
          yesTitle="Good fit if you…"
          yesItems={[
            'Run a household or freelance activity across multiple accounts and want transfers kept out of spending.',
            'Want one-click saved views for recurring reviews such as monthly spending, yearly income, or tagged projects.',
            'Need clean per-currency CSV summaries to hand to an accountant or drop into a spreadsheet.',
            'Like drilling straight from a chart bar or donut slice into the underlying booked transactions.',
          ]}
          noTitle="Not the right fit if you…"
          noItems={[
            'Expect automatic exchange-rate conversion combining EUR and USD into one blended chart.',
            'Need raw line-item accounting ledgers inside the report CSV (use Settings JSON export for full raw data).',
            'Require formal tax filing or double-entry bookkeeping reports for a corporation.',
          ]}
        />
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        tone="cotton"
        kicker="Reports FAQ"
        title="Questions about CSV exports, currencies, and saved views."
        subtitle="Every detail matches Tracky’s reporting implementation in v0.1.0."
        moreLink={{ href: '/faq', label: 'Read the full FAQ →' }}
        items={reportsEnFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Continue exploring"
        title="Connected parts of Tracky."
        items={[
          {
            kicker: 'Feature · Demo + Self-host',
            title: 'Zero-based Plan & targets',
            description: 'Reports and Plan share the exact same global categories—tag or categorize once and both stay in sync.',
            href: '/features/zero-based-plan',
            linkLabel: 'Explore the Plan →',
          },
          {
            kicker: 'Feature · Demo + Self-host',
            title: 'Cash Flow projection calendar',
            description: 'Reports look back at what happened; Cash Flow projects known future bills onto observed balances.',
            href: '/features/cash-flow',
            linkLabel: 'Explore Cash Flow →',
          },
          {
            kicker: 'Comparison',
            title: 'Tracky vs. spreadsheets',
            description: 'Keep CSV portability while dropping fragile formulas, manual duplicate checks, and broken pivot tables.',
            href: '/vs-spreadsheets',
            linkLabel: 'Read the comparison →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Clean totals per currency, ready to inspect or export."
        meta="€0 hosted demo · All 3 report tabs & CSV export included · No credit card"
        primaryCta={
          <B2AppCta
            auth={auth}
            locale="en"
            loggedInHref="/app/reports"
            loggedInLabel="Open Reports →"
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
