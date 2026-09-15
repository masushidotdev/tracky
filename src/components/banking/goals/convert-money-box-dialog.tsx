import * as React from 'react';
import { AlertTriangleIcon } from 'lucide-react';

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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';

export type ConvertedAccountType = 'CACC' | 'SVGS';

export function ConvertMoneyBoxDialog({
  moneyBox,
  onOpenChange,
  onSubmit,
  open,
  pending,
}: {
  moneyBox: Doc<'moneyBoxes'> | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { accountType: ConvertedAccountType; name?: string }) => Promise<boolean>;
  open: boolean;
  pending: boolean;
}) {
  const { t } = useI18n();
  const [accountType, setAccountType] = React.useState<ConvertedAccountType>('SVGS');
  const [name, setName] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setAccountType('SVGS');
    setName(moneyBox?.name ?? '');
  }, [moneyBox?._id, open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moneyBox) return;
    await onSubmit({ accountType, name: name.trim() || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('goals.saveUp.convert.title')}</DialogTitle>
          <DialogDescription>{t('goals.saveUp.convert.body')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>{t('goals.saveUp.convert.warning')}</p>
        </div>
        <form id="convert-money-box-form" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="convertedAccountName">{t('common.name')}</FieldLabel>
              <Input
                id="convertedAccountName"
                value={name}
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="convertedAccountType">{t('goals.saveUp.convert.accountType')}</FieldLabel>
              <Select
                value={accountType}
                disabled={pending}
                onValueChange={(value) => setAccountType(value as ConvertedAccountType)}
              >
                <SelectTrigger id="convertedAccountType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="CACC">{t('goals.saveUp.convert.checking')}</SelectItem>
                    <SelectItem value="SVGS">{t('goals.saveUp.convert.savings')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="convert-money-box-form"
            variant="destructive"
            disabled={!moneyBox || pending}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {t('goals.saveUp.convert.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
