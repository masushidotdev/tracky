import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartPieIcon } from 'lucide-react';

import { chartColor, rollupBreakdown } from './report-utils';
import type { ChartConfig } from '@/components/ui/chart';
import type { ReportBreakdown, ReportSegmentSelection, ReportTab } from './types';
import type { RolledBreakdown } from './report-utils';
import { Amount } from '@/components/app/amount';
import { ChartCard } from '@/components/app/chart-card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { compactMoney } from '@/lib/format';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';

type ChartDatum = RolledBreakdown & {
  value: number;
  color: string;
};

function BreakdownTooltip({ active, currency, datum }: { active: boolean; currency: string; datum?: ChartDatum }) {
  if (!active || !datum) {
    return null;
  }
  return (
    <div className="grid min-w-40 gap-1 rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
      <span className="text-muted-foreground">{datum.label}</span>
      <Amount money={{ amountMinor: datum.amountMinor, currency }} className="font-medium" />
    </div>
  );
}

export function SpendingBreakdownChart({
  currency,
  data,
  onSelect,
  tab,
  variant,
}: {
  currency: string;
  data: Array<ReportBreakdown> | undefined;
  onSelect: (selection: ReportSegmentSelection) => void;
  tab: Extract<ReportTab, 'spending' | 'income'>;
  variant: 'donut' | 'hbar';
}) {
  const { intlLocale, t } = useI18n();
  const { hidden } = useBalancePrivacy();
  const chartData: Array<ChartDatum> | undefined = data
    ? rollupBreakdown(data, tab, t('reports.breakdown.other')).map((row, index) => ({
        ...row,
        value: Number(row.amountMinor),
        color: chartColor(index),
      }))
    : undefined;
  const chartConfig = Object.fromEntries(
    (chartData ?? []).map((row) => [row.key, { label: row.label, color: row.color }]),
  ) satisfies ChartConfig;
  const totalMinor = chartData?.reduce((total, row) => total + row.amountMinor, 0n) ?? 0n;
  const selectRow = (row: ChartDatum) => {
    if (!row.isOther) {
      onSelect({ groupKey: row.key, label: row.label, currency });
    }
  };

  return (
    <ChartCard
      title={tab === 'spending' ? t('reports.breakdown.spendingTitle') : t('reports.breakdown.incomeTitle')}
      description={t('reports.breakdown.description')}
      data={chartData}
      height={variant === 'donut' ? 360 : 420}
      empty={{
        icon: ChartPieIcon,
        title: t('reports.empty.title'),
        hint: t('reports.empty.breakdown'),
      }}
    >
      {(rows) =>
        variant === 'donut' ? (
          <div className="grid h-full min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
            <div className="relative min-h-0">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <PieChart accessibilityLayer>
                  <ChartTooltip
                    cursor={false}
                    content={({ active, payload }) => (
                      <BreakdownTooltip
                        active={Boolean(active)}
                        currency={currency}
                        datum={payload[0]?.payload as ChartDatum | undefined}
                      />
                    )}
                  />
                  <Pie
                    data={rows}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={1.5}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {rows.map((row) => (
                      <Cell
                        key={row.key}
                        fill={row.color}
                        className={row.isOther ? undefined : 'cursor-pointer'}
                        onClick={() => selectRow(row)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">{t('reports.breakdown.total')}</span>
                <Amount money={{ amountMinor: totalMinor, currency }} className="text-base font-semibold" />
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto pr-1">
              <ul className="grid gap-1" aria-label={t('reports.breakdown.legend')}>
                {rows.map((row, index) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      disabled={row.isOther}
                      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs hover:bg-muted disabled:cursor-default disabled:opacity-80"
                      onClick={() => selectRow(row)}
                    >
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: chartColor(index) }} />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.label}</span>
                      <Amount money={{ amountMinor: row.amountMinor, currency }} className="font-medium" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-full w-full">
            <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  hidden ? '' : compactMoney({ amountMinor: BigInt(Math.round(Number(value))), currency }, intlLocale)
                }
              />
              <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} tickMargin={8} width={120} />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)' }}
                content={({ active, payload }) => (
                  <BreakdownTooltip
                    active={Boolean(active)}
                    currency={currency}
                    datum={payload[0]?.payload as ChartDatum | undefined}
                  />
                )}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {rows.map((row) => (
                  <Cell
                    key={row.key}
                    fill={row.color}
                    className={row.isOther ? undefined : 'cursor-pointer'}
                    onClick={() => selectRow(row)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )
      }
    </ChartCard>
  );
}
