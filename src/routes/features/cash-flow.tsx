import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/features/cash-flow')({
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
      title: 'Cash-flow forecast: know the 27th today · Tracky',
      description:
        'Tracky projects paydays, bills and instalments onto real balances and recomputes the first negative date daily. An estimate, not a promise.',
      locale: 'en',
      path: '/features/cash-flow',
      ogImage: ogImageFor('feature-cashflow'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/cash-flow', inLanguage: ['en', 'it'] }),
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
