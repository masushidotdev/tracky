import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartNoAxesCombinedIcon } from 'lucide-react';

import { chartColor, reportGroupValue } from './report-utils';
import type { ChartConfig } from '@/components/ui/chart';
import type { ReportSeries, ReportTab } from './types';
import { Amount } from '@/components/app/amount';
import { ChartCard } from '@/components/app/chart-card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from '@/components/ui/chart';
import { compactMoney } from '@/lib/format';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';

type TrendSeries = {
  key: string;
  label: string;
  color: string;
};

type TrendDatum = {
  period: string;
  [key: string]: number | string;
};

type TooltipEntry = {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
};

function TrendsTooltip({
  active,
  currency,
  label,
  payload,
  series,
}: {
  active: boolean;
  currency: string;
  label?: string | number;
  payload?: ReadonlyArray<TooltipEntry>;
  series: Array<TrendSeries>;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const labels = new Map(series.map((item) => [item.key, item.label]));
  return (
    <div className="grid min-w-48 gap-2 rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
      <span className="font-medium">{label}</span>
      {payload.map((item) => {
        const key = String(item.dataKey ?? '');
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: item.color }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{labels.get(key) ?? key}</span>
            <Amount
              money={{ amountMinor: BigInt(Math.round(Number(item.value ?? 0))), currency }}
              variant="balance"
              className="font-medium"
            />
          </div>
        );
      })}
    </div>
  );
}

export function ReportTrendsChart({
  currency,
  data,
  tab,
  variant,
}: {
  currency: string;
  data: Array<ReportSeries> | undefined;
  tab: ReportTab;
  variant: 'barGrouped' | 'barStacked';
}) {
  const { intlLocale, t } = useI18n();
  const { hidden } = useBalancePrivacy();
  const totals = new Map<string, { label: string; amountMinor: bigint }>();
  for (const period of data ?? []) {
    for (const group of period.groups) {
      const current = totals.get(group.key) ?? { label: group.label, amountMinor: 0n };
      const value = reportGroupValue(group, tab);
      current.amountMinor += value < 0n ? -value : value;
      totals.set(group.key, current);
    }
  }
  const ranked = [...totals.entries()].sort((left, right) =>
    left[1].amountMinor === right[1].amountMinor ? 0 : left[1].amountMinor > right[1].amountMinor ? -1 : 1,
  );
  const selected = ranked.slice(0, 8);
  const excludedKeys = new Set(ranked.slice(8).map(([key]) => key));
  const series: Array<TrendSeries> = selected.map(([key, value], index) => ({
    key,
    label: value.label,
    color: chartColor(index),
  }));
  if (excludedKeys.size > 0) {
    series.push({ key: '__other__', label: t('reports.breakdown.other'), color: chartColor(series.length) });
  }
  const chartData: Array<TrendDatum> | undefined = data
    ? data.map((period) => {
        const row: TrendDatum = { period: period.period };
        let otherMinor = 0n;
        for (const group of period.groups) {
          const value = reportGroupValue(group, tab);
          if (excludedKeys.has(group.key)) {
            otherMinor += value;
          } else if (selected.some(([key]) => key === group.key)) {
            row[group.key] = Number(value);
          }
        }
        if (excludedKeys.size > 0) {
          row.__other__ = Number(otherMinor);
        }
        return row;
      })
    : undefined;
  const chartConfig = Object.fromEntries(
    series.map((item) => [item.key, { label: item.label, color: item.color }]),
  ) satisfies ChartConfig;

  return (
    <ChartCard
      title={t(`reports.trends.${tab}Title`)}
      description={t('reports.trends.description')}
      data={series.length === 0 && chartData ? [] : chartData}
      height={380}
      empty={{
        icon: ChartNoAxesCombinedIcon,
        title: t('reports.empty.title'),
        hint: t('reports.empty.trends'),
      }}
    >
      {(rows) => (
        <>
          <ChartContainer config={chartConfig} className="h-full w-full">
            <BarChart accessibilityLayer data={rows} margin={{ top: 8, right: 12, left: 8 }} barGap={2}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  hidden ? '' : compactMoney({ amountMinor: BigInt(Math.round(Number(value))), currency }, intlLocale)
                }
                width={72}
              />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)' }}
                content={({ active, label, payload }) => (
                  <TrendsTooltip
                    active={Boolean(active)}
                    currency={currency}
                    label={label}
                    payload={payload as unknown as Array<TooltipEntry>}
                    series={series}
                  />
                )}
              />
              {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
              {series.map((item) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  name={item.key}
                  fill={item.color}
                  stackId={variant === 'barStacked' ? 'report' : undefined}
                  radius={variant === 'barStacked' ? 0 : 4}
                />
              ))}
            </BarChart>
          </ChartContainer>
          <table className="sr-only">
            <caption>{t(`reports.trends.${tab}Title`)}</caption>
            <thead>
              <tr>
                <th>{t('reports.export.period')}</th>
                {series.map((item) => (
                  <th key={item.key}>{item.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.period)}>
                  <th>{row.period}</th>
                  {series.map((item) => (
                    <td key={item.key}>
                      <Amount
                        money={{ amountMinor: BigInt(Math.round(Number(row[item.key] ?? 0))), currency }}
                        variant="balance"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ChartCard>
  );
}
