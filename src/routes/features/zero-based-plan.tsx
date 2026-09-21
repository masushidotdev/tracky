import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';

const seoIntro: Array<string> = [
  "You want every euro to have a job before you spend it. The Tracky Plan is a zero based budgeting app that works only with money already observed in your cash accounts. You assign each euro to a bucket until Ready to Assign reaches zero.",
  "You see Assigned, Activity, and Available for every bucket. Assigned is what you allocate this month. Activity is booked spending and refunds in the bucket categories. Available is what remains, and positive Available carries into next month.",
  "You fund the month from real inflows, not from leftovers. Income appears in Ready to Assign and its breakdown, never as negative spending inside a bucket. Unexplained movement should stay at zero, because a different value means some movement still needs correct attribution.",
  "Cards stay outside cash liquidity and get their own payment buckets. Neither a positive card balance nor its available limit counts as money you can assign. Cash you draw from a card can be assigned, but the matching card debt still waits to be paid.",
  "You close the month when every euro has a job and Ready to Assign sits at zero. If income arrives later, you give that new money a job too. Try it in the demo and open the Plan to practise the flow.",
];

const seoBlocks: Array<{ h: string; paras: Array<string> }> = [
  { h: "What this zero based budgeting app does with your cash", paras: [
    "The Plan organises your transaction categories into buckets grouped by purpose. You assign observed cash to each bucket for the month. Activity then tracks booked spending and refunds through those categories.",
    "Available shows what you still hold, with positive amounts carrying forward. Unmapped categories land in Unplanned, so real spending never disappears. You place each one into an existing bucket or give it a new home.",
    "Linked money boxes count as Already set aside toward a bucket target, because those virtual reserves support the goal without becoming a new assignment. You always see Ready to Assign and its breakdown before you decide.",
  ] },
  { h: "How you close the month at zero, step by step", paras: [
    "Start from the day your Plan becomes real, because earlier movements stay in balances without creating bucket activity. Give every euro a job until Ready to Assign reaches zero, moving money between buckets when priorities change.",
    "Add targets to buckets with a monthly, yearly, weekly, or custom rhythm, then let underfunded guidance order the queue. Use Auto-Assign to preview Underfunded, last month, or average strategies before anything is written.",
    "Cover cash overspending by moving Available money from another bucket. Fund card payment buckets for credit overspending, so cash waits ready when you pay the statement.",
  ] },
  { h: "Honest limits: Works in demo, single currency, no double counting", paras: [
    "This page carries the Works in demo badge, so you can practise the full Plan flow in the demo. Each Plan uses one currency, and you cannot combine mixed currencies into shared totals.",
    "Card debt stays separate from cash, and you never count the same euro twice. Overdraft facilities inform you but never count as money to assign, and you need no separate payoff bucket.",
    "Subscription suggestions remain suggestions, so you confirm merchant, amount, and cadence yourself. Targets and Cost to Be Me guide decisions without moving money on their own.",
  ] },
  { h: "Who the Plan is for", paras: [
    "You like deciding before spending and you want annual bills to stop feeling like surprises. You carry card balances and want payment buckets that keep cash ready for statements.",
    "You manage installment plans and want each month's need visible in one row. You use virtual money boxes alongside goals and want Already set aside to reduce each target fairly. If you prefer firm caps you never revisit, this method will feel hands-on, because you return each month, assign again, and keep Ready to Assign at zero.",
  ] },
];

const seoFaq: Array<{ q: string; a: string }> = [
  { q: "Do I have to assign down to zero in this zero based budgeting app?", a: "No, but that is the goal you work toward. A positive Ready to Assign means some money still waits for a job, and unassigned money tends to leave on its own. You can pause, move money between buckets, or use Auto-Assign previews. Each month you return, assign again, and watch the number settle at zero." },
  { q: "Why doesn't my income appear as activity in a bucket?", a: "Income funds the Plan instead of counting as negative spending. You find it in Ready to Assign and its breakdown, alongside carry, inflows, assignments, and reserves. Buckets track only booked spending and refunds in their categories. That split keeps your pay visible as fuel, never hidden inside grocery or transport rows." },
  { q: "What is the difference between cash overspending and credit overspending?", a: "Cash overspending means money already left a cash account, so you move Available money from another bucket to cover it. Credit overspending means a card purchase lacked coverage, so you fund that card's payment bucket instead. No cash moves yet, but debt grew. Both clear when you act, and neither carries as a negative bucket balance." },
  { q: "How do targets handle annual bills?", a: "You put a yearly target with its due date on the bucket and choose Refill up to. Each month Tracky derives the need from what you already set aside and the time left. Skipped months raise the later ask automatically. Monthly spending uses Monthly plus Refill up to as a cap, while scattered instalments suit Monthly plus Set aside another." },
  { q: "Are subscription detections certain, and are money boxes real cash?", a: "No to both, and the distinction matters. Subscription matches stay suggestions, so you confirm merchant, amount, and cadence before trusting a renewal. Linked money boxes stay virtual reserves shown as Already set aside, read fresh each month. They reduce a bucket's target without becoming a new assignment or spendable cash." },
];

export const Route = createFileRoute('/features/zero-based-plan')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Zero-based plan: give every euro a job · Tracky',
      description:
        'Tracky’s zero-based plan assigns observed cash to buckets before you spend it. Ready to Assign at zero — single currency, no double counting.',
      locale: 'en',
      path: '/features/zero-based-plan',
      ogImage: ogImageFor('feature-plan'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/zero-based-plan', inLanguage: ['en', 'it'] }),
        faqJsonLd(seoFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Zero-based plan', path: '/features/zero-based-plan' },
        ]),
      ],
    }),
  component: PlanEn,
});

function PlanEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/features/zero-based-plan">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Works in the demo</span>
            <span className="mk-badge">Free</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Every euro,
            <br />
            <span className="hl">employed.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            The Plan gives money <b>already observed</b> in your cash accounts a job before you spend it. Assigned,
            Activity and Available per bucket; <b>Ready to Assign at zero</b> means the month is locked. Single
            currency, card debt kept out of liquidity, no double counting.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app/plan' : signUpUrl} onClick={() =>
                user
                  ? undefined
                  : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
              }
            >
              {user ? 'Open the plan →' : 'Try the demo →'}
            </MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoIntro.map((para, i) => (
          <Reveal key={i}>
            <p className="mk-sub" style={{ maxWidth: 720 }}>{para}</p>
          </Reveal>
        ))}
      </section>
      <MarqueeBand items={['READY TO ASSIGN = 0', 'ASSIGNED · ACTIVITY · AVAILABLE', 'ONE CURRENCY', 'NO DOUBLE COUNT']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            How the month <span className="u">closes.</span>
          </h2>
        </Reveal>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>😵 MONTHLY CAPS</h3>
              <ul>
                <li>Limits nobody updates</li>
                <li>Leftovers nobody explains</li>
                <li>Cards mixed with cash</li>
                <li>December surprise</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>😎 ZERO-BASED</h3>
              <ul>
                <li>Observed balances, dated</li>
                <li>Unexplained must be zero</li>
                <li>Cards get payment buckets</li>
                <li>Positive Available carries over</li>
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
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Assign it all. Sleep well.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · plan included · no card</p>
            <MagnetCta href={user ? '/app/plan' : signUpUrl} onClick={() =>
                user
                  ? undefined
                  : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
              }
            >
              {user ? 'Open the plan →' : 'Start free →'}
            </MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
