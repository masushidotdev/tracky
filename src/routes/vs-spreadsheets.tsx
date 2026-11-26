import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { ComparisonRow, FaqItem, ProofTabItem, StepItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  ComparisonTable,
  FaqSection,
  FinalCta,
  GITHUB_REPO_URL,
  ProofTabs,
  Section,
  SectionHead,
  StepCards,
} from '@/components/marketing/atelier';
import { RelatedLinksSection } from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const vsSpreadsheetsEnFaq: Array<FaqItem> = [
  {
    q: 'Switching from a spreadsheet to Tracky, what habits do I keep?',
    a: 'You keep full CSV control and your budgeting discipline. You import bank exports into manual checking or card accounts with column mapping and browser-side validation, work strictly from observed dated balances, and export aggregated CSV reports per currency or a full JSON backup whenever you want.',
  },
  {
    q: 'How do I import my bank history without creating duplicates?',
    a: 'Select a CSV with a header row, map the columns, and review the Valid, Duplicate, or Error badge on every line before confirming. Tracky identifies duplicates by account, date, direction, amount, currency, and normalized description—so re-importing the same file after an interruption skips already stored rows without changing your balance.',
  },
  {
    q: 'What happens to recurring bills and subscriptions?',
    a: 'Tracky suggests likely subscriptions from merchant, amount, and date spacing, and waits for your confirmation before treating any renewal as active. Confirmed commitments enter Cash Flow alongside planned expenses, instalments, and card statements as planning estimates from recorded items, never guarantees.',
  },
  {
    q: 'Do I lose my envelope system when moving off spreadsheets?',
    a: 'No—you keep the exact envelope model with accounting rules enforced in code. Create Plan buckets with Assigned, Activity, and Available, or link a virtual money box so savings already held show as Already set aside and targets ask only for what remains. Recording a virtual contribution does not move bank cash.',
  },
];

const comparisonRows: Array<ComparisonRow> = [
  {
    capability: 'Account balances',
    demo: { text: 'Copied by hand; ages between edits', tone: 'no' },
    selfHost: { text: 'Observed, dated balances stored in minor units', tone: 'yes' },
  },
  {
    capability: 'Budget formulas & invariants',
    demo: { text: 'Custom cell formulas break silently on row inserts', tone: 'no' },
    selfHost: { text: 'Zero-based Plan rules enforced in typed code', tone: 'yes' },
  },
  {
    capability: 'Bank CSV imports',
    demo: { text: 'Manual copy-paste; easy to double-import rows', tone: 'no' },
    selfHost: { text: 'Browser-local parser with column mapping & dedupe keys', tone: 'yes' },
  },
  {
    capability: 'Credit card spending',
    demo: { text: 'Often double-counted or treated as cash until statement day', tone: 'no' },
    selfHost: { text: 'Covered spending moves into a dedicated card payment bucket', tone: 'yes' },
  },
  {
    capability: 'Multiple currencies',
    demo: { text: 'Manual FX tabs or mixed totals in one column', tone: 'no' },
    selfHost: { text: 'Every currency stays separate—never silently converted', tone: 'yes' },
  },
  {
    capability: 'Upcoming bills & cash-flow cycle',
    demo: { text: 'Separate reminder tab you update by hand', tone: 'opt' },
    selfHost: { text: 'Dated Cash Flow calendar, Safe to spend & first negative date', tone: 'yes' },
  },
  {
    capability: 'History, search & exports',
    demo: { text: 'Split across budget_2026_v7_final.xlsx tabs', tone: 'no' },
    selfHost: { text: 'Queryable ledger, aggregated CSV reports & full JSON export', tone: 'yes' },
  },
];

