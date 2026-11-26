import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { FaqItem, MarketingAuth } from '@/components/marketing/atelier';
import {
  AtelierSite,
  Breadcrumb,
  Chip,
  CodePlate,
  FaqSection,
  FinalCta,
  FitCheck,
  GITHUB_REPO_URL,
  ScopePill,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { B2AppCta, B2AvailabilityBand, B2RelatedSection } from '@/components/marketing/atelier/b2-sections';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const aiAnalystItFaq: Array<FaqItem> = [
  {
    q: 'L’Analyst AI può modificare il mio registro senza chiedermi conferma?',
    a: 'No. Ogni scrittura sensibile — assegnazioni o target del Piano, spostamenti nelle money box virtuali, voci pianificate, aggiornamenti di memoria o ricategorizzazioni multiple — arriva come anteprima con importo, valuta, conto, categoria, data e ricorrenza e attende la tua approvazione esplicita. I badge di rischio (sicuro, conferma, blocca) sono solo indicativi e non saltano mai l’approvazione; rifiutare lascia i dati invariati.',
  },
  {
    q: 'Perché l’Analyst AI è disattivato sulla demo ospitata?',
    a: 'L’Analyst AI è abilitato per ambiente e richiede le tue credenziali AI gateway su un’istanza self-hosted. Sulla demo ospitata le voci nella barra laterale e nella palette comandi sono nascoste e aprire /app/analyst mostra Funzionalità disabilitata. Budget, Flusso di cassa, Report e promemoria in-app restano invece pienamente attivi nella demo.',
  },
  {
    q: 'Le proiezioni dell’Analyst sono consulenza finanziaria o garanzie?',
    a: 'No. L’Analyst è uno strumento esplorativo, mai consulenza finanziaria. Le proiezioni FIRE e pensione di lungo periodo (riservate al piano Pro, non in vendita oggi) sono stime nominali ricavate dai saldi tracciati, dal Flusso di cassa recente e da ipotesi dichiarate modificabili in chat: confronta più scenari e verifica sempre le decisioni sui tuoi contratti.',
  },
  {
    q: 'Come funzionano promemoria delle bollette, notifiche finanziarie e canali esterni?',
    a: 'I promemoria nascono dalle spese pianificate in stato planned o funding con fino a quattro soglie di anticipo (tre giorni di default, da 0 a 30 giorni) e deduplica per scadenza. Le notifiche su Piano, sottoscrizioni, flusso di cassa e sync vengono valutate ogni sei ore e arrivano prima nella casella in-app. Email (Resend) e Telegram restano spenti finché non li attivi esplicitamente con le tue chiavi.',
  },
  {
    q: 'Come collego Telegram alla mia istanza self-hosted?',
    a: 'Generi un comando monouso nelle Impostazioni e lo invii privatamente al bot configurato. Il codice scade dopo dieci minuti e funziona una sola volta: non condividerlo. Puoi scollegare Telegram quando vuoi e le richieste che richiedono approvazione continuano a dichiararlo esplicitamente.',
  },
];

export const Route = createFileRoute('/it/funzioni/analyst-ai')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Analyst AI: strumento esplorativo self-hosted con approvazione · Tracky',
      description:
        'Interroga il tuo registro in linguaggio naturale con scritture approvate e avvisi opzionali via email o Telegram. Solo self-host; disattivato sulla demo.',
      locale: 'it',
      path: '/it/funzioni/analyst-ai',
      ogImage: ogImageFor('feature-analyst'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/analyst-ai', inLanguage: ['it', 'en'] }),
        faqJsonLd(aiAnalystItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Analyst AI', path: '/it/funzioni/analyst-ai' },
        ]),
      ],
    }),
  component: AnalystIt,
});

function AnalystIt() {
  const auth = Route.useLoaderData();
  return <AiAnalystItView auth={auth} />;
}

