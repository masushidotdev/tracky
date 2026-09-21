import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/funzioni/flusso-di-cassa')({
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
      title: 'Flusso di cassa: il 27 lo sai oggi · Tracky',
      description:
        'Tracky proietta stipendi, bollette e rate sui saldi reali e ricalcola ogni giorno la prima data negativa. Una stima, non una promessa.',
      locale: 'it',
      path: '/it/funzioni/flusso-di-cassa',
      ogImage: ogImageFor('feature-cashflow'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/flusso-di-cassa', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Flusso di cassa', path: '/it/funzioni/flusso-di-cassa' },
        ]),
      ],
    }),
  component: CashflowIt,
});

function CashflowIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/funzioni/flusso-di-cassa">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Funziona nella demo</span>
            <span className="mk-badge">Gratis</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Il 27,
            <br />
            <span className="stroke">noto</span> <span className="hl">oggi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Il flusso di cassa proietta gli <b>impegni noti</b> — spese pianificate, abbonamenti, rate, estratti conto —
            sugli ultimi saldi. Prima data negativa, ricalcolata ogni giorno. Una <b>stima</b> di pianificazione, non una
            previsione statistica del comportamento.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app/planning' : signUpUrl}>{user ? 'Apri il flusso →' : 'Prova la demo →'}</MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['PRIMA DATA NEGATIVA', 'STIPENDI DENTRO', 'BOLLETTE FUORI', 'RICALCOLATO OGNI GIORNO', 'NESSUNA SORPRESA']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            Calendario, <span className="u">non sfera.</span>
          </h2>
        </Reveal>
        <Reveal>
          <p className="mk-sub">
            I money box finanziano virtualmente le spese future; i rimborsi credito arrivano dai finanziamenti tracciati.
            Quando una spesa pianificata non ha copertura, la proiezione lo mostra — prima della banca.
          </p>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Vedi il buco prima che veda te.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · cassa inclusa · senza carta</p>
            <MagnetCta href={user ? '/app/planning' : signUpUrl}>{user ? 'Apri il flusso →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
