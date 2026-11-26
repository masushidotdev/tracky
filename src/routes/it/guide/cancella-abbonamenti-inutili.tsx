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
    title: 'Raccogli due o tre mesi di storico bancario reale',
    body: 'Non controllare mai gli abbonamenti a memoria: piccoli rinnovi mensili e servizi trimestrali si nascondono facilmente tra le spese quotidiane. Esporta due o tre mesi di CSV da conto o carta (e controlla un anno intero quando puoi per i rinnovi annuali) così nomi esercente, importi e cadenze emergono subito.',
    note: 'In Tracky: importa lo storico CSV in locale nel browser su un conto manuale corrente o carta, senza credenziali bancarie.',
  },
  {
    title: 'Esamina le ricorrenze come suggerimenti, non certezze',
    body: 'Cerca addebiti dello stesso esercente normalizzato nella stessa valuta con importi simili a distanza di circa 25–35 giorni (mensile), 55–65 giorni (bimestrale), 85–95 giorni (trimestrale) o 355–375 giorni (annuale). Verifica ogni segnalazione: un bar abituale non è un contratto e un abbonamento reale può cambiare tariffa.',
    note: 'In Tracky: il rilevamento segnala possibili ricorrenze con tolleranza del 5% (o 100 unità minori), lasciando sempre a te la conferma.',
  },
  {
    title: 'Conferma le sottoscrizioni vere con i dettagli di rinnovo',
    body: 'Per ogni servizio ricorrente che decidi di tenere, registra nome, importo attuale, valuta, intervallo, prossima scadenza e conto di addebito. Tenere nell’elenco solo le sottoscrizioni Attive davvero confermate mantiene pulito il calendario del flusso di cassa.',
    note: 'In Tracky: solo le sottoscrizioni Attive entrano nei rinnovi e nel Flusso di cassa; quelle In pausa o Terminate restano fuori.',
  },
  {
    title: 'Individua i doppioni e disdici direttamente presso il fornitore',
    body: 'Confronta alias esercente, piani streaming o cloud sovrapposti e prove gratuite trasformate in rinnovi a pagamento. Disdici sempre direttamente nel servizio reale (o nello store) conservando la conferma: nessuna app di budget disdice contratti al posto tuo. Poi aggiorna lo stato in pausa o terminato nel tuo registro.',
    note: 'In Tracky: impostare lo stato su Terminata conserva lo storico dei movimenti escludendo futuri rinnovi fantasma dal Flusso di cassa.',
  },
  {
    title: 'Controlla i prossimi rinnovi prima dell’addebito',
    body: 'Mantieni corto l’elenco delle sottoscrizioni e controlla le prossime scadenze accanto al calendario del flusso di cassa. Guardare i rinnovi in anticipo trasforma addebiti silenziosi in scelte consapevoli e ti permette di accorgerti subito di eventuali rincari.',
    note: 'In Tracky: i rinnovi attivi compaiono direttamente nel Flusso di cassa e nelle notifiche in-app prima dell’addebito.',
  },
];

export const guideSubscriptionsItFaq: Array<FaqItem> = [
  {
    q: 'Come posso individuare gli abbonamenti inutili senza andare a memoria?',
    a: 'Parti da due o tre mesi di storico CSV di conto o carta ed esamina le ricorrenze basate su nomi esercente normalizzati, stessa valuta, importi simili e distanza fra le date. Conferma sempre di persona esercente, importo, intervallo e prossima scadenza: ogni rilevamento automatico resta un suggerimento, non una certezza.',
  },
  {
    q: 'Tracky può disdire un abbonamento al posto mio?',
    a: 'No. La disdetta va sempre fatta direttamente presso il fornitore, la banca o l’app store. Dopo aver disdetto, segna la sottoscrizione in Tracky come In pausa (salvata senza impegno attivo) oppure Terminata (storico conservato, esclusa da futuri abbinamenti e dal Flusso di cassa).',
  },
  {
    q: 'Come incidono gli stati Attiva, In pausa e Terminata sul Flusso di cassa?',
    a: 'Solo le sottoscrizioni in stato Attiva entrano nei rinnovi imminenti e nelle proiezioni del Flusso di cassa alle rispettive scadenze. Le voci In pausa e Terminate restano fuori dai calcoli futuri, così i servizi disdetti non falsano il saldo proiettato. Tutte le proiezioni restano stime di pianificazione, non garanzie.',
  },
  {
    q: 'Questo controllo degli abbonamenti funziona nella demo ospitata?',
    a: 'Sì. Nella demo ospitata gratuita puoi importare i CSV bancari su conti manuali, esaminare i suggerimenti di ricorrenza, confermare gli abbonamenti reali e vedere i rinnovi attivi entrare nel Flusso di cassa — senza collegare alcuna banca.',
  },
];

