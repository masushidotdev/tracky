import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { FaqItem, MarketingAuth } from '@/components/marketing/atelier';
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
import { B2AppCta, B2GuideSteps, B2RelatedSection } from '@/components/marketing/atelier/b2-sections';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const guideSteps: Array<B2StepItem> = [
  {
    title: 'Ancora la previsione ai saldi liquidi reali',
    body: 'Parti dall’ultimo saldo osservato di ogni conto liquido nella tua valuta principale, tenendo il debito delle carte di credito fuori dalla liquidità spendibile. Finanzia prima il Piano zero-based così sai già quale parte della cassa è impegnata prima di guardare avanti.',
    note: 'In Tracky: il Flusso di cassa parte dagli ultimi saldi liquidi osservati e tiene i conti CARD separati dalla liquidità aggregata.',
  },
  {
    title: 'Inserisci bollette, stipendi e scadenze con la loro data',
    body: 'Elenca ogni bolletta nota, stipendio atteso, trasferimento pianificato, rata, estratto carta e uscita una tantum programmata con data, importo e conto di origine reali. Lasciare una voce senza conto impedisce di sapere quale saldo assorbirà l’addebito.',
    note: 'In Tracky: assegna un conto di origine a ogni spesa e un conto di regolamento a ogni estratto carta per non lasciare voci nel gruppo non assegnato.',
  },
  {
    title: 'Conferma le sottoscrizioni attive ed escludi quelle chiuse',
    body: 'Porta nel calendario gli addebiti ricorrenti solo dopo aver verificato esercente, importo, intervallo e prossima scadenza. Mantieni attivi solo i rinnovi che paghi davvero e metti in pausa o termina il resto così nessun addebito fantasma distorce le cifre.',
    note: 'In Tracky: il rilevamento automatico delle sottoscrizioni resta sempre un suggerimento da confermare prima di entrare nel Flusso di cassa.',
  },
  {
    title: 'Leggi il saldo progressivo per individuare la prima data negativa',
    body: 'Scorri la cronologia riga dopo riga applicando saldo prima + entrata − uscita su ogni data. Guarda bene l’ordine: un saldo di fine mese positivo non evita uno scoperto se affitto ed estratto carta escono tre giorni prima dello stipendio. Evidenzia il primo giorno in cui la serie scende sotto zero.',
    note: 'In Tracky: il Flusso di cassa mostra sia le serie per singolo conto sia la linea aggregata nella valuta principale, segnalando la prima data negativa.',
  },
  {
    title: 'Intervieni in anticipo e riconcilia i pagamenti quando arrivano',
    body: 'Quando compare un buco di cassa, agisci finché hai margine: riduci un’uscita discrezionale, aggiungi un’entrata reale o sposta una data solo se è cambiata la scadenza effettiva. Quando il movimento passa in banca, riconcilialo con la voce pianificata così non pesa due volte.',
    note: 'In Tracky: collega la transazione reale con Collega transazione o segna la voce pagata — resta tracciabile nello storico senza doppi conteggi.',
  },
];

export const guideCashFlowItFaq: Array<FaqItem> = [
  {
    q: 'Cosa mi serve prima di iniziare a prevedere il flusso di cassa personale?',
    a: 'Ti servono gli ultimi saldi liquidi osservati in una valuta principale, l’elenco datato di bollette, stipendi, rate ed estratti carta con il relativo conto di origine, e le sottoscrizioni attive confermate. Ogni proiezione di flusso di cassa è una stima aritmetica basata sulle voci registrate, mai una garanzia.',
  },
  {
    q: 'Perché è importante risolvere una riga non assegnata nel calendario?',
    a: 'Se un’uscita o una sottoscrizione non ha un conto di origine — oppure un estratto carta non ha un conto di regolamento — l’impegno resta visibile, ma nessuna serie di conto può ancora sottrarlo. Assegnare il conto liquido corrispondente nella stessa valuta rende completa la proiezione.',
  },
  {
    q: 'Posso fidarmi del rilevamento automatico degli abbonamenti senza controllarlo?',
    a: 'No. Il rilevamento confronta nomi esercente, valuta, importi simili e distanza fra le date, quindi spese regolari o cambi di tariffa possono trarre in inganno. Verifica sempre esercente, importo, cadenza e prossima scadenza prima di marcare una sottoscrizione come Attiva.',
  },
  {
    q: 'Le money box virtuali o i trasferimenti pianificati spostano soldi in banca?',
    a: 'No. Money box virtuali e trasferimenti pianificati registrano obiettivi e intenzioni dentro lo strumento di pianificazione senza muovere denaro reale in banca. Collega una money box a un bucket per mostrare Già accantonato ed esegui a parte ogni movimento effettivo presso la banca.',
  },
];

