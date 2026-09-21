import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Import real history', p: 'Two to three months of CSV gives detection windows something to chew on.' },
  { t: 'Review suggestions', p: 'Monthly (~25–35 days) and yearly (~355–375 days) patterns surface as suggestions — suggestion, not certainty.' },
  { t: 'Confirm the real ones', p: 'Name, amount, interval, next due. Active subscriptions enter renewals and cash-flow.' },
  { t: 'Kill the duplicates', p: 'Two charges, one couch? Cancel in the real service, then mark inactive in Tracky.' },
  { t: 'Watch renewals', p: 'Due subscriptions and instalments alert before they hit. No more surprise renewals.' },
];

export const Route = createFileRoute('/guides/cancel-unused-subscriptions')({
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
      title: 'How to find and cancel unused subscriptions',
      description:
        '5 steps: import history, review suggestions, confirm, kill duplicates, watch renewals. Subscriptions feed cash-flow. Free demo.',
      locale: 'en',
      path: '/guides/cancel-unused-subscriptions',
      ogImage: ogImageFor('guide-subscriptions'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/guides/cancel-unused-subscriptions', inLanguage: ['en', 'it'] }),
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
