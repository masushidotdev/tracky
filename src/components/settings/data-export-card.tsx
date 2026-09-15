import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { DownloadIcon, FileJsonIcon, RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import type { TranslationKey } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/app/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { formatDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

const statusKeys = {
  queued: 'settings.export.status.queued',
  running: 'settings.export.status.running',
  completed: 'settings.export.status.completed',
  failed: 'settings.export.status.failed',
} as const satisfies Record<string, TranslationKey>;

export function DataExportCard() {
  const { intlLocale, t } = useI18n();
  const exports = useQuery(api.dataExport.listMyDataExports, {});
  const requestExport = useMutation(api.dataExport.requestDataExport);
  const [requesting, setRequesting] = React.useState(false);
  const hasActiveExport = exports?.some((dataExport) =>
    dataExport.status === 'queued' || dataExport.status === 'running',
  ) ?? false;

  const request = async () => {
    setRequesting(true);
    try {
      await requestExport({});
      toast.success(t('settings.export.requested'));
    } catch {
      toast.error(t('settings.export.requestFailed'));
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.export.title')}</CardTitle>
        <CardDescription>{t('settings.export.description')}</CardDescription>
        <CardAction>
          <Button type="button" size="sm" onClick={request} disabled={requesting || hasActiveExport || exports === undefined}>
            {requesting || hasActiveExport ? <Spinner /> : <RefreshCwIcon data-icon="inline-start" />}
            {hasActiveExport ? t('settings.export.inProgress') : t('settings.export.request')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {exports === undefined ? (
          <div className="flex flex-col gap-3" aria-label={t('settings.loading')}>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : exports.length === 0 ? (
          <EmptyState icon={FileJsonIcon} title={t('settings.export.empty')} hint={t('settings.export.emptyHint')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {exports.map((dataExport) => (
              <li key={dataExport._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('settings.export.jsonV1')}</span>
                    <Badge variant={dataExport.status === 'failed' ? 'destructive' : 'secondary'}>
                      {t(statusKeys[dataExport.status])}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(dataExport.requestedAtMs, intlLocale)}
                  </span>
                </div>
                {dataExport.downloadUrl ? (
                  <Button asChild type="button" size="sm" variant="outline">
                    <a href={dataExport.downloadUrl} target="_blank" rel="noreferrer">
                      <DownloadIcon data-icon="inline-start" />
                      {t('settings.export.download')}
                    </a>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
