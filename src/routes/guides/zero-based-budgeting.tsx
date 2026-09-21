import { createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { MarketingSite } from '@/components/marketing/site';
import { Confetti, MagnetCta, MarqueeBand, Reveal } from '@/components/marketing/vivi';
import { breadcrumbJsonLd, buildMarketingHead, faqJsonLd, ogImageFor, softwareAppJsonLd } from '@/lib/marketing/seo';

const steps = [
  { t: 'Create one manual account', p: 'You open Accounts and add a manual checking account in EUR with a short name you recognize instantly every time. You set today\'s real balance as the starting point, because the plan only assigns money that truly exists right now. You connect nothing, so every later figure comes from this balance plus CSV rows you preview yourself first. This account becomes the single funding source for your first plan, and each assigned euro traces back to cash you hold now.' },
  { t: 'Import a bank CSV', p: 'You export the CSV from your bank and bring it into Tracky on the account you just created. You map the three columns Tracky asks for, date, description, and amount, so each row lands correctly every time. You read the preview row by row and fix anything odd before anything is written, then confirm only when every row reads clean and complete. Your plan now holds real activity ready to assign, and Unexplained stays at zero from the very start.' },
  { t: 'Create the plan', p: 'You create one plan and choose your manual account as its funding source. You keep one currency and one plan, so balances and assignments speak the same language throughout every month. The plan starts the day you create it: earlier movements stay inside today\'s balances yet create no activity and no overspending. If the origin looks wrong after a history import, use Restart from here to pick the first day that counts while groups, buckets, targets, and assignments stay intact.' },
  { t: 'Assign every euro', p: 'You open the plan and fill each bucket with money sitting in your funding account right now. You continue until Ready to Assign reaches zero, because every euro needs a job and idle money drifts into unchosen spending. New income lands in Ready to Assign, never as negative spending inside a bucket, so you give it work the moment it arrives. You also bring Unexplained to zero, proving each account movement is attributed correctly and nothing extra ever appeared there.' },
  { t: 'Watch Available carry', p: 'You close the month and watch positive Available balances roll into the next one. That carry is how annual funds grow: what you skip spending stays in its bucket and lowers next month\'s need. When a cash row turns red, you move Available money from another bucket to cover it, because uncovered cash overspending lowers Ready to Assign instead of carrying over. When the red sits on card spending, you fund that card\'s payment bucket before the statement is paid.' },
];

const faq = [
  {
    q: 'Can I start if my history is messy?',
    a: 'You start anyway, because day one of the plan is the day you create it. Movements from before stay inside today\'s balances without creating activity or overspending. If that starting point feels wrong, open the plan selector and choose Restart from here for the first day that should count. Tracky keeps your groups, buckets, targets, and assignments, then rebuilds the history from the new origin.',
  },
  {
    q: 'Do I have to reach zero on day one?',
    a: 'That is the goal, not an obligation you must meet on day one. A positive Ready to Assign simply means some money still has no job, and money without a job tends to leave on something you did not choose. You get closer each time you sit down and assign. Even a partly assigned plan beats a month where spending comes before decisions.',
  },
  {
    q: 'What happens if I spend more than a bucket holds?',
    a: 'The bucket row turns red and asks for one of two fixes. For cash overspending you shift Available funds across from another bucket, or the gap reduces next month\'s Ready to Assign rather than rolling over. For credit overspending you fund the card\'s payment bucket, since the debt grew even though no cash has left yet. Either way the negative balance itself never moves forward.',
  },
  {
    q: 'How to build zero based budget that still works next month?',
    a: 'You carry positive Available balances into next month, building funds for yearly bills without extra work. You cover every red cash row by moving money from another bucket, so shortfalls never silently lower next month\'s Ready to Assign. New income always lands in Ready to Assign first. Each month then starts from real balances, and the plan keeps working.',
  },
];

export const Route = createFileRoute('/guides/zero-based-budgeting')({
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
      title: 'How to build a zero-based budget in Tracky',
      description:
        '5 steps: manual account, CSV import, first plan, assign to zero, carry Available. Works in the free demo — start today.',
      locale: 'en',
      path: '/guides/zero-based-budgeting',
      ogImage: ogImageFor('guide-budget'),
      jsonLd: [
        softwareAppJsonLd({ url: 'https://www.trytracky.app/guides/zero-based-budgeting', inLanguage: ['en', 'it'] }),
        faqJsonLd(faq.map((entry) => ({ question: entry.q, answer: entry.a }))),
        {
          '@context': 'https://schema.org',
          '@type': 'HowTo',
          name: 'How to build a zero-based budget in Tracky',
          step: steps.map((s) => ({ '@type': 'HowToStep', name: s.t, text: s.p })),
        },
        breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/guides/zero-based-budgeting' },
        ]),
      ],
    }),
  component: GuideEn,
});

