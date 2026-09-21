import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';

const faq = [
  {
    q: 'In un confronto budget app vs Excel fogli di calcolo, cosa mantengo davvero?',
    a: 'Mantieni l\'abitudine al CSV e la stessa disciplina. Importi gli export bancari nei conti manuali CACC o nelle carte con mappatura e anteprima, lavori su saldi osservati e datati ed esporti i totali dei report quando vuoi. Ogni valuta resta separata e la demo gratis ti fa provare il flusso.',
  },
  {
    q: 'Come sposto lo storico senza creare duplicati?',
    a: 'Carichi un CSV con riga di intestazione, abbini le colonne e controlli il badge Valida, Duplicata o Errore su ogni riga. Tracky riconosce i duplicati in base a conto, data, direzione, importo, valuta e descrizione normalizzata, così puoi reimportare lo stesso file dopo un\'interruzione e vengono aggiunte solo le nuove righe valide.',
  },
  {
    q: 'Che fine fanno i pagamenti ricorrenti?',
    a: 'Tracky suggerisce possibili abbonamenti da esercente, importo e distanza tra date, e confermi tu ogni rinnovo prima che conti. Le voci attive entrano nel Flusso di cassa come impegni noti insieme a spese pianificate ed estratti conto. La proiezione resta una stima da dati noti, mai una garanzia, così vedi per tempo la prossima scadenza.',
  },
  {
    q: 'Perdo il sistema delle buste?',
    a: 'No, lo migliori. Crei salvadanai virtuali per ogni obiettivo, ne colleghi uno a un bucket del Piano e l\'importo risparmiato appare come Già accantonato, così gli obiettivi chiedono solo la parte mancante. Registrare un versamento non sposta denaro in banca, e il Disponibile dopo le spese sottrae solo ciò che è ancora dovuto nel ciclo.',
  },
];

export const Route = createFileRoute('/it/vs-fogli-di-calcolo')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Tracky vs fogli di calcolo: chiudi il mese · Tracky',
      description:
        'I fogli copiano saldi a mano; Tracky ancora ai saldi osservati, assegna ogni euro e prevede la cassa. Demo gratis.',
      locale: 'it',
      path: '/it/vs-fogli-di-calcolo',
      ogImage: ogImageFor('vs-spreadsheets'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/vs-fogli-di-calcolo', inLanguage: ['it', 'en'] }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Vs fogli di calcolo', path: '/it/vs-fogli-di-calcolo' },
        ]),
      ],
    }),
  component: VsIt,
});

function VsIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/vs-fogli-di-calcolo">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Pensiona
            <br />
            <span className="stroke">il</span> <span className="hl">foglio.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            I fogli <b>copiano saldi a mano</b> e invecchiano ogni ora. Tracky ancora il piano a <b>saldi osservati e
            datati</b>, assegna ogni euro e prevede il 27. Stessa disciplina, nessuna idraulica.
          </p>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>Gestisci già tutto in Excel con grande disciplina. Ma in un confronto onesto budget app vs Excel fogli di calcolo, il collo di bottiglia è il foglio stesso: digiti i saldi a mano, ripari le formule in silenzio e la storia vive in nomefile_v7_finale. Meriti la stessa disciplina senza il lavoro manuale. Il foglio ti ruba tempo senza darti controllo.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Tracky lega il piano a saldi osservati e datati, non a valori incollati. Assegni ogni euro nei bucket del Piano con Assegnato, Attività e Disponibile, e vedi il Disponibile dopo le spese prima di spendere. La proiezione di cassa elenca ogni impegno noto per data e segnala la prima data negativa, come stime da dati noti, non come garanzie.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Tieni il CSV in entrambe le direzioni: importi un export bancario in un conto manuale CACC o in una carta con mappatura, anteprima e protezione dai duplicati, poi esporti i totali dei report quando vuoi. I saldi restano datati e interrogabili, e la demo gratis ti fa provare il flusso prima di impegnarti. Niente nomi di file versionati, niente modifiche silenziose. Il piano rispecchia la realtà. Tieni il CSV. Molla la fatica.</p>
        </Reveal>
      </section>
      <MarqueeBand items={['NIENTE COPIA-INCOLLA', 'SALDI DATATI', 'OGNI EURO UN LAVORO', 'CASSA INCLUSA', 'CSV IN E OUT']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>📉 IL FOGLIO</h3>
              <ul>
                <li>Saldi digitati a mano</li>
                <li>Formule che si rompono in silenzio</li>
                <li>Uno scrive, gli altri guardano</li>
                <li>Storia in nomefile_v7_finale</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>📈 TRACKY</h3>
              <ul>
                <li>Saldi osservati, datati</li>
                <li>Invarianti garantiti dal codice</li>
                <li>Stessi numeri per tutti</li>
                <li>Storia interrogabile, esportabile</li>
              </ul>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24 }}>
            <img src="/shots/import-summary.png" alt="Risultato import Tracky: l'anti-foglio — 33 movimenti veri in minuti" width={1440} height={800} loading="lazy" />
            <figcaption>L'anti-foglio: 33 movimenti veri, zero formule digitate.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Dove il foglio si rompe</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>Ogni mese riparte lo stesso rituale. Incolli i saldi, rincorri un riferimento rotto e chiedi chi ha toccato la colonna D. Uno scrive mentre gli altri guardano, e la verità invecchia di ora in ora.

I pagamenti ricorrenti si nascondono nelle righe che hai dimenticato di copiare. La spesa con carta sembra contante finché arriva l'estratto conto, e lo storico sparso tra schede non ti dice mai quanto puoi spendere oggi. Riconcili il passato invece di guidare il mese.

Le valute si mescolano in un totale solo e ti ingannano. Vuoi un piano di cui fidarti al primo sguardo.</p>
        </Reveal>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Budget app vs Excel fogli di calcolo: cosa cambia dal primo giorno</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>I saldi diventano osservati e datati, non digitati. Assegni il denaro che hai già nei bucket, confronti l'Assegnato con l'Attività reale e leggi il Disponibile prima di ogni decisione. Gli stessi numeri valgono per tutti, con uno storico che puoi interrogare ed esportare.

La proiezione di cassa trasforma gli impegni noti in un calendario datato e mostra il primo giorno negativo, come stime, non come garanzie. I suggerimenti di abbonamento segnalano possibili rinnovi, ma verifichi tu esercente, importo e cadenza. Ogni valuta resta separata, il debito della carta resta debito e i salvadanai virtuali accantonano solo la cassa che hai. Guidi con i fatti, non con le formule.</p>
        </Reveal>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Dalle righe incollate ai saldi datati</h2>
          <p className="mk-sub" style={{ maxWidth: 700, marginTop: 12 }}>Porta un export bancario e parti in piccolo. Crei un conto manuale CACC o una carta nella valuta del file, carichi un CSV con riga di intestazione e abbini data, descrizione, controparte e importi. Il file viene analizzato nel browser, e solo le righe valide che confermi vengono inviate.

Ogni riga mostra il badge Valida, Duplicata o Errore, applichi una categoria o lasci agire le regole da descrizione, e reimporti in sicurezza perché i duplicati vengono saltati senza toccare il saldo. Poi esporti i totali dei report in CSV quando serve. La demo gratis segue lo stesso percorso.</p>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Domande e risposte.</h2>
        </Reveal>
        {faq.map((entry) => (
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
            <h2 className="mk-h2">Tieni il CSV. Molla la fatica.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Import CSV · export CSV · demo gratis</p>
            <MagnetCta href={user ? '/app' : signUpUrl} onClick={() =>
                user
                  ? undefined
                  : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
              }
            >
              {user ? 'Apri la demo →' : 'Inizia gratis →'}
            </MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
