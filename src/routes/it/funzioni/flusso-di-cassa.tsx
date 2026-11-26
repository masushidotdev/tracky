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

export const cashFlowItFaq: Array<FaqItem> = [
  {
    q: 'In cosa il Flusso di cassa di Tracky è diverso da una previsione statistica?',
    a: 'Il Flusso di cassa applica pura aritmetica ai tuoi impegni registrati sopra gli ultimi saldi liquidi osservati, nel vero ordine cronologico. Non indovina le tue abitudini future e non promette risultati: quando cambiano saldi o voci registrate, la linea proiettata e la prima data negativa si ricalcolano insieme a loro.',
  },
  {
    q: 'Da dove parte la proiezione e cosa cambia con le impostazioni del ciclo?',
    a: 'Parte dagli ultimi saldi noti dei conti liquidi e applica le righe datate nella finestra di ciclo scelta. Le preferenze del ciclo regolano frequenza, durata e giorno di inizio, cambiando la finestra che osservi senza modificare le date reali delle scadenze. I saldi delle carte non entrano mai nella linea di liquidità.',
  },
  {
    q: 'Cosa significa il gruppo non assegnato?',
    a: 'Una spesa o una sottoscrizione senza conto di origine, oppure un estratto carta senza conto di regolamento, compare nel gruppo non assegnato. Tracky la mantiene visibile come impegno noto, ma non può stabilire quale saldo ridurrà finché non assegni il conto corrispondente.',
  },
  {
    q: 'Come si comportano sottoscrizioni attive e money box virtuali nel Flusso di cassa?',
    a: 'Le sottoscrizioni attive generano le righe di rinnovo future, mentre quelle in pausa o terminate restano fuori; il rilevamento automatico resta un suggerimento da confermare. Il fabbisogno delle money box virtuali compare separatamente e non riduce da solo un saldo bancario. Quando arriva il pagamento reale, collegalo così nulla conta due volte.',
  },
  {
    q: 'Posso considerare la prima data negativa come una garanzia?',
    a: 'Trattala come un segnale anticipato di pianificazione, mai come una garanzia. Apri il giorno segnalato, controlla le righe precedenti, i saldi iniziali, i conti e le valute, e confronta sempre con la banca. Spostare una data in Tracky aiuta solo se è cambiata la scadenza reale; altrimenti serve un’entrata reale o ridurre un’uscita.',
  },
];

export const Route = createFileRoute('/it/funzioni/flusso-di-cassa')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Flusso di cassa: calendario datato della liquidità · Tracky',
      description:
        'Disponi stipendi, bollette, sottoscrizioni attive, rate ed estratti carta sui saldi reali per vedere in anticipo la prima data negativa.',
      locale: 'it',
      path: '/it/funzioni/flusso-di-cassa',
      ogImage: ogImageFor('feature-cashflow'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/flusso-di-cassa', inLanguage: ['it', 'en'] }),
        faqJsonLd(cashFlowItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Flusso di cassa', path: '/it/funzioni/flusso-di-cassa' },
        ]),
      ],
    }),
  component: CashflowIt,
});

function CashflowIt() {
  const auth = Route.useLoaderData();
  return <CashFlowItView auth={auth} />;
}

