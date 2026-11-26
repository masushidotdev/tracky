import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { FaqItem, FeatureCardItem, ProofTabItem, StepItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Chip,
  ChipRow,
  CodePlate,
  FaqSection,
  FeatureGrid,
  FinalCta,
  FitCheck,
  GITHUB_REPO_URL,
  HeroLedgerDiagram,
  PricingCards,
  ProofTabs,
  Section,
  SectionHead,
  StepCards,
} from '@/components/marketing/atelier';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const homeItFaq: Array<FaqItem> = [
  {
    q: 'Tracky costa davvero €0 e non nasconde una prova a scadenza?',
    a: 'Sì. Oggi Tracky costa €0 sia nella demo ospitata sia in self-hosting con licenza MIT, senza carta di credito e senza timer di prova. Nel codice è riservato un piano Pro (per aumentare i messaggi giornalieri dell’Analyst AI, gestire più Piani e scenari Forecast pluriennali), ma la fatturazione non esiste ancora e nell’app non c’è alcun checkout.',
  },
  {
    q: 'Devo collegare il mio conto bancario?',
    a: 'No. Conti manuali correnti, di risparmio, carte, prestiti, investimenti e altri asset insieme all’import CSV coprono l’intero flusso di budget. La sincronizzazione bancaria PSD2 tramite Enable Banking è facoltativa, richiede una tua app Enable Banking con le tue chiavi ed è disponibile solo sulle istanze self-hosted: mai obbligatoria e disattivata sulla demo ospitata.',
  },
  {
    q: 'Che fine fa il mio file CSV della banca quando lo importo?',
    a: 'Tracky legge e analizza il CSV in locale nel tuo browser: il file originale non viene mai caricato sul server. Mappi le colonne, controlli ogni riga etichettata come Valida, Duplicata o Errore con la relativa motivazione, e solo le righe valide che confermi vengono salvate nel conto manuale.',
  },
  {
    q: 'Come funzionano le proiezioni del Flusso di cassa — e sono garantite?',
    a: 'Il Flusso di cassa parte dagli ultimi saldi liquidi osservati e applica in ordine di data gli impegni registrati — entrate e uscite pianificate, sottoscrizioni attive, rate, estratti carta e movimenti programmati — mostrando il saldo proiettato dopo ogni scadenza e la prima data negativa. È una stima costruita sui dati presenti nell’app, mai una garanzia né consulenza finanziaria.',
  },
  {
    q: 'Come vengono gestiti i plafond delle carte e le valute multiple?',
    a: 'Saldi e limiti delle carte non contano mai come liquidità spendibile né entrano nel Disponibile dopo le spese. Gli acquisti coperti con carta vengono spostati in un bucket dedicato al pagamento della carta, e l’impatto sulla liquidità passa dall’estratto in scadenza sul conto di regolamento, così nulla viene contato due volte. Ogni valuta resta separata: Tracky non inventa tassi di cambio.',
  },
  {
    q: 'Cosa serve per il self-hosting con Docker e cosa resta esterno?',
    a: 'Servono Docker 24+ con Compose v2, Node.js 22 per eseguire node scripts/selfhost-setup.mjs e un account gratuito WorkOS AuthKit. Il backend Convex e l’app TanStack Start girano in locale nei container con telemetria disattivata a tempo di build, mentre WorkOS AuthKit resta un servizio esterno di autenticazione. Enable Banking, Analyst AI, Resend e Telegram restano spenti finché non inserisci le tue chiavi.',
    aNode: (
      <>
        Servono Docker 24+ con Compose v2, Node.js 22 per eseguire <code>node scripts/selfhost-setup.mjs</code> e un
        account gratuito WorkOS AuthKit. Il backend Convex e l’app TanStack Start girano in locale nei container con
        telemetria disattivata a tempo di build, mentre WorkOS AuthKit resta un servizio esterno di autenticazione.
        Enable Banking, Analyst AI, Resend e Telegram restano spenti finché non inserisci le tue chiavi.
      </>
    ),
  },
];

