import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/features/bank-connections')({
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
      title: 'Bank connections: PSD2 sync, your keys · Tracky',
      description:
        'Tracky syncs banks via Enable Banking with consent at the bank. Bring your own app keys on self-host; disabled on the hosted demo.',
      locale: 'en',
      path: '/features/bank-connections',
      ogImage: ogImageFor('feature-banksync'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/bank-connections', inLanguage: ['en', 'it'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Bank connections', path: '/features/bank-connections' },
        ]),
      ],
    }),
  component: BankEn,
});

function BankEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/features/bank-connections">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Self-host</span>
            <span className="mk-badge">Disabled on the demo</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Your bank,
            <br />
            <span className="stroke">your</span> <span className="hl">keys.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Bank sync runs through <b>Enable Banking</b>: consent happens at your bank, Tracky imports accounts,
            balances and movements. Each user connects <b>their own app and keys</b> — maintainers never see bank
            credentials. If the provider is not configured, connect stays disabled. The hosted demo ships without it:
            manual accounts + CSV carry the show.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href="https://github.com/masushidotdev/tracky" variant="pill">
            Self-host with sync →
          </MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['PSD2 CONSENT', 'YOUR APP KEYS', 'REVOCABLE ANYTIME', 'CSV FALLBACK', 'NO CREDENTIALS STORED']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <figure className="mk-shot">
            <img src="/shots/import-mapping.png" alt="Tracky CSV column mapping: the manual fallback when bank sync is unavailable" width={1440} height={800} loading="lazy" />
            <figcaption>The honest fallback: CSV column mapping. Works everywhere, demo included.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Sync where you host. CSV everywhere.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>MIT repo · your keys · revocable</p>
            <MagnetCta href="https://github.com/masushidotdev/tracky">Read the code →</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
