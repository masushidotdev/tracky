import { useQuery } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/lib/i18n';

export function ProfileCard() {
  const { t } = useI18n();
  const profile = useQuery(api.authProfiles.getCurrentUserProfile, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.profile.title')}</CardTitle>
        <CardDescription>{t('settings.profile.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {profile === undefined ? (
          <div className="flex flex-col gap-3" aria-label={t('settings.loading')}>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-3">
            <ProfileValue label={t('settings.profile.name')} value={profile?.name} fallback={t('settings.notProvided')} />
            <ProfileValue label={t('settings.profile.email')} value={profile?.email} fallback={t('settings.notProvided')} />
            <ProfileValue label={t('settings.profile.locale')} value={profile?.locale} fallback={t('settings.notProvided')} />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileValue({ fallback, label, value }: { fallback: string; label: string; value?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium" title={value}>
        {value || fallback}
      </dd>
    </div>
  );
}
