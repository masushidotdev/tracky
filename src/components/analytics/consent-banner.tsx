import * as React from 'react';

import { Button } from '@/components/ui/button';
import { readConsent, setAnalyticsConsent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';

export function ConsentBanner() {
  const { t } = useI18n();
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    setVisible(readConsent() === 'unknown');
  }, []);

  if (!visible) return null;

  const decide = (accepted: boolean) => {
    setAnalyticsConsent(accepted);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('tracking.consent.title')}
      className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-4 w-[calc(100%-2rem)] max-w-2xl rounded-2xl border bg-background p-4 shadow-lg"
    >
      <p className="text-sm font-medium">{t('tracking.consent.title')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('tracking.consent.body')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => decide(true)}>
          {t('tracking.consent.accept')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => decide(false)}>
          {t('tracking.consent.reject')}
        </Button>
      </div>
    </div>
  );
}
