import * as React from 'react';

import '../../styles/marketing/vivi.css';
import { ProgressBar } from './vivi';

import type { AppLocale } from '@/lib/i18n';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { marketingPages } from '@/lib/marketing/pages';

export type MarketingAuth = {
  user: unknown | null;
  signInUrl: string;
  signUpUrl: string;
};

const navLinks: Array<{ key: string; en: string; it: string }> = [
  { key: 'features', en: '/features/zero-based-plan', it: '/it/funzioni/piano-zero-based' },
  { key: 'pricing', en: '/pricing', it: '/it/prezzi' },
  { key: 'open-source', en: '/open-source', it: '/it/open-source' },
  { key: 'faq', en: '/faq', it: '/it/domande-frequenti' },
];

const navLabels: Record<string, Record<AppLocale, string>> = {
  features: { en: 'Features', it: 'Funzioni' },
  pricing: { en: 'Pricing', it: 'Prezzi' },
  'open-source': { en: 'Open source', it: 'Open source' },
  faq: { en: 'FAQ', it: 'FAQ' },
};

/**
 * Shared public-site shell: Vivi pill nav + footer.
 * Keeps document lang in sync with the route locale (root hardcodes en).
 */
export function MarketingSite({
  locale,
  auth,
  currentPath,
  children,
}: {
  locale: AppLocale;
  auth: MarketingAuth;
  currentPath: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const page = marketingPages.find((entry) => entry.en === currentPath || entry.it === currentPath);
  const langHref = page ? (locale === 'en' ? page.it : page.en) : locale === 'en' ? '/it/' : '/';

  return (
    <div className="mk">
      <ProgressBar />
      <div className="wrap" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <nav className="mk-nav" aria-label="Primary">
          <div className="logo disp" style={{ fontSize: 22 }}>
            <a href={locale === 'it' ? '/it/' : '/'} style={{ color: '#fff' }}>
              tracky<span style={{ color: 'var(--mk-acid)' }}>*</span>
            </a>
          </div>
          <div className="mk-links" style={{ display: 'flex', gap: 24 }}>
            {navLinks.map((link) => (
              <a key={link.key} href={locale === 'it' ? link.it : link.en}>
                {navLabels[link.key][locale]}
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a href={langHref} style={{ fontSize: 14 }} lang={locale === 'en' ? 'it' : 'en'}>
              {locale === 'en' ? 'IT' : 'EN'}
            </a>
            {auth.user ? (
              <a className="mk-btn" href="/app">
                {locale === 'it' ? 'Apri la demo →' : 'Open the demo →'}
              </a>
            ) : (
              <a
                className="mk-btn"
                style={{ marginRight: 8 }}
                href={auth.signInUrl}
                onClick={() =>
                  // sendBeacon: the full-page WorkOS redirect unloads us before XHR flushes.
                  trackEvent(analyticsEvents.signinStarted, { cta_location: 'nav' }, { sendBeacon: true })
                }
              >
                {locale === 'it' ? 'Accedi' : 'Sign in'}
              </a>
            )}
            {!auth.user ? (
              <a
                className="mk-btn"
                href={auth.signUpUrl}
                onClick={() =>
                  // sendBeacon: the full-page WorkOS redirect unloads us before XHR flushes.
                  trackEvent(analyticsEvents.signupStarted, { cta_location: 'nav' }, { sendBeacon: true })
                }
              >
                {locale === 'it' ? 'Gratis →' : 'Free →'}
              </a>
            ) : null}
          </div>
        </nav>
        <main>{children}</main>
        <footer className="mk-footer">
          <span>
            © 2026 Tracky ·{' '}
            <a href="https://github.com/masushidotdev/tracky" rel="noopener">
              MIT open source
            </a>
          </span>
          <span>
            <a href={locale === 'it' ? '/it/prezzi' : '/pricing'}>{locale === 'it' ? 'Prezzi' : 'Pricing'}</a>
            {' · '}
            <a href={locale === 'it' ? '/it/domande-frequenti' : '/faq'}>FAQ</a>
            {' · '}
            <a href={locale === 'it' ? '/it/open-source' : '/open-source'}>GitHub</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
