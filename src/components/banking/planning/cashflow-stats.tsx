import { cycleIntervalLabelKeys, formatIsoDateLabel } from './helpers';
import type { CycleInterval } from './helpers';
import type { Money } from '@/lib/money';
import { Amount } from '@/components/app/amount';
import { StatCard, StatCardGroup } from '@/components/app/stat-card';
import { useI18n } from '@/lib/i18n';

function AmountList({ values }: { values: Array<Money> }) {
  const { t } = useI18n();

  if (values.length === 0) {
    return t('planning.cashflow.none');
  }

  return (
    <span className="flex flex-wrap gap-1">
      {values.map((value, index) => (
        <span key={`${value.currency}:${value.amountMinor}`} className="inline-flex gap-1">
          {index > 0 ? <span>+</span> : null}
          <Amount money={value} />
        </span>
      ))}
    </span>
  );
}

export function CashflowStats({
  firstNegativeDate,
  monthlyFundingTotals,
  preferenceInterval,
  upcomingTotals,
}: {
  firstNegativeDate: string | undefined;
  monthlyFundingTotals: Array<Money>;
  preferenceInterval: CycleInterval;
  upcomingTotals: Array<Money>;
}) {
  const { intlLocale, t } = useI18n();

  return (
    <StatCardGroup>
      <StatCard label={t('planning.cashflow.upcomingTotal')} value={<AmountList values={upcomingTotals} />} />
      <StatCard label={t('planning.cashflow.monthlyFunding')} value={<AmountList values={monthlyFundingTotals} />} />
      <StatCard
        label={t('planning.cashflow.firstNegativeDate')}
        value={
          firstNegativeDate ? formatIsoDateLabel(firstNegativeDate, intlLocale) : t('planning.cashflow.noNegativeDate')
        }
      />
      <StatCard label={t('planning.preferences.frequency')} value={t(cycleIntervalLabelKeys[preferenceInterval])} />
    </StatCardGroup>
  );
}
