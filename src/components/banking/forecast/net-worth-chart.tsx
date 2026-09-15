import { Fragment } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ReferenceDot, ReferenceLine, XAxis } from 'recharts';
import { TrendingUpIcon } from 'lucide-react';

import { calendarYearFromMonthIndex, depletionCalendarYear, displayMinor } from './forecast-utils';
import type { ChartConfig } from '@/components/ui/chart';
import type { EurosMode, ForecastCheckpoint, ForecastProjection, ForecastProjectionEvent } from './forecast-utils';
import { Amount } from '@/components/app/amount';
import { ChartCard } from '@/components/app/chart-card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from '@/components/ui/chart';
import { useI18n } from '@/lib/i18n';

type ChartDatum = {
  calendarYear: number;
  age?: number;
  primaryValue?: number;
  compareValue?: number;
  primaryNetWorthMinor?: bigint;
  compareNetWorthMinor?: bigint;
  incomeMinor?: bigint;
  expensesMinor?: bigint;
  events: Array<ForecastProjectionEvent>;
};

type TooltipPayload = { payload?: ChartDatum };

function ForecastTooltip({
  active,
  compareName,
  currency,
  payload,
  primaryName,
}: {
  active: boolean;
  compareName?: string;
  currency: string;
  payload?: ReadonlyArray<TooltipPayload>;
  primaryName: string;
}) {
  const { t } = useI18n();
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  const rows = [
    { label: primaryName, amountMinor: datum.primaryNetWorthMinor },
    ...(compareName ? [{ label: compareName, amountMinor: datum.compareNetWorthMinor }] : []),
    { label: t('forecast.chart.income'), amountMinor: datum.incomeMinor },
    { label: t('forecast.chart.expenses'), amountMinor: datum.expensesMinor },
  ].filter((row): row is { label: string; amountMinor: bigint } => row.amountMinor !== undefined);

  return (
    <div className="grid min-w-56 gap-2 rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div className="flex items-center justify-between gap-4 font-medium">
        <span>{datum.calendarYear}</span>
        {datum.age !== undefined ? (
          <span className="text-muted-foreground">{t('forecast.chart.age', { age: datum.age })}</span>
        ) : null}
      </div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{row.label}</span>
          <Amount money={{ amountMinor: row.amountMinor, currency }} variant="balance" className="font-medium" />
        </div>
      ))}
      {datum.events.length > 0 ? (
        <div className="grid gap-1 border-t pt-2">
          {datum.events.map((event, index) => (
            <div key={`${event.kind}:${event.monthIndex}:${index}`} className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-chart-1" />
              <span>{t(`forecast.events.kind.${event.kind}`)}</span>
              <span className="ml-auto text-muted-foreground">{datum.calendarYear}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function displayedCheckpoint(checkpoint: ForecastCheckpoint, mode: EurosMode) {
  return {
    value: Number(displayMinor(checkpoint.netWorthMinor, checkpoint.deflatorScaled, mode)),
    netWorthMinor: displayMinor(checkpoint.netWorthMinor, checkpoint.deflatorScaled, mode),
  };
}

export function NetWorthChart({
  compareName,
  compareProjection,
  mode,
  primaryName,
  projection,
}: {
  compareName?: string;
  compareProjection?: ForecastProjection;
  mode: EurosMode;
  primaryName: string;
  projection: ForecastProjection;
}) {
  const { t } = useI18n();
  const primaryByYear = new Map(projection.yearly.map((checkpoint) => [checkpoint.calendarYear, checkpoint]));
  const compareByYear = new Map(compareProjection?.yearly.map((checkpoint) => [checkpoint.calendarYear, checkpoint]) ?? []);
  const eventsByYear = new Map<number, Array<ForecastProjectionEvent>>();
  for (const event of projection.events) {
    const year = calendarYearFromMonthIndex(event.monthIndex);
    eventsByYear.set(year, [...(eventsByYear.get(year) ?? []), event]);
  }
  const years = [...new Set([...primaryByYear.keys(), ...compareByYear.keys()])].sort((left, right) => left - right);
  const chartData: Array<ChartDatum> = years.map((calendarYear) => {
    const primary = primaryByYear.get(calendarYear);
    const compare = compareByYear.get(calendarYear);
    const displayedPrimary = primary ? displayedCheckpoint(primary, mode) : undefined;
    const displayedCompare = compare ? displayedCheckpoint(compare, mode) : undefined;
    return {
      calendarYear,
      age: primary?.age ?? compare?.age,
      primaryValue: displayedPrimary?.value,
      compareValue: displayedCompare?.value,
      primaryNetWorthMinor: displayedPrimary?.netWorthMinor,
      compareNetWorthMinor: displayedCompare?.netWorthMinor,
      incomeMinor: primary ? displayMinor(primary.annualIncomeMinor, primary.deflatorScaled, mode) : undefined,
      expensesMinor: primary ? displayMinor(primary.annualExpensesMinor, primary.deflatorScaled, mode) : undefined,
      events: eventsByYear.get(calendarYear) ?? [],
    };
  });
  const depletionYear = depletionCalendarYear(projection.depletedMonthIndex);
  const chartConfig = {
    primaryValue: { label: primaryName, color: 'var(--chart-1)' },
    compareValue: { label: compareName ?? t('forecast.compare.scenario'), color: 'var(--chart-2)' },
  } satisfies ChartConfig;

  return (
    <ChartCard
      title={t('forecast.chart.title')}
      description={t(mode === 'today' ? 'forecast.chart.descriptionToday' : 'forecast.chart.descriptionFuture')}
      data={chartData}
      height={compareProjection ? 390 : 360}
      empty={{
        icon: TrendingUpIcon,
        title: t('forecast.chart.emptyTitle'),
        hint: t('forecast.chart.emptyHint'),
      }}
    >
      {(rows) => (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <AreaChart accessibilityLayer data={rows} margin={{ top: 24, right: 12, bottom: 4, left: 12 }}>
            <defs>
              <linearGradient id="forecast-net-worth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primaryValue)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-primaryValue)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="calendarYear" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
            <ChartTooltip
              cursor={{ stroke: 'var(--border)' }}
              content={({ active, payload }) => (
                <ForecastTooltip
                  active={Boolean(active)}
                  compareName={compareName}
                  currency={projection.currency}
                  payload={payload}
                  primaryName={primaryName}
                />
              )}
            />
            {compareProjection ? <ChartLegend content={<ChartLegendContent />} /> : null}
            {depletionYear ? (
              <ReferenceLine
                x={depletionYear}
                stroke="var(--destructive)"
                strokeDasharray="4 4"
                label={{
                  value: t('forecast.chart.depletion'),
                  position: 'insideTopRight',
                  fill: 'var(--destructive)',
                  fontSize: 12,
                }}
              />
            ) : null}
            {[...eventsByYear.entries()].map(([year]) => {
              const datum = chartData.find((item) => item.calendarYear === year);
              if (!datum || datum.primaryValue === undefined) return null;
              return (
                <Fragment key={year}>
                  <ReferenceLine
                    x={year}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="2 5"
                    strokeOpacity={0.5}
                  />
                  <ReferenceDot
                    x={year}
                    y={datum.primaryValue}
                    r={5}
                    fill="var(--chart-1)"
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                </Fragment>
              );
            })}
            <Area
              type="monotone"
              dataKey="primaryValue"
              name="primaryValue"
              stroke="var(--color-primaryValue)"
              strokeWidth={2}
              fill="url(#forecast-net-worth)"
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
            />
            {compareProjection ? (
              <Line
                type="monotone"
                dataKey="compareValue"
                name="compareValue"
                stroke="var(--color-compareValue)"
                strokeWidth={2}
                strokeDasharray="7 4"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
                connectNulls
              />
            ) : null}
          </AreaChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}
