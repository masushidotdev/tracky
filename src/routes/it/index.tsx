import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, DragStrip, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/')({
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
      title: 'Tracky — Budget e cash-flow gratis, open source',
      description:
        'Tracky è un budget planner gratis con licenza MIT: piano zero-based, previsione di cassa, import CSV e report. Prova la demo, senza carta.',
      locale: 'it',
      path: '/it/',
      ogImage: ogImageFor('home'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([{ name: 'Home', path: '/it/' }]),
      ],
    }),
  component: HomeIt,
});

const band = ['DA ASSEGNARE = 0 ✓', 'PREVISIONE CASH-FLOW', 'IMPORT CSV', 'REPORT SPESE', 'MIT OPEN SOURCE'];

const cards = [
  { e: '🪣', t: 'PIANO ZERO-BASED', p: 'Ogni euro ha un lavoro prima di essere speso. Da assegnare a zero, mese blindato.' },
  { e: '🔮', t: 'PREVISIONE CASSA', p: 'Bollette, stipendi e rate proiettati avanti. Prima data negativa, calcolata ogni giorno.' },
  { e: '📥', t: 'IMPORT CSV', p: 'Gli export della banca finiscono in un conto manuale in minuti. Parsing nel browser, mai caricati grezzi.' },
  { e: '📊', t: 'REPORT + CSV', p: 'Spese ed entrate per categoria, mese su mese. Esporta tutto per il commercialista.' },
  { e: '🏦', t: 'SYNC BANCARIA', p: 'PSD2 via Enable Banking sulla tua istanza. Usi le tue chiavi app — revocabili quando vuoi.' },
  { e: '🤖', t: 'ANALYST AI', p: "Aiuto all'esplorazione sulle istanze self-hosted: what-if, anomalie, scritture con approvazione." },
];

function HomeIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/">
      <header className="mk-hero">
        <div className="mk-stickers" aria-hidden="true">
          <span className="mk-stk" style={{ top: '6%', right: '8%', background: 'var(--mk-acid)', transform: 'rotate(6deg)' }}>
            GRATIS*
          </span>
          <span className="mk-stk" style={{ top: '48%', left: '-10px', background: '#fff', transform: 'rotate(-6deg)' }}>
            MIT open source
          </span>
        </div>
        <Reveal>
          <h1>
            I soldi
            <br />
            <span className="stroke">lavorano.</span>
            <br />
            <span className="hl">Tu vivi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Tracky assegna <b>ogni euro a un lavoro</b>, prevede il saldo a 90 giorni e tiene le spese sotto controllo.
            Gratis, open source, senza carta — prova la demo o installalo tu.
          </p>
        </Reveal>
        <Reveal>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Prova gratis la demo →'}</MagnetCta>
            <span style={{ fontWeight: 700 }}>↓ trascina le carte, tocca tutto</span>
          </div>
        </Reveal>
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Piano gratis</span>
            <span className="mk-badge">Senza carta</span>
            <span className="mk-badge">MIT</span>
            <span className="mk-badge">IT + EN</span>
          </div>
        </Reveal>
      </header>
      <MarqueeBand items={band} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            L'armeria <span className="u">anti-caos.</span>
          </h2>
        </Reveal>
        <p style={{ textAlign: 'center', color: '#666', fontSize: 14 }}>← trascina → · 6 strumenti, un nemico: lo scoperto di fine mese</p>
        <Reveal>
          <DragStrip>
            {cards.map((card) => (
              <div className="mk-card" key={card.t}>
                <div className="e">{card.e}</div>
                <h3>{card.t}</h3>
                <p>{card.p}</p>
              </div>
            ))}
          </DragStrip>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 8 }}>
            <img src="/shots/import-preview.png" alt="Anteprima import CSV di Tracky: validazione riga per riga prima dell'importazione" width={1440} height={800} loading="lazy" />
            <figcaption>Anteprima import CSV — ogni riga validata prima che si muova un euro. Screenshot dalla demo live.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            Senza vs <span className="u">con.</span>
          </h2>
        </Reveal>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>😵 CAOS FOGLIO DI CALCOLO</h3>
              <ul>
                <li>Saldi copiati a mano</li>
                <li>Abbonamenti dimenticati</li>
                <li>Weekend su Excel</li>
                <li>“Pensavo ci fossero…”</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>😎 CON TRACKY</h3>
              <ul>
                <li>Saldi osservati, sempre datati</li>
                <li>Ricorrenze sotto controllo</li>
                <li>20 minuti dal telefono</li>
                <li>Stessi numeri, zero litigi</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
      <section className="mk-section" id="go" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Scoperto avvisato. Tu armato.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Gratis · 5 minuti · senza carta · MIT open source</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
