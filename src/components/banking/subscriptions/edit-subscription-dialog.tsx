import type * as React from 'react';
import type { Account, Subscription } from './helpers';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { accountLabel } from '@/lib/accounts';
import { useI18n } from '@/lib/i18n';

export function EditSubscriptionDialog({
  accountValue,
  accounts,
  aliasValue,
  isPending,
  onAccountChange,
  onAliasChange,
  onClose,
  onSubmit,
  subscription,
}: {
  accountValue: string;
  accounts: Array<Account>;
  aliasValue: string;
  isPending: boolean;
  onAccountChange: (value: string) => void;
  onAliasChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  subscription: Subscription | null;
}) {
  const { t } = useI18n();
  const formId = 'edit-subscription-form';

  return (
    <DetailSheet
      open={subscription !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={subscription?.name ?? t('subscriptions.details.title')}
      description={t('subscriptions.details.description', { value: subscription?.name ?? '' })}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            {t('subscriptions.details.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            {t('subscriptions.details.save')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="subscription-alias">{t('subscriptions.alias.label')}</FieldLabel>
            <Input
              id="subscription-alias"
              value={aliasValue}
              onChange={(event) => onAliasChange(event.target.value)}
              placeholder={t('subscriptions.alias.placeholder')}
              autoComplete="off"
            />
            <FieldDescription>{t('subscriptions.alias.help')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="subscription-account">{t('subscriptions.account.label')}</FieldLabel>
            <Select value={accountValue} onValueChange={onAccountChange}>
              <SelectTrigger id="subscription-account" className="w-full">
                <SelectValue placeholder={t('subscriptions.account.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">{t('subscriptions.noDebitAccount')}</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {accountLabel(account, account.name)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t('subscriptions.account.help')}</FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </DetailSheet>
  );
}
