import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UpgradeCta } from '@/components/app/upgrade-cta';
import { useEntitlements } from '@/lib/entitlements';
import { useI18n } from '@/lib/i18n';

export function PlanCard() {
  const { t } = useI18n();
  const entitlements = useEntitlements();

  return (
    <Card id="plan">
      <CardHeader>
        <CardTitle>{t('settings.plan.title')}</CardTitle>
        <CardDescription>{t('settings.plan.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {entitlements === undefined ? (
          <Skeleton className="h-8 w-36" aria-label={t('settings.loading')} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('settings.plan.current')}</span>
              <Badge variant={entitlements.tier === 'pro' ? 'default' : 'secondary'}>
                {entitlements.tier === 'pro' ? t('settings.plan.pro') : t('settings.plan.free')}
              </Badge>
            </div>
            <span className="text-sm text-muted-foreground">
              {t('settings.plan.dailyMessages', { count: entitlements.limits.analystDailyMessages })}
            </span>
          </div>
        )}
        {entitlements?.tier === 'free' ? <UpgradeCta /> : null}
      </CardContent>
    </Card>
  );
}