const proofTabs: Array<ProofTabItem> = [
  {
    id: 'preview',
    tabLabel: '01 · Validazione riga per riga',
    imageSrc: '/shots/import-preview.png',
    imageAlt:
      'Anteprima import CSV di Tracky (interfaccia in inglese) con 33 righe valide e 3 duplicati segnalati prima di salvare nel conto Demo',
    imageWidth: 1440,
    imageHeight: 800,
    heading: 'Ogni riga verificata prima che entri un solo euro',
    body: (
      <>
        Prima di scrivere sul tuo conto manuale, Tracky classifica ogni riga come <strong>Valida</strong>,{' '}
        <strong>Duplicata</strong> o <strong>Errore</strong> con una spiegazione chiara.
      </>
    ),
    checklist: [
      'Le righe ripetute nello stesso file o in import precedenti vengono saltate automaticamente.',
      'Solo le righe valide che confermi vengono salvate: il file CSV grezzo non lascia mai il browser.',
      'Una sola barra laterale collega Dashboard, Piano, Report, Tutti i conti, Flusso di cassa, Obiettivi e Sottoscrizioni.',
    ],
    footnoteLabel: 'Re-import sicuri:',
    footnote:
      'L’import si è interrotto a metà? Ricarica lo stesso export bancario: le chiavi di deduplica saltano i movimenti già presenti senza alterare il saldo.',
  },
  {
    id: 'mapping',
    tabLabel: '02 · Mappatura guidata colonne',
    imageSrc: '/shots/import-mapping.png',
    imageAlt:
      'Schermata di mappatura colonne CSV di Tracky con data contabile, descrizione, controparte e colonne importo singolo o dare/avere separati',
    imageWidth: 1440,
    imageHeight: 800,
    heading: 'Adatta qualsiasi CSV bancario e applica le tue regole',
    body: 'Ogni banca esporta colonne diverse. Scegli il conto manuale di destinazione, abbina le colonne e indica il formato di date e importi.',
    checklist: [
      <>
        Supporta 4 formati data (<code>YYYY-MM-DD</code>, <code>DD/MM/YYYY</code>, <code>MM/DD/YYYY</code>,{' '}
        <code>DD.MM.YYYY</code>).
      </>,
      <>
        Gestisce sia la virgola decimale (<code>1.234,56</code>) sia il punto decimale (<code>1,234.56</code>).
      </>,
      'Accetta una colonna importo con segno oppure colonne dare/avere separate, più le regole di categorizzazione automatica.',
    ],
    footnoteLabel: 'Rigore valutario:',
    footnote:
      'Ogni riga eredita la valuta del conto selezionato: importa ogni valuta nel conto manuale corrispondente.',
  },
];

const steps: Array<StepItem> = [
  {
    num: 'Passo 01',
    icon: 'import',
    title: 'Aggiungi i conti e importa i CSV',
    body: 'Crea conti manuali correnti, risparmio, carte, prestiti o asset — oppure attiva la sincronizzazione bancaria PSD2 sulla tua istanza self-hosted. Valida e deduplica i CSV bancari direttamente nel browser.',
  },
  {
    num: 'Passo 02',
    icon: 'envelopes',
    title: 'Dai un lavoro a ogni euro',
    body: (
      <>
        Distribuisci la liquidità osservata nei bucket del Piano finché <strong>Da assegnare</strong> arriva a zero.
        Imposta target settimanali, mensili, annuali o personalizzati e controlla l’anteprima dell’Assegnazione
        automatica prima di confermare.
      </>
    ),
  },
  {
    num: 'Passo 03',
    icon: 'cashflow',
    title: 'Proietta il ciclo di cassa',
    body: (
      <>
        Inserisci bollette note, stipendi, sottoscrizioni attive, rate ed estratti carta. Controlla il{' '}
        <strong>Disponibile dopo le spese</strong> in Dashboard — liquidità disponibile meno impegni residui e
        accantonamenti money box dovuti — e individua in anticipo la prima data negativa.
      </>
    ),
  },
  {
    num: 'Passo 04',
    icon: 'reports',
    title: 'Riconcilia, analizza ed esporta',
    body: 'Collega i pagamenti quando arrivano così nessuna scadenza conta due volte. Filtra i Report per categoria, controparte o tag, esporta CSV aggregati per il commercialista o scarica un backup JSON completo.',
  },
];

