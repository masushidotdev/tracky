import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { FaqItem } from '@/components/marketing/atelier';
import type { B2StepItem } from '@/components/marketing/atelier/b2-sections';
import {
  AtelierSite,
  Breadcrumb,
  Chip,
  ChipRow,
  FaqSection,
  FinalCta,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import {
  B2AppCta,
  B2GuideSteps,
  B2RelatedSection,
  B2ScreenshotFigure,
} from '@/components/marketing/atelier/b2-sections';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const guideSteps: Array<B2StepItem> = [
  {
    title: 'Parti dal saldo liquido reale di oggi',
    body: 'Individua il conto corrente o di liquidità che contiene il denaro che possiedi davvero oggi, in una sola valuta. Il budget zero-based assegna esclusivamente liquidità osservata — mai lo stipendio del mese prossimo né il plafond di una carta di credito — così ogni scelta poggia su soldi già disponibili.',
    note: 'In Tracky: aggiungi un conto manuale in EUR (o nella tua valuta principale) con il saldo reale odierno, senza collegare alcuna banca.',
  },
  {
    title: 'Importa i movimenti recenti in modo pulito',
    body: 'Esporta un CSV dalla banca per quel conto e verifica date, descrizioni e importi prima di salvare. Controllare le righe in anticipo evita duplicati ed errori di formato nel registro, mantenendo affidabile l’attività iniziale.',
    note: 'In Tracky: l’analisi CSV avviene nel tuo browser con badge Valida, Duplicata o Errore prima di scrivere una sola riga.',
  },
  {
    title: 'Organizza scadenze e obiettivi in bucket chiari',
    body: 'Crea un Piano nella stessa valuta e raccogli bollette fisse, spese quotidiane, spese annuali e risparmi in bucket nominati. Fissa l’inizio del Piano al giorno di oggi così i movimenti passati restano nel saldo iniziale senza generare scoperti artificiali.',
    note: 'In Tracky: se uno storico importato sposta la data utile, Ricomincia da qui sceglie il primo giorno valido preservando gruppi, bucket, target e assegnazioni.',
  },
  {
    title: 'Assegna ogni euro finché Da assegnare arriva a zero',
    body: 'Distribuisci la liquidità disponibile nei bucket — prima le scadenze imminenti, poi spesa, trasporti, fondi annuali e spese discrezionali — finché Da assegnare tocca zero. Quando arrivano nuove entrate, assegna subito anche quelle invece di registrarle come spesa negativa dentro una categoria.',
    note: 'In Tracky: verifica che Movimenti non spiegati resti a zero per confermare che ogni accredito e addebito sia attribuito correttamente.',
  },
  {
    title: 'Porta avanti il Disponibile positivo e copri subito i rossi',
    body: 'A fine mese lascia che i saldi Disponibile positivi passino al mese seguente: è così che crescono senza fatica i fondi per assicurazione, tasse o manutenzione. Se un bucket liquido va in rosso, sposta Disponibile da un altro bucket; se manca copertura su una spesa con carta, finanzia il bucket di pagamento carta prima dell’estratto.',
    note: 'In Tracky: il Disponibile positivo si riporta in automatico, mentre lo scoperto liquido non coperto riduce il Da assegnare del mese dopo invece di nascondere debiti.',
  },
];

export const guideZeroBasedItFaq: Array<FaqItem> = [
  {
    q: 'Posso iniziare un budget zero-based anche se lo storico passato è disordinato?',
    a: 'Sì. Un budget zero-based parte dalla liquidità che hai il primo giorno, non dal sistemare gli scontrini dell’anno scorso. I movimenti precedenti restano dentro il saldo iniziale del conto senza creare Attività o scoperti nei bucket. In Tracky puoi anche usare Ricomincia da qui dal selettore del Piano per fissare un nuovo giorno iniziale conservando gruppi, bucket, target e assegnazioni.',
  },
  {
    q: 'Devo arrivare esattamente a zero già il primo giorno?',
    a: 'Zero è l’obiettivo verso cui lavori, non un esame da superare al primo tentativo. Un Da assegnare positivo significa solo che una parte del denaro non ha ancora un compito — e il denaro senza scopo tende a uscire in spese non scelte. Anche un Piano assegnato in parte batte un mese in cui si spende prima di decidere.',
  },
  {
    q: 'Cosa devo fare se spendo più di quanto avevo assegnato a un bucket?',
    a: 'Distingui scoperto liquido e scoperto a credito. Per lo scoperto liquido i soldi sono già usciti dal conto, quindi sposta fondi Disponibile da un altro bucket per coprire l’ammanco; altrimenti si riduce automaticamente il Da assegnare del mese successivo. Per lo scoperto a credito finanzia il bucket di pagamento della carta così la liquidità sarà pronta per l’estratto.',
  },
  {
    q: 'Come faccio a mantenere il budget zero-based efficace mese dopo mese?',
    a: 'Lascia che i saldi Disponibile positivi si riportino al mese dopo per accumulare gradualmente le spese annuali, copri ogni riga liquida in rosso prima di chiudere il mese e fai passare sempre le nuove entrate da Da assegnare. Ripartire ogni mese dalla liquidità osservata mantiene il metodo ancorato alla realtà.',
  },
];

export const Route = createFileRoute('/it/guide/budget-zero-based')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Come creare un budget zero-based in 5 passi · Tracky',
      description:
        'Scopri come funziona il budget zero-based in cinque passi pratici: liquidità reale, import CSV pulito, bucket, assegnazione a zero e riporto mensile.',
      locale: 'it',
      path: '/it/guide/budget-zero-based',
      ogImage: ogImageFor('guide-budget'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/guide/budget-zero-based', inLanguage: ['it', 'en'] }),
        faqJsonLd(guideZeroBasedItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Come creare un budget zero-based in Tracky',
          step: guideSteps.map((step) => ({ '@type': 'HowToStep', name: step.title, text: step.body })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Guida al budget zero-based', path: '/it/guide/budget-zero-based' },
        ]),
      ],
    }),
  component: GuideIt,
});

