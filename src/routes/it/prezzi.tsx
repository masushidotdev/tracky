import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { MarketingAuth } from '@/components/marketing/site';
import type { ComparisonRow, FaqItem } from '@/components/marketing/atelier';
import {
  AtelierSite,
  AuthCta,
  Breadcrumb,
  Chip,
  ChipRow,
  CodePlate,
  ComparisonTable,
  FaqSection,
  FinalCta,
  GITHUB_REPO_URL,
  PricingCards,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const pricingItFaq: Array<FaqItem> = [
  {
    q: 'Come funzionano oggi i prezzi di Tracky?',
    a: 'Oggi Tracky costa €0 sia per la demo ospitata sia per il self-hosting con licenza MIT. Non inserisci mai i dati di una carta perché non esiste alcun checkout sul sito né nell’app. Conti manuali, import CSV nel browser, Piano zero-based, Flusso di cassa, Report e money box virtuali sono tutti inclusi nel piano Gratis.',
  },
  {
    q: 'Posso acquistare Pro oggi oppure esiste una prova a pagamento?',
    a: 'No. Pro esiste nel codice come livello riservato, non come prodotto in vendita: non c’è prezzo, non c’è timer di prova e non esiste pagina di checkout. Se e quando verrà lanciato, Pro è pensato per portare il limite giornaliero dell’Analyst AI da 20 a 100 messaggi e sbloccare più Piani e scenari Forecast / FIRE di lungo periodo (sempre presentati come stime). Tutto ciò che è Gratis resta Gratis.',
  },
  {
    q: 'Il piano Gratis include sync bancario PSD2, Analyst AI e notifiche?',
    a: 'Il collegamento bancario (Enable Banking) e l’Analyst AI dipendono da credenziali configurate sull’istanza, quindi restano disattivati sulla demo ospitata, che funziona con conti manuali e import CSV. I promemoria in-app delle bollette e i suggerimenti sulle sottoscrizioni funzionano subito anche nella demo. Su un’istanza self-hosted puoi collegare la tua app e chiavi Enable Banking (la sincronizzazione automatica viene valutata ogni sei ore), chiave AI gateway, chiave Resend per email e collegamento Telegram verificato.',
  },
  {
    q: 'Quanto costa fare self-hosting e quali account esterni servono?',
    a: 'Tracky è open source con licenza MIT e gratuito da eseguire sul tuo computer o su un VPS singolo usando Docker 24+ (Compose v2) e Node.js 22 per lo script di setup. Serve un account gratuito WorkOS AuthKit per l’autenticazione; le integrazioni opzionali (Enable Banking, AI gateway, Resend, Telegram) usano i tuoi account provider e restano spente finché non le configuri.',
  },
  {
    q: 'Cosa succede ai miei dati se resto su Gratis o decido di andarmene?',
    a: 'I tuoi dati restano tuoi. Puoi esportare i Report aggregati in CSV per valuta o richiedere un export JSON completo dalle Impostazioni (con impostazioni e testo delle memorie inclusi, embedding esclusi). Se confermi Elimina account nelle Impostazioni, la cancellazione irreversibile inizia subito; prima puoi scaricare l’export. Alcuni log presso fornitori esterni seguono tempi di conservazione separati descritti nella documentazione privacy.',
  },
];

const comparisonRows: Array<ComparisonRow> = [
  {
    capability: 'Conti manuali (correnti, risparmio, carte, prestiti, investimenti, asset)',
    demo: { text: 'Incluso', tone: 'yes' },
    selfHost: { text: 'Incluso', tone: 'yes' },
  },
  {
    capability: 'Import CSV nel browser (mappatura, validazione, salto duplicati)',
    demo: { text: 'Incluso', tone: 'yes' },
    selfHost: { text: 'Incluso', tone: 'yes' },
  },
  {
    capability: 'Piano zero-based, target, Assegnazione automatica e bucket carte',
    demo: { text: 'Incluso', tone: 'yes' },
    selfHost: { text: 'Incluso', tone: 'yes' },
  },
  {
    capability: 'Dashboard Disponibile dopo le spese, Flusso di cassa e promemoria in-app',
    demo: { text: 'Incluso', tone: 'yes' },
    selfHost: { text: 'Incluso', tone: 'yes' },
  },
  {
    capability: 'Report (Sankey, categorie, trend, export CSV), Obiettivi e money box virtuali',
    demo: { text: 'Incluso', tone: 'yes' },
    selfHost: { text: 'Incluso', tone: 'yes' },
  },
  {
    capability: 'Export JSON completo e cancellazione account immediata in Impostazioni',
    demo: { text: 'Incluso', tone: 'yes' },
    selfHost: { text: 'Incluso', tone: 'yes' },
  },
  {
    capability: 'Sync bancario PSD2 via Enable Banking (valutato ogni sei ore)',
    demo: { text: 'Disattivato sulla demo', tone: 'no' },
    selfHost: { text: 'Opzionale — tua app ID e chiave PEM', tone: 'opt' },
  },
  {
    capability: 'Analyst AI con scritture approvate (piano Gratis: 20 messaggi/giorno)',
    demo: { text: 'Disattivato sulla demo', tone: 'no' },
    selfHost: { text: 'Opzionale — tua chiave AI gateway', tone: 'opt' },
  },
  {
    capability: 'Report email (Resend) e bot Telegram bidirezionale',
    demo: { text: 'Disattivato sulla demo', tone: 'no' },
    selfHost: { text: 'Opzionale — tue chiavi / collegamento verificato', tone: 'opt' },
  },
  {
    capability: 'Telemetria e analytics di prodotto',
    demo: { text: 'PostHog EU opt-in (spento fino ad Accetta)', tone: 'opt' },
    selfHost: { text: 'Disattivata a tempo di build', tone: 'yes' },
  },
  {
    capability: 'Autenticazione (WorkOS AuthKit)',
    demo: { text: 'Gestita su trytracky.app', tone: 'yes' },
    selfHost: { text: 'Account WorkOS esterno (piano dev gratuito)', tone: 'opt' },
  },
];

export const Route = createFileRoute('/it/prezzi')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Prezzi — €0 oggi, open source MIT · Tracky',
      description:
        'Tracky costa €0 oggi: demo ospitata e self-host Docker con licenza MIT, senza carta e senza checkout. Il piano Pro è riservato e non è in vendita.',
      locale: 'it',
      path: '/it/prezzi',
      ogImage: ogImageFor('pricing'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/prezzi', inLanguage: ['it', 'en'] }),
        faqJsonLd(pricingItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Prezzi', path: '/it/prezzi' },
        ]),
      ],
    }),
  component: PricingIt,
});

