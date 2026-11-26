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

export const bankConnectionsEnFaq: Array<FaqItem> = [
  {
    q: 'Does PSD2 bank sync work on the hosted demo?',
    a: 'No. Bank sync is self-host only and stays disabled on the hosted demo by design. On trytracky.app you use manual accounts and browser-parsed CSV import instead. Live bank connections work only on your own instance once you configure your own Enable Banking app ID, PEM key, and HTTPS callback URL.',
  },
  {
    q: 'Does Tracky ever store or see my bank login credentials?',
    a: 'No. Authentication and consent happen directly on your bank’s page through Enable Banking. Tracky never asks for your bank username or password, and maintainers never see your keys or credentials. You can revoke consent anytime at your bank and pause sync per account inside Tracky.',
  },
  {
    q: 'How often does automatic synchronization check my bank?',
    a: 'Automatic synchronization is evaluated every six hours, and you can also request a manual refresh on any connected account. Actual data freshness still depends on when your bank publishes new balances and transactions.',
  },
  {
    q: 'What should I do if a sync fails or needs reauthorization?',
    a: 'If you see Reconnect or Authorization required, renew consent with your bank first. For a failed job, open the import history detail and retry later—repeated refreshes cannot force a bank to publish data early.',
  },
  {
    q: 'Can I rename, hide, or pause a connected account without losing history?',
    a: 'Yes. Set an alias to rename how an account appears without touching provider data, hide an account to keep it out of Dashboard totals while keeping it stored, or disable sync per account to stop future updates while preserving all existing history.',
  },
];

export const Route = createFileRoute('/features/bank-connections')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Bank connections: self-hosted PSD2 sync via Enable Banking · Tracky',
      description:
        'Connect supported banks via Enable Banking on your own self-hosted instance with your own app keys. Disabled on the hosted demo; CSV works everywhere.',
      locale: 'en',
      path: '/features/bank-connections',
      ogImage: ogImageFor('feature-banksync'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/bank-connections', inLanguage: ['en', 'it'] }),
        faqJsonLd(bankConnectionsEnFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Bank connections', path: '/features/bank-connections' },
        ]),
      ],
    }),
  component: BankEn,
});

function BankEn() {
  const auth = Route.useLoaderData();
  return <BankConnectionsEnView auth={auth} />;
}

