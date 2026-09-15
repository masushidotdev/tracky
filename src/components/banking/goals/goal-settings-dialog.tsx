import * as React from 'react';

import type { Doc } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';

export function GoalSettingsDialog({
  moneyBox,
  onOpenChange,
  onSave,
  open,
  pending,
}: {
  moneyBox: Doc<'moneyBoxes'> | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: { growthRatePct: number; spendingReducesProgress: boolean }) => Promise<boolean>;
  open: boolean;
  pending: boolean;
}) {
  const { t } = useI18n();
  const [growthRate, setGrowthRate] = React.useState('0');
  const [spendingReducesProgress, setSpendingReducesProgress] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !moneyBox) return;
    setGrowthRate(String(moneyBox.growthRatePct ?? 0));
    setSpendingReducesProgress(moneyBox.spendingReducesProgress ?? true);
    setError(null);
  }, [moneyBox, open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedGrowthRate = Number(growthRate.replace(',', '.'));
    if (!Number.isFinite(parsedGrowthRate) || parsedGrowthRate < 0 || parsedGrowthRate > 20) {
      setError(t('goals.saveUp.settings.growthError'));
      return;
    }

    setError(null);
    await onSave({ growthRatePct: parsedGrowthRate, spendingReducesProgress });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('goals.saveUp.settings.title')}</DialogTitle>
          <DialogDescription>{moneyBox?.name ?? ''}</DialogDescription>
        </DialogHeader>
        <form id="goal-settings-form" onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="goal-growth-rate">{t('goals.saveUp.settings.growthRate')}</FieldLabel>
              <Input
                id="goal-growth-rate"
                aria-invalid={Boolean(error)}
                inputMode="decimal"
                min="0"
                max="20"
                step="0.1"
                type="number"
                value={growthRate}
                onChange={(event) => {
                  setGrowthRate(event.target.value);
                  setError(null);
                }}
              />
              <FieldDescription>{t('goals.saveUp.settings.growthHint')}</FieldDescription>
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
            <Field orientation="horizontal">
              <div className="flex flex-1 flex-col gap-1">
                <FieldLabel htmlFor="goal-spending-progress">
                  {t('goals.saveUp.settings.spendingReducesProgress')}
                </FieldLabel>
                <FieldDescription>{t('goals.saveUp.settings.spendingHint')}</FieldDescription>
              </div>
              <Switch
                id="goal-spending-progress"
                checked={spendingReducesProgress}
                onCheckedChange={setSpendingReducesProgress}
              />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="goal-settings-form" disabled={!moneyBox || pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
