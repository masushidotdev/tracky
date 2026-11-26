// @vitest-environment jsdom
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { ConsentBanner, ConsentBannerDialog, resolveConsentBannerLocale } from './consent-banner';
import { I18nProvider } from '@/lib/i18n';

const mockState = vi.hoisted((): { pathname: string; consent: 'unknown' | 'accepted' | 'rejected' } => ({
  pathname: '/blog',
  consent: 'unknown',
}));

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: mockState.pathname } }),
}));

vi.mock('@/lib/analytics/events', () => ({
  readConsent: () => mockState.consent,
  setAnalyticsConsent: vi.fn(),
}));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
  mockState.pathname = '/blog';
  mockState.consent = 'unknown';
});

describe('resolveConsentBannerLocale', () => {
  test('returns it for /it and /it/* regardless of context locale', () => {
    expect(resolveConsentBannerLocale('/it', 'en')).toBe('it');
    expect(resolveConsentBannerLocale('/it/', 'en')).toBe('it');
    expect(resolveConsentBannerLocale('/it/blog', 'en')).toBe('it');
    expect(resolveConsentBannerLocale('/it/blog/self-hosting-tracky-docker', 'en')).toBe('it');
  });

  test('preserves context locale on non-IT routes', () => {
    expect(resolveConsentBannerLocale('/', 'en')).toBe('en');
    expect(resolveConsentBannerLocale('/blog', 'en')).toBe('en');
    expect(resolveConsentBannerLocale('/blog', 'it')).toBe('it');
    expect(resolveConsentBannerLocale('/app', 'it')).toBe('it');
    expect(resolveConsentBannerLocale('/italian', 'en')).toBe('en');
  });
});

describe('ConsentBannerDialog', () => {
  test('renders Italian copy when locale is it', () => {
    const html = renderToStaticMarkup(React.createElement(ConsentBannerDialog, { locale: 'it', onDecide: () => {} }));
    expect(html).toContain('Aiutaci a migliorare Tracky?');
    expect(html).toContain('Accetta');
    expect(html).toContain('Rifiuta');
  });

  test('renders English copy when locale is en', () => {
    const html = renderToStaticMarkup(React.createElement(ConsentBannerDialog, { locale: 'en', onDecide: () => {} }));
    expect(html).toContain('Help improve Tracky?');
    expect(html).toContain('Accept');
    expect(html).toContain('Reject');
  });
});

describe('ConsentBanner route-aware localization', () => {
  test('renders Italian strings on /it/blog when consent is unknown', () => {
    mockState.pathname = '/it/blog';
    mockState.consent = 'unknown';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    React.act(() => {
      root.render(React.createElement(I18nProvider, null, React.createElement(ConsentBanner)));
    });

    expect(container.textContent).toContain('Aiutaci a migliorare Tracky?');
    expect(container.textContent).toContain('Accetta');
    expect(container.textContent).toContain('Rifiuta');

    React.act(() => {
      root.unmount();
    });
  });

  test('renders English strings on /blog when consent is unknown', () => {
    mockState.pathname = '/blog';
    mockState.consent = 'unknown';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    React.act(() => {
      root.render(React.createElement(I18nProvider, null, React.createElement(ConsentBanner)));
    });

    expect(container.textContent).toContain('Help improve Tracky?');
    expect(container.textContent).toContain('Accept');
    expect(container.textContent).toContain('Reject');

    React.act(() => {
      root.unmount();
    });
  });
});
