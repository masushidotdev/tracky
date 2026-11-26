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
  CodePlate,
  FaqSection,
  FinalCta,
  GITHUB_REPO_URL,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import { RelatedLinksSection } from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const openSourceItFaq: Array<FaqItem> = [
  {
    q: 'Tracky è davvero un’app di budget open source da eseguire in self-hosting con licenza MIT?',
    a: 'Sì. Il repository su masushidotdev/tracky ha licenza MIT: puoi leggerlo, modificarlo, eseguirlo sul tuo server e ridistribuirlo mantenendo l’avviso di copyright. La demo ospitata e le installazioni self-hosted girano sullo stesso codice pubblico.',
  },
  {
    q: 'La demo ospitata include sincronizzazione bancaria e Analyst AI?',
    a: 'No. La demo ospitata tiene spente le integrazioni di terze parti così puoi valutare Piano zero-based, Flusso di cassa, Report e import CSV nel browser senza configurare chiavi. La sincronizzazione bancaria PSD2 (Enable Banking, con sync automatico valutato ogni sei ore) e l’Analyst AI con scritture approvate si attivano sulla tua installazione con le tue credenziali. Considera l’Analyst uno strumento di esplorazione, mai consulenza finanziaria.',
  },
  {
    q: 'Cosa serve per avviare una mia istanza?',
    a: 'Per il self-hosting con Docker (consigliato su computer personale o VPS singolo) servono Docker 24+ con Compose v2, Node.js 22 per eseguire node scripts/selfhost-setup.mjs e un account gratuito WorkOS AuthKit: Convex gira in locale dentro Docker senza telemetria di prodotto. Per sviluppo locale o deploy su Convex Cloud servono Node.js (>=22.23.4 <23), npm e un tuo deployment Convex (npx convex dev può creare automaticamente un ambiente WorkOS dev). Enable Banking, AI Gateway, Resend e Telegram sono tutti opzionali.',
  },
  {
    q: 'Come si comportano proiezioni, suggerimenti sugli abbonamenti e money box virtuali?',
    a: 'Le proiezioni sono stime di pianificazione costruite su saldi registrati e impegni datati, mai risultati garantiti: verifica sempre rispetto alla banca. Il rilevamento delle sottoscrizioni arriva come suggerimento di cui confermi esercente, importo e cadenza. Le money box sono salvadanai virtuali che non spostano saldi bancari, e ogni valuta mantiene totali separati senza conversioni silenziose.',
  },
];

export const Route = createFileRoute('/it/open-source')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Open source e self-hosting (MIT) — Tracky',
      description:
        'Tracky è open source MIT su GitHub: backend Convex, frontend TanStack Start, guide EN/IT e self-hosting Docker Compose senza telemetria.',
      locale: 'it',
      path: '/it/open-source',
      ogImage: ogImageFor('open-source'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/open-source', inLanguage: ['it', 'en'] }),
        faqJsonLd(openSourceItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Open source', path: '/it/open-source' },
        ]),
      ],
    }),
  component: OpenSourceIt,
});

function OpenSourceIt() {
  const auth = Route.useLoaderData();
  return <OpenSourceItView auth={auth} />;
}

