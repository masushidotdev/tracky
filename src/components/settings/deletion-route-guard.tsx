import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useEffect } from 'react';
import { api } from '../../../convex/_generated/api';
import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';

/** Keep a reopened app tab off normal routes while its account is erasing. */
export function DeletionRouteGuard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const deleting = useRouterState({ select: (state) => state.location.pathname === '/app/settings/deleting' });
  const status = useQuery(api.accountDeletion.getDeletionStatus, isAuthenticated && !deleting ? {} : 'skip');
  const deletionStatus = status?.status;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      void navigate({ to: '/', replace: true });
    } else if (!deleting && deletionStatus) {
      void navigate({ to: '/app/settings/deleting', replace: true });
    }
  }, [deleting, deletionStatus, isAuthenticated, isLoading, navigate]);

  if (isLoading || !isAuthenticated || (!deleting && status !== null)) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2" role="status">
        <Spinner /> {t('common.loading')}
      </div>
    );
  }

  return children;
}
