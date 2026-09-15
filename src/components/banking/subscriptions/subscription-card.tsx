import {
  CalendarClockIcon,
  CreditCardIcon,
  LandmarkIcon,
  MoreHorizontalIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  SquarePenIcon,
  StopCircleIcon,
  TagIcon,
} from 'lucide-react';
import { displayName, intervalLabel, monthlyEquivalent, sourceLabel, statusLabelKey } from './helpers';
import type { Subscription } from './helpers';
import type * as React from 'react';

import { Amount } from '@/components/app/amount';
import { TruncatedText } from '@/components/app/truncated-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

export function SubscriptionCard({
  accountName,
  isPending,
  merchantName,
  onEdit,
  onStatusChange,
  subscription,
  urgencyBadge,
  variant = 'list',
}: {
  accountName: string;
  isPending?: (key?: string) => boolean;
  merchantName: string;
  onEdit?: (subscription: Subscription) => void;
  onStatusChange?: (subscription: Subscription, status: Subscription['status']) => void;
  subscription: Subscription;
  urgencyBadge?: React.ReactNode;
  variant?: 'list' | 'upcoming';
}) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const pendingStatus = isPending?.(`subscription-status:${subscription._id}`) ?? false;
  const showActions = Boolean(onEdit && onStatusChange);

  return (
    <Card size="sm" className="shadow-none transition-shadow hover:shadow-md">
      <CardHeader className="has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
        <CardTitle className="min-w-0 max-w-full">
          <TruncatedText className="block" value={displayName(subscription)} />
        </CardTitle>
        <CardDescription className={variant === 'upcoming' ? 'flex min-w-0 items-center gap-2' : 'min-w-0 max-w-full'}>
          <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
            <TagIcon className="size-4 shrink-0" />
            <TruncatedText className="min-w-0 flex-1" value={merchantName} />
          </div>
          {variant === 'upcoming' ? (
            <div className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden">
              <LandmarkIcon className="size-4 shrink-0" />
              <TruncatedText value={accountName} />
            </div>
          ) : null}
        </CardDescription>
        <CardAction>
          {showActions ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline">{t(statusLabelKey(subscription.status))}</Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pendingStatus}
                    aria-label={t('subscriptions.actions')}
                  >
                    {pendingStatus ? <Spinner /> : <MoreHorizontalIcon />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => onEdit?.(subscription)}>
                      <SquarePenIcon />
                      {t('subscriptions.details.edit')}
                    </DropdownMenuItem>
                    {subscription.status === 'active' ? (
                      <DropdownMenuItem
                        disabled={pendingStatus}
                        onClick={() => onStatusChange?.(subscription, 'paused')}
                      >
                        <PauseCircleIcon />
                        {t('subscriptions.pause')}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        disabled={pendingStatus}
                        onClick={() => onStatusChange?.(subscription, 'active')}
                      >
                        <PlayCircleIcon />
                        {t('subscriptions.resume')}
                      </DropdownMenuItem>
                    )}
                    {subscription.status !== 'ended' ? (
                      <DropdownMenuItem
                        disabled={pendingStatus}
                        variant="destructive"
                        onClick={() => onStatusChange?.(subscription, 'ended')}
                      >
                        <StopCircleIcon />
                        {t('subscriptions.end')}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            urgencyBadge
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-tight">
              <Amount money={subscription.amount} />
              <span className="text-sm text-muted-foreground"> / {intervalLabel(subscription, t)}</span>
            </div>
            {variant === 'upcoming' ? (
              <div className="text-sm text-muted-foreground">
                {t('subscriptions.monthlyEquivalent', {
                  amount: maskValue(formatMoney(monthlyEquivalent(subscription), intlLocale)),
                })}
              </div>
            ) : null}
          </div>
          {variant === 'upcoming' ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{intervalLabel(subscription, t)}</Badge>
              <Badge variant="outline">{sourceLabel(subscription, t)}</Badge>
            </div>
          ) : null}
        </div>

        {variant === 'list' ? <Separator /> : null}

        {variant === 'list' ? (
          <>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex min-w-0 items-center gap-2">
                <CalendarClockIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{subscription.nextDueDate ?? t('subscriptions.noDueDate')}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <CreditCardIcon className="size-4 shrink-0 text-muted-foreground" />
                <TruncatedText value={accountName} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline">{sourceLabel(subscription, t)}</Badge>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            {t('subscriptions.nextDue', {
              value: subscription.nextDueDate ?? t('subscriptions.noDueDate'),
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
