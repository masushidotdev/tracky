import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, DragStrip, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

export const Route = createFileRoute('/it/per-coppie-e-famiglie')({
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
      title: 'Budget per coppie e famiglie, stessi numeri · Tracky',
      description:
        'Un piano, stessi saldi e bucket per tutta la casa. Money box per scuola, vacanze e bollette. Demo gratis, senza carta.',
      locale: 'it',
      path: '/it/per-coppie-e-famiglie',
      ogImage: ogImageFor('for-couples'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/it/per-coppie-e-famiglie', inLanguage: ['it', 'en'] }),
        breadcrumbJsonLd([
          { name: 'Home', path: '/it/' },
          { name: 'Per coppie e famiglie', path: '/it/per-coppie-e-famiglie' },
        ]),
      ],
    }),
  component: CouplesIt,
});

function CouplesIt() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="it" auth={{ user, signInUrl, signUpUrl }} currentPath="/it/per-coppie-e-famiglie">
      <header className="mk-hero">
        <Reveal>
          <h1>
            Stessi numeri.
            <br />
            <span className="stroke">Zero</span> <span className="hl">litigi.</span>
          </h1>
        </Reveal>
        <Reveal>
          <p className="mk-dek">
            Una casa, un piano: <b>stessi saldi, stessi bucket</b>, visibili a tutti. I money box pre-finanziano
            virtualmente scuola, vacanze e bollette grosse. Niente più “pensavo ci fossero…”.
          </p>
        </Reveal>
        <Reveal>
          <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Prova la demo →'}</MagnetCta>
        </Reveal>
      </header>
      <MarqueeBand items={['UN PIANO', 'STESSI BUCKET', 'MONEY BOX', 'SCUOLA + VACANZE', 'ZERO LITIGI']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <DragStrip>
            <div className="mk-card"><div className="e">🏠</div><h3>CASA</h3><p>Affitto, bollette, mutuo — finanziati prima che inizi il mese.</p></div>
            <div className="mk-card"><div className="e">🛒</div><h3>SPESA</h3><p>Un bucket, due carrelli. L'attività mostra chi ha speso cosa.</p></div>
            <div className="mk-card"><div className="e">🎒</div><h3>SCUOLA</h3><p>Accantonata trimestre per trimestre. Niente panico a settembre.</p></div>
            <div className="mk-card"><div className="e">🏖️</div><h3>VACANZE</h3><p>Un po' ogni mese. Prenotate quando finanziate, non quando sperate.</p></div>
          </DragStrip>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Un tavolo. Stessi numeri.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Demo gratis · 5 minuti · senza carta</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Apri la demo →' : 'Inizia gratis →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
