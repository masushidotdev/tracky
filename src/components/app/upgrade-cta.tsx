import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';

export function UpgradeCta({ dailyLimitReached = false }: { dailyLimitReached?: boolean }) {
  const { t } = useI18n();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t('entitlements.upgrade.title')}</CardTitle>
        <CardDescription className="flex flex-col gap-1">
          {dailyLimitReached ? <span>{t('entitlements.dailyLimit.error')}</span> : null}
          <span>{t('entitlements.upgrade.body')}</span>
        </CardDescription>
        <CardAction>
          <Button type="button" size="sm" variant="secondary" disabled>
            {t('entitlements.upgrade.cta')}
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
