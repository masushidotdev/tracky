import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import type { ChartConfig } from '@/components/ui/chart';
import type { Money } from '@/lib/money';
import { ChartCard } from '@/components/app/chart-card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { compactMoney } from '@/lib/format';
import { formatMoney, moneyFromMajor } from '@/lib/money';

export type SpendingDatum = { name: string; amount: number; money: Money };

export function SpendingByCategoryChart({
  currency,
  data,
  period,
  scopeLabel,
}: {
  data: Array<SpendingDatum> | undefined;
  currency: string;
  period: string;
  scopeLabel: string;
}) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const chartConfig = {
    amount: {
      label: t('charts.spending.amount'),
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig;

  return (
    <ChartCard
      title={t('charts.spending.title')}
      description={t('charts.spending.description', { period, scope: scopeLabel })}
      data={data}
      empty={{ title: t('charts.empty.title'), hint: t('charts.spending.empty') }}
    >
      {(chartData) => (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <BarChart accessibilityLayer data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              hide
              tickFormatter={(value) =>
                compactMoney(moneyFromMajor(Number(value), currency, intlLocale), intlLocale)
              }
            />
            <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={8} width={112} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(_value, _name, _item, _index, payload) =>
                    maskValue(formatMoney((payload as unknown as SpendingDatum).money, intlLocale))
                  }
                />
              }
            />
            <Bar dataKey="amount" fill="var(--color-amount)" radius={4} />
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}
