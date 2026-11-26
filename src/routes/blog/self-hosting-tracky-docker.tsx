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
const SELFHOST_DOC_URL = 'https://github.com/masushidotdev/tracky/blob/main/docs/self-hosting.md';
const V010_BLOG_URL = `${SITE_ORIGIN}/blog/tracky-v0-1-0`;
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
    q: 'Do I need WorkOS?',
    a: 'Yes. Tracky verifies WorkOS RS256 JWTs and uses WorkOS AuthKit for sign-in and session cookies. WorkOS remains an external SaaS (a free developer tier is available), which means self-hosting Tracky is not 100% offline or independent today.',
  },
  {
    q: 'Is there telemetry in the self-hosted build?',
    a: 'No product telemetry. PostHog analytics is hard-disabled at build time (CLOUDFLARE_ENV=selfhost, VITE_POSTHOG_ENABLED=false), the Convex backend beacon is disabled (DISABLE_BEACON=true), and Wrangler telemetry, error reports, banner update checks, local explorer UI, and Miniflare startup fetches are disabled. WorkOS still sees your sign-ins because it is the authentication provider.',
  },
  {
    q: 'Where is my data stored and how do I back it up?',
    a: 'By default, Convex stores its SQLite database and uploaded blobs in the convex-data named Docker volume (/convex/data). Stop app and backend briefly, archive the volume with tar using a debian:bookworm-slim container, and start them again. Keep a secure copy of .env — especially INSTANCE_SECRET, INSTANCE_NAME, and WORKOS_COOKIE_PASSWORD — alongside your backups.',
  },
  {
    q: 'Can I run it on a VPS?',
    a: 'Yes. Put a TLS-terminating reverse proxy (Caddy, Nginx, or Traefik) in front of ports 3000, 3210 (with WebSocket Upgrade headers), and 3211, run the setup script with --public-url, --convex-url, and --convex-site-url, and rebuild with docker compose up -d --build. It is built for single-node personal or household self-hosting, not multi-replica horizontal scaling.',
  },
];

export const Route = createFileRoute('/blog/self-hosting-tracky-docker')({
  loader: loadMarketingAuth,
  head: () => {
    const title = 'Self-host Tracky with Docker: a step-by-step guide';
    const description =
      'Run Tracky on your machine or VPS with Docker Compose and self-hosted Convex. Zero product telemetry, clear setup steps, and honest limits.';
    const url = `${SITE_ORIGIN}/blog/self-hosting-tracky-docker`;
    const image = ogImageFor('blog-self-hosting-docker');

    return buildMarketingHead({
      title,
      description,
      locale: 'en',
      path: '/blog/self-hosting-tracky-docker',
      ogImage: image,
      jsonLd: [
        softwareAppJsonLd({ url, inLanguage: ['en', 'it'] }),
        blogPostingJsonLd({
          headline: title,
          description,
          url,
          image,
          datePublished: PUBLISH_DATE,
          dateModified: PUBLISH_DATE,
          inLanguage: 'en',
        }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Self-host Tracky with Docker', path: '/blog/self-hosting-tracky-docker' },
        ]),
      ],
    });
  },
  component: SelfHostingDockerEn,
});

function SelfHostingDockerEn() {
  const auth = Route.useLoaderData();
  return <SelfHostingDockerEnView auth={auth} />;
}