export const Route = createFileRoute('/it/guide/previsione-flusso-di-cassa')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Come prevedere il flusso di cassa personale in 5 passi · Tracky',
      description:
        'Guida pratica in cinque passi alla previsione del flusso di cassa: saldi reali, impegni datati, sottoscrizioni attive, prima data negativa e riconciliazione.',
      locale: 'it',
      path: '/it/guide/previsione-flusso-di-cassa',
      ogImage: ogImageFor('guide-cashflow'),
      jsonLd: [
        softwareAppJsonLd({
          url: 'https://www.trytracky.app/it/guide/previsione-flusso-di-cassa',
          inLanguage: ['it', 'en'],
        }),
        faqJsonLd(guideCashFlowItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Come prevedere il flusso di cassa in Tracky',
          step: guideSteps.map((step) => ({ '@type': 'HowToStep', name: step.title, text: step.body })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Guida al flusso di cassa', path: '/it/guide/previsione-flusso-di-cassa' },
        ]),
      ],
    }),
  component: GuideIt,
});

function GuideIt() {
  const auth = Route.useLoaderData();
  return <GuideCashFlowItView auth={auth} />;
}

export function GuideCashFlowItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/guide/previsione-flusso-di-cassa">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[
                { label: 'Home', href: '/it/' },
                { label: 'Guida al flusso di cassa' },
              ]}
            />

            <ChipRow>
              <Chip tone="cobalt">Guida pratica</Chip>
              <Chip>5 passi concreti</Chip>
              <Chip tone="sage">Stime, non garanzie</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Come prevedere il <span className="mka-accent-ink">flusso di cassa personale</span> prima che le scadenze si scontrino.
            </h1>

            <p className="mka-hero-dek">
              Un budget mensile ti dice se le entrate totali coprono le spese totali. Una previsione del flusso di cassa
              risponde alla domanda sui tempi: ci sarà abbastanza liquidità sul conto giusto nel giorno esatto in cui
              passano affitto, rate ed estratto carta?
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-secondary" href="#steps">
                Vai ai 5 passi ↓
              </a>
              <B2AppCta
                auth={auth}
                locale="it"
                loggedInHref="/app/planning"
                loggedInLabel="Apri il Flusso di cassa →"
                loggedOutLabel="Costruisci il calendario nella demo →"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. EDUCATIONAL FOUNDATION */}
      <Section id="why-timing-matters" tone="parchment">
        <SectionHead
          kicker="Perché contano le date"
          title="Un mese può chiudere in positivo sulla carta e andare in rosso il giorno 2."
          subtitle="Prevedere il flusso di cassa è aritmetica semplice in ordine cronologico — senza indovinare il futuro."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>L’ordine delle date cambia tutto</h3>
            <p>
              Immagina un conto corrente con <strong>€1.800</strong>, affitto da <strong>€900</strong> il giorno 2,
              abbonamenti per <strong>€150</strong> a metà mese e stipendio da <strong>€2.200</strong> il 27. Con un
              ciclo che parte il 25 lo stipendio entra prima; con un ciclo dal 1° le uscite portano il saldo a €750
              prima dell’accredito.
            </p>
            <p>
              Mettere gli impegni in sequenza cronologica reale mostra i cali temporanei che le medie mensili nascondono
              del tutto.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Errori comuni da evitare</h3>
            <ul className="mka-b2-prose-list">
              <li>
                <strong>Contare stipendi futuri come spendibili oggi:</strong> tratta le entrate attese come voci
                future, mai come liquidità già spendibile.
              </li>
              <li>
                <strong>Trattare il plafond della carta come contante:</strong> la spesa con carta crea debito; la vera
                uscita di cassa avviene sul conto corrente alla data dell’estratto.
              </li>
              <li>
                <strong>Dimenticare di riconciliare le bollette pagate:</strong> lasciare aperta una voce già addebitata
                la sottrae due volte generando falsi allarmi.
              </li>
            </ul>
          </article>
        </div>
      </Section>

      {/* 3. FIVE STEPS */}
      <Section id="steps">
        <SectionHead
          kicker="Procedura passo passo"
          title="Costruisci un calendario del flusso di cassa affidabile in cinque passi."
          subtitle="Ogni proiezione è una stima di pianificazione costruita sulle voci note: aggiornala man mano che cambiano saldi e impegni."
        />

        <B2GuideSteps steps={guideSteps} stepPrefix="Passo" />
      </Section>

      {/* 4. HOW TRACKY HELPS */}
      <Section id="how-tracky-helps" tone="parchment">
        <SectionHead
          kicker="Come ti aiuta Tracky"
          title="Calendario Flusso di cassa e Disponibile dopo le spese inclusi nella demo gratis."
          subtitle="Applica tutti e cinque i passi a €0 su trytracky.app con conti manuali e import CSV nel browser, oppure sul tuo server Docker self-hosted con licenza MIT."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Cosa automatizza Tracky con chiarezza</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Tutti gli impegni datati in un’unica cronologia</strong>
                  <span>
                    Riunisce entrate e uscite pianificate, sottoscrizioni attive, rate, estratti carta, trasferimenti
                    pianificati e movimenti programmati una tantum dentro la finestra di ciclo scelta.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Prima data negativa e Disponibile dopo le spese</strong>
                  <span>
                    Evidenzia la prima data negativa proiettata per conto e sulla liquidità aggregata, mentre il{' '}
                    <strong>Disponibile dopo le spese</strong> in Dashboard scala impegni residui e accantonamenti senza
                    gonfiare il dato di oggi con stipendi futuri.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Promemoria in-app e riconciliazione pulita</strong>
                  <span>
                    Le spese pianificate generano promemoria in-app configurabili (tre giorni di anticipo di default,
                    fino a quattro soglie), e collegare i pagamenti arrivati evita doppi conteggi.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Confini trasparenti</h3>
            <ul className="mka-check-list">
              <li>Funziona nella demo ospitata senza richiedere credenziali bancarie</li>
              <li>I saldi carta non alterano la liquidità; gli estratti gravano sul conto di regolamento</li>
              <li>Le valute diverse restano visibili senza conversioni silenziose</li>
              <li className="is-muted">Creare voci pianificate registra solo l’intenzione: i pagamenti reali restano in banca</li>
              <li className="is-muted">Gli scenari Forecast pluriennali sono riservati a Pro (non in vendita oggi)</li>
            </ul>

            <div className="mka-trust-actions" style={{ marginTop: 'auto' }}>
              <a className="mka-text-link" href="/it/funzioni/flusso-di-cassa">
                Leggi tutti i dettagli del Flusso di cassa →
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
        title="Domande frequenti sulla previsione del flusso di cassa."
        subtitle="Risposte pratiche su conti, sottoscrizioni e money box virtuali."
        moreLink={{ href: '/it/domande-frequenti', label: 'Leggi tutte le FAQ →' }}
        items={guideCashFlowItFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Continua a leggere"
        title="Guide e funzioni collegate."
        items={[
          {
            kicker: 'Funzione · Demo + Self-host',
            title: 'Flusso di cassa in Tracky',
            description: 'Approfondisci serie per conto, liquidità aggregata, righe non assegnate e controlli di ciclo.',
            href: '/it/funzioni/flusso-di-cassa',
            linkLabel: 'Scopri il Flusso di cassa →',
          },
          {
            kicker: 'Guida pratica',
            title: 'Come creare un budget zero-based',
            description: 'Finanzia prima i bucket dalla liquidità osservata così il Flusso di cassa parte da numeri puliti.',
            href: '/it/guide/budget-zero-based',
            linkLabel: 'Leggi la guida Zero-based →',
          },
          {
            kicker: 'Guida pratica',
            title: 'Trova e cancella abbonamenti inutili',
            description: 'Verifica quali addebiti ricorrenti meritano di entrare nella previsione ed elimina i doppioni prima del rinnovo.',
            href: '/it/guide/cancella-abbonamenti-inutili',
            linkLabel: 'Leggi la guida Sottoscrizioni →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Individua in anticipo il calo di cassa e intervieni con calma."
        meta="Demo ospitata a €0 · Calendario Flusso di cassa e promemoria in-app inclusi · Stime, non garanzie"
        primaryCta={
          <B2AppCta
            auth={auth}
            locale="it"
            loggedInHref="/app/planning"
            loggedInLabel="Apri il Flusso di cassa →"
            loggedOutLabel="Prova gratis la demo →"
            variant="marigold"
          />
        }
        secondaryCta={
          <a className="mka-btn-outline-light" href="/it/funzioni/flusso-di-cassa">
            Dettagli del Flusso di cassa →
          </a>
        }
      />
    </AtelierSite>
  );
}
