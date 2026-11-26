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

export const zeroBasedPlanItFaq: Array<FaqItem> = [
  {
    q: 'Devo portare Da assegnare esattamente a zero fin da subito?',
    a: 'No, anche se arrivare a zero è l’obiettivo verso cui lavori. Un valore positivo in Da assegnare indica liquidità osservata che non ha ancora un compito, e il denaro senza destinazione tende a uscire in spese non scelte. Puoi fermarti, spostare fondi tra bucket o verificare l’anteprima dell’Assegnazione automatica prima di confermare.',
  },
  {
    q: 'Perché le entrate non compaiono come Attività dentro un bucket?',
    a: 'Le entrate finanziano il Piano invece di risultare come spesa negativa. Le trovi in Da assegnare e nel relativo dettaglio insieme a riporto, accrediti, assegnazioni, riserve delle money box e scoperto liquido. I bucket registrano solo spese contabilizzate e rimborsi nelle rispettive categorie.',
  },
  {
    q: 'Qual è la differenza tra scoperto liquido e scoperto a credito?',
    a: 'Lo scoperto liquido significa che il denaro è già uscito da un conto liquido: lo copri spostando Disponibile da un altro bucket, altrimenti il mese successivo riduce Da assegnare. Lo scoperto a credito è un acquisto con carta privo di copertura: non è uscita liquidità, ma il debito è cresciuto e va finanziato nel bucket di pagamento della carta prima dell’estratto.',
  },
  {
    q: 'Come gestiscono i target le spese annuali?',
    a: 'Imposta un target annuale con data di scadenza e comportamento Rabbocca fino a. Ogni mese Tracky calcola il fabbisogno residuo in base a quanto è già disponibile e al tempo rimasto, aggiornando automaticamente la quota se salti un mese. Le spese ricorrenti mensili usano Mensile con Rabbocca fino a, mentre i fondi da accumulare usano Metti da parte altri.',
  },
  {
    q: 'Le money box collegate spostano soldi reali e i rilevamenti delle sottoscrizioni sono certi?',
    a: 'No in entrambi i casi. Una money box (salvadanaio virtuale) collegata compare come Già accantonato, viene riletta ogni mese per ridurre il target del bucket senza diventare una nuova assegnazione né muovere denaro in banca. I rilevamenti delle sottoscrizioni restano suggerimenti finché non confermi esercente, importo e cadenza.',
  },
];

export const Route = createFileRoute('/it/funzioni/piano-zero-based')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Piano zero-based: dai un lavoro a ogni euro · Tracky',
      description:
        'Assegna la liquidità osservata ai bucket finché Da assegnare arriva a zero. Target, Assegnazione automatica, bucket carte e una sola valuta.',
      locale: 'it',
      path: '/it/funzioni/piano-zero-based',
      ogImage: ogImageFor('feature-plan'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/piano-zero-based', inLanguage: ['it', 'en'] }),
        faqJsonLd(zeroBasedPlanItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Piano zero-based', path: '/it/funzioni/piano-zero-based' },
        ]),
      ],
    }),
  component: PlanIt,
});

function PlanIt() {
  const auth = Route.useLoaderData();
  return <ZeroBasedPlanItView auth={auth} />;
}

