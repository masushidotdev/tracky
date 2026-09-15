import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { TransactionRow } from './columns';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';

export function MoneyBoxAssociationDialog({
  onOpenChange,
  open,
  transaction,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  transaction: TransactionRow | null;
}) {
  const { t } = useI18n();
  const [moneyBoxId, setMoneyBoxId] = React.useState<Id<'moneyBoxes'> | undefined>();
  const moneyBoxes = useQuery(api.banking.planning.listMoneyBoxes, open ? { status: 'active', limit: 100 } : 'skip');
  const associateTransfer = useMutation(api.banking.planning.associateTransferWithMoneyBox);
  const { isPending, run } = usePendingAction();
  const pendingKey = transaction ? `money-box-association:${transaction._id}` : 'money-box-association';
  const compatibleMoneyBoxes = React.useMemo(
    () =>
      (moneyBoxes ?? []).filter((moneyBox) => moneyBox.savedAmount.currency === transaction?.amount.currency),
    [moneyBoxes, transaction?.amount.currency],
  );

  React.useEffect(() => {
    if (!open) return;
    setMoneyBoxId(transaction?.transferPresentation?.moneyBoxId);
  }, [open, transaction?._id, transaction?.transferPresentation?.moneyBoxId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transaction || !moneyBoxId) return;

    const saved = await run(
      pendingKey,
      async () => {
        await associateTransfer({ transactionId: transaction._id, moneyBoxId });
      },
      {
        success: t('transactions.moneyBox.associated'),
        error: t('transactions.moneyBox.associationFailed'),
      },
    );
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('transactions.moneyBox.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {transaction
              ? t('transactions.moneyBox.dialogDescription', { description: transaction.description })
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form id="money-box-association-form" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="transactionMoneyBox">{t('planning.moneyBoxes.title')}</FieldLabel>
              <Select
                value={moneyBoxId}
                onValueChange={(value) => setMoneyBoxId(value as Id<'moneyBoxes'>)}
                disabled={moneyBoxes === undefined || compatibleMoneyBoxes.length === 0}
              >
                <SelectTrigger id="transactionMoneyBox">
                  <SelectValue placeholder={t('transactions.moneyBox.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {compatibleMoneyBoxes.map((moneyBox) => (
                      <SelectItem key={moneyBox._id} value={moneyBox._id}>
                        <span className="flex items-center gap-2">
                          <span>{moneyBox.name}</span>
                          <span className="text-muted-foreground">
                            <Amount money={moneyBox.savedAmount} variant="neutral" />
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          {moneyBoxes !== undefined && compatibleMoneyBoxes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t('transactions.moneyBox.noCompatible', { currency: transaction?.amount.currency ?? '' })}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="money-box-association-form"
            disabled={!transaction || !moneyBoxId || isPending(pendingKey)}
          >
            {isPending(pendingKey) ? <Spinner data-icon="inline-start" /> : null}
            {t('transactions.moneyBox.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
