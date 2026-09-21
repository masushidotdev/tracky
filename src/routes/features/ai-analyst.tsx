import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const INTRO = "You want answers from your money without handing over control. Tracky's AI spending analyst reads the data you authorize and turns it into what-if scenarios, charts, and flags you can act on. You ask in plain language, you check the preview, and nothing sensitive changes until you approve it.\n\nIt proposes. You sign. That is the whole deal: the analyst suggests Plan assignments, virtual money-box moves, and recategorizations, while you verify every detail before anything lands. Deny a proposal and your data stays exactly as it was.\n\nBehind the chat, automated checks keep watch. Every six hours Tracky evaluates Plan buckets near their limits, upcoming subscription and installment payments, the first projected negative cashflow date, and sync issues. Daily jobs score account health, flag anomalies and duplicates, and close due card cycles. Bill reminders come from your planned expenses with lead times you choose in Settings.\n\nOne thing matters most: this AI spending analyst is an exploration aid, not financial advice. Projections are nominal estimates you compare across scenarios, never guarantees. Email and Telegram reports stay off until you opt in. And the analyst is environment-gated — self-host and roadmap territory, disabled on the hosted demo, hidden where not enabled.";

const BLOCKS = [
  { h: "What your AI spending analyst actually does",
    p: "You bring the questions, the analyst brings the reading. It scans the accounts, transactions, spending, Plan progress, cashflow, virtual money boxes, subscriptions, and planned items you authorize, then explains patterns in plain words with charts and tables. Ask what-if questions like moving a Plan target or shifting a planned expense, and compare scenarios side by side.\n\nIt also keeps an eye out while you do other things. Daily checks flag duplicate entries, spending spikes, and account health dips. Bill reminders surface from your planned expenses, and notifications warn you about buckets near their limits, payments due within seven days, or a first projected negative cashflow date. Subscription suggestions stay suggestions: you confirm before anything changes.", },
  { h: "How it works, step by step",
    p: "First you open the analyst where it is enabled and start a conversation in plain language. You can keep several conversations, rename them, and pick an available model and reasoning level. The analyst reads only the data you authorize for that environment.\n\nThen you ask and inspect. It answers with explanations, tables, or charts, and every sensitive change arrives as a preview: Plan assignments or targets, virtual money-box moves, planned items, memory updates, or bulk recategorizations. You check amount, currency, account, category, date, and recurrence, then approve or deny. Denial leaves everything untouched.\n\nMeanwhile automations run on schedule. Sync and notification checks run every six hours, anomaly checks daily, and the monthly report and subscription review land on fixed days. Reminders dedupe by occurrence and threshold, so the same bill does not spam you.", },
  { h: "Honest limits: self-host, gated, never advice",
    p: "The badge says Self-host / Roadmap, and the demo says disabled. The analyst section appears only where it is enabled; elsewhere its sidebar and command entries hide and the page shows feature disabled. Backend automations and Telegram keep their own schedule regardless.\n\nThe analyst never gives financial advice and never writes to your ledger on its own. Long-term projections are nominal estimates built from tracked balances and recent cashflow, with assumptions you can override in chat — read them every time and compare scenarios, because nothing is guaranteed. Email and Telegram delivery stay off by default and need your explicit opt-in, with Telegram linked first. You stay the approver on every sensitive change.", },
  { h: "Who it is for",
    p: "You like control and curiosity in equal measure. You track accounts and planned expenses in Tracky, you enjoy testing what-if scenarios, and you want flags for duplicates, spikes, and upcoming payments before they bite. You read assumptions, compare estimates, and approve each change yourself.\n\nIt fits self-hosters best. You run your own instance, enable the analyst where you choose, and link Telegram or email only if you want them. If you need hands-off money management or certified financial advice, this is not that — and it says so upfront. You get an assistant that proposes, a ledger that waits, and a final call that stays yours.", },
];

