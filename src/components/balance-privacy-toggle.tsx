import { EyeIcon, EyeOffIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';

export function BalancePrivacyToggle() {
  const { hidden, toggle } = useBalancePrivacy();
  const { t } = useI18n();
  const label = hidden ? t('privacy.showBalances') : t('privacy.hideBalances');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" aria-label={label} aria-pressed={hidden} onClick={toggle}>
          {hidden ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
