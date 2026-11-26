import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { ComparisonRow, FaqItem, ProofTabItem, StepItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  ComparisonTable,
  FaqSection,
  FinalCta,
  GITHUB_REPO_URL,
  ProofTabs,
  Section,
  SectionHead,
  StepCards,
} from '@/components/marketing/atelier';
import { RelatedLinksSection } from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const vsSpreadsheetsItFaq: Array<FaqItem> = [
  {
    q: 'Passando da un foglio di calcolo a Tracky, quali abitudini mantengo?',
    a: 'Mantieni il pieno controllo sui CSV e la tua disciplina di budget. Importi gli export bancari nei conti manuali correnti o carta con mappatura colonne e validazione nel browser, lavori sempre su saldi osservati e datati ed esporti CSV aggregati per valuta dai Report o un backup JSON completo quando vuoi.',
  },
  {
    q: 'Come importo lo storico bancario senza creare duplicati?',
    a: 'Carichi un CSV con riga di intestazione, abbini le colonne e controlli il badge Valida, Duplicata o Errore su ogni riga prima di confermare. Tracky identifica i duplicati per conto, data, direzione, importo, valuta e descrizione normalizzata: se reimporti lo stesso file dopo un’interruzione, le righe già salvate vengono saltate senza alterare il saldo.',
  },
  {
    q: 'Che fine fanno le bollette ricorrenti e le sottoscrizioni?',
    a: 'Tracky suggerisce probabili sottoscrizioni da esercente, importo e cadenza tra date, e attende la tua conferma prima di considerarle attive. Gli impegni confermati entrano nel Flusso di cassa insieme a spese pianificate, rate ed estratti carta come stime costruite sui dati registrati, mai garanzie.',
  },
  {
    q: 'Perdo il sistema a buste lasciando il foglio di calcolo?',
    a: 'No: conservi lo stesso metodo a buste con le regole contabili imposte nel codice. Crei bucket del Piano con Assegnato, Attività e Disponibile, oppure colleghi una money box virtuale così i risparmi già presenti compaiono come Già accantonato e i target chiedono solo la parte restante. Registrare un contributo virtuale non sposta denaro in banca.',
  },
];

const comparisonRows: Array<ComparisonRow> = [
  {
    capability: 'Saldi dei conti',
    demo: { text: 'Copiati a mano; invecchiano tra un aggiornamento e l’altro', tone: 'no' },
    selfHost: { text: 'Saldi osservati e datati salvati in unità minori intere', tone: 'yes' },
  },
  {
    capability: 'Formule e invarianti di budget',
    demo: { text: 'Le formule si rompono in silenzio inserendo nuove righe', tone: 'no' },
    selfHost: { text: 'Regole del Piano zero-based imposte nel codice tipizzato', tone: 'yes' },
  },
  {
    capability: 'Importazione CSV dalla banca',
    demo: { text: 'Copia-incolla manuale; facile duplicare movimenti', tone: 'no' },
    selfHost: { text: 'Parser nel browser con mappatura colonne e chiavi deduplica', tone: 'yes' },
  },
  {
    capability: 'Spese con carta di credito',
    demo: { text: 'Spesso contate due volte o scambiate per liquidità fino all’estratto', tone: 'no' },
    selfHost: { text: 'Le spese coperte passano in un bucket dedicato al pagamento carta', tone: 'yes' },
  },
  {
    capability: 'Valute multiple',
    demo: { text: 'Schede di cambio manuali o totali mescolati nella stessa colonna', tone: 'no' },
    selfHost: { text: 'Ogni valuta resta separata — mai convertita silenziosamente', tone: 'yes' },
  },
  {
    capability: 'Scadenze e ciclo di cassa',
    demo: { text: 'Foglio promemoria separato da aggiornare a mano', tone: 'opt' },
    selfHost: { text: 'Calendario Flusso di cassa, Disponibile dopo le spese e prima data negativa', tone: 'yes' },
  },
  {
    capability: 'Storico, ricerca ed export',
    demo: { text: 'Sparso tra budget_2026_v7_finale.xlsx e vecchie schede', tone: 'no' },
    selfHost: { text: 'Registro interrogabile, Report CSV aggregati ed export JSON completo', tone: 'yes' },
  },
];

