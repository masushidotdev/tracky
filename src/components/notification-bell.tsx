import { useMutation } from 'convex/react';
import { BellIcon, CheckIcon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { TranslationKey } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { HIDDEN_AMOUNT_PLACEHOLDER } from '@/lib/balance-privacy';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useAuthedQuery } from '@/hooks/use-authed-query';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function notificationTextKey(key: string): TranslationKey {
  return key as TranslationKey;
}

// Notification bodies interpolate their figures, so the amount has to be masked before the catalog
// message is filled in.
function maskParams(params: Record<string, string | number>, hidden: boolean) {
  if (!hidden || !('amount' in params)) {
    return params;
  }

  return { ...params, amount: HIDDEN_AMOUNT_PLACEHOLDER };
}

function severityClassName(severity: 'info' | 'warning' | 'critical') {
  if (severity === 'critical') {
    return 'border-destructive/40 bg-destructive/10';
  }

  if (severity === 'warning') {
    return 'border-chart-4/40 bg-chart-4/10';
  }

  return 'border-border bg-background';
}

export function NotificationBell() {
  const { intlLocale, t } = useI18n();
  const { hidden } = useBalancePrivacy();
  const inbox = useAuthedQuery(api.notifications.getInbox, { limit: 20 });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const unreadCount = inbox?.unreadCount ?? 0;

  async function markNotificationRead(notificationId: Id<'notifications'>) {
    try {
      await markRead({ notificationId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('notifications.readFailed'));
    }
  }

  async function markEveryNotificationRead() {
    try {
      await markAllRead({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('notifications.readFailed'));
    }
  }

  return (
    <Popover onOpenChange={(open) => open && trackEvent(analyticsEvents.notificationOpened, {})}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="relative" aria-label={t('notifications.open')}>
          <BellIcon />
          {unreadCount > 0 ? (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px]" variant="destructive">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <PopoverHeader className="gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PopoverTitle>{t('notifications.title')}</PopoverTitle>
              <PopoverDescription>{t('notifications.description')}</PopoverDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!inbox || unreadCount === 0}
              onClick={() => void markEveryNotificationRead()}
            >
              {t('notifications.markAllRead')}
            </Button>
          </div>
        </PopoverHeader>
        {inbox === undefined ? (
          <div className="flex flex-col gap-2 p-4 pt-0">
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ) : null}
        {inbox?.notifications.length === 0 ? (
          <div className="p-4 pt-0">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('notifications.empty.title')}</EmptyTitle>
                <EmptyDescription>{t('notifications.empty.description')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : null}
        {inbox && inbox.notifications.length > 0 ? (
          <ScrollArea className="h-[22rem] border-t">
            <div className="flex flex-col gap-2 p-3">
              {inbox.notifications.map((notification) => (
                <div
                  key={notification._id}
                  className={cn(
                    'grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3',
                    severityClassName(notification.severity),
                    notification.readAtMs === undefined && 'ring-1 ring-primary/20',
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {t(notificationTextKey(notification.titleKey), maskParams(notification.params, hidden))}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t(notificationTextKey(notification.bodyKey), maskParams(notification.params, hidden))}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat(intlLocale, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(notification.createdAtMs))}
                    </div>
                  </div>
                  {notification.readAtMs === undefined ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('notifications.markRead')}
                      onClick={() => void markNotificationRead(notification._id)}
                    >
                      <CheckIcon />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
