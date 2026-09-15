import type { ReportSummary } from './types';
import { Amount } from '@/components/app/amount';
import { StatCard, StatCardGroup } from '@/components/app/stat-card';
import { useI18n } from '@/lib/i18n';

export function ReportSummaryCards({ summary }: { summary: ReportSummary }) {
  const { intlLocale, t } = useI18n();
  const savingsRate = new Intl.NumberFormat(intlLocale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(summary.savingsRatePct / 100);

  return (
    <StatCardGroup>
      <StatCard
        label={t('reports.summary.income')}
        value={<Amount money={{ amountMinor: summary.incomeMinor, currency: summary.currency }} />}
      />
      <StatCard
        label={t('reports.summary.expenses')}
        value={<Amount money={{ amountMinor: summary.expensesMinor, currency: summary.currency }} />}
      />
      <StatCard
        label={t('reports.summary.net')}
        value={<Amount money={{ amountMinor: summary.netMinor, currency: summary.currency }} variant="balance" />}
      />
      <StatCard label={t('reports.summary.savingsRate')} value={savingsRate} />
    </StatCardGroup>
  );
}
