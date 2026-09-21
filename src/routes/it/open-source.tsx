import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/open-source')({
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
      title: 'Tracky è open source MIT — installalo tu',
      description:
        'Tracky è MIT su GitHub: backend Convex, frontend TanStack, guide bilingue. Prova la demo ospitata o eseguilo tuo.',
      locale: 'it',
      path: '/it/open-source',
      ogImage: ogImageFor('open-source'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/open-source', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Open source', path: '/it/open-source' },
        ]),
      ],
    }),
  component: OssIt,
});

function OssIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/open-source">
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
            Leggilo.
            <br />
            <span className="stroke">Forkalo.</span>
            <br />
            <span className="hl">Eseguilo.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Tracky è <b>licenza MIT</b> su <b>masushidotdev/tracky</b>: backend Convex, frontend TanStack Start, guide
            bilingue, decisioni scritte in aperto. La demo è un deployment di questo codice — il tuo può abilitare sync
            bancaria, analyst e funzioni Pro con le tue chiavi.
          </p>
        </Reveal>
        <Reveal>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <MagnetCta href="https://github.com/masushidotdev/tracky">★ Stella su GitHub →</MagnetCta>
            <MagnetCta href={user ? '/app' : signUpUrl} variant="pill">
              {user ? 'Apri la demo →' : 'Prova la demo →'}
            </MagnetCta>
          </div>
        </Reveal>
      </header>
      <MarqueeBand items={['LICENZA MIT', 'CONVEX + TANSTACK', 'GUIDE BILINGUE', 'DECISIONI IN APERTO', 'LE TUE CHIAVI']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Fiducia, compilata.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>MIT · GitHub · self-host in minuti</p>
            <MagnetCta href="https://github.com/masushidotdev/tracky">Leggi il codice →</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
