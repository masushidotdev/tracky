import * as React from 'react';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { accountLabel } from '@/lib/accounts';
import { categoryDisplayName } from '@/lib/categories';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';
import { moneyInputValue, parseMoneyMinor } from '@/lib/money';

/**
 * Editing only. New movements are typed straight into the ledger's editor row
 * (`inline-transaction-editor.tsx`); a second create path here would drift from it.
 */
export function ManualTransactionDialog({
  accounts,
  categories,
  onOpenChange,
  open,
  transaction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Array<Doc<'financialAccounts'>>;
  categories: Array<Doc<'categories'>>;
  transaction: Doc<'transactions'> | null;
}) {
  const { t } = useI18n();
  const updateManualTransaction = useMutation(api.banking.manualTransactions.updateManualTransaction);
  const { isPending, run } = usePendingAction();
  const pendingKey = transaction ? `manual-transaction-edit:${transaction._id}` : 'manual-transaction-edit';

  const [direction, setDirection] = React.useState<'CRDT' | 'DBIT'>('DBIT');
  const [amount, setAmount] = React.useState('');
  const [bookingDate, setBookingDate] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [counterpartyName, setCounterpartyName] = React.useState('');
  const [categoryId, setCategoryId] = React.useState<string>('none');

  React.useEffect(() => {
    if (!open || !transaction) return;
    setDirection(transaction.direction);
    setAmount(moneyInputValue(transaction.amount));
    setBookingDate(transaction.bookingDate);
    setDescription(transaction.description);
    setCounterpartyName(transaction.counterpartyName ?? '');
    setCategoryId(transaction.categoryId ?? 'none');
  }, [open, transaction]);

  // A scheduled row can sit on a linked account, so the account is looked up among all of them.
  const selectedAccount = accounts.find((account) => account._id === transaction?.accountId);
  const canSubmit =
    Boolean(selectedAccount && amount.trim() && bookingDate && description.trim()) && !isPending(pendingKey);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transaction || !selectedAccount) return;
    const saved = await run(
      pendingKey,
      async () => {
        await updateManualTransaction({
          transactionId: transaction._id,
          direction,
          amount: {
            amountMinor: parseMoneyMinor(amount, selectedAccount.currency),
            currency: selectedAccount.currency,
          },
          bookingDate,
          description: description.trim(),
          counterpartyName: counterpartyName.trim() || undefined,
          categoryId: categoryId === 'none' ? undefined : (categoryId as Id<'categories'>),
        });
      },
      {
        success: t('transactions.manual.updated'),
        error: t('transactions.manual.saveFailed'),
      },
    );
    if (saved) onOpenChange(false);
  }

  const categoriesByKind = (kind: Doc<'categories'>['kind']) => categories.filter((category) => category.kind === kind);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('transactions.manual.formTitle.edit')}</DialogTitle>
          <DialogDescription>{t('transactions.manual.formDescription')}</DialogDescription>
        </DialogHeader>
        {!transaction ? null : (
          <form id="manual-transaction-form" onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel>{t('transactions.table.account')}</FieldLabel>
                <p className="text-sm text-muted-foreground">{accountLabel(selectedAccount ?? null)}</p>
              </Field>
              <Field>
                <FieldLabel htmlFor="manualTransactionDirection">{t('transactions.manual.directionLabel')}</FieldLabel>
                <Select value={direction} onValueChange={(value) => setDirection(value as 'CRDT' | 'DBIT')}>
                  <SelectTrigger id="manualTransactionDirection" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="DBIT">{t('transactions.manual.directionOut')}</SelectItem>
                      <SelectItem value="CRDT">{t('transactions.manual.directionIn')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="manualTransactionAmount">
                  {t('common.amount')}
                  {selectedAccount ? ` (${selectedAccount.currency})` : ''}
                </FieldLabel>
                <Input
                  id="manualTransactionAmount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="manualTransactionDate">{t('transactions.table.date')}</FieldLabel>
                <Input
                  id="manualTransactionDate"
                  type="date"
                  value={bookingDate}
                  onChange={(event) => setBookingDate(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="manualTransactionDescription">{t('transactions.table.description')}</FieldLabel>
                <Input
                  id="manualTransactionDescription"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="manualTransactionCounterparty">
                  {t('transactions.manual.counterpartyLabel')}
                </FieldLabel>
                <Input
                  id="manualTransactionCounterparty"
                  value={counterpartyName}
                  onChange={(event) => setCounterpartyName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="manualTransactionCategory">{t('transactions.table.category')}</FieldLabel>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="manualTransactionCategory" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">{t('transactions.category.none')}</SelectItem>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{t('transactions.category.expenses')}</SelectLabel>
                      {categoriesByKind('expense').map((category) => (
                        <SelectItem key={category._id} value={category._id}>
                          {categoryDisplayName(category, t)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{t('transactions.category.incomes')}</SelectLabel>
                      {categoriesByKind('income').map((category) => (
                        <SelectItem key={category._id} value={category._id}>
                          {categoryDisplayName(category, t)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>{t('transactions.category.transfers')}</SelectLabel>
                      {categoriesByKind('transfer').map((category) => (
                        <SelectItem key={category._id} value={category._id}>
                          {categoryDisplayName(category, t)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </form>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {transaction ? (
            <Button type="submit" form="manual-transaction-form" disabled={!canSubmit}>
              {isPending(pendingKey) ? <Spinner data-icon="inline-start" /> : null}
              {t('common.save')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