const proofTabs: Array<ProofTabItem> = [
  {
    id: 'preview',
    tabLabel: '01 · Preview & duplicate detection',
    imageSrc: '/shots/import-preview.png',
    imageAlt:
      'Tracky CSV import preview showing 33 valid rows and 3 duplicates flagged before importing into a manual account',
    imageWidth: 1440,
    imageHeight: 800,
    heading: 'Every row checked locally before touching your balance',
    body: (
      <>
        Instead of pasting bank rows into a fragile sheet, Tracky parses the CSV in your browser and marks every line{' '}
        <strong>Valid</strong>, <strong>Duplicate</strong>, or <strong>Error</strong> with a plain reason.
      </>
    ),
    checklist: [
      'Raw CSV files stay in your browser—only the valid rows you confirm are saved.',
      'Repeated rows in the same file or earlier imports are skipped automatically.',
      'Re-run the same export safely if an import is ever interrupted.',
    ],
    footnoteLabel: 'Zero formula upkeep:',
    footnote: 'Imported debits and credits update your manual account balance and feed Plan, Cash Flow, and Reports.',
  },
  {
    id: 'mapping',
    tabLabel: '02 · Column mapping & rules',
    imageSrc: '/shots/import-mapping.png',
    imageAlt:
      'Tracky CSV column mapping screen matching booking date, description, counterparty, and amount columns',
    imageWidth: 1440,
    imageHeight: 800,
    heading: 'Adapt to any bank CSV format without reformatting in Excel',
    body: 'Choose your manual checking or card account, map the columns from your header row, and pick date and decimal conventions.',
    checklist: [
      <>
        Accepts 4 date formats (<code>YYYY-MM-DD</code>, <code>DD/MM/YYYY</code>, <code>MM/DD/YYYY</code>,{' '}
        <code>DD.MM.YYYY</code>).
      </>,
      <>
        Parses both decimal commas (<code>1.234,56</code>) and decimal points (<code>1,234.56</code>).
      </>,
      'Supports single signed amount columns or separate debit/credit columns plus automatic category rules.',
    ],
    footnoteLabel: 'One currency per account:',
    footnote: 'Every imported row inherits the destination account currency so currencies never mix.',
  },
];

const migrationSteps: Array<StepItem> = [
  {
    num: 'Step 01',
    icon: 'import',
    title: 'Create manual accounts per currency',
    body: 'Set up your active manual checking or card accounts in their real currency—one account per currency so totals stay clean.',
  },
  {
    num: 'Step 02',
    icon: 'envelopes',
    title: 'Import your latest bank CSV',
    body: 'Map date, description, counterparty, and amounts in your browser, inspect Valid/Duplicate/Error rows, and apply category rules.',
  },
  {
    num: 'Step 03',
    icon: 'cashflow',
    title: 'Assign observed cash & dated bills',
    body: 'Give every observed euro a job in Plan buckets until Ready to Assign hits zero, then add recurring bills and statements to Cash Flow.',
  },
  {
    num: 'Step 04',
    icon: 'reports',
    title: 'Keep spreadsheets for ad-hoc analysis',
    body: 'Export aggregated CSV breakdowns and trends per currency from Reports (comma or semicolon formatted for your locale) or download a JSON backup.',
  },
];

export const Route = createFileRoute('/vs-spreadsheets')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Tracky vs. spreadsheets — Keep the CSV, drop the formula upkeep',
      description:
        'Compare spreadsheets and Tracky: observed dated balances, browser-side CSV import with deduplication, zero-based Plan rules, and Cash Flow. Free €0 demo.',
      locale: 'en',
      path: '/vs-spreadsheets',
      ogImage: ogImageFor('vs-spreadsheets'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/vs-spreadsheets', inLanguage: ['en', 'it'] }),
        faqJsonLd(vsSpreadsheetsEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Vs spreadsheets', path: '/vs-spreadsheets' },
        ]),
      ],
    }),
  component: VsSpreadsheetsEn,
});

function VsSpreadsheetsEn() {
  const auth = Route.useLoaderData();
  return <VsSpreadsheetsEnView auth={auth} />;
}