export function OpenSourceItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/open-source">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Percorso di navigazione"
              items={[{ label: 'Home', href: '/it/' }, { label: 'Open source' }]}
            />

            <ChipRow>
              <Chip tone="cobalt">Licenza MIT</Chip>
              <Chip>masushidotdev/tracky</Chip>
              <Chip tone="sage">Self-host Docker</Chip>
              <Chip tone="marigold">Guide bilingui IT / EN</Chip>
            </ChipRow>

            <h1 className="mka-hero-headline">
              Leggi ogni formula, fai fork del repository,{' '}
              <span className="mka-accent-ink">eseguilo sul tuo server.</span>
            </h1>

            <p className="mka-hero-dek">
              Tracky è un tracker per le finanze personali con licenza MIT costruito su Convex, TanStack Start e WorkOS
              AuthKit. Ogni regola contabile, decisione architetturale e guida utente bilingue è pubblica su GitHub.
              Prova prima la demo ospitata, poi passa al self-hosting con Docker Compose e le tue chiavi.
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-primary mka-btn-primary--lg" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                Esplora il codice su GitHub ↗
              </a>
              <AuthCta auth={auth} locale="it" ctaLocation="marketing" />
              <a className="mka-btn-secondary" href="/it/blog/self-hosting-tracky-docker">
                Guida self-host Docker →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. ARCHITECTURE & PRIVACY */}
      <Section id="architecture" tone="parchment">
        <SectionHead
          kicker="Architettura aperta"
          title="Nessuna scatola nera tra te e i tuoi numeri."
          subtitle="Leggi lo schema dati, le formule di calcolo e i confini di sicurezza prima di affidare un solo euro a Tracky."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">Cosa c’è nel repository</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  DB
                </span>
                <div>
                  <strong>Backend Convex tipizzato su runtime standard</strong>
                  <span>
                    Logica backend, indici, invarianti di pianificazione e adattatori bancari stanno in{' '}
                    <code>convex/</code>. Le action applicative girano sul runtime standard (Web Crypto RS256 e fetch
                    nativa), salvando il denaro in unità minori intere più codice valuta.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  UI
                </span>
                <div>
                  <strong>Frontend TanStack Start (Worker + workerd in self-host)</strong>
                  <span>
                    Pagine pubbliche e area autenticata vivono in <code>src/</code>. In produzione girano su Cloudflare
                    Workers; in self-hosting Docker il Worker compilato gira in locale su <code>workerd</code> dietro un
                    edge proxy sulla porta 3000.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  DOC
                </span>
                <div>
                  <strong>Guide utente bilingui e architecture decision records</strong>
                  <span>
                    Le guide utente escono in italiano e inglese in <code>src/content/user-docs/</code>, insieme a{' '}
                    <code>docs/architecture.md</code>, <code>docs/self-hosting.it.md</code> e{' '}
                    <code>docs/decisions/</code> con le motivazioni di ogni scelta tecnica.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Privacy, telemetria e confini chiari</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  0
                </span>
                <div>
                  <strong>Zero telemetria di prodotto in self-host</strong>
                  <span>
                    Le build Docker disattivano PostHog (<code>VITE_POSTHOG_ENABLED=false</code>), beacon Convex (
                    <code>DISABLE_BEACON=true</code>) e telemetria Wrangler a tempo di build. Nella demo ospitata
                    PostHog EU resta spento finché non clicchi Accetta.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  KEY
                </span>
                <div>
                  <strong>Integrazioni opzionali con le tue chiavi</strong>
                  <span>
                    Enable Banking (sincronizzazione PSD2 valutata ogni sei ore), Analyst AI, report email Resend e
                    Telegram restano spenti finché non inserisci le tue chiavi. I maintainer non vedono mai le tue
                    credenziali bancarie.
                  </span>
                </div>
              </li>
            </ul>

            <div className="mka-disclosure-box">
              <strong>Un solo servizio esterno obbligatorio:</strong> anche nel self-hosting con Docker, l’accesso usa{' '}
              <strong>WorkOS AuthKit</strong> (servizio SaaS esterno con piano gratuito per sviluppatori). Oggi Tracky
              non è quindi completamente offline o isolato al 100%.
            </div>
          </div>
        </div>
      </Section>

      {/* 3. TWO WAYS TO RUN */}
      <Section id="run">
        <SectionHead
          kicker="Avvia la tua istanza"
          title="Docker Compose per il self-hosting, oppure Convex Cloud per sviluppare."
          subtitle="Non puntare mai un checkout al backend di qualcun altro. Scegli lo stack Docker per un server personale o avvia in locale con Vite e Convex Cloud."
        />

        <div className="mka-deploy-grid">
          <article className="mka-deploy-card">
            <div className="mka-deploy-head">
              <div>
                <h3>Docker Compose (Self-host)</h3>
                <p className="mka-deploy-sub">Volume SQLite Convex locale + container app</p>
              </div>
              <Chip tone="sage">Consigliato</Chip>
            </div>

            <ul className="mka-check-list">
              <li>Richiede Docker 24+ (Compose v2), Node.js 22 (per lo script di setup) e un account gratuito WorkOS AuthKit</li>
              <li>Lo script di setup non ha dipendenze npm e scrive un file <code>.env</code> con permessi <code>0600</code></li>
              <li>Immagini Convex pinnate per digest; telemetria di prodotto disattivata a tempo di build</li>
              <li>Supporta reverse proxy TLS opzionale (Caddy, Nginx, Traefik) e backup tar del volume</li>
            </ul>

            <CodePlate
              ariaLabel="Comandi per il self-hosting con Docker Compose"
              lines={[
                { text: 'git clone https://github.com/masushidotdev/tracky.git' },
                { text: 'cd tracky' },
                { text: 'node scripts/selfhost-setup.mjs' },
                { text: 'docker compose up -d' },
              ]}
            />

            <div className="mka-deploy-cta">
              <a className="mka-btn-secondary mka-btn-secondary--sm" href="/it/blog/self-hosting-tracky-docker">
                Guida Docker passo passo →
              </a>
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/docs/self-hosting.it.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                docs/self-hosting.it.md ↗
              </a>
            </div>
          </article>

          <article className="mka-deploy-card">
            <div className="mka-deploy-head">
              <div>
                <h3>Sviluppo locale e Convex Cloud</h3>
                <p className="mka-deploy-sub">Per chi contribuisce o fa deploy su Cloudflare Worker + Convex Cloud</p>
              </div>
              <Chip tone="cobalt">Node 22 + npm</Chip>
            </div>

            <ul className="mka-check-list">
              <li>Richiede Node.js <code>&gt;=22.23.4 &lt;23</code> (fissato in <code>.nvmrc</code>) e npm</li>
              <li><code>npx convex dev</code> configura un deployment Convex dev e un ambiente WorkOS AuthKit dev</li>
              <li><code>npm run dev</code> genera <code>WORKOS_COOKIE_PASSWORD</code> se assente e avvia Vite + Convex</li>
              <li><code>npm run deploy</code> pubblica le funzioni Convex e il Cloudflare Worker</li>
            </ul>

            <CodePlate
              ariaLabel="Comandi di sviluppo locale"
              lines={[
                { text: 'npm ci' },
                { text: 'npx convex dev' },
                { text: 'npm run dev' },
              ]}
            />

            <div className="mka-deploy-cta">
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/README.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                README.md ↗
              </a>
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/docs/deployment.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                docs/deployment.md ↗
              </a>
            </div>
          </article>
        </div>
      </Section>

      {/* 4. CONTRIBUTING & SECURITY */}
      <Section id="contribute" tone="parchment">
        <SectionHead
          kicker="Contributi e sicurezza"
          title="Pull request mirate e gestione rigorosa dei segreti."
          subtitle="Tracky è progettato per restare leggibile mentre cresce. Ogni modifica accompagna codice, test e documentazione in italiano e inglese."
        />

        <div className="mka-editorial-grid">
          <article className="mka-editorial-card">
            <h3>Come contribuire al progetto</h3>
            <p>
              Esplora prima la demo ospitata, poi apri una pull request focalizzata su <code>masushidotdev/tracky</code>:
              un solo tema per modifica, suite di test verde (<code>npm test</code>) e zero warning TypeScript o ESLint
              (<code>npm run lint</code>).
            </p>
            <ul className="mka-b1-plain-list">
              <li>
                <strong>Guide bilingui aggiornate insieme al codice:</strong> aggiorna sia{' '}
                <code>src/content/user-docs/en/</code> sia <code>it/</code> quando cambia un comportamento visibile.
              </li>
              <li>
                <strong>Solo dati fittizi:</strong> usa fixture stile Acme nei test e negli screenshot — mai nomi reali,
                IBAN, saldi o export bancari nei commit.
              </li>
              <li>
                <strong>Changelog gestito al merge:</strong> i maintainer aggiornano <code>CHANGELOG.md</code>, quindi le
                PR possono lasciarlo intatto.
              </li>
            </ul>
          </article>

          <article className="mka-editorial-card">
            <h3>Policy di sicurezza e chiavi</h3>
            <p>
              I segreti risiedono nelle variabili d’ambiente cifrate di Convex o nei segreti di Cloudflare Worker — mai
              in git, nel codice client o nelle variabili <code>VITE_*</code> visibili al browser. L’installazione delle
              dipendenze attiva <code>githooks/pre-commit</code> per bloccare file env e chiavi PEM; la CI ripete lo
              stesso controllo insieme alla scansione di pattern IBAN.
            </p>
            <p>
              Segnala eventuali vulnerabilità in privato tramite GitHub Security Advisories (mai in issue pubbliche),
              usando solo dati fittizi. Leggi la policy completa in{' '}
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                SECURITY.md ↗
              </a>
              .
            </p>
          </article>
        </div>
      </Section>

      {/* 5. FAQ */}
      <FaqSection
        id="faq"
        kicker="FAQ open source"
        title="Domande su licenza MIT, self-hosting e regole."
        subtitle="Risposte dirette allineate a README.md, SECURITY.md e docs/self-hosting.it.md."
        items={openSourceItFaq}
      />

      {/* 6. RELATED LINKS */}
      <RelatedLinksSection
        tone="parchment"
        kicker="Guide correlate"
        title="Esplora il resto del progetto."
        items={[
          {
            kicker: 'Guida Docker',
            title: 'Self-hosting di Tracky con Docker passo passo',
            description: 'Script interattivo, configurazione manuale openssl, backfill locale, reverse proxy TLS e backup.',
            href: '/it/blog/self-hosting-tracky-docker',
            ctaLabel: 'Leggi la guida Docker →',
          },
          {
            kicker: 'Note di rilascio',
            title: 'Tracky v0.1.0 — Primo rilascio pubblico',
            description: 'Cosa include la v0.1.0 taggata tra Piano, prestiti, import CSV, Report e sicurezza.',
            href: '/it/blog/tracky-v0-1-0',
            ctaLabel: 'Leggi le note v0.1.0 →',
          },
          {
            kicker: 'Prezzi',
            title: 'Confronto Demo ospitata vs Self-host',
            description: 'Tutte le funzioni incluse a €0 oggi e come è delimitato nel codice il piano Pro riservato.',
            href: '/it/prezzi',
            ctaLabel: 'Leggi i prezzi →',
          },
        ]}
      />

      {/* 7. FINAL CTA */}
      <FinalCta
        headline="Fiducia verificata in un codice che puoi leggere davvero."
        meta="Licenza MIT · Repository pubblico su GitHub · Self-hosting con Docker Compose"
        primaryCta={<AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            Esplora il codice su GitHub ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
