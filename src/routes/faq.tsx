import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const qa = [
  {
    q: 'Is Tracky really free?',
    a: 'Yes. The hosted demo and the MIT-licensed self-host cost €0, no card. A Pro tier is reserved in the code but billing does not exist yet — nothing is for sale.',
  },
  {
    q: 'Do I have to connect my bank?',
    a: 'No. Manual accounts plus CSV import are enough. Bank sync via Enable Banking is available on your own instance with your own app keys, and it is disabled on the hosted demo.',
  },
  {
    q: 'Is the AI analyst available in the demo?',
    a: 'No — it is environment-gated and hidden on the hosted demo. On enabled instances it is an exploration aid, not financial advice, and sensitive writes need your approval.',
  },
  {
    q: 'Can couples or freelancers use it?',
    a: 'Yes. Couples share the same numbers; freelancers keep separate work accounts, see tax deadlines in cash-flow and export CSV for the accountant.',
  },
  {
    q: 'Who owns my data?',
    a: 'You do. CSV export any time, MIT code you can inspect and self-host, no data selling. Currencies are never mixed or converted behind your back.',
  },
  {
    q: 'How do I start?',
    a: 'Create a manual account, import a bank CSV, then build your first zero-based plan. See the First-budget guide for the 5-minute path.',
  },
];

export const Route = createFileRoute('/faq')({
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
        <Reveal>
          <div className="mk-final">
            <Confetti />
            <h2 className="mk-h2">Still curious? Touch it.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · 5 minutes · no card</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
