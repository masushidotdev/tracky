import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const INTRO = "You want answers from your money, and Tracky's spending reports CSV export gives them to you fast. You get three tabs — cash flow, spending, income — that show where money comes from, where it goes, and how habits change over time. You see every currency separately, so you never get a misleading mixed total.\n\nYou compare groups in Breakdown mode or watch months, quarters, and years in Trends mode. You switch between a donut and horizontal bars for spending and income, or grouped and stacked bars for trends. You tap any segment, legend row, or bar to open the newest transactions underneath, with date, description, category, and signed amount.\n\nYou filter by relative or custom dates, grouping, accounts, categories, tags, and amount limits. You save up to 20 views that store only the configuration, so This month always follows the current month. You drill into the ten largest groups while smaller ones combine into Other, and hidden transactions stay out of every total.\n\nYou explore every tab in the demo — the badge says Works in demo — with filters, views, and export ready to try. You keep transfers and internal movements out of spending and income, so your totals stay clean. You finish with clean numbers, ready to share with your accountant.";

const BLOCKS = [
  { h: "Cash flow, spending, and income in one place",
    p: "You open Reports when you want the full picture without guessing. You pick Cash Flow to connect income sources to spending groups and categories in a flow diagram. You pick Spending for debit expenses only, with transfers and internal movements left out. You pick Income for credit income only, with the same clean exclusion. You read Income, Expenses, Net, and Savings rate for each currency, where savings rate is net divided by income and zero when there is no income. You switch between Breakdown comparisons and Trends over months, quarters, or years whenever you need a different angle.", },
  { h: "Your spending reports CSV export workflow: filter, inspect, save",
    p: "You start by choosing a tab, a mode, and a chart style that fits your question. You set a relative range like this month or a custom start and end date, then group by category, category group, counterparty, or account. You narrow further with accounts, categories, tags, and optional minimum and maximum amounts, watching active tags appear as removable chips. In a spending or income breakdown you select a named segment, legend row, or bar to open the newest transactions, loading more when a group runs long. You save the full configuration as a named view, reopen it later, and export the trend series and breakdown totals when you need a file.", },
  { h: "Honest limits: what reports do not do",
    p: "You work with a badge that says Works in demo, so you can explore every report tab right away. You always see each currency in its own section, and Tracky never converts amounts or merges them into one total. You get aggregated trend series and breakdown totals in the CSV file, not the individual drill-down rows. You see the ten largest groups in the chart while smaller ones combine into Other, so you open a named group for full detail. You save up to 20 views that store settings only, and transactions marked Hidden from reports never appear in totals.", },
  { h: "Who reports are for",
    p: "You are a good fit for reports if you run a household, a freelance activity, or a small project across one or more accounts. You like grouping by category, counterparty, or account and checking Trends before you change a habit. You save views for recurring questions like this month spending or yearly income, then reopen them in one click. You filter by tags and amounts when you want a focused answer without touching your data. You export aggregated totals when your accountant or a spreadsheet needs clean numbers by currency.", },
];

const PAGE_FAQ = [
  { q: "What does the spending reports CSV export include?",
    a: "You download the current trend series and breakdown totals as report-<tab>-<from>-<to>.csv. You get aggregated values grouped by currency, not the individual transactions from drill-down. You open the file easily because Tracky uses a comma for decimal-point locales and a semicolon for decimal-comma locales.", },
  { q: "How do currencies work in reports?",
    a: "You see Income, Expenses, Net, and Savings rate inside each currency section. You read charts, drill-down lists, and exported rows grouped by currency. You use account filters when you want to focus on one currency or institution. You never get converted amounts or a combined total.", },
  { q: "What is the difference between Breakdown and Trends?",
    a: "You use Breakdown to compare groups across the selected range with a donut or horizontal bars. You use Trends to split the same data into monthly, quarterly, or yearly periods with grouped or stacked bars. You pick Cash Flow for the flow view, Spending for debit expenses, and Income for credit income.", },
  { q: "How do saved views work?",
    a: "You configure tab, mode, chart, dates, grouping, accounts, categories, tags, and amount limits. You open Saved reports, choose Save current report, and enter a recognizable name. You restore the full view later, rename it, or delete it permanently. You save up to 20 views, and relative ranges like This month follow the current month.", },
  { q: "Why do some transactions not appear in reports?",
    a: "You never see transfers and internal movements in Spending or Income because only classified expenses and income count. You never see transactions marked Hidden from reports in any total or drill-down row. You match a tag filter with at least one selected tag. You open a named group for detail because smaller groups combine into Other.", },
];

export const Route = createFileRoute('/features/reports')({
  loader: async () => {
    let auth: { user: unknown | null; signInUrl: string; signUpUrl: string } = { user: null, signInUrl: '/app', signUpUrl: '/app' };
    try {
      const { user } = await getAuth();
      const signInUrl = await getSignInUrl({ data: { returnPathname: '/app' } });
      const signUpUrl = await getSignUpUrl({ data: { returnPathname: '/app' } });
      auth = { user, signInUrl, signUpUrl };
    } catch {
      // No WorkOS secrets on this worker (e.g. staging): degrade to logged-out.
    }
    return auth;
  },
  head: () =>
    buildMarketingHead({
      title: 'Reports that talk: spending, income, CSV · Tracky',
      description:
        'Cash-flow Sankey, spending and income by category, trends vs breakdown, saved views and CSV export. Every currency kept separate.',
      locale: 'en',
      path: '/features/reports',
      ogImage: ogImageFor('feature-reports'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/reports', inLanguage: ['en', 'it'] }),
        faqJsonLd(PAGE_FAQ.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Reports', path: '/features/reports' },
        ]),
      ],
    }),
  component: ReportsEn,
});

function ReportsEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/features/reports">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Works in the demo</span>
            <span className="mk-badge">Free</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Numbers
            <br />
            <span className="stroke">that</span> <span className="hl">talk.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Three tabs — <b>cash-flow Sankey, spending, income</b> — by category with trends vs breakdown, saved views
            and <b>CSV export</b> your accountant will love. Transfers excluded from spending, every currency shown
            separately, never converted behind your back.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app/reports' : signUpUrl}>{user ? 'Open reports →' : 'Try the demo →'}</MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>{INTRO}</p>
        </Reveal>
      </section>
      <MarqueeBand items={['SANKEY FLOW', 'BY CATEGORY', 'TRENDS VS BREAKDOWN', 'SAVED VIEWS', 'CSV EXPORT']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {BLOCKS.map((block) => (
          <Reveal key={block.h}>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>{block.h}</h2>
            <p className="mk-sub" style={{ maxWidth: 700 }}>{block.p}</p>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>Questions, answered.</h2>
        </Reveal>
        {PAGE_FAQ.map((entry) => (
          <Reveal key={entry.q}>
            <details>
              <summary>{entry.q}</summary>
              <p style={{ marginTop: 8 }}>{entry.a}</p>
            </details>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Your accountant says thanks.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · reports included · no card</p>
            <MagnetCta href={user ? '/app/reports' : signUpUrl}>{user ? 'Open reports →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
