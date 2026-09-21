import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Fund the plan first', p: 'Cash-flow reads latest balances plus commitments. No plan, no projection.' },
  { t: 'Add planned items', p: 'Bills, paydays, transfers as planned expenses with dates and amounts.' },
  { t: 'Convert subscriptions', p: 'Recurring debits become subscriptions — renewals enter the forecast automatically.' },
  { t: 'Read the first negative date', p: 'The headline number: when the balance dips below zero if nothing changes.' },
  { t: 'Fix it early', p: 'Move a payment, fund a money box, cut a bucket. Estimates update daily.' },
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
