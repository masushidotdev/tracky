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
import {
  B2AppCta,
  B2GuideSteps,
  B2RelatedSection,
  B2ScreenshotFigure,
} from '@/components/marketing/atelier/b2-sections';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const guideSteps: Array<B2StepItem> = [
  {
    title: 'Start from today’s observed cash balance',
    body: 'List the checking or cash account holding the money you actually have today, in a single currency. Zero-based budgeting only allocates observed cash—never next month’s paycheck or an unused credit card limit—so every decision rests on money already in your hands.',
    note: 'In Tracky: add a manual checking account in EUR (or your main currency) with today’s real balance—no bank link required.',
  },
  {
    title: 'Bring in recent transactions cleanly',
    body: 'Export a bank CSV for the account and check every date, description, and amount before saving. Reviewing rows up front keeps duplicates and malformed entries out of your ledger so your starting activity reflects reality.',
    note: 'In Tracky: CSV parsing runs locally in your browser with Valid, Duplicate, and Error badges before a single row is written.',
  },
  {
    title: 'Group obligations and goals into clear buckets',
    body: 'Create one Plan in that currency and organize recurring bills, daily spending, annual expenses, and savings targets into named buckets. Anchor the Plan to today’s starting date so older transactions stay inside your opening balance without creating artificial overspending.',
    note: 'In Tracky: if an imported history shifts your cutoff, Restart from here picks a clean origin while preserving groups, buckets, targets, and assignments.',
  },
  {
    title: 'Assign every euro until Ready to Assign reaches zero',
    body: 'Allocate your available cash across buckets—covering immediate bills first, then groceries, transport, annual reserves, and discretionary spending—until Ready to Assign hits zero. When new income arrives later, give that new money a job right away instead of treating it as negative spending inside a category.',
    note: 'In Tracky: check that Unexplained movement stays at zero so every account inflow and outflow is properly attributed.',
  },
  {
    title: 'Carry positive Available forward and cover red rows immediately',
    body: 'At month-end, let positive Available balances roll into next month—this is how sinking funds for annual insurance, repairs, or holidays grow steadily. Whenever a cash bucket goes red, move Available funds from another bucket to cover it; when a credit card purchase lacks coverage, fund that card’s payment bucket before paying the statement.',
    note: 'In Tracky: positive Available carries forward automatically, while uncovered cash overspending lowers next month’s Ready to Assign rather than hiding negative debt.',
  },
];

export const guideZeroBasedEnFaq: Array<FaqItem> = [
  {
    q: 'Can I start a zero-based budget if my past transaction history is messy?',
    a: 'Yes. A zero-based budget starts from the cash you hold on day one, not from untangling last year’s receipts. Earlier movements remain part of your opening account balance without creating bucket Activity or overspending. In Tracky, you can also use Restart from here in the plan selector to pick a clean starting day while keeping groups, buckets, targets, and assignments intact.',
  },
  {
    q: 'Do I have to reach exactly zero on day one?',
    a: 'Zero is the target you work toward, not a test you fail on day one. A positive Ready to Assign simply means some cash still has no job—and idle money tends to drift into unchosen spending. Even a partially assigned Plan beats spending before deciding, and you refine it as bills and priorities become clearer.',
  },
  {
    q: 'What should I do when I spend more than a bucket holds?',
    a: 'Treat cash overspending and credit overspending differently. For cash overspending, money already left your account, so move Available funds from another bucket to cover the shortfall—otherwise next month’s Ready to Assign drops automatically. For credit overspending, fund the card’s payment bucket so cash waits ready when the statement is due.',
  },
  {
    q: 'How do I keep a zero-based budget working smoothly month after month?',
    a: 'Let positive Available balances carry forward so annual and irregular bills build up gradually, cover any red cash row before closing the month, and route every new paycheck through Ready to Assign first. Starting each month from observed cash keeps the math grounded in reality.',
  },
];

export const Route = createFileRoute('/guides/zero-based-budgeting')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'How to build a zero-based budget in 5 steps · Tracky',
      description:
        'Learn how zero-based budgeting works in five practical steps: observed cash, clean CSV import, buckets, assigning to zero, and monthly carry.',
      locale: 'en',
      path: '/guides/zero-based-budgeting',
      ogImage: ogImageFor('guide-budget'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/guides/zero-based-budgeting', inLanguage: ['en', 'it'] }),
        faqJsonLd(guideZeroBasedEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to build a zero-based budget in Tracky',
          step: guideSteps.map((step) => ({ '@type': 'HowToStep', name: step.title, text: step.body })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Zero-based budgeting guide', path: '/guides/zero-based-budgeting' },
        ]),
      ],
    }),
  component: GuideEn,
});

function GuideEn() {
  const auth = Route.useLoaderData();
  return <GuideZeroBasedEnView auth={auth} />;
}

