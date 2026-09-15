import * as React from 'react';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import type { SyncOverviewRow } from './account-row';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { accountLabel } from '@/lib/accounts';
import { useI18n } from '@/lib/i18n';
import { moneyInputValue, parseMoneyMinor } from '@/lib/money';

export function UpdateBalanceDialog({
  onOpenChange,
  open,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: SyncOverviewRow | null;
}) {
  const { intlLocale, t } = useI18n();
  const setManualAccountBalance = useMutation(api.banking.manualAccounts.setManualAccountBalance);
  const { isPending, run } = usePendingAction();
  const [amount, setAmount] = React.useState('');
  const [referenceDate, setReferenceDate] = React.useState('');
  const pendingKey = row ? `manual-balance:${row.account._id}` : 'manual-balance';

  React.useEffect(() => {
    if (!open || !row) return;
    setAmount(row.latestBalance ? moneyInputValue(row.latestBalance.amount) : '');
    setReferenceDate(row.latestBalance?.referenceDate ?? new Date().toISOString().slice(0, 10));
  }, [open, row]);

  const canSubmit = Boolean(row && amount.trim() && referenceDate) && !isPending(pendingKey);
  let showPositiveCardWarning = false;
  if (row?.account.accountType === 'CARD' && amount.trim()) {
    try {
      showPositiveCardWarning = parseMoneyMinor(amount, row.account.currency, intlLocale) > 0n;
    } catch {
      // The submit flow reports malformed amounts; the warning only covers valid positive values.
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row) return;

    const saved = await run(
      pendingKey,
      async () => {
        await setManualAccountBalance({
          accountId: row.account._id,
          amount: {
            amountMinor: parseMoneyMinor(amount, row.account.currency, intlLocale),
            currency: row.account.currency,
          },
          referenceDate,
        });
      },
      {
        success: t('accounts.balance.updated'),
        error: t('accounts.balance.updateFailed'),
      },
    );
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('accounts.balance.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {row ? t('accounts.balance.dialogDescription', { account: accountLabel(row.account) }) : ''}
          </DialogDescription>
        </DialogHeader>
        <form id="update-balance-form" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="manualAccountBalance">
                {t('common.amount')}
                {row ? ` (${row.account.currency})` : ''}
              </FieldLabel>
              <Input
                id="manualAccountBalance"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              {showPositiveCardWarning ? (
                <FieldDescription className="text-warning">
                  {t('accounts.balance.positiveCardWarning')}
                </FieldDescription>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="manualAccountBalanceDate">{t('accounts.balance.referenceDate')}</FieldLabel>
              <Input
                id="manualAccountBalanceDate"
                type="date"
                value={referenceDate}
                onChange={(event) => setReferenceDate(event.target.value)}
              />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="update-balance-form" disabled={!canSubmit}>
            {isPending(pendingKey) ? <Spinner data-icon="inline-start" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
