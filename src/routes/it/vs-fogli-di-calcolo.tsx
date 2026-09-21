import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/vs-fogli-di-calcolo')({
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
      title: 'Tracky vs fogli di calcolo: chiudi il mese · Tracky',
      description:
        'I fogli copiano saldi a mano; Tracky ancora ai saldi osservati, assegna ogni euro e prevede la cassa. Demo gratis.',
      locale: 'it',
      path: '/it/vs-fogli-di-calcolo',
      ogImage: ogImageFor('vs-spreadsheets'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/vs-fogli-di-calcolo', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Vs fogli di calcolo', path: '/it/vs-fogli-di-calcolo' },
        ]),
      ],
    }),
  component: VsIt,
});

function VsIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/vs-fogli-di-calcolo">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Pensiona
            <br />
            <span className="stroke">il</span> <span className="hl">foglio.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            I fogli <b>copiano saldi a mano</b> e invecchiano ogni ora. Tracky ancora il piano a <b>saldi osservati e
            datati</b>, assegna ogni euro e prevede il 27. Stessa disciplina, nessuna idraulica.
          </p>
        </Reveal>
      </header>
      <MarqueeBand items={['NIENTE COPIA-INCOLLA', 'SALDI DATATI', 'OGNI EURO UN LAVORO', 'CASSA INCLUSA', 'CSV IN E OUT']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>📉 IL FOGLIO</h3>
              <ul>
                <li>Saldi digitati a mano</li>
                <li>Formule che si rompono in silenzio</li>
                <li>Uno scrive, gli altri guardano</li>
                <li>Storia in nomefile_v7_finale</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>📈 TRACKY</h3>
              <ul>
                <li>Saldi osservati, datati</li>
                <li>Invarianti garantiti dal codice</li>
                <li>Stessi numeri per tutti</li>
                <li>Storia interrogabile, esportabile</li>
              </ul>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24 }}>
            <img src="/shots/import-summary.png" alt="Risultato import Tracky: l'anti-foglio — 33 movimenti veri in minuti" width={1440} height={800} loading="lazy" />
            <figcaption>L'anti-foglio: 33 movimenti veri, zero formule digitate.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Tieni il CSV. Molla la fatica.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Import CSV · export CSV · demo gratis</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
