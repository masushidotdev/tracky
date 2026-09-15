import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanAccount } from './types';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { accountLabel } from '@/lib/accounts';
import { useI18n } from '@/lib/i18n';

/** Shared by the create sheet and the accounts sheet: picking a plan's perimeter is the same act. */
export function PlanAccountPicker({
  accounts,
  onToggle,
  selectedIds,
}: {
  accounts: Array<PlanAccount>;
  onToggle: (accountId: Id<'financialAccounts'>, checked: boolean) => void;
  selectedIds: Array<Id<'financialAccounts'>>;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      {accounts.map((account) => {
        const checkboxId = `plan-account-${account._id}`;
        return (
          <Field key={account._id} orientation="horizontal" className="rounded-2xl border p-3">
            <Checkbox
              id={checkboxId}
              checked={selectedIds.includes(account._id)}
              onCheckedChange={(checked) => onToggle(account._id, checked === true)}
            />
            <FieldLabel htmlFor={checkboxId} className="min-w-0 flex-1">
              <span className="truncate">{accountLabel(account)}</span>
              <span className="text-xs font-normal text-muted-foreground">{account.accountType ?? ''}</span>
            </FieldLabel>
          </Field>
        );
      })}
      {accounts.length === 0 ? <p className="text-sm text-muted-foreground">{t('plan.create.noAccounts')}</p> : null}
    </div>
  );
}