function GuideIt() {
  const auth = Route.useLoaderData();
  return <GuideZeroBasedItView auth={auth} />;
}

export function GuideZeroBasedItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/guide/budget-zero-based">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[
                { label: 'Home', href: '/it/' },
                { label: 'Guida al budget zero-based' },
              ]}
            />

            <ChipRow>
              <Chip tone="cobalt">Guida pratica</Chip>
              <Chip>5 passi concreti</Chip>
              <Chip tone="sage">Funziona nella demo gratis</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Come costruire un <span className="mka-accent-ink">budget zero-based</span> che regge ogni mese.
            </h1>

            <p className="mka-hero-dek">
              Fare un budget zero-based non significa svuotare il conto corrente. Significa assegnare un compito preciso
              a ogni euro già presente nei tuoi conti — affitto, spesa, scadenze annuali o risparmio — così la liquidità
              libera smette di dissolversi prima del prossimo stipendio.
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-secondary" href="#steps">
                Vai ai 5 passi ↓
              </a>
              <B2AppCta
                auth={auth}
                locale="it"
                loggedInHref="/app/plan"
                loggedInLabel="Apri il Piano →"
                loggedOutLabel="Metti in pratica nella demo gratis →"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. EDUCATIONAL FOUNDATION */}
      <Section id="method" tone="parchment">
        <SectionHead
          kicker="Il metodo"
          title="Perché assegnare la liquidità osservata batte i tetti mensili fissi."
          subtitle="La maggior parte dei budget fallisce per due motivi: pianifica con soldi non ancora incassati e azzera ciecamente le categorie il primo del mese."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Denaro osservato vs stipendi futuri</h3>
            <p>
              I budget a percentuali o i tetti di spesa mensili sembrano ordinati sulla carta, ma raramente rispondono a
              una domanda concreta di martedì pomeriggio: <em>posso spendere questa cifra oggi senza mettere a rischio l’affitto della prossima settimana?</em>
            </p>
            <p>
              Il budget zero-based ribalta la prospettiva. Guardi soltanto la liquidità già presente oggi sui tuoi conti
              e la ripartisci in bucket intenzionali — comprese spese irregolari come assicurazione, imposte o
              manutenzione — finché <strong>Da assegnare</strong> arriva a zero.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Tre abitudini che fanno funzionare il metodo</h3>
            <ul className="mka-b2-prose-list">
              <li>
                <strong>Tieni i plafond carta separati dal contante:</strong> il limite della carta è debito potenziale,
                non liquidità da assegnare. Ogni acquisto coperto accantona la somma per pagare l’estratto.
              </li>
              <li>
                <strong>Lascia riportare i saldi positivi:</strong> ciò che non spendi in un fondo annuale resta in quel
                bucket il mese dopo invece di confondersi in un avanzo generico.
              </li>
              <li>
                <strong>Ribilancia quando cambiano le priorità:</strong> spostare fondi tra bucket non è un errore, ma
                una scelta esplicita basata su numeri reali.
              </li>
            </ul>
          </article>
        </div>
      </Section>

      {/* 3. FIVE STEPS */}
      <Section id="steps">
        <SectionHead
          kicker="Procedura passo passo"
          title="Costruisci il tuo primo budget zero-based in cinque passi."
          subtitle="Puoi seguire questa sequenza su carta, in un registro pulito oppure nella demo gratuita di Tracky senza collegare alcuna banca."
        />

        <B2GuideSteps steps={guideSteps} stepPrefix="Passo" />

        <div style={{ marginTop: '2rem' }}>
          <B2ScreenshotFigure
            src="/shots/import-preview.png"
            alt="Anteprima import CSV di Tracky (interfaccia in inglese) che classifica ogni riga come Valida o Duplicata prima di salvarla in un conto manuale"
            width={1440}
            height={800}
            captionTitle="Passo 2 in pratica: anteprima CSV nel browser"
            captionBody="Prima di salvare una sola transazione nel conto manuale, Tracky verifica ogni riga in locale nel browser segnalando righe Valide, Duplicate o in Errore con la motivazione."
          />
        </div>
      </Section>

      {/* 4. HOW TRACKY HELPS */}
      <Section id="how-tracky-helps" tone="parchment">
        <SectionHead
          kicker="Come ti aiuta Tracky"
          title="Progettato intorno a liquidità osservata e rigore su una sola valuta."
          subtitle="L’intero flusso in cinque passi gira a €0 nella demo ospitata con conti manuali e import CSV nel browser, oppure sul tuo server Docker self-hosted con licenza MIT."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Cosa gestisce Tracky per te</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Assegnato, Attività e Disponibile per ogni bucket</strong>
                  <span>
                    Ogni bucket traccia ciò che destini nel mese, spese contabilizzate e rimborsi e il saldo che passa
                    al mese dopo, mentre le categorie non mappate restano visibili in <strong>Non pianificato</strong>.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Target e anteprime di Assegnazione automatica</strong>
                  <span>
                    Imposta target settimanali, mensili, annuali o personalizzati, confronta il fabbisogno con il
                    reddito atteso tramite <strong>Cost to Be Me</strong> e controlla le proposte di Assegnazione
                    automatica prima di confermare.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Bucket protetti per carte e rate</strong>
                  <span>
                    Gli acquisti coperti con carta accantonano automaticamente la liquidità per l’estratto, e le money
                    box virtuali collegate compaiono come <strong>Già accantonato</strong> senza doppi conteggi.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Confini trasparenti</h3>
            <ul className="mka-check-list">
              <li>Una sola valuta per Piano — nessuna conversione silenziosa tra valute</li>
              <li>Nessuna credenziale bancaria richiesta sulla demo ospitata (CSV analizzato nel browser)</li>
              <li>Backup JSON completo e Report CSV aggregati esportabili quando vuoi</li>
              <li className="is-muted">La sincronizzazione bancaria PSD2 (Enable Banking) è opzionale e solo self-host</li>
              <li className="is-muted">Gratis include un Piano; i Piani multipli sono riservati a Pro (non in vendita)</li>
            </ul>

            <div className="mka-trust-actions" style={{ marginTop: 'auto' }}>
              <a className="mka-text-link" href="/it/funzioni/piano-zero-based">
                Leggi tutti i dettagli del Piano zero-based →
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        tone="cotton"
        kicker="FAQ della guida"
        title="Domande frequenti quando inizi un budget zero-based."
        subtitle="Risposte pratiche per il primo mese e i successivi."
        moreLink={{ href: '/it/domande-frequenti', label: 'Leggi tutte le FAQ →' }}
        items={guideZeroBasedItFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Continua a leggere"
        title="Prossime guide e pagine prodotto."
        items={[
          {
            kicker: 'Funzione · Demo + Self-host',
            title: 'Piano zero-based in Tracky',
            description: 'Approfondisci Da assegnare, bucket di pagamento carta, Assegnazione automatica e money box collegate.',
            href: '/it/funzioni/piano-zero-based',
            linkLabel: 'Scopri il Piano →',
          },
          {
            kicker: 'Guida pratica',
            title: 'Come prevedere il flusso di cassa',
            description: 'Una volta finanziato il Piano, disponi scadenze e stipendi sui saldi reali per anticipare eventuali scoperti.',
            href: '/it/guide/previsione-flusso-di-cassa',
            linkLabel: 'Leggi la guida Flusso di cassa →',
          },
          {
            kicker: 'Guida pratica',
            title: 'Trova e cancella abbonamenti inutili',
            description: 'Usa due o tre mesi di storico CSV per ripulire gli addebiti ricorrenti prima che erodano i tuoi bucket.',
            href: '/it/guide/cancella-abbonamenti-inutili',
            linkLabel: 'Leggi la guida Sottoscrizioni →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Metti subito in pratica i cinque passi."
        meta="Demo ospitata a €0 · Piano zero-based e import CSV nel browser inclusi · Senza carta"
        primaryCta={
          <B2AppCta
            auth={auth}
            locale="it"
            loggedInHref="/app/plan"
            loggedInLabel="Apri il Piano →"
            loggedOutLabel="Prova gratis la demo →"
            variant="marigold"
          />
        }
        secondaryCta={
          <a className="mka-btn-outline-light" href="/it/funzioni/piano-zero-based">
            Dettagli del Piano zero-based →
          </a>
        }
      />
    </AtelierSite>
  );
}
