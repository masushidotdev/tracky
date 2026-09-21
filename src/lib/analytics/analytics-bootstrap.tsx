import * as React from 'react';
import { useRouter } from '@tanstack/react-router';

import { analyticsEvents, identifyAnalyticsUser, initAnalytics, trackEvent, trackPageview } from './events';

export function AnalyticsBootstrap({ userId }: { userId: string | null }) {
  const router = useRouter();
  const prevUserId = React.useRef<string | null>(null);

  React.useEffect(() => {
    initAnalytics();
  }, []);

  React.useEffect(() => {
    if (!userId) return;
    // First login in this session (anonymous -> authenticated): funnel seam
    // across the external WorkOS redirect, which breaks client session continuity.
    // Identify on WorkOS id only — never email/name (PII rule).
    if (prevUserId.current !== userId) {
      prevUserId.current = userId;
      identifyAnalyticsUser(userId);
      trackEvent(analyticsEvents.loginCompleted, { surface: 'app_bootstrap' });
    }
  }, [userId]);

  React.useEffect(() => {
    // First load: onResolved fires before consent/init, so emit the initial
    // pageview explicitly once the SDK is ready.
    trackPageview(window.location.pathname);
    return router.subscribe('onResolved', ({ toLocation }) => {
      trackPageview(toLocation.pathname);
    });
  }, [router]);

  return null;
}
