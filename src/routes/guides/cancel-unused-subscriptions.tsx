import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Import real history', p: 'You start with two to three months of CSV history, because detection needs real windows to compare. You import your own movements, with merchant names, amounts in the same currency, and dates. You give monthly and yearly patterns enough room to repeat. You get a solid base without relying on memory, so the next steps become quick checks instead of guesswork.' },
  { t: 'Review suggestions', p: 'You review the suggestions Tracky surfaces from normalized merchant names, matching currency, similar amounts, and date spacing. You look at monthly patterns around twenty-five to thirty-five days and yearly patterns around three hundred fifty-five to three hundred seventy-five days. You treat every match as a suggestion, not certainty, because repeated purchases are not always subscriptions and prices can change. You keep what looks right and ignore the rest.' },
  { t: 'Confirm the real ones', p: 'You confirm each real subscription with its name, amount, currency, interval, and next due date. You check the debit account and fix the cadence when the dates drift. You activate only what you truly use, because active subscriptions enter renewals and cash flow. You leave the rest paused or ended, so your projections stay clean estimates of what is coming.' },
  { t: 'Kill the duplicates', p: 'You spot the classic waste: two charges for one service, one couch, one subscription needed. You compare merchant aliases, amounts, and cadences to catch the double before you pay again. You cancel in the real service first, because Tracky never cancels for you. You then mark the extra subscription inactive in Tracky, so it leaves renewals and stops shaping your cash flow going forward.' },
  { t: 'Watch renewals', p: 'You watch renewals so no charge hits by surprise. You check next due dates before they arrive and see active subscriptions inside cash flow as estimates. You pause what you are unsure about and end what you left behind. You keep the list small and honest, and every renewal becomes a deliberate choice you made, not a charge you missed.' },
];

const faq = [
  {
    q: 'How do I find cancel unused subscriptions without guessing?',
    a: 'You start from two to three months of CSV and scan suggestions built from merchant names, similar amounts, and date spacing. You confirm name, amount, interval, and next due date before activating anything. Every match stays a suggestion, not certainty, so repeated purchases never count as subscriptions until you say so.',
  },
  {
    q: 'Do I cancel subscriptions inside Tracky?',
    a: 'No. You cancel in the real service first, because Tracky never cancels charges for you. You then mark the subscription inactive in Tracky so it leaves renewals and cash flow. Paused keeps it stored without an active commitment, while ended preserves history without future matches.',
  },
  {
    q: 'What happens to active subscriptions in cash flow?',
    a: 'Active subscriptions enter renewals and cash flow with their next due dates. You see what is coming and can pause or end anything you no longer use. Projections are estimates, not promises, because amounts and dates can change. You stay ahead of renewals instead of discovering them after the charge.',
  },
  {
    q: 'Does this work in the demo?',
    a: 'Yes. This works in the demo with your imported CSV history. Detection still stays a suggestion, not certainty, so you confirm merchant, amount, and cadence every time. You keep full control, and renewals reflect only the subscriptions you activated yourself.',
  },
];

export const Route = createFileRoute('/guides/cancel-unused-subscriptions')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'How to find and cancel unused subscriptions',
      description:
        '5 steps: import history, review suggestions, confirm, kill duplicates, watch renewals. Subscriptions feed cash-flow. Free demo.',
      locale: 'en',
      path: '/guides/cancel-unused-subscriptions',
      ogImage: ogImageFor('guide-subscriptions'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/guides/cancel-unused-subscriptions', inLanguage: ['en', 'it'] }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to find and cancel unused subscriptions',
          step: steps.map((s) => ({ '@type': 'HowToStep', name: s.t, text: s.p })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/guides/cancel-unused-subscriptions' },
        ]),
      ],
    }),
  component: GuideEn,
});

function GuideEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/guides/cancel-unused-subscriptions">
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
            Hunt subs,
            <br />
            <span className="hl">5 steps.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Recurring charges hide in plain sight. Tracky spots the patterns, you confirm, cash-flow stays honest.
          </p>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>If you want to find cancel unused subscriptions hiding in your statements, start with real history, not memory. Recurring charges hide in plain sight, and small monthly renewals are easy to miss. Tracky spots repeating patterns, you confirm what is real, and your cash flow stays honest. This is a hunt, in five clear steps.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>You import two to three months of CSV, review monthly and yearly suggestions, then confirm name, amount, interval, and next due date. Active subscriptions enter renewals and cash flow, where projections are estimates that help you see what is coming.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>This works in the demo, and detection stays a suggestion, not certainty. You cancel in the real service, mark it inactive in Tracky, and watch renewals so nothing surprises you. You stay in control at every step.</p>
        </Reveal>
      </section>
      <MarqueeBand items={['IMPORT HISTORY', 'REVIEW', 'CONFIRM', 'KILL DUPLICATES', 'WATCH RENEWALS']} />
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
            <h2 className="mk-h2">One couch. One subscription.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · suggestions, not certainty</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
