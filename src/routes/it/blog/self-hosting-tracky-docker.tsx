import { createFileRoute } from '@tanstack/react-router';
import type { MarketingAuth } from '@/components/marketing/site';
import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
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

const inlineLinkStyle = {
  color: 'inherit',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
} as const;

const codeBlockStyle = {
  background: 'var(--mk-paper)',
  color: 'var(--mk-ink)',
  border: '2px solid var(--mk-ink)',
  borderRadius: 'var(--mk-r)',
  padding: '14px 18px',
  overflowX: 'auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 14,
  lineHeight: 1.55,
  margin: '12px 0',
} as const;

const cardStyle = {
  maxWidth: 760,
  margin: '0 auto 16px',
  minWidth: 0,
  transform: 'none',
} as const;

const faq = [
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
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
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
  const { user, signUpUrl } = auth;
  const demoHref = user ? '/app' : signUpUrl;

  return (
    <MarketingSite locale="it" auth={auth} currentPath="/it/blog/self-hosting-tracky-docker">
      <article>
        <header className="mk-hero">
          <Reveal>
            <div className="mk-badges">
              <span className="mk-badge solid">Guida</span>
              <span className="mk-badge">Docker</span>
              <time className="mk-badge" dateTime={PUBLISH_DATE}>
                26 nov 2026
              </time>
              <span className="mk-badge">MIT</span>
            </div>
          </Reveal>
          <Reveal>
            <h1>
              Tracky su <span className="hl">Docker</span>
              <br />
              <span className="stroke">passo passo.</span>
            </h1>
          </Reveal>
          <Reveal>
            <p className="mk-dek">
              Avvia Tracky sul tuo PC o VPS con <b>Docker Compose</b> e un backend Convex self-hosted. Zero telemetria
              di prodotto, codice MIT e chiarezza sull’unico servizio esterno ancora necessario: WorkOS.
            </p>
          </Reveal>
          <Reveal>
            <aside aria-label="Collegamenti per il self-hosting" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <MagnetCta href={REPO_URL}>Scarica Tracky su GitHub →</MagnetCta>
              <MagnetCta href={SELFHOST_DOC_URL} variant="pill">
                Leggi docs/self-hosting.it.md →
              </MagnetCta>
            </aside>
          </Reveal>
        </header>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <p className="mk-sub" style={{ maxWidth: 720 }}>
              Il self-hosting con Docker è arrivato sul branch <code>main</code> di{' '}
              <a href={REPO_URL} rel="noopener" style={inlineLinkStyle}>
                masushidotdev/tracky
              </a>{' '}
              dopo la v0.1.0. Se hai letto il{' '}
              <a href={V010_BLOG_URL} style={inlineLinkStyle}>
                post di rilascio di Tracky v0.1.0
              </a>
              , quell’articolo descrive la vecchia configurazione basata su Node e Convex Cloud. Su <code>main</code>{' '}
              puoi ora avviare sia l’app TanStack Start sia il backend Convex self-hosted con Docker Compose.
            </p>
            <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>
              Qui trovi tutti i passaggi — in locale o su un VPS pubblico — con i comandi esatti di{' '}
              <a href={SELFHOST_DOC_URL} rel="noopener" style={inlineLinkStyle}>
                docs/self-hosting.it.md
              </a>{' '}
              e senza nascondere i limiti.
            </p>
          </Reveal>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              Prima di iniziare
            </h2>
          </Reveal>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">01</div>
                <h3>PERCHÉ IL SELF-HOSTING</h3>
                <p>
                  I dati restano sul tuo disco: per impostazione predefinita Convex salva il database SQLite e lo
                  storage locale nel volume Docker <code>convex-data</code> (<code>/convex/data</code>). Il codice ha
                  licenza MIT, puoi leggerlo e fissarlo; le immagini ufficiali di backend e dashboard Convex sono
                  pinnate per digest in <code>docker-compose.yml</code>. Nella build self-hosted non c’è telemetria di
                  prodotto e le integrazioni opzionali — Enable Banking, Analyst AI, Resend, Telegram — restano spente
                  finché non inserisci le tue chiavi.
                </p>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">02</div>
                <h3>COSA SERVE (COMPRESO WORKOS)</h3>
                <p>
                  Servono Docker 24+ con Docker Compose v2, Node.js 22 solo per eseguire lo script di configurazione
                  (zero dipendenze npm, quindi <code>npm ci</code> non è necessario) e un account gratuito{' '}
                  <a href={WORKOS_URL} rel="noopener" style={inlineLinkStyle}>
                    WorkOS
                  </a>{' '}
                  (AuthKit).
                </p>
                <p style={{ marginTop: 10 }}>
                  Vale la pena dirlo subito: WorkOS è obbligatorio ed esterno. Tracky verifica i JWT RS256 di WorkOS e
                  usa WorkOS AuthKit per il login e i cookie di sessione. WorkOS rimane un servizio SaaS esterno (con
                  piano developer gratuito). Oggi questo significa che il self-hosting non è ancora al 100% offline né
                  completamente indipendente.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              Avvio rapido
            </h2>
          </Reveal>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">03</div>
                <h3>ESEGUI LO SCRIPT E AVVIA COMPOSE</h3>
                <p>Clona il repository, lancia lo script di configurazione e avvia i container:</p>
                <pre style={codeBlockStyle}>
                  <code>{`git clone https://github.com/masushidotdev/tracky.git
cd tracky
node scripts/selfhost-setup.mjs
docker compose up -d`}</code>
                </pre>
                <p>
                  In alternativa puoi usare <code>npm run selfhost:setup</code>, che richiama esattamente{' '}
                  <code>node scripts/selfhost-setup.mjs</code>. Quando i container sono pronti, apri{' '}
                  <code>http://localhost:3000</code>.
                </p>
                <p style={{ marginTop: 10 }}>
                  Lo script chiede il Client ID (<code>client_...</code>) e l’API key (<code>sk_...</code>, con input
                  nascosto) di WorkOS, configura Redirect URI, App Homepage URL e CORS origin tramite le API di WorkOS,
                  genera i segreti casuali mancanti (<code>INSTANCE_SECRET</code>, <code>WORKOS_COOKIE_PASSWORD</code> e
                  un <code>WORKOS_WEBHOOK_SECRET</code> segnaposto per installazioni locali/LAN) e scrive{' '}
                  <code>.env</code> in modo atomico con permessi <code>0600</code>. Eseguirlo di nuovo è idempotente e
                  mantiene segreti e variabili personalizzate già presenti.
                </p>
                <p style={{ marginTop: 10 }}>
                  Flag utili: <code>--dry-run</code> mostra le chiamate alle API WorkOS e le modifiche previste a{' '}
                  <code>.env</code> senza effettuare richieste di rete né scrivere file; <code>--yes</code> attiva la
                  modalità non interattiva leggendo <code>WORKOS_CLIENT_ID</code> e <code>WORKOS_API_KEY</code>{' '}
                  dall’ambiente o da un <code>.env</code> esistente.
                </p>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">04</div>
                <h3>PREFERISCI FARLO A MANO?</h3>
                <p>
                  Copia il file di esempio e genera i segreti necessari con <code>openssl</code>:
                </p>
                <pre style={codeBlockStyle}>
                  <code>{`cp .env.selfhost.example .env
openssl rand -hex 32          # -> INSTANCE_SECRET
openssl rand -base64 32       # -> WORKOS_COOKIE_PASSWORD (almeno 32 caratteri)
echo "whsec_$(openssl rand -hex 16)" # -> segnaposto WORKOS_WEBHOOK_SECRET per uso locale/LAN (richiede backfill; vedi sotto)`}</code>
                </pre>
                <p>
                  Compila <code>.env</code> con <code>WORKOS_CLIENT_ID</code>, <code>WORKOS_API_KEY</code> e i segreti
                  generati. Su{' '}
                  <a href={WORKOS_DASHBOARD_URL} rel="noopener" style={inlineLinkStyle}>
                    dashboard.workos.com
                  </a>{' '}
                  aggiungi <code>http://localhost:3000/callback</code> nella sezione <strong>Redirects</strong>, poi
                  esegui <code>docker compose up -d</code>.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              Primo accesso e strumenti opzionali
            </h2>
          </Reveal>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">05</div>
                <h3>PRIMA REGISTRAZIONE IN LOCALE O IN LAN</h3>
                <p>
                  Tracky crea il profilo utente e apre l’app solo quando il record esiste nella tabella AuthKit di
                  Convex — un JWT WorkOS valido da solo lascia il login in attesa di retry. In locale o su una LAN
                  privata WorkOS non può raggiungere il tuo host con i webhook. Dopo la registrazione di ogni nuovo
                  utente esegui:
                </p>
                <pre style={codeBlockStyle}>
                  <code>{`docker compose --profile tools run --rm convex-backfill`}</code>
                </pre>
                <p>
                  Il comando esegue <code>auth:backfillUsers</code>, importando in Convex gli utenti letti dalle API
                  WorkOS. Su installazioni esposte su Internet usa invece il webhook WorkOS verso{' '}
                  <code>https://&lt;tuo-convex-site&gt;/workos/webhook</code> con gli eventi <code>user.created</code>,{' '}
                  <code>user.updated</code> e <code>user.deleted</code>, salvando il signing secret in{' '}
                  <code>WORKOS_WEBHOOK_SECRET</code>. Senza webhook, gli eventi <code>user.updated</code> e{' '}
                  <code>user.deleted</code> non vengono sincronizzati automaticamente.
                </p>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">06</div>
                <h3>DASHBOARD CONVEX E INTEGRAZIONI OPZIONALI</h3>
                <p>
                  Per avviare la dashboard web Convex opzionale su <code>http://localhost:6791</code>:
                </p>
                <pre style={codeBlockStyle}>
                  <code>{`docker compose --profile dashboard up -d`}</code>
                </pre>
                <p>Ottieni la admin key per accedere con:</p>
                <pre style={codeBlockStyle}>
                  <code>{`docker compose exec backend ./generate_admin_key.sh`}</code>
                </pre>
                <p>
                  Non esporre mai pubblicamente la porta <code>6791</code>. Le integrazioni opzionali restano spente
                  finché non valorizzi le rispettive variabili in <code>.env</code>: Enable Banking (
                  <code>ENABLE_BANKING_*</code>), Analyst AI (<code>VITE_ANALYST_ENABLED=true</code> più{' '}
                  <code>AI_GATEWAY_API_KEY</code> o <code>OPENROUTER_API_KEY</code>, con rebuild di <code>app</code>),
                  Resend (<code>RESEND_API_KEY</code>, <code>RESEND_FROM_EMAIL</code>,{' '}
                  <code>RESEND_WEBHOOK_SECRET</code>) e Telegram (<code>TELEGRAM_BOT_TOKEN</code>,{' '}
                  <code>TELEGRAM_WEBHOOK_SECRET</code>, <code>TELEGRAM_WEBHOOK_URL</code>).
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              Esposizione pubblica, aggiornamenti e backup
            </h2>
          </Reveal>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">07</div>
                <h3>REVERSE PROXY CON TLS</h3>
                <p>
                  Usa Caddy, Nginx o Traefik per terminare TLS e inoltrare tre hostname: il dominio dell’app verso{' '}
                  <code>127.0.0.1:3000</code>, il dominio delle API Convex verso <code>127.0.0.1:3210</code> (con
                  supporto WebSocket e header <code>Upgrade</code>) e il dominio Convex site verso{' '}
                  <code>127.0.0.1:3211</code> (per i webhook in ingresso).
                </p>
                <p style={{ marginTop: 10 }}>
                  Riesegui lo script indicando i tuoi URL pubblici — preserva i segreti esistenti, imposta{' '}
                  <code>DO_NOT_REQUIRE_SSL=false</code>, aggiorna redirect/CORS/homepage su WorkOS e registra il
                  webhook:
                </p>
                <pre style={codeBlockStyle}>
                  <code>{`node scripts/selfhost-setup.mjs \\
  --public-url https://tracky.example.com \\
  --convex-url https://convex.example.com \\
  --convex-site-url https://convex-site.example.com`}</code>
                </pre>
                <p>
                  Poi ricostruisci e riavvia così che il nuovo <code>VITE_CONVEX_URL</code> build-time venga incorporato
                  nel bundle client:
                </p>
                <pre style={codeBlockStyle}>
                  <code>{`docker compose up -d --build`}</code>
                </pre>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">08</div>
                <h3>AGGIORNAMENTO</h3>
                <p>Fai prima un backup del volume, poi scarica il codice aggiornato e ricostruisci:</p>
                <pre style={codeBlockStyle}>
                  <code>{`git pull
docker compose up -d --build`}</code>
                </pre>
                <p>
                  Il servizio one-shot <code>convex-deploy</code> gira automaticamente prima del riavvio di{' '}
                  <code>app</code>, aggiornando schema e funzioni Convex e riallineando le variabili d’ambiente
                  consentite.
                </p>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">09</div>
                <h3>BACKUP E RIPRISTINO</h3>
                <p>
                  Entrambi i comandi richiedono <code>jq</code> per ricavare il nome del volume Compose. Ferma
                  brevemente <code>app</code> e <code>backend</code> per uno snapshot SQLite coerente di{' '}
                  <code>convex-data</code>:
                </p>
                <pre style={codeBlockStyle}>
                  <code>{`docker compose stop app backend
docker run --rm \\
  -v "$(docker compose config --format json | jq -r '.name')_convex-data:/data:ro" \\
  -v "$PWD:/backup" \\
  debian:bookworm-slim \\
  tar czf "/backup/tracky-convex-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .
docker compose start backend app`}</code>
                </pre>
                <p>Per ripristinare un archivio:</p>
                <pre style={codeBlockStyle}>
                  <code>{`docker compose stop app backend
docker run --rm \\
  -v "$(docker compose config --format json | jq -r '.name')_convex-data:/data" \\
  -v "$PWD:/backup:ro" \\
  debian:bookworm-slim \\
  sh -c 'rm -rf /data/* && tar xzf /backup/tracky-convex-YYYYMMDD-HHMMSS.tar.gz -C /data'
docker compose up -d`}</code>
                </pre>
                <p>
                  Conserva una copia protetta di <code>.env</code> insieme ai backup — in particolare{' '}
                  <code>INSTANCE_SECRET</code>, <code>INSTANCE_NAME</code> e <code>WORKOS_COOKIE_PASSWORD</code>.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              Privacy e limiti reali
            </h2>
          </Reveal>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">10</div>
                <h3>ZERO TELEMETRIA DI PRODOTTO</h3>
                <p>
                  La build self-hosted disattiva ogni raccolta telemetrica sotto il nostro controllo. PostHog è
                  disabilitato in modo forzato a build time (<code>CLOUDFLARE_ENV=selfhost</code>,{' '}
                  <code>VITE_POSTHOG_ENABLED=false</code>, senza chiavi né host di raccolta nel bundle). Il beacon del
                  backend Convex è spento (<code>DISABLE_BEACON=true</code>). Sono disattivati anche telemetria,
                  segnalazioni errori, controlli banner, Local Explorer di Wrangler e il fetch iniziale di{' '}
                  <code>workers.cloudflare.com/cf.json</code> da parte di Miniflare.
                </p>
                <p style={{ marginTop: 10 }}>
                  Per precisione: WorkOS continua a vedere i tuoi accessi perché è il provider di autenticazione.
                </p>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">11</div>
                <h3>LIMITI, SENZA GIRI DI PAROLE</h3>
                <p>
                  Questa configurazione è pensata per il self-hosting personale o familiare su nodo singolo, non per lo
                  scaling orizzontale multi-replica. Tracky compila come Cloudflare Worker — non esiste un target server
                  Node. Il container <code>app</code> esegue il Worker localmente su <code>workerd</code> tramite il
                  runtime locale di Wrangler dietro un edge proxy Node integrato sulla porta <code>3000</code> che
                  blocca gli endpoint locali <code>/cdn-cgi/*</code>.
                </p>
                <p style={{ marginTop: 10 }}>
                  Di default Convex usa SQLite e storage locale su nodo singolo nel volume <code>convex-data</code> (il
                  backend Convex supporta comunque le variabili opzionali <code>POSTGRES_URL</code>,{' '}
                  <code>MYSQL_URL</code> e bucket S3 elencate in <code>.env.selfhost.example</code>).
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>
              Domande e risposte.
            </h2>
          </Reveal>
          {faq.map((entry) => (
            <Reveal key={entry.q}>
              <details>
                <summary>{entry.q}</summary>
                <p style={{ marginTop: 8 }}>{entry.a}</p>
              </details>
            </Reveal>
          ))}
        </section>
      </article>

      <MarqueeBand items={['DOCKER COMPOSE', 'CONVEX SELF-HOSTED', 'ZERO TELEMETRIA', 'LICENZA MIT']} />

      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Il tuo server. I tuoi conti.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Docker Compose · Convex self-hosted · Licenza MIT</p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <MagnetCta href={REPO_URL}>Avvialo sul tuo server →</MagnetCta>
              <MagnetCta href={SELFHOST_DOC_URL} variant="pill">
                Guida al self-hosting →
              </MagnetCta>
              <MagnetCta
                href={demoHref}
                variant="pill"
                onClick={() =>
                  user
                    ? undefined
                    : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
                }
              >
                {user ? 'Apri la demo →' : 'Prova la demo gratis →'}
              </MagnetCta>
            </div>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
