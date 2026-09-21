import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/funzioni/collegamento-bancario')({
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
      title: 'Collegamento bancario PSD2, le tue chiavi · Tracky',
      description:
        'Tracky sincronizza le banche via Enable Banking con consenso in banca. Usa le tue chiavi app sul self-host; disabilitato sulla demo.',
      locale: 'it',
      path: '/it/funzioni/collegamento-bancario',
      ogImage: ogImageFor('feature-banksync'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/collegamento-bancario', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Collegamento bancario', path: '/it/funzioni/collegamento-bancario' },
        ]),
      ],
    }),
  component: BankIt,
});

function BankIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/funzioni/collegamento-bancario">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Self-host</span>
            <span className="mk-badge">Disabilitato sulla demo</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            La banca,
            <br />
            <span className="stroke">le tue</span> <span className="hl">chiavi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            La sync passa da <b>Enable Banking</b>: il consenso avviene in banca, Tracky importa conti, saldi e
            movimenti. Ogni utente collega <b>la propria app e le proprie chiavi</b> — nessuno vede le credenziali. Se
            il provider non è configurato, il collegamento resta disabilitato. La demo non ce l'ha: conti manuali + CSV
            fanno tutto.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href="https://github.com/masushidotdev/tracky" variant="pill">
            Self-host con sync →
          </MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['CONSENSO PSD2', 'LE TUE CHIAVI', 'REVOCABILE SEMPRE', 'FALLBACK CSV', 'NESSUNA CREDENZIALE SALVATA']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <figure className="mk-shot">
            <img src="/shots/import-mapping.png" alt="Mappatura colonne CSV di Tracky: il fallback manuale quando la sync non è disponibile" width={1440} height={800} loading="lazy" />
            <figcaption>Il fallback onesto: mappatura colonne CSV. Funziona ovunque, demo inclusa.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Sync dove lo ospiti. CSV ovunque.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Repo MIT · le tue chiavi · revocabile</p>
            <MagnetCta href="https://github.com/masushidotdev/tracky">Leggi il codice →</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
