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
  FinalCta,
  Section,
  SectionHead,
} from '@/components/marketing/atelier';
import {
  B1ArticleEntry,
  B1ArticleFaqList,
  B1CodeBlock,
  RelatedLinksSection,
} from '@/components/marketing/atelier/b1-components';
import { loadMarketingAuth } from '@/lib/marketing/auth';
import { SITE_ORIGIN } from '@/lib/marketing/pages';
import {
  blogPostingJsonLd,
  breadcrumbJsonLd,
  buildMarketingHead,
  faqJsonLd,
  ogImageFor,
  softwareAppJsonLd,
} from '@/lib/marketing/seo';

const REPO_URL = 'https://github.com/masushidotdev/tracky';
const SELFHOST_DOC_URL = 'https://github.com/masushidotdev/tracky/blob/main/docs/self-hosting.it.md';
const V010_BLOG_URL = `${SITE_ORIGIN}/it/blog/tracky-v0-1-0`;
const WORKOS_URL = 'https://workos.com/';
const WORKOS_DASHBOARD_URL = 'https://dashboard.workos.com/';
const PUBLISH_DATE = '2026-11-26';

export const selfHostingDockerItFaq: Array<FaqItem> = [
  {
    q: 'Ho bisogno di WorkOS?',
    a: 'Sì. Tracky verifica i JWT RS256 di WorkOS e usa WorkOS AuthKit per il login e i cookie di sessione. WorkOS rimane un servizio SaaS esterno (con piano developer gratuito): oggi il self-hosting di Tracky non è ancora al 100% offline o indipendente.',
  },
  {
    q: 'C’è telemetria nella build self-hosted?',
    a: 'Nessuna telemetria di prodotto. PostHog è disattivato in modo forzato a build time (CLOUDFLARE_ENV=selfhost, VITE_POSTHOG_ENABLED=false), il beacon del backend Convex è disabilitato (DISABLE_BEACON=true) e telemetria, segnalazioni errori, controlli banner, Local Explorer di Wrangler e il fetch iniziale di Miniflare sono disattivati. WorkOS continua comunque a vedere i tuoi accessi perché è il provider di autenticazione.',
  },
  {
    q: 'Dove vengono salvati i miei dati e come faccio il backup?',
    a: 'Per impostazione predefinita Convex salva il database SQLite e i file caricati nel volume Docker convex-data (/convex/data). Ferma brevemente app e backend, archivia il volume con tar tramite un container debian:bookworm-slim e riavvia i servizi. Conserva una copia protetta di .env — in particolare INSTANCE_SECRET, INSTANCE_NAME e WORKOS_COOKIE_PASSWORD — insieme ai backup.',
  },
  {
    q: 'Posso eseguirlo su un VPS?',
    a: 'Sì. Metti un reverse proxy con terminazione TLS (Caddy, Nginx o Traefik) davanti alle porte 3000, 3210 (con supporto WebSocket e header Upgrade) e 3211, esegui lo script di configurazione con --public-url, --convex-url e --convex-site-url e ricostruisci con docker compose up -d --build. È pensato per il self-hosting personale o familiare su nodo singolo, non per lo scaling orizzontale multi-replica.',
  },
];

export const Route = createFileRoute('/it/blog/self-hosting-tracky-docker')({
  loader: loadMarketingAuth,
  head: () => {
    const title = 'Self-hosting di Tracky con Docker: guida passo passo';
    const description =
      'Avvia Tracky sul tuo server o PC con Docker Compose e Convex self-hosted. Zero telemetria di prodotto, configurazione guidata e limiti chiari.';
    const url = `${SITE_ORIGIN}/it/blog/self-hosting-tracky-docker`;
    const image = ogImageFor('blog-self-hosting-docker');

    return buildMarketingHead({
      title,
      description,
      locale: 'it',
      path: '/it/blog/self-hosting-tracky-docker',
      ogImage: image,
      jsonLd: [
        softwareAppJsonLd({ url, inLanguage: ['it', 'en'] }),
        blogPostingJsonLd({
          headline: title,
          description,
          url,
          image,
          datePublished: PUBLISH_DATE,
          dateModified: PUBLISH_DATE,
          inLanguage: 'it',
        }),
        faqJsonLd(selfHostingDockerItFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Self-hosting di Tracky con Docker', path: '/it/blog/self-hosting-tracky-docker' },
        ]),
      ],
    });
  },
  component: SelfHostingDockerIt,
});

