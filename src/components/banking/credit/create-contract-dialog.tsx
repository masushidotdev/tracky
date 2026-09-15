import * as React from 'react';
import { WalletCardsIcon } from 'lucide-react';

import { CURRENCIES } from './options';
import type { CurrencyValue } from './options';
import type { FinancialAccount } from './types';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';

export type CreateContractValues = {
  name: string;
  accountId: string;
  principalAmount: string;
  monthlyPaymentAmount: string;
  installmentCount: string;
  startDate: string;
  nextPaymentDate: string;
  currency: CurrencyValue;
};

function initialValues(): CreateContractValues {
  return {
    name: '',
    accountId: 'none',
    principalAmount: '',
    monthlyPaymentAmount: '',
    installmentCount: '',
    startDate: new Date().toISOString().slice(0, 10),
    nextPaymentDate: '',
    currency: 'EUR',
  };
}

export function CreateContractDialog({
  accounts,
  onOpenChange,
  onSubmit,
  open,
  pending,
}: {
  accounts: Array<FinancialAccount> | undefined;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateContractValues) => Promise<boolean>;
  open: boolean;
  pending: boolean;
}) {
  const { t } = useI18n();
  const [values, setValues] = React.useState<CreateContractValues>(() => initialValues());

  React.useEffect(() => {
    if (!open) {
      setValues(initialValues());
    }
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await onSubmit(values);
    if (succeeded) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('credit.contract.title')}</DialogTitle>
          <DialogDescription>{t('credit.contract.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="contractName">{t('common.name')}</FieldLabel>
              <Input
                id="contractName"
                value={values.name}
                onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                placeholder={t('credit.contract.namePlaceholder')}
              />
            </Field>
            <Field>
              <FieldLabel>{t('credit.form.linkedAccount')}</FieldLabel>
              <Select
                value={values.accountId}
                onValueChange={(accountId) => setValues((current) => ({ ...current, accountId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">{t('credit.form.noLinkedAccount')}</SelectItem>
                    {accounts?.map((account) => (
                      <SelectItem key={account._id} value={account._id}>
                        {accountLabel(account)} - {account.currency}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field>
                <FieldLabel htmlFor="contractPrincipal">{t('credit.installments.principal')}</FieldLabel>
                <Input
                  id="contractPrincipal"
                  value={values.principalAmount}
                  onChange={(event) => setValues((current) => ({ ...current, principalAmount: event.target.value }))}
                  placeholder="12000.00"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="contractMonthly">{t('credit.installments.monthlyPayment')}</FieldLabel>
                <Input
                  id="contractMonthly"
                  value={values.monthlyPaymentAmount}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, monthlyPaymentAmount: event.target.value }))
                  }
                  placeholder="300.00"
                />
              </Field>
              <Field>
                <FieldLabel>{t('common.currency')}</FieldLabel>
                <Select
                  value={values.currency}
                  onValueChange={(currency) =>
                    setValues((current) => ({ ...current, currency: currency as CurrencyValue }))
                  }
                >
                  <SelectTrigger className="min-w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {CURRENCIES.map((currencyCode) => (
                        <SelectItem key={currencyCode} value={currencyCode}>
                          {currencyCode}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="contractCount">{t('credit.installments.count')}</FieldLabel>
                <Input
                  id="contractCount"
                  value={values.installmentCount}
                  onChange={(event) => setValues((current) => ({ ...current, installmentCount: event.target.value }))}
                  placeholder="24"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="contractStart">{t('credit.installments.startDate')}</FieldLabel>
                <Input
                  id="contractStart"
                  type="date"
                  value={values.startDate}
                  onChange={(event) => setValues((current) => ({ ...current, startDate: event.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="contractNext">{t('credit.installments.nextPaymentDate')}</FieldLabel>
                <Input
                  id="contractNext"
                  type="date"
                  value={values.nextPaymentDate}
                  onChange={(event) => setValues((current) => ({ ...current, nextPaymentDate: event.target.value }))}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  pending ||
                  !values.name.trim() ||
                  !values.principalAmount.trim() ||
                  !values.monthlyPaymentAmount.trim() ||
                  !values.installmentCount.trim() ||
                  !values.startDate
                }
              >
                {pending ? <Spinner data-icon="inline-start" /> : <WalletCardsIcon data-icon="inline-start" />}
                {pending ? t('credit.form.creating') : t('credit.contract.create')}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