export function CashFlowItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/funzioni/flusso-di-cassa">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[{ label: 'Home', href: '/it/' }, { label: 'Flusso di cassa' }]}
            />

            <div className="mka-b2-hero-badges">
              <ScopePill scope="both" label="Demo + Self-host" />
              <Chip tone="marigold">€0 oggi</Chip>
              <Chip>Stima di pianificazione, non garanzia</Chip>
            </div>

            <h1 className="mka-hero-headline">
              Leggi il calendario della tua liquidità <span className="mka-accent-ink">prima che le scadenze si scontrino.</span>
            </h1>

            <p className="mka-hero-dek">
              Il Flusso di cassa di Tracky dispone in ordine cronologico gli impegni noti — entrate e uscite pianificate,
              sottoscrizioni attive, rate, estratti carta e movimenti programmati — sopra gli ultimi saldi liquidi
              osservati. Individua la <strong>prima data negativa</strong> quando hai ancora margine per agire.
            </p>

            <div className="mka-hero-actions">
              <B2AppCta
                auth={auth}
                locale="it"
                loggedInHref="/app/planning"
                loggedInLabel="Apri il Flusso di cassa →"
                loggedOutLabel="Prova il Flusso di cassa nella demo →"
              />
              <a className="mka-btn-secondary" href="/it/guide/previsione-flusso-di-cassa">
                Leggi la guida in 5 passi →
              </a>
            </div>

            <p className="mka-hero-meta">
              <span>Funziona nella demo ospitata</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Aggiornato dai tuoi dati più recenti</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Promemoria bollette in-app inclusi</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. AVAILABILITY & PILLARS */}
      <Section id="overview" tone="parchment">
        <SectionHead
          kicker="Disponibilità e fonti"
          title="Un calendario aritmetico datato — non una sfera di cristallo."
          subtitle="Flusso di cassa per ciclo, Disponibile dopo le spese e promemoria in-app funzionano a €0 sia nella demo ospitata sia in self-host Docker."
        />

        <B2AvailabilityBand
          demoTone="sage"
          demoBadge="Incluso a €0"
          demoTitle="Demo ospitata (trytracky.app)"
          demoBody="Flusso di cassa per ciclo, Disponibile dopo le spese in Dashboard, avvisi sulla prima data negativa e promemoria bollette in-app funzionano subito su conti manuali e import CSV. Gli scenari Forecast pluriennali sono riservati a Pro (non in vendita)."
          selfHostTone="sage"
          selfHostBadge="Incluso · MIT"
          selfHostTitle="Self-hosted Docker"
          selfHostBody="Stesso motore di proiezione sul tuo server, con in più la sincronizzazione bancaria PSD2 opzionale e la consegna opt-in via email (Resend) o Telegram per promemoria e avvisi di saldo basso se configuri le tue chiavi."
        />

        <div style={{ marginTop: '1.75rem' }}>
          <B2PillarGrid
            items={[
              {
                tag: 'Fonti delle righe',
                title: 'Ogni impegno registrato in ordine di data',
                body: 'Riunisce spese ed entrate pianificate, sottoscrizioni attive, rate, estratti carta, trasferimenti pianificati e movimenti una tantum programmati nel registro lungo il ciclo scelto.',
                footer: (
                  <>
                    <strong>Nessun buco:</strong> Il registro mostra la prossima occorrenza non pagata; il Flusso di
                    cassa elenca tutte le occorrenze del ciclo selezionato.
                  </>
                ),
              },
              {
                tag: 'Calcolo progressivo',
                title: 'Serie per conto e liquidità aggregata',
                body: (
                  <>
                    Ogni riga applica <code>saldo dopo = saldo prima + entrata − uscita</code> sul proprio conto e sulla
                    serie liquida aggregata nella valuta principale.
                  </>
                ),
                footer: (
                  <>
                    <strong>Fido considerato a parte:</strong> Sui conti con fido, la capacità disponibile proiettata
                    applica lo stesso movimento cronologico.
                  </>
                ),
              },
              {
                tag: 'Segnale anticipato',
                title: 'Prima data negativa e Disponibile dopo le spese',
                body: 'Evidenzia la prima data in cui un conto o la serie aggregata scende sotto zero, mentre il Disponibile dopo le spese in Dashboard scala impegni residui e accantonamenti dovuti.',
                footer: (
                  <>
                    <strong>Prudente per scelta:</strong> Le entrate programmate restano attese e non gonfiano il
                    Disponibile dopo le spese prima dell’incasso.
                  </>
                ),
              },
            ]}
          />
        </div>
      </Section>

      {/* 3. RULES & GUARDRAILS */}
      <Section id="rules">
        <SectionHead
          kicker="Regole e confini"
          title="Perché conta l’ordine delle date — e cosa il Flusso di cassa non mescola."
          subtitle="Avere entrate sufficienti a fine mese non evita uno scoperto il giorno 2 se lo stipendio arriva il 27."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Tre regole cronologiche del calendario</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>L’ordine tra stipendi e bollette resta fedele</strong>
                  <span>
                    Un ciclo che parte il 25 mostra lo stipendio del 27 prima dell’affitto del 2; un ciclo dal 1°
                    applica prima le uscite. Le preferenze cambiano solo la finestra mostrata, mai le scadenze reali.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Gli estratti carta gravano sul conto di regolamento</strong>
                  <span>
                    I saldi delle carte sono debito, non liquidità, quindi non generano falsi allarmi di cassa negativa.
                    L’impatto entra alla data di addebito dell’estratto sul conto corrente di regolamento.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Le voci riconciliate non contano mai due volte</strong>
                  <span>
                    Quando arriva il movimento reale e lo colleghi con Collega transazione o segni la voce come pagata,
                    la riga resta tracciabile senza ridurre di nuovo i saldi futuri.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Limiti onesti e voci separate</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--vermilion" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Le voci senza conto restano nel gruppo non assegnato</strong>
                  <span>
                    Uscite o sottoscrizioni senza conto di origine — o estratti senza conto di regolamento — restano
                    visibili come impegni noti finché non assegni il conto nella stessa valuta.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Le altre valute non vengono convertite di nascosto</strong>
                  <span>
                    Le righe in valuta diversa da quella del conto o della serie principale restano visibili ma segnate
                    come non proiettate: nessun tasso di cambio inventato.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Le money box restano virtuali</strong>
                  <span>
                    Il fabbisogno delle money box compare a parte senza modificare da solo i saldi bancari. Registrare
                    un versamento traccia l’intenzione: i movimenti reali li esegui comunque in banca.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>Il Flusso di cassa registra intenzioni, non dispone pagamenti:</strong> creare una spesa
              pianificata, un trasferimento o una money box non muove denaro presso la tua banca o il finanziatore. Le
              proiezioni restano stime di pianificazione, mai consulenza finanziaria.
            </div>
          </div>
        </div>
      </Section>

      {/* 4. FIT CHECK */}
      <Section id="fit" tone="parchment">
        <SectionHead
          kicker="Verifica trasparente"
          title="Per chi è davvero utile il calendario del Flusso di cassa."
        />

        <FitCheck
          yesTitle="Fa per te se…"
          yesItems={[
            'Ricevi entrate in date fisse mentre affitto, bollette, rate ed estratti carta escono in altri giorni.',
            'Vuoi individuare la prima data negativa prima che un addebito fallisca o scatti uno scoperto.',
            'Gestisci i conti liquidi in una valuta principale e riconcilii le voci pagate per mantenere pulite le date future.',
            'Vuoi un Disponibile dopo le spese basato sulla liquidità reale meno gli impegni residui, senza entrate presunte.',
          ]}
          noTitle="Non fa per te se…"
          noItems={[
            'Cerchi un modello automatico che stimi spese non registrate al posto tuo.',
            'Vuoi che l’app esegua bonifici o paghi bollette direttamente presso la banca.',
            'Ti serve una proiezione unica che sommi valute diverse con cambio automatico.',
            'Cerchi scenari Forecast pluriennali sul piano Gratis oggi (sono riservati a Pro, non ancora in vendita).',
          ]}
        />
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        tone="cotton"
        kicker="FAQ sul Flusso di cassa"
        title="Domande su cicli, righe non assegnate e prima data negativa."
        subtitle="Risposte dirette allineate alle regole di proiezione di Tracky."
        moreLink={{ href: '/it/domande-frequenti', label: 'Leggi tutte le FAQ →' }}
        items={cashFlowItFaq}
      />

      {/* 6. RELATED LINKS */}
      <B2RelatedSection
        tone="parchment"
        kicker="Continua a esplorare"
        title="Collega il Flusso di cassa al resto del tuo metodo."
        items={[
          {
            kicker: 'Guida passo passo',
            title: 'Come prevedere il flusso di cassa',
            description: 'Cinque passi pratici: finanzia il Piano, inserisci le voci pianificate, conferma gli abbonamenti, leggi la prima data negativa e intervieni presto.',
            href: '/it/guide/previsione-flusso-di-cassa',
            linkLabel: 'Leggi la guida →',
          },
          {
            kicker: 'Funzione · Demo + Self-host',
            title: 'Piano zero-based e target',
            description: 'Assegna la liquidità osservata ai bucket prima di spendere per dare al Flusso di cassa una base solida.',
            href: '/it/funzioni/piano-zero-based',
            linkLabel: 'Scopri il Piano →',
          },
          {
            kicker: 'Guida passo passo',
            title: 'Trova e cancella abbonamenti inutili',
            description: 'Ripulisci gli addebiti ricorrenti dallo storico CSV così solo i rinnovi veri pesano sulla cassa futura.',
            href: '/it/guide/cancella-abbonamenti-inutili',
            linkLabel: 'Leggi la guida →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Individua lo scoperto prima che lo faccia la banca."
        meta="Demo ospitata a €0 · Flusso di cassa e promemoria in-app inclusi · Stime, non garanzie"
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
          <a className="mka-btn-outline-light" href="/it/prezzi">
            Confronta Demo vs Self-host →
          </a>
        }
      />
    </AtelierSite>
  );
}