export function GuideZeroBasedEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/guides/zero-based-budgeting">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Breadcrumb"
              items={[
                { label: 'Home', href: '/' },
                { label: 'Zero-based budgeting guide' },
              ]}
            />

            <ChipRow>
              <Chip tone="cobalt">Evergreen guide</Chip>
              <Chip>5 practical steps</Chip>
              <Chip tone="sage">Works in the free demo</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              How to build a <span className="mka-accent-ink">zero-based budget</span> that holds up every month.
            </h1>

            <p className="mka-hero-dek">
              Zero-based budgeting does not mean spending your bank account down to zero. It means giving every euro you
              already hold a specific job—rent, groceries, annual bills, or savings—so unassigned cash stops vanishing
              quietly before payday.
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-secondary" href="#steps">
                Jump to the 5 steps ↓
              </a>
              <B2AppCta
                auth={auth}
                locale="en"
                loggedInHref="/app/plan"
                loggedInLabel="Open the Plan →"
                loggedOutLabel="Practise in the free demo →"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. EDUCATIONAL FOUNDATION */}
      <Section id="method" tone="parchment">
        <SectionHead
          kicker="The principle"
          title="Why assigning observed cash beats static monthly caps."
          subtitle="Most budgets fail for two reasons: they plan with money that has not arrived yet, and they reset every category blindly on the first of the month."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Observed money vs. forecasted paychecks</h3>
            <p>
              Traditional percentage budgets or monthly spending caps look tidy on paper, yet they rarely answer a real
              Tuesday question: <em>can I afford this right now without breaking next week’s rent?</em>
            </p>
            <p>
              Zero-based budgeting flips the question. You look only at the cash sitting in your checking and savings
              accounts today and divide it across deliberate buckets—including irregular annual costs like insurance,
              taxes, or car maintenance—until <strong>Ready to Assign</strong> reaches zero.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Three habits that keep the method alive</h3>
            <ul className="mka-b2-prose-list">
              <li>
                <strong>Keep credit limits separate from cash:</strong> a card limit is borrowing capacity, not money to
                allocate. Every covered card purchase sets cash aside to pay the statement.
              </li>
              <li>
                <strong>Let positive balances roll forward:</strong> money you do not spend in a sinking fund stays in
                that bucket next month instead of disappearing into a vague leftover.
              </li>
              <li>
                <strong>Adjust when life changes:</strong> moving money between buckets is not failure—it is an
                explicit trade-off made with real numbers.
              </li>
            </ul>
          </article>
        </div>
      </Section>

      {/* 3. FIVE STEPS */}
      <Section id="steps">
        <SectionHead
          kicker="Step-by-step method"
          title="Build your first zero-based budget in five steps."
          subtitle="Follow this sequence on paper, in a clean ledger, or inside the free Tracky demo—no bank connection required."
        />

        <B2GuideSteps steps={guideSteps} stepPrefix="Step" />

        <div style={{ marginTop: '2rem' }}>
          <B2ScreenshotFigure
            src="/shots/import-preview.png"
            alt="Tracky CSV import preview classifying rows as Valid or Duplicate before saving into a manual account"
            width={1440}
            height={800}
            captionTitle="Step 2 in practice: browser-local CSV preview"
            captionBody="Before saving a single transaction into your manual account, Tracky checks every row locally in your browser and flags Valid, Duplicate, or Error rows with plain reasons."
          />
        </div>
      </Section>

      {/* 4. HOW TRACKY HELPS */}
      <Section id="how-tracky-helps" tone="parchment">
        <SectionHead
          kicker="How Tracky helps"
          title="Built specifically around observed-cash, single-currency accounting."
          subtitle="Every part of this five-step workflow runs at €0 in the hosted demo using manual accounts and browser-parsed CSV import, or on your own MIT self-hosted Docker server."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">What Tracky handles for you</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Assigned, Activity, and Available per bucket</strong>
                  <span>
                    Every bucket tracks what you allocated this month, booked spending and refunds, and what carries
                    forward—while keeping unmapped categories visible in <strong>Unplanned</strong>.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Targets &amp; previewed Auto-Assign</strong>
                  <span>
                    Set weekly, monthly, yearly, or custom targets, compare total needs against expected income with{' '}
                    <strong>Cost to Be Me</strong>, and preview Auto-Assign proposals before confirming.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Protected card &amp; instalment buckets</strong>
                  <span>
                    Covered card purchases reserve cash automatically for the upcoming statement, and linked virtual
                    money boxes count as <strong>Already set aside</strong> without double counting.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Transparent boundaries</h3>
            <ul className="mka-check-list">
              <li>One currency per Plan—never silently converts mixed currencies</li>
              <li>No bank credentials required on the hosted demo (browser-local CSV import)</li>
              <li>Full JSON backup and aggregated CSV reports exportable anytime</li>
              <li className="is-muted">PSD2 bank sync (Enable Banking) is optional and self-host only</li>
              <li className="is-muted">Free includes one Plan; multiple Plans are reserved for Pro (not for sale)</li>
            </ul>

            <div className="mka-trust-actions" style={{ marginTop: 'auto' }}>
              <a className="mka-text-link" href="/features/zero-based-plan">
                Read full Zero-based Plan feature details →
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
        title="Common questions when starting a zero-based budget."
        subtitle="Practical answers for your first month and beyond."
        moreLink={{ href: '/faq', label: 'Read the full FAQ →' }}
        items={guideZeroBasedEnFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Keep reading"
        title="Next guides and product pages."
        items={[
          {
            kicker: 'Feature · Demo + Self-host',
            title: 'Zero-based Plan in Tracky',
            description: 'Deep dive into Ready to Assign, card payment buckets, Auto-Assign strategies, and linked money boxes.',
            href: '/features/zero-based-plan',
            linkLabel: 'Explore the Plan →',
          },
          {
            kicker: 'Evergreen guide',
            title: 'How to forecast personal cash flow',
            description: 'Once your Plan is funded, lay dated bills and paydays onto real balances to spot any upcoming cash dip.',
            href: '/guides/cash-flow-forecast',
            linkLabel: 'Read Cash Flow guide →',
          },
          {
            kicker: 'Evergreen guide',
            title: 'Find & cancel unused subscriptions',
            description: 'Use two to three months of CSV history to audit recurring charges before they drain your buckets.',
            href: '/guides/cancel-unused-subscriptions',
            linkLabel: 'Read Subscriptions guide →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Put the five steps into practice today."
        meta="€0 hosted demo · Zero-based Plan & browser-parsed CSV included · No credit card"
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
          <a className="mka-btn-outline-light" href="/features/zero-based-plan">
            Zero-based Plan details →
          </a>
        }
      />
    </AtelierSite>
  );
}
