import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useAuth } from '@workos/authkit-tanstack-react-start/client';
import { useEffect, useReducer, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';
import { deletionPendingKey, deletionStartedKey, parsePendingDeletion } from '@/lib/account-deletion-pending';

function readDeletionMarkers(): { pending: string | null; started: string | null } | null {
  try {
    return {
      pending: window.sessionStorage.getItem(deletionPendingKey),
      started: window.sessionStorage.getItem(deletionStartedKey),
    };
  } catch {
    return null;
  }
}

/** Keep a reopened app tab off normal routes while its account is erasing. */
export function DeletionRouteGuard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { user, loading: authLoading } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [, retryStorageRead] = useReducer((count: number) => count + 1, 0);
  const deleting = useRouterState({ select: (state) => state.location.pathname === '/app/settings/deleting' });
  const status = useQuery(api.accountDeletion.getDeletionStatus, isAuthenticated && !deleting ? {} : 'skip');
  const deletionStatus = status?.status;
  // The first server and browser render match. Read tab storage only after
  // hydration; an unknown or failed read never opens ordinary app queries.
  const markers = hydrated ? readDeletionMarkers() : null;
  const storageUnavailable = hydrated && markers === null;
  const pending = Boolean(markers && markers.pending !== null &&
    (authLoading || !user?.id || parsePendingDeletion(markers.pending, user.id)));
  const started = Boolean(markers && user?.id && markers.started === user.id);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!storageUnavailable) return;
    const interval = window.setInterval(retryStorageRead, 2_000);
    return () => window.clearInterval(interval);
  }, [retryStorageRead, storageUnavailable]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      void navigate({ to: '/', replace: true });
    } else if (hydrated && !storageUnavailable && !authLoading && !deleting && (pending || started || deletionStatus)) {
      void navigate({ to: '/app/settings/deleting', replace: true });
    }
  }, [authLoading, deleting, deletionStatus, hydrated, isAuthenticated, isLoading, navigate, pending, started, storageUnavailable]);

  // A pending mutation can still create the deletion row after browser Back.
  // Keep every ordinary route unmounted until the holding page takes over.
  if (isLoading || !isAuthenticated || !hydrated || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2" role="status">
        <Spinner /> {t('common.loading')}
      </div>
    );
  }

  if (storageUnavailable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3" role="alert">
        <p>{t('settings.deleting.storageUnavailable')}</p>
        <Button type="button" onClick={retryStorageRead}>{t('settings.deleting.retryStorage')}</Button>
      </div>
    );
  }

  if (!deleting && (status !== null || pending || started)) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2" role="status">
        <Spinner /> {t('common.loading')}
      </div>
    );
  }

  return children;
}
