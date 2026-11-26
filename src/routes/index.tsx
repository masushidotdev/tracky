import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { FaqItem, FeatureCardItem, ProofTabItem, StepItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Chip,
  ChipRow,
  CodePlate,
  FaqSection,
  FeatureGrid,
  FinalCta,
  FitCheck,
  GITHUB_REPO_URL,
  HeroLedgerDiagram,
  PricingCards,
  ProofTabs,
  Section,
  SectionHead,
  StepCards,
} from '@/components/marketing/atelier';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const homeEnFaq: Array<FaqItem> = [
  {
    q: 'Is Tracky really €0, and is there a hidden trial?',
    a: 'Yes. Today Tracky costs €0 for both the hosted demo and MIT-licensed self-hosting, with no credit card and no trial timer. A Pro tier is reserved in code (for higher Analyst message limits, multiple Plans, and multi-year Forecast scenarios), but billing does not exist yet and no checkout exists anywhere in the app.',
  },
  {
    q: 'Do I have to connect my bank account?',
    a: 'No. Manual checking, savings, card, loan, investment, and asset accounts plus CSV import cover the full budgeting workflow. Automated PSD2 bank sync via Enable Banking is optional, requires your own Enable Banking app and keys, and is only available on self-hosted instances—never required and disabled on the hosted demo.',
  },
  {
    q: 'What happens to my bank CSV file when I import it?',
    a: 'Tracky reads and parses the CSV locally in your browser—the raw file is never uploaded. You map columns, review every row marked Valid, Duplicate, or Error with its reason, and only the valid rows you confirm are saved to your manual account.',
  },
  {
    q: 'How do Cash Flow projections work—and are they guaranteed?',
    a: 'Cash Flow starts from your latest observed cash balances and applies your recorded dated commitments—planned income and expenses, active subscriptions, instalments, card statements, and scheduled movements—to show the projected balance after each date and flag the first negative date. It is a planning estimate built from data in the app, never a guarantee or financial advice.',
  },
  {
    q: 'How are credit card limits and multiple currencies handled?',
    a: 'Credit card balances and limits never count as spendable cash or enter Safe to spend. Covered card purchases move into a dedicated card payment bucket, and the cash impact appears through the statement due on your settlement account so nothing counts twice. Different currencies are always tracked and reported separately—Tracky never invents exchange rates.',
  },
  {
    q: 'What does Docker self-hosting require, and what stays external?',
    a: 'You need Docker 24+ with Compose v2, Node.js 22 to run node scripts/selfhost-setup.mjs, and a free WorkOS AuthKit account. The Convex backend and TanStack Start app run locally in containers with telemetry hard-disabled, while WorkOS AuthKit remains an external authentication service. Enable Banking, AI Analyst, Resend, and Telegram stay off unless you configure your own keys.',
    aNode: (
      <>
        You need Docker 24+ with Compose v2, Node.js 22 to run <code>node scripts/selfhost-setup.mjs</code>, and a free
        WorkOS AuthKit account. The Convex backend and TanStack Start app run locally in containers with telemetry
        hard-disabled, while WorkOS AuthKit remains an external authentication service. Enable Banking, AI Analyst,
        Resend, and Telegram stay off unless you configure your own keys.
      </>
    ),
  },
];

