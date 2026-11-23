import * as React from 'react';
import { useMutation } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import {
  ANALYTICS_CONSENT_EVENT,
  analyticsEvents,
  buildFirstBankAccountConnectedProps,
  buildFirstTransactionCreatedProps,
  getAnalyticsConfigSnapshot,
  isAnalyticsReady,
  readConsent,
  trackEvent,
} from './events';
import { useAuthedQuery } from '@/hooks/use-authed-query';

/**
 * Delivers server-originated one-time onboarding milestones (Enable Banking
 * callback & async bank transaction sync) through the client-only,
 * consent-gated PostHog wrapper.
 *
 * Self-hosted installs without PostHog config remain silent: no settings
 * query, no timer, and no claim mutation.
 */
export function OnboardingMilestoneFlusher() {
  const config = getAnalyticsConfigSnapshot();
  const analyticsConfigured = Boolean(config.enabled && config.key && config.apiHost);
  const settings = useAuthedQuery(api.userSettings.getMySettings, analyticsConfigured ? {} : 'skip');
  const claimPending = useMutation(api.userSettings.claimPendingOnboardingMilestones);
  const claimingRef = React.useRef(false);

  const pending = settings?.onboardingMilestones?.pendingClientEvents;
  const hasPending = Boolean(pending?.firstBankAccountConnected || pending?.firstTransactionBank);

  React.useEffect(() => {
    if (!hasPending || !analyticsConfigured) return;
    if (readConsent() === 'rejected') return;

    function tryFlush(): boolean {
      if (readConsent() === 'rejected') return true;
      if (claimingRef.current || !isAnalyticsReady()) return false;
      claimingRef.current = true;
      void claimPending({})
        .then((claimed) => {
          if (claimed.firstBankAccountConnected) {
            trackEvent(analyticsEvents.firstBankAccountConnected, buildFirstBankAccountConnectedProps());
          }
          if (claimed.firstTransactionBank) {
            trackEvent(analyticsEvents.firstTransactionCreated, buildFirstTransactionCreatedProps('bank'));
          }
        })
        .catch(() => {
          // Non-fatal: analytics must never disrupt the app.
        })
        .finally(() => {
          claimingRef.current = false;
        });
      return true;
    }

    if (tryFlush()) return;

    const id = window.setInterval(() => {
      if (tryFlush()) window.clearInterval(id);
    }, 1000);
    const onConsent = () => {
      if (tryFlush()) window.clearInterval(id);
    };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
    window.addEventListener('storage', onConsent);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
      window.removeEventListener('storage', onConsent);
    };
  }, [analyticsConfigured, claimPending, hasPending]);

  return null;
}
