import type { Money } from '@/lib/money';
import { HIDDEN_AMOUNT_PLACEHOLDER } from '@/lib/balance-privacy';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

type AmountProps = {
  money: Money;
  variant?: 'signed' | 'balance' | 'neutral';
  direction?: string;
  className?: string;
  /**
   * Balances and derived figures are masked while the privacy toggle is on. Only the amount of an
   * individual transaction opts out, so anything new is protected by default.
   */
  sensitive?: boolean;
};

export function Amount({ money, variant = 'neutral', direction, className, sensitive = true }: AmountProps) {
  const { intlLocale, t } = useI18n();
  const { hidden } = useBalancePrivacy();

  if (sensitive && hidden) {
    // The sign and the negative color would leak the shape of a masked figure, so they go too.
    return (
      <span
        className={cn('tabular-nums text-muted-foreground select-none', className)}
        aria-label={t('privacy.hiddenAmount')}
      >
        {HIDDEN_AMOUNT_PLACEHOLDER}
      </span>
    );
  }

  if (variant === 'signed') {
    const isDebit = direction === 'DBIT';
    return (
      <span className={cn('tabular-nums', isDebit ? 'text-foreground' : 'text-positive', className)}>
        {isDebit ? '−' : '+'}
        {formatMoney(money, intlLocale)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'tabular-nums',
        variant === 'balance' && money.amountMinor < 0n ? 'text-destructive' : undefined,
        className,
      )}
    >
      {formatMoney(money, intlLocale)}
    </span>
  );
}
