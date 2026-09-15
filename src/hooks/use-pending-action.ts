import * as React from 'react';
import { toast } from 'sonner';

import { useI18n } from '@/lib/i18n';

type PendingActionOptions = {
  success?: string;
  error?: string;
  getErrorMessage?: (error: unknown) => string;
};

export function usePendingAction() {
  const { t } = useI18n();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const mountedRef = React.useRef(false);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = React.useCallback(
    async (key: string, fn: () => Promise<void>, opts?: PendingActionOptions) => {
      setPendingKey(key);
      try {
        await fn();
        if (opts?.success) {
          toast.success(opts.success);
        }
        return true;
      } catch (error) {
        toast.error(
          opts?.getErrorMessage?.(error) ??
            opts?.error ??
            (error instanceof Error && error.message ? error.message : t('common.actionFailed')),
        );
        return false;
      } finally {
        if (mountedRef.current) {
          setPendingKey(null);
        }
      }
    },
    [t],
  );

  const isPending = React.useCallback((key?: string) => (key ? pendingKey === key : pendingKey !== null), [pendingKey]);

  return { run, isPending, pendingKey };
}
