import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/features/zero-based-plan')({
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
      title: 'Zero-based plan: give every euro a job · Tracky',
      description:
        'Tracky’s zero-based plan assigns observed cash to buckets before you spend it. Ready to Assign at zero — single currency, no double counting.',
      locale: 'en',
      path: '/features/zero-based-plan',
      ogImage: ogImageFor('feature-plan'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/zero-based-plan', inLanguage: ['en', 'it'] }),
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
          <MagnetCta href={user ? '/app/plan' : signUpUrl}>{user ? 'Open the plan →' : 'Try the demo →'}</MagnetCta>
        </Reveal>
      </header>
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
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Assign it all. Sleep well.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · plan included · no card</p>
            <MagnetCta href={user ? '/app/plan' : signUpUrl}>{user ? 'Open the plan →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
