import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { FaqItem } from '@/components/marketing/atelier';
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
import {
  B2AppCta,
  B2AvailabilityBand,
  B2RelatedSection,
  B2ScreenshotFigure,
} from '@/components/marketing/atelier/b2-sections';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const bankConnectionsItFaq: Array<FaqItem> = [
  {
    q: 'La sincronizzazione bancaria PSD2 funziona sulla demo ospitata?',
    a: 'No. Il collegamento bancario è solo self-host e resta disattivato sulla demo ospitata per scelta. Su trytracky.app lavori con conti manuali e import CSV nel browser. Le connessioni live funzionano solo sulla tua istanza dopo aver configurato app ID, chiave PEM e URL di callback HTTPS di Enable Banking.',
  },
  {
    q: 'Tracky conserva o vede mai le mie credenziali bancarie?',
    a: 'No. Autenticazione e consenso avvengono direttamente sul sito della tua banca tramite Enable Banking. Tracky non chiede mai username o password bancari e i maintainer non vedono mai le tue chiavi o credenziali. Puoi revocare il consenso quando vuoi presso la banca e disattivare la sincronizzazione per singolo conto in Tracky.',
  },
  {
    q: 'Con quale frequenza viene valutata la sincronizzazione automatica?',
    a: 'La sincronizzazione automatica viene valutata ogni sei ore, e puoi anche richiedere un aggiornamento manuale su qualsiasi conto collegato. La disponibilità effettiva dei dati dipende comunque dai tempi di pubblicazione della tua banca.',
  },
  {
    q: 'Cosa devo fare se una sincronizzazione va in errore o chiede una nuova autorizzazione?',
    a: 'Se vedi Ricollega o Autorizzazione richiesta, rinnova prima il consenso presso la banca. Se lo stato è errore, apri il dettaglio del job nella cronologia e riprova più tardi: avviare molti aggiornamenti ripetuti non forza la banca a pubblicare nuovi dati.',
  },
  {
    q: 'Posso rinominare, nascondere o mettere in pausa un conto collegato senza perdere lo storico?',
    a: 'Sì. Puoi impostare un alias per cambiare il nome visualizzato senza toccare i dati del provider, nascondere un conto per escluderlo dai totali della Dashboard mantenendolo salvato, oppure disattivare la sincronizzazione per singolo conto fermando i futuri aggiornamenti senza cancellare lo storico.',
  },
];

export const Route = createFileRoute('/it/funzioni/collegamento-bancario')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Collegamento bancario PSD2 self-hosted via Enable Banking · Tracky',
      description:
        'Collega le banche via Enable Banking sulla tua istanza self-hosted con le tue chiavi app. Disattivato sulla demo ospitata; CSV disponibile ovunque.',
      locale: 'it',
      path: '/it/funzioni/collegamento-bancario',
      ogImage: ogImageFor('feature-banksync'),
      jsonLd: [
        softwareAppJsonLd({
          url: 'https://www.trytracky.app/it/funzioni/collegamento-bancario',
          inLanguage: ['it', 'en'],
        }),
        faqJsonLd(bankConnectionsItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Collegamento bancario', path: '/it/funzioni/collegamento-bancario' },
        ]),
      ],
    }),
  component: BankIt,
});

function BankIt() {
  const auth = Route.useLoaderData();
  return <BankConnectionsItView auth={auth} />;
}

