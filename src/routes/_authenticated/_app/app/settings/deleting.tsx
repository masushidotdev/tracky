import * as React from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos/authkit-tanstack-react-start/client';
import { useConvex, useMutation } from 'convex/react';
import { CheckIcon } from 'lucide-react';

import { api } from '../../../../../../convex/_generated/api';
import type { TranslationKey } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { analyticsEvents, resetAnalyticsUser, trackEvent } from '@/lib/analytics/events';
import { deletionPendingKey, deletionStartedKey, parsePendingDeletion } from '@/lib/account-deletion-pending';
import { useI18n } from '@/lib/i18n';

export const Route = createFileRoute('/_authenticated/_app/app/settings/deleting')({
  component: DeletingRoute,
});

const progressSteps = [
  'disconnect',
  'exports',
  'communication',
  'bankingLeaves',
  'providerRevocation',
  'bankingCore',
  'planning',
  'profile',
  'workos',
] as const;

const stepLabels: Record<(typeof progressSteps)[number], TranslationKey> = {
  disconnect: 'settings.deleting.step.disconnect',
  exports: 'settings.deleting.step.exports',
  communication: 'settings.deleting.step.communication',
  bankingLeaves: 'settings.deleting.step.bankingLeaves',
  providerRevocation: 'settings.deleting.step.providerRevocation',
  bankingCore: 'settings.deleting.step.bankingCore',
  planning: 'settings.deleting.step.planning',
  profile: 'settings.deleting.step.profile',
  workos: 'settings.deleting.step.workos',
};

type DeletionStatus = { status: 'wiping' | 'done' | 'failed'; currentStep: string } | null;

function isUnauthorized(error: unknown) {
  return /Unauthorized|Unauthenticated|not authenticated/i.test(String(error));
}

/** Keep browser storage failures separate from deletion status and sign-out. */
function readMarker(key: string): string | null | undefined {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return undefined;
  }
}

function writeMarker(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // The server's deletion job remains the source of truth.
  }
}

function removeMarker(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage cleanup must not interrupt polling or sign-out.
  }
}

