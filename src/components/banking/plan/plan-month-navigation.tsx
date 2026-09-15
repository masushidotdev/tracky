import { ChevronLeftIcon, ChevronRightIcon, CornerUpLeftIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { currentPeriod } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export function monthLabel(period: string, locale: string) {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/**
 * The month being shown is the label; jumping back is an action that only exists when it can do
 * something. A permanent "current month" control sitting next to the month name read as if it
 * described the month on screen, so August looked like the current month.
 */
export function PlanMonthNavigation({
  canGoPrevious,
  onCurrent,
  onNext,
  onPrevious,
  period,
}: {
  canGoPrevious: boolean;
  onCurrent: () => void;
  onNext: () => void;
  onPrevious: () => void;
  period: string;
}) {
  const { intlLocale, t } = useI18n();
  const isCurrent = period === currentPeriod();

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t('plan.month.previous')}
        disabled={!canGoPrevious}
        onClick={onPrevious}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-0 px-1 text-sm font-medium capitalize">{monthLabel(period, intlLocale)}</span>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t('plan.month.next')} onClick={onNext}>
        <ChevronRightIcon />
      </Button>
      {isCurrent ? null : (
        <Button type="button" variant="outline" size="sm" className="ms-1" onClick={onCurrent}>
          <CornerUpLeftIcon data-icon="inline-start" />
          {t('plan.month.backToCurrent')}
        </Button>
      )}
    </div>
  );
}
