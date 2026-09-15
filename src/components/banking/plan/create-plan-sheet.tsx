import * as React from 'react';

import { PlanAccountPicker } from './plan-account-picker';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanAccount } from './types';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';

export function CreatePlanSheet({
  accounts,
  defaultCurrency,
  onOpenChange,
  onSubmit,
  open,
  pending,
}: {
  accounts: Array<PlanAccount>;
  defaultCurrency: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {
    name: string;
    currency: string;
    accountIds: Array<Id<'financialAccounts'>>;
  }) => Promise<boolean>;
  open: boolean;
  pending: boolean;
}) {
  const { t } = useI18n();
  const currencies = React.useMemo(
    () => [...new Set(accounts.map((account) => account.currency.toUpperCase()))],
    [accounts],
  );
  const [name, setName] = React.useState('');
  const [currency, setCurrency] = React.useState(defaultCurrency);
  const [accountIds, setAccountIds] = React.useState<Array<Id<'financialAccounts'>>>([]);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const nextCurrency = currencies.includes(defaultCurrency) ? defaultCurrency : (currencies[0] ?? defaultCurrency);
    setName(t('plan.create.defaultName'));
    setCurrency(nextCurrency);
    setAccountIds(
      accounts.filter((account) => account.currency.toUpperCase() === nextCurrency).map((account) => account._id),
    );
    setValidationError(null);
  }, [accounts, currencies, defaultCurrency, open, t]);

  const matchingAccounts = accounts.filter((account) => account.currency.toUpperCase() === currency);

  function changeCurrency(nextCurrency: string) {
    setCurrency(nextCurrency);
    setAccountIds(
      accounts.filter((account) => account.currency.toUpperCase() === nextCurrency).map((account) => account._id),
    );
    setValidationError(null);
  }

  function toggleAccount(accountId: Id<'financialAccounts'>, checked: boolean) {
    setAccountIds((current) =>
      checked ? [...new Set([...current, accountId])] : current.filter((candidate) => candidate !== accountId),
    );
    setValidationError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setValidationError(t('plan.create.nameError'));
      return;
    }
    if (accountIds.length === 0) {
      setValidationError(t('plan.create.accountsError'));
      return;
    }
    const saved = await onSubmit({ name: name.trim(), currency, accountIds });
    if (saved) onOpenChange(false);
  }

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('plan.create.title')}
      description={t('plan.create.description')}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="create-plan-form" disabled={pending || matchingAccounts.length === 0}>
            {pending ? <Spinner /> : null}
            {t('plan.create.action')}
          </Button>
        </div>
      }
    >
      <form id="create-plan-form" className="flex flex-col gap-6" onSubmit={(event) => void submit(event)}>
        <Field>
          <FieldLabel htmlFor="plan-name">{t('common.name')}</FieldLabel>
          <Input
            id="plan-name"
            value={name}
            maxLength={60}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              setValidationError(null);
            }}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="plan-currency">{t('common.currency')}</FieldLabel>
          <Select value={currency} onValueChange={changeCurrency}>
            <SelectTrigger id="plan-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t('plan.create.currencyHint')}</FieldDescription>
        </Field>

        <FieldSet>
          <FieldLegend>{t('plan.create.accounts')}</FieldLegend>
          <FieldDescription>{t('plan.create.accountsHint')}</FieldDescription>
          <PlanAccountPicker accounts={matchingAccounts} selectedIds={accountIds} onToggle={toggleAccount} />
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
