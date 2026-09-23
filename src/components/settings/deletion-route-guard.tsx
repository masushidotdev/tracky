import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useAuth } from '@workos/authkit-tanstack-react-start/client';
import { useEffect } from 'react';
import { api } from '../../../convex/_generated/api';
import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';
import { deletionPendingKey, deletionStartedKey } from '@/lib/account-deletion-pending';

/** Keep a reopened app tab off normal routes while its account is erasing. */
export function DeletionRouteGuard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { user } = useAuth();
  const deleting = useRouterState({ select: (state) => state.location.pathname === '/app/settings/deleting' });
  const status = useQuery(api.accountDeletion.getDeletionStatus, isAuthenticated && !deleting ? {} : 'skip');
  const deletionStatus = status?.status;
  const pending = typeof window !== 'undefined' && window.sessionStorage.getItem(deletionPendingKey) !== null;
  const started = Boolean(user?.id && typeof window !== 'undefined' &&
    window.sessionStorage.getItem(deletionStartedKey) === user.id);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      void navigate({ to: '/', replace: true });
    } else if (!deleting && (pending || started || deletionStatus)) {
      void navigate({ to: '/app/settings/deleting', replace: true });
    }
  }, [deleting, deletionStatus, isAuthenticated, isLoading, navigate, pending, started]);

  // A pending mutation can still create the deletion row after browser Back.
  // Keep every ordinary route unmounted until the holding page takes over.
  if (isLoading || !isAuthenticated || (!deleting && (status !== null || pending || started))) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2" role="status">
        <Spinner /> {t('common.loading')}
      </div>
    );
  }

  return children;
}
