import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Fund the plan first', p: 'Open Plan and give the money already in your cash accounts a job before you forecast. You assign cash to buckets so Ready to Assign shows what is truly free, with each plan kept in one currency and card debt held outside cash liquidity. Without this funded base, Cash Flow cannot build a solid projection. Fund the Plan first and every later date reads cleaner.' },
  { t: 'Add planned items', p: 'Add every known bill, payday, and transfer as a planned item with its real date, amount, account, and direction. You include one-off scheduled movements too, and Tracky lists each occurrence inside your chosen cycle in date order. Give every row a source account, or it stays unassigned and cannot reduce the right balance. Complete rows turn your calendar into a reliable liquidity picture.' },
  { t: 'Convert subscriptions', p: 'Turn recurring debits into subscriptions so renewals enter your forecast on their own. You create them manually or convert a past debit, then set amount, interval, next due date, and debit account. Keep status Active for items you still pay, and pause or end the rest. Tracky detection is only a suggestion, not certainty, so confirm merchant, amount, and cadence before you trust each renewal.' },
  { t: 'Read the first negative date', p: 'Read the calendar from top to bottom and watch the balance after each row. You follow the account series and the aggregate cash line, knowing card debt never counts as a cash deficit. The first date below zero is your headline signal if nothing changes. Treat all projections as estimates from known items, then open that day, check earlier rows, and verify balance, currency, and accounts.' },
  { t: 'Fix it early', p: 'Act while you still have room to move a date, add real income, or cut an outflow. You move a payment only when its true due date changes, fund a virtual money box toward the gap, or trim a bucket assignment. Reconcile paid items with Link transaction so they stop weighing on the future. Check Cash Flow again and watch the negative date shift later or disappear.' },
];

const faq = [
  {
    q: 'What do I need before I learn how to forecast personal cash flow in Tracky?',
    a: 'You need your latest cash balances, a funded Plan in one currency, and dated planned items with source accounts. Add active subscriptions and one-off scheduled movements, then open Cash Flow. You read balances after each date in order. Works in the free demo with no bank connection, and every projection stays an estimate.',
  },
  {
    q: 'Why does Cash Flow show an unassigned row?',
    a: 'An item appears unassigned when it has no source account, or a card statement has no settlement account. You still see the commitment, but Tracky cannot tell which balance it reduces. Assign the right cash account in the same currency. Your projection becomes complete, while card debt stays separate from cash liquidity.',
  },
  {
    q: 'Are subscription renewals always correct?',
    a: 'No. Detection looks at merchant, currency, similar amount, and spacing, but repeated purchases are not always subscriptions and prices can change. Treat every suggestion as a hint, then confirm name, amount, interval, and next due date yourself. Keep only true renewals Active so your forecast reflects real commitments.',
  },
  {
    q: 'Do money boxes change my bank balance?',
    a: 'No. A money box is virtual: it tracks a target and saved amount without creating another bank balance. Recording a contribution does not move money at your bank. Link a box to a Plan bucket to show Already set aside so the target asks only for the remainder, and move real funds separately if cash must actually change accounts.',
  },
];

export const Route = createFileRoute('/guides/cash-flow-forecast')({
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
      title: 'How to forecast cash-flow in Tracky',
      description:
        '5 steps: fund the plan, add planned items, convert subscriptions, read the first negative date, fix it early. Free demo.',
      locale: 'en',
      path: '/guides/cash-flow-forecast',
      ogImage: ogImageFor('guide-cashflow'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/guides/cash-flow-forecast', inLanguage: ['en', 'it'] }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to forecast cash-flow in Tracky',
          step: steps.map((s) => ({ '@type': 'HowToStep', name: s.t, text: s.p })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/guides/cash-flow-forecast' },
        ]),
      ],
    }),
  component: GuideEn,
});

function GuideEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/guides/cash-flow-forecast">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Guide</span>
            <span className="mk-badge">5 steps</span>
            <span className="mk-badge">Free demo</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Forecast cash,
            <br />
            <span className="hl">5 steps.</span>
          </h1>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>You want a clear answer to one question: will your money last until the next payday? This guide shows you how to forecast personal cash flow in Tracky using items you already know.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>You start from your latest cash balances, add planned expenses and income, bring in active subscriptions, and read the calendar day by day. You see every commitment in date order, spot the first day the balance would drop below zero, and fix it while you still have time.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Projections are estimates based on known items, not guarantees. You work in the free demo, with no bank connection needed. Follow the five steps below, keep your dates and accounts tidy, and you will know exactly what is safe to spend. You assign each item, with its real date, to the right account so the projection stays complete.</p>
        </Reveal>
      </section>
      <MarqueeBand items={['PLAN FIRST', 'PLANNED ITEMS', 'SUBSCRIPTIONS', 'NEGATIVE DATE', 'FIX EARLY']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {steps.map((s, i) => (
          <Reveal key={s.t}>
            <div className="mk-card" style={{ maxWidth: 760, margin: '0 auto 16px', minWidth: 0, transform: 'none' }}>
              <div className="e">{i + 1}.</div>
              <h3>{s.t.toUpperCase()}</h3>
              <p>{s.p}</p>
            </div>
          </Reveal>
        ))}
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
            <h2 className="mk-h2">Know the dip. Dodge it.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · estimates, not promises</p>
            <MagnetCta href={user ? '/app/planning' : signUpUrl}>{user ? 'Open cash-flow →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