function SelfHostingDockerIt() {
  const auth = Route.useLoaderData();
  return <SelfHostingDockerItView auth={auth} />;
}

export function SelfHostingDockerItView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="it" auth={auth} currentPath="/it/blog/self-hosting-tracky-docker">
      <article>
        {/* 1. ARTICLE HERO */}
        <header className="mka-hero mka-hero--page">
          <div className="mka-container">
            <div className="mka-hero-single">
              <Breadcrumb
                ariaLabel="Percorso di navigazione"
                items={[
                  { label: 'Home', href: `${SITE_ORIGIN}/it/` },
                  { label: 'Self-hosting di Tracky con Docker' },
                ]}
              />

              <ChipRow>
                <Chip tone="cobalt">Guida</Chip>
                <Chip tone="sage">Docker Compose</Chip>
                <time className="mka-stamp" dateTime={PUBLISH_DATE}>
                  26 nov 2026
                </time>
                <Chip tone="marigold">Licenza MIT</Chip>
              </ChipRow>

              <h1 className="mka-hero-headline">
                Self-hosting di Tracky <span className="mka-accent-ink">con Docker,</span> passo passo.
              </h1>

              <p className="mka-hero-dek">
                Avvia Tracky sul tuo PC o VPS con <strong>Docker Compose</strong> e un backend Convex self-hosted. Zero
                telemetria di prodotto, codice MIT e chiarezza sull’unico servizio esterno ancora necessario: WorkOS.
              </p>

              <aside aria-label="Collegamenti per il self-hosting" className="mka-hero-actions">
                <a className="mka-btn-primary mka-btn-primary--lg" href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  Scarica Tracky su GitHub ↗
                </a>
                <a className="mka-btn-secondary" href={SELFHOST_DOC_URL} target="_blank" rel="noopener noreferrer">
                  Leggi docs/self-hosting.it.md ↗
                </a>
              </aside>
            </div>
          </div>
        </header>

        {/* 2. INTRO */}
        <Section tone="parchment">
          <div className="mka-b1-prose">
            <p>
              Il self-hosting con Docker è arrivato sul branch <code>main</code> di{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                masushidotdev/tracky
              </a>{' '}
              dopo la v0.1.0. Se hai letto il <a href={V010_BLOG_URL}>post di rilascio di Tracky v0.1.0</a>,
              quell’articolo descrive la vecchia configurazione basata su Node e Convex Cloud. Su <code>main</code> puoi
              ora avviare sia l’app TanStack Start sia il backend Convex self-hosted con Docker Compose.
            </p>
            <p>
              Qui trovi tutti i passaggi — in locale o su un VPS pubblico — con i comandi esatti di{' '}
              <a href={SELFHOST_DOC_URL} target="_blank" rel="noopener noreferrer">
                docs/self-hosting.it.md
              </a>{' '}
              e senza nascondere i limiti.
            </p>
          </div>
        </Section>

        {/* 3. BEFORE YOU START */}
        <Section id="before-you-start">
          <SectionHead
            kicker="Prerequisiti"
            title="Prima di iniziare"
            subtitle="Cosa resta sul tuo disco, quali strumenti servono e perché WorkOS AuthKit rimane esterno."
          />

          <div className="mka-b1-article-stack">
            <B1ArticleEntry num="01" title="Perché il self-hosting">
              <p>
                I dati restano sul tuo disco: per impostazione predefinita Convex salva il database SQLite e lo storage
                locale nel volume Docker <code>convex-data</code> (<code>/convex/data</code>). Il codice ha licenza MIT,
                puoi leggerlo e fissarlo; le immagini ufficiali di backend e dashboard Convex sono pinnate per digest in{' '}
                <code>docker-compose.yml</code>. Nella build self-hosted non c’è telemetria di prodotto e le integrazioni
                opzionali — Enable Banking, Analyst AI, Resend, Telegram — restano spente finché non inserisci le tue
                chiavi.
              </p>
            </B1ArticleEntry>

            <B1ArticleEntry num="02" title="Cosa serve (compreso WorkOS)">
              <p>
                Servono Docker 24+ con Docker Compose v2, Node.js 22 solo per eseguire lo script di configurazione (zero
                dipendenze npm, quindi <code>npm ci</code> non è necessario) e un account gratuito{' '}
                <a href={WORKOS_URL} target="_blank" rel="noopener noreferrer">
                  WorkOS
                </a>{' '}
                (AuthKit).
              </p>
              <p>
                Vale la pena dirlo subito: WorkOS è obbligatorio ed esterno. Tracky verifica i JWT RS256 di WorkOS e usa
                WorkOS AuthKit per il login e i cookie di sessione. WorkOS rimane un servizio SaaS esterno (con piano
                developer gratuito). Oggi questo significa che il self-hosting non è ancora al 100% offline né
                completamente indipendente.
              </p>
            </B1ArticleEntry>
          </div>
        </Section>

        {/* 4. QUICK START */}
        <Section id="quick-start" tone="parchment">
          <SectionHead
            kicker="Installazione"
            title="Avvio rapido"
            subtitle="Usa lo script senza dipendenze oppure genera i segreti e configura WorkOS manualmente."
          />

          <div className="mka-b1-article-stack">
            <B1ArticleEntry num="03" title="Esegui lo script e avvia Compose">
              <p>Clona il repository, lancia lo script di configurazione e avvia i container:</p>
              <B1CodeBlock>{`git clone https://github.com/masushidotdev/tracky.git
cd tracky
node scripts/selfhost-setup.mjs
docker compose up -d`}</B1CodeBlock>
              <p>
                In alternativa puoi usare <code>npm run selfhost:setup</code>, che richiama esattamente{' '}
                <code>node scripts/selfhost-setup.mjs</code>. Quando i container sono pronti, apri{' '}
                <code>http://localhost:3000</code>.
              </p>
              <p>
                Lo script chiede il Client ID (<code>client_...</code>) e l’API key (<code>sk_...</code>, con input
                nascosto) di WorkOS, configura Redirect URI, App Homepage URL e CORS origin tramite le API di WorkOS,
                genera i segreti casuali mancanti (<code>INSTANCE_SECRET</code>, <code>WORKOS_COOKIE_PASSWORD</code> e un{' '}
                <code>WORKOS_WEBHOOK_SECRET</code> segnaposto per installazioni locali/LAN) e scrive <code>.env</code> in
                modo atomico con permessi <code>0600</code>. Eseguirlo di nuovo è idempotente e mantiene segreti e
                variabili personalizzate già presenti.
              </p>
              <p>
                Flag utili: <code>--dry-run</code> mostra le chiamate alle API WorkOS e le modifiche previste a{' '}
                <code>.env</code> senza effettuare richieste di rete né scrivere file; <code>--yes</code> attiva la
                modalità non interattiva leggendo <code>WORKOS_CLIENT_ID</code> e <code>WORKOS_API_KEY</code>{' '}
                dall’ambiente o da un <code>.env</code> esistente.
              </p>
            </B1ArticleEntry>

            <B1ArticleEntry num="04" title="Preferisci farlo a mano?">
              <p>
                Copia il file di esempio e genera i segreti necessari con <code>openssl</code>:
              </p>
              <B1CodeBlock>{`cp .env.selfhost.example .env
openssl rand -hex 32          # -> INSTANCE_SECRET
openssl rand -base64 32       # -> WORKOS_COOKIE_PASSWORD (almeno 32 caratteri)
echo "whsec_$(openssl rand -hex 16)" # -> segnaposto WORKOS_WEBHOOK_SECRET per uso locale/LAN (richiede backfill; vedi sotto)`}</B1CodeBlock>
              <p>
                Compila <code>.env</code> con <code>WORKOS_CLIENT_ID</code>, <code>WORKOS_API_KEY</code> e i segreti
                generati. Su{' '}
                <a href={WORKOS_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
                  dashboard.workos.com
                </a>{' '}
                aggiungi <code>http://localhost:3000/callback</code> nella sezione <strong>Redirects</strong>, poi esegui{' '}
                <code>docker compose up -d</code>.
              </p>
            </B1ArticleEntry>
          </div>
        </Section>

        {/* 5. FIRST SIGN-UP & OPTIONAL TOOLS */}
        <Section id="first-signup">
          <SectionHead
            kicker="Primo accesso e strumenti"
            title="Primo accesso e strumenti opzionali"
            subtitle="Sincronizzazione utente in locale/LAN, dashboard Convex e integrazioni facoltative."
          />

          <div className="mka-b1-article-stack">
            <B1ArticleEntry num="05" title="Prima registrazione in locale o in LAN">
              <p>
                Tracky crea il profilo utente e apre l’app solo quando il record esiste nella tabella AuthKit di Convex —
                un JWT WorkOS valido da solo lascia il login in attesa di retry. In locale o su una LAN privata WorkOS
                non può raggiungere il tuo host con i webhook. Dopo la registrazione di ogni nuovo utente esegui:
              </p>
              <B1CodeBlock>{`docker compose --profile tools run --rm convex-backfill`}</B1CodeBlock>
              <p>
                Il comando esegue <code>auth:backfillUsers</code>, importando in Convex gli utenti letti dalle API
                WorkOS. Su installazioni esposte su Internet usa invece il webhook WorkOS verso{' '}
                <code>https://&lt;tuo-convex-site&gt;/workos/webhook</code> con gli eventi <code>user.created</code>,{' '}
                <code>user.updated</code> e <code>user.deleted</code>, salvando il signing secret in{' '}
                <code>WORKOS_WEBHOOK_SECRET</code>. Senza webhook, gli eventi <code>user.updated</code> e{' '}
                <code>user.deleted</code> non vengono sincronizzati automaticamente.
              </p>
            </B1ArticleEntry>

            <B1ArticleEntry num="06" title="Dashboard Convex e integrazioni opzionali">
              <p>
                Per avviare la dashboard web Convex opzionale su <code>http://localhost:6791</code>:
              </p>
              <B1CodeBlock>{`docker compose --profile dashboard up -d`}</B1CodeBlock>
              <p>Ottieni la admin key per accedere con:</p>
              <B1CodeBlock>{`docker compose exec backend ./generate_admin_key.sh`}</B1CodeBlock>
              <p>
                Non esporre mai pubblicamente la porta <code>6791</code>. Le integrazioni opzionali restano spente finché
                non valorizzi le rispettive variabili in <code>.env</code>: Enable Banking (<code>ENABLE_BANKING_*</code>
                ), Analyst AI (<code>VITE_ANALYST_ENABLED=true</code> più <code>AI_GATEWAY_API_KEY</code> o{' '}
                <code>OPENROUTER_API_KEY</code>, con rebuild di <code>app</code>), Resend (<code>RESEND_API_KEY</code>,{' '}
                <code>RESEND_FROM_EMAIL</code>, <code>RESEND_WEBHOOK_SECRET</code>) e Telegram (
                <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_WEBHOOK_SECRET</code>, <code>TELEGRAM_WEBHOOK_URL</code>
                ).
              </p>
            </B1ArticleEntry>
          </div>
        </Section>

        {/* 6. GOING PUBLIC, UPGRADING & BACKUPS */}
        <Section id="operations" tone="parchment">
          <SectionHead
            kicker="Gestione"
            title="Esposizione pubblica, aggiornamenti e backup"
            subtitle="Instradamento reverse proxy TLS, aggiornamenti puliti e snapshot del volume SQLite."
          />

          <div className="mka-b1-article-stack">
            <B1ArticleEntry num="07" title="Reverse proxy con TLS">
              <p>
                Usa Caddy, Nginx o Traefik per terminare TLS e inoltrare tre hostname: il dominio dell’app verso{' '}
                <code>127.0.0.1:3000</code>, il dominio delle API Convex verso <code>127.0.0.1:3210</code> (con supporto
                WebSocket e header <code>Upgrade</code>) e il dominio Convex site verso <code>127.0.0.1:3211</code> (per
                i webhook in ingresso).
              </p>
              <p>
                Riesegui lo script indicando i tuoi URL pubblici — preserva i segreti esistenti, imposta{' '}
                <code>DO_NOT_REQUIRE_SSL=false</code>, aggiorna redirect/CORS/homepage su WorkOS e registra il webhook:
              </p>
              <B1CodeBlock>{`node scripts/selfhost-setup.mjs \\
  --public-url https://tracky.example.com \\
  --convex-url https://convex.example.com \\
  --convex-site-url https://convex-site.example.com`}</B1CodeBlock>
              <p>
                Poi ricostruisci e riavvia così che il nuovo <code>VITE_CONVEX_URL</code> build-time venga incorporato
                nel bundle client:
              </p>
              <B1CodeBlock>{`docker compose up -d --build`}</B1CodeBlock>
            </B1ArticleEntry>

            <B1ArticleEntry num="08" title="Aggiornamento">
              <p>Fai prima un backup del volume, poi scarica il codice aggiornato e ricostruisci:</p>
              <B1CodeBlock>{`git pull
docker compose up -d --build`}</B1CodeBlock>
              <p>
                Il servizio one-shot <code>convex-deploy</code> gira automaticamente prima del riavvio di{' '}
                <code>app</code>, aggiornando schema e funzioni Convex e riallineando le variabili d’ambiente consentite.
              </p>
            </B1ArticleEntry>

            <B1ArticleEntry num="09" title="Backup e ripristino">
              <p>
                Entrambi i comandi richiedono <code>jq</code> per ricavare il nome del volume Compose. Ferma brevemente{' '}
                <code>app</code> e <code>backend</code> per uno snapshot SQLite coerente di <code>convex-data</code>:
              </p>
              <B1CodeBlock>{`docker compose stop app backend
docker run --rm \\
  -v "$(docker compose config --format json | jq -r '.name')_convex-data:/data:ro" \\
  -v "$PWD:/backup" \\
  debian:bookworm-slim \\
  tar czf "/backup/tracky-convex-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .
docker compose start backend app`}</B1CodeBlock>
              <p>Per ripristinare un archivio:</p>
              <B1CodeBlock>{`docker compose stop app backend
docker run --rm \\
  -v "$(docker compose config --format json | jq -r '.name')_convex-data:/data" \\
  -v "$PWD:/backup:ro" \\
  debian:bookworm-slim \\
  sh -c 'rm -rf /data/* && tar xzf /backup/tracky-convex-YYYYMMDD-HHMMSS.tar.gz -C /data'
docker compose up -d`}</B1CodeBlock>
              <p>
                Conserva una copia protetta di <code>.env</code> insieme ai backup — in particolare{' '}
                <code>INSTANCE_SECRET</code>, <code>INSTANCE_NAME</code> e <code>WORKOS_COOKIE_PASSWORD</code>.
              </p>
            </B1ArticleEntry>
          </div>
        </Section>

        {/* 7. PRIVACY & HONEST LIMITS */}
        <Section id="limits">
          <SectionHead
            kicker="Confini"
            title="Privacy e limiti reali"
            subtitle="Ogni flag di telemetria disattivato a tempo di build e l’ambito su nodo singolo di questo stack."
          />

          <div className="mka-b1-article-stack">
            <B1ArticleEntry num="10" title="Zero telemetria di prodotto">
              <p>
                La build self-hosted disattiva ogni raccolta telemetrica sotto il nostro controllo. PostHog è
                disabilitato in modo forzato a build time (<code>CLOUDFLARE_ENV=selfhost</code>,{' '}
                <code>VITE_POSTHOG_ENABLED=false</code>, senza chiavi né host di raccolta nel bundle). Il beacon del
                backend Convex è spento (<code>DISABLE_BEACON=true</code>). Sono disattivati anche telemetria,
                segnalazioni errori, controlli banner, Local Explorer di Wrangler e il fetch iniziale di{' '}
                <code>workers.cloudflare.com/cf.json</code> da parte di Miniflare.
              </p>
              <p>Per precisione: WorkOS continua a vedere i tuoi accessi perché è il provider di autenticazione.</p>
            </B1ArticleEntry>

            <B1ArticleEntry num="11" title="Limiti, senza giri di parole">
              <p>
                Questa configurazione è pensata per il self-hosting personale o familiare su nodo singolo, non per lo
                scaling orizzontale multi-replica. Tracky compila come Cloudflare Worker — non esiste un target server
                Node. Il container <code>app</code> esegue il Worker localmente su <code>workerd</code> tramite il
                runtime locale di Wrangler dietro un edge proxy Node integrato sulla porta <code>3000</code> che blocca
                gli endpoint locali <code>/cdn-cgi/*</code>.
              </p>
              <p>
                Di default Convex usa SQLite e storage locale su nodo singolo nel volume <code>convex-data</code> (il
                backend Convex supporta comunque le variabili opzionali <code>POSTGRES_URL</code>, <code>MYSQL_URL</code>{' '}
                e bucket S3 elencate in <code>.env.selfhost.example</code>).
              </p>
            </B1ArticleEntry>
          </div>
        </Section>

        {/* 8. FAQ */}
        <Section id="faq" tone="parchment">
          <SectionHead
            kicker="FAQ sul self-hosting"
            title="Domande su WorkOS, telemetria, backup e VPS."
            subtitle="Risposte dirette allineate a docker-compose.yml e docs/self-hosting.it.md."
          />
          <B1ArticleFaqList items={selfHostingDockerItFaq} />
        </Section>
      </article>

      {/* OUTSIDE <article>: RELATED + FINAL CTA */}
      <RelatedLinksSection
        kicker="Continua a leggere"
        title="Altre guide e note di rilascio del progetto."
        items={[
          {
            kicker: 'Open source',
            title: 'Architettura, licenza MIT e contributi',
            description: 'Esplora la struttura del repository, la policy di sicurezza e i comandi di sviluppo.',
            href: '/it/open-source',
            ctaLabel: 'Leggi Open Source →',
          },
          {
            kicker: 'Note di rilascio',
            title: 'Tracky v0.1.0 — Primo rilascio pubblico',
            description: 'Cosa include la v0.1.0 taggata tra Piano, prestiti, import CSV e sicurezza.',
            href: '/it/blog/tracky-v0-1-0',
            ctaLabel: 'Leggi le note v0.1.0 →',
          },
          {
            kicker: 'Prezzi',
            title: 'Demo ospitata €0 vs self-host MIT',
            description: 'Confronto completo delle funzionalità tra demo ospitata e self-host Docker.',
            href: '/it/prezzi',
            ctaLabel: 'Leggi i prezzi →',
          },
        ]}
      />

      <FinalCta
        headline="Il tuo server. Il tuo registro."
        meta="Docker Compose · Convex self-hosted · Zero telemetria di prodotto · Licenza MIT"
        primaryCta={<AuthCta auth={auth} locale="it" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Scarica Tracky su GitHub ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
