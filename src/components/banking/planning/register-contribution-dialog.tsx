import * as React from 'react';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { formatIsoDateLabel, moneyAmountInputValue } from './helpers';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { Money } from '@/lib/money';
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
import { Field, FieldContent, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

export function RegisterContributionDialog({
  funding,
  mode,
  moneyBox,
  onOpenChange,
  open,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moneyBox: Doc<'moneyBoxes'> | null;
  funding?: { suggestedAmount?: Money };
  mode: 'quick' | 'transaction';
}) {
  const { intlLocale, t } = useI18n();
  const [amount, setAmount] = React.useState('');
  const [contributionDate, setContributionDate] = React.useState('');
  const [selectedTransactionId, setSelectedTransactionId] = React.useState('none');
  const addContribution = useMutation(api.banking.planning.addMoneyBoxContribution);
  const { isPending, run } = usePendingAction();
  const transactionsQuery = convexQuery(api.banking.transactions.listRecentTransactions, {
    accountId: moneyBox?.accountId,
    limit: 30,
  });
  const { data: transactions } = useQuery({ ...transactionsQuery, enabled: open && Boolean(moneyBox?.accountId) });
  const pendingKey = moneyBox ? `money-box-contribution:${moneyBox._id}` : 'money-box-contribution';

  React.useEffect(() => {
    if (!open) return;
    setAmount(funding?.suggestedAmount ? moneyAmountInputValue(funding.suggestedAmount) : '');
    setContributionDate(new Date().toISOString().slice(0, 10));
    setSelectedTransactionId('none');
  }, [funding?.suggestedAmount, moneyBox?._id, open]);

  function selectTransaction(value: string) {
    setSelectedTransactionId(value);
    const transaction = transactions?.find((candidate) => candidate._id === value);
    if (transaction) {
      setAmount(moneyAmountInputValue({
        amountMinor: transaction.amount.amountMinor < 0n ? -transaction.amount.amountMinor : transaction.amount.amountMinor,
        currency: transaction.amount.currency,
      }));
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moneyBox) return;
    const recorded = await run(
      pendingKey,
      async () => {
        await addContribution({
          moneyBoxId: moneyBox._id,
          amount: {
            amountMinor: parseMoneyMinor(amount, moneyBox.targetAmount.currency),
            currency: moneyBox.targetAmount.currency,
          },
          contributionDate,
          transactionId:
            selectedTransactionId === 'none' ? undefined : (selectedTransactionId as Id<'transactions'>),
        });
      },
      {
        success: t('planning.moneyBoxes.contributionRecorded'),
        error: t('planning.moneyBoxes.contributionFailed'),
      },
    );
    if (recorded) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('planning.moneyBoxes.registerContribution')}</DialogTitle>
          <DialogDescription>{moneyBox?.name ?? ''}</DialogDescription>
        </DialogHeader>
        <form id="money-box-contribution-form" className="flex flex-col gap-6" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="moneyBoxContributionAmount">{t('common.amount')}</FieldLabel>
              <Input
                id="moneyBoxContributionAmount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="moneyBoxContributionDate">{t('planning.moneyBoxes.contributionDate')}</FieldLabel>
              <Input
                id="moneyBoxContributionDate"
                type="date"
                value={contributionDate}
                onChange={(event) => setContributionDate(event.target.value)}
              />
            </Field>
          </FieldGroup>
          {moneyBox?.accountId ? (
            <div className={mode === 'transaction' ? 'flex flex-col gap-3' : 'flex flex-col gap-2'}>
              <div className="text-sm font-medium">{t('planning.moneyBoxes.linkedTransaction')}</div>
              {transactions === undefined ? (
                <div className="flex min-h-20 items-center justify-center"><Spinner /></div>
              ) : (
                <RadioGroup value={selectedTransactionId} onValueChange={selectTransaction}>
                  <FieldGroup className="max-h-64 gap-3 overflow-y-auto">
                    <Field orientation="horizontal">
                      <RadioGroupItem id="money-box-transaction-none" value="none" />
                      <FieldLabel htmlFor="money-box-transaction-none">
                        <FieldTitle>{t('planning.moneyBoxes.noTransaction')}</FieldTitle>
                      </FieldLabel>
                    </Field>
                    {transactions.map((transaction) => {
                      const inputId = `money-box-transaction-${transaction._id}`;
                      return (
                        <Field key={transaction._id} orientation="horizontal">
                          <RadioGroupItem id={inputId} value={transaction._id} />
                          <FieldLabel htmlFor={inputId}>
                            <FieldContent>
                              <FieldTitle>{transaction.counterpartyName ?? transaction.description}</FieldTitle>
                              <span className="text-sm text-muted-foreground">
                                {formatIsoDateLabel(transaction.bookingDate, intlLocale)}
                              </span>
                            </FieldContent>
                            <Amount money={transaction.amount} variant="signed" direction={transaction.direction} />
                          </FieldLabel>
                        </Field>
                      );
                    })}
                  </FieldGroup>
                </RadioGroup>
              )}
            </div>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            type="submit"
            form="money-box-contribution-form"
            disabled={!moneyBox || !amount.trim() || !contributionDate || isPending(pendingKey)}
          >
            {isPending(pendingKey) ? <Spinner data-icon="inline-start" /> : null}
            {t('common.record')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
