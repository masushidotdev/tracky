import { createFileRoute } from '@tanstack/react-router';
import { loadMarketingAuth } from '@/lib/marketing/auth';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const seoIntro: Array<string> = [
  "You want free budget app pricing with no fine print, so here it is: Tracky costs €0 today. You get the hosted demo plus the MIT-licensed self-hosted app, and you never enter card details because there is no checkout anywhere. Start in minutes with manual accounts and CSV import, and see your money clearly from day one.",
  "Your free tier covers the core loop: a zero-based plan, cash flow with bill reminders, reports, virtual money boxes, and subscription suggestions that flag likely renewals without claiming certainty. Email and Telegram delivery stay off until you switch them on, and long-term projections always read as estimates. Everything runs on data you enter or import, and you can export it as JSON on request.",
  "Open Settings anytime to see your current tier and daily Analyst allowance, and self-hosters get the same code from GitHub under the MIT license. If the free tier ever stops being enough, you will hear about Pro here first, with plain terms and no dark patterns.",
];

const seoBlocks: Array<{ h: string; paras: Array<string> }> = [
  { h: "Free budget app pricing: what €0 includes", paras: [
    "Your free tier gives you the full daily loop with nothing held back. You build a zero-based plan, track cash flow with bill reminders, and read reports that show where your money actually goes. You add manual accounts, import history with CSV, set aside virtual money boxes, and get subscription suggestions that flag likely renewals without claiming certainty.",
    "Connected accounts depend on each instance's bank provider, so self-hosters configure their own, while the hosted demo runs only on data you enter or import. In-app reminders work out of the box, while email and Telegram stay off by default until you switch them on (Telegram also needs a verified link). Your JSON export stays available on request, and with no card, no trial clock, and no checkout page, €0 means €0 while you run your money your way.",
  ] },
  { h: "Pro is coming soon, with no checkout", paras: [
    "Pro exists as a reserved tier, and it is not for sale today. When it arrives, it should raise your daily Analyst allowance from 20 to 100 messages and unlock long-term FIRE projections, which will always read as estimates rather than promises. Everything in Free stays exactly where it is.",
    "There is no price, no trial, and no checkout page, so nobody can charge you by accident or on purpose. You will see the same honest badge here until that changes: free now, Pro coming soon, nothing to buy.",
  ] },
];

const seoFaq: Array<{ q: string; a: string }> = [
  { q: "How does free budget app pricing work on Tracky?", a: "You pay €0 and you never add a card, because no checkout exists anywhere on the page or in the app. You use the hosted demo or self-host the MIT code, with manual accounts, CSV import, plans, cash flow, reports, and virtual money boxes. Settings shows your tier, and exports stay available on request, so your data stays yours." },
  { q: "Can I buy Pro today?", a: "No, and that is deliberate honesty rather than a dark pattern. Pro lives as a reserved tier with a coming-soon label, but there is no price, no trial, and no checkout, so no page can take your money. If it arrives, Pro should add 100 daily Analyst messages and long-term FIRE projections, framed as estimates. Until then the badge stays the same: free now." },
  { q: "Does the free tier include bank sync and notifications?", a: "Bank connections depend on each instance's provider, so the hosted demo runs on manual accounts and CSV import rather than promised syncing. Bill reminders and subscription suggestions work in-app, while email and Telegram stay off by default until you switch them on. Long-term projections always read as estimates, never guarantees, and nothing here counts as financial advice." },
  { q: "What happens to my data if I stay on Free forever?", a: "It stays yours, exportable as JSON on request, with memory text and settings included and embeddings excluded. Deletion requests are recorded from Settings and stay reversible, with no automatic erasure, so nothing vanishes silently. Self-hosters hold the same MIT code and data on their own machines. Free means free, with no trial clock quietly converting you into a paying customer." },
];

export const Route = createFileRoute('/pricing')({
  loader: loadMarketingAuth,
  head: () =>
    buildMarketingHead({
      title: 'Pricing — Free forever, Pro coming soon · Tracky',
      description:
        'Tracky costs €0: free hosted demo, MIT self-host, no card. A Pro tier exists in code but billing is not available yet.',
      locale: 'en',
      path: '/pricing',
      ogImage: ogImageFor('pricing'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/pricing', inLanguage: ['en', 'it'] }),
        faqJsonLd(seoFaq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Pricing', path: '/pricing' },
        ]),
      ],
    }),
  component: PricingEn,
});

function PricingEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  const cta = user ? '/app' : signUpUrl;
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/pricing">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Free <span className="hl">forever.</span>
            <br />
            <span className="stroke">Pro: later.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Today Tracky costs <b>€0</b>: hosted demo plus MIT self-host. A Pro tier is reserved in the code for analyst
            limits, forecast scenarios and multiple plans — but <b>billing does not exist yet</b> and nothing is for sale.
          </p>
        </Reveal>
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">€0 today</span>
            <span className="mk-badge">No card</span>
            <span className="mk-badge">No checkout</span>
          </div>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {seoIntro.map((para, i) => (
          <Reveal key={i}>
            <p className="mk-sub" style={{ maxWidth: 720 }}>{para}</p>
          </Reveal>
        ))}
      </section>
      <MarqueeBand items={['FREE HOSTED DEMO', 'MIT SELF-HOST', 'NO CARD', 'NO CHECKOUT', 'PRO ONLY IF REQUESTED']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d good">
              <h3>🟢 FREE — TODAY</h3>
              <ul>
                <li>Hosted demo, all core features</li>
                <li>Zero-based plan, cash-flow, reports</li>
                <li>Manual accounts + CSV import</li>
                <li>Self-host from GitHub, MIT</li>
              </ul>
              <p style={{ marginTop: 18 }}>
                <MagnetCta href={cta} variant="pill">
                  {user ? 'Open the demo →' : 'Start free →'}
                </MagnetCta>
              </p>
            </div>
            <div className="mk-d bad" style={{ background: '#fff' }}>
              <h3>🔜 PRO — COMING SOON</h3>
              <ul>
                <li>More analyst messages per day</li>
                <li>Forecast scenarios, multiple plans</li>
                <li>Only if users ask for it</li>
                <li>No price yet — no checkout exists</li>
              </ul>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24 }}>
            <img src="/shots/import-summary.png" alt="Tracky import summary: 33 transactions imported into the demo account" width={1440} height={800} loading="lazy" />
            <figcaption>What €0 buys: a real ledger in minutes. Screenshot from the live demo.</figcaption>
          </figure>
        </Reveal>
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
        {seoFaq.map((entry) => (
          <Reveal key={entry.q}>
            <details>
              <summary>{entry.q}</summary>
              <p style={{ marginTop: 8 }}>{entry.a}</p>
            </details>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">€0. No asterisk big enough to hide.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · MIT repo · no card</p>
            <MagnetCta href={cta}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
