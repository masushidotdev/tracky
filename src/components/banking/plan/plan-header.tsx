import { InfoIcon, LandmarkIcon, RefreshCwIcon, SparklesIcon, WalletCardsIcon } from 'lucide-react';

import { PlanMonthNavigation } from './plan-month-navigation';
import type * as React from 'react';
import type { PlanAccountSummary, PlanMonth } from './types';
import { Amount } from '@/components/app/amount';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { accountLabel } from '@/lib/accounts';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function PlanHeader({
  accounts,
  canGoPrevious,
  isRecalculating,
  month,
  onAutoAssign,
  onCurrentMonth,
  onNextMonth,
  onOverdraftTargetDateChange,
  onPreviousMonth,
  onRecalculate,
  overdraftTargetDatePending,
  switcher,
}: {
  accounts: Array<PlanAccountSummary>;
  canGoPrevious: boolean;
  isRecalculating: boolean;
  month: PlanMonth;
  onAutoAssign: () => void;
  onCurrentMonth: () => void;
  onNextMonth: () => void;
  onOverdraftTargetDateChange: (targetDate?: string) => void;
  onPreviousMonth: () => void;
  onRecalculate: () => void;
  overdraftTargetDatePending: boolean;
  switcher?: React.ReactNode;
}) {
  const { t } = useI18n();
  const readyState =
    month.readyToAssignMinor > 0n
      ? { label: t('plan.rta.positive'), className: 'text-positive' }
      : month.readyToAssignMinor < 0n
        ? {
            // Three different situations, three different remedies: overdrawn accounts, too much
            // assigned, or categories holding more than the money left.
            label: t(
              month.liquidityMinor < 0n
                ? 'plan.rta.negativeOverdraft'
                : month.breakdown.assignedMinor > 0n
                  ? 'plan.rta.negative'
                  : 'plan.rta.negativeLiquidity',
            ),
            className: 'text-destructive',
          }
        : { label: t('plan.rta.zero'), className: 'text-foreground' };
  const currency = month.plan.currency;

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1">
            {switcher ?? <p className="truncate font-heading text-lg font-medium">{month.plan.name}</p>}
            <PlanAccountsPopover accounts={accounts} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <PlanMonthNavigation
              canGoPrevious={canGoPrevious}
              period={month.period}
              onCurrent={onCurrentMonth}
              onNext={onNextMonth}
              onPrevious={onPreviousMonth}
            />
            <Button type="button" variant="outline" size="sm" className="ms-1" onClick={onAutoAssign}>
              <SparklesIcon data-icon="inline-start" />
              {t('plan.autoAssign.action')}
            </Button>
            {/* Recalculation rebuilds the month snapshots and drops the deprecated opening carry.
                It used to be reachable only from the truncation alert. */}
            <Button type="button" variant="ghost" size="sm" disabled={isRecalculating} onClick={onRecalculate}>
              <RefreshCwIcon data-icon="inline-start" />
              {isRecalculating ? t('common.loading') : t('plan.recalculate.action')}
            </Button>
          </div>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-col items-start rounded-2xl px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 md:items-end"
              aria-label={t('plan.rta.breakdown.open')}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {readyState.label}
                <InfoIcon className="size-3.5" aria-hidden="true" />
              </span>
              <Amount
                money={{ amountMinor: month.readyToAssignMinor, currency }}
                variant="balance"
                className={cn('font-heading text-3xl font-semibold tracking-tight', readyState.className)}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <PopoverHeader>
              <PopoverTitle>{t('plan.rta.breakdown.title')}</PopoverTitle>
              <PopoverDescription>{t('plan.rta.breakdown.description')}</PopoverDescription>
            </PopoverHeader>
            <dl className="flex flex-col gap-3">
              <BreakdownRow
                label={t('plan.rta.breakdown.carry')}
                amountMinor={month.breakdown.carryFromPreviousMonthMinor}
                currency={currency}
              />
              <BreakdownRow
                label={t('plan.rta.breakdown.income')}
                amountMinor={month.breakdown.incomeMinor}
                currency={currency}
              />
              <BreakdownRow
                label={t('plan.rta.breakdown.cardCash')}
                amountMinor={month.breakdown.liquidityFromCardMinor}
                currency={currency}
              />
              <BreakdownRow
                label={t('plan.rta.breakdown.cardCredit')}
                amountMinor={month.breakdown.uncoveredCardSpendMinor}
                currency={currency}
              />
              <BreakdownRow
                label={t('plan.rta.breakdown.beforeStart')}
                amountMinor={month.breakdown.beforePlanStartMinor}
                currency={currency}
              />
              <BreakdownRow
                label={t('plan.rta.breakdown.unexplained')}
                amountMinor={month.breakdown.unexplainedMinor}
                currency={currency}
              />
              <BreakdownRow
                label={t('plan.rta.breakdown.internal')}
                amountMinor={month.breakdown.internalMinor}
                currency={currency}
              />
              <BreakdownRow
                label={t('plan.rta.breakdown.transfers')}
                amountMinor={month.breakdown.transferNetMinor}
                currency={currency}
              />
              <BreakdownRow
                label={t('plan.rta.breakdown.assigned')}
                amountMinor={-month.breakdown.assignedMinor}
                currency={currency}
              />
              <BreakdownRow
                label={t('plan.rta.breakdown.moneyBoxReserve')}
                amountMinor={month.breakdown.moneyBoxReserveMinor}
                currency={currency}
              />
              <BreakdownRow
                label={t('plan.rta.breakdown.overspending')}
                amountMinor={month.breakdown.cashOverspendingMinor}
                currency={currency}
              />
              <div className="flex items-center justify-between gap-4 border-t pt-3 font-medium">
                <dt>{readyState.label}</dt>
                <dd>
                  <Amount
                    money={{ amountMinor: month.readyToAssignMinor, currency }}
                    variant="balance"
                    className={readyState.className}
                  />
                </dd>
              </div>
            </dl>
          </PopoverContent>
        </Popover>
      </CardContent>
      <PlanOverdraftNotice
        overdraft={month.overdraft}
        currency={currency}
        onTargetDateChange={onOverdraftTargetDateChange}
        targetDatePending={overdraftTargetDatePending}
      />
    </Card>
  );
}