function PricingIt() {
  const auth = Route.useLoaderData();
  return <PricingItView auth={auth} />;
}

export function PricingItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/prezzi">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb ariaLabel="Percorso di navigazione" items={[{ label: 'Home', href: '/it/' }, { label: 'Prezzi' }]} />

            <ChipRow>
              <Chip tone="marigold">€0 oggi</Chip>
              <Chip>Senza carta</Chip>
              <Chip>Nessun checkout</Chip>
              <Chip tone="cobalt">Open source MIT</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              €0 oggi — demo ospitata e self-host MIT, <span className="mka-accent-ink">senza checkout.</span>
            </h1>

            <p className="mka-hero-dek">
              Usa la demo ospitata su trytracky.app oppure esegui lo stesso codice con licenza MIT sul tuo host Docker.
              Nel codice è riservato un livello Pro per limiti più alti dell’Analyst AI, più Piani e scenari Forecast di
              lungo periodo, ma la fatturazione non esiste e oggi nulla è in vendita.
            </p>

            <div className="mka-hero-actions">
              <AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="primary-lg" />
              <a className="mka-btn-secondary" href="/it/blog/self-hosting-tracky-docker">
                Self-host con Docker →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. FREE VS PRO CARDS */}
      <Section id="plans" tone="parchment">
        <SectionHead
          kicker="Piani"
          title="Gratis copre tutto il ciclo quotidiano di budget; Pro è riservato e non è in vendita."
          subtitle="Apri Impostazioni nell’app quando vuoi per vedere piano attivo e soglia giornaliera dell’Analyst. In Tracky non esistono moduli di pagamento né timer di prova."
        />

        <PricingCards
          free={{
            tag: 'Gratis — Disponibile oggi',
            figure: '€0',
            description: 'Tutto il necessario per budget zero-based, flusso di cassa, import CSV e report.',
            bullets: [
              'Piano zero-based con Assegnato, Attività, Disponibile, target, Assegnazione automatica e bucket carte',
              'Dashboard Disponibile dopo le spese, Flusso di cassa datato e promemoria bollette in-app',
              'Conti manuali correnti, risparmio, carte, prestiti, investimenti e asset + import CSV nel browser',
              'Report (Sankey, categorie, trend, export CSV), Obiettivi e money box virtuali',
              'Suggerimenti sulle sottoscrizioni da confermare, simulatore debiti ed export JSON completo',
              'Codice MIT completo su GitHub (include 20 messaggi/giorno di Analyst AI quando attivato in self-host)',
            ],
            cta: (
              <>
                <AuthCta auth={auth} locale="it" ctaLocation="marketing" />
                <a className="mka-text-link" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                  Esplora il repo MIT ↗
                </a>
              </>
            ),
          }}
          pro={{
            tag: 'Pro — Riservato, non in vendita',
            figure: 'Nessun prezzo · Nessuna prova',
            description: 'Predisposto nel codice per rendere chiari i limiti avanzati; oggi nessuno può pagare.',
            bullets: [
              'Alza il limite giornaliero dell’Analyst AI da 20 a 100 messaggi al giorno',
              'Sblocca più Piani all’interno dello stesso spazio di lavoro',
              'Aggiunge scenari Forecast e proiezioni FIRE di lungo periodo (stime nominali, mai consulenza)',
              'Nessun prezzo, nessuna prova a scadenza, nessun checkout: le funzioni Gratis restano intatte',
            ],
          }}
        />
      </Section>

      {/* 3. HOSTED DEMO VS SELF-HOST TABLE */}
      <Section id="comparison">
        <SectionHead
          kicker="Demo ospitata vs self-host"
          title="Cosa è incluso in ciascun ambiente."
          subtitle="Entrambi eseguono lo stesso codice MIT. La differenza riguarda solo la presenza o meno delle credenziali per integrazioni esterne."
        />

        <ComparisonTable
          caption="Confronto delle funzionalità tra la demo ospitata di Tracky e l’installazione self-hosted con Docker"
          headers={['Funzionalità', 'Demo ospitata (€0)', 'Self-hosted Docker (MIT)']}
          rows={comparisonRows}
        />
      </Section>

      {/* 4. WHAT YOU NEED TO SELF-HOST */}
      <Section id="self-host" tone="parchment">
        <SectionHead
          kicker="Requisiti per il self-hosting"
          title="Cosa serve per eseguire Tracky sul tuo server."
          subtitle="Pensato per una macchina personale o un VPS singolo con volume SQLite Convex locale e zero telemetria di prodotto."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Indispensabile per partire</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Docker 24+ con Docker Compose v2</strong>
                  <span>
                    Esegue in locale nei container il backend Convex self-hosted (SQLite + volume dati) e l’app TanStack
                    Start.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Node.js 22 (per lo script di setup)</strong>
                  <span>
                    Esegue <code>node scripts/selfhost-setup.mjs</code> senza dipendenze npm per configurare WorkOS e
                    scrivere un file <code>.env</code> locale con permessi <code>0600</code>.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Account gratuito WorkOS AuthKit</strong>
                  <span>
                    L’autenticazione resta esterna tramite WorkOS AuthKit (piano gratuito per sviluppatori disponibile)
                    anche su un’installazione Docker locale.
                  </span>
                </div>
              </li>
            </ul>

            <CodePlate
              ariaLabel="Comandi di configurazione self-host"
              lines={[
                { text: '# Setup interattivo (WorkOS + .env locale)', comment: true },
                { text: 'node scripts/selfhost-setup.mjs' },
                { text: 'docker compose up -d' },
              ]}
            />

            <div className="mka-trust-actions">
              <a className="mka-text-link" href="/it/blog/self-hosting-tracky-docker">
                Leggi la guida self-host Docker →
              </a>
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/docs/self-hosting.it.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Leggi docs/self-hosting.it.md ↗
              </a>
            </div>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Integrazioni opzionali (con le tue chiavi)</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  PSD2
                </span>
                <div>
                  <strong>App Enable Banking e chiave PEM</strong>
                  <span>
                    Abilita connessioni bancarie PSD2 in sola lettura con sincronizzazione automatica valutata ogni sei
                    ore e consenso revocabile in qualsiasi momento.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  AI
                </span>
                <div>
                  <strong>Chiave AI gateway (AI Gateway / OpenRouter)</strong>
                  <span>
                    Attiva l’Analyst AI con scritture approvate quando compili l’app con{' '}
                    <code>VITE_ANALYST_ENABLED=true</code>.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  MSG
                </span>
                <div>
                  <strong>Chiave Resend e token bot Telegram</strong>
                  <span>
                    Abilita i riepiloghi email via Resend e le notifiche Telegram bidirezionali dopo aver verificato il
                    collegamento della chat.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>Nessuna dipendenza nascosta:</strong> ogni integrazione opzionale resta disattivata finché non
              imposti le relative variabili d’ambiente, e le build Docker disattivano PostHog, beacon Convex e
              telemetria Wrangler a tempo di build.
            </div>
          </div>
        </div>
      </Section>

      {/* 5. PLAIN TERMS & DATA OWNERSHIP */}
      <Section id="terms">
        <SectionHead
          kicker="Condizioni chiare"
          title="Perché €0 non nasconde asterischi — e come resti padrone dei tuoi dati."
          subtitle="Un software di budget guadagna fiducia quando modello economico e via d’uscita sono trasparenti quanto le formule."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Cosa include €0 ogni mese</h3>
            <p>
              Il piano Gratis copre l’intero ciclo quotidiano di budget senza parti bloccate da una prova a scadenza:
              bucket del Piano zero-based, Flusso di cassa con impegni datati e promemoria in-app, Report con export CSV
              per valuta, money box virtuali e suggerimenti che segnalano i probabili rinnovi senza spacciarli per
              certezze.
            </p>
            <p>
              Nella demo ospitata lavori sui dati inseriti a mano o importati via CSV nel browser; in self-hosting puoi
              aggiungere le tue chiavi provider. Le proiezioni restano sempre stime costruite sui dati registrati, mai
              consulenza finanziaria.
            </p>
          </article>

          <article className="mka-editorial-card">
            <h3>Piano Pro riservato e uscita pulita</h3>
            <p>
              Pro compare nel codice e nelle Impostazioni per rendere trasparenti i limiti d’uso, non perché oggi ci sia
              qualcosa da acquistare. Non esiste un prezzo, né un modulo di pagamento né una prova che si converte da
              sola: se Pro arriverà, aggiungerà limiti Analyst più alti, piani multipli e scenari Forecast lasciando
              intatto il piano Gratis.
            </p>
            <p>
              Quando vuoi una copia dei tuoi dati, richiedi un export JSON nelle Impostazioni (impostazioni e testo
              delle memorie inclusi, embedding esclusi) oppure esporta i Report in CSV. Confermare Elimina account avvia
              la cancellazione immediata e irreversibile.
            </p>
          </article>
        </div>
      </Section>

      {/* 6. FAQ */}
      <FaqSection
        id="faq"
        tone="parchment"
        kicker="FAQ sui prezzi"
        title="Domande su costi, piano Pro e self-hosting."
        subtitle="Risposte dirette allineate al codice v0.1.0 rilasciato — senza asterischi né promesse non verificabili."
        moreLink={{ href: '/it/domande-frequenti', label: 'Leggi tutte le FAQ →' }}
        items={pricingItFaq}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="€0 oggi. Senza carta, senza timer di prova, senza checkout."
        meta="Demo ospitata gratuita · Self-host MIT con Docker · Rilascio pubblico v0.1.0"
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
