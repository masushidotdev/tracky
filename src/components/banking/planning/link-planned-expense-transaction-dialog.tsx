import * as React from 'react';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { formatIsoDateLabel } from './helpers';
import type { Id } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';

export function LinkPlannedExpenseTransactionDialog({
  dueDate,
  onOpenChange,
  open,
  plannedExpenseId,
}: {
  dueDate: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  plannedExpenseId: Id<'plannedTransactions'>;
}) {
  const { intlLocale, t } = useI18n();
  const [selectedTransactionId, setSelectedTransactionId] = React.useState('');
  const { isPending, run } = usePendingAction();
  const linkTransaction = useMutation(api.banking.planning.linkPlannedExpenseOccurrenceTransaction);
  const candidatesQuery = convexQuery(api.banking.planning.listPlannedExpensePaymentCandidates, {
    plannedExpenseId,
    dueDate,
    limit: 20,
  });
  const { data: candidates } = useQuery({
    ...candidatesQuery,
    enabled: open,
  });

  React.useEffect(() => {
    if (!open) {
      setSelectedTransactionId('');
    }
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTransactionId) {
      return;
    }

    const linked = await run(
      `planned-expense-link:${plannedExpenseId}:${dueDate}`,
      async () => {
        await linkTransaction({
          plannedExpenseId,
          dueDate,
          transactionId: selectedTransactionId as Id<'transactions'>,
        });
      },
      {
        success: t('planning.expenses.transactionLinked'),
        error: t('planning.expenses.transactionLinkFailed'),
      },
    );
    if (linked) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('planning.expenses.linkTransactionTitle')}</DialogTitle>
          <DialogDescription>
            {t('planning.expenses.linkTransactionDescription', {
              date: formatIsoDateLabel(dueDate, intlLocale),
            })}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-6" onSubmit={submit}>
          {candidates === undefined ? (
            <div className="flex min-h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : candidates.length === 0 ? (
            <EmptyState className="p-4" title={t('planning.expenses.noTransactionCandidates')} />
          ) : (
            <RadioGroup value={selectedTransactionId} onValueChange={setSelectedTransactionId}>
              <FieldGroup className="max-h-80 gap-3 overflow-y-auto">
                {candidates.map((transaction) => {
                  const inputId = `planned-expense-transaction-${transaction._id}`;
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
                        <Amount
                          money={transaction.amount}
                          variant="signed"
                          direction={transaction.direction}
                          sensitive={false}
                        />
                      </FieldLabel>
                    </Field>
                  );
                })}
              </FieldGroup>
            </RadioGroup>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!selectedTransactionId || isPending()}>
              {isPending() ? <Spinner data-icon="inline-start" /> : null}
              {t('planning.expenses.linkTransactionConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
