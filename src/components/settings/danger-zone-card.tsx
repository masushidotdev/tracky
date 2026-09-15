import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export function DangerZoneCard() {
  const { intlLocale, t } = useI18n();
  const settings = useQuery(api.userSettings.getMySettings, {});
  const requestDeletion = useMutation(api.userSettings.requestAccountDeletion);
  const [requesting, setRequesting] = React.useState(false);

  const request = async () => {
    setRequesting(true);
    try {
      await requestDeletion({});
      toast.success(t('settings.danger.requested'));
    } catch {
      toast.error(t('settings.danger.requestFailed'));
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.danger.title')}</CardTitle>
        <CardDescription>{t('settings.danger.description')}</CardDescription>
        {!settings?.deletionRequestedAtMs ? (
          <CardAction>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm" disabled={requesting || settings === undefined}>
                  {t('settings.danger.request')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia>
                    <TriangleAlertIcon />
                  </AlertDialogMedia>
                  <AlertDialogTitle>{t('settings.danger.confirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('settings.danger.confirmDescription')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('settings.cancel')}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void request()}>
                    {t('settings.danger.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {settings === undefined ? (
          <Skeleton className="h-10 w-full" aria-label={t('settings.loading')} />
        ) : settings.deletionRequestedAtMs ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">{t('settings.danger.pending')}</Badge>
            <span className="text-sm text-muted-foreground">
              {t('settings.danger.requestedOn', {
                date: formatDateTime(settings.deletionRequestedAtMs, intlLocale),
              })}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('settings.danger.flagOnly')}</p>
        )}
      </CardContent>
    </Card>
  );
}
