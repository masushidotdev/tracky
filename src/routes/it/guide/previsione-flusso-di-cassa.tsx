import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Prima finanzia il piano', p: 'La cassa legge ultimi saldi più impegni. Niente piano, niente proiezione.' },
  { t: 'Aggiungi spese pianificate', p: 'Bollette, stipendi, trasferimenti come spese pianificate con date e importi.' },
  { t: 'Converti gli abbonamenti', p: 'Gli addebiti ricorrenti diventano sottoscrizioni — i rinnovi entrano da soli.' },
  { t: 'Leggi la prima data negativa', p: 'Il numero chiave: quando il saldo va sotto zero se non cambia niente.' },
  { t: 'Sistemala presto', p: 'Sposta un pagamento, finanzia un money box, taglia un bucket. Stime aggiornate ogni giorno.' },
];

export const Route = createFileRoute('/it/guide/previsione-flusso-di-cassa')({
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
      title: 'Come prevedere il flusso di cassa in Tracky',
      description:
        '5 passi: finanzia il piano, aggiungi spese pianificate, converti abbonamenti, leggi la prima data negativa, sistemala. Demo gratis.',
      locale: 'it',
      path: '/it/guide/previsione-flusso-di-cassa',
      ogImage: ogImageFor('guide-cashflow'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/guide/previsione-flusso-di-cassa', inLanguage: ['it', 'en'] }),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Come prevedere il flusso di cassa in Tracky',
          step: steps.map((s) => ({ '@type': 'HowToStep', name: s.t, text: s.p })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Guide', path: '/it/guide/previsione-flusso-di-cassa' },
        ]),
      ],
    }),
  component: GuideIt,
});

function GuideIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/guide/previsione-flusso-di-cassa">
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
            Prevedi la cassa,
            <br />
            <span className="hl">5 passi.</span>
          </h1>
        </Reveal>
      </header>
      <MarqueeBand items={['PRIMA IL PIANO', 'SPESE PIANIFICATE', 'ABBONAMENTI', 'DATA NEGATIVA', 'SISTEMA PRESTO']} />
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
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Conosci il buco. Evitalo.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · stime, non promesse</p>
            <MagnetCta href={user ? '/app/planning' : signUpUrl}>{user ? 'Apri la cassa →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
