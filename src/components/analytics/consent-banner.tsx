import * as React from 'react';
import { useRouterState } from '@tanstack/react-router';

import type { AppLocale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { readConsent, setAnalyticsConsent } from '@/lib/analytics/events';
import { translate, useI18n } from '@/lib/i18n';

export function resolveConsentBannerLocale(pathname: string, contextLocale: AppLocale): AppLocale {
  if (pathname === '/it' || pathname.startsWith('/it/')) {
    return 'it';
  }
  return contextLocale;
}

export function ConsentBannerDialog({
  locale,
  onDecide,
}: {
  locale: AppLocale;
  onDecide: (accepted: boolean) => void;
}) {
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={translate(locale, 'tracking.consent.title')}
      className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-4 w-[calc(100%-2rem)] max-w-2xl rounded-2xl border bg-background p-4 shadow-lg"
    >
      <p className="text-sm font-medium">{translate(locale, 'tracking.consent.title')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{translate(locale, 'tracking.consent.body')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onDecide(true)}>
          {translate(locale, 'tracking.consent.accept')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onDecide(false)}>
          {translate(locale, 'tracking.consent.reject')}
        </Button>
      </div>
    </div>
  );
}

export function ConsentBanner() {
  const { locale: contextLocale } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    setVisible(readConsent() === 'unknown');
  }, []);

  if (!visible) return null;

  const displayLocale = resolveConsentBannerLocale(pathname, contextLocale);

  const decide = (accepted: boolean) => {
    setAnalyticsConsent(accepted);
    setVisible(false);
  };

  return <ConsentBannerDialog locale={displayLocale} onDecide={decide} />;
}
