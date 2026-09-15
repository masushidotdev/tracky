import * as React from 'react';

import { buildBackfillPreview } from './helpers';
import type { InstallmentPlan } from './helpers';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

export function BackfillInstallmentsDialog({
  onOpenChange,
  onSubmit,
  open,
  pending,
  plan,
}: {
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { throughScheduledDueDate: string; notes: string }) => Promise<void>;
  open: boolean;
  pending: boolean;
  plan: InstallmentPlan | null;
}) {
  const { intlLocale, t } = useI18n();
  const [throughScheduledDueDate, setThroughScheduledDueDate] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const preview = React.useMemo(() => {
    return plan ? buildBackfillPreview(plan, throughScheduledDueDate) : null;
  }, [plan, throughScheduledDueDate]);

  React.useEffect(() => {
    if (open && plan) {
      setThroughScheduledDueDate(new Date().toISOString().slice(0, 10));
      setNotes(t('credit.installments.backfillDefaultNote'));
    }
  }, [open, plan, t]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({ throughScheduledDueDate, notes });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('credit.installments.backfillTitle')}</DialogTitle>
          <DialogDescription>{t('credit.installments.backfillDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="backfillThroughDate">{t('credit.installments.backfillThroughDate')}</FieldLabel>
              <Input
                id="backfillThroughDate"
                onChange={(event) => setThroughScheduledDueDate(event.target.value)}
                type="date"
                value={throughScheduledDueDate}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="backfillNotes">{t('credit.installments.backfillNotes')}</FieldLabel>
              <Input id="backfillNotes" onChange={(event) => setNotes(event.target.value)} value={notes} />
            </Field>
            {preview ? (
              <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">{t('credit.installments.backfillPreviewInstallments')}</p>
                  <p className="font-medium">
                    {t('credit.installments.backfillPreviewInstallmentsValue', {
                      count: preview.installments,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('credit.installments.backfillPreviewTotal')}</p>
                  <p className="font-medium">
                    <Amount money={preview.totalAmount} variant="neutral" />
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('credit.installments.backfillPreviewOutstanding')}</p>
                  <p className="font-medium">
                    <Amount money={preview.remainingRepaymentAmount} variant="balance" />
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('credit.installments.backfillPreviewNextDue')}</p>
                  <p className="font-medium">{preview.nextPaymentDate ?? t('credit.installments.backfillPaidOff')}</p>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                disabled={pending || !throughScheduledDueDate || !preview || preview.installments === 0}
                type="submit"
              >
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? t('credit.installments.recording') : t('credit.installments.backfillConfirm')}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
