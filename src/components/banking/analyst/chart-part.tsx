import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';

import { hasSafeCells, isRecord, isSafeDataKey } from './helpers';
import { Amount } from '@/components/app/amount';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { moneyFromMajor } from '@/lib/money';

type ChartSpec = {
  title: string;
  type: 'bar' | 'line' | 'area' | 'pie';
  xKey: string;
  series: Array<{ key: string; label: string }>;
  data: Array<Record<string, string | number>>;
  currency?: string;
};

function parseSpec(value: unknown): ChartSpec | null {
  if (
    !isRecord(value) ||
    typeof value.title !== 'string' ||
    !['bar', 'line', 'area', 'pie'].includes(String(value.type))
  )
    return null;
  if (!isSafeDataKey(value.xKey) || !Array.isArray(value.series) || !Array.isArray(value.data)) return null;
  const series = value.series
    .filter(isRecord)
    .flatMap((item) =>
      isSafeDataKey(item.key) && typeof item.label === 'string' ? [{ key: item.key, label: item.label }] : [],
    );
  const data = value.data.filter(isRecord).filter(hasSafeCells).slice(0, 60) as Array<Record<string, string | number>>;
  if (series.length === 0 || data.length === 0) return null;
  return {
    title: value.title,
    type: value.type as ChartSpec['type'],
    xKey: value.xKey,
    series,
    data,
    currency: typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency) ? value.currency : undefined,
  };
}

export function ChartPart({ output }: { output: unknown }) {
  const { hidden } = useBalancePrivacy();
  const spec = parseSpec(output);
  if (!spec) return null;
  // Recharts renders raw numbers on the value axis, so a currency chart has to drop its tick labels
  // while balances are hidden. The series shapes stay.
  const hideAxisValues = hidden && Boolean(spec.currency);
  const config = Object.fromEntries(
    spec.series.map((series, index) => [series.key, { label: series.label, color: `var(--chart-${(index % 5) + 1})` }]),
  );
  const common = { data: spec.data, margin: { left: 8, right: 12 } };
  return (
    <section className="my-3 rounded-3xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{spec.title}</h3>
      <ChartContainer config={config} className="h-64 w-full">
        {spec.type === 'bar' ? (
          <BarChart accessibilityLayer {...common}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={spec.xKey} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tick={!hideAxisValues} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    spec.currency && typeof value === 'number' ? (
                      <Amount money={moneyFromMajor(value, spec.currency)} />
                    ) : (
                      String(value)
                    )
                  }
                />
              }
            />
            {spec.series.map((series) => (
              <Bar key={series.key} dataKey={series.key} fill={`var(--color-${series.key})`} radius={4} />
            ))}
          </BarChart>
        ) : spec.type === 'line' ? (
          <LineChart accessibilityLayer {...common}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={spec.xKey} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tick={!hideAxisValues} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    spec.currency && typeof value === 'number' ? (
                      <Amount money={moneyFromMajor(value, spec.currency)} />
                    ) : (
                      String(value)
                    )
                  }
                />
              }
            />
            {spec.series.map((series) => (
              <Line
                key={series.key}
                dataKey={series.key}
                stroke={`var(--color-${series.key})`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : spec.type === 'area' ? (
          <AreaChart accessibilityLayer {...common}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={spec.xKey} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} tick={!hideAxisValues} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    spec.currency && typeof value === 'number' ? (
                      <Amount money={moneyFromMajor(value, spec.currency)} />
                    ) : (
                      String(value)
                    )
                  }
                />
              }
            />
            {spec.series.map((series) => (
              <Area
                key={series.key}
                dataKey={series.key}
                stroke={`var(--color-${series.key})`}
                fill={`var(--color-${series.key})`}
                fillOpacity={0.15}
              />
            ))}
          </AreaChart>
        ) : (
          <PieChart accessibilityLayer>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    spec.currency && typeof value === 'number' ? (
                      <Amount money={moneyFromMajor(value, spec.currency)} />
                    ) : (
                      String(value)
                    )
                  }
                />
              }
            />
            <Pie data={spec.data} dataKey={spec.series[0].key} nameKey={spec.xKey} innerRadius={50} outerRadius={90}>
              {spec.data.map((_row, index) => (
                <Cell key={index} fill={`var(--chart-${(index % 5) + 1})`} />
              ))}
            </Pie>
            <Legend />
          </PieChart>
        )}
      </ChartContainer>
    </section>
  );
}
