import * as React from 'react';

import type { AccountAssumptionDraft, ForecastAccountAssumption } from './forecast-utils';
import { Button } from '@/components/ui/button';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { moneyInputValue } from '@/lib/money';
import { useI18n } from '@/lib/i18n';

export function AccountSettingsSheet({
  assumption,
  currency,
  isPending,
  label,
  onOpenChange,
  onSave,
  open,
}: {
  assumption: ForecastAccountAssumption | null;
  currency: string;
  isPending: boolean;
  label: string;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: AccountAssumptionDraft) => Promise<boolean>;
  open: boolean;
}) {
  const { intlLocale, t } = useI18n();
  const [included, setIncluded] = React.useState(true);
  const [growth, setGrowth] = React.useState('0');
  const [contribution, setContribution] = React.useState('0');
  const [rate, setRate] = React.useState('');
  const [payment, setPayment] = React.useState('');
  const [includedInLivingExpenses, setIncludedInLivingExpenses] = React.useState(true);

  React.useEffect(() => {
    if (!assumption || !open) return;
    setIncluded(assumption.included);
    setGrowth(String(assumption.growthAnnualPct ?? 0));
    setContribution(
      assumption.contributionYearly ? moneyInputValue(assumption.contributionYearly, intlLocale) : '0',
    );
    setRate(assumption.liability?.annualRateBps === undefined ? '' : String(assumption.liability.annualRateBps / 100));
    setPayment(
      assumption.liability?.paymentMonthly ? moneyInputValue(assumption.liability.paymentMonthly, intlLocale) : '',
    );
    setIncludedInLivingExpenses(assumption.liability?.includedInLivingExpenses ?? true);
  }, [assumption, intlLocale, open]);

  if (!assumption) return null;
  const isLiability = assumption.target.kind === 'creditFacility';

  const save = async () => {
    const ok = await onSave({
      target: assumption.target,
      included,
      ...(isLiability
        ? {
            annualRatePct: rate.trim() ? Number(rate) : undefined,
            paymentMonthly: payment.trim() || undefined,
            includedInLivingExpenses,
          }
        : {
            growthAnnualPct: Number(growth),
            contributionYearly: contribution,
          }),
    });
    if (ok) onOpenChange(false);
  };

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={label}
      description={t('forecast.account.description')}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={isPending} onClick={() => void save()}>
            {isPending ? t('forecast.actions.saving') : t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 py-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border p-3">
          <div>
            <Label htmlFor="forecast-account-included">{t('forecast.account.include')}</Label>
            <p className="text-xs text-muted-foreground">{t('forecast.account.includeHint')}</p>
          </div>
          <Switch id="forecast-account-included" checked={included} onCheckedChange={setIncluded} />
        </div>

        {isLiability ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="forecast-liability-rate">{t('forecast.account.rate')}</Label>
              <div className="relative">
                <Input
                  id="forecast-liability-rate"
                  type="number"
                  min={0}
                  max={1000}
                  step="0.01"
                  value={rate}
                  placeholder={t('forecast.account.liveValue')}
                  className="pr-8"
                  onChange={(event) => setRate(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="forecast-liability-payment">{t('forecast.account.payment')}</Label>
              <Input
                id="forecast-liability-payment"
                inputMode="decimal"
                value={payment}
                placeholder={t('forecast.account.liveValue')}
                onChange={(event) => setPayment(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{currency}</p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border p-3">
              <div>
                <Label htmlFor="forecast-liability-expenses">{t('forecast.account.inLivingExpenses')}</Label>
                <p className="text-xs text-muted-foreground">{t('forecast.account.inLivingExpensesHint')}</p>
              </div>
              <Switch
                id="forecast-liability-expenses"
                checked={includedInLivingExpenses}
                onCheckedChange={setIncludedInLivingExpenses}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="forecast-account-growth">{t('forecast.account.growth')}</Label>
              <div className="relative">
                <Input
                  id="forecast-account-growth"
                  type="number"
                  min={-99}
                  max={100}
                  step="0.1"
                  value={growth}
                  className="pr-8"
                  onChange={(event) => setGrowth(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="forecast-account-contribution">{t('forecast.account.yearlyContribution')}</Label>
              <Input
                id="forecast-account-contribution"
                inputMode="decimal"
                value={contribution}
                onChange={(event) => setContribution(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{currency}</p>
            </div>
          </>
        )}
      </div>
    </DetailSheet>
  );
}
