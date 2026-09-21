import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Crea un conto manuale', p: 'Checking, EUR. Nome e via in 20 secondi. Nessuna banca richiesta.' },
  { t: 'Importa un CSV della banca', p: "Esporta dalla banca, mappa data/descrizione/importo, anteprima riga per riga, importa." },
  { t: 'Crea il piano', p: "Scegli il conto come fonte. Una valuta, un piano." },
  { t: 'Assegna ogni euro', p: 'Riempi i bucket finché Da assegnare arriva a zero. Anche Non spiegato deve essere zero.' },
  { t: 'Guarda il Disponibile riportare', p: 'I saldi positivi passano al mese dopo. Lo sforamento riduce Da assegnare — sistemalo spostando denaro.' },
];

export const Route = createFileRoute('/it/guide/budget-zero-based')({
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
      title: 'Come creare un budget zero-based in Tracky',
      description:
        '5 passi: conto manuale, import CSV, primo piano, assegna a zero, riporta il Disponibile. Funziona nella demo gratis.',
      locale: 'it',
      path: '/it/guide/budget-zero-based',
      ogImage: ogImageFor('guide-budget'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/guide/budget-zero-based', inLanguage: ['it', 'en'] }),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Come creare un budget zero-based in Tracky',
          step: steps.map((s) => ({ '@type': 'HowToStep', name: s.t, text: s.p })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Guide', path: '/it/guide/budget-zero-based' },
        ]),
      ],
    }),
  component: GuideIt,
});

function GuideIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/guide/budget-zero-based">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Guida</span>
            <span className="mk-badge">5 passi</span>
            <span className="mk-badge">Demo gratis</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Primo budget,
            <br />
            <span className="hl">5 passi.</span>
          </h1>
        </Reveal>
      </header>
      <MarqueeBand items={['CONTO', 'CSV', 'PIANO', 'ASSEGNA A ZERO', 'RIPORTA']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {steps.map((s, i) => (
          <Reveal key={s.t}>
            <div className="mk-card" style={{ maxWidth: 760, margin: '0 auto 16px', minWidth: 0, transform: 'none' }}>
              <div className="e">{i + 1}.</div>
              <h3>{s.t.toUpperCase()}</h3>
              <p>{s.p}</p>
            </div>
          </Reveal>
        ))}
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24, maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
            <img src="/shots/import-preview.png" alt="Passo 2 in azione: anteprima CSV di Tracky che valida ogni riga" width={1440} height={800} loading="lazy" />
            <figcaption>Passo 2 in azione: l'anteprima CSV dalla demo live.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Tocca a te. 5 passi.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · senza carta · guida inclusa</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
