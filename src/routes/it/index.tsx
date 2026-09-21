import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, DragStrip, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const seoIntro: Array<string> = [
  "Tracky è una budget app gratis open source che assegna a ogni euro un lavoro prima che tu lo spenda. Distribuisci il denaro già presente nei tuoi conti nei bucket del Piano, e quando Da assegnare arriva a zero il mese è blindato. È gratis, con licenza MIT e senza carta richiesta: prova la demo ospitata oppure installala tu.",
  "La Dashboard mostra il Disponibile dopo le spese del ciclo in corso: liquidità disponibile meno bollette residue e accantonamenti money box ancora dovuti. Il Flusso di cassa proietta in avanti stipendi, bollette, sottoscrizioni e trasferimenti noti, così vedi la prima data in cui il saldo potrebbe diventare negativo. Sono stime costruite sui dati presenti nell'app: controlla sempre valuta, saldo e ultimo aggiornamento prima di decidere.",
  "Resti tu al comando dei dettagli: gli import CSV finiscono nei conti manuali con validazione riga per riga, i rilevamenti delle sottoscrizioni arrivano come suggerimenti da confermare e le money box restano contenitori virtuali per gli obiettivi. Ogni valuta resta separata e non viene mai convertita, e i limiti delle carte non contano come contante spendibile. I Report scompongono spese ed entrate per categoria e si esportano in CSV per il commercialista.",
];

const seoBlocks: Array<{ h: string; paras: Array<string> }> = [
  { h: "Perché una budget app gratis open source batte il caos dei fogli di calcolo", paras: [
    "Conosci il caos: saldi copiati a mano, sottoscrizioni dimenticate e il classico 'pensavo fossero rimasti dei soldi' a fine mese. Tracky lo sostituisce con saldi osservati e sempre datati, pagamenti ricorrenti sotto controllo e un unico set di numeri di cui ti puoi fidare. Dai a ogni euro un lavoro nel Piano, vedi il Disponibile dopo le spese aggiornarsi man mano che arrivano gli impegni e riconcili ogni scadenza quando arriva il movimento vero, così niente conta due volte. Le possibili sottoscrizioni compaiono come suggerimenti che confermi tu, le valute non si mescolano mai e ognuna è tracciata per conto suo, e quando Da assegnare arriva a zero ogni euro ha già un compito.",
  ] },
  { h: "Come funziona: pianifica, proietta, verifica", paras: [
    "Parti dalla Dashboard: il Disponibile dopo le spese mostra quanto resta per le spese discrezionali nel ciclo in corso, calcolato separatamente per valuta con ogni sottrazione ispezionabile. Poi apri il Flusso di cassa, aggiungi bollette, entrate, trasferimenti e le money box virtuali e leggi il saldo proiettato data per data: sono stime ricavate dai tuoi dati, mai garanzie. Alimenta il sistema con gli import CSV nei conti manuali, validati riga per riga nel tuo browser, e conferma i suggerimenti su sottoscrizioni e trasferimenti così Piano, Report e Flusso di cassa restano precisi. Il plafond della carta non è mai soldi da spendere, e ogni totale è una fotografia: apri sempre il dettaglio e guarda la data dell'ultimo aggiornamento prima di decidere.",
  ] },
  { h: "Gratis e MIT: prove, non promesse", paras: [
    "Il badge dice Gratis e MIT, e il repository lo conferma: il codice è pubblico, quindi puoi leggere come viene calcolato ogni valore, dal Disponibile dopo le spese agli accantonamenti per le money box. Prova la demo ospitata senza carta, poi ospita in proprio la stessa app e collega le banche sulla tua istanza con connessioni che controlli e puoi rimuovere in qualsiasi momento. Gli import restano privati per progettazione: l'analisi avviene nel tuo browser e solo le righe che confermi lasciano la tua macchina. Codice che puoi leggere, un'app che puoi eseguire e dati che restano tuoi.",
  ] },
];

const seoFaq: Array<{ q: string; a: string }> = [
  { q: "Questa budget app gratis open source è davvero gratis?", a: "Sì. Tracky è gratis con licenza MIT: prova la demo ospitata senza carta oppure ospita tu il codice. Il repository è pubblico e puoi leggere come viene calcolato ogni valore, e i report si esportano in CSV quando vuoi. Gli import sono validati nel browser; solo le righe confermate vengono inviate." },
  { q: "Come funzionano le proiezioni del Flusso di cassa?", a: "Il Flusso di cassa parte dagli ultimi saldi noti e applica gli impegni datati — bollette, entrate, sottoscrizioni, trasferimenti — per calcolare il saldo dopo ogni data. Il risultato è una stima, non una garanzia: una sincronizzazione incompleta o una voce non assegnata può cambiarlo, quindi apri il dettaglio prima di agire." },
  { q: "Che fine fa il mio file CSV quando lo importo?", a: "Non lascia mai la tua macchina senza essere analizzato: Tracky lo legge nel tuo browser e mostra ogni riga come Valida, Duplicata o Errore con la sua motivazione. Solo le righe valide che confermi vengono inviate e finiscono in un conto manuale il cui saldo si aggiorna con l'import. Controlla dopo i nuovi movimenti." },
  { q: "I limiti delle carte contano come soldi spendibili?", a: "Mai. I saldi delle carte restano fuori dalla liquidità e dal Disponibile dopo le spese: il loro effetto arriva tramite l'estratto in scadenza sul conto di regolamento, così niente conta due volte. Né il saldo positivo né il limite di una carta sono soldi da assegnare. Controlla invece la data dell'estratto collegato e pianifica il pagamento." },
];

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
        faqJsonLd(seoFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
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
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoIntro.map((para, i) => (
          <Reveal key={i}>
            <p className="mk-sub" style={{ maxWidth: 720 }}>{para}</p>
          </Reveal>
        ))}
      </section>
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
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoBlocks.map((block) => (
          <Reveal key={block.h}>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>{block.h}</h2>
            {block.paras.map((para, i) => (
              <p key={i} className="mk-sub" style={{ maxWidth: 700 }}>{para}</p>
            ))}
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoFaq.map((entry) => (
          <Reveal key={entry.q}>
            <details>
              <summary>{entry.q}</summary>
              <p style={{ marginTop: 8 }}>{entry.a}</p>
            </details>
          </Reveal>
        ))}
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