export function ZeroBasedPlanItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/funzioni/piano-zero-based">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[{ label: 'Home', href: '/it/' }, { label: 'Piano zero-based' }]}
            />

            <div className="mka-b2-hero-badges">
              <ScopePill scope="both" label="Demo + Self-host" />
              <Chip tone="marigold">€0 oggi</Chip>
              <Chip>Una valuta per Piano</Chip>
              <Chip>Nessun doppio conteggio</Chip>
            </div>

            <h1 className="mka-hero-headline">
              Dai a ogni euro già presente nei tuoi conti <span className="mka-accent-ink">un lavoro prima di spenderlo.</span>
            </h1>

            <p className="mka-hero-dek">
              Il Piano zero-based di Tracky lavora esclusivamente sulla liquidità già osservata nei tuoi conti — mai su
              stipendi futuri né sui plafond delle carte di credito. Distribuisci i fondi nei bucket finché{' '}
              <strong>Da assegnare</strong> arriva a zero, con bucket protetti per le carte e riporto trasparente mese
              su mese.
            </p>

            <div className="mka-hero-actions">
              <B2AppCta
                auth={auth}
                locale="it"
                loggedInHref="/app/plan"
                loggedInLabel="Apri il Piano →"
                loggedOutLabel="Prova il Piano nella demo →"
              />
              <a className="mka-btn-secondary" href="/it/guide/budget-zero-based">
                Leggi la guida in 5 passi →
              </a>
            </div>

            <p className="mka-hero-meta">
              <span>Funziona nella demo ospitata</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Conti manuali e CSV nel browser</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Senza carta di credito</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. AVAILABILITY & THREE COLUMNS */}
      <Section id="overview" tone="parchment">
        <SectionHead
          kicker="Disponibilità e struttura"
          title="Tre colonne per ogni bucket — disponibili sia nella demo ospitata sia in self-host."
          subtitle="Ogni Piano usa una sola valuta e organizza le categorie globali delle transazioni in gruppi e bucket ordinati."
        />

        <B2AvailabilityBand
          demoTone="sage"
          demoBadge="Incluso a €0"
          demoTitle="Demo ospitata (trytracky.app)"
          demoBody="L’intero Piano zero-based — bucket, target, anteprime di Assegnazione automatica, bucket di pagamento carta e money box collegate — funziona subito con conti manuali e import CSV. Il piano Gratis include un Piano; i Piani multipli sono riservati al livello Pro (non in vendita)."
          selfHostTone="sage"
          selfHostBadge="Incluso · MIT"
          selfHostTitle="Self-hosted Docker"
          selfHostBody="Esegue lo stesso motore del Piano sul tuo volume Convex locale con zero telemetria, più la sincronizzazione bancaria PSD2 opzionale se configuri le tue chiavi Enable Banking."
        />

        <div style={{ marginTop: '1.75rem' }}>
          <B2PillarGrid
            items={[
              {
                tag: 'Colonna 01',
                title: 'Assegnato',
                body: 'La liquidità osservata che destini a un bucket nel mese selezionato. Puoi modificarla al volo o spostare fondi tra bucket senza alterare il totale Assegnato.',
                footer: (
                  <>
                    <strong>Regola:</strong> Finanziato solo da <strong>Da assegnare</strong>, mai da plafond carta o
                    fidi bancari.
                  </>
                ),
              },
              {
                tag: 'Colonna 02',
                title: 'Attività',
                body: 'Saldo netto di spese contabilizzate e rimborsi nelle categorie associate al bucket. Seleziona qualsiasi importo per aprire i movimenti corrispondenti.',
                footer: (
                  <>
                    <strong>Esclusi:</strong> Entrate, giroconti, movimenti interni, voci non contabilizzate e altre
                    valute non falsano l’Attività.
                  </>
                ),
              },
              {
                tag: 'Colonna 03',
                title: 'Disponibile',
                body: (
                  <>
                    Ciò che resta nel bucket: <code>riporto positivo + Assegnato + Attività</code>. Un Disponibile
                    positivo passa al mese successivo per accumulare fondi annuali senza sforzo.
                  </>
                ),
                footer: (
                  <>
                    <strong>Nessun rosso trascinato:</strong> Lo scoperto liquido non si riporta nel bucket, ma riduce
                    il Da assegnare del mese dopo finché non lo copri.
                  </>
                ),
              },
            ]}
          />
        </div>
      </Section>

      {/* 3. ACCOUNTING GUARDRAILS */}
      <Section id="accounting">
        <SectionHead
          kicker="Regole contabili"
          title="Liquidità reale, debiti carta separati e zero euro non spiegati."
          subtitle="Il budget zero-based si rompe quando i plafond sembrano contanti o i trasferimenti contano due volte. Tracky impone confini chiari nel codice."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Da assegnare e data di partenza pulita</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Entrate reali, mai avanzi dedotti</strong>
                  <span>
                    Apri Da assegnare per verificare riporto, entrate, credito prelevato da carte, movimenti precedenti
                    all’avvio, trasferimenti oltre perimetro, assegnazioni, riserve e scoperto liquido.{' '}
                    <strong>Movimenti non spiegati</strong> deve restare a zero: un valore diverso segnala una riga
                    ancora da attribuire.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Origine del Piano e Ricomincia da qui</strong>
                  <span>
                    Ogni Piano parte dal giorno in cui lo crei: i movimenti precedenti restano nei saldi senza creare
                    Attività né scoperti. Dopo un import dello storico puoi usare <strong>Ricomincia da qui</strong>{' '}
                    mantenendo intatti gruppi, bucket, target e assegnazioni.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Scoperti di conto senza doppi conteggi</strong>
                  <span>
                    Se un conto corrente è in rosso, un avviso mostra scoperto e ritmo di rientro. Il fido non è denaro
                    da assegnare e non serve un bucket di rientro: ogni euro di nuove entrate lasciato non assegnato
                    riduce automaticamente lo scoperto.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--vermilion" aria-hidden="true">
                  04
                </span>
                <div>
                  <strong>Non pianificato raccoglie le categorie non mappate</strong>
                  <span>
                    Le categorie non ancora collocate in un bucket finiscono nella riga di sistema{' '}
                    <strong>Non pianificato</strong> quando hanno Attività, così nessuna spesa reale sparisce. Da lì le
                    associ a un bucket esistente o ne crei uno nuovo.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Carte, rate e money box virtuali</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  CARD
                </span>
                <div>
                  <strong>Bucket protetti di pagamento carta</strong>
                  <span>
                    Saldi e plafond delle carte restano fuori dalla liquidità. Gli acquisti coperti spostano
                    automaticamente la somma nel bucket di pagamento carta in attesa dell’estratto. Registrare il
                    trasferimento dell’estratto chiude il ciclo senza contare due volte la spesa.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  RATE
                </span>
                <div>
                  <strong>Bucket dedicati alle rate attive</strong>
                  <span>
                    Ogni piano rateale attivo riceve un bucket protetto con la rata del mese. Se un prestito è associato
                    a una tua categoria, Tracky usa direttamente quella categoria senza creare una riga duplicata.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  BOX
                </span>
                <div>
                  <strong>Money box collegate come Già accantonato</strong>
                  <span>
                    Collega una money box (salvadanaio virtuale) idonea a un bucket ordinario per mostrare il saldo
                    salvato come <strong>Già accantonato</strong>. Riduce il target in modo equo senza diventare una
                    nuova assegnazione e viene riletta ogni mese per evitare doppi conteggi.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>Una sola valuta per Piano:</strong> Tracky non mescola mai EUR, USD o altre valute nello stesso
              Piano e non inventa tassi di cambio. Un giroconto confermato tra due conti liquidi dello stesso Piano
              resta neutro anche se contabilizzato in mesi diversi.
            </div>
          </div>
        </div>
      </Section>

      {/* 4. TARGETS & AUTO-ASSIGN */}
      <Section id="workflow" tone="parchment">
        <SectionHead
          kicker="Flusso mensile"
          title="Target, anteprime di Assegnazione automatica e viste focalizzate."
          subtitle="Chiudi il mese più velocemente senza cedere il controllo: ogni strumento mostra l’anteprima dei numeri prima di salvare."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Target e Cost to Be Me</h3>
            <p>
              Imposta target <strong>Settimanali</strong>, <strong>Mensili</strong>, <strong>Annuali</strong> o{' '}
              <strong>Personalizzati</strong> su qualsiasi bucket. Scegli <em>Metti da parte altri</em> per accumulare
              verso spese irregolari, <em>Rabbocca fino a</em> per mantenere un tetto ricorrente, oppure{' '}
              <em>Raggiungi un saldo entro la scadenza</em> per obiettivi una tantum. Puoi mettere in pausa un target
              nel mese corrente senza eliminarlo.
            </p>
            <p>
              <strong>Cost to Be Me</strong> somma i target del mese e li confronta con il reddito previsto salvato nel
              Piano, evidenziando subito l’eventuale margine o ammanco — senza mai spostare denaro in automatico.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Assegnazione automatica e viste focalizzate</h3>
            <p>
              <strong>Assegnazione automatica</strong> prepara proposte basate su <em>Sotto-finanziato</em>,{' '}
              <em>Assegnato il mese scorso</em>, <em>Speso il mese scorso</em>, <em>Media assegnata</em>,{' '}
              <em>Azzera assegnato</em> o <em>Azzera disponibile</em> sui bucket selezionati o su tutti quelli visibili.
              Prima di confermare vedi sempre righe proposte, totale e nuovo Da assegnare.
            </p>
            <p>
              Filtra la griglia con le viste <strong>Sotto-finanziati</strong>, <strong>In rosso</strong>,{' '}
              <strong>In pausa</strong>, <strong>Con disponibilità</strong> e <strong>Nascosti</strong>, oppure
              riordina gruppi e bucket da <strong>Modifica Piano</strong> con mouse o tastiera.
            </p>
          </article>
        </div>
      </Section>

      {/* 5. FIT CHECK */}
      <Section id="fit">
        <SectionHead
          kicker="Verifica trasparente"
          title="Quando il Piano zero-based fa la differenza — e quando richiede troppo coinvolgimento."
        />

        <FitCheck
          yesTitle="Fa per te se…"
          yesItems={[
            'Preferisci decidere prima dove va la liquidità reale invece di scoprire a fine mese come è stata spesa.',
            'Vuoi finanziare mese per mese spese annuali, rate ed estratti conto delle carte senza sorprese.',
            'Usi money box virtuali accanto ai target e vuoi vedere Già accantonato scalare automaticamente.',
            'Cerchi rigore su una sola valuta, con giroconti e plafond carta tenuti fuori dal contante.',
          ]}
          noTitle="Probabilmente non fa per te se…"
          noItems={[
            'Preferisci tetti mensili passivi impostati una volta sola e mai rivisti.',
            'Vuoi assegnare in anticipo stipendi futuri non ancora arrivati sul conto.',
            'Ti serve un budget unico che fonda valute diverse con cambi automatici.',
            'Cerchi più Piani separati sul piano Gratis oggi (i Piani multipli sono riservati a Pro, non ancora in vendita).',
          ]}
        />
      </Section>

      {/* 6. FAQ */}
      <FaqSection
        id="faq"
        tone="parchment"
        kicker="FAQ sul Piano zero-based"
        title="Domande frequenti su bucket, carte e target."
        subtitle="Risposte allineate alle regole contabili del Piano rilasciate in v0.1.0."
        moreLink={{ href: '/it/domande-frequenti', label: 'Leggi tutte le FAQ →' }}
        items={zeroBasedPlanItFaq}
      />

      {/* 7. RELATED LINKS */}
      <B2RelatedSection
        tone="cotton"
        kicker="Continua a esplorare"
        title="Approfondimenti collegati al Piano."
        items={[
          {
            kicker: 'Guida passo passo',
            title: 'Come creare un budget zero-based',
            description: 'Cinque passi pratici dal conto manuale e import CSV fino al primo mese chiuso a zero.',
            href: '/it/guide/budget-zero-based',
            linkLabel: 'Leggi la guida →',
          },
          {
            kicker: 'Funzione · Demo + Self-host',
            title: 'Calendario Flusso di cassa',
            description: 'Affianca al Piano finanziato bollette datate, stipendi, sottoscrizioni ed estratti carta per leggere la prima data negativa.',
            href: '/it/funzioni/flusso-di-cassa',
            linkLabel: 'Scopri il Flusso di cassa →',
          },
          {
            kicker: 'Funzione · Demo + Self-host',
            title: 'Report ed export CSV per valuta',
            description: 'Analizza diagramma Sankey, Spese ed Entrate per mese, trimestre o anno con viste salvate.',
            href: '/it/funzioni/report',
            linkLabel: 'Scopri i Report →',
          },
        ]}
      />

      {/* 8. FINAL CTA */}
      <FinalCta
        headline="Dai un lavoro a ogni euro prima che inizi il mese."
        meta="Demo ospitata a €0 · Piano zero-based incluso · Senza carta di credito"
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
          <a className="mka-btn-outline-light" href="/it/prezzi">
            Confronta Demo vs Self-host →
          </a>
        }
      />
    </AtelierSite>
  );
}
