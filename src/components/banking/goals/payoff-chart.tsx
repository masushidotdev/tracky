import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { TrendingDownIcon } from 'lucide-react';

import { bigintToSafeNumber } from './goals-utils';
import type { PayDownFacility } from './goals-utils';
import type { ChartConfig } from '@/components/ui/chart';
import { Amount } from '@/components/app/amount';
import { ChartCard } from '@/components/app/chart-card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { useI18n } from '@/lib/i18n';

type ChartDatum = PayDownFacility['schedule'][number] & {
  balanceValue: number;
};

type TooltipPayload = { payload?: ChartDatum };

function PayoffTooltip({
  active,
  currency,
  payload,
}: {
  active: boolean;
  currency: string;
  payload?: ReadonlyArray<TooltipPayload>;
}) {
  const { t } = useI18n();
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="grid min-w-48 gap-2 rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div className="font-medium">{t('goals.payDown.chart.month', { month: datum.monthIndex })}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">{t('goals.payDown.chart.balance')}</span>
        <Amount money={{ amountMinor: datum.balanceMinor, currency }} variant="neutral" className="font-medium" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">{t('goals.payDown.chart.principal')}</span>
        <Amount money={{ amountMinor: datum.principalMinor, currency }} variant="neutral" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">{t('goals.payDown.chart.interest')}</span>
        <Amount money={{ amountMinor: datum.interestMinor, currency }} variant="neutral" />
      </div>
    </div>
  );
}

export function PayoffChart({ facility }: { facility: PayDownFacility }) {
  const { t } = useI18n();
  const chartData: Array<ChartDatum> = facility.schedule.map((row) => ({
    ...row,
    balanceValue: bigintToSafeNumber(row.balanceMinor),
  }));
  const chartConfig = {
    balanceValue: { label: t('goals.payDown.chart.balance'), color: 'var(--chart-1)' },
  } satisfies ChartConfig;

  return (
    <div className="grid gap-3">
      <ChartCard
        title={t('goals.payDown.chart.title')}
        description={t('goals.payDown.chart.description')}
        data={chartData}
        height={280}
        empty={{
          icon: TrendingDownIcon,
          title: t('goals.payDown.chart.emptyTitle'),
          hint: t('goals.payDown.chart.emptyDescription'),
        }}
      >
        {(rows) => (
          <ChartContainer config={chartConfig} className="h-full w-full">
            <AreaChart accessibilityLayer data={rows} margin={{ top: 16, right: 12, bottom: 4, left: 12 }}>
              <defs>
                <linearGradient id={`payoff-balance-${facility.facilityId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-balanceValue)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-balanceValue)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="monthIndex" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
              <ChartTooltip
                cursor={{ stroke: 'var(--border)' }}
                content={({ active, payload }) => (
                  <PayoffTooltip active={Boolean(active)} currency={facility.currency} payload={payload} />
                )}
              />
              <Area
                type="monotone"
                dataKey="balanceValue"
                stroke="var(--color-balanceValue)"
                strokeWidth={2}
                fill={`url(#payoff-balance-${facility.facilityId})`}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </ChartCard>
      <details className="rounded-xl border border-border/70 bg-background px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">{t('goals.payDown.chart.table')}</summary>
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full min-w-lg text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">{t('goals.payDown.chart.tableMonth')}</th>
                <th className="pb-2 text-right font-medium">{t('goals.payDown.chart.balance')}</th>
                <th className="pb-2 text-right font-medium">{t('goals.payDown.chart.principal')}</th>
                <th className="pb-2 text-right font-medium">{t('goals.payDown.chart.interest')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {facility.schedule.map((row) => (
                <tr key={row.monthIndex}>
                  <td className="py-2 tabular-nums">{row.monthIndex}</td>
                  <td className="py-2 text-right">
                    <Amount money={{ amountMinor: row.balanceMinor, currency: facility.currency }} variant="neutral" />
                  </td>
                  <td className="py-2 text-right">
                    <Amount
                      money={{ amountMinor: row.principalMinor, currency: facility.currency }}
                      variant="neutral"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <Amount money={{ amountMinor: row.interestMinor, currency: facility.currency }} variant="neutral" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
