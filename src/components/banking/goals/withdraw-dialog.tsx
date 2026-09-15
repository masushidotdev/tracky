import * as React from 'react';

import type { Doc } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

export function WithdrawDialog({
  moneyBox,
  onOpenChange,
  onSubmit,
  open,
  pending,
}: {
  moneyBox: Doc<'moneyBoxes'> | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { amountMinor: bigint; withdrawalDate: string }) => Promise<boolean>;
  open: boolean;
  pending: boolean;
}) {
  const { intlLocale, t } = useI18n();
  const [amount, setAmount] = React.useState('');
  const [withdrawalDate, setWithdrawalDate] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setAmount('');
    setWithdrawalDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }, [moneyBox?._id, open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moneyBox) return;

    let amountMinor: bigint;
    try {
      amountMinor = parseMoneyMinor(amount, moneyBox.savedAmount.currency, intlLocale);
    } catch {
      setError(t('goals.saveUp.withdraw.errors.invalid'));
      return;
    }
    if (amountMinor <= 0n) {
      setError(t('goals.saveUp.withdraw.errors.positive'));
      return;
    }
    if (amountMinor > moneyBox.savedAmount.amountMinor) {
      setError(t('goals.saveUp.withdraw.errors.over'));
      return;
    }

    setError(null);
    await onSubmit({ amountMinor, withdrawalDate });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('goals.saveUp.withdraw.title')}</DialogTitle>
          <DialogDescription>{moneyBox?.name ?? ''}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-xl bg-muted p-4">
          <span className="text-sm text-muted-foreground">{t('goals.saveUp.withdraw.available')}</span>
          {moneyBox ? <Amount money={moneyBox.savedAmount} variant="neutral" className="font-medium" /> : null}
        </div>
        <form id="goal-withdraw-form" onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="goal-withdraw-amount">{t('common.amount')}</FieldLabel>
              <Input
                id="goal-withdraw-amount"
                aria-invalid={Boolean(error)}
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError(null);
                }}
              />
              <FieldDescription>
                {moneyBox ? t('goals.saveUp.withdraw.currencyHint', { currency: moneyBox.savedAmount.currency }) : ''}
              </FieldDescription>
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="goal-withdraw-date">{t('goals.saveUp.withdraw.date')}</FieldLabel>
              <Input
                id="goal-withdraw-date"
                type="date"
                value={withdrawalDate}
                onChange={(event) => setWithdrawalDate(event.target.value)}
              />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="goal-withdraw-form"
            disabled={!moneyBox || !amount.trim() || !withdrawalDate || pending}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {t('goals.saveUp.withdraw.record')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
