import * as React from 'react';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { TransferSourceSelect } from './transfer-source-select';
import type { TransferSource } from './transfer-source-select';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { accountLabel } from '@/lib/accounts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

export function CreatePlannedTransferForm({
  accounts,
  initialAccountId,
  onCreated,
}: {
  accounts: Array<Doc<'financialAccounts'>> | undefined;
  initialAccountId?: Id<'financialAccounts'>;
  onCreated?: () => void;
}) {
  const { t } = useI18n();
  const { data: facilities } = useQuery(
    convexQuery(api.banking.credit.listCreditFacilities, { status: 'active', limit: 100 }),
  );
  const createPlannedTransfer = useMutation(api.banking.planning.createPlannedTransfer);
  const { isPending, run } = usePendingAction();

  const accountList = accounts ?? [];
  const cardFacilities = (facilities ?? []).filter(
    (facility) => facility.facilityType === 'cardCreditLine' && facility.status === 'active',
  );
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [scheduledDate, setScheduledDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = React.useState<TransferSource | undefined>(
    initialAccountId ? { kind: 'account', id: initialAccountId } : undefined,
  );
  const [toAccountId, setToAccountId] = React.useState<Id<'financialAccounts'> | undefined>();

  const sourceAccount = source?.kind === 'account' ? accountList.find((account) => account._id === source.id) : undefined;
  const sourceFacility =
    source?.kind === 'facility' ? cardFacilities.find((facility) => facility._id === source.id) : undefined;
  const isSameAccount = Boolean(sourceAccount && toAccountId === sourceAccount._id);
  const currency = sourceAccount?.currency ?? sourceFacility?.limitAmount.currency;
  const canSubmit =
    Boolean(name.trim()) &&
    Boolean(amount.trim()) &&
    Boolean(scheduledDate) &&
    Boolean(source) &&
    Boolean(toAccountId) &&
    Boolean(currency) &&
    !isSameAccount;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source || !toAccountId || !currency) {
      return;
    }
    const created = await run(
      'planned-transfer-create',
      async () => {
        await createPlannedTransfer({
          name,
          description: description.trim() ? description : undefined,
          amount: { amountMinor: parseMoneyMinor(amount, currency), currency },
          scheduledDate,
          ...(source.kind === 'account' ? { fromAccountId: source.id } : { fromCreditFacilityId: source.id }),
          toAccountId,
        });
        trackEvent(analyticsEvents.plannedTransferCreated, { surface: 'planning' });
      },
      { success: t('planning.transferForm.created'), error: t('planning.transferForm.createFailed') },
    );
    if (created) {
      onCreated?.();
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="plannedTransferName">{t('common.name')}</FieldLabel>
          <Input id="plannedTransferName" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('planning.transferForm.namePlaceholder')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="plannedTransferAmount">{t('common.amount')}</FieldLabel>
          <Input id="plannedTransferAmount" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="500.00" />
        </Field>
        <Field>
          <FieldLabel htmlFor="plannedTransferDescription">{t('planning.form.note')}</FieldLabel>
          <Input id="plannedTransferDescription" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('planning.form.notePlaceholder')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="plannedTransferDate">{t('planning.form.dueDate')}</FieldLabel>
          <Input id="plannedTransferDate" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="plannedTransferFrom">{t('planning.transferForm.fromAccount')}</FieldLabel>
          <TransferSourceSelect accounts={accountList} facilities={cardFacilities} id="plannedTransferFrom" source={source} onSourceChange={setSource} />
          {source?.kind === 'facility' ? <FieldDescription>{t('planning.transferForm.cardSourceHint')}</FieldDescription> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="plannedTransferTo">{t('planning.transferForm.toAccount')}</FieldLabel>
          <Select value={toAccountId} onValueChange={(value) => setToAccountId(value as Id<'financialAccounts'>)}>
            <SelectTrigger id="plannedTransferTo" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{accountList.map((account) => <SelectItem key={account._id} value={account._id}>{accountLabel(account)}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        {isSameAccount ? <p className="text-sm text-destructive">{t('planning.transferForm.sameAccount')}</p> : null}
        <Button type="submit" disabled={!canSubmit || isPending('planned-transfer-create')}>
          {isPending('planned-transfer-create') ? <Spinner data-icon="inline-start" /> : null}
          {t('planning.transferForm.submit')}
        </Button>
      </FieldGroup>
    </form>
  );
}

export function CreatePlannedTransferDialog({ accountId, accounts, onOpenChange, open }: {
  accountId?: Id<'financialAccounts'>;
  accounts: Array<Doc<'financialAccounts'>> | undefined;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('planning.transferForm.title')}</DialogTitle>
          <DialogDescription>{t('planning.transferForm.description')}</DialogDescription>
        </DialogHeader>
        <CreatePlannedTransferForm key={accountId} accounts={accounts} initialAccountId={accountId} onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
