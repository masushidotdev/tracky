import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';

const INTRO = "Vuoi risposte chiare dai tuoi soldi, e il report spese export CSV di Tracky te le dà in fretta. Hai tre schede — flusso di cassa, spese, entrate — che mostrano da dove arriva il denaro, dove va e come cambiano le abitudini nel tempo. Vedi ogni valuta separata, senza totali misti fuorvianti.\n\nConfronti i gruppi in modalità Composizione oppure segui mesi, trimestri e anni in modalità Andamento. Passi dalla ciambella alle barre orizzontali per spese ed entrate, oppure usi barre affiancate e impilate per l'andamento. Tocchi un segmento, una riga della legenda o una barra per aprire i movimenti più recenti, con data, descrizione, categoria e importo con segno.\n\nFiltri per date relative o personalizzate, raggruppamento, conti, categorie, tag e limiti di importo. Salvi fino a 20 viste che conservano solo la configurazione, così Questo mese segue sempre il mese corrente. Esplori i dieci gruppi principali mentre quelli minori finiscono in Altro, e le transazioni nascoste restano fuori da ogni totale.\n\nEsplori ogni scheda nella demo — il badge dice Funziona nella demo — con filtri, viste ed export pronti da provare. Tieni trasferimenti e movimenti interni fuori da spese ed entrate, così i totali restano puliti. Chiudi con numeri puliti, pronti da condividere con il commercialista.";

const BLOCKS = [
  { h: "Flusso di cassa, spese ed entrate in un unico posto",
    p: "Apri i Report quando vuoi il quadro completo senza tirare a indovinare. Scegli Flusso di cassa per collegare le fonti di entrata ai gruppi di spesa e alle categorie in un diagramma di flusso. Scegli Spese per i soli addebiti di spesa, con trasferimenti e movimenti interni esclusi. Scegli Entrate per i soli accrediti di entrata, con la stessa esclusione pulita. Leggi Entrate, Spese, Saldo e Tasso di risparmio per ogni valuta, dove il tasso è il saldo diviso per le entrate e vale zero senza entrate. Passi dal confronto in Composizione all'Andamento per mesi, trimestri o anni quando serve un'altra prospettiva.", },
  { h: "Il tuo report spese export CSV: filtra, esplora, salva",
    p: "Parti da scheda, modalità e tipo di grafico adatti alla tua domanda. Imposti un intervallo relativo come questo mese oppure date iniziali e finali personalizzate, poi raggruppi per categoria, gruppo di categorie, controparte o conto. Raffini con conti, categorie, tag e importi minimi e massimi opzionali, e i tag attivi compaiono come chip rimovibili. In una composizione di spese o entrate selezioni un segmento con nome, una riga della legenda o una barra per aprire i movimenti più recenti, caricandone altri quando il gruppo è lungo. Salvi l'intera configurazione come vista con nome, la riapri dopo e esporti serie temporali e totali quando serve un file.", },
  { h: "Limiti onesti: cosa non fanno i report",
    p: "Lavori con il badge Funziona nella demo, quindi esplori subito ogni scheda dei report. Vedi ogni valuta nella sua sezione, e Tracky non converte mai gli importi né li unisce in un unico totale. Ricevi nel file CSV serie temporali aggregate e totali di composizione, non le singole righe di dettaglio. Vedi nel grafico i dieci gruppi principali mentre quelli minori finiscono in Altro, quindi apri un gruppo con nome per il dettaglio completo. Salvi fino a 20 viste che conservano solo le impostazioni, e le transazioni marcate Nascosta dai report non compaiono mai nei totali.", },
  { h: "A chi servono i report",
    p: "Sei la persona giusta per i report se gestisci una famiglia, un'attività freelance o un piccolo progetto su uno o più conti. Ti piace raggruppare per categoria, controparte o conto e controllare l'Andamento prima di cambiare un'abitudine. Salvi le viste per domande ricorrenti come le spese di questo mese o le entrate annuali, poi le riapri con un clic. Filtri per tag e importi quando vuoi una risposta mirata senza toccare i tuoi dati. Esporti i totali aggregati quando al commercialista o a un foglio di calcolo servono numeri puliti per valuta.", },
];

const PAGE_FAQ = [
  { q: "Cosa include il report spese export CSV?",
    a: "Scarichi serie temporali e totali di composizione correnti come file report-<tab>-<from>-<to>.csv. Ricevi valori aggregati raggruppati per valuta, non le singole transazioni viste nel dettaglio. Apri il file facilmente perché Tracky usa la virgola con il punto decimale e il punto e virgola con la virgola decimale.", },
  { q: "Come funzionano le valute nei report?",
    a: "Vedi Entrate, Spese, Saldo e Tasso di risparmio dentro ogni sezione di valuta. Leggi grafici, elenchi di dettaglio e righe esportate raggruppati per valuta. Usi i filtri dei conti quando vuoi concentrarti su una valuta o un istituto. Non ricevi mai importi convertiti o un totale unito.", },
  { q: "Che differenza c'è tra Composizione e Andamento?",
    a: "Usi la Composizione per confrontare i gruppi nell'intervallo scelto con ciambella o barre orizzontali. Usi l'Andamento per dividere gli stessi dati in periodi mensili, trimestrali o annuali con barre affiancate o impilate. Scegli Flusso di cassa per la vista di flusso, Spese per gli addebiti e Entrate per gli accrediti.", },
  { q: "Come funzionano le viste salvate?",
    a: "Configuri scheda, modalità, grafico, date, raggruppamento, conti, categorie, tag e limiti di importo. Apri Report salvati, scegli Salva il report corrente e inserisci un nome riconoscibile. Ripristini l'intera vista dopo, la rinomini o la elimini definitivamente. Salvi fino a 20 viste, e intervalli come Questo mese seguono il mese corrente.", },
  { q: "Perché alcune transazioni non compaiono nei report?",
    a: "Non vedi mai trasferimenti e movimenti interni in Spese o Entrate perché contano solo spese e entrate classificate. Non vedi mai le transazioni marcate Nascosta dai report in nessun totale o riga di dettaglio. Con un filtro tag vedi le transazioni che hanno almeno un tag selezionato. Apri un gruppo con nome per il dettaglio perché quelli minori finiscono in Altro.", },
];

export const Route = createFileRoute('/it/funzioni/report')({
  loader: loadMarketingAuth,
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
        faqJsonLd(PAGE_FAQ.map((entry) => ({ question: entry.q, answer: entry.a }))),
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
          <MagnetCta href={user ? '/app/reports' : signUpUrl} onClick={() =>
                user
                  ? undefined
                  : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
              }
            >
              {user ? 'Apri i report →' : 'Prova la demo →'}
            </MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>{INTRO}</p>
        </Reveal>
      </section>
      <MarqueeBand items={['FLUSSO SANKEY', 'PER CATEGORIA', 'TREND VS DETTAGLIO', 'VISTE SALVATE', 'EXPORT CSV']} />
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
            <h2 className="mk-h2">Il commercialista ringrazia.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · report inclusi · senza carta</p>
            <MagnetCta href={user ? '/app/reports' : signUpUrl} onClick={() =>
                user
                  ? undefined
                  : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
              }
            >
              {user ? 'Apri i report →' : 'Inizia gratis →'}
            </MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
