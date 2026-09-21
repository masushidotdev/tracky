import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, DragStrip, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';

const INTRO = "You share the rent, the fridge, and the school run, yet money still sparks the same old argument: everyone spends with good intentions and nobody sees the full picture. If you searched for a budget app for couples families, this is the problem Tracky removes. One account owner runs a single household Plan: same balances, same buckets, one ledger, reviewed together at the same table.\n\nBig bills stop being surprises. You give school fees, insurance, and holidays their own buckets with a target and a due date, and Tracky estimates what to set aside this month. Skip a month and next month's ask grows by itself. Money boxes are virtual envelopes that pre-fund the same goals, and you can link one to a Plan bucket so Tracky counts it as already set aside.\n\nDay to day, all household spending flows through shared buckets and the activity lists every movement in one ledger, so reviews replace interrogations. Income lands in Ready to Assign, and every euro gets a job until it reaches zero. Try the Free demo with no card: sit down together, review the same numbers, and settle the month in a single sitting.";

const BLOCKS = [
  { h: "Two wallets, one blind spot",
    p: "One of you pays the rent, the other covers groceries, and both of you guess what is left. The school fee lands in September like an ambush, the holiday gets booked on hope, and the big bill arrives exactly when the account is thinnest. Then comes the nightly audit: who spent what, and why did nobody see it coming?\n\nNobody in this story is careless. You simply never had one place where every euro already had a job before the month began.", },
  { h: "A day in the life with this budget app for couples families",
    p: "Morning: you open one Plan and see the same Available in every bucket — house, groceries, school, holidays. Every purchase lands in one ledger, so the evening review replaces interrogation with facts. Annual bills fund themselves month by month: an insurance due in March asks for less once the bucket fills, and skipped months raise the next ask automatically, as an estimate that adjusts.\n\nEvening: money boxes show school and holidays growing virtually, already counted as set aside inside their Plan buckets. Income arrives in Ready to Assign and gets assigned down toward zero, ending the day on agreed numbers.", },
  { h: "One table, same numbers tonight",
    p: "Start with the Free demo — no card, just your household and a few honest minutes. As the account owner, create one Plan over the household accounts, add buckets for house, groceries, school, and holidays, and give annual bills a target with its due date. Link any savings you already hold as a virtual money box so the bucket counts them as already set aside.\n\nThen fund the month: assign income until Ready to Assign reaches zero, starting with buckets in the red and targets due soon. From tonight, every purchase has a bucket and every bucket is reviewed together.", },
];

const PAGE_FAQ = [
  { q: "Why choose Tracky as your budget app for couples families?",
    a: "Because you stop negotiating between two versions of the truth. One Plan, one ledger, reviewed together: the same balances, the same buckets, and every movement in a single activity list. Annual bills get targets with due dates, school and holidays grow in virtual money boxes, and income gets a job until Ready to Assign hits zero.", },
  { q: "How do we save for school fees and holidays without panic?",
    a: "Give each one a money box — virtual, with a target amount and date — and link it to its Plan bucket so the saved amount counts as already set aside. The bucket then asks only for what is still missing, as an estimate that adjusts every month. No double saving, no September ambush.", },
  { q: "What happens when one of us spends too much?",
    a: "The bucket turns red and you both see it — no blame game, just a decision. Move Available money from another bucket to cover cash overspending, or fund the card's payment bucket when the card funded the purchase. If you do nothing, the shortfall lowers next month's Ready to Assign instead.", },
  { q: "How do we start together this week?",
    a: "Open the Free demo — no card required — and build one Plan over the household accounts. Add buckets for house, groceries, school, and holidays, then assign income until Ready to Assign reaches zero. Sit at one table, review the same numbers, and agree the month in a single evening.", },
];

export const Route = createFileRoute('/for-couples-and-families')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Budget for couples & families, same numbers · Tracky',
      description:
        'One plan, same balances and buckets for the whole household. Money boxes for school, holidays and bills. Free demo, no card.',
      locale: 'en',
      path: '/for-couples-and-families',
      ogImage: ogImageFor('for-couples'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/for-couples-and-families', inLanguage: ['en', 'it'] }),
        faqJsonLd(PAGE_FAQ.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'For couples & families', path: '/for-couples-and-families' },
        ]),
      ],
    }),
  component: CouplesEn,
});

function CouplesEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/for-couples-and-families">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Same numbers.
            <br />
            <span className="stroke">Zero</span> <span className="hl">fights.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            One household, one plan: <b>same balances, same buckets</b>, reviewed together. Money boxes pre-fund
            school, holidays and big bills virtually. No more “I thought there was…”.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app' : signUpUrl} onClick={() =>
                user
                  ? undefined
                  : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
              }
            >
              {user ? 'Open the demo →' : 'Try the demo →'}
            </MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>{INTRO}</p>
        </Reveal>
      </section>
      <MarqueeBand items={['ONE PLAN', 'SAME BUCKETS', 'MONEY BOXES', 'SCHOOL + HOLIDAYS', 'NO FIGHTS']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <DragStrip>
            <div className="mk-card"><div className="e">🏠</div><h3>HOUSE</h3><p>Rent, bills, mortgage bucket — funded before the month starts.</p></div>
            <div className="mk-card"><div className="e">🛒</div><h3>GROCERIES</h3><p>One grocery bucket. Every movement listed in one ledger.</p></div>
            <div className="mk-card"><div className="e">🎒</div><h3>SCHOOL</h3><p>Money-boxed term by term. No September panic.</p></div>
            <div className="mk-card"><div className="e">🏖️</div><h3>HOLIDAYS</h3><p>A little every month. Booked when funded, not when hoped.</p></div>
          </DragStrip>
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
            <h2 className="mk-h2">One table. Same numbers.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · 5 minutes · no card</p>
            <MagnetCta href={user ? '/app' : signUpUrl} onClick={() =>
                user
                  ? undefined
                  : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
              }
            >
              {user ? 'Open the demo →' : 'Start free →'}
            </MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
