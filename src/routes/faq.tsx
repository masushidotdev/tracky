import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';

const qa = [
  {
    q: "Is Tracky really free?",
    a: "Yes. The hosted demo and the MIT-licensed self-hosted code cost nothing, and you never enter a card. Tracky offers Free and Pro tiers with different Analyst allowances and Pro-only long-term projections. You cannot buy, upgrade, or manage billing in Tracky yet: the Pro action is marked as coming soon, so nothing can charge you.",
  },
  {
    q: "Do I have to connect my bank?",
    a: "No. Manual checking, savings, card, investment, and asset accounts plus CSV import into manual cash and card accounts cover the full workflow. Bank sync through Enable Banking works only where your instance has a configured provider. It stays unavailable on the hosted demo, so explore the demo without linking anything.",
  },
  {
    q: "Is the AI analyst available in the demo?",
    a: "No. The AI analyst is environment-gated: its sidebar entries stay hidden and the page reports the feature as disabled on the hosted demo. Where enabled, it reads your data, explains patterns, and drafts changes that need your approval for sensitive writes. Treat it as an exploration aid, never as financial advice.",
  },
  {
    q: "Can couples or freelancers use it?",
    a: "As an organizer, yes. Tracky is a single-user workspace: it derives you from your session, so there is no shared multi-user access. One person can still separate household and work money with manual accounts, track tax deadlines as planned items in Cash Flow, and hand CSV or JSON records to an accountant.",
  },
  {
    q: "Who owns my data?",
    a: "You do. Download CSV breakdowns from reports any time, or request a version 3 JSON export from Settings, and inspect or self-host the MIT-licensed code yourself. Each plan and account keeps its own currency, and totals in different currencies stay separate instead of being silently mixed or converted.",
  },
  {
    q: "How do I start?",
    a: "Create a manual account, import a bank CSV with column mapping and duplicate detection, then review categories and subscription suggestions. Next, build your first zero-based Plan and add known due items to Cash Flow. The getting-started guide walks the whole path step by step, so start there.",
  },
  {
    q: "Is this budget app FAQ valid if I self-host Tracky?",
    a: "Mostly yes. Costs, manual accounts, CSV import, Plan logic, and data ownership work the same everywhere. The differences are connection-related: bank sync and the analyst depend on your instance's provider setup and environment flags. Check Settings for provider status and tier, since self-hosted behavior follows your configuration.",
  },
  {
    q: "Are Tracky's forecasts guaranteed?",
    a: "No. Forecast scenarios and the analyst's long-term projections are planning estimates built from your balances and assumptions, never guarantees. Read the assumptions shown with each result and compare scenarios before deciding. Long-term projections are Pro-only, and Free accounts cannot run them — billing upgrades are not available yet.",
  },
];

const seoIntro: Array<string> = [
  "You want straight answers before trusting an app with your money. This budget app FAQ gives them: what Tracky costs, what you must connect, and what stays switched off on the hosted demo. You will learn how manual accounts and CSV import cover most needs.",
  "You will see where bank sync and the AI analyst actually run, and how to keep personal and work money apart in one workspace. You will also see who owns your data and how exports work. Every answer below follows the product docs.",
  "Read the six questions first, then the two extras on self-hosting and forecasts. Still curious after that? Open the free demo and check each claim yourself.",
];

const seoBlocks: Array<{ h: string; paras: Array<string> }> = [
  { h: "How to use this budget app FAQ", paras: [
    "Start with the question that blocks you: cost, bank connection, or demo limits. Each answer states what works everywhere and what depends on your instance, so you can act at once.",
    "Save the two closing questions for last: one maps what changes when you self-host, the other sets expectations on forecasts — helpful estimates, never promises. When an answer names a feature, open it in the demo and confirm the behavior yourself.",
  ] },
];

export const Route = createFileRoute('/faq')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'FAQ — honest answers about Tracky',
      description:
        'Honest answers: free forever, no bank required, analyst and sync availability, couples, freelancers, data ownership.',
      locale: 'en',
      path: '/faq',
      ogImage: ogImageFor('faq'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/faq', inLanguage: ['en', 'it'] }),
        faqJsonLd(qa.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'FAQ', path: '/faq' },
        ]),
      ],
    }),
  component: FaqEn,
});

function FaqEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/faq">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Asked.
            <br />
            <span className="hl">Answered.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            No marketing fog: what costs money (nothing), what needs a bank (nothing), what is disabled on the demo
            (sync + analyst), and who owns your data (<b>you</b>).
          </p>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoIntro.map((para, i) => (
          <Reveal key={i}>
            <p className="mk-sub" style={{ maxWidth: 720 }}>{para}</p>
          </Reveal>
        ))}
      </section>
      <MarqueeBand items={['NO FOG', 'NO CARD', 'NO LOCK-IN', 'MIT CODE', 'YOUR DATA']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {qa.map((entry) => (
          <Reveal key={entry.q}>
            <details open={qa.indexOf(entry) === 0}>
              <summary>{entry.q}</summary>
              <p style={{ marginTop: 8 }}>{entry.a}</p>
            </details>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoBlocks.map((block) => (
          <Reveal key={block.h}>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>{block.h}</h2>
            {block.paras.map((para, i) => (
              <p key={i} className="mk-sub" style={{ maxWidth: 700 }}>{para}</p>
            ))}
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Still curious? Touch it.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · 5 minutes · no card</p>
            <MagnetCta href={user ? '/app' : signUpUrl} onClick={() =>
                user
                  ? undefined
                  : trackEvent(analyticsEvents.signupStarted, { cta_location: 'marketing' }, { sendBeacon: true })
              }
            >
              {user ? 'Open the demo →' : 'Start free →'}
            </MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
