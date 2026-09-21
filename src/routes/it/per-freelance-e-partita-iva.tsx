import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/per-freelance-e-partita-iva')({
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
      title: 'Budget per freelance e partita IVA · Tracky',
      description:
        'Separa soldi lavoro e personali, metti le tasse nel flusso di cassa, esporta CSV per il commercialista. Demo gratis, senza carta.',
      locale: 'it',
      path: '/it/per-freelance-e-partita-iva',
      ogImage: ogImageFor('for-freelancers'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/per-freelance-e-partita-iva', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Per freelance e partita IVA', path: '/it/per-freelance-e-partita-iva' },
        ]),
      ],
    }),
  component: FreelanceIt,
});

function FreelanceIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/per-freelance-e-partita-iva">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Soldi lavoro.
            <br />
            <span className="stroke">Soldi vita.</span>
            <br />
            <span className="hl">Separati.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Le fatture arrivano, le tasse aspettano: tieni <b>conti separati</b>, metti le scadenze fiscali nel{' '}
            <b>flusso di cassa</b> come spese pianificate e consegna al commercialista un <b>CSV</b> pulito. Entrate
            irregolari, controllo regolare.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Prova la demo →'}</MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['CONTI SEPARATI', 'TASSE NEL FLUSSO', 'CSV AL COMMERCIALISTA', 'ENTRATE IRREGOLARI, CONTROLLO SÌ']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>😵 PENTOLONE UNICO</h3>
              <ul>
                <li>Stipendio o fattura? Chissà</li>
                <li>La cartella esattoriale è una sorpresa</li>
                <li>Al commercialista una scatola di scontrini</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>😎 REGISTRO DOPPIO</h3>
              <ul>
                <li>Conti lavoro vs personali</li>
                <li>Tasse pianificate, accantonate, visibili</li>
                <li>Export CSV, commercialista felice</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Fattura. Accantona. Respira.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · 5 minuti · senza carta</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
