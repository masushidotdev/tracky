import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/vs-spreadsheets')({
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
      title: 'Tracky vs spreadsheets: close the month · Tracky',
      description:
        'Spreadsheets copy balances by hand; Tracky anchors to observed balances, assigns every euro and forecasts cash-flow. Free demo.',
      locale: 'en',
      path: '/vs-spreadsheets',
      ogImage: ogImageFor('vs-spreadsheets'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/vs-spreadsheets', inLanguage: ['en', 'it'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Vs spreadsheets', path: '/vs-spreadsheets' },
        ]),
      ],
    }),
  component: VsEn,
});

function VsEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/vs-spreadsheets">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Retire
            <br />
            <span className="stroke">the</span> <span className="hl">sheet.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Spreadsheets <b>copy balances by hand</b> and age by the hour. Tracky anchors the plan to <b>observed,
            dated balances</b>, assigns every euro, and forecasts the 27th. Same discipline, none of the plumbing.
          </p>
        </Reveal>
      </header>
      <MarqueeBand items={['NO COPY-PASTE', 'DATED BALANCES', 'EVERY EURO A JOB', 'CASH-FLOW INCLUDED', 'CSV BOTH WAYS']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>📉 THE SHEET</h3>
              <ul>
                <li>Balances typed by hand</li>
                <li>Formulas break silently</li>
                <li>One editor, many viewers</li>
                <li>History in filename_v7_final</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>📈 TRACKY</h3>
              <ul>
                <li>Observed balances, dated</li>
                <li>Invariants enforced in code</li>
                <li>Same numbers for everyone</li>
                <li>History queryable, exportable</li>
              </ul>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24 }}>
            <img src="/shots/import-summary.png" alt="Tracky import result: the anti-spreadsheet — 33 real transactions in minutes" width={1440} height={800} loading="lazy" />
            <figcaption>The anti-spreadsheet: 33 real transactions, zero formulas typed.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Keep the CSV. Drop the chores.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Import CSV · export CSV · free demo</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
