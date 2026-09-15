import { useQuery } from 'convex/react';
import { ArrowLeftRightIcon, ArrowUpFromLineIcon, PenLineIcon, PiggyBankIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import type { Doc } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { accountLabel } from '@/lib/accounts';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export function MoneyBoxActivitySheet({
  moneyBox,
  onOpenChange,
  open,
}: {
  moneyBox: Doc<'moneyBoxes'> | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { intlLocale, t } = useI18n();
  const activity = useQuery(
    api.banking.planning.listMoneyBoxContributions,
    open && moneyBox ? { moneyBoxId: moneyBox._id, limit: 100 } : 'skip',
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader className="pr-14 pb-4">
          <SheetTitle>{moneyBox?.name ?? t('planning.moneyBoxes.activityTitle')}</SheetTitle>
          <SheetDescription>{t('planning.moneyBoxes.activityDescription')}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-1 px-6 pb-6">
          <div className="flex items-center justify-between rounded-lg bg-muted p-4">
            <span className="text-sm text-muted-foreground">{t('planning.moneyBoxes.savedLabel')}</span>
            {moneyBox ? <Amount money={moneyBox.savedAmount} variant="neutral" /> : null}
          </div>
          {activity === undefined ? (
            <div className="flex min-h-48 items-center justify-center">
              <Spinner />
            </div>
          ) : activity.length === 0 ? (
            <EmptyState
              icon={PiggyBankIcon}
              title={t('planning.moneyBoxes.activityEmpty')}
              hint={t('planning.moneyBoxes.activityEmptyDescription')}
            />
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col divide-y divide-border/60">
                {activity.map(({ account, contribution, transaction }) => {
                  const isWithdrawal = contribution.kind === 'withdrawal' || contribution.amount.amountMinor < 0n;
                  const Icon = transaction ? ArrowLeftRightIcon : isWithdrawal ? ArrowUpFromLineIcon : PenLineIcon;
                  const absoluteAmountMinor =
                    contribution.amount.amountMinor < 0n
                      ? -contribution.amount.amountMinor
                      : contribution.amount.amountMinor;
                  const displayAmount = {
                    amountMinor: isWithdrawal ? -absoluteAmountMinor : absoluteAmountMinor,
                    currency: contribution.amount.currency,
                  };
                  return (
                    <div key={contribution._id} className="flex items-center gap-3 py-4">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {transaction?.counterpartyName ??
                              transaction?.description ??
                              t(
                                isWithdrawal
                                  ? 'goals.saveUp.activity.manualWithdrawal'
                                  : 'planning.moneyBoxes.manualContribution',
                              )}
                          </span>
                          {isWithdrawal ? (
                            <Badge variant="destructive">{t('goals.saveUp.activity.withdrawal')}</Badge>
                          ) : null}
                          <Badge variant="secondary">
                            {transaction
                              ? t('planning.moneyBoxes.transactionSource')
                              : t('planning.moneyBoxes.manualSource')}
                          </Badge>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {formatIsoDate(contribution.contributionDate, intlLocale)}
                          {account ? ` · ${accountLabel(account)}` : ''}
                        </div>
                      </div>
                      <Amount money={displayAmount} variant="balance" />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
