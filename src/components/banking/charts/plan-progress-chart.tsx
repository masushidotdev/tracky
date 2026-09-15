import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts';

import type { ChartConfig } from '@/components/ui/chart';
import type { PlanProgressDatum } from '@/components/banking/dashboard/dashboard-plan-buckets';
import { ChartCard } from '@/components/app/chart-card';
import { ChartContainer } from '@/components/ui/chart';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney, fundedProgressPercent } from '@/lib/money';

export function PlanProgressChart({ data, period }: { data: Array<PlanProgressDatum> | undefined; period: string }) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const chartConfig = {
    progress: {
      label: t('charts.plan.progress'),
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig;

  return (
    <ChartCard
      title={t('charts.plan.title')}
      description={t('charts.plan.description', { period, scope: t('dashboard.scope.all') })}
      data={data}
      empty={{ title: t('charts.empty.title'), hint: t('charts.plan.empty') }}
    >
      {/* Unlike the real charts in this card, this is a list that grows with the number of buckets,
          so it has to scroll inside the card's fixed height instead of spilling past its edge. */}
      {(buckets) => (
        <div className="grid h-full gap-3 overflow-y-auto overscroll-contain pe-1 sm:grid-cols-2 sm:content-start">
          {buckets.map(({ funded, id, name, remaining, spent }) => {
            const rawProgress = fundedProgressPercent(spent, funded);
            const progress = Math.max(0, Math.min(rawProgress, 100));
            const isOver = remaining.amountMinor < 0n;

            return (
              <div key={id} className="grid grid-cols-[6rem_1fr] items-center gap-3 rounded-md border p-3">
                <ChartContainer config={chartConfig} className="aspect-square h-24">
                  <RadialBarChart
                    data={[{ progress }]}
                    startAngle={90}
                    endAngle={-270}
                    innerRadius={34}
                    outerRadius={44}
                  >
                    <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                      <Label
                        content={({ viewBox }) => {
                          if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) {
                            return null;
                          }

                          return (
                            <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                              <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-sm font-semibold">
                                {Math.round(rawProgress)}%
                              </tspan>
                            </text>
                          );
                        }}
                      />
                    </PolarRadiusAxis>
                    <RadialBar
                      dataKey="progress"
                      fill={isOver ? 'var(--destructive)' : 'var(--color-progress)'}
                      background
                      cornerRadius={6}
                    />
                  </RadialBarChart>
                </ChartContainer>
                <div className="min-w-0">
                  <div className="truncate font-medium">{name}</div>
                  <div className="text-sm text-muted-foreground">
                    {t('charts.plan.spentOf', {
                      spent: maskValue(formatMoney(spent, intlLocale)),
                      funded: maskValue(formatMoney(funded, intlLocale)),
                    })}
                  </div>
                  <div className={isOver ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                    {t('charts.plan.remaining', { amount: maskValue(formatMoney(remaining, intlLocale)) })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}
