import * as React from 'react';
import { ScaleIcon } from 'lucide-react';

import type { PlanMonth } from './types';
import { Amount } from '@/components/app/amount';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';
import { moneyInputValue, parseMoneyMinor } from '@/lib/money';
import { cn } from '@/lib/utils';

export function CostToBeMe({
  compact = false,
  month,
  onSaveExpectedIncome,
  pending,
}: {
  /** Drops the card chrome and the two-column split so the panel fits the inspector column. */
  compact?: boolean;
  month: PlanMonth;
  onSaveExpectedIncome: (amountMinor: bigint) => Promise<boolean>;
  pending: boolean;
}) {
  const { intlLocale, t } = useI18n();
  const currency = month.plan.currency;
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setValue(
      month.plan.expectedIncomeMinor === null
        ? ''
        : moneyInputValue({ amountMinor: month.plan.expectedIncomeMinor, currency }, intlLocale),
    );
    setError(null);
  }, [currency, intlLocale, month.plan.expectedIncomeMinor]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    let amountMinor: bigint;
    try {
      amountMinor = parseMoneyMinor(value, currency, intlLocale);
    } catch {
      setError(t('plan.errors.invalidAmount'));
      return;
    }
    if (amountMinor < 0n) {
      setError(t('plan.cost.expectedIncomeError'));
      return;
    }
    if (await onSaveExpectedIncome(amountMinor)) setError(null);
  }

  const expectedIncomeMinor = month.plan.expectedIncomeMinor;
  const differenceMinor = expectedIncomeMinor === null ? null : expectedIncomeMinor - month.totals.targetsMinor;

  return (
    <Card size="sm" className={cn(compact && 'gap-0 border-0 bg-transparent shadow-none')}>
      <CardContent
        className={cn(
          'grid gap-4',
          compact ? 'px-0 py-0' : 'lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.8fr)] lg:items-center',
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ScaleIcon className="size-4" />
            {t('plan.cost.title')}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('plan.cost.description')}</p>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">{t('plan.cost.targets')}</p>
              <Amount
                money={{ amountMinor: month.totals.targetsMinor, currency }}
                variant="balance"
                className="font-heading text-xl"
              />
            </div>
            {differenceMinor !== null ? (
              <div>
                <p className="text-xs text-muted-foreground">
                  {differenceMinor >= 0n ? t('plan.cost.remaining') : t('plan.cost.shortfall')}
                </p>
                <Amount
                  money={{ amountMinor: differenceMinor >= 0n ? differenceMinor : -differenceMinor, currency }}
                  variant="balance"
                  className={cn('font-heading text-xl', differenceMinor >= 0n ? 'text-positive' : 'text-destructive')}
                />
              </div>
            ) : null}
          </div>
        </div>
        <form className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => void submit(event)}>
          <div className="min-w-0 flex-1">
            <label htmlFor="plan-expected-income" className="text-xs font-medium text-muted-foreground">
              {t('plan.cost.expectedIncome')}
            </label>
            <Input
              id="plan-expected-income"
              className="mt-1"
              value={value}
              inputMode="decimal"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'plan-expected-income-error' : undefined}
              placeholder={t('plan.cost.expectedIncomePlaceholder')}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />
            {error ? (
              <p id="plan-expected-income-error" role="alert" className="mt-1 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {t('common.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
