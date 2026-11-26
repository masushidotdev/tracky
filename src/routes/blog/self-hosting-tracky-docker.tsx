import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';

import type { FaqItem, MarketingAuth } from '@/components/marketing/atelier';
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
const SELFHOST_DOC_URL = 'https://github.com/masushidotdev/tracky/blob/main/docs/self-hosting.md';
const V010_BLOG_URL = `${SITE_ORIGIN}/blog/tracky-v0-1-0`;
const WORKOS_URL = 'https://workos.com/';
const WORKOS_DASHBOARD_URL = 'https://dashboard.workos.com/';
const PUBLISH_DATE = '2026-11-26';

export const selfHostingDockerEnFaq: Array<FaqItem> = [
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
        faqJsonLd(selfHostingDockerEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
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
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/blog/self-hosting-tracky-docker">
      <article>
        {/* 1. ARTICLE HERO */}
        <header className="mka-hero mka-hero--page">
          <div className="mka-container">
            <div className="mka-hero-single">
              <Breadcrumb
                ariaLabel="Breadcrumb"
                items={[{ label: 'Home', href: `${SITE_ORIGIN}/` }, { label: 'Self-host Tracky with Docker' }]}
              />

              <ChipRow>
                <Chip tone="cobalt">Guide</Chip>
                <Chip tone="sage">Docker Compose</Chip>
                <time className="mka-stamp" dateTime={PUBLISH_DATE}>
                  26 Nov 2026
                </time>
                <Chip tone="marigold">MIT License</Chip>
              </ChipRow>

              <h1 className="mka-hero-headline">
                Self-host Tracky <span className="mka-accent-ink">with Docker,</span> step by step.
              </h1>

              <p className="mka-hero-dek">
                Run Tracky on your own machine or VPS with <strong>Docker Compose</strong> and a self-hosted Convex
                backend. Zero product telemetry, MIT source code, and an honest look at the one external service still
                required: WorkOS.
              </p>

              <aside aria-label="Self-hosting links" className="mka-hero-actions">
                <a className="mka-btn-primary mka-btn-primary--lg" href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  Get Tracky on GitHub ↗
                </a>
                <a className="mka-btn-secondary" href={SELFHOST_DOC_URL} target="_blank" rel="noopener noreferrer">
                  Read docs/self-hosting.md ↗
                </a>
              </aside>
            </div>
          </div>
        </header>

        {/* 2. INTRO */}
        <Section tone="parchment">
          <div className="mka-b1-prose">
            <p>
              Docker self-hosting landed on the <code>main</code> branch of{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                masushidotdev/tracky
              </a>{' '}
              after v0.1.0. If you read our <a href={V010_BLOG_URL}>Tracky v0.1.0 release post</a>, that post describes
              the older Node-based setup against Convex Cloud. On <code>main</code>, you can now run both the TanStack
              Start app and a self-hosted Convex backend in Docker Compose.
            </p>
            <p>
              This guide walks through the full setup — local machine or public VPS — with exact commands from{' '}
              <a href={SELFHOST_DOC_URL} target="_blank" rel="noopener noreferrer">
                docs/self-hosting.md
              </a>{' '}
              and no hand-waving about the trade-offs.
            </p>
          </div>
        </Section>

        {/* 3. BEFORE YOU START */}
        <Section id="before-you-start">
          <SectionHead
            kicker="Prerequisites"
            title="Before you start"
            subtitle="What stays on your disk, what tools you need, and why WorkOS AuthKit remains external."
          />

          <div className="mka-b1-article-stack">
            <B1ArticleEntry num="01" title="Why self-host">
              <p>
                Your financial data stays on your own disk: by default Convex stores its SQLite database and uploaded
                blobs in the <code>convex-data</code> Docker volume (<code>/convex/data</code>). The codebase is MIT
                licensed so you can read, audit, and pin it; upstream Convex backend and dashboard images are pinned by
                digest in <code>docker-compose.yml</code>. The self-hosted build strips out product telemetry, and
                optional integrations — Enable Banking, AI Analyst, Resend, Telegram — stay off until you provide your
                own keys.
              </p>
            </B1ArticleEntry>

            <B1ArticleEntry num="02" title="What you need (including WorkOS)">
              <p>
                You need Docker 24+ with Docker Compose v2, Node.js 22 only to run the setup script (it has zero npm
                dependencies, so <code>npm ci</code> is not required), and a free{' '}
                <a href={WORKOS_URL} target="_blank" rel="noopener noreferrer">
                  WorkOS
                </a>{' '}
                account (AuthKit).
              </p>
              <p>
                Be clear about that last requirement: WorkOS is required and external. Tracky verifies WorkOS RS256 JWTs
                and uses WorkOS AuthKit for sign-in and session cookies. WorkOS remains an external SaaS (free developer
                tier available). That means self-hosting Tracky is not 100% offline or independent today.
              </p>
            </B1ArticleEntry>
          </div>
        </Section>

        {/* 4. QUICK START */}
        <Section id="quick-start" tone="parchment">
          <SectionHead
            kicker="Installation"
            title="Quick start"
            subtitle="Use the zero-dependency setup script, or generate secrets and configure WorkOS by hand."
          />

          <div className="mka-b1-article-stack">
            <B1ArticleEntry num="03" title="Run the setup script and start Compose">
              <p>Clone the repository, run the setup script, and bring up the stack:</p>
              <B1CodeBlock>{`git clone https://github.com/masushidotdev/tracky.git
cd tracky
node scripts/selfhost-setup.mjs
docker compose up -d`}</B1CodeBlock>
              <p>
                You can also run <code>npm run selfhost:setup</code> — it invokes{' '}
                <code>node scripts/selfhost-setup.mjs</code> directly. Once the containers are healthy, open{' '}
                <code>http://localhost:3000</code>.
              </p>
              <p>
                The setup script prompts for your WorkOS Client ID (<code>client_...</code>) and API key (
                <code>sk_...</code>, with hidden terminal input), configures the redirect URI, app homepage URL, and
                CORS origin through the WorkOS API, generates missing random secrets (<code>INSTANCE_SECRET</code>,{' '}
                <code>WORKOS_COOKIE_PASSWORD</code>, and a placeholder <code>WORKOS_WEBHOOK_SECRET</code> for
                localhost/LAN), and writes <code>.env</code> atomically with mode <code>0600</code>. Re-running it is
                idempotent and keeps existing secrets and custom variables intact.
              </p>
              <p>
                Useful flags: pass <code>--dry-run</code> to preview the planned WorkOS API calls and <code>.env</code>{' '}
                changes without making network requests or writing files, or <code>--yes</code> for non-interactive mode
                using <code>WORKOS_CLIENT_ID</code> and <code>WORKOS_API_KEY</code> from the environment or an existing{' '}
                <code>.env</code>.
              </p>
            </B1ArticleEntry>

            <B1ArticleEntry num="04" title="Prefer to do it by hand?">
              <p>
                Skip the script, copy the template, and generate the required secrets with <code>openssl</code>:
              </p>
              <B1CodeBlock>{`cp .env.selfhost.example .env
openssl rand -hex 32          # -> INSTANCE_SECRET
openssl rand -base64 32       # -> WORKOS_COOKIE_PASSWORD (min 32 chars)
echo "whsec_$(openssl rand -hex 16)" # -> local/LAN WORKOS_WEBHOOK_SECRET placeholder (requires backfill; see below)`}</B1CodeBlock>
              <p>
                Edit <code>.env</code> with your <code>WORKOS_CLIENT_ID</code>, <code>WORKOS_API_KEY</code>, and the
                generated secrets. In{' '}
                <a href={WORKOS_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
                  dashboard.workos.com
                </a>
                , add <code>http://localhost:3000/callback</code> under <strong>Redirects</strong>. Then run{' '}
                <code>docker compose up -d</code>.
              </p>
            </B1ArticleEntry>
          </div>
        </Section>

        {/* 5. FIRST SIGN-UP & OPTIONAL TOOLS */}
        <Section id="first-signup">
          <SectionHead
            kicker="Onboarding & tools"
            title="First sign-up & optional tools"
            subtitle="Syncing your user record on localhost/LAN, opening the Convex dashboard, and enabling optional integrations."
          />

          <div className="mka-b1-article-stack">
            <B1ArticleEntry num="05" title="First sign-up on local or LAN installs">
              <p>
                Tracky only creates a user profile and opens the app once the user record exists in Convex&apos;s
                AuthKit table — a valid WorkOS JWT alone leaves sign-in retrying. On localhost or a private LAN, WorkOS
                cannot reach your host with webhooks. After each new user signs up, run:
              </p>
              <B1CodeBlock>{`docker compose --profile tools run --rm convex-backfill`}</B1CodeBlock>
              <p>
                This runs <code>auth:backfillUsers</code>, importing users from the WorkOS API into Convex.
                Internet-facing installs should use the WorkOS webhook instead: point it to{' '}
                <code>https://&lt;your-convex-site&gt;/workos/webhook</code> subscribed to <code>user.created</code>,{' '}
                <code>user.updated</code>, and <code>user.deleted</code>, and paste its signing secret into{' '}
                <code>WORKOS_WEBHOOK_SECRET</code>. Without the webhook, <code>user.updated</code> and{' '}
                <code>user.deleted</code> events do not sync automatically.
              </p>
            </B1ArticleEntry>

            <B1ArticleEntry num="06" title="Optional Convex dashboard & integrations">
              <p>
                To inspect tables and logs in the optional Convex web dashboard at <code>http://localhost:6791</code>:
              </p>
              <B1CodeBlock>{`docker compose --profile dashboard up -d`}</B1CodeBlock>
              <p>Retrieve the admin key to sign in:</p>
              <B1CodeBlock>{`docker compose exec backend ./generate_admin_key.sh`}</B1CodeBlock>
              <p>
                Never expose port <code>6791</code> publicly. Optional integrations stay disabled until you set their
                variables in <code>.env</code>: Enable Banking (<code>ENABLE_BANKING_*</code>), AI Analyst (
                <code>VITE_ANALYST_ENABLED=true</code> plus <code>AI_GATEWAY_API_KEY</code> or{' '}
                <code>OPENROUTER_API_KEY</code>, requiring an <code>app</code> rebuild), Resend (
                <code>RESEND_API_KEY</code>, <code>RESEND_FROM_EMAIL</code>, <code>RESEND_WEBHOOK_SECRET</code>), and
                Telegram (<code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_WEBHOOK_SECRET</code>,{' '}
                <code>TELEGRAM_WEBHOOK_URL</code>).
              </p>
            </B1ArticleEntry>
          </div>
        </Section>

        {/* 6. GOING PUBLIC, UPGRADING & BACKUPS */}
        <Section id="operations" tone="parchment">
          <SectionHead
            kicker="Operations"
            title="Going public, upgrading & backups"
            subtitle="TLS reverse proxy routing, safe upgrades, and SQLite volume snapshots."
          />

          <div className="mka-b1-article-stack">
            <B1ArticleEntry num="07" title="Reverse proxy with TLS">
              <p>
                Put Caddy, Nginx, or Traefik in front to terminate TLS and forward three hostnames: your app domain to{' '}
                <code>127.0.0.1:3000</code>, your Convex API domain to <code>127.0.0.1:3210</code> (must proxy
                WebSockets and <code>Upgrade</code> headers), and your Convex site domain to <code>127.0.0.1:3211</code>{' '}
                (for incoming webhooks).
              </p>
              <p>
                Re-run the setup script with your public URLs — it keeps existing secrets, sets{' '}
                <code>DO_NOT_REQUIRE_SSL=false</code>, updates WorkOS redirects/CORS/homepage, and registers the WorkOS
                webhook:
              </p>
              <B1CodeBlock>{`node scripts/selfhost-setup.mjs \\
  --public-url https://tracky.example.com \\
  --convex-url https://convex.example.com \\
  --convex-site-url https://convex-site.example.com`}</B1CodeBlock>
              <p>
                Then rebuild and restart so the new build-time <code>VITE_CONVEX_URL</code> is baked into the client
                bundle:
              </p>
              <B1CodeBlock>{`docker compose up -d --build`}</B1CodeBlock>
            </B1ArticleEntry>

            <B1ArticleEntry num="08" title="Upgrading">
              <p>Back up the volume first, then pull and rebuild:</p>
              <B1CodeBlock>{`git pull
docker compose up -d --build`}</B1CodeBlock>
              <p>
                The one-shot <code>convex-deploy</code> service runs automatically before <code>app</code> restarts,
                pushing any updated Convex schema and functions and re-syncing allowlisted environment variables.
              </p>
            </B1ArticleEntry>

            <B1ArticleEntry num="09" title="Backup and restore">
              <p>
                Both commands below need <code>jq</code> installed to resolve the Compose project volume name. Stop{' '}
                <code>app</code> and <code>backend</code> briefly so SQLite flushes cleanly before archiving{' '}
                <code>convex-data</code>:
              </p>
              <B1CodeBlock>{`docker compose stop app backend
docker run --rm \\
  -v "$(docker compose config --format json | jq -r '.name')_convex-data:/data:ro" \\
  -v "$PWD:/backup" \\
  debian:bookworm-slim \\
  tar czf "/backup/tracky-convex-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .
docker compose start backend app`}</B1CodeBlock>
              <p>To restore from an archive:</p>
              <B1CodeBlock>{`docker compose stop app backend
docker run --rm \\
  -v "$(docker compose config --format json | jq -r '.name')_convex-data:/data" \\
  -v "$PWD:/backup:ro" \\
  debian:bookworm-slim \\
  sh -c 'rm -rf /data/* && tar xzf /backup/tracky-convex-YYYYMMDD-HHMMSS.tar.gz -C /data'
docker compose up -d`}</B1CodeBlock>
              <p>
                Keep a secure copy of <code>.env</code> alongside your backups — especially{' '}
                <code>INSTANCE_SECRET</code>, <code>INSTANCE_NAME</code>, and <code>WORKOS_COOKIE_PASSWORD</code>.
              </p>
            </B1ArticleEntry>
          </div>
        </Section>

        {/* 7. PRIVACY & HONEST LIMITS */}
        <Section id="limits">
          <SectionHead
            kicker="Boundaries"
            title="Privacy & honest limits"
            subtitle="Every telemetry flag we disable at build time and the single-node scope of this stack."
          />

          <div className="mka-b1-article-stack">
            <B1ArticleEntry num="10" title="Zero product telemetry">
              <p>
                The self-hosted build turns off every product and runtime telemetry hook we control. PostHog analytics is
                hard-disabled at build time (<code>CLOUDFLARE_ENV=selfhost</code>,{' '}
                <code>VITE_POSTHOG_ENABLED=false</code>, with no capture key or host embedded in the build). The Convex
                backend beacon is disabled (<code>DISABLE_BEACON=true</code>). Wrangler telemetry, error reports, banner
                update checks, local explorer UI, and Miniflare&apos;s startup{' '}
                <code>workers.cloudflare.com/cf.json</code> fetch are disabled as well.
              </p>
              <p>
                Be precise about what stays external: WorkOS still sees your sign-ins because it is the authentication
                provider.
              </p>
            </B1ArticleEntry>

            <B1ArticleEntry num="11" title="Limits, honestly">
              <p>
                This setup is designed for single-node personal or household self-hosting, not multi-replica horizontal
                scaling. Tracky compiles as a Cloudflare Worker — there is no Node HTTP server target. The{' '}
                <code>app</code> container runs the built Worker locally on <code>workerd</code> via Wrangler&apos;s
                local runtime behind a built-in Node edge proxy on port <code>3000</code> that blocks{' '}
                <code>/cdn-cgi/*</code> local tooling endpoints.
              </p>
              <p>
                By default, Convex runs single-node SQLite plus local file storage inside <code>convex-data</code>{' '}
                (upstream Convex also accepts optional <code>POSTGRES_URL</code>, <code>MYSQL_URL</code>, and S3 bucket
                variables listed in <code>.env.selfhost.example</code>).
              </p>
            </B1ArticleEntry>
          </div>
        </Section>

        {/* 8. FAQ */}
        <Section id="faq" tone="parchment">
          <SectionHead
            kicker="Self-hosting FAQ"
            title="Questions about WorkOS, telemetry, backups, and VPS hosting."
            subtitle="Direct answers matching docker-compose.yml and docs/self-hosting.md."
          />
          <B1ArticleFaqList items={selfHostingDockerEnFaq} />
        </Section>
      </article>

      {/* OUTSIDE <article>: RELATED + FINAL CTA */}
      <RelatedLinksSection
        kicker="Read next"
        title="More project guides and release notes."
        items={[
          {
            kicker: 'Open source',
            title: 'Architecture, MIT license & contributing',
            description: 'Inspect the repository layout, security policy, and local development commands.',
            href: '/open-source',
            ctaLabel: 'Read Open Source →',
          },
          {
            kicker: 'Release notes',
            title: 'Tracky v0.1.0 — First public release',
            description: 'What shipped in the tagged v0.1.0 baseline across Plan, loans, CSV import, and security.',
            href: '/blog/tracky-v0-1-0',
            ctaLabel: 'Read v0.1.0 notes →',
          },
          {
            kicker: 'Pricing',
            title: '€0 hosted demo vs. MIT self-host',
            description: 'Side-by-side matrix of capabilities across hosted demo and self-hosted Docker.',
            href: '/pricing',
            ctaLabel: 'Read Pricing →',
          },
        ]}
      />

      <FinalCta
        headline="Your server. Your ledger."
        meta="Docker Compose · Self-hosted Convex · Zero product telemetry · MIT license"
        primaryCta={<AuthCta auth={auth} locale="en" ctaLocation="marketing" variant="marigold" />}
        secondaryCta={
          <a className="mka-btn-outline-light" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Get Tracky on GitHub ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
