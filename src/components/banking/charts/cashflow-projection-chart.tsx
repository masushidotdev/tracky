import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import type { ChartConfig } from '@/components/ui/chart';
import type { Money } from '@/lib/money';
import { ChartCard } from '@/components/app/chart-card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { compactMoney, formatIsoDate, shortDate } from '@/lib/format';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney, moneyFromMajor } from '@/lib/money';

export type CashflowDatum = { date: string; balance: number; money: Money };

export function CashflowProjectionChart({
  accountLabel,
  currency,
  data,
  firstNegativeDate,
}: {
  data: Array<CashflowDatum> | undefined;
  currency: string;
  accountLabel?: string;
  firstNegativeDate?: string;
}) {
  const { intlLocale, t } = useI18n();
  const { hidden, maskValue } = useBalancePrivacy();
  const chartConfig = {
    balance: {
      label: t('charts.cashflow.balance'),
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig;

  return (
    <div className="flex flex-col gap-2">
      <ChartCard
        title={t('charts.cashflow.title')}
        description={t('charts.cashflow.description', { scope: accountLabel ?? t('dashboard.scope.all') })}
        data={data}
        empty={{ title: t('charts.empty.title'), hint: t('charts.cashflow.empty') }}
      >
        {(chartData) => (
          <ChartContainer config={chartConfig} className="h-full w-full">
            <AreaChart accessibilityLayer data={chartData} margin={{ left: 8, right: 16 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => shortDate(String(value), intlLocale)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) =>
                  hidden ? '' : compactMoney(moneyFromMajor(Number(value), currency, intlLocale), intlLocale)
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(_value, _name, _item, _index, payload) =>
                      maskValue(formatMoney((payload as unknown as CashflowDatum).money, intlLocale))
                    }
                  />
                }
              />
              <Area
                dataKey="balance"
                type="monotone"
                fill="var(--color-balance)"
                fillOpacity={0.16}
                stroke="var(--color-balance)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </ChartCard>
      {firstNegativeDate ? (
        <p className="text-sm text-destructive">
          {t('charts.cashflow.firstNegative', { date: formatIsoDate(firstNegativeDate, intlLocale) })}
        </p>
      ) : null}
    </div>
  );
}
