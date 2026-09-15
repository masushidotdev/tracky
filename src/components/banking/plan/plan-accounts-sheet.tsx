import { AlertTriangleIcon } from 'lucide-react';
import * as React from 'react';

import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanAccount } from './types';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { accountLabel } from '@/lib/accounts';
import { useI18n } from '@/lib/i18n';

export function PlanAccountsSheet({
  accounts,
  currency,
  onOpenChange,
  onSubmit,
  open,
  outsideAccounts,
  pending,
  selectedIds,
}: {
  accounts: Array<PlanAccount>;
  currency: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (accountIds: Array<Id<'financialAccounts'>>) => Promise<boolean>;
  open: boolean;
  outsideAccounts: Array<PlanAccount>;
  pending: boolean;
  selectedIds: Array<Id<'financialAccounts'>>;
}) {
  const { t } = useI18n();
  const [accountIds, setAccountIds] = React.useState<Array<Id<'financialAccounts'>>>(selectedIds);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setAccountIds(selectedIds);
    setValidationError(null);
  }, [open, selectedIds]);

  // A plan's currency is fixed at creation, so only accounts that can actually belong to it are offered.
  const matchingAccounts = accounts.filter((account) => account.currency.toUpperCase() === currency.toUpperCase());
  const matchingOutsideAccounts = outsideAccounts.filter(
    (account) => account.currency.toUpperCase() === currency.toUpperCase(),
  );

  function accountStateLabels(account: PlanAccount) {
    const labels: Array<string> = [];
    if (account.hidden) labels.push(t('plan.accounts.status.hidden'));
    if (account.status === 'paused') labels.push(t('plan.accounts.status.paused'));
    if (account.status === 'reauthorizationRequired') {
      labels.push(t('plan.accounts.status.reauthorizationRequired'));
    }
    if (account.status === 'pending') labels.push(t('plan.accounts.status.pending'));
    if (account.status === 'error') labels.push(t('plan.accounts.status.error'));
    return labels;
  }

  function toggleAccount(accountId: Id<'financialAccounts'>, checked: boolean) {
    setAccountIds((current) =>
      checked ? [...new Set([...current, accountId])] : current.filter((candidate) => candidate !== accountId),
    );
    setValidationError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (accountIds.length === 0) {
      setValidationError(t('plan.accounts.edit.emptyError'));
      return;
    }
    const saved = await onSubmit(accountIds);
    if (saved) onOpenChange(false);
  }

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('plan.accounts.edit.title')}
      description={t('plan.accounts.edit.description')}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="plan-accounts-form" disabled={pending || matchingAccounts.length === 0}>
            {pending ? <Spinner /> : null}
            {t('plan.accounts.edit.action')}
          </Button>
        </div>
      }
    >
      <form id="plan-accounts-form" className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>
        {matchingOutsideAccounts.length > 0 ? (
          <Alert className="border-warning/40 bg-warning/5">
            <AlertTriangleIcon className="text-warning" />
            <AlertTitle>{t('plan.accounts.outside.title')}</AlertTitle>
            <AlertDescription>
              {t('plan.accounts.outside.description', {
                accounts: matchingOutsideAccounts.map((account) => accountLabel(account)).join(', '),
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        <FieldSet>
          <FieldLegend>{t('plan.create.accounts')}</FieldLegend>
          <FieldDescription>{t('plan.accounts.edit.hint')}</FieldDescription>
          <div className="flex flex-col gap-2">
            {matchingAccounts.map((account) => {
              const checkboxId = `plan-account-${account._id}`;
              const stateLabels = accountStateLabels(account);
              return (
                <Field key={account._id} orientation="horizontal" className="rounded-2xl border p-3">
                  <Checkbox
                    id={checkboxId}
                    checked={accountIds.includes(account._id)}
                    onCheckedChange={(checked) => toggleAccount(account._id, checked === true)}
                  />
                  <FieldLabel htmlFor={checkboxId} className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate">{accountLabel(account)}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {[account.accountType, ...stateLabels].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </FieldLabel>
                </Field>
              );
            })}
            {matchingAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('plan.create.noAccounts')}</p>
            ) : null}
          </div>
        </FieldSet>

        {validationError ? (
          <p role="alert" className="text-sm text-destructive">
            {validationError}
          </p>
        ) : null}
      </form>
    </DetailSheet>
  );
}
