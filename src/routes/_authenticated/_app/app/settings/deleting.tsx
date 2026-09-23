import * as React from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@workos/authkit-tanstack-react-start/client';
import { useConvex } from 'convex/react';
import { CheckIcon } from 'lucide-react';

import { api } from '../../../../../../convex/_generated/api';
import type { TranslationKey } from '@/lib/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { resetAnalyticsUser } from '@/lib/analytics/events';
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

function DeletingRoute() {
  const { t } = useI18n();
  const convex = useConvex();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [status, setStatus] = React.useState<DeletionStatus>(null);
  const [loading, setLoading] = React.useState(true);
  const [connectionError, setConnectionError] = React.useState(false);
  const startedRef = React.useRef(false);
  const signingOutRef = React.useRef(false);

  React.useEffect(() => {
    startedRef.current = window.sessionStorage.getItem('tracky.deletionStarted') === '1';
    let active = true;
    let inFlight = false;

    const finish = async () => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      window.sessionStorage.removeItem('tracky.deletionStarted');
      window.sessionStorage.removeItem('tracky.deletionExportId');
      resetAnalyticsUser();
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
        if (result?.status === 'wiping' || result?.status === 'failed') {
          startedRef.current = true;
          window.sessionStorage.setItem('tracky.deletionStarted', '1');
        }
        if (result?.status === 'done') {
          await finish();
        } else if (!result && !startedRef.current) {
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
  }, [convex, navigate, signOut]);

  const stageToProgress: Record<string, (typeof progressSteps)[number]> = {
    disconnect: 'disconnect', personalData: 'exports', telegram: 'communication',
    bankingLeaves: 'bankingLeaves', providerRevocation: 'providerRevocation',
    bankingCore: 'bankingCore', planning: 'planning', forecast: 'planning',
    misc: 'planning', agentThreads: 'planning', profile: 'profile', workos: 'workos',
  };
  const currentIndex = progressSteps.findIndex((step) => step === stageToProgress[status?.currentStep ?? '']);

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
          <p className="text-sm text-muted-foreground" role="status">{t('settings.deleting.connectionError')}</p>
        ) : null}
        {status?.status === 'failed' ? (
          <p className="text-sm text-muted-foreground" role="status">{t('settings.deleting.retrying')}</p>
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
        <p className="text-xs text-muted-foreground">{t('settings.deleting.closeTab')}</p>
      </CardContent>
    </Card>
  );
}
