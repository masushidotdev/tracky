import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/for-freelancers')({
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
      title: 'Budgeting for freelancers: work vs life · Tracky',
      description:
        'Separate work and personal money, keep tax deadlines inside cash-flow, export CSV for the accountant. Free demo, no card.',
      locale: 'en',
      path: '/for-freelancers',
      ogImage: ogImageFor('for-freelancers'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/for-freelancers', inLanguage: ['en', 'it'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'For freelancers', path: '/for-freelancers' },
        ]),
      ],
    }),
  component: FreelanceEn,
});

function FreelanceEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/for-freelancers">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Work money.
            <br />
            <span className="stroke">Life money.</span>
            <br />
            <span className="hl">Separated.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Invoices land, taxes wait: keep <b>separate accounts</b>, put tax deadlines inside <b>cash-flow</b> as
            planned items, and hand your accountant a clean <b>CSV</b>. Irregular income, regular control.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Try the demo →'}</MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['SEPARATE ACCOUNTS', 'TAX IN CASH-FLOW', 'CSV FOR ACCOUNTANT', 'IRREGULAR IN, CONTROL OUT']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>😵 MIXED POT</h3>
              <ul>
                <li>Salary or invoice? Who knows</li>
                <li>Tax bill arrives as a surprise</li>
                <li>Accountant gets a shoebox</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>😎 SPLIT LEDGER</h3>
              <ul>
                <li>Work vs personal accounts</li>
                <li>Taxes planned, funded, visible</li>
                <li>CSV export, accountant smiles</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Invoice. Set aside. Relax.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · 5 minutes · no card</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
