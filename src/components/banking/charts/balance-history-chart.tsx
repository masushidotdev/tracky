import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import type { ChartConfig } from '@/components/ui/chart';
import type { Money } from '@/lib/money';
import { ChartCard } from '@/components/app/chart-card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { compactMoney, shortDate } from '@/lib/format';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney, moneyFromMajor } from '@/lib/money';

export type BalanceHistoryDatum = { date: string; balance: number; money: Money };

export function BalanceHistoryChart({
  currency,
  data,
  scopeLabel,
}: {
  data: Array<BalanceHistoryDatum> | undefined;
  currency: string;
  scopeLabel: string;
}) {
  const { intlLocale, t } = useI18n();
  const { hidden, maskValue } = useBalancePrivacy();
  const chartConfig = {
    balance: {
      label: t('charts.balance.balance'),
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig;

  return (
    <ChartCard
      title={t('charts.balance.title')}
      description={t('charts.balance.description', { scope: scopeLabel })}
      data={data}
      empty={{ title: t('charts.empty.title'), hint: t('charts.balance.empty') }}
    >
      {(chartData) => (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <LineChart accessibilityLayer data={chartData} margin={{ left: 8, right: 16 }}>
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
                    maskValue(formatMoney((payload as unknown as BalanceHistoryDatum).money, intlLocale))
                  }
                />
              }
            />
            <Line dataKey="balance" type="monotone" stroke="var(--color-balance)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}
