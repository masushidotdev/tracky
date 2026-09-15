import { calendarYearFromMonthIndex, displayMinor, firstCheckpoint, lastCheckpoint } from './forecast-utils';
import type { EurosMode, ForecastProjection } from './forecast-utils';
import { Amount } from '@/components/app/amount';
import { StatCard, StatCardGroup } from '@/components/app/stat-card';
import { useI18n } from '@/lib/i18n';

function retirementMinor(projection: ForecastProjection, mode: EurosMode) {
  if (!projection.retirement) return undefined;
  const year = calendarYearFromMonthIndex(projection.retirement.monthIndex);
  const checkpoint = projection.yearly.find((item) => item.calendarYear === year);
  return displayMinor(projection.retirement.netWorthMinor, checkpoint?.deflatorScaled ?? 1_000_000_000_000n, mode);
}

function deltaTone(value: bigint) {
  if (value > 0n) return 'positive' as const;
  if (value < 0n) return 'negative' as const;
  return 'neutral' as const;
}

function moneyValue(amountMinor: bigint | undefined, currency: string) {
  return amountMinor === undefined ? '—' : <Amount money={{ amountMinor, currency }} variant="balance" />;
}

function moneyDelta(amountMinor: bigint | undefined, currency: string) {
  if (amountMinor === undefined) return undefined;
  return {
    value: <Amount money={{ amountMinor, currency }} variant="balance" className="text-xs" />,
    tone: deltaTone(amountMinor),
  };
}

export function ForecastStatsBar({
  compareName,
  compareProjection,
  mode,
  projection,
  retirementAge,
}: {
  compareName?: string;
  compareProjection?: ForecastProjection;
  mode: EurosMode;
  projection: ForecastProjection;
  retirementAge?: number;
}) {
  const { t } = useI18n();
  const first = firstCheckpoint(projection);
  const last = lastCheckpoint(projection);
  const compareFirst = compareProjection ? firstCheckpoint(compareProjection) : undefined;
  const compareLast = compareProjection ? lastCheckpoint(compareProjection) : undefined;
  const firstMinor = first ? displayMinor(first.netWorthMinor, first.deflatorScaled, mode) : undefined;
  const lastMinor = last ? displayMinor(last.netWorthMinor, last.deflatorScaled, mode) : undefined;
  const retirement = retirementMinor(projection, mode);
  const compareRetirement = compareProjection ? retirementMinor(compareProjection, mode) : undefined;
  const compareFirstMinor = compareFirst
    ? displayMinor(compareFirst.netWorthMinor, compareFirst.deflatorScaled, mode)
    : undefined;
  const compareLastMinor = compareLast
    ? displayMinor(compareLast.netWorthMinor, compareLast.deflatorScaled, mode)
    : undefined;
  const hint = compareName ? t('forecast.compare.deltaVs', { name: compareName }) : undefined;

  return (
    <StatCardGroup>
      <StatCard
        label={t('forecast.stats.endOfYear')}
        value={moneyValue(firstMinor, projection.currency)}
        delta={moneyDelta(
          firstMinor !== undefined && compareFirstMinor !== undefined ? firstMinor - compareFirstMinor : undefined,
          projection.currency,
        )}
        hint={hint}
      />
      <StatCard
        label={t('forecast.stats.atRetirement')}
        value={moneyValue(retirement, projection.currency)}
        delta={moneyDelta(
          retirement !== undefined && compareRetirement !== undefined ? retirement - compareRetirement : undefined,
          projection.currency,
        )}
        hint={hint}
      />
      <StatCard label={t('forecast.stats.retirementAge')} value={retirementAge ?? '—'} />
      <StatCard
        label={t('forecast.stats.endOfPlan')}
        value={moneyValue(lastMinor, projection.currency)}
        delta={moneyDelta(
          lastMinor !== undefined && compareLastMinor !== undefined ? lastMinor - compareLastMinor : undefined,
          projection.currency,
        )}
        hint={hint}
      />
    </StatCardGroup>
  );
}
