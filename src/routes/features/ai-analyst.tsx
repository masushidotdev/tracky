import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

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
