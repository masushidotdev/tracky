import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/features/reports')({
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
      title: 'Reports that talk: spending, income, CSV · Tracky',
      description:
        'Cash-flow Sankey, spending and income by category, trends vs breakdown, saved views and CSV export. Every currency kept separate.',
      locale: 'en',
      path: '/features/reports',
      ogImage: ogImageFor('feature-reports'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/reports', inLanguage: ['en', 'it'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Reports', path: '/features/reports' },
        ]),
      ],
    }),
  component: ReportsEn,
});

function ReportsEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/features/reports">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Works in the demo</span>
            <span className="mk-badge">Free</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Numbers
            <br />
            <span className="stroke">that</span> <span className="hl">talk.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Three tabs — <b>cash-flow Sankey, spending, income</b> — by category with trends vs breakdown, saved views
            and <b>CSV export</b> your accountant will love. Transfers excluded from spending, every currency shown
            separately, never converted behind your back.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app/reports' : signUpUrl}>{user ? 'Open reports →' : 'Try the demo →'}</MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['SANKEY FLOW', 'BY CATEGORY', 'TRENDS VS BREAKDOWN', 'SAVED VIEWS', 'CSV EXPORT']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Your accountant says thanks.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · reports included · no card</p>
            <MagnetCta href={user ? '/app/reports' : signUpUrl}>{user ? 'Open reports →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
