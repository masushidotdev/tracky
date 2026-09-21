import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Importa storia vera', p: 'Due-tre mesi di CSV danno alle finestre di rilevamento qualcosa da masticare.' },
  { t: 'Rivedi i suggerimenti', p: 'Pattern mensili (~25–35 giorni) e annuali (~355–375 giorni) emergono come suggerimenti — suggerimento, non certezza.' },
  { t: 'Conferma quelli veri', p: 'Nome, importo, intervallo, prossima scadenza. Gli attivi entrano nei rinnovi e nella cassa.' },
  { t: 'Uccidi i doppioni', p: 'Due addebiti, un divano? Disdici nel servizio vero, poi marca inattivo in Tracky.' },
  { t: 'Guarda i rinnovi', p: 'Abbonamenti e rate in scadenza avvisano prima di colpire. Niente più rinnovi sorpresa.' },
];

export const Route = createFileRoute('/it/guide/cancella-abbonamenti-inutili')({
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
      title: 'Come trovare e cancellare abbonamenti inutili',
      description:
        '5 passi: importa storia, rivedi suggerimenti, conferma, uccidi doppioni, guarda rinnovi. Gli abbonamenti nutrono la cassa. Demo gratis.',
      locale: 'it',
      path: '/it/guide/cancella-abbonamenti-inutili',
      ogImage: ogImageFor('guide-subscriptions'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/guide/cancella-abbonamenti-inutili', inLanguage: ['it', 'en'] }),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Come trovare e cancellare abbonamenti inutili',
          step: steps.map((s) => ({ '@type': 'HowToStep', name: s.t, text: s.p })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Guide', path: '/it/guide/cancella-abbonamenti-inutili' },
        ]),
      ],
    }),
  component: GuideIt,
});

function GuideIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/guide/cancella-abbonamenti-inutili">
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
            Caccia agli abbonamenti,
            <br />
            <span className="hl">5 passi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Gli addebiti ricorrenti si nascondono in vista. Tracky trova i pattern, tu confermi, la cassa resta onesta.
          </p>
        </Reveal>
      </header>
      <MarqueeBand items={['IMPORTA STORIA', 'RIVEDI', 'CONFERMA', 'UCCIDI DOPPIONI', 'GUARDA RINNOVI']} />
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
            <h2 className="mk-h2">Un divano. Un abbonamento.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · suggerimenti, non certezze</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
