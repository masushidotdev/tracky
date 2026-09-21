import * as React from 'react';

import { Link, createFileRoute } from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';

import { Button } from '@/components/ui/button';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => {
    const { user } = await getAuth();
    const signInUrl = await getSignInUrl({ data: { returnPathname: '/app' } });
    const signUpUrl = await getSignUpUrl({ data: { returnPathname: '/app' } });

    return { user, signInUrl, signUpUrl };
  },
});

function Home() {
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();
  const { t } = useI18n();

  // StrictMode double-invokes effects in dev: ref-guard keeps one landing_viewed.
  const landingSent = React.useRef(false);
  React.useEffect(() => {
    if (landingSent.current) return;
    landingSent.current = true;
    trackEvent(analyticsEvents.landingViewed, { auth_state: user ? 'logged' : 'anon' });
  }, [user]);

  return (
    <main className="min-h-svh bg-background">
      <section className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12">
        <div className="max-w-2xl space-y-4">
          <p className="text-sm font-medium text-muted-foreground">{t('home.eyebrow')}</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Tracky</h1>
          <p className="text-lg text-muted-foreground">{t('home.description')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <Button asChild>
              <Link to="/app">{t('common.openDashboard')}</Link>
            </Button>
          ) : (
            <>
              <Button asChild>
                <a
                  href={signInUrl}
                  onClick={() =>
                    // sendBeacon: the full-page WorkOS redirect unloads us before XHR flushes.
                    trackEvent(analyticsEvents.signinStarted, { cta_location: 'landing' }, { sendBeacon: true })
                  }
                >
                  {t('common.signIn')}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={signUpUrl}
                  onClick={() =>
                    trackEvent(analyticsEvents.signupStarted, { cta_location: 'landing' }, { sendBeacon: true })
                  }
                >
                  {t('common.createAccount')}
                </a>
              </Button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