export function PlanOverdraftNotice({
  currency,
  onTargetDateChange,
  overdraft,
  targetDatePending = false,
}: {
  currency: string;
  onTargetDateChange?: (targetDate?: string) => void;
  overdraft: PlanMonth['overdraft'];
  targetDatePending?: boolean;
}) {
  const { t } = useI18n();
  if (!overdraft) return null;
  const progressMinor = overdraft.progressMinor < 0n ? -overdraft.progressMinor : overdraft.progressMinor;
  const progressLabel =
    overdraft.progressMinor > 0n
      ? t('plan.overdraft.progress.reduced')
      : overdraft.progressMinor < 0n
        ? t('plan.overdraft.progress.increased')
        : t('plan.overdraft.progress.unchanged');

  return (
    <CardContent>
      <Alert data-slot="plan-overdraft-notice">
        <LandmarkIcon aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <AlertTitle className="text-destructive">{t('plan.overdraft.title')}</AlertTitle>
            <AlertDescription>{t('plan.overdraft.guidance')}</AlertDescription>
            {onTargetDateChange ? (
              <form
                key={overdraft.targetDate ?? 'no-overdraft-target'}
                className="mt-3 flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const targetDate = String(data.get('targetDate') ?? '');
                  onTargetDateChange(targetDate || undefined);
                }}
              >
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t('plan.overdraft.targetDate')}
                  <Input
                    aria-label={t('plan.overdraft.targetDate')}
                    className="w-40 bg-background"
                    defaultValue={overdraft.targetDate ?? ''}
                    disabled={targetDatePending}
                    name="targetDate"
                    type="date"
                  />
                </label>
                <Button disabled={targetDatePending} size="sm" type="submit" variant="outline">
                  {t('common.save')}
                </Button>
              </form>
            ) : null}
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-2 sm:text-right">
            <div>
              <dt className="text-[11px] text-muted-foreground">{t('plan.overdraft.amount')}</dt>
              <dd>
                <Amount
                  money={{ amountMinor: overdraft.amountMinor, currency }}
                  className="font-medium text-destructive"
                />
              </dd>
            </div>
            {overdraft.remainingFacilityMinor !== null ? (
              <div>
                <dt className="text-[11px] text-muted-foreground">{t('plan.overdraft.remainingFacility')}</dt>
                <dd>
                  <Amount
                    money={{ amountMinor: overdraft.remainingFacilityMinor, currency }}
                    className="font-medium text-warning"
                  />
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[11px] text-muted-foreground">{progressLabel}</dt>
              <dd>
                <Amount
                  money={{ amountMinor: progressMinor, currency }}
                  className={cn(
                    'font-medium',
                    overdraft.progressMinor > 0n
                      ? 'text-positive'
                      : overdraft.progressMinor < 0n
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                  )}
                />
              </dd>
            </div>
            {overdraft.monthlyStepMinor !== null ? (
              <div>
                <dt className="text-[11px] text-muted-foreground">{t('plan.overdraft.monthlyStep')}</dt>
                <dd>
                  <Amount
                    money={{ amountMinor: overdraft.monthlyStepMinor, currency }}
                    className="font-medium text-warning"
                  />
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </Alert>
    </CardContent>
  );
}

export function PlanAccountsPopover({ accounts }: { accounts: Array<PlanAccountSummary> }) {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={t('plan.accounts.open')}>
          <WalletCardsIcon data-icon="inline-start" />
          {t('plan.accounts.count', { count: accounts.length })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{t('plan.accounts.title')}</PopoverTitle>
          <PopoverDescription>{t('plan.accounts.description')}</PopoverDescription>
        </PopoverHeader>
        <ul className="flex flex-col gap-2">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
              <span className="min-w-0 truncate text-sm font-medium">{accountLabel(account)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{account.accountType ?? account.currency}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function BreakdownRow({ label, amountMinor, currency }: { label: string; amountMinor: bigint; currency: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <Amount
          money={{ amountMinor, currency }}
          variant="balance"
          className={amountMinor > 0n ? 'text-positive' : undefined}
        />
      </dd>
    </div>
  );
}
