import * as React from 'react';

import type { PlanBucket } from './types';
import { Amount } from '@/components/app/amount';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';
import { moneyInputValue, parseMoneyMinor } from '@/lib/money';

export function PlanAssignedSheet({
  bucket,
  currency,
  onOpenChange,
  onSave,
  open,
  pending,
}: {
  bucket: PlanBucket | null;
  currency: string;
  onOpenChange: (open: boolean) => void;
  onSave: (bucket: PlanBucket, amountMinor: bigint) => Promise<boolean>;
  open: boolean;
  pending: boolean;
}) {
  const { intlLocale, t } = useI18n();
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !bucket) return;
    setValue(moneyInputValue({ amountMinor: bucket.assignedMinor, currency }, intlLocale));
    setError(null);
  }, [bucket, currency, intlLocale, open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!bucket) return;
    let amountMinor: bigint;
    try {
      amountMinor = parseMoneyMinor(value, currency, intlLocale);
    } catch {
      setError(t('plan.errors.invalidAmount'));
      return;
    }
    const saved = await onSave(bucket, amountMinor);
    if (saved) onOpenChange(false);
  }

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={bucket ? t('plan.assigned.editTitle', { name: bucket.name }) : t('plan.columns.assigned')}
      description={t('plan.assigned.editDescription')}
      footer={
        <Button type="submit" form="plan-assigned-form" className="w-full" disabled={pending || !bucket}>
          {pending ? <Spinner /> : null}
          {t('common.save')}
        </Button>
      }
    >
      {bucket ? (
        <form id="plan-assigned-form" className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <div className="flex items-center justify-between rounded-2xl bg-muted p-3">
            <span className="text-sm text-muted-foreground">{t('plan.assigned.current')}</span>
            <Amount money={{ amountMinor: bucket.assignedMinor, currency }} />
          </div>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="plan-assigned-amount">{t('plan.columns.assigned')}</FieldLabel>
            <Input
              id="plan-assigned-amount"
              value={value}
              inputMode="decimal"
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'plan-assigned-sheet-error' : undefined}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
            />
            <FieldDescription>{t('plan.move.currencyHint', { currency })}</FieldDescription>
            {error ? (
              <p id="plan-assigned-sheet-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </Field>
        </form>
      ) : null}
    </DetailSheet>
  );
}