export function BankConnectionsItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/funzioni/collegamento-bancario">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[{ label: 'Home', href: '/it/' }, { label: 'Collegamento bancario' }]}
            />

            <div className="mka-b2-hero-badges">
              <ScopePill scope="selfhost" label="Solo self-host" />
              <Chip>Disattivato sulla demo ospitata</Chip>
              <Chip tone="cobalt">Con le tue chiavi Enable Banking</Chip>
            </div>

            <h1 className="mka-hero-headline">
              Sincronizzazione bancaria PSD2 via Enable Banking —{' '}
              <span className="mka-accent-ink">sul tuo server, con le tue chiavi.</span>
            </h1>

            <p className="mka-hero-dek">
              Collega le banche supportate sulla tua istanza Tracky self-hosted usando il tuo app ID e la tua chiave
              privata PEM di Enable Banking. Il consenso avviene direttamente presso la tua banca, la sincronizzazione
              automatica viene valutata ogni sei ore, mentre conti manuali e import CSV nel browser coprono la demo
              ospitata e qualsiasi banca non supportata.
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
                loggedOutLabel="Prova la demo con CSV →"
                variant="primary"
              />
            </div>

            <p className="mka-hero-meta">
              <span>Consenso PSD2 in sola lettura</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Revocabile quando vuoi in banca</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>I maintainer non vedono mai le tue credenziali</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. EXPLICIT AVAILABILITY */}
      <Section id="availability" tone="parchment">
        <SectionHead
          kicker="Dove gira"
          title="Disattivato sulla demo ospitata; opzionale sulla tua istanza Docker."
          subtitle="Lo dichiariamo subito: le credenziali Enable Banking appartengono a chi gestisce la singola istanza, mai a una demo pubblica condivisa."
        />

        <B2AvailabilityBand
          demoTone="default"
          demoBadge="Disattivato sulla demo"
          demoTitle="Demo ospitata (trytracky.app)"
          demoBody="Il pulsante di collegamento resta disabilitato su trytracky.app. Puoi provare ogni funzione di Piano zero-based, Flusso di cassa e Report usando conti manuali e import CSV nel browser, senza condividere credenziali bancarie."
          selfHostTone="cobalt"
          selfHostBadge="Opzionale · Le tue chiavi"
          selfHostTitle="Self-hosted Docker (MIT)"
          selfHostBody={
            <>
              Configura il tuo app ID Enable Banking, la chiave privata PEM e l’URL di callback HTTPS tramite le
              variabili <code>ENABLE_BANKING_*</code> sincronizzate al backend Convex locale. Dietro reverse proxy, la
              porta <code>3211</code> gestisce i callback in ingresso.
            </>
          }
        />
      </Section>

      {/* 3. HOW IT WORKS & ACCOUNT CONTROLS */}
      <Section id="how-it-works">
        <SectionHead
          kicker="Flusso e controlli"
          title="Richieste firmate al provider, cronologia dei job e controlli per singolo conto."
          subtitle="Anche dopo aver collegato la banca, decidi tu quali conti entrano nei totali della Dashboard, come chiamarli e quando sincronizzarli."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Dal consenso bancario ai registri puliti</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Approva l’accesso direttamente in banca</strong>
                  <span>
                    Apri <strong>Impostazioni → Connessioni bancarie</strong>, scegli il tuo istituto e completa
                    autenticazione e consenso sulla pagina della banca. Al ritorno Tracky crea la connessione e pianifica
                    le prime importazioni.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Sincronizzazione automatica valutata ogni sei ore</strong>
                  <span>
                    La sincronizzazione automatica viene valutata ogni sei ore, con possibilità di richiedere un
                    aggiornamento manuale su qualsiasi conto. Lo stato distingue chiaramente attiva, disattivata, in
                    errore o con consenso da rinnovare.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Cronologia dei job con riconoscimento duplicati</strong>
                  <span>
                    Controlla nella cronologia quanti elementi sono stati visti e quanti importati: un numero minore di
                    voci importate indica di solito che i duplicati già presenti sono stati riconosciuti e saltati.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--vermilion" aria-hidden="true">
                  04
                </span>
                <div>
                  <strong>Regole coerenti su saldi e valute</strong>
                  <span>
                    Tracky usa lo snapshot più recente preferendo il saldo disponibile, poi il contabilizzato, poi
                    l’atteso. I conti CARD restano sempre passività — mai liquidità — e ogni conto mantiene la valuta
                    comunicata dalla banca.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Barra laterale e controlli per conto</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  NAV
                </span>
                <div>
                  <strong>Raggruppati in Liquidità, Credito e Prestiti</strong>
                  <span>
                    Apri qualsiasi conto di liquidità o credito per vedere solo i suoi movimenti, apri un prestito per
                    la sua pagina dedicata oppure usa <strong>Tutti i conti</strong> per il registro condiviso.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  CTRL
                </span>
                <div>
                  <strong>Alias, visibilità e pausa per singolo conto</strong>
                  <span>
                    Imposta un alias leggibile senza alterare i dati del provider, nascondi i conti che vuoi escludere
                    dai totali della Dashboard o disattiva la sincronizzazione di un conto conservando tutto lo storico.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  KEY
                </span>
                <div>
                  <strong>Variabili d’ambiente self-host</strong>
                  <span>
                    Enable Banking resta spento finché non inserisci le tue credenziali provider e un dominio HTTPS
                    pubblico per i callback nel file <code>.env</code>.
                  </span>
                </div>
              </li>
            </ul>

            <CodePlate
              ariaLabel="Prerequisiti Enable Banking per il self-hosting"
              lines={[
                { text: '# Sulla tua istanza Docker self-hosted (vedi docs/self-hosting.it.md)', comment: true },
                { text: 'ENABLE_BANKING_*  # App ID, chiave privata PEM e callback HTTPS' },
                { text: 'docker compose up -d' },
              ]}
            />

            <div className="mka-trust-actions">
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/docs/self-hosting.it.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Leggi docs/self-hosting.it.md ↗
              </a>
              <a className="mka-text-link" href="/it/open-source">
                Panoramica architettura →
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* 4. HONEST FALLBACK SCREENSHOT */}
      <Section id="csv-fallback" tone="parchment">
        <SectionHead
          kicker="Funziona ovunque"
          title="Il fallback onesto: import CSV elaborato nel browser."
          subtitle="Sia sulla demo ospitata sia per istituti che non espongono dati via PSD2, conti manuali e mappatura guidata CSV mantengono completo il registro."
        />

        <B2ScreenshotFigure
          src="/shots/import-mapping.png"
          alt="Schermata di mappatura colonne CSV di Tracky (interfaccia in inglese) con data contabile, descrizione, controparte e colonne importo per un conto manuale"
          width={1440}
          height={800}
          captionTitle="Mappatura guidata colonne CSV"
          captionBody="I file CSV vengono letti e validati in locale nel tuo browser con supporto per quattro formati data, virgola o punto decimale e salto idempotente dei duplicati — senza alcuna credenziale bancaria."
        />
      </Section>

      {/* 5. FIT CHECK */}
      <Section id="fit">
        <SectionHead
          kicker="Verifica trasparente"
          title="Quando vale la pena configurare il sync bancario in self-host."
        />

        <FitCheck
          yesTitle="Fa per te se…"
          yesItems={[
            'Gestisci (o prevedi di gestire) Tracky sul tuo host Docker dietro HTTPS e vuoi importazioni PSD2 automatiche in sola lettura.',
            'Ti trovi a tuo agio nel registrare una tua app Enable Banking e custodire la tua chiave di firma PEM.',
            'Vuoi alias per conto, pausa/nascondi e cronologia dei job affiancati a conti manuali e import CSV.',
          ]}
          noTitle="Non fa per te se…"
          noItems={[
            'Cerchi connessioni bancarie chiavi in mano su cloud ospitato senza fare self-hosting né configurare le tue chiavi.',
            'Ti aspetti che l’app disponga bonifici o pagamenti: le connessioni Enable Banking in Tracky sono solo in lettura.',
            'Vuoi un’istanza puramente locale senza un endpoint HTTPS pubblico per i callback OAuth bancari.',
          ]}
        />
      </Section>

      {/* 6. FAQ */}
      <FaqSection
        id="faq"
        tone="parchment"
        kicker="FAQ sul collegamento bancario"
        title="Domande su consenso PSD2, chiavi e stato della sincronizzazione."
        subtitle="Verificato rispetto a docs/self-hosting.it.md e alle guide sui conti."
        moreLink={{ href: '/it/domande-frequenti', label: 'Leggi tutte le FAQ →' }}
        items={bankConnectionsItFaq}
      />

      {/* 7. RELATED LINKS */}
      <B2RelatedSection
        tone="cotton"
        kicker="Continua a esplorare"
        title="Self-hosting e flussi manuali."
        items={[
          {
            kicker: 'Guida self-hosting',
            title: 'Self-hosting di Tracky con Docker',
            description: 'Guida passo passo con Docker Compose, WorkOS AuthKit, reverse proxy TLS e backup.',
            href: '/it/blog/self-hosting-tracky-docker',
            linkLabel: 'Leggi la guida Docker →',
          },
          {
            kicker: 'Funzione · Solo self-host',
            title: 'Analyst AI con scritture approvate',
            description: 'Interroga il tuo registro autorizzato in linguaggio naturale sulla tua istanza self-hosted con la tua chiave AI gateway.',
            href: '/it/funzioni/analyst-ai',
            linkLabel: 'Scopri Analyst AI →',
          },
          {
            kicker: 'Panoramica',
            title: 'Prezzi e confronto Demo vs Self-host',
            description: 'Confronta ogni funzione fianco a fianco tra trytracky.app e un’installazione Docker self-hosted.',
            href: '/it/prezzi',
            linkLabel: 'Vedi il confronto →',
          },
        ]}
      />

      {/* 8. FINAL CTA */}
      <FinalCta
        headline="Sincronizza sul tuo server. Importa CSV ovunque."
        meta="Open source MIT · Le tue chiavi Enable Banking · Consenso revocabile sempre"
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
