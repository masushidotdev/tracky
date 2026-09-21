import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, DragStrip, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/for-couples-and-families')({
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
      title: 'Budget for couples & families, same numbers · Tracky',
      description:
        'One plan, same balances and buckets for the whole household. Money boxes for school, holidays and bills. Free demo, no card.',
      locale: 'en',
      path: '/for-couples-and-families',
      ogImage: ogImageFor('for-couples'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/for-couples-and-families', inLanguage: ['en', 'it'] }),
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
            One household, one plan: <b>same balances, same buckets</b>, visible to everyone. Money boxes pre-fund
            school, holidays and big bills virtually. No more “I thought there was…”.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Try the demo →'}</MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['ONE PLAN', 'SAME BUCKETS', 'MONEY BOXES', 'SCHOOL + HOLIDAYS', 'NO FIGHTS']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <DragStrip>
            <div className="mk-card"><div className="e">🏠</div><h3>HOUSE</h3><p>Rent, bills, mortgage bucket — funded before the month starts.</p></div>
            <div className="mk-card"><div className="e">🛒</div><h3>GROCERIES</h3><p>One bucket, both shoppers. Activity shows who spent what.</p></div>
            <div className="mk-card"><div className="e">🎒</div><h3>SCHOOL</h3><p>Money-boxed term by term. No September panic.</p></div>
            <div className="mk-card"><div className="e">🏖️</div><h3>HOLIDAYS</h3><p>A little every month. Booked when funded, not when hoped.</p></div>
          </DragStrip>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">One table. Same numbers.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · 5 minutes · no card</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
