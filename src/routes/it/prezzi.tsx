import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/prezzi')({
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
      title: 'Prezzi — Gratis per sempre, Pro in arrivo · Tracky',
      description:
        'Tracky costa €0: demo ospitata gratis, self-host MIT, senza carta. Il piano Pro esiste nel codice ma non è acquistabile.',
      locale: 'it',
      path: '/it/prezzi',
      ogImage: ogImageFor('pricing'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/prezzi', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Prezzi', path: '/it/prezzi' },
        ]),
      ],
    }),
  component: PricingIt,
});

function PricingIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  const cta = user ? '/app' : signUpUrl;
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/prezzi">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Gratis <span className="hl">per sempre.</span>
            <br />
            <span className="stroke">Pro: poi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Oggi Tracky costa <b>€0</b>: demo ospitata più self-host MIT. Un piano Pro è previsto nel codice per limiti
            analyst, scenari e piani multipli — ma <b>non esiste fatturazione</b> e nulla è in vendita.
          </p>
        </Reveal>
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">€0 oggi</span>
            <span className="mk-badge">Senza carta</span>
            <span className="mk-badge">Nessun checkout</span>
          </div>
        </Reveal>
      </header>
      <MarqueeBand items={['DEMO GRATIS', 'SELF-HOST MIT', 'SENZA CARTA', 'NESSUN CHECKOUT', 'PRO SOLO SE RICHIESTO']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d good">
              <h3>🟢 GRATIS — OGGI</h3>
              <ul>
                <li>Demo ospitata, funzioni core complete</li>
                <li>Piano zero-based, cassa, report</li>
                <li>Conti manuali + import CSV</li>
                <li>Self-host da GitHub, MIT</li>
              </ul>
              <p style={{ marginTop: 18 }}>
                <MagnetCta href={cta} variant="pill">
                  {user ? 'Apri la demo →' : 'Inizia gratis →'}
                </MagnetCta>
              </p>
            </div>
            <div className="mk-d bad" style={{ background: '#fff' }}>
              <h3>🔜 PRO — IN ARRIVO</h3>
              <ul>
                <li>Più messaggi analyst al giorno</li>
                <li>Scenari, piani multipli</li>
                <li>Solo se gli utenti lo chiedono</li>
                <li>Nessun prezzo — non esiste checkout</li>
              </ul>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24 }}>
            <img src="/shots/import-summary.png" alt="Riepilogo import Tracky: 33 movimenti importati nel conto demo" width={1440} height={800} loading="lazy" />
            <figcaption>Cosa compri con €0: un registro vero in minuti. Screenshot dalla demo live.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">€0. Senza asterischi nascosti.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · repo MIT · senza carta</p>
            <MagnetCta href={cta}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