export function SelfHostingDockerEnView({ auth }: { auth: MarketingAuth }) {
  const { user, signUpUrl } = auth;
  const demoHref = user ? '/app' : signUpUrl;

  return (
    <MarketingSite locale="en" auth={auth} currentPath="/blog/self-hosting-tracky-docker">
      <article>
        <header className="mk-hero">
          <Reveal>
            <div className="mk-badges">
              <span className="mk-badge solid">Guide</span>
              <span className="mk-badge">Docker</span>
              <time className="mk-badge" dateTime={PUBLISH_DATE}>
                26 Nov 2026
              </time>
              <span className="mk-badge">MIT</span>
            </div>
          </Reveal>
          <Reveal>
            <h1>
              Self-host Tracky <span className="hl">with Docker</span>
              <br />
              <span className="stroke">step by step.</span>
            </h1>
          </Reveal>
          <Reveal>
            <p className="mk-dek">
              Run Tracky on your own machine or VPS with <b>Docker Compose</b> and a self-hosted Convex backend. Zero
              product telemetry, MIT source code, and an honest look at the one external service still required: WorkOS.
            </p>
          </Reveal>
          <Reveal>
            <aside aria-label="Self-hosting links" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <MagnetCta href={REPO_URL}>Get Tracky on GitHub →</MagnetCta>
              <MagnetCta href={SELFHOST_DOC_URL} variant="pill">
                Read docs/self-hosting.md →
              </MagnetCta>
            </aside>
          </Reveal>
        </header>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <p className="mk-sub" style={{ maxWidth: 720 }}>
              Docker self-hosting landed on the <code>main</code> branch of{' '}
              <a href={REPO_URL} rel="noopener" style={inlineLinkStyle}>
                masushidotdev/tracky
              </a>{' '}
              after v0.1.0. If you read our{' '}
              <a href={V010_BLOG_URL} style={inlineLinkStyle}>
                Tracky v0.1.0 release post
              </a>
              , that post describes the older Node-based setup against Convex Cloud. On <code>main</code>, you can now
              run both the TanStack Start app and a self-hosted Convex backend in Docker Compose.
            </p>
            <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>
              This guide walks through the full setup — local machine or public VPS — with exact commands from{' '}
              <a href={SELFHOST_DOC_URL} rel="noopener" style={inlineLinkStyle}>
                docs/self-hosting.md
              </a>{' '}
              and no hand-waving about the trade-offs.
            </p>
          </Reveal>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              Before you start
            </h2>
          </Reveal>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">01</div>
                <h3>WHY SELF-HOST</h3>
                <p>
                  Your financial data stays on your own disk: by default Convex stores its SQLite database and uploaded
                  blobs in the <code>convex-data</code> Docker volume (<code>/convex/data</code>). The codebase is MIT
                  licensed so you can read, audit, and pin it; upstream Convex backend and dashboard images are pinned
                  by digest in <code>docker-compose.yml</code>. The self-hosted build strips out product telemetry, and
                  optional integrations — Enable Banking, AI Analyst, Resend, Telegram — stay off until you provide your
                  own keys.
                </p>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">02</div>
                <h3>WHAT YOU NEED (INCLUDING WORKOS)</h3>
                <p>
                  You need Docker 24+ with Docker Compose v2, Node.js 22 only to run the setup script (it has zero npm
                  dependencies, so <code>npm ci</code> is not required), and a free{' '}
                  <a href={WORKOS_URL} rel="noopener" style={inlineLinkStyle}>
                    WorkOS
                  </a>{' '}
                  account (AuthKit).
                </p>
                <p style={{ marginTop: 10 }}>
                  Be clear about that last requirement: WorkOS is required and external. Tracky verifies WorkOS RS256
                  JWTs and uses WorkOS AuthKit for sign-in and session cookies. WorkOS remains an external SaaS (free
                  developer tier available). That means self-hosting Tracky is not 100% offline or independent today.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              Quick start
            </h2>
          </Reveal>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">03</div>
                <h3>RUN THE SETUP SCRIPT AND START COMPOSE</h3>
                <p>Clone the repository, run the setup script, and bring up the stack:</p>
                <pre style={codeBlockStyle}>
                  <code>{`git clone https://github.com/masushidotdev/tracky.git
cd tracky
node scripts/selfhost-setup.mjs
docker compose up -d`}</code>
                </pre>
                <p>
                  You can also run <code>npm run selfhost:setup</code> — it invokes{' '}
                  <code>node scripts/selfhost-setup.mjs</code> directly. Once the containers are healthy, open{' '}
                  <code>http://localhost:3000</code>.
                </p>
                <p style={{ marginTop: 10 }}>
                  The setup script prompts for your WorkOS Client ID (<code>client_...</code>) and API key (
                  <code>sk_...</code>, with hidden terminal input), configures the redirect URI, app homepage URL, and
                  CORS origin through the WorkOS API, generates missing random secrets (<code>INSTANCE_SECRET</code>,{' '}
                  <code>WORKOS_COOKIE_PASSWORD</code>, and a placeholder <code>WORKOS_WEBHOOK_SECRET</code> for
                  localhost/LAN), and writes <code>.env</code> atomically with mode <code>0600</code>. Re-running it is
                  idempotent and keeps existing secrets and custom variables intact.
                </p>
                <p style={{ marginTop: 10 }}>
                  Useful flags: pass <code>--dry-run</code> to preview the planned WorkOS API calls and{' '}
                  <code>.env</code> changes without making network requests or writing files, or <code>--yes</code> for
                  non-interactive mode using <code>WORKOS_CLIENT_ID</code> and <code>WORKOS_API_KEY</code> from the
                  environment or an existing <code>.env</code>.
                </p>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">04</div>
                <h3>PREFER TO DO IT BY HAND?</h3>
                <p>
                  Skip the script, copy the template, and generate the required secrets with <code>openssl</code>:
                </p>
                <pre style={codeBlockStyle}>
                  <code>{`cp .env.selfhost.example .env
openssl rand -hex 32          # -> INSTANCE_SECRET
openssl rand -base64 32       # -> WORKOS_COOKIE_PASSWORD (min 32 chars)
echo "whsec_$(openssl rand -hex 16)" # -> local/LAN WORKOS_WEBHOOK_SECRET placeholder (requires backfill; see below)`}</code>
                </pre>
                <p>
                  Edit <code>.env</code> with your <code>WORKOS_CLIENT_ID</code>, <code>WORKOS_API_KEY</code>, and the
                  generated secrets. In{' '}
                  <a href={WORKOS_DASHBOARD_URL} rel="noopener" style={inlineLinkStyle}>
                    dashboard.workos.com
                  </a>
                  , add <code>http://localhost:3000/callback</code> under <strong>Redirects</strong>. Then run{' '}
                  <code>docker compose up -d</code>.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              First sign-up &amp; optional tools
            </h2>
          </Reveal>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">05</div>
                <h3>FIRST SIGN-UP ON LOCAL OR LAN INSTALLS</h3>
                <p>
                  Tracky only creates a user profile and opens the app once the user record exists in Convex&apos;s
                  AuthKit table — a valid WorkOS JWT alone leaves sign-in retrying. On localhost or a private LAN,
                  WorkOS cannot reach your host with webhooks. After each new user signs up, run:
                </p>
                <pre style={codeBlockStyle}>
                  <code>{`docker compose --profile tools run --rm convex-backfill`}</code>
                </pre>
                <p>
                  This runs <code>auth:backfillUsers</code>, importing users from the WorkOS API into Convex.
                  Internet-facing installs should use the WorkOS webhook instead: point it to{' '}
                  <code>https://&lt;your-convex-site&gt;/workos/webhook</code> subscribed to <code>user.created</code>,{' '}
                  <code>user.updated</code>, and <code>user.deleted</code>, and paste its signing secret into{' '}
                  <code>WORKOS_WEBHOOK_SECRET</code>. Without the webhook, <code>user.updated</code> and{' '}
                  <code>user.deleted</code> events do not sync automatically.
                </p>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">06</div>
                <h3>OPTIONAL CONVEX DASHBOARD &amp; INTEGRATIONS</h3>
                <p>
                  To inspect tables and logs in the optional Convex web dashboard at <code>http://localhost:6791</code>:
                </p>
                <pre style={codeBlockStyle}>
                  <code>{`docker compose --profile dashboard up -d`}</code>
                </pre>
                <p>Retrieve the admin key to sign in:</p>
                <pre style={codeBlockStyle}>
                  <code>{`docker compose exec backend ./generate_admin_key.sh`}</code>
                </pre>
                <p>
                  Never expose port <code>6791</code> publicly. Optional integrations stay disabled until you set their
                  variables in <code>.env</code>: Enable Banking (<code>ENABLE_BANKING_*</code>), AI Analyst (
                  <code>VITE_ANALYST_ENABLED=true</code> plus <code>AI_GATEWAY_API_KEY</code> or{' '}
                  <code>OPENROUTER_API_KEY</code>, requiring an <code>app</code> rebuild), Resend (
                  <code>RESEND_API_KEY</code>, <code>RESEND_FROM_EMAIL</code>, <code>RESEND_WEBHOOK_SECRET</code>), and
                  Telegram (<code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_WEBHOOK_SECRET</code>,{' '}
                  <code>TELEGRAM_WEBHOOK_URL</code>).
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              Going public, upgrading &amp; backups
            </h2>
          </Reveal>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">07</div>
                <h3>REVERSE PROXY WITH TLS</h3>
                <p>
                  Put Caddy, Nginx, or Traefik in front to terminate TLS and forward three hostnames: your app domain to{' '}
                  <code>127.0.0.1:3000</code>, your Convex API domain to <code>127.0.0.1:3210</code> (must proxy
                  WebSockets and <code>Upgrade</code> headers), and your Convex site domain to{' '}
                  <code>127.0.0.1:3211</code> (for incoming webhooks).
                </p>
                <p style={{ marginTop: 10 }}>
                  Re-run the setup script with your public URLs — it keeps existing secrets, sets{' '}
                  <code>DO_NOT_REQUIRE_SSL=false</code>, updates WorkOS redirects/CORS/homepage, and registers the
                  WorkOS webhook:
                </p>
                <pre style={codeBlockStyle}>
                  <code>{`node scripts/selfhost-setup.mjs \\
  --public-url https://tracky.example.com \\
  --convex-url https://convex.example.com \\
  --convex-site-url https://convex-site.example.com`}</code>
                </pre>
                <p>
                  Then rebuild and restart so the new build-time <code>VITE_CONVEX_URL</code> is baked into the client
                  bundle:
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
                <h3>UPGRADING</h3>
                <p>Back up the volume first, then pull and rebuild:</p>
                <pre style={codeBlockStyle}>
                  <code>{`git pull
docker compose up -d --build`}</code>
                </pre>
                <p>
                  The one-shot <code>convex-deploy</code> service runs automatically before <code>app</code> restarts,
                  pushing any updated Convex schema and functions and re-syncing allowlisted environment variables.
                </p>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">09</div>
                <h3>BACKUP AND RESTORE</h3>
                <p>
                  Both commands below need <code>jq</code> installed to resolve the Compose project volume name. Stop{' '}
                  <code>app</code> and <code>backend</code> briefly so SQLite flushes cleanly before archiving{' '}
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
                <p>To restore from an archive:</p>
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
                  Keep a secure copy of <code>.env</code> alongside your backups — especially{' '}
                  <code>INSTANCE_SECRET</code>, <code>INSTANCE_NAME</code>, and <code>WORKOS_COOKIE_PASSWORD</code>.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)', marginBottom: 24 }}>
              Privacy &amp; honest limits
            </h2>
          </Reveal>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">10</div>
                <h3>ZERO PRODUCT TELEMETRY</h3>
                <p>
                  The self-hosted build turns off every product and runtime telemetry hook we control. PostHog analytics
                  is hard-disabled at build time (<code>CLOUDFLARE_ENV=selfhost</code>,{' '}
                  <code>VITE_POSTHOG_ENABLED=false</code>, with no capture key or host embedded in the build). The
                  Convex backend beacon is disabled (<code>DISABLE_BEACON=true</code>). Wrangler telemetry, error
                  reports, banner update checks, local explorer UI, and Miniflare&apos;s startup{' '}
                  <code>workers.cloudflare.com/cf.json</code> fetch are disabled as well.
                </p>
                <p style={{ marginTop: 10 }}>
                  Be precise about what stays external: WorkOS still sees your sign-ins because it is the authentication
                  provider.
                </p>
              </div>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <div className="mk-card" style={cardStyle}>
                <div className="e">11</div>
                <h3>LIMITS, HONESTLY</h3>
                <p>
                  This setup is designed for single-node personal or household self-hosting, not multi-replica
                  horizontal scaling. Tracky compiles as a Cloudflare Worker — there is no Node HTTP server target. The{' '}
                  <code>app</code> container runs the built Worker locally on <code>workerd</code> via Wrangler&apos;s
                  local runtime behind a built-in Node edge proxy on port <code>3000</code> that blocks{' '}
                  <code>/cdn-cgi/*</code> local tooling endpoints.
                </p>
                <p style={{ marginTop: 10 }}>
                  By default, Convex runs single-node SQLite plus local file storage inside <code>convex-data</code>{' '}
                  (upstream Convex also accepts optional <code>POSTGRES_URL</code>, <code>MYSQL_URL</code>, and S3
                  bucket variables listed in <code>.env.selfhost.example</code>).
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="mk-section" style={{ paddingTop: 0 }}>
          <Reveal>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>
              Questions, answered.
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

      <MarqueeBand items={['DOCKER COMPOSE', 'SELF-HOSTED CONVEX', 'NO TELEMETRY', 'MIT LICENSE']} />

      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Your server. Your ledger.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Docker Compose · Self-hosted Convex · MIT license</p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <MagnetCta href={REPO_URL}>Self-host it →</MagnetCta>
              <MagnetCta href={SELFHOST_DOC_URL} variant="pill">
                Self-hosting guide →
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
                {user ? 'Open the demo →' : 'Try the free demo →'}
              </MagnetCta>
            </div>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