export function DeletingRoute() {
  const { t } = useI18n();
  const convex = useConvex();
  const deleteAccount = useMutation(api.accountDeletion.deleteMyAccount);
  const navigate = useNavigate();
  const { signOut, user, loading: authLoading } = useAuth();
  const [status, setStatus] = React.useState<DeletionStatus>(null);
  const [loading, setLoading] = React.useState(true);
  const [connectionError, setConnectionError] = React.useState(false);
  const [requestError, setRequestError] = React.useState(false);
  const [requestAccepted, setRequestAccepted] = React.useState(false);
  const startedRef = React.useRef(false);
  const pendingRef = React.useRef(false);
  const requestErrorRef = React.useRef(false);
  const requestAttemptedRef = React.useRef(false);
  const signingOutRef = React.useRef(false);

  React.useEffect(() => {
    if (authLoading || requestAttemptedRef.current) return;
    const raw = readMarker(deletionPendingKey);
    if (raw == null) return;
    const pending = parsePendingDeletion(raw, user?.id);
    if (!pending) {
      removeMarker(deletionPendingKey);
      return;
    }
    requestAttemptedRef.current = true;
    pendingRef.current = true;

    void (async () => {
      let accepted = false;
      let created = false;
      try {
        await deleteAccount({ deletionExportId: pending.deletionExportId ?? undefined });
        accepted = true;
        created = true;
      } catch (error) {
        if (String(error).includes('deletion_in_progress')) {
          accepted = true;
        } else {
          requestErrorRef.current = true;
          setRequestError(true);
        }
      } finally {
        pendingRef.current = false;
        // Keep the guard active until status polling observes the durable job.
        if (!accepted) removeMarker(deletionPendingKey);
      }
      if (accepted) {
        startedRef.current = true;
        writeMarker(deletionStartedKey, pending.userId);
        setRequestAccepted(true);
        if (created) {
          try {
            trackEvent(analyticsEvents.accountDeletionRequested, {});
          } catch {
            // Optional analytics must not turn a successful wipe into a UI error.
          }
        }
      }
    })();
  }, [authLoading, deleteAccount, user?.id]);

  React.useEffect(() => {
    startedRef.current ||= Boolean(user?.id && readMarker(deletionStartedKey) === user.id);
    let active = true;
    let inFlight = false;

    const finish = async () => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      try {
        window.sessionStorage.removeItem(deletionStartedKey);
        window.sessionStorage.removeItem(deletionPendingKey);
        window.sessionStorage.removeItem('tracky.deletionExportId');
      } catch {
        // Browser storage cleanup must not prevent sign-out after erasure.
      }
      try {
        resetAnalyticsUser();
      } catch {
        // Analytics cleanup is best effort; the identity has been erased.
      }
      try {
        await signOut({ returnTo: '/' });
      } catch {
        // WorkOS may already have invalidated the deleted user's session.
        window.location.assign('/');
      }
    };

    const poll = async () => {
      if (inFlight || signingOutRef.current) return;
      inFlight = true;
      try {
        const result = await convex.query(api.accountDeletion.getDeletionStatus, {});
        if (!active) return;
        setStatus(result);
        setConnectionError(false);
        setLoading(false);
        if (result) {
          setRequestAccepted(true);
          removeMarker(deletionPendingKey);
        }
        if (result?.status === 'wiping' || result?.status === 'failed') {
          startedRef.current = true;
          if (user?.id) writeMarker(deletionStartedKey, user.id);
        }
        if (result?.status === 'done') {
          await finish();
        } else if (!result && !startedRef.current && !pendingRef.current &&
          readMarker(deletionPendingKey) === null && !requestErrorRef.current) {
          await navigate({ to: '/app/settings' });
        }
      } catch (error) {
        if (!active) return;
        setLoading(false);
        if (startedRef.current && isUnauthorized(error)) {
          await finish();
        } else {
          setConnectionError(true);
        }
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 2_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [convex, navigate, signOut, user?.id]);

  const stageToProgress: Record<string, (typeof progressSteps)[number]> = {
    disconnect: 'disconnect',
    personalData: 'exports',
    telegram: 'communication',
    bankingLeaves: 'bankingLeaves',
    providerRevocation: 'providerRevocation',
    bankingCore: 'bankingCore',
    planning: 'planning',
    forecast: 'planning',
    misc: 'planning',
    agentThreads: 'planning',
    profile: 'profile',
    workos: 'workos',
  };
  const currentIndex = progressSteps.findIndex((step) => step === stageToProgress[status?.currentStep ?? '']);

  if (requestError) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{t('settings.danger.deleteFailed')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => void navigate({ to: '/app/settings' })}>
            {t('settings.deleting.backToSettings')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl" aria-live="polite">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Spinner /> {t('settings.deleting.title')}
        </CardTitle>
        <CardDescription>{t('settings.deleting.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connectionError ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t('settings.deleting.connectionError')}
          </p>
        ) : null}
        {status?.status === 'failed' ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t('settings.deleting.retrying')}
          </p>
        ) : null}
        {loading ? <p className="text-sm text-muted-foreground">{t('settings.deleting.checking')}</p> : null}
        <ol className="space-y-2">
          {progressSteps.map((step, index) => (
            <li key={step} className="flex items-center gap-2 text-sm">
              {currentIndex > index || status?.status === 'done' ? (
                <CheckIcon className="size-4 text-primary" aria-hidden="true" />
              ) : currentIndex === index ? (
                <Spinner aria-hidden="true" />
              ) : (
                <span className="size-4 rounded-full border" aria-hidden="true" />
              )}
              <span className={currentIndex < index ? 'text-muted-foreground' : ''}>{t(stepLabels[step])}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          {t(requestAccepted ? 'settings.deleting.closeTab' : 'settings.deleting.keepTabOpen')}
        </p>
      </CardContent>
    </Card>
  );
}
