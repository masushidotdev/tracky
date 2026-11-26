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

export const zeroBasedPlanEnFaq: Array<FaqItem> = [
  {
    q: 'Do I have to assign Ready to Assign all the way down to zero?',
    a: 'No, though zero is the goal you work toward. A positive Ready to Assign means some observed cash does not have a job yet, and unassigned cash tends to drift into unchosen spending. You can pause, move money between buckets, or preview Auto-Assign before confirming.',
  },
  {
    q: 'Why does income not appear as Activity inside a bucket?',
    a: 'Income funds the Plan instead of counting as negative spending. You see it in Ready to Assign and its breakdown alongside carry, inflows, assignments, money-box reserves, and cash overspending. Buckets track only booked spending and refunds in their categories.',
  },
  {
    q: 'What is the difference between cash overspending and credit overspending?',
    a: 'Cash overspending means money already left a cash account, so you cover it by moving Available funds from another bucket; otherwise Ready to Assign is reduced next month. Credit overspending means a card purchase lacked bucket coverage: no cash left yet, so you fund that card’s payment bucket before paying the statement.',
  },
  {
    q: 'How do bucket targets handle annual bills?',
    a: 'Add a yearly target with its due date and choose Refill up to. Each month Tracky computes the remaining need from what is already available and the time left, adjusting automatically if you skip a month. Monthly spending fits Monthly with Refill up to, while accumulating funds fit Set aside another.',
  },
  {
    q: 'Are linked money boxes real bank transfers, and are subscription detections certain?',
    a: 'No to both. A linked money box is a virtual reserve displayed as Already set aside, read fresh each month so it reduces a bucket target without becoming a new assignment or moving bank cash. Subscription detections remain suggestions until you confirm merchant, amount, and cadence.',
  },
];

export const Route = createFileRoute('/features/zero-based-plan')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Zero-based Plan: give every euro a job · Tracky',
      description:
        'Assign observed cash to Plan buckets until Ready to Assign hits zero. Targets, Auto-Assign, card payment buckets, and single-currency math.',
      locale: 'en',
      path: '/features/zero-based-plan',
      ogImage: ogImageFor('feature-plan'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/zero-based-plan', inLanguage: ['en', 'it'] }),
        faqJsonLd(zeroBasedPlanEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Zero-based Plan', path: '/features/zero-based-plan' },
        ]),
      ],
    }),
  component: PlanEn,
});

function PlanEn() {
  const auth = Route.useLoaderData();
  return <ZeroBasedPlanEnView auth={auth} />;
}

