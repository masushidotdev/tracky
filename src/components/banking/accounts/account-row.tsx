import {
  AlertCircleIcon,
  CheckCircle2Icon,
  EllipsisIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  RefreshCwIcon,
} from 'lucide-react';

import { formatConsentExpiry } from './helpers';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { TranslationKey } from '@/lib/i18n';
import { Amount } from '@/components/app/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { accountLabel } from '@/lib/accounts';
import { formatDateTime, formatIsoDate } from '@/lib/format';

export type SyncOverviewRow = {
  account: Doc<'financialAccounts'>;
  connection: {
    _id: Id<'providerConnections'>;
    accessValidUntil?: string;
    displayName: string;
  } | null;
  connectionHealth: {
    daysUntilExpiry: number | null;
    requiresReauthorization: boolean;
    warningLevel: string;
  } | null;
  latestBalance?: {
    amount: {
      amountMinor: bigint;
      currency: string;
    };
    balanceType: string;
    referenceDate?: string;
  } | null;
  overdraftLimit?: {
    amountMinor: bigint;
    currency: string;
  } | null;
  availableBalance?: {
    amountMinor: bigint;
    currency: string;
  } | null;
  syncState: {
    _id: string;
    backfillFromDate: string;
    lastErrorMessage?: string;
    nextSyncAfterMs?: number;
    status: string;
  } | null;
};

