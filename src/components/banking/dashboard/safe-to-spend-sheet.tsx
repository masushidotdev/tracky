import type { Money } from '@/lib/money';
import { Amount } from '@/components/app/amount';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIsoDate } from '@/lib/format';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

export type SafeToSpendBreakdown = {
  currency: string;
  availableCash: Money;
  committedOutflows: Money;
  moneyBoxFunding: Money;
  expectedIncome: Money;
  safeToSpend: Money;
  safeToSpendWithIncome: Money;
  cycleStartDate: string;
  cycleEndDate: string;
  daysRemaining: number;
  perDay: Money;
  topUpcoming: Array<{
    name: string;
    dueDate: string;
    amount: Money;
    kind: 'plannedExpense' | 'subscription' | 'scheduledTransaction' | 'creditInstallment' | 'creditStatement';
  }>;
};

function BreakdownRow({ label, money, operator }: { label: string; money: Money; operator: '+' | '−' | '=' | '' }) {
  return (
    <div className="grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-2 text-sm">
      <span className="text-muted-foreground" aria-hidden="true">
        {operator}
      </span>
      <span className="text-muted-foreground">{label}</span>
      <Amount money={money} variant={operator === '=' ? 'balance' : 'neutral'} />
    </div>
  );
}

function BreakdownSection({ breakdown }: { breakdown: SafeToSpendBreakdown }) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const hasExpectedIncome = breakdown.expectedIncome.amountMinor !== 0n;

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`safe-to-spend-${breakdown.currency}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id={`safe-to-spend-${breakdown.currency}`} className="font-medium">
            {breakdown.currency}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('dashboard.safeToSpend.cycle', {
              start: formatIsoDate(breakdown.cycleStartDate, intlLocale),
              end: formatIsoDate(breakdown.cycleEndDate, intlLocale),
              days: breakdown.daysRemaining,
            })}
          </p>
        </div>
        <div className="text-right">
          <Amount money={breakdown.safeToSpend} variant="balance" className="text-xl font-semibold" />
          <p className="text-xs text-muted-foreground">
            {t('dashboard.safeToSpend.perDay', { amount: maskValue(formatMoney(breakdown.perDay, intlLocale)) })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <BreakdownRow label={t('dashboard.safeToSpend.availableCash')} money={breakdown.availableCash} operator="" />
        <BreakdownRow
          label={t('dashboard.safeToSpend.committedOutflows')}
          money={breakdown.committedOutflows}
          operator="−"
        />
        <BreakdownRow
          label={t('dashboard.safeToSpend.moneyBoxFunding')}
          money={breakdown.moneyBoxFunding}
          operator="−"
        />
        <Separator />
        <BreakdownRow label={t('dashboard.safeToSpend.safeToSpend')} money={breakdown.safeToSpend} operator="=" />
        {hasExpectedIncome ? (
          <>
            <BreakdownRow
              label={t('dashboard.safeToSpend.expectedIncome')}
              money={breakdown.expectedIncome}
              operator="+"
            />
            <BreakdownRow
              label={t('dashboard.safeToSpend.safeToSpendWithIncome')}
              money={breakdown.safeToSpendWithIncome}
              operator="="
            />
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t('dashboard.safeToSpend.topUpcoming')}</h4>
        {breakdown.topUpcoming.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {breakdown.topUpcoming.map((item, index) => (
              <li
                key={`${item.kind}:${item.dueDate}:${item.name}:${index}`}
                className="flex items-start justify-between gap-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`dashboard.safeToSpend.kind.${item.kind}`)} · {formatIsoDate(item.dueDate, intlLocale)}
                  </p>
                </div>
                <Amount money={item.amount} variant="neutral" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('dashboard.safeToSpend.noUpcoming')}</p>
        )}
      </div>
    </section>
  );
}

function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function SafeToSpendSheet({
  breakdowns,
  onOpenChange,
  open,
}: {
  breakdowns: Array<SafeToSpendBreakdown> | undefined;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useI18n();

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('dashboard.safeToSpend.sheetTitle')}
      description={t('dashboard.safeToSpend.sheetDescription')}
    >
      {breakdowns === undefined ? (
        <SheetSkeleton />
      ) : breakdowns.length > 0 ? (
        <div className="flex flex-col gap-6">
          {breakdowns.map((breakdown, index) => (
            <div key={breakdown.currency} className="flex flex-col gap-6">
              {index > 0 ? <Separator /> : null}
              <BreakdownSection breakdown={breakdown} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('dashboard.safeToSpend.noData')}</p>
      )}
    </DetailSheet>
  );
}
