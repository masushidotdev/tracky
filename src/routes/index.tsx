import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, DragStrip, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const seoIntro: Array<string> = [
  "Tracky is an open source budget app that gives every euro a job before you spend it. You assign the money already in your accounts across Plan buckets, and when Ready to Assign hits zero, your month is locked. It is free, MIT-licensed, with no card required — try the hosted demo or self-host it yourself.",
  "The Dashboard shows Safe to spend for the current cycle: available cash minus remaining bills and money-box funding still due. Cash Flow projects known paydays, bills, subscriptions, and transfers forward, so you see the first date your balance could turn negative. These projections are estimates built from the data in the app, so always check the currency, balance, and last update before you act.",
  "You stay in control of the details: CSV imports land in manual accounts with row-by-row validation, subscription matches arrive as suggestions you confirm, and money boxes stay virtual markers for savings goals. Each currency stays separate and is never converted, and card limits never count as spendable cash. Reports break spending and income down by category and export to CSV for your accountant.",
];

const seoBlocks: Array<{ h: string; paras: Array<string> }> = [
  { h: "Why an open source budget app beats spreadsheet chaos", paras: [
    "You know the chaos: balances copied by hand, forgotten subscriptions, and the end-of-month 'I thought there was money left.' Tracky replaces it with observed balances that stay dated, recurring payments kept on the radar, and one set of numbers you can trust. You give every euro a job in the Plan, watch Safe to spend update as commitments land, and reconcile each due item when the real movement arrives so nothing counts twice. Possible subscriptions show up as suggestions for you to confirm, currencies never mix and each one is tracked on its own, and when Ready to Assign hits zero, every euro has a job.",
  ] },
  { h: "How it works: plan, project, review", paras: [
    "Start on the Dashboard: Safe to spend shows what remains for discretionary spending in the current cycle, calculated separately per currency with every subtraction open to inspection. Then open Cash Flow, add known bills, income, transfers, and virtual money boxes, and read the projected balance date by date — these projections are estimates drawn from your data, never guarantees. Feed the machine with CSV imports into manual accounts, validated row by row in your browser, and confirm subscription and transfer suggestions so Plan, Reports, and Cash Flow stay sharp. A card limit is never spending money, and every total is a snapshot: always open the detail and look at the date of the last update before you decide.",
  ] },
  { h: "Free and MIT: proof, not promises", paras: [
    "The badge says Free and MIT, and the repository backs it up: the code is public, so you can read how each figure is computed, from Safe to spend to money-box funding. Try the hosted demo with no card, then self-host the same app and connect banks on your own instance with connections you control and can remove at any time. Imports stay private by design: parsing happens in your browser, and only the rows you confirm ever leave your machine. Code you can read, an app you can run, and data that stays yours.",
  ] },
];

const seoFaq: Array<{ q: string; a: string }> = [
  { q: "Is this open source budget app really free?", a: "Yes. Tracky is free and MIT-licensed: try the hosted demo with no card, or self-host the code yourself. The repository is public and you can read how each figure is computed, and reports export to CSV whenever you want. Imports are validated in your browser; only confirmed rows are sent." },
  { q: "How do Cash Flow projections work?", a: "Cash Flow starts from your latest known balances and applies dated commitments — bills, income, subscriptions, transfers — to compute the balance after each date. The result is an estimate, not a guarantee: an incomplete sync or unassigned item can change it, so open the detail before you act." },
  { q: "What happens to my CSV file when I import it?", a: "It never leaves your machine unparsed: Tracky reads it in your browser and shows every row as Valid, Duplicate, or Error with its reason. Only the valid rows you confirm are sent, landing in a manual account whose balance updates from the import. Review the new movements afterwards." },
  { q: "Do card limits count as money I can spend?", a: "Never. Card balances stay out of cash and Safe to spend — their effect arrives through the statement due on the settlement account, so nothing counts twice. Neither a card's positive balance nor its limit is money to assign. Check the linked statement date instead and plan the payment." },
];

export const Route = createFileRoute('/')({
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
      title: 'Tracky — Free open-source budget & cash-flow planner',
      description:
        'Tracky is a free, MIT-licensed budget planner: zero-based plan, cash-flow forecast, CSV import and reports. Try the hosted demo, no card.',
      locale: 'en',
      path: '/',
      ogImage: ogImageFor('home'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/', inLanguage: ['en', 'it'] }),
        faqJsonLd(seoFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([{ name: 'Home', path: '/' }]),
      ],
    }),
  component: HomeEn,
});