const features: Array<FeatureCardItem> = [
  {
    key: 'plan',
    icon: 'plan',
    spotTone: 'marigold',
    scope: 'both',
    scopeLabel: 'Demo + Self-host',
    title: 'Piano zero-based e target',
    description: (
      <>
        Segui <strong>Assegnato</strong>, <strong>Attività</strong> e <strong>Disponibile</strong> per ogni bucket. Gli
        acquisti coperti con carta confluiscono automaticamente nel bucket di pagamento carta così la liquidità resta
        pronta per l’estratto.
      </>
    ),
    factLabel: 'Regola chiave:',
    fact: 'Lavora solo sulla liquidità osservata in una valuta per Piano. Il Disponibile positivo si riporta al mese successivo; i plafond delle carte non contano mai come liquidità.',
    linkHref: '/it/funzioni/piano-zero-based',
    linkLabel: 'Scopri il Piano zero-based →',
  },
  {
    key: 'cashflow',
    icon: 'cashflow',
    spotTone: 'cobalt',
    scope: 'both',
    scopeLabel: 'Demo + Self-host',
    title: 'Calendario Flusso di cassa e Disponibile dopo le spese',
    description: (
      <>
        Disponi in ordine cronologico stipendi, bollette, sottoscrizioni attive, rate ed estratti carta sopra gli ultimi
        saldi noti. Leggi il ritmo giornaliero del <strong>Disponibile dopo le spese</strong> e la prima data in cui la
        cassa scenderebbe sotto zero.
      </>
    ),
    factLabel: 'Regola chiave:',
    fact: 'Le proiezioni sono stime ricavate dalle voci registrate, mai garanzie. Apri sempre il dettaglio e l’ultimo aggiornamento prima di decidere; le entrate attese non gonfiano il disponibile prima dell’incasso.',
    linkHref: '/it/funzioni/flusso-di-cassa',
    linkLabel: 'Scopri il Flusso di cassa →',
  },
  {
    key: 'csv',
    icon: 'csv',
    spotTone: 'sage',
    scope: 'both',
    scopeLabel: 'Demo + Self-host',
    title: 'Import CSV nel browser e registro completo',
    description:
      'Importa gli estratti bancari nei conti manuali correnti o carta con mappatura colonne, regole di categoria, fino a 10 tag colorati per movimento, note private, righe programmate e azioni massive.',
    factLabel: 'Regola chiave:',
    fact: 'I file CSV sono elaborati esclusivamente nel browser; solo le righe valide confermate vengono salvate, con salto idempotente dei duplicati.',
    linkHref: '/it/vs-fogli-di-calcolo',
    linkLabel: 'Confronto con i fogli di calcolo →',
  },
  {
    key: 'reports',
    icon: 'reports',
    spotTone: 'vermilion',
    scope: 'both',
    scopeLabel: 'Demo + Self-host',
    title: 'Report, money box virtuali e rientro debiti',
    description:
      'Esplora il diagramma Sankey del flusso di cassa, spese ed entrate o trend mensili, trimestrali e annuali, salva fino a 20 viste, segui obiettivi con money box virtuali e simula piani valanga o palla di neve.',
    factLabel: 'Regola chiave:',
    fact: 'I giroconti restano fuori dai totali di spesa. Esporta CSV aggregati per valuta; le money box restano accantonamenti virtuali finché non sposti denaro reale.',
    linkHref: '/it/funzioni/report',
    linkLabel: 'Scopri i Report →',
  },
  {
    key: 'bank',
    icon: 'bank',
    spotTone: 'cobalt',
    scope: 'selfhost',
    scopeLabel: 'Solo self-host',
    title: 'Sincronizzazione PSD2 via Enable Banking',
    description:
      'Collega le banche supportate completando il consenso direttamente sul sito della banca. La sincronizzazione automatica viene valutata ogni sei ore, con alias per conto, pausa/nascondi e cronologia dei job con duplicati riconosciuti.',
    factLabel: 'Regola chiave:',
    fact: 'Disattivata sulla demo ospitata. Sulla tua istanza usi il tuo app ID e la tua chiave PEM Enable Banking — revocabili quando vuoi.',
    linkHref: '/it/funzioni/collegamento-bancario',
    linkLabel: 'Scopri il collegamento bancario →',
  },
  {
    key: 'analyst',
    icon: 'analyst',
    spotTone: 'marigold',
    scope: 'selfhost',
    scopeLabel: 'Solo self-host',
    title: 'Analyst AI con scritture approvate',
    description:
      'Interroga il tuo registro autorizzato in linguaggio naturale, confronta scenari what-if e ricevi segnalazioni su duplicati o picchi di spesa — con consegna opzionale via email Resend o Telegram bidirezionale.',
    factLabel: 'Regola chiave:',
    fact: 'Disattivato sulla demo ospitata. Strumento di esplorazione, mai consulenza finanziaria; ogni scrittura mostra l’anteprima e attende la tua approvazione.',
    linkHref: '/it/funzioni/analyst-ai',
    linkLabel: 'Scopri Analyst AI →',
  },
];

