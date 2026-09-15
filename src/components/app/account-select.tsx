import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { accountLabel } from '@/lib/accounts';
import { useI18n } from '@/lib/i18n';

type AccountOption = Parameters<typeof accountLabel>[0] & { _id: string };

export function AccountSelect({
  accounts,
  onValueChange,
  value,
}: {
  accounts: Array<AccountOption>;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const { t } = useI18n();

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={t('dashboard.accountSelect')} className="w-full sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t('transactions.filter.allAccounts')}</SelectItem>
        {accounts.map((account) => (
          <SelectItem key={account._id} value={account._id}>
            {accountLabel(account)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
