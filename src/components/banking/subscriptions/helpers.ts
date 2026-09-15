import * as React from 'react';
import type { Doc } from '../../../../convex/_generated/dataModel';
import type { TranslationKey, useI18n } from '@/lib/i18n';
import type { Money } from '@/lib/money';
import { Badge } from '@/components/ui/badge';

export type Subscription = Doc<'subscriptions'>;
export type Transaction = Doc<'transactions'>;
export type Account = Doc<'financialAccounts'>;

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(date: string) {
  const start = new Date(`${todayDate()}T00:00:00.000Z`).getTime();
  const target = new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.round((target - start) / (24 * 60 * 60 * 1000));
}

export function monthlyEquivalent(subscription: Subscription): Money {
  const intervalCount = Math.max(subscription.intervalCount, 1);
  const amount = Number(subscription.amount.amountMinor);
  const monthlyAmount =
    subscription.interval === 'day'
      ? (amount * 30.4375) / intervalCount
      : subscription.interval === 'week'
        ? (amount * 4.345) / intervalCount
        : subscription.interval === 'year'
          ? amount / (12 * intervalCount)
          : amount / intervalCount;

  return {
    amountMinor: BigInt(Math.round(monthlyAmount)),
    currency: subscription.amount.currency,
  };
}

export function sumByCurrency(items: Array<Money>) {
  const totals = new Map<string, bigint>();
  for (const item of items) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0n) + item.amountMinor);
  }
  return Array.from(totals.entries()).map(([currency, amountMinor]) => ({ amountMinor, currency }));
}

export function intervalLabel(subscription: Subscription, t: ReturnType<typeof useI18n>['t']) {
  const intervalCount = Math.max(subscription.intervalCount, 1);
  const count = intervalCount > 1 ? `${intervalCount} ` : '';
  const plurality = intervalCount === 1 ? 'one' : 'other';
  const interval = t(`subscriptions.interval.${subscription.interval}.${plurality}`);
  return `${count}${interval}`;
}

export function displayName(subscription: Subscription) {
  return subscription.alias?.trim() || subscription.name;
}

export function dueLabel(date: string | undefined, t: ReturnType<typeof useI18n>['t']) {
  if (!date) {
    return t('subscriptions.noDueDate');
  }

  const days = daysUntil(date);
  if (days < 0) {
    return t('subscriptions.overdue', { days: Math.abs(days) });
  }
  if (days === 0) {
    return t('subscriptions.dueToday');
  }
  return t('subscriptions.dueInDays', { days });
}

export function urgencyVariant(subscription: Subscription, t: ReturnType<typeof useI18n>['t']) {
  if (subscription.status !== 'active' || !subscription.nextDueDate) {
    return {
      badge: React.createElement(Badge, { variant: 'outline' }, t(statusLabelKey(subscription.status))),
      label: t(statusLabelKey(subscription.status)),
    };
  }

  const days = daysUntil(subscription.nextDueDate);
  const label = dueLabel(subscription.nextDueDate, t);
  if (days < 0) {
    return {
      badge: React.createElement(
        Badge,
        { variant: 'outline', className: 'border-destructive text-destructive' },
        label,
      ),
      label,
    };
  }
  if (days <= 7) {
    return {
      badge: React.createElement(
        Badge,
        { variant: 'outline', className: 'border-destructive text-destructive' },
        label,
      ),
      label,
    };
  }
  if (days <= 15) {
    return {
      badge: React.createElement(Badge, { variant: 'outline', className: 'border-warning text-warning' }, label),
      label,
    };
  }
  return {
    badge: React.createElement(Badge, { variant: 'outline', className: 'text-muted-foreground' }, label),
    label,
  };
}

export function sourceLabel(subscription: Subscription, t: ReturnType<typeof useI18n>['t']) {
  if (subscription.source === 'transaction') {
    return t('subscriptions.sourceTransaction');
  }
  if (subscription.source === 'detected') {
    return t('subscriptions.sourceDetected');
  }
  return t('subscriptions.sourceManual');
}

export function statusLabelKey(status: Subscription['status']): TranslationKey {
  if (status === 'active') {
    return 'subscriptions.status.active';
  }
  if (status === 'paused') {
    return 'subscriptions.status.paused';
  }
  return 'subscriptions.status.ended';
}