export function VsSpreadsheetsEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/vs-spreadsheets">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Breadcrumb"
              items={[{ label: 'Home', href: '/' }, { label: 'Tracky vs. spreadsheets' }]}
            />

            <ChipRow>
              <Chip tone="sage">Browser-parsed CSV</Chip>
              <Chip tone="cobalt">Observed dated balances</Chip>
              <Chip>Separate currencies</Chip>
              <Chip tone="marigold">€0 hosted demo</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Keep your CSV discipline. <span className="mka-accent-ink">Drop the spreadsheet upkeep.</span>
            </h1>

            <p className="mka-hero-dek">
              Spreadsheets rely on pasted balances and hand-maintained formulas that break silently when you insert a
              row. Tracky anchors your zero-based Plan to observed, dated balances, validates bank CSVs in your browser
              with duplicate skipping, and projects dated commitments in Cash Flow—while keeping CSV and JSON exports
              one click away.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/features/zero-based-plan">
                How Zero-based Plan works →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SIDE-BY-SIDE COMPARISON */}
      <Section id="comparison" tone="parchment">
        <SectionHead
          kicker="Side by side"
          title="Budget spreadsheet vs. Tracky: what changes on day one."
          subtitle="You do not lose control or transparency—you move the accounting rules from fragile cell references into verifiable open-source code."
        />

        <ComparisonTable
          caption="Side-by-side comparison between manual spreadsheets and Tracky"
          headers={['Workflow', 'Spreadsheet (Excel / Sheets)', 'Tracky (MIT open source)']}
          rows={comparisonRows}
        />
      </Section>

      {/* 3. REAL CSV SCREENSHOTS */}
      <Section id="csv-workflow">
        <SectionHead
          kicker="CSV without the chores"
          title="Real screenshots: browser-side CSV mapping and validation."
          subtitle="Bring a bank export straight into a manual checking or card account. Your file stays in your browser, duplicates are flagged before saving, and balances update automatically."
        />

        <ProofTabs
          ariaLabel="Tracky CSV import workflow screenshots"
          metaNote="Hosted demo · Local browser parser"
          tabs={proofTabs}
        />
      </Section>

      {/* 4. WHERE SHEETS BREAK + HOW TO MIGRATE */}
      <Section id="why-switch" tone="parchment">
        <SectionHead
          kicker="Why spreadsheets stall"
          title="Where hand-maintained sheets break—and how to move over cleanly."
          subtitle="Most spreadsheet budgets fail from maintenance friction, not lack of discipline."
        />

        <div className="mka-editorial-grid" style={{ marginBottom: '2.25rem' }}>
          <article className="mka-editorial-card">
            <h3>Where the sheet breaks</h3>
            <p>
              Every month begins with the same ritual: pasting balances, hunting down a broken formula reference, and
              wondering which version of <code>budget_2026_v7_final.xlsx</code> is current.
            </p>
            <p>
              Recurring payments hide in rows you forgot to copy forward, credit card purchases look like spendable cash
              until the statement lands, and mixed currencies collapse into a single misleading total. You end up
              reconciling last month instead of steering this one.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>What changes in Tracky</h3>
            <p>
              Every decision starts from observed, dated balances stored in integer minor units. You allocate real cash
              into buckets tracking <strong>Assigned</strong>, <strong>Activity</strong>, and <strong>Available</strong>,
              while covered credit card spending moves automatically into a dedicated card payment bucket.
            </p>
            <p>
              Cash Flow stacks known bills, confirmed subscriptions, instalments, and statements in date order to flag
              the first projected negative date—strictly as estimates from recorded items, never guarantees.
            </p>
          </article>
        </div>

        <StepCards steps={migrationSteps} />
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        kicker="Spreadsheet migration FAQ"
        title="Questions about CSV history, duplicates, and envelopes."
        subtitle="Practical answers for moving an existing Excel or Google Sheets budget into Tracky."
        items={vsSpreadsheetsEnFaq}
      />

      {/* 6. RELATED LINKS */}
      <RelatedLinksSection
        tone="parchment"
        kicker="Explore next"
        title="See the workflows that replace your tabs."
        items={[
          {
            kicker: 'Feature',
            title: 'Zero-based Plan & targets',
            description: 'How Ready to Assign, bucket carry-forward, Auto-Assign, and card payment buckets work.',
            href: '/features/zero-based-plan',
            ctaLabel: 'Read Plan details →',
          },
          {
            kicker: 'Feature',
            title: 'Cash-flow calendar & Safe to spend',
            description: 'See dated bills, paydays, and statements stacked in order before a cash dip hits.',
            href: '/features/cash-flow',
            ctaLabel: 'Read Cash Flow →',
          },
          {
            kicker: 'Feature',
            title: 'Reports & per-currency CSV export',
            description: 'Cash Flow Sankey, spending/income trends, saved views, and locale-aware CSV exports.',
            href: '/features/reports',
            ctaLabel: 'Read Reports →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Keep the CSV. Drop the manual formula upkeep."
        meta="Browser-side CSV import · Aggregated CSV & JSON export · €0 hosted demo"
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
