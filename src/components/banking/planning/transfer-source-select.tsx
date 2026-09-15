import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { accountLabel } from '@/lib/accounts';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';

export type TransferSource =
  | { kind: 'account'; id: Id<'financialAccounts'> }
  | { kind: 'facility'; id: Id<'creditFacilities'> };

export function encodeTransferSource(source: TransferSource | undefined) {
  return source ? `${source.kind}:${source.id}` : undefined;
}

export function decodeTransferSource(value: string): TransferSource {
  const [kind, id] = value.split(':');
  return kind === 'facility'
    ? { kind, id: id as Id<'creditFacilities'> }
    : { kind: 'account', id: id as Id<'financialAccounts'> };
}

export function TransferSourceSelect({
  accounts,
  facilities,
  id,
  source,
  onSourceChange,
}: {
  accounts: Array<Doc<'financialAccounts'>>;
  facilities: Array<Doc<'creditFacilities'>>;
  id: string;
  source: TransferSource | undefined;
  onSourceChange: (source: TransferSource) => void;
}) {
  const { t } = useI18n();

  return (
    <Select value={encodeTransferSource(source)} onValueChange={(value) => onSourceChange(decodeTransferSource(value))}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{t('planning.transferForm.fromAccounts')}</SelectLabel>
          {accounts.map((account) => (
            <SelectItem key={account._id} value={`account:${account._id}`}>
              {accountLabel(account)}
            </SelectItem>
          ))}
        </SelectGroup>
        {facilities.length > 0 ? (
          <SelectGroup>
            <SelectLabel>{t('planning.transferForm.fromCard')}</SelectLabel>
            {facilities.map((facility) => (
              <SelectItem key={facility._id} value={`facility:${facility._id}`}>
                {facility.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
      </SelectContent>
    </Select>
  );
}