const PAGE_FAQ = [
  { q: "What can the AI spending analyst change without asking me?",
    a: "Nothing sensitive. Every Plan assignment, virtual money-box move, planned item, memory update, or bulk recategorization arrives as a preview and waits for your approval. You see the full details up front, and if you deny, your data stays unchanged. Read-only explanations, charts, and what-if scenarios need no approval because they change nothing.", },
  { q: "Why is the analyst disabled on the hosted demo?",
    a: "The analyst is environment-gated and carries a Self-host / Roadmap badge. On the hosted demo the section hides from the sidebar and command palette, and opening it shows feature disabled. Backend automations continue on their own schedule. To try the analyst, you self-host Tracky and enable it in your own environment.", },
  { q: "Are the analyst's projections guaranteed?",
    a: "No. Every projection is a nominal estimate built from tracked balances, recent cashflow, and stated assumptions you can override in chat. Results show their assumptions so you can compare scenarios side by side. Treat them as exploration aids, not financial advice, and always verify decisions against your contract data.", },
  { q: "How do bill reminders and notifications reach me?",
    a: "Bill reminders grow from planned expenses with lead times you pick in Settings, up to four thresholds per bill, with dedupe per occurrence. Plan, subscription, cashflow, and sync notifications evaluate every six hours. Everything lands in your in-app inbox first; email and Telegram deliver only selected types after your explicit opt-in.", },
  { q: "Can I link Telegram to the analyst?",
    a: "Yes, where the analyst is enabled. You generate a one-time command in Settings and send it privately to the configured bot; it expires after ten minutes and works once. You can unlink anytime. Requests needing approval keep saying so, and Telegram reports stay off until you opt in.", },
];

export const Route = createFileRoute('/features/ai-analyst')({
  loader: async () => {
    let auth: { user: unknown | null; signInUrl: string; signUpUrl: string } = { user: null, signInUrl: '/app', signUpUrl: '/app' };
    try {
      const { user } = await getAuth();
      const signInUrl = await getSignInUrl({ data: { returnPathname: '/app' } });
      const signUpUrl = await getSignUpUrl({ data: { returnPathname: '/app' } });
      auth = { user, signInUrl, signUpUrl };
    } catch {
      // No WorkOS secrets on this worker (e.g. staging): degrade to logged-out.
    }
    return auth;
  },
  head: () =>
    buildMarketingHead({
      title: 'AI analyst: exploration aid, you approve · Tracky',
      description:
        'Tracky’s analyst reads your data for what-ifs and anomaly flags. Approval-gated writes, email/Telegram optional. Disabled on the hosted demo.',
      locale: 'en',
      path: '/features/ai-analyst',
      ogImage: ogImageFor('feature-analyst'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/features/ai-analyst', inLanguage: ['en', 'it'] }),
        faqJsonLd(PAGE_FAQ.map((entry) => ({ question: entry.q, answer: entry.a }))),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'AI analyst', path: '/features/ai-analyst' },
        ]),
      ],
    }),
  component: AnalystEn,
});

function AnalystEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/features/ai-analyst">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Self-host / Roadmap</span>
            <span className="mk-badge">Disabled on the demo</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            It proposes.
            <br />
            <span className="hl">You sign.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            The analyst is an <b>exploration aid, not financial advice</b>: what-ifs, charts, anomaly and duplicate
            flags on data you authorize. Sensitive writes need preview + your approval; email and Telegram reports are
            off by default. Environment-gated — hidden where not enabled, including the hosted demo.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href="https://github.com/masushidotdev/tracky" variant="pill">
            Enable it self-hosted →
          </MagnetCta>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>{INTRO}</p>
        </Reveal>
      </section>
      <MarqueeBand items={['WHAT-IFS', 'ANOMALY FLAGS', 'APPROVAL-GATED', 'OFF BY DEFAULT', 'NOT ADVICE']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d good">
              <h3>✅ IT DOES</h3>
              <ul>
                <li>What-if scenarios on your data</li>
                <li>Duplicate + spike flags</li>
                <li>Bill reminders, sync alerts</li>
                <li>Proposes — you approve</li>
              </ul>
            </div>
            <div className="mk-d bad">
              <h3>🚫 IT NEVER</h3>
              <ul>
                <li>Financial advice</li>
                <li>Autonomous ledger writes</li>
                <li>Spam channels by default</li>
                <li>Promises or guarantees</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {BLOCKS.map((block) => (
          <Reveal key={block.h}>
            <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>{block.h}</h2>
            <p className="mk-sub" style={{ maxWidth: 700 }}>{block.p}</p>
          </Reveal>
        ))}
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px,4vw,48px)' }}>Questions, answered.</h2>
        </Reveal>
        {PAGE_FAQ.map((entry) => (
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
            <h2 className="mk-h2">Assistance, not autopilot.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Self-hosted · gated · approval-first</p>
            <MagnetCta href="https://github.com/masushidotdev/tracky">Read the code →</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
