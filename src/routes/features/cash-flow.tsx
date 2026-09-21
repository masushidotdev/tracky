import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const seoIntro: Array<string> = [
  "You want a cash flow forecast personal finance setup that shows trouble before your bank does. Tracky turns your known commitments — planned income and expenses, active subscriptions, instalments, card statements, and scheduled one-off movements — into a dated liquidity calendar. You start from your latest cash balances and you see the balance after every date in your cycle.",
  "Paydays land on their dates and bills leave on theirs, so order matters and the cycle window you pick shows the same items in their true sequence. Card statements appear on the settlement account while card balances stay out of cash, because card debt is debt and a limit is never spendable cash. Money-box funding needs sit apart from balances, since money boxes are virtual and recording a contribution does not move bank money.",
  "You read one line per date, you spot the first negative date, and you act while you still have options instead of after the payment fails. The demo recomputes that date from your current data, and every projection stays an estimate rather than a promise about future behaviour. You keep payday order, statement timing, and funding gaps in one calm view, and you walk into the rest of the month knowing what lands when.",
];

const seoBlocks: Array<{ h: string; paras: Array<string> }> = [
  { h: "What this cash flow forecast personal finance view does", paras: [
    "You see your dated commitments laid over your latest cash balances, with the balance after each date, so you read liquidity day by day instead of guessing from a single total. You read planned income and expenses, active subscriptions, instalments, card statements, planned transfers, and scheduled one-off movements as rows in true date order. You keep card balances out of the cash line because card debt is debt, and you read money-box funding needs apart from balances because money boxes are virtual. You spot the earliest date the line would turn negative, refreshed from your current data, and you treat it as a planning estimate rather than a promise.",
  ] },
  { h: "How it works, step by step", paras: [
    "You record each commitment with its amount, date, and source account, and you keep active subscriptions current while paused or ended ones stay out of the future. You give every card statement a settlement account and every expense a source account, so nothing important sits in the unassigned group where Tracky cannot tell which balance it reduces. You choose a cycle window and read the dated lines, watching how paydays, bills, instalments, and statements stack in sequence toward the first negative date. When real money moves, you link the transaction or mark the item paid, so the reconciled row stays visible without ever counting twice.",
  ] },
  { h: "Honest limits: works in demo, estimates not promises", paras: [
    "You get planning help, not certainty: every projection is an estimate built from items you recorded, and it changes as your data changes. Works in demo; estimates not promises. You treat detection of repeating subscriptions as a suggestion rather than certainty, so you confirm merchant, amount, and rhythm before relying on a renewal, and you see rows in another currency stay visible without joining the projected line. When you create a planned item, transfer, money box, or scheduled movement you record intent only, so you still perform the real operation with your bank or creditor.",
  ] },
  { h: "Who it is for", paras: [
    "You are paid on fixed dates while rent, bills, instalments, and card statements leave on theirs, and you want the collision date before it arrives. You run one main currency across your cash accounts and you prefer assigning real observed money rather than spending from a card limit that was never cash. You like reconciling what really happened so future dates stay clean, and you want a calm daily line that tells you what is safe to spend after commitments without pretending the future is fixed.",
  ] },
];

const seoFaq: Array<{ q: string; a: string }> = [
  { q: "How is this cash flow forecast personal finance view different from a prediction?", a: "You see the arithmetic of your recorded commitments against your latest cash balances, in true date order, with the balance after each row. You get no model of your behaviour and no promise of what you will spend. When your items change, your line and your first negative date change with them." },
  { q: "Where does the projection start?", a: "You start from your latest known cash balances and apply dated rows inside your chosen cycle window. You keep card balances out of the cash line, and you read money-box funding needs separately without moving any balance. You change the window you see with the cycle, never the true dates of your items." },
  { q: "What does the unassigned group mean?", a: "You see commitments Tracky cannot place there, such as an expense or subscription without a source account or a statement without a settlement account. You keep the item as a known commitment, but no balance can absorb it yet. Assign the right account and your projection becomes complete." },
  { q: "How do subscriptions and money boxes behave here?", a: "You bring active subscriptions into future renewals, while paused or ended ones stay out, and you treat automatic detection as a suggestion you confirm rather than certainty. You remember money boxes are virtual, so their funding needs never reduce a bank balance by themselves and recording a contribution moves no real money. Link the real transaction when it arrives so nothing counts twice." },
  { q: "Can I rely on the first negative date?", a: "You treat it as an early warning and an estimate, not a promise, because it reflects only what you recorded and it recomputes as your data changes. You open the reported day, check earlier rows, balances, currencies, and accounts, then add real income or reduce an outflow when the line dips. Moving a date helps only when the true due date really changed." },
];

export const Route = createFileRoute('/features/cash-flow')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Cash-flow forecast: know the 27th today · Tracky',
      description:
        'Tracky projects paydays, bills and instalments onto real balances and recomputes the first negative date daily. An estimate, not a promise.',
      locale: 'en',
      path: '/features/cash-flow',
      ogImage: ogImageFor('feature-cashflow'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/cash-flow', inLanguage: ['en', 'it'] }),
        faqJsonLd(seoFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Cash-flow forecast', path: '/features/cash-flow' },
        ]),
      ],
    }),
  component: CashflowEn,
});

function CashflowEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/features/cash-flow">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Works in the demo</span>
            <span className="mk-badge">Free</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            The 27th,
            <br />
            <span className="stroke">known</span> <span className="hl">today.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Cash-flow projects <b>known commitments</b> — planned items, subscriptions, instalments, card statements —
            onto your latest balances. First negative date, recomputed daily. A planning <b>estimate</b>, not a
            statistical prediction of your behavior.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app/planning' : signUpUrl}>{user ? 'Open cash-flow →' : 'Try the demo →'}</MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoIntro.map((para, i) => (
          <Reveal key={i}>
            <p className="mk-sub" style={{ maxWidth: 720 }}>{para}</p>
          </Reveal>
        ))}
      </section>
      <MarqueeBand items={['FIRST NEGATIVE DATE', 'PAYDAYS IN', 'BILLS OUT', 'RECOMPUTED DAILY', 'NO SURPRISES']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            Calendar, <span className="u">not crystal ball.</span>
          </h2>
        </Reveal>
        <Reveal>
          <p className="mk-sub">
            Money boxes fund future expenses virtually; upcoming credit repayments come from tracked facilities. When a
            planned bill has no funding, the projection shows it — before the bank does.
          </p>
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
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">See the dip before it sees you.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · cash-flow included · no card</p>
            <MagnetCta href={user ? '/app/planning' : signUpUrl}>{user ? 'Open cash-flow →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
