import { CalculatorIcon } from 'lucide-react';

import { bigintToSafeNumber } from './goals-utils';
import type { PayoffSimulation, PayoffStrategy } from './goals-utils';
import { Amount } from '@/components/app/amount';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { currencyFractionDigits } from '@/lib/money';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

function strategyHintKey(strategy: PayoffStrategy) {
  if (strategy === 'snowball') return 'goals.payDown.calculator.snowballHint' as const;
  if (strategy === 'planned') return 'goals.payDown.calculator.plannedHint' as const;
  return 'goals.payDown.calculator.avalancheHint' as const;
}

export function PayoffCalculator({
  currencies,
  extraMonthlyInput,
  extraMonthlyMinor,
  inputsValid,
  loading,
  lumpSumInput,
  maxExtraMonthlyMinor,
  onCurrencyChange,
  onExtraMonthlyInputChange,
  onExtraMonthlySliderChange,
  onLumpSumInputChange,
  onStrategyChange,
  selectedCurrency,
  simulation,
  strategy,
}: {
  currencies: Array<string>;
  extraMonthlyInput: string;
  extraMonthlyMinor: bigint;
  inputsValid: boolean;
  loading: boolean;
  lumpSumInput: string;
  maxExtraMonthlyMinor: bigint;
  onCurrencyChange: (currency: string) => void;
  onExtraMonthlyInputChange: (value: string) => void;
  onExtraMonthlySliderChange: (valueMinor: number) => void;
  onLumpSumInputChange: (value: string) => void;
  onStrategyChange: (strategy: PayoffStrategy) => void;
  selectedCurrency: string;
  simulation: PayoffSimulation | undefined;
  strategy: PayoffStrategy;
}) {
  const { intlLocale, t } = useI18n();
  const result = simulation?.currencies.find((currency) => currency.currency === selectedCurrency);
  const sliderMax = Math.max(0, bigintToSafeNumber(maxExtraMonthlyMinor));
  const sliderValue = Math.max(0, Math.min(bigintToSafeNumber(extraMonthlyMinor), sliderMax));
  const sliderStep = 10 ** currencyFractionDigits(selectedCurrency || 'EUR', intlLocale);
  const monthsSaved = result ? Math.max(0, result.baseline.payoffMonths - result.simulated.payoffMonths) : 0;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalculatorIcon className="size-4 text-muted-foreground" />
          {t('goals.payDown.calculator.title')}
        </CardTitle>
        <CardDescription>{t('goals.payDown.calculator.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="flex flex-col gap-5">
          {currencies.length > 1 ? (
            <Field>
              <FieldLabel htmlFor="payoff-currency">{t('common.currency')}</FieldLabel>
              <Select value={selectedCurrency} onValueChange={onCurrencyChange}>
                <SelectTrigger id="payoff-currency" className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field>
            <FieldLabel>{t('goals.payDown.calculator.strategy')}</FieldLabel>
            <ToggleGroup
              type="single"
              value={strategy}
              variant="outline"
              spacing={0}
              aria-label={t('goals.payDown.calculator.strategy')}
              onValueChange={(value) => value && onStrategyChange(value as PayoffStrategy)}
            >
              <ToggleGroupItem value="avalanche">{t('goals.payDown.calculator.avalanche')}</ToggleGroupItem>
              <ToggleGroupItem value="snowball">{t('goals.payDown.calculator.snowball')}</ToggleGroupItem>
              <ToggleGroupItem value="planned">{t('goals.payDown.calculator.planned')}</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>{t(strategyHintKey(strategy))}</FieldDescription>
          </Field>

          <FieldGroup className="gap-5">
            <Field data-invalid={!inputsValid}>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="payoff-extra-monthly">{t('goals.payDown.calculator.extraMonthly')}</FieldLabel>
                <Input
                  id="payoff-extra-monthly"
                  className="w-32 text-right tabular-nums"
                  aria-invalid={!inputsValid}
                  inputMode="decimal"
                  value={extraMonthlyInput}
                  onChange={(event) => onExtraMonthlyInputChange(event.target.value)}
                />
              </div>
              <Slider
                aria-label={t('goals.payDown.calculator.extraMonthly')}
                min={0}
                max={sliderMax}
                step={sliderStep}
                value={[sliderValue]}
                onValueChange={(values) => onExtraMonthlySliderChange(values[0] ?? 0)}
              />
              <FieldDescription>
                {t('goals.payDown.calculator.sliderMax')}{' '}
                <Amount money={{ amountMinor: maxExtraMonthlyMinor, currency: selectedCurrency }} variant="neutral" />
              </FieldDescription>
            </Field>
            <Field data-invalid={!inputsValid}>
              <FieldLabel htmlFor="payoff-lump-sum">{t('goals.payDown.calculator.lumpSum')}</FieldLabel>
              <Input
                id="payoff-lump-sum"
                aria-invalid={!inputsValid}
                inputMode="decimal"
                value={lumpSumInput}
                onChange={(event) => onLumpSumInputChange(event.target.value)}
              />
              {!inputsValid ? <FieldError>{t('goals.payDown.calculator.invalidAmount')}</FieldError> : null}
            </Field>
          </FieldGroup>
        </div>

        <div className="grid content-start gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {loading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : result ? (
            <>
              <div className="rounded-xl bg-muted p-4">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t('goals.payDown.calculator.debtFreeDate')}
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {formatIsoDate(result.simulated.debtFreeDate, intlLocale)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('goals.payDown.calculator.baseline', {
                    date: formatIsoDate(result.baseline.debtFreeDate, intlLocale),
                  })}
                </div>
              </div>
              <div className="rounded-xl bg-muted p-4">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t('goals.payDown.calculator.monthsSaved')}
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{monthsSaved}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('goals.payDown.calculator.simulatedMonths', { months: result.simulated.payoffMonths })}
                </div>
              </div>
              <div className="rounded-xl bg-muted p-4">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t('goals.payDown.calculator.interestSaved')}
                </div>
                <div className="mt-1 text-lg font-semibold text-positive">
                  <Amount
                    money={{ amountMinor: result.simulated.interestSavedMinor, currency: selectedCurrency }}
                    variant="neutral"
                  />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('goals.payDown.calculator.projectedInterest')}{' '}
                  <Amount
                    money={{ amountMinor: result.simulated.totalInterestMinor, currency: selectedCurrency }}
                    variant="neutral"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground sm:col-span-3 lg:col-span-1">
              {t('goals.payDown.calculator.noResult')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
