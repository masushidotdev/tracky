import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const seoIntro: Array<string> = [
  "Cerchi una previsione liquidita personale che ti avvisa prima che lo faccia la banca. Tracky trasforma i tuoi impegni noti — entrate e uscite pianificate, sottoscrizioni attive, rate, estratti carta e movimenti una tantum programmati — in un calendario datato della liquidità. Parti dagli ultimi saldi liquidi e vedi il saldo dopo ogni data del tuo ciclo.",
  "Gli stipendi entrano alle loro date e le bollette escono alle loro, quindi l'ordine conta e la finestra del ciclo mostra le stesse voci nella sequenza vera. Gli estratti carta compaiono sul conto di regolamento mentre i saldi carta restano fuori dalla liquidità, perché il debito carta è debito e un limite non è mai contante spendibile. I fabbisogni delle money box restano separati dai saldi, perché le money box sono virtuali e registrare un accantonamento non sposta denaro in banca.",
  "Leggi una riga per data, individui la prima data negativa e agisci mentre hai ancora margine invece di scoprirlo a pagamento fallito. La demo ricalcola quella data dai tuoi dati attuali, e ogni proiezione resta una stima e non una promessa sul comportamento futuro. Tieni ordine degli stipendi, tempi degli estratti e buchi di copertura in un'unica vista calma, e affronti il resto del mese sapendo cosa arriva e quando.",
];

const seoBlocks: Array<{ h: string; paras: Array<string> }> = [
  { h: "Cosa fa la previsione liquidita personale", paras: [
    "Vedi i tuoi impegni datati sopra gli ultimi saldi liquidi, con il saldo dopo ogni data, così leggi la liquidità giorno per giorno invece di stimarla da un unico totale. Leggi entrate e uscite pianificate, sottoscrizioni attive, rate, estratti carta, trasferimenti pianificati e movimenti una tantum programmati come righe nel vero ordine cronologico. Tieni i saldi carta fuori dalla linea di cassa perché il debito carta è debito, e leggi i fabbisogni delle money box separati dai saldi perché le money box sono virtuali. Individui la prima data in cui la linea diventerebbe negativa, aggiornata dai tuoi dati attuali, e la tratti come stima di pianificazione e non come promessa.",
  ] },
  { h: "Come funziona, passo passo", paras: [
    "Registri ogni impegno con importo, data e conto di origine, e tieni aggiornate le sottoscrizioni attive mentre quelle in pausa o terminate restano fuori dal futuro. Dai a ogni estratto un conto di regolamento e a ogni uscita un conto di origine, così nulla di importante resta nel gruppo non assegnato dove Tracky non può dire quale saldo ridurrà. Scegli una finestra di ciclo e leggi le righe datate, osservando come stipendi, bollette, rate ed estratti si accumulano in sequenza verso la prima data negativa. Quando il denaro si muove davvero, colleghi la transazione o segni la voce come pagata, così la riga riconciliata resta visibile senza mai contare due volte.",
  ] },
  { h: "Limiti onesti: funziona nella demo, stime non promesse", paras: [
    "Hai un aiuto di pianificazione, non certezze: ogni proiezione è una stima costruita dalle voci che hai registrato, e cambia quando cambiano i tuoi dati. Funziona nella demo; stime, non promesse. Tratti il rilevamento delle sottoscrizioni ricorrenti come suggerimento e non come certezza, quindi verifichi esercente, importo e cadenza prima di contare su un rinnovo, e vedi le righe in altra valuta restare visibili senza entrare nella linea proiettata. Quando crei una voce pianificata, un trasferimento, una money box o un movimento programmato registri solo un'intenzione, quindi esegui comunque l'operazione vera presso la banca o il finanziatore.",
  ] },
  { h: "A chi è utile", paras: [
    "Hai lo stipendio in date fisse mentre affitto, bollette, rate ed estratti carta escono alle loro, e vuoi la data di collisione prima che arrivi. Usi una valuta principale nei conti liquidi e preferisci assegnare denaro reale già osservato piuttosto che spendere da un limite carta che non è mai stato contante. Ti piace riconciliare ciò che è accaduto davvero così le date future restano pulite, e vuoi una linea giornaliera calma che ti dice cosa resta dopo gli impegni senza fingere che il futuro sia già deciso.",
  ] },
];

