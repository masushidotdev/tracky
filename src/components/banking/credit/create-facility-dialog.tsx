import * as React from 'react';

import { CREDIT_FACILITY_TYPES, CURRENCIES, REPAYMENT_TYPES } from './options';
import type { CurrencyValue, FacilityTypeValue, RepaymentTypeValue } from './options';
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
import { cn } from '@/lib/utils';

export type CreateFacilityValues = {
  name: string;
  facilityType: FacilityTypeValue;
  repaymentType: RepaymentTypeValue;
  currency: CurrencyValue;
  limitAmount: string;
  usedAmount: string;
  linkedAccountId: string;
  minimumPurchaseAmount: string;
  annualNominalRateBps: string;
  standardInstallmentMonths: string;
};

function initialValues(): CreateFacilityValues {
  return {
    name: '',
    facilityType: 'accountOverdraft',
    repaymentType: 'onDemand',
    currency: 'EUR',
    limitAmount: '',
    usedAmount: '',
    linkedAccountId: 'none',
    minimumPurchaseAmount: '',
    annualNominalRateBps: '',
    standardInstallmentMonths: '',
  };
}

export function CreateFacilityDialog({
  accounts,
  onOpenChange,
  onSubmit,
  open,
  pending,
}: {
  accounts: Array<FinancialAccount> | undefined;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateFacilityValues) => Promise<boolean>;
  open: boolean;
  pending: boolean;
}) {
  const { t } = useI18n();
  const [values, setValues] = React.useState<CreateFacilityValues>(() => initialValues());
  const overdraftFacility = values.facilityType === 'accountOverdraft';
  const linkedAccountMissing = overdraftFacility && values.linkedAccountId === 'none';

  React.useEffect(() => {
    if (!open) {
      setValues(initialValues());
    }
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (linkedAccountMissing) {
      return;
    }
    const succeeded = await onSubmit(values);
    if (succeeded) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('credit.title')}</DialogTitle>
          <DialogDescription>{t('credit.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="creditFacilityName">{t('common.name')}</FieldLabel>
              <Input
                id="creditFacilityName"
                value={values.name}
                onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                placeholder={t('credit.form.facilityNamePlaceholder')}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t('common.type')}</FieldLabel>
                <Select
                  value={values.facilityType}
                  onValueChange={(facilityType) =>
                    setValues((current) => ({ ...current, facilityType: facilityType as FacilityTypeValue }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {CREDIT_FACILITY_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {t(type.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('credit.form.repayment')}</FieldLabel>
                <Select
                  value={values.repaymentType}
                  onValueChange={(repaymentType) =>
                    setValues((current) => ({ ...current, repaymentType: repaymentType as RepaymentTypeValue }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {REPAYMENT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {t(type.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel>
                {t('credit.form.linkedAccount')}
                {overdraftFacility ? <span aria-hidden="true">*</span> : null}
              </FieldLabel>
              <Select
                value={values.linkedAccountId}
                onValueChange={(linkedAccountId) => setValues((current) => ({ ...current, linkedAccountId }))}
              >
                <SelectTrigger aria-required={overdraftFacility}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">{t('credit.form.noLinkedAccount')}</SelectItem>
                    {accounts?.map((account) => (
                      <SelectItem key={account._id} value={account._id}>
                        {accountLabel(account)} · {account.currency}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div
              className={cn(
                'grid gap-3',
                overdraftFacility ? 'sm:grid-cols-[1fr_auto]' : 'sm:grid-cols-[1fr_1fr_auto]',
              )}
            >
              <Field>
                <FieldLabel htmlFor="creditLimitAmount">{t('credit.limit')}</FieldLabel>
                <Input
                  id="creditLimitAmount"
                  value={values.limitAmount}
                  onChange={(event) => setValues((current) => ({ ...current, limitAmount: event.target.value }))}
                  placeholder="3000.00"
                />
              </Field>
              {overdraftFacility ? null : (
                <Field>
                  <FieldLabel htmlFor="creditUsedAmount">{t('credit.form.usedNow')}</FieldLabel>
                  <Input
                    id="creditUsedAmount"
                    value={values.usedAmount}
                    onChange={(event) => setValues((current) => ({ ...current, usedAmount: event.target.value }))}
                    placeholder="0.00"
                  />
                </Field>
              )}
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
                <FieldLabel htmlFor="minimumPurchaseAmount">{t('credit.form.minPurchase')}</FieldLabel>
                <Input
                  id="minimumPurchaseAmount"
                  value={values.minimumPurchaseAmount}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, minimumPurchaseAmount: event.target.value }))
                  }
                  placeholder="1000.00"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="annualNominalRate">{t('credit.form.tan')}</FieldLabel>
                <Input
                  id="annualNominalRate"
                  value={values.annualNominalRateBps}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, annualNominalRateBps: event.target.value }))
                  }
                  placeholder="6.50"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="standardInstallments">{t('credit.form.months')}</FieldLabel>
                <Input
                  id="standardInstallments"
                  value={values.standardInstallmentMonths}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, standardInstallmentMonths: event.target.value }))
                  }
                  placeholder="24"
                />
              </Field>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={pending || !values.name.trim() || !values.limitAmount.trim() || linkedAccountMissing}
              >
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? t('credit.form.creating') : t('credit.form.createFacility')}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