export const Route = createFileRoute('/it/guide/cancella-abbonamenti-inutili')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Come trovare e cancellare abbonamenti inutili · Tracky',
      description:
        'Guida in cinque passi per individuare addebiti ricorrenti dallo storico CSV, eliminare doppioni, disdire correttamente e monitorare i rinnovi in cassa.',
      locale: 'it',
      path: '/it/guide/cancella-abbonamenti-inutili',
      ogImage: ogImageFor('guide-subscriptions'),
      jsonLd: [
        softwareAppJsonLd({
          url: 'https://www.trytracky.app/it/guide/cancella-abbonamenti-inutili',
          inLanguage: ['it', 'en'],
        }),
        faqJsonLd(guideSubscriptionsItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'Come trovare e cancellare abbonamenti inutili',
          step: guideSteps.map((step) => ({ '@type': 'HowToStep', name: step.title, text: step.body })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Cancella abbonamenti inutili', path: '/it/guide/cancella-abbonamenti-inutili' },
        ]),
      ],
    }),
  component: GuideIt,
});

function GuideIt() {
  const auth = Route.useLoaderData();
  return <GuideSubscriptionsItView auth={auth} />;
}

export function GuideSubscriptionsItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/guide/cancella-abbonamenti-inutili">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[
                { label: 'Home', href: '/it/' },
                { label: 'Cancella abbonamenti inutili' },
              ]}
            />

            <ChipRow>
              <Chip tone="cobalt">Guida pratica</Chip>
              <Chip>5 passi concreti</Chip>
              <Chip tone="sage">Funziona nella demo gratis</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Come trovare e <span className="mka-accent-ink">cancellare gli abbonamenti inutili</span> dagli estratti conto.
            </h1>

            <p className="mka-hero-dek">
              I singoli addebiti ricorrenti sembrano spesso innocui presi uno alla volta — ed è così che prove
              dimenticate, piani streaming doppi e rinnovi annuali silenziosi restano attivi per anni. Controllali con
              metodo partendo dallo storico reale invece di affidarti alla memoria.
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-secondary" href="#steps">
                Vai ai 5 passi ↓
              </a>
              <B2AppCta
                auth={auth}
                locale="it"
                loggedInHref="/app"
                loggedInLabel="Apri la demo →"
                loggedOutLabel="Controlla con CSV nella demo →"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. EDUCATIONAL FOUNDATION */}
      <Section id="why-subs-hide" tone="parchment">
        <SectionHead
          kicker="Perché sfuggono"
          title="Tre motivi per cui gli abbonamenti inutili si nascondono negli estratti conto."
          subtitle="Individuarli richiede storico pulito e un controllo periodico — non un intermediario a pagamento."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Cosa rende difficili da notare gli addebiti ricorrenti</h3>
            <ul className="mka-b2-prose-list">
              <li>
                <strong>Le diciture bancarie differiscono dal nome del servizio:</strong> spesso l’addebito compare sotto
                la società madre, un intermediario di pagamento o lo store del telefono.
              </li>
              <li>
                <strong>Le cadenze trimestrali e annuali escono dalla memoria:</strong> un rinnovo ogni tre mesi o una
                volta all’anno passa facilmente inosservato finché non arriva in estratto.
              </li>
              <li>
                <strong>I doppioni in famiglia si accumulano in silenzio:</strong> due persone che pagano separatamente
                lo stesso servizio streaming, musicale o cloud sono un classico spreco evitabile.
              </li>
            </ul>
          </article>

          <article className="mka-editorial-card">
            <h3>Una regola semplice per ogni ricorrenza</h3>
            <p>
              Durante la revisione dividi tutto in due gruppi: i servizi che scegli consapevolmente di tenere (con la
              prossima data di rinnovo visibile in anticipo) e i servizi che disdici subito alla fonte.
            </p>
            <p>
              Dopo aver disdetto presso il fornitore, aggiorna lo stato su <strong>In pausa</strong> o{' '}
              <strong>Terminata</strong> nel registro: così conservi lo storico passato senza far pesare addebiti
              futuri sul flusso di cassa.
            </p>
          </article>
        </div>
      </Section>

      {/* 3. FIVE STEPS */}
      <Section id="steps">
        <SectionHead
          kicker="Procedura passo passo"
          title="Trova, ripulisci e monitora gli abbonamenti in cinque passi."
          subtitle="Lavora sui movimenti reali esportati così ogni decisione poggia su addebiti osservati e non su ricordi."
        />

        <B2GuideSteps steps={guideSteps} stepPrefix="Passo" />
      </Section>

      {/* 4. HOW TRACKY HELPS */}
      <Section id="how-tracky-helps" tone="parchment">
        <SectionHead
          kicker="Come ti aiuta Tracky"
          title="Suggerimenti sulle ricorrenze da confermare — collegati al Flusso di cassa."
          subtitle="Esegui l’intera revisione a €0 nella demo ospitata usando import CSV nel browser, oppure sul tuo server Docker self-hosted con licenza MIT."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Come Tracky supporta la revisione</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Rilevamento delle ricorrenze come suggerimenti</strong>
                  <span>
                    Tracky analizza nomi esercente normalizzati, stessa valuta, importi simili (tolleranza del maggiore
                    tra 5% e 100 unità minori) e intervalli mensili, bimestrali, trimestrali o annuali, mostrando ogni
                    corrispondenza come suggerimento da confermare.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Stati Attiva, In pausa e Terminata</strong>
                  <span>
                    Converti un addebito passato o inserisci una sottoscrizione manuale con alias e conto di addebito.
                    Solo le voci <strong>Attive</strong> entrano nei rinnovi e nel Flusso di cassa;{' '}
                    <strong>In pausa</strong> e <strong>Terminata</strong> conservano lo storico senza proiettare uscite
                    future.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Visibilità anticipata sui rinnovi</strong>
                  <span>
                    Vedi i rinnovi attivi direttamente nel calendario del Flusso di cassa e ricevi notifiche in-app
                    quando sottoscrizioni attive o rate scadono entro sette giorni.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Limiti onesti</h3>
            <ul className="mka-check-list">
              <li>Funziona nella demo ospitata con import CSV nel browser (nessuna credenziale bancaria)</li>
              <li>Ogni rilevamento resta un suggerimento finché non confermi esercente, importo e cadenza</li>
              <li>I Report permettono di raggruppare le Spese per controparte per scovare subito i doppioni</li>
              <li className="is-muted">Tracky non disdice mai abbonamenti né contatta fornitori al posto tuo</li>
              <li className="is-muted">Gli avvisi esterni via email/Telegram sono opzionali e solo self-host</li>
            </ul>

            <div className="mka-trust-actions" style={{ marginTop: 'auto' }}>
              <a className="mka-text-link" href="/it/funzioni/flusso-di-cassa">
                Scopri come le sottoscrizioni attive entrano nel Flusso di cassa →
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
        title="Domande su revisione e gestione degli abbonamenti."
        subtitle="Risposte chiare su rilevamento, disdetta e impatto sul Flusso di cassa."
        moreLink={{ href: '/it/domande-frequenti', label: 'Leggi tutte le FAQ →' }}
        items={guideSubscriptionsItFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Continua a leggere"
        title="Completa la tua routine di pianificazione."
        items={[
          {
            kicker: 'Guida pratica',
            title: 'Come prevedere il flusso di cassa',
            description: 'Unisci le sottoscrizioni Attive confermate ad affitto, stipendi ed estratti carta in un unico calendario.',
            href: '/it/guide/previsione-flusso-di-cassa',
            linkLabel: 'Leggi la guida Flusso di cassa →',
          },
          {
            kicker: 'Guida pratica',
            title: 'Come creare un budget zero-based',
            description: 'Trasforma i rinnovi mensili e annuali confermati in bucket del Piano finanziati con target dedicati.',
            href: '/it/guide/budget-zero-based',
            linkLabel: 'Leggi la guida Zero-based →',
          },
          {
            kicker: 'Funzione · Demo + Self-host',
            title: 'Report per controparte e categoria',
            description: 'Filtra le Spese per controparte sugli ultimi 12 mesi per individuare subito anche i rinnovi annuali.',
            href: '/it/funzioni/report',
            linkLabel: 'Scopri i Report →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Tieni solo i servizi che usi. Vedi ogni rinnovo in anticipo."
        meta="Demo ospitata a €0 · Import CSV nel browser e suggerimenti sottoscrizioni inclusi · Senza carta"
        primaryCta={
          <B2AppCta
            auth={auth}
            locale="it"
            loggedInHref="/app"
            loggedInLabel="Apri la demo →"
            loggedOutLabel="Prova gratis la demo →"
            variant="marigold"
          />
        }
        secondaryCta={
          <a className="mka-btn-outline-light" href="/it/funzioni/flusso-di-cassa">
            Scopri il Flusso di cassa →
          </a>
        }
      />
    </AtelierSite>
  );
}
