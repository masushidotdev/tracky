import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/pricing')({
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
      title: 'Pricing — Free forever, Pro coming soon · Tracky',
      description:
        'Tracky costs €0: free hosted demo, MIT self-host, no card. A Pro tier exists in code but billing is not available yet.',
      locale: 'en',
      path: '/pricing',
      ogImage: ogImageFor('pricing'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/pricing', inLanguage: ['en', 'it'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Pricing', path: '/pricing' },
        ]),
      ],
    }),
  component: PricingEn,
});

function PricingEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  const cta = user ? '/app' : signUpUrl;
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/pricing">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Free <span className="hl">forever.</span>
            <br />
            <span className="stroke">Pro: later.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Today Tracky costs <b>€0</b>: hosted demo plus MIT self-host. A Pro tier is reserved in the code for analyst
            limits, forecast scenarios and multiple plans — but <b>billing does not exist yet</b> and nothing is for sale.
          </p>
        </Reveal>
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">€0 today</span>
            <span className="mk-badge">No card</span>
            <span className="mk-badge">No checkout</span>
          </div>
        </Reveal>
      </header>
      <MarqueeBand items={['FREE HOSTED DEMO', 'MIT SELF-HOST', 'NO CARD', 'NO CHECKOUT', 'PRO ONLY IF REQUESTED']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d good">
              <h3>🟢 FREE — TODAY</h3>
              <ul>
                <li>Hosted demo, all core features</li>
                <li>Zero-based plan, cash-flow, reports</li>
                <li>Manual accounts + CSV import</li>
                <li>Self-host from GitHub, MIT</li>
              </ul>
              <p style={{ marginTop: 18 }}>
                <MagnetCta href={cta} variant="pill">
                  {user ? 'Open the demo →' : 'Start free →'}
                </MagnetCta>
              </p>
            </div>
            <div className="mk-d bad" style={{ background: '#fff' }}>
              <h3>🔜 PRO — COMING SOON</h3>
              <ul>
                <li>More analyst messages per day</li>
                <li>Forecast scenarios, multiple plans</li>
                <li>Only if users ask for it</li>
                <li>No price yet — no checkout exists</li>
              </ul>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24 }}>
            <img src="/shots/import-summary.png" alt="Tracky import summary: 33 transactions imported into the demo account" width={1440} height={800} loading="lazy" />
            <figcaption>What €0 buys: a real ledger in minutes. Screenshot from the live demo.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">€0. No asterisk big enough to hide.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · MIT repo · no card</p>
            <MagnetCta href={cta}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
