import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { FaqItem, MarketingAuth } from '@/components/marketing/atelier';
import {
  AtelierSite,
  Breadcrumb,
  Chip,
  FaqSection,
  FinalCta,
  FitCheck,
  ScopePill,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import {
  B2AppCta,
  B2AvailabilityBand,
  B2PillarGrid,
  B2RelatedSection,
} from '@/components/marketing/atelier/b2-sections';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const reportsItFaq: Array<FaqItem> = [
  {
    q: 'Cosa contiene l’export CSV dei Report?',
    a: 'Esporta CSV scarica le serie temporali e i totali della composizione corrente come file report-<scheda>-<dal>-<al>.csv, raggruppati per valuta. Contiene valori aggregati e non le singole transazioni del dettaglio. Tracky usa la virgola per le lingue con punto decimale e il punto e virgola per quelle con virgola decimale, così il file si apre subito nel foglio di calcolo.',
  },
  {
    q: 'Come vengono gestite più valute nei Report?',
    a: 'Ogni valuta ha la propria sezione con Entrate, Spese, Saldo e Tasso di risparmio (saldo diviso per entrate, oppure zero in assenza di entrate). Grafici, elenchi di dettaglio e righe CSV restano raggruppati per valuta: Tracky non converte né fonde mai gli importi di nascosto.',
  },
  {
    q: 'Che differenza c’è tra Composizione e Andamento?',
    a: 'Composizione confronta i gruppi nell’intervallo di date scelto usando ciambella o barre orizzontali (oppure un diagramma di flusso nella scheda Flusso di cassa). Andamento suddivide gli stessi dati per mese, trimestre o anno con barre affiancate o impilate.',
  },
  {
    q: 'Come funzionano i Report salvati?',
    a: 'Imposti scheda, modalità, tipo di grafico, intervallo, raggruppamento, conti, categorie, tag e limiti di importo, poi salvi la vista con un nome riconoscibile. Puoi salvare fino a 20 viste: conservano solo la configurazione, così un intervallo relativo come Questo mese segue sempre il mese corrente.',
  },
  {
    q: 'Perché alcune transazioni non compaiono nei Report?',
    a: 'Giroconti e movimenti interni sono esclusi da Spese ed Entrate così contano solo spese ed entrate classificate. Le transazioni marcate Nascosta dai report non compaiono mai nei totali né nel dettaglio. I grafici mostrano i dieci gruppi principali e riuniscono i restanti in Altro: seleziona un gruppo con nome per aprire i singoli movimenti.',
  },
];

export const Route = createFileRoute('/it/funzioni/report')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Report: Sankey di cassa, categorie ed export CSV · Tracky',
      description:
        'Report Flusso di cassa Sankey, Spese ed Entrate con Composizione e Andamento, dettaglio movimenti, fino a 20 viste salvate ed export CSV per valuta.',
      locale: 'it',
      path: '/it/funzioni/report',
      ogImage: ogImageFor('feature-reports'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/report', inLanguage: ['it', 'en'] }),
        faqJsonLd(reportsItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Report', path: '/it/funzioni/report' },
        ]),
      ],
    }),
  component: ReportsIt,
});

function ReportsIt() {
  const auth = Route.useLoaderData();
  return <ReportsItView auth={auth} />;
}