type AccountRowProps = {
  alias: string;
  intlLocale: string;
  isPending: (key?: string) => boolean;
  isEditing: boolean;
  labels: {
    actions: string;
    aliasLabel: string;
    aliasPlaceholder: string;
    backfillFrom: string;
    balanceEmpty: string;
    cancel: string;
    hidden: string;
    hide: string;
    manual: string;
    manualNoSync: string;
    never: string;
    nextSync: string;
    off: string;
    on: string;
    pause: string;
    reconnect: string;
    reconnecting: string;
    reconnectRequired: string;
    rename: string;
    resume: string;
    save: string;
    show: string;
    syncNow: string;
    syncing: string;
    typeAsset: string;
    typeCard: string;
    typeCash: string;
    typeChecking: string;
    typeInvestment: string;
    typeSavings: string;
    updateBalance: string;
    withOverdraft: string;
  };
  onAliasChange: (alias: string) => void;
  onBeginEditing: () => void;
  onCancelEditing: () => void;
  onRefreshAccount: (accountId: Id<'financialAccounts'>) => void;
  onRenewConsent: (connectionId: Id<'providerConnections'>) => void;
  onSaveAlias: () => void;
  onSetAccountHidden: (accountId: Id<'financialAccounts'>, hidden: boolean) => void;
  onToggleSync: (accountId: Id<'financialAccounts'>, syncEnabled: boolean) => void;
  onUpdateBalance: (row: SyncOverviewRow) => void;
  row: SyncOverviewRow;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

export function AccountRow({
  alias,
  intlLocale,
  isPending,
  isEditing,
  labels,
  onAliasChange,
  onBeginEditing,
  onCancelEditing,
  onRefreshAccount,
  onRenewConsent,
  onSaveAlias,
  onSetAccountHidden,
  onToggleSync,
  onUpdateBalance,
  row,
  t,
}: AccountRowProps) {
  const { account, availableBalance, connection, connectionHealth, latestBalance, syncState } = row;
  const isManual = account.provider === 'manual';
  const isManualAsset = isManual && (account.accountType === 'INVS' || account.accountType === 'ASST');
  const isRateLimited =
    syncState !== null && syncState.status === 'rateLimited' && (syncState.nextSyncAfterMs ?? 0) > Date.now();
  const syncDisabled =
    !account.syncEnabled ||
    syncState?.status === 'paused' ||
    isRateLimited ||
    Boolean(connectionHealth?.requiresReauthorization);
  const toggleOperationKey = `toggle:${account._id}`;
  const syncOperationKey = `sync:${account._id}`;
  const reauthOperationKey = connection ? `reauth:${connection._id}` : undefined;
  const nextSync = syncState?.nextSyncAfterMs ? formatDateTime(syncState.nextSyncAfterMs, intlLocale) : labels.never;
  const metadata = [
    account.institutionName ?? connection?.displayName,
    [
      account.accountType === 'CARD'
        ? labels.typeCard
        : account.accountType === 'CASH'
          ? labels.typeCash
          : account.accountType === 'CACC'
          ? labels.typeChecking
          : account.accountType === 'SVGS'
            ? labels.typeSavings
            : account.accountType === 'INVS'
              ? labels.typeInvestment
              : account.accountType === 'ASST'
                ? labels.typeAsset
                : account.accountType,
      account.accountSubtype,
    ]
      .filter(Boolean)
      .join('/'),
    account.ibanMasked,
    account.provider,
  ]
    .filter(Boolean)
    .join(' · ');
  const balanceReferenceDate = latestBalance?.referenceDate
    ? formatIsoDate(latestBalance.referenceDate, intlLocale)
    : undefined;

  return (
    <div className={account.hidden ? 'py-4 opacity-60 first:pt-0 last:pb-0' : 'py-4 first:pt-0 last:pb-0'}>
      <div className="flex gap-3">
        {account.hidden ? (
          <EyeOffIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        ) : isManual || syncState?.status === 'active' ? (
          <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-positive" />
        ) : (
          <AlertCircleIcon className="mt-0.5 size-5 shrink-0 text-warning" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{accountLabel(account)}</span>
                <Badge variant="outline">{account.currency}</Badge>
                {isManual ? <Badge variant="secondary">{labels.manual}</Badge> : null}
                {account.hidden ? <Badge variant="outline">{labels.hidden}</Badge> : null}
                {connectionHealth?.requiresReauthorization ? (
                  <Badge variant="destructive">{labels.reconnectRequired}</Badge>
                ) : null}
              </div>
              {metadata ? <div className="mt-1 text-sm text-muted-foreground">{metadata}</div> : null}
            </div>
            <div className="shrink-0 text-sm text-muted-foreground md:text-right">
              {latestBalance ? (
                <>
                  <Amount variant="balance" money={latestBalance.amount} className="block text-base font-semibold" />
                  <div className="text-xs text-muted-foreground">
                    {latestBalance.balanceType}
                    {balanceReferenceDate ? ` · ${balanceReferenceDate}` : ''}
                  </div>
                  {/* The accounting position is what the rest of the app counts as money; the
                      arranged overdraft is spendable but borrowed, so it stays a hint here. */}
                  {availableBalance ? (
                    <div className="text-xs text-muted-foreground">
                      {labels.withOverdraft} <Amount variant="balance" money={availableBalance} />
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-xs text-muted-foreground">{labels.balanceEmpty}</div>
              )}
            </div>
          </div>
          {syncState ? (
            <div className="mt-2 text-xs text-muted-foreground">
              {account.syncEnabled ? labels.on : labels.off} · {labels.nextSync.replace('{date}', nextSync)} ·{' '}
              {labels.backfillFrom.replace('{date}', syncState.backfillFromDate)}
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">{labels.manualNoSync}</div>
          )}
          {connectionHealth && connection && connectionHealth.warningLevel !== 'ok' ? (
            <div
              className={
                connectionHealth.warningLevel === 'error'
                  ? 'mt-2 text-sm text-destructive'
                  : 'mt-2 text-sm text-warning'
              }
            >
              {formatConsentExpiry(connectionHealth.daysUntilExpiry, connection.accessValidUntil, t)}
            </div>
          ) : null}
          {syncState?.lastErrorMessage ? (
            <div className="mt-2 text-sm text-destructive">{syncState.lastErrorMessage}</div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            {syncState ? (
              <div className="flex items-center gap-2">
                {isPending(toggleOperationKey) ? (
                  <Spinner className="size-4" />
                ) : (
                  <Switch
                    aria-label={account.syncEnabled ? labels.pause : labels.resume}
                    checked={account.syncEnabled}
                    disabled={isPending() || Boolean(connectionHealth?.requiresReauthorization)}
                    size="sm"
                    onCheckedChange={(syncEnabled) => onToggleSync(account._id, syncEnabled)}
                  />
                )}
                <span className="text-xs text-muted-foreground">{account.syncEnabled ? labels.on : labels.off}</span>
              </div>
            ) : null}
            {syncState ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending() || syncDisabled}
                onClick={() => onRefreshAccount(account._id)}
              >
                {isPending(syncOperationKey) ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                {isPending(syncOperationKey) ? labels.syncing : labels.syncNow}
              </Button>
            ) : null}
            {connectionHealth?.requiresReauthorization && connection ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isPending()}
                onClick={() => onRenewConsent(connection._id)}
              >
                {isPending(reauthOperationKey) ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                {isPending(reauthOperationKey) ? labels.reconnecting : labels.reconnect}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon-sm" className="ml-auto" aria-label={labels.actions}>
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isManualAsset ? (
                  <DropdownMenuItem disabled={isPending()} onSelect={() => onUpdateBalance(row)}>
                    <RefreshCwIcon />
                    {labels.updateBalance}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem disabled={isPending()} onSelect={onBeginEditing}>
                  <PencilIcon />
                  {labels.rename}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isPending()} onSelect={() => onSetAccountHidden(account._id, !account.hidden)}>
                  {account.hidden ? <EyeIcon /> : <EyeOffIcon />}
                  {account.hidden ? labels.show : labels.hide}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {isEditing ? (
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                onSaveAlias();
              }}
            >
              <Input
                aria-label={labels.aliasLabel}
                autoFocus
                value={alias}
                placeholder={labels.aliasPlaceholder}
                onChange={(event) => onAliasChange(event.target.value)}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isPending()}>
                  {labels.save}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={isPending()} onClick={onCancelEditing}>
                  {labels.cancel}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
