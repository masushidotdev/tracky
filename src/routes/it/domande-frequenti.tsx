import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { FaqItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  FaqSection,
  FinalCta,
  GITHUB_REPO_URL,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { RelatedLinksSection } from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const faqItItems: Array<FaqItem> = [
  {
    q: 'Tracky costa davvero €0 e non nasconde una prova a scadenza?',
    a: 'Sì. Oggi sia la demo ospitata sia il codice con licenza MIT costano €0, senza carta di credito e senza timer di prova. Nel codice è riservato un piano Pro per limiti giornalieri più alti dell’Analyst AI (100 messaggi invece di 20), più Piani e scenari Forecast pluriennali, ma la fatturazione non esiste ancora e in Tracky non c’è alcun checkout.',
  },
  {
    q: 'Devo collegare il mio conto bancario?',
    a: 'No. Conti manuali correnti, di risparmio, carte, prestiti, investimenti e asset insieme all’import CSV nel browser sui conti manuali liquidi e carte coprono l’intero flusso di budget. La sincronizzazione bancaria PSD2 tramite Enable Banking è opzionale e funziona solo sulle istanze self-hosted in cui configuri la tua app e le tue chiavi Enable Banking (la sincronizzazione automatica viene valutata ogni sei ore); sulla demo ospitata resta disattivata.',
  },
  {
    q: 'L’Analyst AI è attivo nella demo ospitata?',
    a: 'No. L’Analyst AI è controllato da flag di ambiente e resta disattivato nella demo ospitata, dove le relative voci di menu restano nascoste. Su un’istanza self-hosted in cui lo abiliti con la tua chiave AI gateway, legge il tuo registro autorizzato, spiega gli andamenti e mostra un’anteprima da approvare prima di ogni scrittura sensibile. Usalo come strumento esplorativo, mai come consulenza finanziaria.',
  },
  {
    q: 'Tracky va bene per coppie o freelance?',
    a: 'Sì, tenendo presente che è uno spazio di lavoro singolo. Tracky ricava l’utente dalla sessione e oggi non offre login separati multi-utente. Un unico titolare può comunque gestire un Piano familiare da rivedere insieme allo stesso tavolo, oppure separare conti personali e da freelance, inserire le scadenze fiscali come voci pianificate nel Flusso di cassa ed esportare CSV aggregati per valuta dai Report o un backup JSON completo.',
  },
  {
    q: 'Di chi sono i miei dati e come funzionano export e cancellazione?',
    a: 'Tuoi. Puoi scaricare CSV aggregati per valuta dai Report in qualsiasi momento, oppure richiedere un export JSON completo versione 3 dalle Impostazioni (con impostazioni e testo delle memorie dell’Analyst inclusi, embedding esclusi). Confermare Elimina account nelle Impostazioni avvia la cancellazione immediata e irreversibile; inoltre puoi ispezionare o auto-ospitare il codice MIT. Ogni valuta resta separata e non viene mai convertita silenziosamente.',
  },
  {
    q: 'Come inizio a usare Tracky?',
    a: 'Apri la demo ospitata, crea un conto manuale nella sua valuta e importa un CSV bancario con mappatura delle colonne e rilevamento duplicati, elaborato localmente nel browser. Controlla le categorie e gli eventuali suggerimenti sulle sottoscrizioni, imposta il primo Piano zero-based finché Da assegnare arriva a zero e aggiungi le scadenze note nel Flusso di cassa.',
  },
  {
    q: 'Cosa cambia se uso Tracky in self-hosting con Docker?',
    a: 'Le regole contabili, i conti manuali, l’import CSV nel browser, la logica del Piano zero-based, i Report e la proprietà dei dati funzionano allo stesso modo. Il self-hosting esegue l’app TanStack Start e il backend Convex in locale su Docker con telemetria di prodotto disattivata a tempo di build, mentre WorkOS AuthKit rimane un servizio esterno di accesso. Le integrazioni opzionali — Enable Banking, Analyst AI, Resend e Telegram — restano spente finché non inserisci le tue chiavi. Controlla le Impostazioni per lo stato dei provider e il piano attivo.',
  },
  {
    q: 'Le proiezioni del Flusso di cassa e di Forecast sono garantite?',
    a: 'No. Il Flusso di cassa di ciclo, gli scenari Forecast e le proiezioni di lungo periodo dell’Analyst sono stime di pianificazione costruite su saldi registrati, scadenze datate e ipotesi esplicite — mai garanzie né consulenza finanziaria. Verifica sempre le ipotesi e l’ultimo aggiornamento prima di agire. Gli scenari Forecast pluriennali e le proiezioni di lungo periodo sono riservati al piano Pro e gli upgrade a pagamento non sono ancora disponibili.',
  },
];

export const Route = createFileRoute('/it/domande-frequenti')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Domande frequenti — Risposte chiare su Tracky',
      description:
        'Risposte chiare su Tracky: €0 oggi, conti manuali e import CSV, limiti tra demo e self-host, spazio singolo, proprietà dei dati e proiezioni.',
      locale: 'it',
      path: '/it/domande-frequenti',
      ogImage: ogImageFor('faq'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/domande-frequenti', inLanguage: ['it', 'en'] }),
        faqJsonLd(faqItItems.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'FAQ', path: '/it/domande-frequenti' },
        ]),
      ],
    }),
  component: FaqIt,
});

