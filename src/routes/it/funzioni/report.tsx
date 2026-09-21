import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/funzioni/report')({
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
      title: 'Report che parlano: spese, entrate, CSV · Tracky',
      description:
        'Sankey di cassa, spese ed entrate per categoria, trend vs dettaglio, viste salvate ed export CSV. Ogni valuta resta separata.',
      locale: 'it',
      path: '/it/funzioni/report',
      ogImage: ogImageFor('feature-reports'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/report', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Report', path: '/it/funzioni/report' },
        ]),
      ],
    }),
  component: ReportsIt,
});

function ReportsIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/funzioni/report">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Funziona nella demo</span>
            <span className="mk-badge">Gratis</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Numeri
            <br />
            <span className="stroke">che</span> <span className="hl">parlano.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Tre tab — <b>Sankey di cassa, spese, entrate</b> — per categoria con trend vs dettaglio, viste salvate ed{' '}
            <b>export CSV</b> che il commercialista adora. Trasferimenti esclusi dalle spese, ogni valuta separata, mai
            convertita di nascosto.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app/reports' : signUpUrl}>{user ? 'Apri i report →' : 'Prova la demo →'}</MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['FLUSSO SANKEY', 'PER CATEGORIA', 'TREND VS DETTAGLIO', 'VISTE SALVATE', 'EXPORT CSV']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Il commercialista ringrazia.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · report inclusi · senza carta</p>
            <MagnetCta href={user ? '/app/reports' : signUpUrl}>{user ? 'Apri i report →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