const proofTabs: Array<ProofTabItem> = [
  {
    id: 'preview',
    tabLabel: '01 · Row-by-row validation',
    imageSrc: '/shots/import-preview.png',
    imageAlt:
      'Tracky CSV import preview showing 33 valid rows and 3 duplicates flagged before importing into the Demo account',
    imageWidth: 1440,
    imageHeight: 800,
    heading: 'Every row checked before a single euro lands',
    body: (
      <>
        Before writing to your manual account, Tracky classifies every line as <strong>Valid</strong>,{' '}
        <strong>Duplicate</strong>, or <strong>Error</strong> with a plain reason.
      </>
    ),
    checklist: [
      'Repeated lines in the same export (or prior imports) are automatically skipped.',
      'Only valid rows you explicitly confirm are sent—raw CSV files never leave your browser.',
      'One sidebar connects Dashboard, Plan, Reports, All Accounts, Cash Flow, Goals, and Subscriptions.',
    ],
    footnoteLabel: 'Safe re-imports:',
    footnote:
      'Interrupted mid-way? Re-run the same bank export—dedupe keys skip already stored movements without changing your balance.',
  },
  {
    id: 'mapping',
    tabLabel: '02 · Guided column mapping',
    imageSrc: '/shots/import-mapping.png',
    imageAlt:
      'Tracky CSV column mapping screen matching booking date, description, counterparty, and signed or split debit/credit columns',
    imageWidth: 1440,
    imageHeight: 800,
    heading: 'Map any bank export layout once and apply your rules',
    body: 'Banks format CSVs differently. Pick the destination manual account, match your columns, and choose how dates and amounts are structured.',
    checklist: [
      <>
        Supports 4 date formats (<code>YYYY-MM-DD</code>, <code>DD/MM/YYYY</code>, <code>MM/DD/YYYY</code>,{' '}
        <code>DD.MM.YYYY</code>).
      </>,
      <>
        Handles both decimal commas (<code>1.234,56</code>) and decimal points (<code>1,234.56</code>).
      </>,
      'Accepts one signed amount column or separate debit and credit columns, plus auto-categorization rules.',
    ],
    footnoteLabel: 'Currency discipline:',
    footnote: "Every row inherits the selected account's currency—import each currency into its matching account.",
  },
];

const steps: Array<StepItem> = [
  {
    num: 'Step 01',
    icon: 'import',
    title: 'Add accounts & import CSV',
    body: 'Create manual checking, savings, card, loan, or asset accounts—or enable PSD2 bank sync on your own self-hosted instance. Validate and deduplicate bank CSVs right in your browser.',
  },
  {
    num: 'Step 02',
    icon: 'envelopes',
    title: 'Give every euro a job',
    body: (
      <>
        Assign observed cash across Plan buckets until <strong>Ready to Assign</strong> reaches zero. Set weekly,
        monthly, yearly, or custom targets and preview Auto-Assign before confirming.
      </>
    ),
  },
  {
    num: 'Step 03',
    icon: 'cashflow',
    title: 'Project your cash-flow cycle',
    body: (
      <>
        Add known bills, paydays, active subscriptions, instalments, and card statements. Check{' '}
        <strong>Safe to spend</strong> on the Dashboard—available cash minus remaining bills and money-box funding still
        due—and spot the first projected negative date early.
      </>
    ),
  },
  {
    num: 'Step 04',
    icon: 'reports',
    title: 'Review, reconcile & export',
    body: 'Link arriving payments so scheduled bills never count twice. Filter Reports by category, counterparty, or tag, export aggregated CSVs, or download a full JSON backup anytime.',
  },
];

