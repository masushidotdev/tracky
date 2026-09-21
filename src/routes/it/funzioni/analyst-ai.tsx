import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/funzioni/analyst-ai')({
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
      title: 'Analyst AI: propone, tu firmi · Tracky',
      description:
        "L'analyst di Tracky legge i tuoi dati per what-if e anomalie. Scritture con approvazione, email/Telegram opzionali. Disabilitato sulla demo.",
      locale: 'it',
      path: '/it/funzioni/analyst-ai',
      ogImage: ogImageFor('feature-analyst'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/funzioni/analyst-ai', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Analyst AI', path: '/it/funzioni/analyst-ai' },
        ]),
      ],
    }),
  component: AnalystIt,
});

function AnalystIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/funzioni/analyst-ai">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Self-host / Roadmap</span>
            <span className="mk-badge">Disabilitato sulla demo</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            Lui propone.
            <br />
            <span className="hl">Tu firmi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            L'analyst è un <b>aiuto esplorativo, non consulenza finanziaria</b>: what-if, grafici, segnalazioni di
            anomalie e doppioni sui dati che autorizzi. Le scritture sensibili richiedono anteprima + approvazione;
            email e Telegram sono spenti di default. Gated per ambiente — nascosto dove non abilitato, demo inclusa.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href="https://github.com/masushidotdev/tracky" variant="pill">
            Abilitalo in self-host →
          </MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['WHAT-IF', 'ANOMALIE', 'CON APPROVAZIONE', 'SPENTI DI DEFAULT', 'NON CONSULENZA']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-duel">
            <div className="mk-d good">
              <h3>✅ LO FA</h3>
              <ul>
                <li>Scenari what-if sui tuoi dati</li>
                <li>Doppioni + picchi segnalati</li>
                <li>Promemoria bollette, alert sync</li>
                <li>Propone — tu approvi</li>
              </ul>
            </div>
            <div className="mk-d bad">
              <h3>🚫 MAI</h3>
              <ul>
                <li>Consulenza finanziaria</li>
                <li>Scritture autonome</li>
                <li>Spam di default</li>
                <li>Promesse o garanzie</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Assistenza, non pilota automatico.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Self-hosted · gated · prima l'approvazione</p>
            <MagnetCta href="https://github.com/masushidotdev/tracky">Leggi il codice →</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