export function BankConnectionsEnView({ auth }: { auth: MarketingAuth }) {
  return (
    <AtelierSite locale="en" auth={auth} currentPath="/features/bank-connections">
      {/* 1. HERO */}
      <section className="mka-hero mka-hero--page">
        <div className="mka-container">
          <div className="mka-hero-single">
            <Breadcrumb
              ariaLabel="Breadcrumb"
              items={[{ label: 'Home', href: '/' }, { label: 'Bank connections' }]}
            />

            <div className="mka-b2-hero-badges">
              <ScopePill scope="selfhost" label="Self-host only" />
              <Chip>Disabled on hosted demo</Chip>
              <Chip tone="cobalt">Bring your own Enable Banking keys</Chip>
            </div>

            <h1 className="mka-hero-headline">
              PSD2 bank sync via Enable Banking—<span className="mka-accent-ink">on your server, with your keys.</span>
            </h1>

            <p className="mka-hero-dek">
              Connect supported banks on your own self-hosted Tracky instance using your own Enable Banking application
              ID and PEM private key. Consent is completed directly at your bank, automatic sync is evaluated every six
              hours, and manual accounts plus browser-parsed CSV import cover the hosted demo and any unsupported bank.
            </p>

            <div className="mka-hero-actions">
              <a className="mka-btn-primary mka-btn-primary--lg" href="/blog/self-hosting-tracky-docker">
                Self-host with Docker →
              </a>
              <B2AppCta
                auth={auth}
                locale="en"
                loggedInHref="/app"
                loggedInLabel="Open the demo →"
                loggedOutLabel="Try the demo with CSV →"
                variant="primary"
              />
            </div>

            <p className="mka-hero-meta">
              <span>Read-only PSD2 consent</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Revocable anytime at your bank</span>
              <span className="mka-hero-meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Maintainers never see your credentials</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. EXPLICIT AVAILABILITY */}
      <Section id="availability" tone="parchment">
        <SectionHead
          kicker="Where it runs"
          title="Disabled on the hosted demo; optional on your own Docker instance."
          subtitle="We state this up front: Enable Banking credentials belong to the operator of each instance, never to a shared hosted demo."
        />

        <B2AvailabilityBand
          demoTone="default"
          demoBadge="Disabled on hosted demo"
          demoTitle="Hosted demo (trytracky.app)"
          demoBody="The connect button stays disabled on trytracky.app. You can explore every budgeting, Cash Flow, and Reports screen using manual accounts and browser-parsed CSV import—with zero bank credentials shared."
          selfHostTone="cobalt"
          selfHostBadge="Optional · Your keys"
          selfHostTitle="Self-hosted Docker (MIT)"
          selfHostBody={
            <>
              Configure your own Enable Banking app ID, PEM private key, and public HTTPS callback URL via{' '}
              <code>ENABLE_BANKING_*</code> environment variables synced to your self-hosted Convex backend. Behind a
              reverse proxy, port <code>3211</code> handles incoming callbacks.
            </>
          }
        />
      </Section>

      {/* 3. HOW IT WORKS & ACCOUNT CONTROLS */}
      <Section id="how-it-works">
        <SectionHead
          kicker="Workflow & controls"
          title="Signed provider requests, transparent job logs, and per-account controls."
          subtitle="Even after connecting a bank, you control which accounts enter Dashboard totals, how they are named, and when sync runs."
        />

        <div className="mka-trust-grid">
          <div className="mka-ledger-sheet">
            <h3 className="mka-sheet-title">From bank consent to clean ledgers</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  01
                </span>
                <div>
                  <strong>Approve access directly at your bank</strong>
                  <span>
                    Open <strong>Settings → Bank Connections</strong>, choose your institution, and complete
                    authentication and consent on your bank’s own page. Tracky creates the connection and schedules the
                    initial import when you return.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  02
                </span>
                <div>
                  <strong>Automatic checks evaluated every six hours</strong>
                  <span>
                    Automatic synchronization is evaluated every six hours, with on-demand account refresh whenever you
                    want to check for updates. Status clearly shows active, disabled, failed, or waiting for renewed
                    consent.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  03
                </span>
                <div>
                  <strong>Import history with duplicate recognition</strong>
                  <span>
                    Inspect import logs showing items seen versus items imported. A smaller imported count usually means
                    already stored duplicates were safely recognized and skipped.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--vermilion" aria-hidden="true">
                  04
                </span>
                <div>
                  <strong>Consistent balance &amp; currency rules</strong>
                  <span>
                    Tracky reads the newest snapshot preferring available balance, then booked, then expected. CARD
                    accounts are always treated as liabilities—never spendable cash—and each account keeps the currency
                    reported by the bank.
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div className="mka-ledger-sheet mka-ledger-sheet--tinted">
            <h3 className="mka-sheet-title">Sidebar organization &amp; per-account switches</h3>
            <ul className="mka-rule-list">
              <li>
                <span className="mka-rule-dot mka-rule-dot--cobalt" aria-hidden="true">
                  NAV
                </span>
                <div>
                  <strong>Grouped as Cash, Credit, and Loans</strong>
                  <span>
                    Open any cash or credit account for its own focused ledger, open a loan for its dedicated page, or
                    use <strong>All Accounts</strong> for the combined view.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--sage" aria-hidden="true">
                  CTRL
                </span>
                <div>
                  <strong>Aliases, visibility, and pause toggles</strong>
                  <span>
                    Give any account a friendly alias without modifying provider data, hide accounts you want out of
                    Dashboard totals, or switch sync off per account without deleting a single historical movement.
                  </span>
                </div>
              </li>
              <li>
                <span className="mka-rule-dot mka-rule-dot--marigold" aria-hidden="true">
                  KEY
                </span>
                <div>
                  <strong>Self-host environment variables</strong>
                  <span>
                    Enable Banking stays off until you configure your own provider credentials and public HTTPS
                    callback domain in <code>.env</code>.
                  </span>
                </div>
              </li>
            </ul>

            <CodePlate
              ariaLabel="Enable Banking self-host prerequisites"
              lines={[
                { text: '# On your self-hosted Docker instance (see docs/self-hosting.md)', comment: true },
                { text: 'ENABLE_BANKING_*  # Your app ID, PEM private key & HTTPS callback' },
                { text: 'docker compose up -d' },
              ]}
            />

            <div className="mka-trust-actions">
              <a
                className="mka-text-link"
                href={`${GITHUB_REPO_URL}/blob/main/docs/self-hosting.md`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read docs/self-hosting.md ↗
              </a>
              <a className="mka-text-link" href="/open-source">
                Architecture overview →
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* 4. HONEST FALLBACK SCREENSHOT */}
      <Section id="csv-fallback" tone="parchment">
        <SectionHead
          kicker="Works everywhere"
          title="The honest fallback: browser-local CSV import."
          subtitle="Whether you are testing the hosted demo or holding accounts at an institution that does not share data via PSD2, manual accounts and guided CSV import keep your ledger complete."
        />

        <B2ScreenshotFigure
          src="/shots/import-mapping.png"
          alt="Tracky CSV column mapping screen matching booking date, description, counterparty, and amount columns for a manual account"
          width={1440}
          height={800}
          captionTitle="Guided CSV column mapping"
          captionBody="CSV files are read and validated locally in your browser with support for four date formats, decimal commas or points, and idempotent duplicate detection—no bank credentials required."
        />
      </Section>

      {/* 5. FIT CHECK */}
      <Section id="fit">
        <SectionHead
          kicker="Candid fit check"
          title="When self-hosted bank sync is worth setting up."
        />

        <FitCheck
          yesTitle="Good fit if you…"
          yesItems={[
            'Run (or plan to run) Tracky on your own Docker host behind HTTPS and want automated read-only PSD2 imports.',
            'Are comfortable registering your own Enable Banking app and managing your own PEM signing key.',
            'Want per-account aliases, hide/pause controls, and import logs alongside manual accounts and CSV import.',
          ]}
          noTitle="Not the right fit if you…"
          noItems={[
            'Want turnkey bank connections inside a hosted cloud app without self-hosting or supplying your own keys.',
            'Expect the app to initiate payments or transfers—Enable Banking connections in Tracky are strictly read-only.',
            'Prefer keeping your instance purely local without a public HTTPS endpoint for bank OAuth callbacks.',
          ]}
        />
      </Section>

      {/* 6. FAQ */}
      <FaqSection
        id="faq"
        tone="parchment"
        kicker="Bank connections FAQ"
        title="Questions about PSD2 consent, keys, and sync health."
        subtitle="Verified against docs/self-hosting.md and Tracky’s account documentation."
        moreLink={{ href: '/faq', label: 'Read the full FAQ →' }}
        items={bankConnectionsEnFaq}
      />

      {/* 7. RELATED LINKS */}
      <B2RelatedSection
        tone="cotton"
        kicker="Continue exploring"
        title="Self-hosting and manual workflows."
        items={[
          {
            kicker: 'Self-hosting guide',
            title: 'Self-hosting Tracky with Docker',
            description: 'Step-by-step setup with Docker Compose, WorkOS AuthKit, TLS reverse proxy, and backups.',
            href: '/blog/self-hosting-tracky-docker',
            linkLabel: 'Read Docker guide →',
          },
          {
            kicker: 'Feature · Self-host only',
            title: 'Approval-gated AI Analyst',
            description: 'Query your authorized ledger in plain language on your self-hosted instance with your own AI gateway key.',
            href: '/features/ai-analyst',
            linkLabel: 'Explore AI Analyst →',
          },
          {
            kicker: 'Overview',
            title: 'Pricing & Demo vs. Self-host',
            description: 'Compare every capability side by side between trytracky.app and a self-hosted Docker deployment.',
            href: '/pricing',
            linkLabel: 'View comparison →',
          },
        ]}
      />

      {/* 8. FINAL CTA */}
      <FinalCta
        headline="Sync on your own server. Import CSV anywhere."
        meta="MIT open source · Bring your own Enable Banking keys · Revocable anytime"
        primaryCta={
          <a className="mka-btn-marigold" href="/blog/self-hosting-tracky-docker">
            Read the Docker self-host guide →
          </a>
        }
        secondaryCta={
          <a className="mka-btn-outline-light" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
            Inspect MIT repo ↗
          </a>
        }
      />
    </AtelierSite>
  );
}
