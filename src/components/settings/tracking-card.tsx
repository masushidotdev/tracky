import * as React from 'react';

import type { ConsentState } from '@/lib/analytics/events';
import { analyticsEvents, readConsent, setAnalyticsConsent, trackEvent } from '@/lib/analytics/events';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';

// Revocation surface (banner is opt-in, this is opt-out). Same consent store.
// unknown initial state matches SSR so hydration never flashes a wrong button.
export function TrackingCard() {
  const { t } = useI18n();
  const [consent, setConsent] = React.useState<ConsentState>('unknown');

  React.useEffect(() => {
    setConsent(readConsent());
  }, []);

  const decide = (accepted: boolean) => {
    setAnalyticsConsent(accepted);
    setConsent(accepted ? 'accepted' : 'rejected');
    if (!accepted) {
      // setAnalyticsConsent with no SDK loaded cannot emit; record locally only.
      trackEvent(analyticsEvents.trackingConsentChanged, { value: 'rejected' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.tracking.title')}</CardTitle>
        <CardDescription>{t('settings.tracking.description')}</CardDescription>
        <CardAction>
          {consent === 'accepted' ? (
            <Button type="button" size="sm" variant="outline" onClick={() => decide(false)}>
              {t('settings.tracking.optOut')}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => decide(true)}>
              {t('settings.tracking.optIn')}
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {t(consent === 'accepted' ? 'settings.tracking.enabled' : 'settings.tracking.disabled')}
        </p>
      </CardContent>
    </Card>
  );
}
