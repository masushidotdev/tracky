import * as React from 'react';
import { useRouter } from '@tanstack/react-router';

import {
  analyticsEvents,
  identifyAnalyticsUser,
  initAnalytics,
  readConsent,
  trackEvent,
  trackPageview,
} from './events';

export function AnalyticsBootstrap({ userId }: { userId: string | null }) {
  const router = useRouter();
  const prevUserId = React.useRef<string | null>(null);
  // Consent store is plain localStorage (no subscription): poll it so deferred
  // events replay when the banner is accepted after mount.
  const [consent, setConsent] = React.useState(() => readConsent());

  React.useEffect(() => {
    const id = window.setInterval(() => {
      const current = readConsent();
      setConsent((prev) => (prev === current ? prev : current));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    initAnalytics();
  }, [consent]);

  React.useEffect(() => {
    if (!userId || consent !== 'accepted') return;
    // First login in this session (anonymous -> authenticated): funnel seam
    // across the external WorkOS redirect, which breaks client session continuity.
    // Identify on WorkOS id only — never email/name (PII rule). Replays once
    // consent arrives, even if login happened first.
    if (prevUserId.current !== userId) {
      prevUserId.current = userId;
      identifyAnalyticsUser(userId);
      trackEvent(analyticsEvents.loginCompleted, { surface: 'app_bootstrap' });
    }
  }, [consent, userId]);

  React.useEffect(() => {
    if (consent !== 'accepted') return;
    // First load: onResolved fires before consent/init, so emit the initial
    // pageview explicitly once the SDK is ready. Replays on late consent.
    trackPageview(window.location.pathname);
    return router.subscribe('onResolved', ({ toLocation }) => {
      trackPageview(toLocation.pathname);
    });
  }, [consent, router]);

  return null;
}
