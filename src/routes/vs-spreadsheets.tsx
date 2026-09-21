import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const faq = [
  {
    q: 'In a budget app vs Excel spreadsheet comparison, what do I actually keep?',
    a: 'You keep your CSV habit and your discipline. You import bank exports into manual checking or card accounts with mapping and preview, work from observed dated balances, and export report totals whenever you want. Each currency stays separate, and the free demo lets you test the flow first.',
  },
  {
    q: 'How do I move my history without creating duplicates?',
    a: 'Upload a CSV with a header row, map the columns, and review the Valid, Duplicate, or Error badge on each row. Tracky flags repeats by account, date, direction, amount, currency, and normalized description, so you can re-import the same file after an interruption and only new valid rows are added.',
  },
  {
    q: 'What happens to my recurring payments?',
    a: 'Tracky suggests possible subscriptions from merchant, amount, and date spacing, and you confirm each renewal before it counts. Active items enter Cash Flow as known commitments alongside planned expenses and statements. The projection stays an estimate from known items, never a guarantee, so you see the next due date early.',
  },
  {
    q: 'Do I lose my envelope system?',
    a: 'No, you upgrade it. You create virtual money boxes for each purpose, link one to a Plan bucket, and the saved amount shows as Already set aside so targets ask only for the rest. Recording a contribution does not move bank money, and Safe to spend subtracts only funding still due in the cycle.',
  },
];

export const Route = createFileRoute('/vs-spreadsheets')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Tracky vs spreadsheets: close the month · Tracky',
      description:
        'Spreadsheets copy balances by hand; Tracky anchors to observed balances, assigns every euro and forecasts cash-flow. Free demo.',
      locale: 'en',
      path: '/vs-spreadsheets',
      ogImage: ogImageFor('vs-spreadsheets'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/vs-spreadsheets', inLanguage: ['en', 'it'] }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Vs spreadsheets', path: '/vs-spreadsheets' },
        ]),
      ],
    }),
  component: VsEn,
});

function VsEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/vs-spreadsheets">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Retire
            <br />
            <span className="stroke">the</span> <span className="hl">sheet.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Spreadsheets <b>copy balances by hand</b> and age by the hour. Tracky anchors the plan to <b>observed,
            dated balances</b>, assigns every euro, and forecasts the 27th. Same discipline, none of the plumbing.
          </p>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>You already run a tight ship in Excel. But in any honest budget app vs Excel spreadsheet comparison, the sheet itself is the bottleneck: you type balances by hand, you fix formulas in silence, and history lives in filename_v7_final. You deserve the same discipline without the plumbing. You check the sheet, not your life.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Tracky anchors your plan to observed, dated balances instead of pasted values. You give every euro a job in Plan buckets with Assigned, Activity, and Available, and you see Safe to spend before you spend it. Cash-flow projection lists every known commitment by date and flags the first negative day, as estimates from known items, not guarantees.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>You keep CSV both ways: import bank exports into manual checking or card accounts with mapping, preview, and safe duplicate skipping, then export report totals whenever you want. Balances stay dated and queryable, and the free demo lets you try the flow before you commit. No versioned filenames, no silent edits. Your plan finally matches reality. Keep the CSV. Drop the chores.</p>
        </Reveal>
      </section>
      <MarqueeBand items={['NO COPY-PASTE', 'DATED BALANCES', 'EVERY EURO A JOB', 'CASH-FLOW INCLUDED', 'CSV BOTH WAYS']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>📉 THE SHEET</h3>
              <ul>
                <li>Balances typed by hand</li>
                <li>Formulas break silently</li>
                <li>One editor, many viewers</li>
                <li>History in filename_v7_final</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>📈 TRACKY</h3>
              <ul>
                <li>Observed balances, dated</li>
                <li>Invariants enforced in code</li>
                <li>Same numbers for everyone</li>
                <li>History queryable, exportable</li>
              </ul>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24 }}>
            <img src="/shots/import-summary.png" alt="Tracky import result: the anti-spreadsheet — 33 real transactions in minutes" width={1440} height={800} loading="lazy" />
            <figcaption>The anti-spreadsheet: 33 real transactions, zero formulas typed.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Where the sheet breaks</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>Every month starts with the same ritual. You paste balances, chase a broken reference, and ask who touched column D. One editor types while everyone else watches, and the truth ages by the hour.

Recurring payments hide in rows you forgot to copy. Card spending looks like cash until the statement lands, and mixed history across tabs never tells you what is safe to spend today. You reconcile the past instead of steering the month.

Currencies mix in one total and mislead you. You want a plan you can trust at a glance.</p>
        </Reveal>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Budget app vs Excel spreadsheet: what changes on day one</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>Your balances become observed and dated, not typed. You assign money you already hold into buckets, track Assigned against real Activity, and read Available before every decision. The same numbers serve everyone, with history you can query and export.

Cash-flow projection turns known commitments into a dated calendar and shows the first negative day, as estimates, not guarantees. Subscription suggestions flag possible renewals, but you confirm merchant, amount, and cadence. Each currency stays separate, card debt stays debt, and virtual money boxes reserve only cash you hold. You steer with facts, not formulas.</p>
        </Reveal>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>From pasted rows to dated balances</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>Bring one bank export and start small. You create a manual checking or card account in the file's currency, upload a CSV with a header row, and map date, description, counterparty, and amounts. Your file is parsed in the browser, and only valid rows you confirm are sent.

You review each row as Valid, Duplicate, or Error, apply one category or let your description rules run, and re-import safely because duplicates are skipped without touching the balance. Then you export report totals to CSV whenever you want. The free demo walks you through the same flow.</p>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Questions, answered.</h2>
        </Reveal>
        {faq.map((entry) => (
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
            <h2 className="mk-h2">Keep the CSV. Drop the chores.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Import CSV · export CSV · free demo</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
