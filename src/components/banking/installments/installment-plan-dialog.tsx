import * as React from 'react';

import { moneyToInputValue } from './helpers';
import type { CreditFacility, InstallmentPlan, InstallmentPlanFormValues } from './helpers';
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

export function InstallmentPlanDialog({
  facilities,
  mode,
  onOpenChange,
  onSubmit,
  open,
  pending,
  plan,
}: {
  facilities: Array<CreditFacility> | undefined;
  mode: 'create' | 'edit';
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InstallmentPlanFormValues) => Promise<void>;
  open: boolean;
  pending: boolean;
  plan?: InstallmentPlan | null;
}) {
  const { t } = useI18n();
  const [values, setValues] = React.useState<InstallmentPlanFormValues>({
    creditFacilityId: '',
    name: '',
    principalAmount: '',
    monthlyPaymentAmount: '',
    installmentCount: '',
    startDate: new Date().toISOString().slice(0, 10),
    nextPaymentDate: '',
  });

  React.useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === 'edit' && plan) {
      setValues({
        creditFacilityId: plan.creditFacilityId,
        name: plan.name,
        principalAmount: moneyToInputValue(plan.principalAmount),
        monthlyPaymentAmount: moneyToInputValue(plan.monthlyPaymentAmount),
        installmentCount: String(plan.installmentCount),
        startDate: plan.startDate,
        nextPaymentDate: plan.nextPaymentDate ?? '',
      });
      return;
    }

    setValues({
      creditFacilityId: '',
      name: '',
      principalAmount: '',
      monthlyPaymentAmount: '',
      installmentCount: '',
      startDate: new Date().toISOString().slice(0, 10),
      nextPaymentDate: '',
    });
  }, [mode, open, plan]);

  const isCreate = mode === 'create';
  const submitDisabled =
    pending ||
    !values.creditFacilityId ||
    !values.name.trim() ||
    (!isCreate && (!values.monthlyPaymentAmount.trim() || !values.nextPaymentDate.trim())) ||
    (isCreate && (!values.principalAmount.trim() || !values.startDate.trim()));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(values);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? t('credit.installments.newPlan') : t('credit.installments.editPlan')}</DialogTitle>
          <DialogDescription>
            {isCreate ? t('credit.installments.createDialogDescription') : t('credit.installments.editDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t('credit.installments.facility')}</FieldLabel>
                <Select
                  value={values.creditFacilityId}
                  onValueChange={(creditFacilityId) => setValues((current) => ({ ...current, creditFacilityId }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('credit.installments.selectFacility')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {facilities?.map((facility) => (
                        <SelectItem key={facility._id} value={facility._id}>
                          {facility.name} - {facility.limitAmount.currency}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${mode}InstallmentPlanName`}>{t('credit.installments.planName')}</FieldLabel>
                <Input
                  id={`${mode}InstallmentPlanName`}
                  onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                  placeholder={t('credit.installments.planNamePlaceholder')}
                  value={values.name}
                />
              </Field>
            </div>
            {isCreate && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="principalAmount">{t('credit.installments.principal')}</FieldLabel>
                  <Input
                    id="principalAmount"
                    onChange={(event) => setValues((current) => ({ ...current, principalAmount: event.target.value }))}
                    placeholder="5000.00"
                    value={values.principalAmount}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="installmentCount">{t('credit.installments.count')}</FieldLabel>
                  <Input
                    id="installmentCount"
                    onChange={(event) => setValues((current) => ({ ...current, installmentCount: event.target.value }))}
                    placeholder="24"
                    value={values.installmentCount}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="installmentStartDate">{t('credit.installments.startDate')}</FieldLabel>
                  <Input
                    id="installmentStartDate"
                    onChange={(event) => setValues((current) => ({ ...current, startDate: event.target.value }))}
                    type="date"
                    value={values.startDate}
                  />
                </Field>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${mode}MonthlyPaymentAmount`}>
                  {t('credit.installments.monthlyPayment')}
                </FieldLabel>
                <Input
                  id={`${mode}MonthlyPaymentAmount`}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, monthlyPaymentAmount: event.target.value }))
                  }
                  placeholder={t('credit.installments.monthlyPaymentPlaceholder')}
                  value={values.monthlyPaymentAmount}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${mode}InstallmentNextPaymentDate`}>
                  {t('credit.installments.nextPaymentDate')}
                </FieldLabel>
                <Input
                  id={`${mode}InstallmentNextPaymentDate`}
                  onChange={(event) => setValues((current) => ({ ...current, nextPaymentDate: event.target.value }))}
                  type="date"
                  value={values.nextPaymentDate}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button disabled={submitDisabled} type="submit">
                {pending && <Spinner data-icon="inline-start" />}
                {pending
                  ? isCreate
                    ? t('credit.form.creating')
                    : t('credit.installments.updating')
                  : isCreate
                    ? t('credit.installments.create')
                    : t('credit.installments.saveChanges')}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
