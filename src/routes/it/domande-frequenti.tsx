import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const qa = [
  {
    q: 'Tracky è davvero gratis?',
    a: 'Sì. Demo ospitata e self-host MIT costano €0, senza carta. Un piano Pro è previsto nel codice ma non esiste fatturazione — nulla è in vendita.',
  },
  {
    q: 'Devo collegare la banca?',
    a: 'No. Conti manuali più import CSV bastano. La sync via Enable Banking è disponibile sulla tua istanza con le tue chiavi ed è disabilitata sulla demo.',
  },
  {
    q: "L'analyst AI funziona nella demo?",
    a: 'No — è gated per ambiente e nascosto sulla demo. Dove abilitato, è un aiuto esplorativo, non consulenza finanziaria, e le scritture sensibili richiedono approvazione.',
  },
  {
    q: 'Va bene per coppie o freelance?',
    a: 'Sì. Le coppie condividono gli stessi numeri; i freelance tengono conti lavoro separati, vedono le scadenze fiscali e esportano CSV per il commercialista.',
  },
  {
    q: 'Di chi sono i miei dati?',
    a: 'Tuoi. Export CSV quando vuoi, codice MIT ispezionabile e self-hostabile, nessuna vendita dati. Le valute non vengono mai mescolate né convertite.',
  },
  {
    q: 'Come inizio?',
    a: 'Crea un conto manuale, importa un CSV della banca, costruisci il primo piano zero-based. La guida Primo budget mostra il percorso da 5 minuti.',
  },
];

export const Route = createFileRoute('/it/domande-frequenti')({
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
      title: 'Domande frequenti su Tracky, risposte oneste',
      description:
        'Risposte oneste: gratis per sempre, banca non richiesta, disponibilità sync e analyst, coppie, freelance, proprietà dei dati.',
      locale: 'it',
      path: '/it/domande-frequenti',
      ogImage: ogImageFor('faq'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/domande-frequenti', inLanguage: ['it', 'en'] }),
        faqJsonLd(qa.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'FAQ', path: '/it/domande-frequenti' },
        ]),
      ],
    }),
  component: FaqIt,
});

function FaqIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/domande-frequenti">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Chiesto.
            <br />
            <span className="hl">Risposto.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Niente nebbia marketing: cosa costa (niente), cosa richiede la banca (niente), cosa è disabilitato sulla
            demo (sync + analyst), e di chi sono i dati (<b>tuoi</b>).
          </p>
        </Reveal>
      </header>
      <MarqueeBand items={['Niente nebbia', 'Senza carta', 'Senza lock-in', 'Codice MIT', 'Dati tuoi']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {qa.map((entry) => (
          <Reveal key={entry.q}>
            <details open={qa.indexOf(entry) === 0}>
              <summary>{entry.q}</summary>
              <p style={{ marginTop: 8 }}>{entry.a}</p>
            </details>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Ancora curioso? Toccalo.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · 5 minuti · senza carta</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
