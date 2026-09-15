import * as React from 'react';

import { moneyToInputValue } from './helpers';
import type { InstallmentPlan } from './helpers';
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
import { Spinner } from '@/components/ui/spinner';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

export function CustomPaymentDialog({
  onOpenChange,
  onSubmit,
  open,
  pending,
  plan,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { amount: string; principal: string; interest: string; fee: string }) => Promise<void>;
  open: boolean;
  pending: boolean;
  plan: InstallmentPlan | null;
}) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const [amount, setAmount] = React.useState('');
  const [principal, setPrincipal] = React.useState('');
  const [interest, setInterest] = React.useState('');
  const [fee, setFee] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setAmount('');
      setPrincipal('');
      setInterest('');
      setFee('');
    }
  }, [open, plan?._id]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({ amount, principal, interest, fee });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('credit.installments.customPaymentTitle')}</DialogTitle>
          <DialogDescription>
            {plan
              ? t('credit.installments.customPaymentDescription', {
                  amount: maskValue(formatMoney(plan.monthlyPaymentAmount, intlLocale)),
                })
              : t('credit.installments.splitHint')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="customInstallmentPayment">
                {t('credit.installments.recordPaymentPlaceholder')}
              </FieldLabel>
              <Input
                id="customInstallmentPayment"
                onChange={(event) => setAmount(event.target.value)}
                placeholder={plan ? moneyToInputValue(plan.monthlyPaymentAmount) : '0.00'}
                value={amount}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="customInstallmentPrincipal">
                  {t('credit.installments.principalOptional')}
                </FieldLabel>
                <Input
                  id="customInstallmentPrincipal"
                  onChange={(event) => setPrincipal(event.target.value)}
                  value={principal}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="customInstallmentInterest">{t('credit.installments.interestOptional')}</FieldLabel>
                <Input
                  id="customInstallmentInterest"
                  onChange={(event) => setInterest(event.target.value)}
                  value={interest}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="customInstallmentFee">{t('credit.installments.feeOptional')}</FieldLabel>
                <Input id="customInstallmentFee" onChange={(event) => setFee(event.target.value)} value={fee} />
              </Field>
            </div>
            <DialogFooter>
              <Button disabled={pending || !amount.trim()} type="submit">
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? t('credit.installments.recording') : t('credit.installments.recordCustomPayment')}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
