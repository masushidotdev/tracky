import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';

export function UpgradeCta({
  dailyLimitReached = false,
  surface = 'unknown',
}: {
  dailyLimitReached?: boolean;
  surface?: string;
}) {
  const { t } = useI18n();
  const sent = React.useRef(false);

  // Impression-only: the CTA button is disabled (no paywall yet), so mount
  // records a view. Switch to upgradeCtaClicked in a click handler on launch.
  React.useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackEvent(analyticsEvents.upgradeCtaViewed, { surface, daily_limit_reached: dailyLimitReached });
  }, [dailyLimitReached, surface]);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t('entitlements.upgrade.title')}</CardTitle>
        <CardDescription className="flex flex-col gap-1">
          {dailyLimitReached ? <span>{t('entitlements.dailyLimit.error')}</span> : null}
          <span>{t('entitlements.upgrade.body')}</span>
        </CardDescription>
        <CardAction>
          <Button type="button" size="sm" variant="secondary" disabled>
            {t('entitlements.upgrade.cta')}
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