const seoFaq: Array<{ q: string; a: string }> = [
  { q: "In cosa questa vista di previsione liquidita personale è diversa da una predizione?", a: "Vedi l'aritmetica dei tuoi impegni registrati contro gli ultimi saldi liquidi, nel vero ordine cronologico, con il saldo dopo ogni riga. Non ottieni alcun modello del tuo comportamento e nessuna promessa di quanto spenderai. Quando le voci cambiano, la tua linea e la tua prima data negativa cambiano con loro." },
  { q: "Da dove parte la proiezione?", a: "Parti dagli ultimi saldi liquidi noti e applichi le righe datate dentro la finestra di ciclo scelta. Tieni i saldi carta fuori dalla linea di cassa, e leggi i fabbisogni delle money box separati senza muovere alcun saldo. Con il ciclo cambi la finestra che vedi, mai le vere date delle voci." },
  { q: "Cosa significa il gruppo non assegnato?", a: "Vedi gli impegni che Tracky non può collocare, come un'uscita o una sottoscrizione senza conto di origine oppure un estratto senza conto di regolamento. La voce resta un impegno noto, ma nessun saldo può ancora assorbirla. Assegna il conto giusto e la tua proiezione diventa completa." },
  { q: "Come si comportano sottoscrizioni e money box?", a: "Porti le sottoscrizioni attive nei rinnovi futuri, mentre quelle in pausa o terminate restano fuori, e tratti il rilevamento automatico come suggerimento da verificare e non come certezza. Ricordi che le money box sono virtuali, quindi i loro fabbisogni non riducono mai da soli un saldo bancario e registrare un accantonamento non muove denaro reale. Collega la transazione vera quando arriva così nulla conta due volte." },
  { q: "Posso fidarmi della prima data negativa?", a: "La tratti come avviso tempestivo e come stima, non come promessa, perché riflette solo ciò che hai registrato e si ricalcola al variare dei dati. Apri il giorno segnalato, controlla righe precedenti, saldi, valute e conti, poi aggiungi un'entrata reale o riduci un'uscita quando la linea scende. Spostare una data aiuta solo quando la vera scadenza è davvero cambiata." },
];

export const Route = createFileRoute('/it/funzioni/flusso-di-cassa')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Flusso di cassa: il 27 lo sai oggi · Tracky',
      description:
        'Tracky proietta stipendi, bollette e rate sui saldi reali e ricalcola ogni giorno la prima data negativa. Una stima, non una promessa.',
      locale: 'it',
      path: '/it/funzioni/flusso-di-cassa',
      ogImage: ogImageFor('feature-cashflow'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/flusso-di-cassa', inLanguage: ['it', 'en'] }),
        faqJsonLd(seoFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Flusso di cassa', path: '/it/funzioni/flusso-di-cassa' },
        ]),
      ],
    }),
  component: CashflowIt,
});

function CashflowIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/funzioni/flusso-di-cassa">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Funziona nella demo</span>
            <span className="mk-badge">Gratis</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Il 27,
            <br />
            <span className="stroke">noto</span> <span className="hl">oggi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Il flusso di cassa proietta gli <b>impegni noti</b> — spese pianificate, abbonamenti, rate, estratti conto —
            sugli ultimi saldi. Prima data negativa, ricalcolata ogni giorno. Una <b>stima</b> di pianificazione, non una
            previsione statistica del comportamento.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app/planning' : signUpUrl}>{user ? 'Apri il flusso →' : 'Prova la demo →'}</MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoIntro.map((para, i) => (
          <Reveal key={i}>
            <p className="mk-sub" style={{ maxWidth: 720 }}>{para}</p>
          </Reveal>
        ))}
      </section>
      <MarqueeBand items={['PRIMA DATA NEGATIVA', 'STIPENDI DENTRO', 'BOLLETTE FUORI', 'RICALCOLATO OGNI GIORNO', 'NESSUNA SORPRESA']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            Calendario, <span className="u">non sfera.</span>
          </h2>
        </Reveal>
        <Reveal>
          <p className="mk-sub">
            I money box finanziano virtualmente le spese future; i rimborsi credito arrivano dai finanziamenti tracciati.
            Quando una spesa pianificata non ha copertura, la proiezione lo mostra — prima della banca.
          </p>
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
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Vedi il buco prima che veda te.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · cassa inclusa · senza carta</p>
            <MagnetCta href={user ? '/app/planning' : signUpUrl}>{user ? 'Apri il flusso →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
