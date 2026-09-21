import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/funzioni/piano-zero-based')({
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
      title: 'Piano zero-based: ogni euro ha un lavoro · Tracky',
      description:
        'Il piano zero-based di Tracky assegna la liquidità osservata ai bucket prima di spenderla. Da assegnare a zero — una valuta, nessun doppio conteggio.',
      locale: 'it',
      path: '/it/funzioni/piano-zero-based',
      ogImage: ogImageFor('feature-plan'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/piano-zero-based', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Piano zero-based', path: '/it/funzioni/piano-zero-based' },
        ]),
      ],
    }),
  component: PlanIt,
});

function PlanIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/funzioni/piano-zero-based">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Funziona nella demo</span>
            <span className="mk-badge">Gratis</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Ogni euro,
            <br />
            <span className="hl">occupato.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Il Piano assegna il denaro <b>già osservato</b> nei conti un lavoro prima che venga speso. Assegnato,
            Attività e Disponibile per bucket; <b>Da assegnare a zero</b>, mese blindato. Una valuta, debiti carte fuori
            dalla liquidità, nessun doppio conteggio.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app/plan' : signUpUrl}>{user ? 'Apri il piano →' : 'Prova la demo →'}</MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['DA ASSEGNARE = 0', 'ASSEGNATO · ATTIVITÀ · DISPONIBILE', 'UNA VALUTA', 'NESSUN DOPPIO CONTEGGIO']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            Come si <span className="u">chiude.</span>
          </h2>
        </Reveal>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>😵 TETTI MENSILI</h3>
              <ul>
                <li>Limiti che nessuno aggiorna</li>
                <li>Resti che nessuno spiega</li>
                <li>Carte mescolate al contante</li>
                <li>Sorpresa di dicembre</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>😎 ZERO-BASED</h3>
              <ul>
                <li>Saldi osservati, datati</li>
                <li>Non spiegato deve essere zero</li>
                <li>Le carte hanno bucket di pagamento</li>
                <li>Il Disponibile positivo riporta</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Assegna tutto. Dormi bene.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · piano incluso · senza carta</p>
            <MagnetCta href={user ? '/app/plan' : signUpUrl}>{user ? 'Apri il piano →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