const features: Array<FeatureCardItem> = [
  {
    key: 'plan',
    icon: 'plan',
    spotTone: 'marigold',
    scope: 'both',
    scopeLabel: 'Demo + Self-host',
    title: 'Zero-based Plan & targets',
    description: (
      <>
        Track <strong>Assigned</strong>, <strong>Activity</strong>, and <strong>Available</strong> per bucket. Covered
        credit-card purchases move automatically into a dedicated card payment bucket so cash waits ready for the
        statement.
      </>
    ),
    factLabel: 'Key rule:',
    fact: 'Works only with observed cash in one currency per Plan. Positive Available carries forward; card limits never count as cash.',
    linkHref: '/features/zero-based-plan',
    linkLabel: 'Read Zero-based Plan details →',
  },
  {
    key: 'cashflow',
    icon: 'cashflow',
    spotTone: 'cobalt',
    scope: 'both',
    scopeLabel: 'Demo + Self-host',
    title: 'Cash-flow calendar & Safe to spend',
    description: (
      <>
        Lay known paydays, bills, active subscriptions, instalments, and card statements over your latest balances in
        date order. See your daily <strong>Safe to spend</strong> pace and the earliest date cash could dip below zero.
      </>
    ),
    factLabel: 'Key rule:',
    fact: 'Projections are estimates from recorded items, never guarantees. Always inspect the detail and last update before acting; expected inflows never inflate Safe to spend before arrival.',
    linkHref: '/features/cash-flow',
    linkLabel: 'Read Cash Flow details →',
  },
  {
    key: 'csv',
    icon: 'csv',
    spotTone: 'sage',
    scope: 'both',
    scopeLabel: 'Demo + Self-host',
    title: 'Browser-side CSV import & full ledger',
    description:
      'Import bank exports into manual checking or card accounts with column mapping, category rules, up to 10 colored tags per transaction, private notes, scheduled rows, and bulk actions.',
    factLabel: 'Key rule:',
    fact: 'CSV files are parsed strictly in your browser; only confirmed valid rows are saved, with idempotent duplicate skipping.',
    linkHref: '/vs-spreadsheets',
    linkLabel: 'Compare with spreadsheets →',
  },
  {
    key: 'reports',
    icon: 'reports',
    spotTone: 'vermilion',
    scope: 'both',
    scopeLabel: 'Demo + Self-host',
    title: 'Reports, virtual money boxes & debt payoff',
    description:
      'Explore Cash Flow Sankey, Spending, and Income breakdowns or monthly, quarterly, and yearly trends, save up to 20 views, track virtual savings goals, and simulate avalanche vs. snowball debt payoff.',
    factLabel: 'Key rule:',
    fact: 'Transfers stay out of spending totals. Export aggregated report CSVs per currency; money boxes stay virtual until you move real cash.',
    linkHref: '/features/reports',
    linkLabel: 'Read Reports details →',
  },
  {
    key: 'bank',
    icon: 'bank',
    spotTone: 'cobalt',
    scope: 'selfhost',
    scopeLabel: 'Self-host only',
    title: 'PSD2 bank sync via Enable Banking',
    description:
      "Connect supported banks with consent completed directly on your bank's page. Automatic sync is evaluated every six hours, with per-account aliases, hide/pause toggles, and import logs showing seen vs. skipped duplicates.",
    factLabel: 'Key rule:',
    fact: 'Disabled on the hosted demo. On your own instance, you bring your own Enable Banking app ID and PEM key—revocable anytime.',
    linkHref: '/features/bank-connections',
    linkLabel: 'Read Bank Sync details →',
  },
  {
    key: 'analyst',
    icon: 'analyst',
    spotTone: 'marigold',
    scope: 'selfhost',
    scopeLabel: 'Self-host only',
    title: 'Approval-gated AI Analyst',
    description:
      'Query your authorized ledger in plain language, run what-if comparisons, and receive duplicate or spending-spike flags—with optional Resend email or two-way Telegram delivery.',
    factLabel: 'Key rule:',
    fact: 'Disabled on the hosted demo. Exploration aid, never financial advice; every ledger write shows a preview and waits for your approval.',
    linkHref: '/features/ai-analyst',
    linkLabel: 'Read AI Analyst details →',
  },
];

export const Route = createFileRoute('/')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Tracky — Open-source zero-based budgeting & cash-flow planning',
      description:
        'Tracky is a free, MIT-licensed zero-based budgeting and cash-flow app. Assign observed cash, map dated bills, import CSVs locally, or self-host.',
      locale: 'en',
      path: '/',
      ogImage: ogImageFor('home'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/', inLanguage: ['en', 'it'] }),
        faqJsonLd(homeEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([{ name: 'Home', path: '/' }]),
      ],
    }),
  component: HomeEn,
});

function HomeEn() {
  const auth = Route.useLoaderData();

  // StrictMode double-invokes effects in dev: ref-guard keeps one landing_viewed.
  const landingSent = React.useRef(false);
  React.useEffect(() => {
    if (landingSent.current) return;
    landingSent.current = true;
    trackEvent(analyticsEvents.landingViewed, { auth_state: auth.user ? 'logged' : 'anon' });
  }, [auth.user]);

  return <HomeEnView auth={auth} />;
}