const proofTabs: Array<ProofTabItem> = [
  {
    id: 'preview',
    tabLabel: '01 · Anteprima e controllo duplicati',
    imageSrc: '/shots/import-preview.png',
    imageAlt:
      'Anteprima import CSV di Tracky (interfaccia in inglese) con 33 righe valide e 3 duplicati segnalati prima di salvare nel conto manuale',
    imageWidth: 1440,
    imageHeight: 800,
    heading: 'Ogni riga verificata in locale prima di toccare il saldo',
    body: (
      <>
        Invece di incollare righe in un foglio fragile, Tracky analizza il CSV nel tuo browser ed etichetta ogni riga
        come <strong>Valida</strong>, <strong>Duplicata</strong> o <strong>Errore</strong> con una motivazione chiara.
      </>
    ),
    checklist: [
      'Il file CSV grezzo resta nel browser: vengono salvate solo le righe valide confermate.',
      'Le righe ripetute nello stesso file o in import precedenti vengono saltate automaticamente.',
      'Puoi ricaricare lo stesso export senza rischi se l’import si interrompe a metà.',
    ],
    footnoteLabel: 'Zero manutenzione formule:',
    footnote:
      'Addebiti e accrediti importati aggiornano il saldo del conto manuale e alimentano Piano, Flusso di cassa e Report.',
  },
  {
    id: 'mapping',
    tabLabel: '02 · Mappatura colonne e regole',
    imageSrc: '/shots/import-mapping.png',
    imageAlt:
      'Schermata di mappatura colonne CSV di Tracky con data contabile, descrizione, controparte e colonne importo',
    imageWidth: 1440,
    imageHeight: 800,
    heading: 'Adatta qualsiasi CSV bancario senza ripulirlo prima in Excel',
    body: 'Seleziona il conto manuale corrente o carta, abbina le colonne dalla riga di intestazione e indica il formato di date e decimali.',
    checklist: [
      <>
        Supporta 4 formati data (<code>YYYY-MM-DD</code>, <code>DD/MM/YYYY</code>, <code>MM/DD/YYYY</code>,{' '}
        <code>DD.MM.YYYY</code>).
      </>,
      <>
        Legge sia la virgola decimale (<code>1.234,56</code>) sia il punto decimale (<code>1,234.56</code>).
      </>,
      'Accetta una colonna importo con segno oppure dare/avere separati, più le regole automatiche di categoria.',
    ],
    footnoteLabel: 'Una valuta per conto:',
    footnote: 'Ogni riga eredita la valuta del conto di destinazione così le valute non si mescolano mai.',
  },
];

const migrationSteps: Array<StepItem> = [
  {
    num: 'Passo 01',
    icon: 'import',
    title: 'Crea conti manuali per valuta',
    body: 'Imposta i conti manuali correnti o carta attivi nella loro valuta reale — un conto per valuta per mantenere totali puliti.',
  },
  {
    num: 'Passo 02',
    icon: 'envelopes',
    title: 'Importa l’ultimo CSV della banca',
    body: 'Abbina data, descrizione, controparte e importi nel browser, controlla righe Valide/Duplicate/Errore e applica le regole di categoria.',
  },
  {
    num: 'Passo 03',
    icon: 'cashflow',
    title: 'Assegna la cassa reale e le scadenze',
    body: 'Dai un lavoro a ogni euro osservato nel Piano finché Da assegnare arriva a zero, poi inserisci bollette ed estratti nel Flusso di cassa.',
  },
  {
    num: 'Passo 04',
    icon: 'reports',
    title: 'Tieni il foglio solo per analisi extra',
    body: 'Esporta CSV aggregati per valuta dai Report (con separatore virgola o punto e virgola adatto alla tua lingua) o scarica un backup JSON.',
  },
];

export const Route = createFileRoute('/it/vs-fogli-di-calcolo')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Tracky vs fogli di calcolo — Tieni il CSV, molla la manutenzione',
      description:
        'Confronto tra fogli di calcolo e Tracky: saldi osservati e datati, import CSV nel browser con deduplica, Piano zero-based e Flusso di cassa. Demo €0.',
      locale: 'it',
      path: '/it/vs-fogli-di-calcolo',
      ogImage: ogImageFor('vs-spreadsheets'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/vs-fogli-di-calcolo', inLanguage: ['it', 'en'] }),
        faqJsonLd(vsSpreadsheetsItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Vs fogli di calcolo', path: '/it/vs-fogli-di-calcolo' },
        ]),
      ],
    }),
  component: VsSpreadsheetsIt,
});

function VsSpreadsheetsIt() {
  const auth = Route.useLoaderData();
  return <VsSpreadsheetsItView auth={auth} />;
}