export function ReportsItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/funzioni/report">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[{ label: 'Home', href: '/it/' }, { label: 'Report' }]}
            />

            <div className="mka-b2-hero-badges">
              <ScopePill scope="both" label="Demo + Self-host" />
              <Chip tone="marigold">€0 oggi</Chip>
              <Chip>Sezioni per valuta</Chip>
              <Chip>Export CSV aggregato</Chip>
            </div>

            <h1 className="mka-hero-headline">
              Report di spese, entrate e cassa <span className="mka-accent-ink">con numeri puliti.</span>
            </h1>

            <p className="mka-hero-dek">
              Capisci da dove arriva il denaro e dove va attraverso tre schede dedicate — <strong>Flusso di cassa</strong>{' '}
              con diagramma Sankey, <strong>Spese</strong> ed <strong>Entrate</strong>. Passa da Composizione ad
              Andamento, apri i movimenti sottostanti, salva fino a 20 viste ed esporta CSV aggregati per valuta.
            </p>

            <div className="mka-hero-actions">
              <B2AppCta
                auth={auth}
                locale="it"
                loggedInHref="/app/reports"
                loggedInLabel="Apri i Report →"
                loggedOutLabel="Prova i Report nella demo →"
              />
              <a className="mka-btn-secondary" href="/it/vs-fogli-di-calcolo">
                Confronto con i fogli di calcolo →
              </a>
            </div>

            <p className="mka-hero-meta">
              <span>Funziona nella demo ospitata</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Giroconti esclusi automaticamente</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Nessun tasso di cambio inventato</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. AVAILABILITY & THREE TABS */}
      <Section id="overview" tone="parchment">
        <SectionHead
          kicker="Disponibilità e schede"
          title="Tre schede pensate per domande diverse."
          subtitle="Tutte le schede, i filtri, le viste salvate e l’export CSV sono inclusi a €0 sia nella demo ospitata sia in self-host Docker."
        />

        <B2AvailabilityBand
          demoTone="sage"
          demoBadge="Incluso a €0"
          demoTitle="Demo ospitata (trytracky.app)"
          demoBody="Flusso di cassa Sankey, Spese, Entrate, modalità Composizione e Andamento, dettaglio dei movimenti, fino a 20 viste salvate ed export CSV aggregato funzionano subito con conti manuali e import CSV."
          selfHostTone="sage"
          selfHostBadge="Incluso · MIT"
          selfHostTitle="Self-hosted Docker"
          selfHostBody="Esegue in locale lo stesso motore di reportistica. Se attivi l’Analyst AI opzionale sulla tua istanza self-hosted, può consultare le stesse aggregazioni per intervalli esatti di date direttamente in chat."
        />

        <div style={{ marginTop: '1.75rem' }}>
          <B2PillarGrid
            items={[
              {
                tag: 'Scheda 01',
                title: 'Flusso di cassa',
                body: 'Confronta entrate e uscite. In modalità Composizione disegna un diagramma di flusso Sankey che collega le fonti di entrata ai gruppi di spesa e alle categorie.',
                footer: (
                  <>
                    <strong>Indicatori per valuta:</strong> Entrate, Spese, Saldo e Tasso di risparmio (saldo ÷ entrate).
                  </>
                ),
              },
              {
                tag: 'Scheda 02',
                title: 'Spese',
                body: 'Include i soli addebiti classificati come spesa — lasciando fuori giroconti e movimenti interni — con ciambella o barre orizzontali in Composizione, oppure barre affiancate/impilate in Andamento.',
                footer: (
                  <>
                    <strong>Dettaglio immediato:</strong> Seleziona uno spicchio con nome, una riga della legenda o una
                    barra per aprire i movimenti più recenti.
                  </>
                ),
              },
              {
                tag: 'Scheda 03',
                title: 'Entrate',
                body: 'Si concentra sui soli accrediti classificati come entrata con la stessa esclusione dei giroconti, raggruppabili per categoria, controparte o conto su mesi, trimestri o anni.',
                footer: (
                  <>
                    <strong>Grafici leggibili:</strong> Restano visibili i dieci gruppi principali mentre i restanti
                    confluiscono in <strong>Altro</strong>.
                  </>
                ),
              },
            ]}
          />
        </div>
      </Section>

      {/* 3. FILTERS, SAVED VIEWS & CSV */}
      <Section id="workflow">
        <SectionHead
          kicker="Filtri ed esportazione"
          title="Arriva alla risposta esatta, salva la vista o esporta il CSV."
          subtitle="I Report lavorano in sola lettura sul tuo registro, così puoi filtrare periodi, tag e controparti senza toccare nessun movimento."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Filtri granulari e fino a 20 viste salvate</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Intervalli relativi o date personalizzate</strong>
                  <span>
                    Scegli scorciatoie come ultimi 30 giorni, questo mese, quest’anno o ultimi 12 mesi, oppure date
                    iniziali e finali esatte. Gli intervalli relativi si aggiornano all’apertura, così{' '}
                    <strong>Questo mese</strong> segue sempre il mese corrente.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Raggruppa e filtra su più dimensioni</strong>
                  <span>
                    Raggruppa per categoria, gruppo di categorie, controparte o conto; scegli frequenza mensile,
                    trimestrale o annuale in Andamento; filtra per conti, categorie, tag (corrispondenza con almeno un
                    tag selezionato) e importi minimi/massimi.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Salva, ripristina, rinomina o elimina viste</strong>
                  <span>
                    Conserva fino a 20 configurazioni in <strong>Report salvati</strong>. Il salvataggio memorizza solo
                    i parametri del report, senza duplicare i movimenti.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Rigore valutario ed export CSV</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  FX
                </span>
                <div>
                  <strong>Sezioni separate per ogni valuta</strong>
                  <span>
                    EUR, USD e altre valute restano sempre separate in totali, grafici, elenchi di dettaglio ed export.
                    Usa il filtro dei conti quando vuoi concentrarti su una valuta o su un istituto specifico.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  CSV
                </span>
                <div>
                  <strong>Export aggregato pronto per i fogli di calcolo</strong>
                  <span>
                    <strong>Esporta CSV</strong> scarica serie temporali e totali di composizione come{' '}
                    <code>report-&lt;scheda&gt;-&lt;dal&gt;-&lt;al&gt;.csv</code>, usando il punto e virgola nelle
                    lingue con virgola decimale e la virgola in quelle con punto decimale.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--vermilion" aria-hidden="true">
                  HIDE
                </span>
                <div>
                  <strong>Le transazioni nascoste restano escluse</strong>
                  <span>
                    Qualsiasi movimento marcato <strong>Nascosta dai report</strong> (a mano o tramite regola di
                    categorizzazione automatica) non entra mai nei totali né nel dettaglio.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>Totali aggregati vs backup completo:</strong> il CSV dei Report esporta serie temporali e totali
              aggregati, non le singole righe del dettaglio. Per una copia completa dei tuoi dati grezzi richiedi
              l’export JSON completo dalle <strong>Impostazioni</strong>.
            </div>
          </div>
        </div>
      </Section>

      {/* 4. FIT CHECK */}
      <Section id="fit" tone="parchment">
        <SectionHead
          kicker="Verifica trasparente"
          title="Per chi sono pensati i Report — e cosa lasciano fuori per scelta."
        />

        <FitCheck
          yesTitle="Fa per te se…"
          yesItems={[
            'Gestisci una famiglia o un’attività freelance su più conti e vuoi tenere i giroconti fuori dalle spese.',
            'Vuoi viste salvate riapribili con un clic per controlli ricorrenti su spese mensili, entrate annuali o progetti con tag.',
            'Ti servono riepiloghi CSV puliti per valuta da condividere con il commercialista o aprire in un foglio di calcolo.',
            'Vuoi passare con un clic da una barra o da uno spicchio del grafico ai movimenti contabilizzati sottostanti.',
          ]}
          noTitle="Non fa per te se…"
          noItems={[
            'Ti aspetti conversioni valutarie automatiche che sommino EUR e USD nello stesso grafico.',
            'Cerchi l’elenco grezzo di ogni movimento dentro il CSV dei Report (usa l’export JSON in Impostazioni per il backup integrale).',
            'Ti servono bilanci fiscali formali o contabilità in partita doppia per una società.',
          ]}
        />
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        tone="cotton"
        kicker="FAQ sui Report"
        title="Domande su export CSV, valute e viste salvate."
        subtitle="Ogni dettaglio corrisponde all’implementazione dei Report rilasciata in v0.1.0."
        moreLink={{ href: '/it/domande-frequenti', label: 'Leggi tutte le FAQ →' }}
        items={reportsItFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Continua a esplorare"
        title="Altre parti collegate di Tracky."
        items={[
          {
            kicker: 'Funzione · Demo + Self-host',
            title: 'Piano zero-based e target',
            description: 'Report e Piano condividono le stesse categorie globali: categorizzi una volta e restano allineati entrambi.',
            href: '/it/funzioni/piano-zero-based',
            linkLabel: 'Scopri il Piano →',
          },
          {
            kicker: 'Funzione · Demo + Self-host',
            title: 'Calendario Flusso di cassa',
            description: 'I Report guardano indietro a ciò che è accaduto; il Flusso di cassa proietta le scadenze future sui saldi osservati.',
            href: '/it/funzioni/flusso-di-cassa',
            linkLabel: 'Scopri il Flusso di cassa →',
          },
          {
            kicker: 'Confronto',
            title: 'Tracky vs fogli di calcolo',
            description: 'Mantieni la portabilità del CSV eliminando formule fragili, controlli duplicati manuali e tabelle pivot rotte.',
            href: '/it/vs-fogli-di-calcolo',
            linkLabel: 'Leggi il confronto →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Totali puliti per valuta, pronti da leggere o esportare."
        meta="Demo ospitata a €0 · Tutte e 3 le schede Report ed export CSV inclusi · Senza carta"
        primaryCta={
          <B2AppCta
            auth={auth}
            locale="it"
            loggedInHref="/app/reports"
            loggedInLabel="Apri i Report →"
            loggedOutLabel="Prova gratis la demo →"
            variant="marigold"
          />
        }
        secondaryCta={
          <a className="mka-btn-outline-light" href="/it/prezzi">
            Confronta Demo vs Self-host →
          </a>
        }
      />
    </AtelierSite>
  );
}