export function HomeEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/">
      {/* 1. HERO */}
      <section className="mka-hero">
        <div className="mka-container mka-hero-grid">
          <div>
            <ChipRow>
              <Chip tone="cobalt">MIT open source</Chip>
              <Chip tone="marigold">€0 today</Chip>
              <Chip>No card required</Chip>
              <Chip tone="sage">Docker self-host</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Zero-based budgeting and cash-flow planning, <span className="mka-accent-ink">out in the open.</span>
            </h1>

            <p className="mka-hero-dek">
              Give every euro already in your accounts a job before you spend it, project dated bills and card
              statements across your cycle, and verify every formula in public MIT-licensed code. Start in the hosted
              demo with manual accounts and CSV import, or self-host on Docker.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="en" ctaLocation="landing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/blog/self-hosting-tracky-docker">
                Self-host with Docker →
              </a>
            </div>

            <p className="mka-hero-meta">
              <span>Public release v0.1.0</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>No checkout or trial timer</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>English &amp; Italian user docs</span>
            </p>
          </div>

          <div className="mka-hero-art-card">
            <HeroLedgerDiagram locale="en" />
            <p className="mka-art-caption">
              <strong>Observed cash · Zero-based buckets · Dated commitments</strong>
              <span>Projections are estimates, not guarantees.</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. PRODUCT IN CONTEXT */}
      <Section id="product" tone="parchment">
        <SectionHead
          kicker="Inside the workspace"
          title="Bring a bank CSV into a clean ledger—validated in your browser first."
          subtitle="Real screenshots from the hosted demo. Tracky parses your bank export locally in the browser, flags duplicates and malformed rows before anything is stored, and keeps every account and tool in one calm sidebar."
        />
        <ProofTabs
          ariaLabel="Product walkthrough screenshots"
          metaNote="Hosted demo · Browser-parsed CSV"
          tabs={proofTabs}
        />
      </Section>

      {/* 3. HOW IT WORKS */}
      <Section id="how-it-works">
        <SectionHead
          kicker="How it works"
          title="Four steps from raw bank exports to a closed month."
          subtitle="Tracky anchors every decision to money already observed in your accounts—not projected paychecks you have not received yet or credit card limits."
        />
        <StepCards steps={steps} />
      </Section>

      {/* 4. FEATURES BY JOB-TO-BE-DONE */}
      <Section id="features" tone="parchment">
        <SectionHead
          kicker="Core capabilities"
          title="What Tracky does—and where each capability runs."
          subtitle="Every core planning, import, and reporting workflow works in the free hosted demo. Features requiring third-party credentials are clearly labeled as self-host only."
        />
        <FeatureGrid items={features} />
      </Section>

      {/* 5. TRUST, PRIVACY & ACCOUNTING RULES */}
      <Section id="trust">
        <SectionHead
          kicker="Trust, privacy & math"
          title="Verifiable rules and open code—instead of trust badges."
          subtitle="We do not publish customer logos, awards, or claims you cannot verify. Every calculation, security boundary, and external dependency is documented in the repository."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Four accounting rules enforced in code</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Credit card limits are never spendable cash</strong>
                  <span>
                    Card balances stay out of cash and Safe to spend. Purchases enter through the statement due on your
                    settlement account, so nothing is counted twice.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Each currency stays separate—never silently converted</strong>
                  <span>
                    Money is stored in integer minor units with its currency code. EUR, USD, and other currencies keep
                    separate totals across Dashboard, Plan, Cash Flow, and Reports.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Projections and suggestions are estimates, not guarantees</strong>
                  <span>
                    Cash Flow calculates from recorded items; subscription and transfer matches arrive as suggestions
                    for you to confirm; every total is a snapshot, and Tracky does not provide financial advice.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--vermilion" aria-hidden="true">
                  04
                </span>
                <div>
                  <strong>Your data stays portable and erasable</strong>
                  <span>
                    Download aggregated CSVs from Reports or request a full JSON export from Settings. Confirming Delete
                    account starts immediate, irreversible erasure.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Open source, privacy &amp; external services</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  MIT
                </span>
                <div>
                  <strong>Public repository &amp; recorded decisions</strong>
                  <span>
                    Convex backend, TanStack Start frontend, bilingual user docs (EN/IT), and architecture decision
                    records live at <code>masushidotdev/tracky</code>.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  CSV
                </span>
                <div>
                  <strong>Browser-local parsing, bring-your-own bank keys</strong>
                  <span>
                    Raw CSV files stay on your device. If you self-host bank sync via Enable Banking, you register your
                    own app and PEM key—maintainers never see your bank credentials.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  0
                </span>
                <div>
                  <strong>Zero telemetry in self-host; opt-in on demo</strong>
                  <span>
                    Docker self-host builds hard-disable PostHog, Convex beacons, and Wrangler telemetry. On the hosted
                    demo, EU-hosted PostHog stays off unless you explicitly click Accept, and masks balances and inputs.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>What stays external:</strong> Authentication uses <strong>WorkOS AuthKit</strong> (external
              service; free developer tier available) even when self-hosting. Bank sync (Enable Banking), AI models,
              email (Resend), and Telegram stay disabled unless you supply your own keys.
            </div>

            <div className="mka-trust-actions">
              <a className="mka-text-link" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                Inspect code on GitHub ↗
              </a>
              <a className="mka-text-link" href="/open-source">
                Read Open Source page →
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* 6. HOSTED DEMO VS SELF-HOST */}
      <Section id="deployment" tone="parchment">
        <SectionHead
          kicker="Two ways to run Tracky"
          title="Explore the hosted demo, or self-host the full stack with Docker."
          subtitle="Both run the same MIT-licensed codebase. The hosted demo keeps external integrations switched off so you can test budgeting and cash flow immediately without configuring keys."
        />

        <div className="mka-deploy-grid">
          <article className="mka-deploy-card">
            <div className="mka-deploy-head">
              <div>
                <h3>Hosted demo</h3>
                <p className="mka-deploy-sub">Ready at trytracky.app — no server setup</p>
              </div>
              <Chip tone="marigold">€0 · No card</Chip>
            </div>

            <ul className="mka-check-list">
              <li>Manual checking, savings, card, loan, and asset accounts</li>
              <li>Browser-side CSV import with mapping &amp; duplicate detection</li>
              <li>Zero-based Plan, targets, Auto-Assign, and card payment buckets</li>
              <li>Dashboard Safe to spend, cycle Cash Flow, and in-app bill reminders</li>
              <li>Reports (Sankey, breakdowns, trends, CSV export), Goals &amp; JSON export</li>
              <li className="is-muted">PSD2 bank sync is disabled on the hosted demo</li>
              <li className="is-muted">AI Analyst is disabled on the hosted demo</li>
            </ul>

            <div className="mka-deploy-cta">
              <AuthCta auth={auth} locale="en" ctaLocation="landing" />
            </div>
          </article>

          <article className="mka-deploy-card">
            <div className="mka-deploy-head">
              <div>
                <h3>Self-hosted (Docker)</h3>
                <p className="mka-deploy-sub">Your machine or single-node VPS, zero telemetry</p>
              </div>
              <Chip tone="cobalt">MIT · Your keys</Chip>
            </div>

            <ul className="mka-check-list">
              <li>Everything in the hosted demo on a self-hosted Convex SQLite volume</li>
              <li>Optional PSD2 bank sync with your own Enable Banking app &amp; keys</li>
              <li>Optional AI Analyst, Resend email reports, and Telegram bot</li>
              <li>Product analytics and backend beacons hard-disabled at build time</li>
              <li className="is-muted">
                Requires Docker 24+ (Compose v2), Node.js 22 (for setup script), and a free WorkOS AuthKit account
              </li>
            </ul>

            <CodePlate
              ariaLabel="Docker self-hosting commands"
              lines={[
                { text: '# Configure WorkOS & generate local .env (0600)', comment: true },
                { text: 'node scripts/selfhost-setup.mjs' },
                { text: 'docker compose up -d' },
              ]}
            />

            <div className="mka-deploy-cta">
              <a className="mka-btn-secondary mka-btn-secondary--sm" href="/blog/self-hosting-tracky-docker">
                Docker self-host guide →
              </a>
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/docs/self-hosting.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub self-host docs ↗
              </a>
              <a className="mka-text-link" href="/open-source">
                Architecture overview →
              </a>
            </div>
          </article>
        </div>
      </Section>

      {/* 7. WHO IT IS FOR / NOT FOR */}
      <Section id="fit">
        <SectionHead
          kicker="Candid fit check"
          title="Who Tracky is built for—and where it is not the right tool yet."
          subtitle="An honest check up front saves everyone time. Tracky is opinionated about observed cash, single-currency accuracy, and user control."
        />

        <FitCheck
          yesTitle="Good fit if you…"
          yesItems={[
            'Want to replace brittle spreadsheets with dated balances, zero-based envelopes, and clean CSV import and export.',
            'Need to see rent, tax deadlines, instalments, and card statements stacked in date order before a cash dip arrives.',
            'Keep personal and freelance or household accounts organized in one workspace and want clean per-currency CSV exports.',
            'Value open-source MIT software you can audit line by line or run on your own Docker host with your own keys.',
          ]}
          noTitle="Not the right fit yet if you…"
          noItems={[
            'Want turnkey bank sync inside a hosted cloud app without self-hosting or registering your own Enable Banking app keys.',
            'Need separate multi-user logins for partners or family members—Tracky is a single-user workspace (though couples can review one shared plan together).',
            'Expect automatic FX conversion merging EUR, USD, and other currencies into a single combined net-worth figure.',
            'Require a completely air-gapped self-host with zero external services—Docker self-hosting still requires WorkOS AuthKit for sign-in.',
          ]}
        />
      </Section>

      {/* 8. PRICING */}
      <Section id="pricing" tone="parchment">
        <SectionHead
          kicker="Pricing"
          title="€0 today—no card, no trial clock, no checkout."
          subtitle="Tracky is free to use in the hosted demo and MIT-licensed to self-host. A Pro tier exists in the codebase as a reserved slot, but billing is not implemented and nothing is for sale."
        />

        <PricingCards
          free={{
            tag: 'Free — Available today',
            figure: '€0',
            description: 'Full core budgeting loop on the hosted demo or your own MIT self-hosted server.',
            bullets: [
              'Zero-based Plan, targets, Auto-Assign & card payment buckets',
              'Dashboard Safe to spend, cycle Cash Flow & in-app bill reminders',
              'Manual accounts, browser-side CSV import & Reports CSV export',
              'Virtual money boxes, Goals, debt payoff calculator & JSON export',
              'Self-host from GitHub under the MIT license (20/day Analyst allowance when enabled)',
            ],
            cta: (
              <>
                <AuthCta auth={auth} locale="en" ctaLocation="landing" />
                <a className="mka-text-link" href="/pricing">
                  Full pricing page →
                </a>
              </>
            ),
          }}
          pro={{
            tag: 'Pro — Reserved, not for sale',
            figure: 'No price · No checkout',
            description: 'Scaffolded in code for power-user limits; nobody can buy or be charged for Pro today.',
            bullets: [
              'Higher daily AI Analyst allowance (100 messages/day vs. 20/day)',
              'Multiple Plans and multi-year Forecast scenarios (estimates only)',
              'Long-term FIRE projections via Analyst (nominal estimates, not advice)',
              'No payment form, no trial countdown, and core Free features stay untouched',
            ],
          }}
        />
      </Section>

      {/* 9. FAQ */}
      <FaqSection
        id="faq"
        kicker="Frequently asked questions"
        title="Straight answers before you open an account."
        subtitle="Every answer below reflects the shipped codebase and documentation in v0.1.0—including what stays switched off on the hosted demo."
        moreLink={{ href: '/faq', label: 'Read the full FAQ page →' }}
        items={homeEnFaq}
      />

      {/* 10. FINAL CTA POSTER */}
      <FinalCta
        id="go"
        headline="See where your cash stands before the next bill lands."
        meta="€0 today · No credit card · MIT open source · Public release v0.1.0"
        primaryCta={<AuthCta auth={auth} locale="en" ctaLocation="landing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            Inspect MIT repo ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
