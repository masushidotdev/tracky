import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const INTRO = "Budgeting for freelancers is messy because your income moves and your taxes wait. You invoice clients, money lands late, and meanwhile rent, tools, and tax deadlines keep coming. Tracky gives you a simple split: work accounts on one side, life accounts on the other, with tax deadlines sitting inside your cash flow as planned items. You always see what is really yours to spend.\n\nYou import bank exports as CSV into manual accounts, map columns, and review each row before it lands. Duplicates get flagged, so you can re-import safely after an interruption. Planned tax items, subscriptions, and transfers build a cash-flow calendar that shows what happens after each date. These are estimates from known items, not guarantees, and subscription suggestions still need your check.\n\nMoney boxes are virtual jars where you set aside tax money without moving real cash. Your monthly Plan shows what is ready to assign and what is already waiting in each bucket. Export clean CSV rows for your accountant when tax season arrives, then try it all in the free demo with no card needed.";

const BLOCKS = [
  { h: "Why budgeting for freelancers breaks in one mixed account",
    p: "You run everything through one account, so every balance lies to you: a big invoice lands, you feel rich, and then the tax deadline reminds you that part of that money was never really yours to spend. Client payments arrive late while rent, tools, and subscriptions leave exactly on time, so slow months feel like emergencies even when the year as a whole works. Your accountant receives a messy export full of mixed personal and work movements, and you pay for that cleanup with extra hours, extra fees, and extra stress. You end up guessing instead of deciding, which is exactly why separating work and life money, and putting tax deadlines inside cash flow as planned items, changes everything.", },
  { h: "A calmer Tuesday with Tracky",
    p: "You open Tracky on Tuesday morning and check your cash-flow calendar, which lists planned tax items, subscriptions, and transfers in date order and shows the balance after each date as an estimate from known items. You import last week's bank export as CSV into the right manual account, map the columns, and review each row while duplicates stay flagged so nothing gets counted twice. When an invoice lands, you set aside part of it in a virtual money box for taxes, assign the rest in your Plan, and leave your personal buckets untouched. Before lunch you export clean rows for your accountant, confirm the suggested subscriptions you actually recognize, and get back to client work with a clear number for what is safe to spend.", },
  { h: "Start in five minutes with the free demo",
    p: "You start from the free demo with no card, create one manual account for work and one for life, and give every amount its own side from day one. You add your next tax deadlines as planned items with their real dates and amounts, link the right accounts, and watch them appear in cash flow before they can surprise you. You import your latest bank CSV, check the preview row by row, keep only the subscription suggestions you recognize, and set a first virtual money box for the tax share of your next invoice. You assign what is ready in your Plan, export a clean file for your accountant, and repeat this loop every Tuesday until irregular income feels boring and controlled.", },
];

const PAGE_FAQ = [
  { q: "Is Tracky good for budgeting for freelancers with irregular income?",
    a: "Yes. You keep work and personal accounts separate, add tax deadlines as planned items, and read cash flow as estimates from known items. Your Plan shows what is ready to assign after commitments. You get control without changing how clients pay you, and you can explore it all in the free demo.", },
  { q: "How do I handle taxes in Tracky?",
    a: "You record each tax deadline as a planned item with its real date, amount, and account. It appears in cash flow and Safe to spend as a commitment, so the money looks already spoken for. When you pay, you link the real movement and the item stops weighing on future dates.", },
  { q: "Can I import my bank movements and share them with my accountant?",
    a: "Yes. You import bank exports as CSV into active manual accounts, map columns, and review the preview before confirming. Duplicates are flagged and skipped, and each currency goes into its matching account. Then you export clean rows for your accountant straight from your reviewed movements.", },
  { q: "Do money boxes move real money, and are subscription suggestions certain?",
    a: "No to both surprises. Money boxes are virtual: they record what you set aside without moving bank balances, so link the real transfer when money actually moves. Subscription detection is a suggestion, not certainty, so you confirm merchant, amount, and cadence before treating a renewal as a commitment.", },
];

export const Route = createFileRoute('/for-freelancers')({
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
      title: 'Budgeting for freelancers: work vs life · Tracky',
      description:
        'Separate work and personal money, keep tax deadlines inside cash-flow, export CSV for the accountant. Free demo, no card.',
      locale: 'en',
      path: '/for-freelancers',
      ogImage: ogImageFor('for-freelancers'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/for-freelancers', inLanguage: ['en', 'it'] }),
        faqJsonLd(PAGE_FAQ.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'For freelancers', path: '/for-freelancers' },
        ]),
      ],
    }),
  component: FreelanceEn,
});

function FreelanceEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/for-freelancers">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Work money.
            <br />
            <span className="stroke">Life money.</span>
            <br />
            <span className="hl">Separated.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Invoices land, taxes wait: keep <b>separate accounts</b>, put tax deadlines inside <b>cash-flow</b> as
            planned items, and hand your accountant a clean <b>CSV</b>. Irregular income, regular control.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Try the demo →'}</MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>{INTRO}</p>
        </Reveal>
      </section>
      <MarqueeBand items={['SEPARATE ACCOUNTS', 'TAX IN CASH-FLOW', 'CSV FOR ACCOUNTANT', 'IRREGULAR IN, CONTROL OUT']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>😵 MIXED POT</h3>
              <ul>
                <li>Salary or invoice? Who knows</li>
                <li>Tax bill arrives as a surprise</li>
                <li>Accountant gets a shoebox</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>😎 SPLIT LEDGER</h3>
              <ul>
                <li>Work vs personal accounts</li>
                <li>Taxes planned, funded, visible</li>
                <li>CSV export, accountant smiles</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
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
            <h2 className="mk-h2">Invoice. Set aside. Relax.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · 5 minutes · no card</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
