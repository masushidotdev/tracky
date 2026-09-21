import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, DragStrip, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/')({
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
      title: 'Tracky — Free open-source budget & cash-flow planner',
      description:
        'Tracky is a free, MIT-licensed budget planner: zero-based plan, cash-flow forecast, CSV import and reports. Try the hosted demo, no card.',
      locale: 'en',
      path: '/',
      ogImage: ogImageFor('home'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/', inLanguage: ['en', 'it'] }),
        breadcrumbJsonLd([{ name: 'Home', path: '/' }]),
      ],
    }),
  component: HomeEn,
});

const band = ['READY TO ASSIGN = 0 ✓', 'CASH-FLOW FORECAST', 'CSV IMPORT', 'SPENDING REPORTS', 'MIT OPEN SOURCE'];

const cards = [
  { e: '🪣', t: 'ZERO-BASED PLAN', p: 'Every euro gets a job before it is spent. Ready to Assign at zero means the month is locked.' },
  { e: '🔮', t: 'CASH-FLOW FORECAST', p: 'Known bills, paydays and instalments projected forward. First negative date, computed daily.' },
  { e: '📥', t: 'CSV IMPORT', p: 'Bank exports land in a manual account in minutes. Parsed in your browser, never uploaded raw.' },
  { e: '📊', t: 'REPORTS + CSV', p: 'Spending and income by category, month over month. Export everything for your accountant.' },
  { e: '🏦', t: 'BANK SYNC', p: 'PSD2 via Enable Banking on your own instance. Bring your own app keys — revocable anytime.' },
  { e: '🤖', t: 'AI ANALYST', p: 'An exploration aid on self-hosted instances: what-ifs, anomaly flags, approval-gated writes.' },
];

function HomeEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/">
      <header className="mk-hero">
        <div className="mk-stickers" aria-hidden="true">
          <span className="mk-stk" style={{ top: '6%', right: '8%', background: 'var(--mk-acid)', transform: 'rotate(6deg)' }}>
            FREE*
          </span>
          <span className="mk-stk" style={{ top: '48%', left: '-10px', background: '#fff', transform: 'rotate(-6deg)' }}>
            MIT open source
          </span>
        </div>
        <Reveal>
          <h1>
            Your money
            <br />
            <span className="stroke">works.</span>
            <br />
            <span className="hl">You live.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Tracky gives <b>every euro a job</b>, forecasts the balance 90 days out and keeps spending honest. Free,
            open source, no card — try the hosted demo or self-host it.
          </p>
        </Reveal>
        <Reveal>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Try the demo free →'}</MagnetCta>
            <span style={{ fontWeight: 700 }}>↓ drag the cards, touch everything</span>
          </div>
        </Reveal>
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Free plan</span>
            <span className="mk-badge">No card</span>
            <span className="mk-badge">MIT</span>
            <span className="mk-badge">EN + IT</span>
          </div>
        </Reveal>
      </header>
      <MarqueeBand items={band} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            The anti-chaos <span className="u">armory.</span>
          </h2>
        </Reveal>
        <p style={{ textAlign: 'center', color: '#666', fontSize: 14 }}>← drag → · 6 tools, one enemy: end-of-month overdraft</p>
        <Reveal>
          <DragStrip>
            {cards.map((card) => (
              <div className="mk-card" key={card.t}>
                <div className="e">{card.e}</div>
                <h3>{card.t}</h3>
                <p>{card.p}</p>
              </div>
            ))}
          </DragStrip>
        </Reveal>
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 8 }}>
            <img src="/shots/import-preview.png" alt="Tracky's CSV import preview: row-by-row validation before importing" width={1440} height={800} loading="lazy" />
            <figcaption>CSV import preview — every row validated before a euro moves. Screenshot from the live demo.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2">
            Without vs <span className="u">with.</span>
          </h2>
        </Reveal>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d bad">
              <h3>😵 SPREADSHEET CHAOS</h3>
              <ul>
                <li>Balances copied by hand</li>
                <li>Forgotten subscriptions</li>
                <li>Weekend Excel sessions</li>
                <li>“I thought there was…”</li>
              </ul>
            </div>
            <div className="mk-d good">
              <h3>😎 WITH TRACKY</h3>
              <ul>
                <li>Observed balances, always dated</li>
                <li>Recurring payments on the radar</li>
                <li>20 minutes from your phone</li>
                <li>Same numbers, zero arguments</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
      <section className="mk-section" id="go" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Overdraft: warned. You: armed.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free · 5 minutes · no card · MIT open source</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
