import { Link } from '@tanstack/react-router';
import { AlertTriangleIcon, CalendarCheck2Icon, ChevronDownIcon, CreditCardIcon, Settings2Icon } from 'lucide-react';

import { PayoffCalculator } from './payoff-calculator';
import { PayoffChart } from './payoff-chart';
import type { PayDownOverview, PayoffSimulation, PayoffStrategy } from './goals-utils';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
import { PanelSkeleton, StatRowSkeleton } from '@/components/app/skeletons';
import { StatCard, StatCardGroup } from '@/components/app/stat-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

function setupMissingKey(missing: 'rate' | 'payment') {
  return missing === 'rate' ? ('goals.payDown.setup.rate' as const) : ('goals.payDown.setup.payment' as const);
}

export function PayDownTab({
  calculator,
  overview,
}: {
  calculator: {
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
  };
  overview: PayDownOverview | undefined;
}) {
  const { intlLocale, t } = useI18n();

  if (overview === undefined) {
    return (
      <div className="grid gap-4">
        <StatRowSkeleton />
        <PanelSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold">{t('goals.payDown.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('goals.payDown.description')}</p>
      </div>

      {overview.needsSetup.length > 0 ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>{t('goals.payDown.setup.title')}</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>{t('goals.payDown.setup.description')}</p>
            <div className="flex flex-wrap gap-2">
              {overview.needsSetup.map((facility) => (
                <Badge key={facility.facilityId} variant="secondary">
                  {facility.name} · {facility.missing.map((item) => t(setupMissingKey(item))).join(' + ')}
                </Badge>
              ))}
            </div>
            <Button asChild type="button" size="sm" variant="outline" className="w-fit">
              <Link to="/app/accounts">
                <Settings2Icon data-icon="inline-start" />
                {t('goals.payDown.setup.openAccounts')}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {overview.facilities.length === 0 ? (
        <EmptyState
          icon={CreditCardIcon}
          title={t('goals.payDown.emptyTitle')}
          hint={t('goals.payDown.emptyDescription')}
          action={
            <Button asChild type="button">
              <Link to="/app/accounts">{t('goals.payDown.setup.openAccounts')}</Link>
            </Button>
          }
        />
      ) : null}

      {overview.facilities.length > 0 ? <PayoffCalculator {...calculator} /> : null}

      {overview.totalsByCurrency.map((total) => {
        const facilities = overview.facilities.filter((facility) => facility.currency === total.currency);
        return (
          <section key={total.currency} className="grid gap-4">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold">{total.currency}</h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <StatCardGroup>
              <StatCard
                label={t('goals.payDown.stats.totalDebt')}
                value={
                  <Amount money={{ amountMinor: total.balanceMinor, currency: total.currency }} variant="neutral" />
                }
              />
              <StatCard
                label={t('goals.payDown.stats.monthlyPayments')}
                value={
                  <Amount
                    money={{ amountMinor: total.monthlyPaymentMinor, currency: total.currency }}
                    variant="neutral"
                  />
                }
              />
              <StatCard
                label={t('goals.payDown.stats.debtFreeDate')}
                value={formatIsoDate(total.debtFreeDate, intlLocale)}
                hint={t('goals.payDown.stats.months', { months: total.payoffMonths })}
              />
              <StatCard
                label={t('goals.payDown.stats.projectedInterest')}
                value={
                  <Amount
                    money={{ amountMinor: total.totalInterestMinor, currency: total.currency }}
                    variant="neutral"
                  />
                }
              />
            </StatCardGroup>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t('goals.payDown.facilities.title')}</CardTitle>
                <CardDescription>{t('goals.payDown.facilities.description')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border/60">
                {facilities.map((facility) => (
                  <details key={facility.facilityId} className="group py-3 first:pt-0 last:pb-0">
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <CreditCardIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{facility.name}</div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {t('goals.payDown.facilities.apr')}{' '}
                            {(facility.annualRateBps / 100).toLocaleString(intlLocale, {
                              maximumFractionDigits: 2,
                            })}
                            %
                          </span>
                          <span>
                            {t('goals.payDown.facilities.payment')}{' '}
                            <Amount
                              money={{ amountMinor: facility.monthlyPaymentMinor, currency: facility.currency }}
                              variant="neutral"
                            />
                          </span>
                          <span>{t('goals.payDown.facilities.payoffMonths', { months: facility.payoffMonths })}</span>
                          <span className="sm:hidden">
                            {t('goals.payDown.chart.balance')}{' '}
                            <Amount
                              money={{ amountMinor: facility.balanceMinor, currency: facility.currency }}
                              variant="neutral"
                            />
                          </span>
                          <span className="sm:hidden">{formatIsoDate(facility.debtFreeDate, intlLocale)}</span>
                        </div>
                      </div>
                      <div className="hidden text-right sm:block">
                        <div className="font-semibold">
                          <Amount
                            money={{ amountMinor: facility.balanceMinor, currency: facility.currency }}
                            variant="neutral"
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                          <CalendarCheck2Icon className="size-3" />
                          {formatIsoDate(facility.debtFreeDate, intlLocale)}
                        </div>
                      </div>
                      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="pt-4">
                      <PayoffChart facility={facility} />
                    </div>
                  </details>
                ))}
              </CardContent>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
