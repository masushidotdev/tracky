import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const INTRO = "Il budget freelance partita IVA è complicato perché le entrate ballano e le tasse aspettano. Fatturi i clienti, i soldi arrivano in ritardo, e intanto affitto, strumenti e scadenze fiscali continuano ad arrivare. Tracky ti dà una divisione semplice: conti lavoro da una parte, conti vita dall'altra, con le scadenze fiscali dentro il flusso di cassa come voci pianificate. Vedi sempre cosa puoi spendere davvero.\n\nImporti gli export bancari come CSV nei conti manuali, abbini le colonne e controlli ogni riga prima che venga registrata. I duplicati vengono segnalati, così puoi reimportare in sicurezza dopo un'interruzione. Scadenze fiscali pianificate, sottoscrizioni e trasferimenti costruiscono un calendario di cassa che mostra il saldo dopo ogni data. Sono stime basate sulle voci conosciute, non garanzie, e i suggerimenti sulle sottoscrizioni vanno sempre verificati da te.\n\nLe money box sono contenitori virtuali dove accantoni le tasse senza spostare soldi veri. Il tuo Piano mensile mostra cosa è pronto da assegnare e cosa ti aspetta in ogni bucket. Esporti righe CSV pulite per il commercialista quando arriva la stagione fiscale, poi provi tutto nella demo gratis senza carta.";

const BLOCKS = [
  { h: "Il budget freelance partita IVA si rompe in un conto unico: ecco perché",
    p: "Fai passare tutto da un unico conto, così ogni saldo ti mente: arriva una grossa fattura, ti senti ricco, e poi la scadenza fiscale ti ricorda che parte di quei soldi non è mai stata davvero tua da spendere. I clienti pagano in ritardo mentre affitto, strumenti e sottoscrizioni vanno pagati puntuali, così i mesi lenti sembrano emergenze anche quando l'anno nel complesso funziona. Il commercialista riceve un export confuso pieno di movimenti personali e di lavoro mescolati, e tu paghi quella pulizia con ore extra, costi extra e stress extra. Finisci per tirare a indovinare invece di decidere, ed è proprio qui che separare soldi lavoro e soldi vita, e mettere le scadenze fiscali nel flusso di cassa come voci pianificate, cambia tutto.", },
  { h: "Un martedì più tranquillo con Tracky",
    p: "Apri Tracky martedì mattina e controlli il calendario del flusso di cassa, che elenca scadenze fiscali pianificate, sottoscrizioni e trasferimenti in ordine di data e mostra il saldo dopo ogni data come stima dalle voci conosciute. Importi l'export bancario della scorsa settimana come CSV nel conto manuale giusto, abbini le colonne e controlli ogni riga mentre i duplicati restano segnalati così niente viene contato due volte. Quando arriva una fattura, accantoni una parte in una money box virtuale per le tasse, assegni il resto nel Piano e lasci intatti i bucket personali. Prima di pranzo esporti righe pulite per il commercialista, confermi i suggerimenti sulle sottoscrizioni che riconosci davvero e torni al lavoro con un numero chiaro su cosa puoi spendere.", },
  { h: "Inizia in cinque minuti con la demo gratis",
    p: "Parti dalla demo gratis senza carta, crei un conto manuale per il lavoro e uno per la vita, e ogni importo ha il suo posto dal primo giorno. Aggiungi le prossime scadenze fiscali come voci pianificate con date e importi reali, colleghi i conti giusti e le vedi nel flusso di cassa prima che possano sorprenderti. Importi l'ultimo CSV bancario, controlli l'anteprima riga per riga, tieni solo i suggerimenti sulle sottoscrizioni che riconosci e crei la prima money box virtuale per la quota tasse della prossima fattura. Nel Piano assegni cosa è pronto, esporti un file pulito per il commercialista e ripeti questo giro ogni martedì finché le entrate irregolari diventano noiose e sotto controllo.", },
];

const PAGE_FAQ = [
  { q: "Il budget freelance partita IVA funziona con entrate irregolari?",
    a: "Sì. Tieni separati conti lavoro e personali, aggiungi le scadenze fiscali come voci pianificate e leggi il flusso di cassa come stime dalle voci conosciute. Il Piano mostra cosa è pronto da assegnare dopo gli impegni. Hai controllo senza cambiare come ti pagano i clienti, e puoi esplorare tutto nella demo gratis.", },
  { q: "Come gestisco le tasse in Tracky?",
    a: "Registri ogni scadenza fiscale come voce pianificata con data, importo e conto reali. Appare nel flusso di cassa e nel disponibile dopo le spese come impegno, così quei soldi risultano già destinati. Quando paghi, colleghi il movimento reale e la voce smette di pesare sulle date future.", },
  { q: "Posso importare i movimenti bancari e condividerli con il commercialista?",
    a: "Sì. Importi gli export bancari come CSV nei conti manuali attivi, abbini le colonne e controlli l'anteprima prima di confermare. I duplicati vengono segnalati e saltati, e ogni valuta va nel suo conto corrispondente. Poi esporti righe pulite per il commercialista dai movimenti già controllati.", },
  { q: "Le money box spostano soldi veri, e i suggerimenti sulle sottoscrizioni sono certi?",
    a: "No, senza sorprese. Le money box sono virtuali: registrano cosa accantoni senza muovere i saldi bancari, quindi collega il trasferimento reale quando i soldi si muovono davvero. Il rilevamento delle sottoscrizioni è un suggerimento, non una certezza: conferma esercente, importo e cadenza prima di trattare un rinnovo come impegno.", },
];

export const Route = createFileRoute('/it/per-freelance-e-partita-iva')({
  loader: loadMarketingAuth,
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
        faqJsonLd(PAGE_FAQ.map((entry) => ({ question: entry.q, answer: entry.a }))),
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
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>{INTRO}</p>
        </Reveal>
      </section>
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
        {BLOCKS.map((block) => (
          <Reveal key={block.h}>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>{block.h}</h2>
            <p className="mk-sub" style={{ maxWidth: 700 }}>{block.p}</p>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>Domande e risposte.</h2>
        </Reveal>
        {PAGE_FAQ.map((entry) => (
          <Reveal key={entry.q}>
            <details>
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
            <h2 className="mk-h2">Fattura. Accantona. Respira.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · 5 minuti · senza carta</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
