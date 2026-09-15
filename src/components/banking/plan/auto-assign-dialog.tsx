import * as React from 'react';
import { SparklesIcon } from 'lucide-react';

import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanAutoAssignPreview, PlanAutoAssignStrategy, PlanBucket } from './types';
import { Amount } from '@/components/app/amount';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';

const STRATEGIES: Array<PlanAutoAssignStrategy> = [
  'underfunded',
  'assignedLastMonth',
  'spentLastMonth',
  'averageAssigned',
  'resetAssigned',
  'resetAvailable',
];

export function AutoAssignDialog({
  buckets,
  currency,
  onApply,
  onOpenChange,
  onPreview,
  open,
  pending,
}: {
  buckets: Array<PlanBucket>;
  currency: string;
  onApply: (strategy: PlanAutoAssignStrategy, bucketIds?: Array<Id<'planBuckets'>>) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  onPreview: (
    strategy: PlanAutoAssignStrategy,
    bucketIds?: Array<Id<'planBuckets'>>,
  ) => Promise<PlanAutoAssignPreview | null>;
  open: boolean;
  pending: boolean;
}) {
  const { t } = useI18n();
  const [strategy, setStrategy] = React.useState<PlanAutoAssignStrategy>('underfunded');
  const [selected, setSelected] = React.useState<Set<Id<'planBuckets'>>>(new Set());
  const [preview, setPreview] = React.useState<PlanAutoAssignPreview | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setStrategy('underfunded');
    setSelected(new Set());
    setPreview(null);
  }, [open]);

  function selectedBucketIds() {
    return selected.size > 0 ? [...selected] : undefined;
  }

  function toggleBucket(bucketId: Id<'planBuckets'>, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(bucketId);
      else next.delete(bucketId);
      return next;
    });
    setPreview(null);
  }

  async function previewChanges() {
    setPreview(await onPreview(strategy, selectedBucketIds()));
  }

  async function applyChanges() {
    if (!preview) return;
    if (await onApply(strategy, selectedBucketIds())) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('plan.autoAssign.title')}</DialogTitle>
          <DialogDescription>{t('plan.autoAssign.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div>
            <label htmlFor="plan-auto-assign-strategy" className="text-sm font-medium">
              {t('plan.autoAssign.strategy')}
            </label>
            <Select
              value={strategy}
              onValueChange={(value) => {
                setStrategy(value as PlanAutoAssignStrategy);
                setPreview(null);
              }}
            >
              <SelectTrigger id="plan-auto-assign-strategy" className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRATEGIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`plan.autoAssign.strategy.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('plan.autoAssign.buckets')}</legend>
            <p className="text-xs text-muted-foreground">{t('plan.autoAssign.bucketsHint')}</p>
            <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto rounded-2xl border p-3 sm:grid-cols-2">
              {buckets.map((bucket) => {
                const inputId = `plan-auto-assign-${bucket.bucketId}`;
                return (
                  <label key={bucket.bucketId} htmlFor={inputId} className="flex min-w-0 items-center gap-2 text-sm">
                    <Checkbox
                      id={inputId}
                      checked={selected.has(bucket.bucketId)}
                      onCheckedChange={(value) => toggleBucket(bucket.bucketId, value === true)}
                    />
                    <span className="truncate">{bucket.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {preview ? (
            <section aria-live="polite" className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-medium">{t('plan.autoAssign.previewTitle')}</h3>
                  <p className="text-xs text-muted-foreground">{t('plan.autoAssign.previewDescription')}</p>
                </div>
                <Amount
                  money={{ amountMinor: preview.totalAssignedMinor, currency }}
                  variant="balance"
                  className="font-heading text-lg"
                />
              </div>
              {preview.rows.length > 0 ? (
                <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                  {preview.rows.map((row) => (
                    <li
                      key={row.bucketId}
                      className="flex items-center justify-between gap-4 rounded-xl bg-background px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">{row.name}</span>
                      <div className="shrink-0 text-right">
                        <Amount money={{ amountMinor: row.amountMinor, currency }} />
                        <p className="text-[11px] text-muted-foreground">
                          {t('plan.autoAssign.resulting')}{' '}
                          <Amount
                            money={{ amountMinor: row.resultingAssignedMinor, currency }}
                            className="text-[11px]"
                          />
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('plan.autoAssign.noChanges')}</p>
              )}
              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span className="text-sm text-muted-foreground">{t('plan.autoAssign.resultingRta')}</span>
                <Amount money={{ amountMinor: preview.resultingReadyToAssignMinor, currency }} variant="balance" />
              </div>
            </section>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {!preview ? (
            <Button type="button" disabled={pending} onClick={() => void previewChanges()}>
              {pending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
              {t('plan.autoAssign.preview')}
            </Button>
          ) : (
            <Button type="button" disabled={pending || preview.rows.length === 0} onClick={() => void applyChanges()}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {t('plan.autoAssign.confirm')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
