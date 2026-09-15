import * as React from 'react';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { moneyAmountInputValue } from './helpers';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { Money } from '@/lib/money';
import { accountLabel } from '@/lib/accounts';
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

export type MoneyBoxPrefill = {
  name: string;
  targetAmount: Money;
  targetDate: string;
  plannedExpenseId: Id<'plannedTransactions'>;
  accountId?: Id<'financialAccounts'>;
};

export function MoneyBoxFormDialog({
  accounts,
  moneyBox,
  onOpenChange,
  open,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Array<Doc<'financialAccounts'>> | undefined;
  moneyBox?: Doc<'moneyBoxes'> | null;
  prefill?: MoneyBoxPrefill | null;
}) {
  const { t } = useI18n();
  const createMoneyBox = useMutation(api.banking.planning.createMoneyBox);
  const updateMoneyBox = useMutation(api.banking.planning.updateMoneyBox);
  const { isPending, run } = usePendingAction();
  const [name, setName] = React.useState('');
  const [targetAmount, setTargetAmount] = React.useState('');
  const [targetDate, setTargetDate] = React.useState('');
  const [accountId, setAccountId] = React.useState<string>('none');
  const [heldOutsideBalance, setHeldOutsideBalance] = React.useState(false);
  const accountList = accounts ?? [];
  const isEditing = Boolean(moneyBox);
  const pendingKey = moneyBox ? `money-box-edit:${moneyBox._id}` : 'money-box-create';

  React.useEffect(() => {
    if (!open) return;
    setName(moneyBox?.name ?? prefill?.name ?? '');
    setTargetAmount(
      moneyBox
        ? moneyAmountInputValue(moneyBox.targetAmount)
        : prefill
          ? moneyAmountInputValue(prefill.targetAmount)
          : '',
    );
    setTargetDate(moneyBox?.targetDate ?? prefill?.targetDate ?? '');
    setAccountId(moneyBox?.accountId ?? prefill?.accountId ?? 'none');
    setHeldOutsideBalance(moneyBox?.heldOutsideBalance ?? false);
  }, [moneyBox, open, prefill]);

  const selectedAccount = accountList.find((account) => account._id === accountId);
  const currency = selectedAccount
    ? selectedAccount.currency
    : moneyBox
      ? moneyBox.targetAmount.currency
      : prefill
        ? prefill.targetAmount.currency
        : (accountList[0]?.currency ?? 'EUR');
  const canSubmit = Boolean(name.trim() && targetAmount.trim() && targetDate) && !isPending(pendingKey);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = {
      name,
      targetAmount: { amountMinor: parseMoneyMinor(targetAmount, currency), currency },
      targetDate,
      accountId: accountId === 'none' ? undefined : (accountId as Id<'financialAccounts'>),
      heldOutsideBalance,
    };
    const saved = await run(
      pendingKey,
      async () => {
        if (moneyBox) {
          await updateMoneyBox({ moneyBoxId: moneyBox._id, ...values });
        } else {
          await createMoneyBox({ ...values, plannedExpenseId: prefill?.plannedExpenseId });
        }
      },
      {
        success: t(moneyBox ? 'planning.moneyBoxes.updated' : 'planning.moneyBoxes.created'),
        error: t('planning.moneyBoxes.saveFailed'),
      },
    );
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? 'planning.moneyBoxes.formTitle.edit' : 'planning.moneyBoxes.formTitle.create')}
          </DialogTitle>
          <DialogDescription>{t('planning.moneyBoxes.formDescription')}</DialogDescription>
        </DialogHeader>
        <form id="money-box-form" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="moneyBoxName">{t('common.name')}</FieldLabel>
              <Input id="moneyBoxName" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="moneyBoxTargetAmount">{t('common.amount')}</FieldLabel>
              <Input
                id="moneyBoxTargetAmount"
                inputMode="decimal"
                value={targetAmount}
                onChange={(event) => setTargetAmount(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="moneyBoxTargetDate">{t('planning.moneyBoxes.targetDateLabel')}</FieldLabel>
              <Input
                id="moneyBoxTargetDate"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="moneyBoxAccount">{t('planning.moneyBoxes.account')}</FieldLabel>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="moneyBoxAccount" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">{t('planning.moneyBoxes.noAccount')}</SelectItem>
                    {accountList.map((account) => (
                      <SelectItem key={account._id} value={account._id}>
                        {accountLabel(account)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal">
              <div className="flex flex-1 flex-col gap-1">
                <FieldLabel htmlFor="moneyBoxHeldOutsideBalance">
                  {t('planning.moneyBoxes.heldOutsideBalance')}
                </FieldLabel>
                <FieldDescription>{t('planning.moneyBoxes.heldOutsideBalanceDescription')}</FieldDescription>
              </div>
              <Switch
                id="moneyBoxHeldOutsideBalance"
                checked={heldOutsideBalance}
                onCheckedChange={setHeldOutsideBalance}
              />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="money-box-form" disabled={!canSubmit}>
            {isPending(pendingKey) ? <Spinner data-icon="inline-start" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
