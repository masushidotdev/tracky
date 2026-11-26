import * as React from 'react';
import { useMutation } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import {
  ANALYTICS_CONSENT_EVENT,
  analyticsEvents,
  buildFirstBankAccountConnectedProps,
  buildFirstTransactionCreatedProps,
  buildSignupCompletedProps,
  getAnalyticsConfigSnapshot,
  isAnalyticsReady,
  readConsent,
  trackEvent,
} from './events';
import { useAuthedQuery } from '@/hooks/use-authed-query';

/**
 * Delivers one-time onboarding milestones (`signup_completed` plus
 * server-originated Enable Banking callback & async bank transaction sync
 * milestones) through the client-only, consent-gated PostHog wrapper.
 *
 * Self-hosted installs without PostHog config remain silent: no settings
 * query, no timer, and no claim mutation.
 */
export function OnboardingMilestoneFlusher() {
  const config = getAnalyticsConfigSnapshot();
  const analyticsConfigured = Boolean(config.enabled && config.key && config.apiHost);
  const settings = useAuthedQuery(api.userSettings.getMySettings, analyticsConfigured ? {} : 'skip');
  const claimPending = useMutation(api.userSettings.claimPendingOnboardingMilestones);
  const claimSignup = useMutation(api.userSettings.claimSignupMilestone);
  const claimingPendingRef = React.useRef(false);
  const signupAttemptedRef = React.useRef(false);

  const pending = settings?.onboardingMilestones?.pendingClientEvents;
  const hasPending = Boolean(pending?.firstBankAccountConnected || pending?.firstTransactionBank);
  const needsSignupClaim =
    settings !== undefined &&
    settings.onboardingMilestones?.signupAtMs === undefined &&
    !signupAttemptedRef.current;

  React.useEffect(() => {
    if (!analyticsConfigured) return;
    if (!hasPending && !needsSignupClaim) return;

    let intervalId: number | undefined;

    function stopTimer() {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    }

    function tryFlush(): boolean {
      if (readConsent() === 'rejected') {
        stopTimer();
        return true;
      }
      if (!isAnalyticsReady()) return false;

      if (needsSignupClaim && !signupAttemptedRef.current) {
        signupAttemptedRef.current = true;
        void claimSignup({})
          .then((result) => {
            if (result.emit) {
              trackEvent(analyticsEvents.signupCompleted, buildSignupCompletedProps());
            }
          })
          .catch(() => {
            // Non-fatal: analytics must never disrupt the app.
          });
      }

      if (hasPending && !claimingPendingRef.current) {
        claimingPendingRef.current = true;
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
            claimingPendingRef.current = false;
          });
      }

      stopTimer();
      return true;
    }

    function ensureTimerIfAccepted() {
      if (intervalId !== undefined) return;
      if (readConsent() !== 'accepted') return;
      intervalId = window.setInterval(() => {
        if (tryFlush()) stopTimer();
      }, 1000);
    }

    if (readConsent() !== 'rejected' && tryFlush()) {
      return;
    }

    ensureTimerIfAccepted();

    const onConsent = () => {
      if (!tryFlush()) {
        ensureTimerIfAccepted();
      }
    };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
    window.addEventListener('storage', onConsent);
    return () => {
      stopTimer();
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
      window.removeEventListener('storage', onConsent);
    };
  }, [analyticsConfigured, claimPending, claimSignup, hasPending, needsSignupClaim]);

  return null;
}