function FaqIt() {
  const auth = Route.useLoaderData();
  return <FaqItView auth={auth} />;
}

export function FaqItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/domande-frequenti">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb ariaLabel="Percorso di navigazione" items={[{ label: 'Home', href: '/it/' }, { label: 'FAQ' }]} />

            <ChipRow>
              <Chip tone="marigold">€0 oggi</Chip>
              <Chip>Banca non richiesta</Chip>
              <Chip tone="cobalt">Open source MIT</Chip>
              <Chip tone="sage">Dati tuoi</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Risposte chiare prima di <span className="mka-accent-ink">affidare il tuo registro a Tracky.</span>
            </h1>

            <p className="mka-hero-dek">
              Nessuna nebbia di marketing: cosa costa (nulla oggi), cosa richiede un collegamento bancario (nulla), cosa
              resta spento sulla demo ospitata (sync PSD2 e Analyst AI) e come i tuoi dati restano esportabili e
              cancellabili. Ogni risposta rispecchia il codice e la documentazione rilasciati in v0.1.0.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/it/prezzi">
                Confronta Demo vs Self-host →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. AT A GLANCE */}
      <Section id="overview" tone="parchment">
        <SectionHead
          kicker="Orientamento rapido"
          title="Cosa funziona ovunque — e cosa dipende dalla tua installazione."
          subtitle="Parti dal confine che ti interessa di più. Il ciclo di budget è identico tra demo ospitata e self-host Docker; le integrazioni di terze parti dipendono dalle credenziali dell’istanza."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Incluso ovunque (Demo + Self-host)</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Conti manuali e import CSV nel browser</strong>
                  <span>
                    Conti correnti, risparmio, carte, prestiti, investimenti e asset. I CSV bancari vengono elaborati in
                    locale nel browser con salto duplicati; il file originale non viene mai caricato.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Piano zero-based, Flusso di cassa e Report</strong>
                  <span>
                    Da assegnare, Assegnato/Attività/Disponibile, bucket per le carte, scadenze datate, Disponibile dopo
                    le spese, grafici Sankey e trend, Obiettivi e money box virtuali.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Export e cancellazione immediata</strong>
                  <span>
                    Export CSV aggregati per valuta dai Report, export JSON completo (versione 3) dalle Impostazioni e
                    cancellazione immediata e irreversibile dell’account quando vuoi.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Configurabile sull’istanza (Solo self-host)</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  PSD2
                </span>
                <div>
                  <strong>Sincronizzazione bancaria Enable Banking</strong>
                  <span>
                    Disattivata sulla demo ospitata. Sulla tua istanza colleghi la tua app ID e chiave PEM Enable
                    Banking; la sincronizzazione automatica viene valutata ogni sei ore.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  AI
                </span>
                <div>
                  <strong>Analyst AI con approvazione, Resend e Telegram</strong>
                  <span>
                    Disattivati sulla demo ospitata. In self-host si attivano con le tue chiavi AI gateway, Resend e il
                    bot Telegram verificato. Ogni scrittura sensibile attende la tua approvazione.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>Controlla lo stato reale quando vuoi:</strong> apri <strong>Impostazioni</strong> dentro l’app per
              verificare il piano attivo (Gratis o Pro riservato), il limite giornaliero dell’Analyst e quali provider
              risultano configurati sulla tua istanza.
            </div>
          </div>
        </div>
      </Section>

      {/* 3. FULL FAQ */}
      <FaqSection
        id="questions"
        kicker="Tutte le otto domande"
        title="Costi, collegamenti, privacy e aspettative realistiche."
        subtitle="Leggi le prime sei domande per l’uso quotidiano nella demo ospitata e le ultime due per il self-hosting Docker e i limiti delle proiezioni."
        items={faqItItems}
        defaultOpenFirst
      />

      {/* 4. HOW TO VERIFY */}
      <Section id="verify" tone="parchment">
        <SectionHead
          kicker="Verifica di persona"
          title="Come usare queste FAQ insieme all’app e al repository."
          subtitle="Non serve fidarsi sulla parola: ogni affermazione corrisponde a una schermata della demo o a un file pubblico su GitHub."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Parti dalla domanda che ti frena</h3>
            <p>
              Se il tuo dubbio riguarda costi, collegamento bancario o confini della demo, apri la demo ospitata senza
              configurare nulla e prova subito conti manuali, anteprima CSV nel browser, bucket del Piano zero-based e
              Flusso di cassa datato. Nulla richiede una carta o l’accesso alla banca.
            </p>
            <p>
              Quando una risposta descrive una regola — per esempio che il plafond delle carte resta fuori dalla
              liquidità spendibile o che le valute non vengono mai mescolate — puoi verificarla nel tuo spazio di prova.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Stime di pianificazione, mai consulenza finanziaria</h3>
            <p>
              Il calendario del Flusso di cassa, i suggerimenti sulle sottoscrizioni e gli scenari Forecast riservati a
              Pro sono calcolati esclusivamente a partire da saldi registrati, voci datate e ipotesi esplicite. Leggi
              ogni proiezione come stima e confrontala sempre con i saldi della tua banca prima di decidere.
            </p>
            <p>
              Per i dettagli sul self-hosting — inclusi Docker Compose, flag di build senza telemetria e il requisito
              esterno di WorkOS AuthKit — leggi la guida Docker passo passo o esplora il repository.
            </p>
          </article>
        </div>
      </Section>

      {/* 5. RELATED LINKS */}
      <RelatedLinksSection
        kicker="Approfondisci"
        title="Dove continuare."
        items={[
          {
            kicker: 'Prezzi',
            title: 'Demo ospitata €0 vs self-host MIT',
            description: 'Tabella completa di funzionalità, confronto Gratis vs Pro riservato e requisiti di avvio.',
            href: '/it/prezzi',
            ctaLabel: 'Leggi i prezzi →',
          },
          {
            kicker: 'Open source',
            title: 'Architettura, licenza MIT e self-hosting',
            description: 'Esplora lo stack Convex + TanStack Start, le regole di sicurezza e i due modi di esecuzione.',
            href: '/it/open-source',
            ctaLabel: 'Leggi Open Source →',
          },
          {
            kicker: 'Guida Docker',
            title: 'Self-hosting di Tracky con Docker Compose',
            description: 'Comandi esatti dello script di setup, backfill locale, reverse proxy TLS, backup e limiti.',
            href: '/it/blog/self-hosting-tracky-docker',
            ctaLabel: 'Leggi la guida Docker →',
          },
        ]}
      />

      {/* 6. FINAL CTA */}
      <FinalCta
        headline="Ancora un dubbio? Apri il registro e controlla di persona."
        meta="Demo ospitata €0 · Senza carta · Open source MIT"
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