export function AiAnalystItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/funzioni/analyst-ai">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[{ label: 'Home', href: '/it/' }, { label: 'Analyst AI' }]}
            />

            <div className="mka-b2-hero-badges">
              <ScopePill scope="selfhost" label="Solo self-host" />
              <Chip>Disattivato sulla demo ospitata</Chip>
              <Chip tone="cobalt">Scritture approvate</Chip>
              <Chip>Non è consulenza finanziaria</Chip>
            </div>

            <h1 className="mka-hero-headline">
              Lui propone le modifiche. <span className="mka-accent-ink">Tu verifichi e approvi ognuna.</span>
            </h1>

            <p className="mka-hero-dek">
              L’Analyst AI di Tracky è uno strumento esplorativo abilitato per ambiente sulle istanze self-hosted:
              interroga in linguaggio naturale il tuo registro autorizzato, confronta scenari what-if e controlla le
              segnalazioni di anomalie. Ogni scrittura sensibile mostra un’anteprima completa e attende la tua conferma
              — mai autonomo, mai consulenza finanziaria.
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-primary mka-btn-primary--lg" href="/it/blog/self-hosting-tracky-docker">
                Self-host con Docker →
              </a>
              <B2AppCta
                auth={auth}
                locale="it"
                loggedInHref="/app"
                loggedInLabel="Apri la demo →"
                loggedOutLabel="Prova il budget nella demo →"
                variant="primary"
              />
            </div>

            <p className="mka-hero-meta">
              <span>Con la tua chiave AI gateway</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Piano Gratis: 20 messaggi/giorno se attivato</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Email e Telegram spenti di default</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. EXPLICIT AVAILABILITY */}
      <Section id="availability" tone="parchment">
        <SectionHead
          kicker="Dove gira"
          title="Abilitato per ambiente: spento sulla demo ospitata, opt-in in self-host."
          subtitle="Eseguire modelli AI e canali esterni di notifica richiede chiavi API di istanza che restano sotto il tuo controllo."
        />

        <B2AvailabilityBand
          demoTone="default"
          demoBadge="Disattivato sulla demo"
          demoTitle="Demo ospitata (trytracky.app)"
          demoBody={
            <>
              L’Analyst AI è disattivato sulla demo ospitata: le voci in barra laterale e palette comandi restano
              nascoste e <code>/app/analyst</code> mostra Funzionalità disabilitata. Promemoria bollette in-app e
              suggerimenti sulle sottoscrizioni restano invece disponibili nella demo.
            </>
          }
          selfHostTone="cobalt"
          selfHostBadge="Opzionale · Le tue chiavi"
          selfHostTitle="Self-hosted Docker (MIT)"
          selfHostBody={
            <>
              Ricompila l’immagine dell’app con <code>VITE_ANALYST_ENABLED=true</code> e configura{' '}
              <code>AI_GATEWAY_API_KEY</code> o <code>OPENROUTER_API_KEY</code> (più chiavi opzionali{' '}
              <code>RESEND_*</code> e <code>TELEGRAM_*</code>). Gratis include 20 messaggi/giorno; Pro (100/giorno e
              proiezioni FIRE) è riservato nel codice e non è in vendita.
            </>
          }
        />
      </Section>

      {/* 3. WHAT IT DOES VS NEVER DOES */}
      <Section id="boundaries">
        <SectionHead
          kicker="Confini chiari"
          title="Assistenza sotto controllo umano, mai pilota automatico."
          subtitle="L’esplorazione in sola lettura è immediata; qualsiasi modifica a Piano, money box, voci pianificate, memoria o categorie attende la tua conferma."
        />

        <FitCheck
          yesTitle="Cosa fa l’Analyst AI quando è abilitato"
          yesItems={[
            'Legge conti, transazioni, spesa, avanzamento del Piano, Flusso di cassa, money box, credito, sottoscrizioni e voci pianificate autorizzate.',
            'Spiega i pattern di spesa con grafici e tabelle e simula scenari what-if in più conversazioni rinominabili.',
            'Prepara proposte in anteprima per assegnazioni o target del Piano, money box, scadenze, aggiornamenti di memoria o ricategorizzazioni multiple, con badge di rischio indicativo (sicuro, conferma, blocca).',
            'Si affianca ai controlli automatici schedulati su anomalie di spesa, possibili duplicati, promemoria bollette e saldi proiettati bassi.',
          ]}
          noTitle="Cosa non fa mai l’Analyst AI"
          noItems={[
            'Non offre mai consulenza finanziaria, fiscale o d’investimento: ogni risposta resta uno strumento esplorativo.',
            'Non scrive mai modifiche sensibili nel registro in autonomia né salta la tua approvazione esplicita.',
            'Non disdice mai un abbonamento né autorizza un pagamento bancario al posto tuo.',
            'Non invia email né messaggi Telegram senza il tuo opt-in esplicito e il collegamento verificato del bot.',
          ]}
        />
      </Section>

      {/* 4. AUTOMATIONS, NOTIFICATIONS & SETUP */}
      <Section id="automations" tone="parchment">
        <SectionHead
          kicker="Automazioni e setup self-host"
          title="Controlli in background con cadenze trasparenti — e come attivarli."
          subtitle="Le notifiche deduplicano per scadenza e soglia, arrivando prima nella casella in-app e poi sugli eventuali canali esterni attivati."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Valutazioni schedulate e promemoria</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  6H
                </span>
                <div>
                  <strong>Valutazione ogni sei ore</strong>
                  <span>
                    La sincronizzazione automatica e le notifiche finanziarie vengono valutate ogni sei ore: bucket del
                    Piano almeno al 90% del finanziato (warning) o in rosso (critical), sottoscrizioni attive e rate in
                    scadenza entro sette giorni, prima data negativa del flusso di cassa e problemi di sync o consenso.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  1G
                </span>
                <div>
                  <strong>Controlli giornalieri su baseline e cicli carta</strong>
                  <span>
                    I job giornalieri chiudono i cicli carta in scadenza e calcolano health score e anomalie rispetto a
                    una baseline statistica. Solo gli scostamenti azionabili generano una notifica attiva; il resto resta
                    come digest silenzioso. Gli avvisi su rincari o abbonamenti dimenticati descrivono sempre le prove.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  SCAD
                </span>
                <div>
                  <strong>Promemoria bollette configurabili</strong>
                  <span>
                    Derivano dalle spese pianificate in stato <code>planned</code> o <code>funding</code> (tre giorni di
                    anticipo predefiniti; fino a quattro soglie da 0 a 30 giorni in Impostazioni), con deduplica per
                    scadenza e soglia. Il report mensile gira il giorno 2 e la revisione sottoscrizioni il giorno 3.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Attivare Analyst e canali esterni su Docker</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  AI
                </span>
                <div>
                  <strong>Flag di build + chiave AI gateway</strong>
                  <span>
                    Imposta <code>VITE_ANALYST_ENABLED=true</code> prima di ricompilare <code>app</code> e aggiungi{' '}
                    <code>AI_GATEWAY_API_KEY</code> o <code>OPENROUTER_API_KEY</code> in <code>.env</code>.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  MSG
                </span>
                <div>
                  <strong>Email Resend e Telegram bidirezionale opt-in</strong>
                  <span>
                    Configura <code>RESEND_*</code> per i riepiloghi email o <code>TELEGRAM_*</code> per Telegram
                    bidirezionale (collegato via comando monouso da Impostazioni valido 10 minuti). La consegna esterna
                    copre promemoria bollette, rinnovi o rate imminenti e avvisi di saldo proiettato basso solo dopo il
                    tuo opt-in.
                  </span>
                </div>
              </li>
            </ul>

            <CodePlate
              ariaLabel="Variabili d'ambiente self-host per Analyst AI"
              lines={[
                { text: '# Aggiungi in .env sulla tua istanza self-hosted, poi ricompila app', comment: true },
                { text: 'VITE_ANALYST_ENABLED=true' },
                { text: 'AI_GATEWAY_API_KEY=...   # oppure OPENROUTER_API_KEY' },
                { text: 'docker compose up -d --build' },
              ]}
            />

            <div className="mka-disclosure-box">
              <strong>Strumenti riservati a Pro:</strong> le proiezioni FIRE e pensione di lungo periodo (orizzonte
              predefinito 30 anni, 2% inflazione, 5% rendimento, 4% tasso di prelievo — tutte modificabili in chat come
              stime nominali) e il limite di 100 messaggi/giorno appartengono al piano Pro riservato, oggi non in
              vendita.
            </div>
          </div>
        </div>
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        tone="cotton"
        kicker="FAQ su Analyst AI"
        title="Domande su approvazioni, disponibilità nella demo e notifiche."
        subtitle="Verificato rispetto a docs/self-hosting.it.md e alla guida Analyst di Tracky."
        moreLink={{ href: '/it/domande-frequenti', label: 'Leggi tutte le FAQ →' }}
        items={aiAnalystItFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Continua a esplorare"
        title="Self-hosting e funzioni principali."
        items={[
          {
            kicker: 'Guida self-hosting',
            title: 'Self-hosting di Tracky con Docker',
            description: 'Configura Docker Compose, WorkOS AuthKit, reverse proxy TLS e le chiavi per le integrazioni opzionali.',
            href: '/it/blog/self-hosting-tracky-docker',
            linkLabel: 'Leggi la guida Docker →',
          },
          {
            kicker: 'Funzione · Solo self-host',
            title: 'Collegamento bancario PSD2',
            description: 'Affianca all’Analyst AI in self-host le connessioni Enable Banking in sola lettura con le tue chiavi.',
            href: '/it/funzioni/collegamento-bancario',
            linkLabel: 'Scopri il sync bancario →',
          },
          {
            kicker: 'Panoramica',
            title: 'Prezzi e trasparenza sui piani',
            description: 'Vedi Gratis (20 messaggi/giorno) vs Pro riservato (non in vendita) e il confronto Demo vs Self-host.',
            href: '/it/prezzi',
            linkLabel: 'Vedi i prezzi →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Assistenza che controlli tu, mai pilota automatico."
        meta="Self-hosted · Scritture approvate · Le tue chiavi · Open source MIT"
        primaryCta={
          <a className="mka-btn-marigold" href="/it/blog/self-hosting-tracky-docker">
            Leggi la guida self-host Docker →
          </a>
        }
        secondaryCta={
          <a className="mka-btn-outline-light" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            Esplora il repo MIT ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