function GuideEn() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  return (
    <MarketingSite locale="en" auth={{ user, signInUrl, signUpUrl }} currentPath="/guides/zero-based-budgeting">
      <header className="mk-hero">
        <Reveal>
          <div className="mk-badges">
            <span className="mk-badge solid">Guide</span>
            <span className="mk-badge">5 steps</span>
            <span className="mk-badge">Free demo</span>
          </div>
        </Reveal>
        <Reveal>
          <h1>
            First budget,
            <br />
            <span className="hl">5 steps.</span>
          </h1>
        </Reveal>
      </header>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <p className="mk-sub" style={{ maxWidth: 720 }}>You want a budget where every euro has a job. This guide shows you how to build zero based budget in Tracky in five practical steps, and it works in demo today.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>You open a manual EUR checking account and link no bank at all. You bring in a bank CSV through a row-by-row preview, then tie one plan to that account as its only funding source.</p>
          <p className="mk-sub" style={{ maxWidth: 720, marginTop: 16 }}>Then you assign every euro until Ready to Assign reaches zero. You keep Unexplained at zero too, so each movement stays accounted for. Positive Available balances carry into next month, while cash overspending lowers Ready to Assign until you move money between buckets. Open the free demo and follow each step yourself: no card needed, guide included, first plan done today.</p>
        </Reveal>
      </section>
      <MarqueeBand items={['ACCOUNT', 'CSV', 'PLAN', 'ASSIGN TO ZERO', 'CARRY OVER']} />
      <section className="mk-section" style={{ paddingTop: 0 }}>
        {steps.map((s, i) => (
          <Reveal key={s.t}>
            <div className="mk-card" style={{ maxWidth: 760, margin: '0 auto 16px', minWidth: 0, transform: 'none' }}>
              <div className="e">{i + 1}.</div>
              <h3>{s.t.toUpperCase()}</h3>
              <p>{s.p}</p>
            </div>
          </Reveal>
        ))}
        <Reveal>
          <figure className="mk-shot" style={{ marginTop: 24, maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
            <img src="/shots/import-preview.png" alt="Step 2 in action: Tracky CSV preview validating each row" width={1440} height={800} loading="lazy" />
            <figcaption>Step 2 in action: the CSV preview from the live demo.</figcaption>
          </figure>
        </Reveal>
      </section>
      <section className="mk-section" style={{ paddingTop: 0 }}>
        <Reveal>
          <h2 className="mk-h2" style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>Questions, answered.</h2>
        </Reveal>
        {faq.map((entry) => (
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
            <h2 className="mk-h2">Your turn. 5 steps.</h2>
            <p style={{ margin: '16px 0 30px', fontSize: 18 }}>Free demo · no card · guide included</p>
            <MagnetCta href={user ? '/app' : signUpUrl}>{user ? 'Open the demo →' : 'Start free →'}</MagnetCta>
          </div>
        </Reveal>
      </section>
    </MarketingSite>
  );
}
