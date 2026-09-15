import * as React from 'react';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { moneyAmountInputValue } from './helpers';
import { TransferSourceSelect } from './transfer-source-select';
import type { TransferSource } from './transfer-source-select';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { PlannedTransfer } from './helpers';
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
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

export function EditPlannedTransferDialog({
  accounts,
  onClose,
  transfer,
}: {
  accounts: Array<Doc<'financialAccounts'>> | undefined;
  onClose: () => void;
  transfer: PlannedTransfer | null;
}) {
  const { t } = useI18n();
  const updatePlannedTransfer = useMutation(api.banking.planning.updatePlannedTransfer);
  const { data: facilities } = useQuery(
    convexQuery(api.banking.credit.listCreditFacilities, { status: 'active', limit: 100 }),
  );
  const { isPending, run } = usePendingAction();

  const accountList = accounts ?? [];
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [scheduledDate, setScheduledDate] = React.useState('');
  const [source, setSource] = React.useState<TransferSource | undefined>();
  const [toAccountId, setToAccountId] = React.useState<Id<'financialAccounts'> | undefined>(undefined);

  React.useEffect(() => {
    if (!transfer) {
      return;
    }

    setName(transfer.name);
    setDescription(transfer.description ?? '');
    setAmount(moneyAmountInputValue(transfer.amount));
    setScheduledDate(transfer.scheduledDate);
    setSource(
      transfer.fromCreditFacilityId
        ? { kind: 'facility', id: transfer.fromCreditFacilityId }
        : transfer.fromAccountId
          ? { kind: 'account', id: transfer.fromAccountId }
          : undefined,
    );
    setToAccountId(transfer.toAccountId);
  }, [transfer]);

  const cardFacilities = (facilities ?? []).filter(
    (facility) => facility.facilityType === 'cardCreditLine' && facility.status === 'active',
  );
  const fromAccount = source?.kind === 'account' ? accountList.find((account) => account._id === source.id) : undefined;
  const fromFacility =
    source?.kind === 'facility' ? cardFacilities.find((facility) => facility._id === source.id) : undefined;
  const currency = fromAccount?.currency ?? fromFacility?.limitAmount.currency;
  const isSameAccount = Boolean(fromAccount && toAccountId === fromAccount._id);
  const canSubmit =
    Boolean(transfer) &&
    Boolean(name.trim()) &&
    Boolean(amount.trim()) &&
    Boolean(scheduledDate) &&
    Boolean(source) &&
    Boolean(toAccountId) &&
    Boolean(currency) &&
    !isSameAccount;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transfer || !source || !toAccountId || !currency) {
      return;
    }

    const updated = await run(
      `planned-transfer-edit:${transfer._id}`,
      async () => {
        await updatePlannedTransfer({
          plannedTransferId: transfer._id,
          name,
          description: description.trim() ? description : undefined,
          amount: {
            amountMinor: parseMoneyMinor(amount, currency),
            currency,
          },
          scheduledDate,
          ...(source.kind === 'account' ? { fromAccountId: source.id } : { fromCreditFacilityId: source.id }),
          toAccountId,
        });
      },
      {
        success: t('planning.transfers.updated'),
        error: t('planning.transfers.updateFailed'),
      },
    );

    if (updated) {
      onClose();
    }
  }

  return (
    <Dialog
      open={transfer !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('planning.transfers.editTitle')}</DialogTitle>
          <DialogDescription>{t('planning.transfers.editDescription')}</DialogDescription>
        </DialogHeader>
        <form id="edit-planned-transfer-form" onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="editPlannedTransferName">{t('common.name')}</FieldLabel>
              <Input
                id="editPlannedTransferName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('planning.transferForm.namePlaceholder')}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="editPlannedTransferAmount">{t('common.amount')}</FieldLabel>
              <Input
                id="editPlannedTransferAmount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="500.00"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="editPlannedTransferDescription">{t('planning.form.note')}</FieldLabel>
              <Input
                id="editPlannedTransferDescription"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('planning.form.notePlaceholder')}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="editPlannedTransferDate">{t('planning.form.dueDate')}</FieldLabel>
              <Input
                id="editPlannedTransferDate"
                type="date"
                value={scheduledDate}
                onChange={(event) => setScheduledDate(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="editPlannedTransferFrom">{t('planning.transferForm.fromAccount')}</FieldLabel>
              <TransferSourceSelect
                accounts={accountList}
                facilities={cardFacilities}
                id="editPlannedTransferFrom"
                source={source}
                onSourceChange={setSource}
              />
              {source?.kind === 'facility' ? (
                <FieldDescription>{t('planning.transferForm.cardSourceHint')}</FieldDescription>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="editPlannedTransferTo">{t('planning.transferForm.toAccount')}</FieldLabel>
              <Select value={toAccountId} onValueChange={(value) => setToAccountId(value as Id<'financialAccounts'>)}>
                <SelectTrigger id="editPlannedTransferTo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {accountList.map((account) => (
                      <SelectItem key={account._id} value={account._id}>
                        {accountLabel(account)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {isSameAccount ? <p className="text-sm text-destructive">{t('planning.transferForm.sameAccount')}</p> : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="submit" form="edit-planned-transfer-form" disabled={!canSubmit || isPending(`planned-transfer-edit:${transfer?._id}`)}>
            {isPending(`planned-transfer-edit:${transfer?._id}`) ? <Spinner data-icon="inline-start" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
