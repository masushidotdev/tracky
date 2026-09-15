import { useQuery } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';

type BankConnectionStatusProps = {
  state: string;
  fallbackStatus?: 'completed' | 'failed';
};

export function BankConnectionStatus({ state, fallbackStatus }: BankConnectionStatusProps) {
  const { t } = useI18n();
  const authRequest = useQuery(api.banking.accounts.getAuthRequestStatus, { state });

  if (authRequest === undefined) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t('connect.status.checking.title')}</CardTitle>
          <CardDescription>{t('connect.status.checking.description')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (authRequest === null) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t('connect.status.unavailable.title')}</CardTitle>
          <CardDescription>{t('connect.status.unavailable.description')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const failed = authRequest.status === 'failed' || fallbackStatus === 'failed';
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{failed ? t('connect.status.failed') : t('connect.status.completed')}</CardTitle>
            <CardDescription>
              {authRequest.aspspName} {authRequest.aspspCountry ? `(${authRequest.aspspCountry})` : ''}
            </CardDescription>
          </div>
          <Badge variant={failed ? 'destructive' : 'default'}>{authRequest.status}</Badge>
        </div>
      </CardHeader>
      {authRequest.errorMessage ? (
        <CardContent>
          <p className="text-sm text-destructive">{authRequest.errorMessage}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
