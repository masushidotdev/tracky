import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Create one manual account', p: 'Checking, EUR. Name it, done in 20 seconds. No bank needed.' },
  { t: 'Import a bank CSV', p: 'Export from your bank, map date/description/amount, preview every row, import.' },
  { t: 'Create the plan', p: 'Pick the account as funding source. One currency, one plan.' },
  { t: 'Assign every euro', p: 'Fill buckets until Ready to Assign hits zero. Unexplained must be zero too.' },
  { t: 'Watch Available carry', p: 'Positive balances roll to next month. Overspending reduces Ready to Assign — fix it by moving money.' },
];

export const Route = createFileRoute('/guides/zero-based-budgeting')({
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
      title: 'How to build a zero-based budget in Tracky',
      description:
        '5 steps: manual account, CSV import, first plan, assign to zero, carry Available. Works in the free demo — start today.',
      locale: 'en',
      path: '/guides/zero-based-budgeting',
      ogImage: ogImageFor('guide-budget'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/guides/zero-based-budgeting', inLanguage: ['en', 'it'] }),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to build a zero-based budget in Tracky',
          step: steps.map((s) => ({ '@type': 'HowToStep', name: s.t, text: s.p })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/guides/zero-based-budgeting' },
        ]),
      ],
    }),
  component: GuideEn,
});

function GuideEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/guides/zero-based-budgeting">
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
            First budget,
            <br />
            <span className="hl">5 steps.</span>
          </h1>
        </Reveal>
      </header>
      <MarqueeBand items={['ACCOUNT', 'CSV', 'PLAN', 'ASSIGN TO ZERO', 'CARRY OVER']} />
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
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24, maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
            <img src="/shots/import-preview.png" alt="Step 2 in action: Tracky CSV preview validating each row" width={1440} height={800} loading="lazy" />
            <figcaption>Step 2 in action: the CSV preview from the live demo.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Your turn. 5 steps.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · no card · guide included</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
