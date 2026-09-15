import * as React from 'react';
import { useMutation } from 'convex/react';
import { TriangleAlertIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { Alert, AlertTitle } from '@/components/ui/alert';
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { accountLabel } from '@/lib/accounts';
import { categoryDisplayName } from '@/lib/categories';
import { formatIsoDate } from '@/lib/format';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';
import { moneyInputValue, parseMoneyMinor } from '@/lib/money';

export function CounterpartTransferDialog({
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
  const { intlLocale, t } = useI18n();
  const createCounterpartTransfer = useMutation(api.banking.manualTransactions.createCounterpartTransfer);
  const { isPending, run } = usePendingAction();
  const pendingKey = transaction ? `counterpart-transfer:${transaction._id}` : 'counterpart-transfer';

  const sourceAccount = accounts.find((account) => account._id === transaction?.accountId);
  const compatibleAccounts = React.useMemo(() => {
    if (!transaction) return [];
    return accounts.filter(
      (account) =>
        account.provider === 'manual' &&
        account.status === 'active' &&
        account.currency === transaction.amount.currency &&
        account._id !== transaction.accountId,
    );
  }, [accounts, transaction]);
  const transferCategories = React.useMemo(
    () => categories.filter((category) => category.kind === 'transfer'),
    [categories],
  );

  const [accountId, setAccountId] = React.useState<string>('');
  const [amount, setAmount] = React.useState('');
  const [bookingDate, setBookingDate] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [counterpartyName, setCounterpartyName] = React.useState('');
  const [categoryId, setCategoryId] = React.useState<string>('none');

  React.useEffect(() => {
    if (!open || !transaction) return;
    setAccountId(compatibleAccounts.at(0)?._id ?? '');
    setAmount(moneyInputValue(transaction.amount));
    setBookingDate(transaction.bookingDate);
    setDescription(transaction.description);
    setCounterpartyName('');
    setCategoryId('none');
  }, [compatibleAccounts, open, transaction]);

  const selectedAccount = compatibleAccounts.find((account) => account._id === accountId);
  // The new leg always faces the opposite direction of the source transaction.
  const direction = transaction?.direction === 'CRDT' ? 'DBIT' : 'CRDT';

  const parsedAmountMinor = React.useMemo(() => {
    if (!selectedAccount || !amount.trim()) return null;
    try {
      return parseMoneyMinor(amount, selectedAccount.currency);
    } catch {
      return null;
    }
  }, [amount, selectedAccount]);

  const amountDiffers = Boolean(
    transaction && parsedAmountMinor !== null && parsedAmountMinor !== transaction.amount.amountMinor,
  );

  const canSubmit =
    Boolean(
      transaction &&
      selectedAccount &&
      parsedAmountMinor !== null &&
      parsedAmountMinor > 0n &&
      bookingDate &&
      description.trim(),
    ) && !isPending(pendingKey);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transaction || !selectedAccount || parsedAmountMinor === null) return;

    const saved = await run(
      pendingKey,
      async () => {
        await createCounterpartTransfer({
          sourceTransactionId: transaction._id,
          accountId: selectedAccount._id,
          amount: { amountMinor: parsedAmountMinor, currency: selectedAccount.currency },
          bookingDate,
          description: description.trim(),
          counterpartyName: counterpartyName.trim() || undefined,
          categoryId: categoryId === 'none' ? undefined : (categoryId as Id<'categories'>),
        });
      },
      {
        success: t('transactions.counterpart.created'),
        error: t('transactions.counterpart.failed'),
      },
    );
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('transactions.counterpart.title')}</DialogTitle>
          <DialogDescription>{t('transactions.counterpart.description')}</DialogDescription>
        </DialogHeader>
        {transaction ? (
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">{t('transactions.counterpart.sourceLabel')}</div>
            <div className="text-muted-foreground">{accountLabel(sourceAccount)}</div>
            <div className="truncate text-muted-foreground">{transaction.description}</div>
            <div className="mt-1 flex items-center gap-2">
              <Amount variant="signed" direction={transaction.direction} money={transaction.amount} sensitive={false} />
              <span className="text-muted-foreground">{formatIsoDate(transaction.bookingDate, intlLocale)}</span>
            </div>
          </div>
        ) : null}
        {compatibleAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('transactions.counterpart.noCompatibleAccounts')}</p>
        ) : (
          <form id="counterpart-transfer-form" onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="counterpartAccount">{t('transactions.counterpart.account')}</FieldLabel>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="counterpartAccount" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {compatibleAccounts.map((account) => (
                        <SelectItem key={account._id} value={account._id}>
                          {accountLabel(account)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('transactions.counterpart.directionLabel')}</FieldLabel>
                <p className="text-sm text-muted-foreground">
                  {direction === 'DBIT'
                    ? t('transactions.counterpart.directionOut')
                    : t('transactions.counterpart.directionIn')}
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="counterpartAmount">
                  {t('transactions.counterpart.amount')}
                  {selectedAccount ? ` (${selectedAccount.currency})` : ''}
                </FieldLabel>
                <Input
                  id="counterpartAmount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                {amountDiffers ? (
                  <p className="text-sm text-muted-foreground">{t('transactions.counterpart.amountDeltaWarning')}</p>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="counterpartDate">{t('transactions.counterpart.date')}</FieldLabel>
                <Input
                  id="counterpartDate"
                  type="date"
                  value={bookingDate}
                  onChange={(event) => setBookingDate(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="counterpartDescription">
                  {t('transactions.counterpart.descriptionLabel')}
                </FieldLabel>
                <Input
                  id="counterpartDescription"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="counterpartCounterparty">
                  {t('transactions.counterpart.counterpartyLabel')}
                </FieldLabel>
                <Input
                  id="counterpartCounterparty"
                  value={counterpartyName}
                  onChange={(event) => setCounterpartyName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="counterpartCategory">{t('transactions.counterpart.category')}</FieldLabel>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="counterpartCategory" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">{t('transactions.category.none')}</SelectItem>
                    </SelectGroup>
                    {transferCategories.length > 0 ? (
                      <SelectGroup>
                        {transferCategories.map((category) => (
                          <SelectItem key={category._id} value={category._id}>
                            {categoryDisplayName(category, t)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                  </SelectContent>
                </Select>
              </Field>
              {selectedAccount && parsedAmountMinor !== null && parsedAmountMinor > 0n ? (
                <div className="rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <span>{accountLabel(selectedAccount)}</span>
                    <Amount
                      variant="signed"
                      direction={direction}
                      money={{ amountMinor: parsedAmountMinor, currency: selectedAccount.currency }}
                      sensitive={false}
                    />
                  </div>
                  <div className="mt-1 text-muted-foreground">{t('transactions.counterpart.effect')}</div>
                </div>
              ) : null}
              {selectedAccount?.accountType === 'CARD' && direction === 'CRDT' ? (
                <Alert>
                  <TriangleAlertIcon />
                  <AlertTitle>{t('transactions.counterpart.cardWarning')}</AlertTitle>
                </Alert>
              ) : null}
            </FieldGroup>
          </form>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {compatibleAccounts.length > 0 ? (
            <Button type="submit" form="counterpart-transfer-form" disabled={!canSubmit}>
              {isPending(pendingKey) ? <Spinner data-icon="inline-start" /> : null}
              {t('transactions.counterpart.submit')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