const band = ['READY TO ASSIGN = 0 ✓', 'CASH-FLOW FORECAST', 'CSV IMPORT', 'SPENDING REPORTS', 'MIT OPEN SOURCE'];

const cards = [
  { e: '🪣', t: 'ZERO-BASED PLAN', p: 'Every euro gets a job before it is spent. Ready to Assign at zero means the month is locked.' },
  { e: '🔮', t: 'CASH-FLOW FORECAST', p: 'Known bills, paydays and instalments projected forward. First negative date, computed daily.' },
  { e: '📥', t: 'CSV IMPORT', p: 'Bank exports land in a manual account in minutes. Parsed in your browser, never uploaded raw.' },
  { e: '📊', t: 'REPORTS + CSV', p: 'Spending and income by category, month over month. Export everything for your accountant.' },
  { e: '🏦', t: 'BANK SYNC', p: 'PSD2 via Enable Banking on your own instance. Bring your own app keys — revocable anytime.' },
  { e: '🤖', t: 'AI ANALYST', p: 'An exploration aid on self-hosted instances: what-ifs, anomaly flags, approval-gated writes.' },
];

function HomeEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/">
      <header className="mk-hero">
        <div className="mk-stickers" aria-hidden="true">
          <span className="mk-stk" style={{ top: '6%', right: '8%', background: 'var(--mk-acid)', transform: 'rotate(6deg)' }}>
            FREE*
          </span>
          <span className="mk-stk" style={{ top: '48%', left: '-10px', background: '#fff', transform: 'rotate(-6deg)' }}>
            MIT open source
          </span>
        </div>
        <Reveal>
          <h1>
            Your money
            <br />
            <span className="stroke">works.</span>
            <br />
            <span className="hl">You live.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Tracky gives <b>every euro a job</b>, forecasts the balance 90 days out and keeps spending honest. Free,
            open source, no card — try the hosted demo or self-host it.
          </p>
        </Reveal>
        <Reveal>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Try the demo free →'}</MagnetCta>
            <span style={{ fontWeight: 700 }}>↓ drag the cards, touch everything</span>
          </div>
        </Reveal>
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Free plan</span>
            <span className="mk-badge">No card</span>
            <span className="mk-badge">MIT</span>
            <span className="mk-badge">EN + IT</span>
          </div>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoIntro.map((para, i) => (
          <Reveal key={i}>
            <p className="mk-sub" style={{ maxWidth: 720 }}>{para}</p>
          </Reveal>
        ))}
      </section>
      <MarqueeBand items={band} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            The anti-chaos <span className="u">armory.</span>
          </h2>
        </Reveal>
        <p style={{ textAlign: 'center', color: '#666', fontSize: 14 }}>← drag → · 6 tools, one enemy: end-of-month overdraft</p>
        <Reveal>
          <DragStrip>
            {cards.map((card) => (
              <div className="mk-card" key={card.t}>
                <div className="e">{card.e}</div>
                <h3>{card.t}</h3>
                <p>{card.p}</p>
              </div>
            ))}
          </DragStrip>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 8 }}>
            <img src="/shots/import-preview.png" alt="Tracky's CSV import preview: row-by-row validation before importing" width={1440} height={800} loading="lazy" />
            <figcaption>CSV import preview — every row validated before a euro moves. Screenshot from the live demo.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            Without vs <span className="u">with.</span>
          </h2>
        </Reveal>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>😵 SPREADSHEET CHAOS</h3>
              <ul>
                <li>Balances copied by hand</li>
                <li>Forgotten subscriptions</li>
                <li>Weekend Excel sessions</li>
                <li>“I thought there was…”</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>😎 WITH TRACKY</h3>
              <ul>
                <li>Observed balances, always dated</li>
                <li>Recurring payments on the radar</li>
                <li>20 minutes from your phone</li>
                <li>Same numbers, zero arguments</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoBlocks.map((block) => (
          <Reveal key={block.h}>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>{block.h}</h2>
            {block.paras.map((para, i) => (
              <p key={i} className="mk-sub" style={{ maxWidth: 700 }}>{para}</p>
            ))}
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoFaq.map((entry) => (
          <Reveal key={entry.q}>
            <details>
              <summary>{entry.q}</summary>
              <p style={{ marginTop: 8 }}>{entry.a}</p>
            </details>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" id="go" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Overdraft: warned. You: armed.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free · 5 minutes · no card · MIT open source</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