export const Route = createFileRoute('/it/')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Tracky — Budget zero-based e flusso di cassa open source',
      description:
        'Tracky è un’app open source MIT per budget zero-based e flusso di cassa. Assegna la liquidità reale, mappa scadenze e CSV nel browser o in self-host.',
      locale: 'it',
      path: '/it/',
      ogImage: ogImageFor('home'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/', inLanguage: ['it', 'en'] }),
        faqJsonLd(homeItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([{ name: 'Home', path: '/it/' }]),
      ],
    }),
  component: HomeIt,
});

function HomeIt() {
  const auth = Route.useLoaderData();

  // StrictMode double-invokes effects in dev: ref-guard keeps one landing_viewed.
  const landingSent = React.useRef(false);
  React.useEffect(() => {
    if (landingSent.current) return;
    landingSent.current = true;
    trackEvent(analyticsEvents.landingViewed, { auth_state: auth.user ? 'logged' : 'anon' });
  }, [auth.user]);

  return <HomeItView auth={auth} />;
}

export function HomeItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/">
      {/* 1. HERO */}
      <section className="mka-hero">
        <div className="mka-container mka-hero-grid">
          <div>
            <ChipRow>
              <Chip tone="cobalt">Open source MIT</Chip>
              <Chip tone="marigold">€0 oggi</Chip>
              <Chip>Senza carta</Chip>
              <Chip tone="sage">Self-host Docker</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Budget zero-based e flusso di cassa, <span className="mka-accent-ink">tutto alla luce del sole.</span>
            </h1>

            <p className="mka-hero-dek">
              Dai un lavoro a ogni euro già presente nei tuoi conti prima di spenderlo, proietta bollette ed estratti
              carta lungo il tuo ciclo e verifica ogni formula nel codice pubblico con licenza MIT. Inizia nella demo
              ospitata con conti manuali e import CSV, oppure fai self-hosting con Docker.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="it" ctaLocation="landing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/it/blog/self-hosting-tracky-docker">
                Self-host con Docker →
              </a>
            </div>

            <p className="mka-hero-meta">
              <span>Rilascio pubblico v0.1.0</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Nessun checkout o timer di prova</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Guide utente in italiano e inglese</span>
            </p>
          </div>

          <div className="mka-hero-art-card">
            <HeroLedgerDiagram locale="it" />
            <p className="mka-art-caption">
              <strong>Liquidità osservata · Bucket zero-based · Scadenze datate</strong>
              <span>Le proiezioni sono stime, non garanzie.</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. PRODUCT IN CONTEXT */}
      <Section id="product" tone="parchment">
        <SectionHead
          kicker="Dentro lo spazio di lavoro"
          title="Trasforma un CSV bancario in un registro pulito — validato prima nel tuo browser."
          subtitle="Screenshot reali dalla demo ospitata. Tracky analizza l’export della tua banca in locale nel browser, evidenzia duplicati ed errori prima di salvare qualsiasi dato e riunisce conti e strumenti in un’unica barra laterale ordinata."
        />
        <ProofTabs
          ariaLabel="Screenshot del flusso di importazione CSV"
          metaNote="Demo ospitata · CSV analizzato nel browser"
          tabs={proofTabs}
        />
      </Section>

      {/* 3. HOW IT WORKS */}
      <Section id="how-it-works">
        <SectionHead
          kicker="Come funziona"
          title="Quattro passi dall’export della banca a un mese chiuso."
          subtitle="Tracky ancora ogni decisione al denaro già osservato nei tuoi conti — mai a stipendi futuri non ancora incassati o ai plafond delle carte di credito."
        />
        <StepCards steps={steps} />
      </Section>

      {/* 4. FEATURES BY JOB-TO-BE-DONE */}
      <Section id="features" tone="parchment">
        <SectionHead
          kicker="Funzioni principali"
          title="Cosa fa Tracky — e dove gira ogni funzione."
          subtitle="Tutto il ciclo di pianificazione, import CSV e reportistica funziona nella demo ospitata gratuita. Le funzioni che richiedono credenziali di terze parti sono contrassegnate chiaramente come solo self-host."
        />
        <FeatureGrid items={features} />
      </Section>

      {/* 5. TRUST, PRIVACY & ACCOUNTING RULES */}
      <Section id="trust">
        <SectionHead
          kicker="Fiducia, privacy e matematica"
          title="Regole verificabili e codice aperto — invece di bollini di marketing."
          subtitle="Non pubblichiamo loghi di clienti, premi o numeri che non puoi controllare. Ogni formula, confine di sicurezza e dipendenza esterna è documentata nel repository."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Quattro regole contabili imposte nel codice</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Il plafond della carta non è mai liquidità spendibile</strong>
                  <span>
                    I saldi delle carte restano fuori dalla liquidità e dal Disponibile dopo le spese. Gli acquisti
                    entrano tramite l’estratto in scadenza sul conto di regolamento, evitando doppi conteggi.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Ogni valuta resta separata — nessuna conversione silenziosa</strong>
                  <span>
                    Gli importi sono salvati in unità minori intere con il codice valuta. EUR, USD e altre valute
                    mantengono totali distinti in Dashboard, Piano, Flusso di cassa e Report.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Proiezioni e suggerimenti sono stime, non garanzie</strong>
                  <span>
                    Il Flusso di cassa calcola a partire dalle voci registrate; sottoscrizioni e giroconti arrivano come
                    suggerimenti da confermare; ogni totale è una fotografia e Tracky non offre consulenza finanziaria.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--vermilion" aria-hidden="true">
                  04
                </span>
                <div>
                  <strong>I tuoi dati restano esportabili e cancellabili</strong>
                  <span>
                    Scarica CSV aggregati dai Report o richiedi un export JSON completo dalle Impostazioni. Confermare
                    Elimina account avvia la cancellazione immediata e irreversibile.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Open source, privacy e servizi esterni</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  MIT
                </span>
                <div>
                  <strong>Repository pubblico e decisioni documentate</strong>
                  <span>
                    Backend Convex, frontend TanStack Start, guide utente bilingui (IT/EN) e architecture decision
                    records sono pubblici su <code>masushidotdev/tracky</code>.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  CSV
                </span>
                <div>
                  <strong>Analisi nel browser e chiavi bancarie tue</strong>
                  <span>
                    I file CSV restano sul tuo dispositivo. Se attivi il sync bancario via Enable Banking in self-host,
                    registri la tua app e la tua chiave PEM: i maintainer non vedono mai le tue credenziali bancarie.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  0
                </span>
                <div>
                  <strong>Zero telemetria in self-host; opt-in nella demo</strong>
                  <span>
                    Le build Docker self-host disattivano PostHog, beacon Convex e telemetria Wrangler a tempo di build.
                    Nella demo ospitata PostHog EU resta spento finché non clicchi Accetta, e maschera saldi e input.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>Cosa resta esterno:</strong> l’autenticazione usa <strong>WorkOS AuthKit</strong> (servizio
              esterno con piano gratuito per sviluppatori) anche in self-hosting. Sync bancario (Enable Banking),
              modelli AI, email (Resend) e Telegram restano spenti finché non configuri le tue chiavi.
            </div>

            <div className="mka-trust-actions">
              <a className="mka-text-link" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                Esplora il codice su GitHub ↗
              </a>
              <a className="mka-text-link" href="/it/open-source">
                Leggi la pagina Open Source →
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* 6. HOSTED DEMO VS SELF-HOST */}
      <Section id="deployment" tone="parchment">
        <SectionHead
          kicker="Due modi per usare Tracky"
          title="Esplora la demo ospitata, oppure ospita l’intero stack con Docker."
          subtitle="Entrambi eseguono lo stesso codice con licenza MIT. La demo ospitata tiene spente le integrazioni esterne così puoi provare budget e flusso di cassa subito senza configurare chiavi."
        />

        <div className="mka-deploy-grid">
          <article className="mka-deploy-card">
            <div className="mka-deploy-head">
              <div>
                <h3>Demo ospitata</h3>
                <p className="mka-deploy-sub">Pronta su trytracky.app — nessun server da configurare</p>
              </div>
              <Chip tone="marigold">€0 · Senza carta</Chip>
            </div>

            <ul className="mka-check-list">
              <li>Conti manuali correnti, risparmio, carte, prestiti e altri asset</li>
              <li>Import CSV nel browser con mappatura colonne e controllo duplicati</li>
              <li>Piano zero-based, target, Assegnazione automatica e bucket carte</li>
              <li>Dashboard Disponibile dopo le spese, Flusso di cassa e promemoria in-app</li>
              <li>Report (Sankey, categorie, trend, export CSV), Obiettivi ed export JSON</li>
              <li className="is-muted">Sincronizzazione bancaria PSD2 disattivata sulla demo ospitata</li>
              <li className="is-muted">Analyst AI disattivato sulla demo ospitata</li>
            </ul>

            <div className="mka-deploy-cta">
              <AuthCta auth={auth} locale="it" ctaLocation="landing" />
            </div>
          </article>

          <article className="mka-deploy-card">
            <div className="mka-deploy-head">
              <div>
                <h3>Self-hosted (Docker)</h3>
                <p className="mka-deploy-sub">Sul tuo computer o VPS singolo, zero telemetria</p>
              </div>
              <Chip tone="cobalt">MIT · Le tue chiavi</Chip>
            </div>

            <ul className="mka-check-list">
              <li>Tutto ciò che è nella demo su un volume SQLite Convex locale</li>
              <li>Sync bancario PSD2 opzionale con la tua app e chiavi Enable Banking</li>
              <li>Analyst AI, report email Resend e bot Telegram opzionali</li>
              <li>Analytics di prodotto e beacon disattivati a tempo di build</li>
              <li className="is-muted">
                Richiede Docker 24+ (Compose v2), Node.js 22 (per lo script di setup) e un account gratuito WorkOS
                AuthKit
              </li>
            </ul>

            <CodePlate
              ariaLabel="Comandi per il self-hosting con Docker"
              lines={[
                { text: '# Configura WorkOS e genera il file .env locale (0600)', comment: true },
                { text: 'node scripts/selfhost-setup.mjs' },
                { text: 'docker compose up -d' },
              ]}
            />

            <div className="mka-deploy-cta">
              <a className="mka-btn-secondary mka-btn-secondary--sm" href="/it/blog/self-hosting-tracky-docker">
                Guida self-host Docker →
              </a>
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/docs/self-hosting.it.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Documentazione GitHub ↗
              </a>
              <a className="mka-text-link" href="/it/open-source">
                Panoramica architettura →
              </a>
            </div>
          </article>
        </div>
      </Section>

      {/* 7. WHO IT IS FOR / NOT FOR */}
      <Section id="fit">
        <SectionHead
          kicker="Verifica trasparente"
          title="Per chi è pensato Tracky — e quando non è ancora lo strumento giusto."
          subtitle="Essere chiari dall’inizio fa risparmiare tempo a tutti. Tracky fa scelte precise su liquidità osservata, separazione delle valute e controllo dell’utente."
        />

        <FitCheck
          yesTitle="Fa per te se…"
          yesItems={[
            'Vuoi sostituire fogli di calcolo fragili con saldi datati, bucket zero-based e import/export CSV puliti.',
            'Ti serve vedere affitto, scadenze fiscali, rate ed estratti carta in ordine di data prima che arrivi uno scoperto.',
            'Gestisci conti personali, da freelance o familiari in un unico spazio e vuoi esportazioni CSV pulite per valuta.',
            'Apprezzi software open source MIT da leggere riga per riga o eseguire sul tuo host Docker con le tue chiavi.',
          ]}
          noTitle="Non è ancora adatto se…"
          noItems={[
            'Cerchi una sincronizzazione bancaria chiavi in mano su cloud ospitato senza fare self-hosting né registrare una tua app Enable Banking.',
            'Ti servono login separati multi-utente per partner o familiari: Tracky è uno spazio singolo (anche se una coppia può rivedere lo stesso piano insieme).',
            'Vuoi conversioni valutarie automatiche che fondano EUR, USD e altre valute in un unico patrimonio aggregato.',
            'Richiedi un self-hosting completamente offline senza servizi esterni: la configurazione Docker usa comunque WorkOS AuthKit per l’accesso.',
          ]}
        />
      </Section>

      {/* 8. PRICING */}
      <Section id="pricing" tone="parchment">
        <SectionHead
          kicker="Prezzi"
          title="€0 oggi — senza carta, senza timer di prova, senza checkout."
          subtitle="Tracky è gratuito nella demo ospitata e con licenza MIT in self-hosting. Nel codice esiste uno spazio riservato per un piano Pro, ma la fatturazione non è attiva e nulla è in vendita."
        />

        <PricingCards
          free={{
            tag: 'Gratis — Disponibile oggi',
            figure: '€0',
            description: 'Tutto il ciclo di budget principale nella demo ospitata o sul tuo server self-hosted MIT.',
            bullets: [
              'Piano zero-based, target, Assegnazione automatica e bucket carte',
              'Dashboard Disponibile dopo le spese, Flusso di cassa e promemoria in-app',
              'Conti manuali, import CSV nel browser ed export CSV dai Report',
              'Money box virtuali, Obiettivi, simulatore debiti ed export JSON',
              'Self-host da GitHub con licenza MIT (limite 20 messaggi/giorno Analyst AI se attivato)',
            ],
            cta: (
              <>
                <AuthCta auth={auth} locale="it" ctaLocation="landing" />
                <a className="mka-text-link" href="/it/prezzi">
                  Pagina prezzi completa →
                </a>
              </>
            ),
          }}
          pro={{
            tag: 'Pro — Riservato, non in vendita',
            figure: 'Nessun prezzo · Nessun checkout',
            description: 'Predisposto nel codice per limiti avanzati; oggi nessuno può acquistarlo né pagare.',
            bullets: [
              'Limite giornaliero Analyst AI più alto (100 messaggi/giorno invece di 20)',
              'Più Piani e scenari Forecast pluriennali (solo stime)',
              'Proiezioni FIRE di lungo periodo via Analyst (stime nominali, non consulenza)',
              'Nessun modulo di pagamento, nessuna prova a scadenza: le funzioni Gratis restano intatte',
            ],
          }}
        />
      </Section>

      {/* 9. FAQ */}
      <FaqSection
        id="faq"
        kicker="Domande frequenti"
        title="Risposte dirette prima di aprire un account."
        subtitle="Ogni risposta riflette il codice e la documentazione rilasciati in v0.1.0 — incluso ciò che resta spento sulla demo ospitata."
        moreLink={{ href: '/it/domande-frequenti', label: 'Leggi tutte le FAQ →' }}
        items={homeItFaq}
      />

      {/* 10. FINAL CTA POSTER */}
      <FinalCta
        id="go"
        headline="Scopri dove arriva la tua liquidità prima della prossima scadenza."
        meta="€0 oggi · Senza carta · Open source MIT · Rilascio pubblico v0.1.0"
        primaryCta={<AuthCta auth={auth} locale="it" ctaLocation="landing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            Esplora il repo MIT ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