export function VsSpreadsheetsItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/vs-fogli-di-calcolo">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[{ label: 'Home', href: '/it/' }, { label: 'Tracky vs fogli di calcolo' }]}
            />

            <ChipRow>
              <Chip tone="sage">CSV analizzato nel browser</Chip>
              <Chip tone="cobalt">Saldi osservati e datati</Chip>
              <Chip>Valute separate</Chip>
              <Chip tone="marigold">Demo ospitata €0</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Tieni la disciplina del CSV.{' '}
              <span className="mka-accent-ink">Smetti di riparare fogli di calcolo.</span>
            </h1>

            <p className="mka-hero-dek">
              I fogli di calcolo vivono di saldi incollati a mano e formule che si rompono in silenzio appena inserisci
              una riga. Tracky ancora il Piano zero-based a saldi osservati e datati, valida i CSV bancari nel browser
              saltando i duplicati e proietta le scadenze nel Flusso di cassa — lasciandoti sempre a portata di clic gli
              export CSV e JSON.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/it/funzioni/piano-zero-based">
                Come funziona il Piano zero-based →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SIDE-BY-SIDE COMPARISON */}
      <Section id="comparison" tone="parchment">
        <SectionHead
          kicker="A confronto"
          title="Foglio di calcolo vs Tracky: cosa cambia dal primo giorno."
          subtitle="Non perdi controllo né trasparenza: sposti le regole contabili da celle fragili a codice open source verificabile."
        />

        <ComparisonTable
          caption="Confronto diretto tra fogli di calcolo manuali e Tracky"
          headers={['Attività', 'Foglio di calcolo (Excel / Sheets)', 'Tracky (open source MIT)']}
          rows={comparisonRows}
        />
      </Section>

      {/* 3. REAL CSV SCREENSHOTS */}
      <Section id="csv-workflow">
        <SectionHead
          kicker="CSV senza fatica"
          title="Screenshot reali: mappatura e validazione CSV nel browser."
          subtitle="Porta l’export della tua banca direttamente in un conto manuale corrente o carta. Il file resta nel browser, i duplicati vengono segnalati prima del salvataggio e i saldi si aggiornano da soli."
        />

        <ProofTabs
          ariaLabel="Screenshot del flusso di importazione CSV in Tracky"
          metaNote="Demo ospitata · Parser locale nel browser"
          tabs={proofTabs}
        />
      </Section>

      {/* 4. WHERE SHEETS BREAK + STEPS */}
      <Section id="why-switch" tone="parchment">
        <SectionHead
          kicker="Perché i fogli si inceppano"
          title="Dove si rompe il foglio manuale — e come passare a Tracky in ordine."
          subtitle="La maggior parte dei budget su foglio di calcolo si ferma per l’attrito della manutenzione, non per mancanza di disciplina."
        />

        <div className="mka-editorial-grid" style={{ marginBottom: '2.25rem' }}>
          <article className="mka-editorial-card">
            <h3>Dove il foglio si rompe</h3>
            <p>
              Ogni mese riparte lo stesso rituale: copiare i saldi, cercare un riferimento rotto e chiedersi quale sia
              l’ultima copia tra <code>budget_2026_v7_finale.xlsx</code> e la versione del mese prima.
            </p>
            <p>
              Le spese ricorrenti restano nascoste nelle righe dimenticate, gli acquisti con carta sembrano liquidità
              finché arriva l’estratto conto e le valute diverse si fondono in un unico totale fuorviante. Finisci per
              riconciliare il passato invece di guidare il mese in corso.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Cosa cambia in Tracky</h3>
            <p>
              Ogni scelta parte da saldi osservati e datati memorizzati in unità minori intere. Distribuisci la liquidità
              reale nei bucket seguendo <strong>Assegnato</strong>, <strong>Attività</strong> e{' '}
              <strong>Disponibile</strong>, mentre gli acquisti coperti con carta confluiscono automaticamente nel
              bucket dedicato al pagamento della carta.
            </p>
            <p>
              Il Flusso di cassa mette in ordine di data bollette note, sottoscrizioni confermate, rate ed estratti per
              segnalare la prima data negativa proiettata — sempre come stime dai dati registrati, mai garanzie.
            </p>
          </article>
        </div>

        <StepCards steps={migrationSteps} />
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        kicker="FAQ sul passaggio dai fogli"
        title="Domande su storico CSV, duplicati e sistema a buste."
        subtitle="Risposte pratiche per portare in Tracky un budget oggi gestito su Excel o Google Sheets."
        items={vsSpreadsheetsItFaq}
      />

      {/* 6. RELATED LINKS */}
      <RelatedLinksSection
        tone="parchment"
        kicker="Continua a esplorare"
        title="Scopri i moduli che sostituiscono le tue schede."
        items={[
          {
            kicker: 'Funzione',
            title: 'Piano zero-based e target',
            description: 'Come funzionano Da assegnare, riporto dei bucket, Assegnazione automatica e bucket carte.',
            href: '/it/funzioni/piano-zero-based',
            ctaLabel: 'Scopri il Piano →',
          },
          {
            kicker: 'Funzione',
            title: 'Flusso di cassa e Disponibile dopo le spese',
            description: 'Vedi bollette, stipendi ed estratti in ordine cronologico prima che arrivi uno scoperto.',
            href: '/it/funzioni/flusso-di-cassa',
            ctaLabel: 'Scopri il Flusso di cassa →',
          },
          {
            kicker: 'Funzione',
            title: 'Report ed export CSV per valuta',
            description: 'Diagramma Sankey, trend mensili e annuali, viste salvate ed export CSV per valuta.',
            href: '/it/funzioni/report',
            ctaLabel: 'Scopri i Report →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Tieni il CSV. Lascia andare la manutenzione delle formule."
        meta="Import CSV nel browser · Export CSV aggregati e JSON · Demo ospitata €0"
        primaryCta={<AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            Esplora il repo MIT ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
