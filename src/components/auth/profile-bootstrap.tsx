import { useConvexAuth, useMutation } from 'convex/react';
import { useEffect, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';

type BootstrapState = 'waiting' | 'ready' | 'pendingTooLong' | 'failed';

/** Keep all app queries unmounted until the WorkOS user exists in Convex. */
export function ProfileBootstrap({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureProfile = useMutation(api.authProfiles.ensureCurrentUserProfile);
  const [state, setState] = useState<BootstrapState>('waiting');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const controller = new AbortController();
    const isCancelled = () => controller.signal.aborted;

    async function bootstrap() {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          const profileId = await ensureProfile({});
          if (isCancelled()) return;
          if (profileId) {
            setState('ready');
            return;
          }
        } catch (error) {
          if (isCancelled()) return;
          console.warn('Unable to ensure WorkOS profile sync', error);
          setState('failed');
          return;
        }

        if (attempt < 19) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(500 * (attempt + 1), 2_000)));
          if (isCancelled()) return;
        }
      }
      if (!isCancelled()) setState('pendingTooLong');
    }

    void bootstrap();
    return () => {
      controller.abort();
    };
  }, [ensureProfile, isAuthenticated, isLoading, retry]);

  if (state === 'ready' && isAuthenticated && !isLoading) return children;

  if (state === 'pendingTooLong' || state === 'failed') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <p>{t(state === 'pendingTooLong' ? 'auth.profileSyncDelayed' : 'auth.profileSyncFailed')}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setState('waiting');
            setRetry((value) => value + 1);
          }}
        >
          {t('panel.error.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center gap-2" role="status">
      <Spinner /> {t('auth.profileSyncWaiting')}
    </div>
  );
}