export function ZeroBasedPlanEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/features/zero-based-plan">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Breadcrumb"
              items={[{ label: 'Home', href: '/' }, { label: 'Zero-based Plan' }]}
            />

            <div className="mka-b2-hero-badges">
              <ScopePill scope="both" label="Demo + Self-host" />
              <Chip tone="marigold">€0 today</Chip>
              <Chip>Single currency per Plan</Chip>
              <Chip>No double counting</Chip>
            </div>

            <h1 className="mka-hero-headline">
              Give every euro already in your accounts <span className="mka-accent-ink">a job before you spend it.</span>
            </h1>

            <p className="mka-hero-dek">
              Tracky’s zero-based Plan works strictly with money already observed in your cash accounts—never future
              paychecks or credit card limits. Assign funds across purpose-built buckets until{' '}
              <strong>Ready to Assign</strong> reaches zero, with protected card payment buckets and transparent monthly
              carry.
            </p>

            <div className="mka-hero-actions">
              <B2AppCta
                auth={auth}
                locale="en"
                loggedInHref="/app/plan"
                loggedInLabel="Open the Plan →"
                loggedOutLabel="Try the Plan in the demo →"
              />
              <a className="mka-btn-secondary" href="/guides/zero-based-budgeting">
                Read the 5-step guide →
              </a>
            </div>

            <p className="mka-hero-meta">
              <span>Works in the hosted demo</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Manual accounts &amp; browser-parsed CSV</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>No credit card required</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. AVAILABILITY & THE THREE COLUMNS */}
      <Section id="overview" tone="parchment">
        <SectionHead
          kicker="Availability & structure"
          title="Three columns per bucket—available in both the hosted demo and self-host."
          subtitle="Every Plan uses one currency and organizes global transaction categories into ordered groups and buckets."
        />

        <B2AvailabilityBand
          demoTone="sage"
          demoBadge="Included at €0"
          demoTitle="Hosted demo (trytracky.app)"
          demoBody="The full zero-based Plan—buckets, targets, Auto-Assign previews, card payment buckets, and linked money boxes—works out of the box with manual accounts and CSV import. Free includes one Plan; additional Plans are reserved for Pro (not for sale)."
          selfHostTone="sage"
          selfHostBadge="Included · MIT"
          selfHostTitle="Self-hosted Docker"
          selfHostBody="Runs the identical Plan engine on your local Convex volume with zero telemetry, plus optional PSD2 bank sync if you configure your own Enable Banking keys."
        />

        <div style={{ marginTop: '1.75rem' }}>
          <B2PillarGrid
            items={[
              {
                tag: 'Column 01',
                title: 'Assigned',
                body: 'The observed cash you allocate to a bucket during the selected month. Edit inline or move funds between buckets without changing total Assigned.',
                footer: (
                  <>
                    <strong>Rule:</strong> Funded from <strong>Ready to Assign</strong>, never from credit limits or
                    arranged overdrafts.
                  </>
                ),
              },
              {
                tag: 'Column 02',
                title: 'Activity',
                body: 'Net booked spending and refunds in the categories mapped to that bucket. Click any Activity figure to inspect the underlying transactions.',
                footer: (
                  <>
                    <strong>Excluded:</strong> Income, transfers, internal movements, non-booked items, and other
                    currencies never distort Activity.
                  </>
                ),
              },
              {
                tag: 'Column 03',
                title: 'Available',
                body: (
                  <>
                    What remains in the bucket: <code>positive carry + Assigned + Activity</code>. Positive Available
                    carries into next month so annual funds accumulate naturally.
                  </>
                ),
                footer: (
                  <>
                    <strong>No silent rollover debt:</strong> Negative cash balances do not carry forward—they reduce
                    next month’s Ready to Assign until covered.
                  </>
                ),
              },
            ]}
          />
        </div>
      </Section>

      {/* 3. ACCOUNTING GUARDRAILS */}
      <Section id="accounting">
        <SectionHead
          kicker="Accounting rules"
          title="Observed liquidity, clean card debt, and zero unexplained euros."
          subtitle="Zero-based budgeting breaks down when card limits look like cash or transfers count twice. Tracky enforces clear boundaries in code."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Ready to Assign &amp; clean starting dates</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Real inflows, never leftovers</strong>
                  <span>
                    Open Ready to Assign to inspect carry, income, card borrowing, pre-origin movements, perimeter
                    transfers, assignments, reserves, and cash overspending. <strong>Unexplained movement</strong>{' '}
                    should stay at zero—any non-zero value signals a movement that still needs attribution.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Plan origin &amp; Restart from here</strong>
                  <span>
                    A Plan starts on the day you create it: earlier transactions stay inside account balances without
                    creating bucket Activity or overspending. Need a cleaner cutoff after importing history? Use{' '}
                    <strong>Restart from here</strong> while keeping groups, buckets, targets, and assignments intact.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Overdrafts without double counting</strong>
                  <span>
                    When a current account is overdrawn, a notice tracks the deficit and recovery pace. An arranged
                    overdraft is never money to assign, and you do not need a payoff bucket—unassigned future income
                    reduces the negative balance automatically.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--vermilion" aria-hidden="true">
                  04
                </span>
                <div>
                  <strong>Unplanned catches unmapped categories</strong>
                  <span>
                    Categories not yet placed in a bucket appear in the system <strong>Unplanned</strong> row whenever
                    they have Activity, so real spending never vanishes. Assign each one to an existing or new bucket.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Cards, instalments &amp; virtual money boxes</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  CARD
                </span>
                <div>
                  <strong>Protected card payment buckets</strong>
                  <span>
                    Card balances and limits stay outside cash liquidity. Covered card purchases move cash into the
                    card’s payment bucket automatically, waiting for the statement. Recording the statement transfer
                    settles the cycle without counting the purchase twice.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  RATE
                </span>
                <div>
                  <strong>Active instalment buckets</strong>
                  <span>
                    Each ordinary active instalment plan gets a protected bucket for the month’s due amount. If a loan
                    is paired with one of your categories, Tracky uses that category instead of creating a duplicate
                    row.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  BOX
                </span>
                <div>
                  <strong>Linked money boxes as Already set aside</strong>
                  <span>
                    Link an eligible virtual money box to an ordinary bucket to show its saved balance as{' '}
                    <strong>Already set aside</strong>. It lowers the bucket target fairly without becoming a new
                    assignment, and is read fresh each month so savings are never counted twice.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>One currency per Plan:</strong> Tracky never mixes EUR, USD, or other currencies inside the same
              Plan or invents exchange rates. Confirmed transfers between two cash accounts in the same Plan stay
              neutral even if booked in different months.
            </div>
          </div>
        </div>
      </Section>

      {/* 4. TARGETS & AUTO-ASSIGN */}
      <Section id="workflow" tone="parchment">
        <SectionHead
          kicker="Monthly workflow"
          title="Targets, Auto-Assign previews, and focused views."
          subtitle="Close the month faster without handing over control—every guidance tool previews its math before anything is written."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Targets &amp; Cost to Be Me</h3>
            <p>
              Attach <strong>Weekly</strong>, <strong>Monthly</strong>, <strong>Yearly</strong>, or{' '}
              <strong>Custom</strong> targets to any bucket. Choose <em>Set aside another</em> to accumulate toward
              lumpy bills, <em>Refill up to</em> to cap routine spending, or <em>Reach a balance by due date</em> for
              one-off custom targets. Snoozing pauses a target for the current month without deleting it.
            </p>
            <p>
              <strong>Cost to Be Me</strong> totals the month’s target requirements and compares them with the expected
              income saved on your Plan, surfacing any shortfall before you commit—without ever moving money on its own.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Auto-Assign &amp; focused views</h3>
            <p>
              <strong>Auto-Assign</strong> prepares funding proposals using <em>Underfunded</em>,{' '}
              <em>Assigned last month</em>, <em>Spent last month</em>, <em>Average assigned</em>,{' '}
              <em>Reset assigned</em>, or <em>Reset available</em>—on selected buckets or all eligible visible rows.
              Tracky always displays the proposed rows, total amount, and resulting Ready to Assign before you confirm.
            </p>
            <p>
              Narrow the grid with focused views—<strong>Underfunded</strong>, <strong>Overspent</strong>,{' '}
              <strong>Snoozed</strong>, <strong>Money available</strong>, and <strong>Hidden</strong>—or reorder groups
              and buckets with pointer or keyboard controls in <strong>Edit Plan</strong>.
            </p>
          </article>
        </div>
      </Section>

      {/* 5. FIT CHECK */}
      <Section id="fit">
        <SectionHead
          kicker="Candid fit check"
          title="When a zero-based Plan helps—and when it feels hands-on."
        />

        <FitCheck
          yesTitle="A strong fit if you…"
          yesItems={[
            'Prefer deciding where observed cash goes before spending, rather than auditing surprises after the fact.',
            'Want annual bills, instalments, and credit card statements funded steadily every month.',
            'Use virtual money boxes alongside category targets and want Already set aside reflected automatically.',
            'Need strict single-currency totals where transfers and card limits never blur real cash.',
          ]}
          noTitle="Probably not for you if you…"
          noItems={[
            'Want passive monthly spending caps you set once and never revisit.',
            'Expect to budget future paychecks before the money arrives in your account.',
            'Need one combined budget merging multiple currencies via automatic FX conversion.',
            'Want multiple separate Plans on Free today (additional Plans are reserved for Pro, which is not for sale yet).',
          ]}
        />
      </Section>

      {/* 6. FAQ */}
      <FaqSection
        id="faq"
        tone="parchment"
        kicker="Zero-based Plan FAQ"
        title="Common questions about buckets, cards, and targets."
        subtitle="Answers match the shipped Plan accounting rules in v0.1.0."
        moreLink={{ href: '/faq', label: 'Read the full FAQ →' }}
        items={zeroBasedPlanEnFaq}
      />

      {/* 7. RELATED LINKS */}
      <B2RelatedSection
        tone="cotton"
        kicker="Continue exploring"
        title="Next steps around the Plan."
        items={[
          {
            kicker: 'Step-by-step guide',
            title: 'How to build a zero-based budget',
            description: 'A practical five-step walkthrough from manual checking account and CSV import to closing your first month at zero.',
            href: '/guides/zero-based-budgeting',
            linkLabel: 'Read the guide →',
          },
          {
            kicker: 'Feature · Demo + Self-host',
            title: 'Cash Flow projection calendar',
            description: 'Pair your funded Plan with dated bills, paydays, subscriptions, and card statements to spot the first negative date.',
            href: '/features/cash-flow',
            linkLabel: 'Explore Cash Flow →',
          },
          {
            kicker: 'Feature · Demo + Self-host',
            title: 'Reports & per-currency CSV export',
            description: 'Review Cash Flow Sankey, Spending, and Income breakdowns across months, quarters, and years.',
            href: '/features/reports',
            linkLabel: 'Explore Reports →',
          },
        ]}
      />

      {/* 8. FINAL CTA */}
      <FinalCta
        headline="Give every euro a job before the month starts."
        meta="€0 hosted demo · Zero-based Plan included · No credit card required"
        primaryCta={
          <B2AppCta
            auth={auth}
            locale="en"
            loggedInHref="/app/plan"
            loggedInLabel="Open the Plan →"
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
