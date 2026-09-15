import { RefreshCwIcon, UnplugIcon } from 'lucide-react';
import { formatConsentExpiry } from './helpers';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { TranslationKey } from '@/lib/i18n';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatDateTime } from '@/lib/format';

export type ConnectionRow = {
  _id: Id<'providerConnections'>;
  accessValidUntil?: string;
  aspspCountry?: string;
  displayName: string;
  health: {
    daysUntilExpiry: number | null;
    requiresReauthorization: boolean;
    warningLevel: string;
  };
  lastSyncedAtMs?: number;
  status: string;
};

type ConnectionsCardProps = {
  connections: Array<ConnectionRow> | undefined;
  intlLocale: string;
  isPending: (key?: string) => boolean;
  labels: {
    countryUnknown: string;
    empty: string;
    lastSync: string;
    never: string;
    reconnect: string;
    reconnecting: string;
    title: string;
  };
  onRenewConsent: (connectionId: Id<'providerConnections'>) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

export function ConnectionsCard({
  connections,
  intlLocale,
  isPending,
  labels,
  onRenewConsent,
  t,
}: ConnectionsCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {connections === undefined ? <ListSkeleton rows={3} /> : null}
        {connections?.length === 0 ? <EmptyState icon={UnplugIcon} title={labels.empty} /> : null}
        {connections && connections.length > 0 ? (
          <div className="divide-y divide-border/60">
            {connections.map((connection) => {
              const reauthOperationKey = `reauth:${connection._id}`;
              const showReauthCta = connection.health.warningLevel !== 'ok';
              const lastSync = connection.lastSyncedAtMs
                ? formatDateTime(connection.lastSyncedAtMs, intlLocale)
                : labels.never;

              return (
                <div key={connection._id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{connection.displayName}</div>
                      <div className="text-sm text-muted-foreground">
                        {connection.aspspCountry ?? labels.countryUnknown}
                      </div>
                    </div>
                    <Badge
                      variant={
                        connection.health.warningLevel === 'error'
                          ? 'destructive'
                          : connection.status === 'active'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {connection.status}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {labels.lastSync.replace('{date}', lastSync)}
                  </div>
                  <div
                    className={
                      connection.health.warningLevel === 'error'
                        ? 'mt-1 text-xs text-destructive'
                        : connection.health.warningLevel === 'warning'
                          ? 'mt-1 text-xs text-warning'
                          : 'mt-1 text-xs text-muted-foreground'
                    }
                  >
                    {formatConsentExpiry(connection.health.daysUntilExpiry, connection.accessValidUntil, t)}
                  </div>
                  {showReauthCta ? (
                    <Button
                      type="button"
                      variant={connection.health.requiresReauthorization ? 'default' : 'outline'}
                      size="sm"
                      className="mt-3 w-full"
                      disabled={isPending()}
                      onClick={() => onRenewConsent(connection._id)}
                    >
                      {isPending(reauthOperationKey) ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <RefreshCwIcon data-icon="inline-start" />
                      )}
                      {isPending(reauthOperationKey) ? labels.reconnecting : labels.reconnect}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
