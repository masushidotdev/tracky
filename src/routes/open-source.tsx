import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/open-source')({
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
      title: 'Tracky is MIT open source — self-host it',
      description:
        'Tracky is MIT-licensed on GitHub: Convex backend, TanStack frontend, bilingual docs. Try the hosted demo or run your own.',
      locale: 'en',
      path: '/open-source',
      ogImage: ogImageFor('open-source'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/open-source', inLanguage: ['en', 'it'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Open source', path: '/open-source' },
        ]),
      ],
    }),
  component: OssEn,
});

function OssEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/open-source">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">MIT</span>
            <span className="mk-badge">GitHub</span>
            <span className="mk-badge">Self-host</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Read it.
            <br />
            <span className="stroke">Fork it.</span>
            <br />
            <span className="hl">Run it.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Tracky is <b>MIT-licensed</b> at <b>masushidotdev/tracky</b>: Convex backend, TanStack Start frontend,
            bilingual user docs, decisions recorded in the open. The hosted demo is one deployment of this code —
            yours can enable bank sync, analyst and Pro-gated features on your own keys.
          </p>
        </Reveal>
        <Reveal>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <MagnetCta href="https://github.com/masushidotdev/tracky">★ Star on GitHub →</MagnetCta>
            <MagnetCta href={user ? '/app' : signUpUrl} variant="pill">
              {user ? 'Open the demo →' : 'Try the demo →'}
            </MagnetCta>
          </div>
        </Reveal>
      </header>
      <MarqueeBand items={['MIT LICENSE', 'CONVEX + TANSTACK', 'BILINGUAL DOCS', 'DECISIONS IN OPEN', 'YOUR KEYS']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Trust, compiled.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>MIT · GitHub · self-host in minutes</p>
            <MagnetCta href="https://github.com/masushidotdev/tracky">Read the code →</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
