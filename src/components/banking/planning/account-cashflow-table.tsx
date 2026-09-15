import * as React from 'react';
import {
  ArrowLeftRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  Link2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PiggyBankIcon,
  PlusIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';

import { formatIsoDateLabel, moneyAmountInputValue } from './helpers';
import { PlannedExpenseActionsMenu } from './planned-expense-actions';
import type { CashflowAccountGroup, CashflowItem, MoneyBoxFundingRow, PlannedExpense, PlannedTransfer } from './helpers';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Money } from '@/lib/money';
import { accountLabel } from '@/lib/accounts';
import { Amount } from '@/components/app/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMoneyList } from '@/lib/format';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { cashflowItemBadge } from '@/lib/planning-i18n';
import { cn } from '@/lib/utils';

function formatTotals(values: Array<Money>, locale: string, fallback: string) {
  return values.length === 0 ? fallback : formatMoneyList(values, locale, ' + ');
}

function sumByCurrency(items: Array<CashflowItem>, direction: CashflowItem['direction']) {
  const totals = new Map<string, bigint>();

  for (const item of items) {
    if (item.direction !== direction) continue;
    totals.set(item.amount.currency, (totals.get(item.amount.currency) ?? 0n) + item.amount.amountMinor);
  }

  return Array.from(totals, ([currency, amountMinor]) => ({ amountMinor, currency }));
}

function projectionLabel(status: CashflowAccountGroup['projectionStatus'], t: ReturnType<typeof useI18n>['t']) {
  if (status === 'pastCycle') {
    return t('planning.cashflow.notProjected');
  }

  if (status === 'currencyMismatch') {
    return t('planning.cashflow.balanceCurrencyMismatch');
  }

  if (status === 'missingBalance') {
    return t('planning.cashflow.balanceUnavailable');
  }

  return t('planning.cashflow.balanceProjected');
}

function balanceAfterLabel(
  item: CashflowItem,
  locale: string,
  t: ReturnType<typeof useI18n>['t'],
  maskValue: (value: string) => string,
) {
  if (item.projectedBalanceAfter) {
    return maskValue(formatMoney(item.projectedBalanceAfter, locale));
  }

  if (item.occurrencePayment) {
    return '—';
  }

  if (item.projectionStatus === 'pastCycle') {
    return t('planning.cashflow.notProjected');
  }

  if (item.projectionStatus === 'currencyMismatch') {
    return t('planning.cashflow.balanceCurrencyMismatch');
  }

  return t('planning.cashflow.balanceUnavailable');
}

function availableAfterLabel(
  item: CashflowItem,
  locale: string,
  t: ReturnType<typeof useI18n>['t'],
  maskValue: (value: string) => string,
) {
  if (item.projectedAvailableAfter) {
    return maskValue(formatMoney(item.projectedAvailableAfter, locale));
  }

  if (item.occurrencePayment) {
    return '—';
  }

  if (item.projectionStatus === 'pastCycle') {
    return t('planning.cashflow.notProjected');
  }

  if (item.projectionStatus === 'currencyMismatch') {
    return t('planning.cashflow.balanceCurrencyMismatch');
  }

  return t('planning.cashflow.balanceUnavailable');
}

function CreditStatementActions({
  isPending,
  onStatusChange,
  usageCycleId,
}: {
  isPending: boolean;
  onStatusChange: (usageCycleId: Id<'creditFacilityUsageCycles'>, status: 'paid' | 'cancelled') => void;
  usageCycleId: Id<'creditFacilityUsageCycles'> | undefined;
}) {
  const { t } = useI18n();

  if (!usageCycleId) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isPending}
          aria-label={t('planning.creditStatements.actions')}
        >
          {isPending ? <Spinner /> : <MoreHorizontalIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={isPending} onClick={() => onStatusChange(usageCycleId, 'paid')}>
            <CheckCircle2Icon />
            {t('planning.expenses.markPaid')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isPending}
            variant="destructive"
            onClick={() => onStatusChange(usageCycleId, 'cancelled')}
          >
            <XCircleIcon />
            {t('planning.expenses.cancel')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlannedTransferActions({
  isPending,
  onEdit,
  onDelete,
  onStatusChange,
  transfer,
}: {
  isPending: boolean;
  onEdit: (transfer: PlannedTransfer) => void;
  onDelete: (plannedTransferId: Id<'plannedTransactions'>) => void;
  onStatusChange: (plannedTransferId: Id<'plannedTransactions'>, status: 'completed') => void;
  transfer: PlannedTransfer | undefined;
}) {
  const { t } = useI18n();

  if (!transfer) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isPending}
          aria-label={t('planning.transfers.actions')}
        >
          {isPending ? <Spinner /> : <MoreHorizontalIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={isPending} onClick={() => onEdit(transfer)}>
            <PencilIcon />
            {t('planning.transfers.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isPending} onClick={() => onStatusChange(transfer._id, 'completed')}>
            <CheckCircle2Icon />
            {t('planning.expenses.markPaid')}
          </DropdownMenuItem>
          {transfer.status === 'planned' ? (
            <DropdownMenuItem disabled={isPending} variant="destructive" onClick={() => onDelete(transfer._id)}>
              <Trash2Icon />
              {t('planning.transfers.delete')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AccountCashflowTable({
  group,
  fundingRows,
  cycleOffset,
  cycleEndDate,
  cycleStartDate,
  isCreditStatementPending,
  isPlannedTransferPending,
  onCreditStatementStatusChange,
  onCreate,
  onCreateMoneyBox,
  onDeletePlannedTransfer,
  onEditPlannedExpense,
  onEditPlannedTransfer,
  onPlannedTransferStatusChange,
  onRegisterContribution,
  onSaveTransferAmount,
  plannedExpenseById,
  plannedTransferById,
}: {
  group: CashflowAccountGroup;
  fundingRows: Array<MoneyBoxFundingRow>;
  cycleOffset: number;
  cycleEndDate: string;
  cycleStartDate: string;
  isCreditStatementPending: (usageCycleId: Id<'creditFacilityUsageCycles'> | undefined) => boolean;
  isPlannedTransferPending: (plannedTransferId: Id<'plannedTransactions'> | undefined) => boolean;
  onCreditStatementStatusChange: (usageCycleId: Id<'creditFacilityUsageCycles'>, status: 'paid' | 'cancelled') => void;
  onCreate: (kind: 'expense' | 'transfer', accountId: Id<'financialAccounts'>) => void;
  onCreateMoneyBox: (expense: PlannedExpense) => void;
  onDeletePlannedTransfer: (plannedTransferId: Id<'plannedTransactions'>) => void;
  onEditPlannedExpense: (expense: PlannedExpense) => void;
  onEditPlannedTransfer: (transfer: PlannedTransfer) => void;
  onPlannedTransferStatusChange: (plannedTransferId: Id<'plannedTransactions'>, status: 'completed') => void;
  onRegisterContribution: (moneyBoxId: Id<'moneyBoxes'>, mode: 'quick' | 'transaction', suggestedAmount: Money) => void;
  onSaveTransferAmount: (plannedTransferId: Id<'plannedTransactions'>, value: string) => Promise<boolean>;
  plannedExpenseById: Map<string, PlannedExpense>;
  plannedTransferById: Map<string, PlannedTransfer>;
}) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const openingBalance = cycleOffset === 0 ? group.latestBalance?.amount : group.startingBalance;
  const hasOverdraft = Boolean(group.overdraftLimitAmount);
  const inflowTotals = sumByCurrency(group.items, 'inflow');
  const outflowTotals = sumByCurrency(group.items, 'outflow');
  const [editingTransferId, setEditingTransferId] = React.useState<Id<'plannedTransactions'> | null>(null);
  const [editingAmount, setEditingAmount] = React.useState('');

  async function saveTransferAmount(transfer: PlannedTransfer) {
    const saved = await onSaveTransferAmount(transfer._id, editingAmount);
    if (saved) {
      setEditingTransferId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-md border">
      <div className="flex flex-col gap-3 border-b bg-muted/30 p-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-medium">
            {group.account ? accountLabel(group.account) : t('planning.cashflow.unknownAccount')}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span>{projectionLabel(group.projectionStatus, t)}</span>
          </div>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-3 md:text-right">
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t('planning.cashflow.totalIn')}</div>
            <div className="font-mono tabular-nums">
              {maskValue(formatTotals(inflowTotals, intlLocale, t('planning.cashflow.none')))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t('planning.cashflow.totalOut')}</div>
            <div className="font-mono tabular-nums">
              {maskValue(formatTotals(outflowTotals, intlLocale, t('planning.cashflow.none')))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{t('planning.cashflow.firstNegativeDate')}</div>
            <div className={cn('font-mono tabular-nums', group.firstNegativeDate ? 'text-destructive' : undefined)}>
              {group.firstNegativeDate
                ? formatIsoDateLabel(group.firstNegativeDate, intlLocale)
                : t('planning.cashflow.noNegativeDate')}
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('planning.cashflow.table.date')}</TableHead>
              <TableHead>{t('planning.cashflow.table.payment')}</TableHead>
              <TableHead>{t('planning.cashflow.table.type')}</TableHead>
              <TableHead className="text-right">{t('planning.cashflow.table.out')}</TableHead>
              <TableHead className="text-right">{t('planning.cashflow.table.in')}</TableHead>
              <TableHead className="text-right">{t('planning.cashflow.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/30 font-medium">
              <TableCell className="font-mono tabular-nums">{formatIsoDateLabel(cycleStartDate, intlLocale)}</TableCell>
              <TableCell className="font-medium">{t('planning.cashflow.openingBalance')}</TableCell>
              <TableCell />
              <TableCell colSpan={2} className="text-right font-mono tabular-nums">
                {group.projectionStatus === 'pastCycle' ? (
                  t('planning.cashflow.notProjected')
                ) : openingBalance ? (
                  hasOverdraft && group.startingAvailable ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Amount money={openingBalance} variant="balance" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('planning.cashflow.table.availableAfter')}:{' '}
                        {maskValue(formatMoney(group.startingAvailable, intlLocale))}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Amount money={openingBalance} variant="balance" />
                  )
                ) : (
                  t('planning.cashflow.balanceUnavailable')
                )}
              </TableCell>
              <TableCell />
            </TableRow>
            {group.items.map((item) => {
              const badge = cashflowItemBadge(item);
              // Marked on the accounting position, like the header date: an overdraft absorbs the
              // row without the account holding the money, so it must not silence the warning.
              const isProjectedNegative =
                item.projectedBalanceAfter && item.projectedBalanceAfter.amountMinor < 0n;
              const isPaid = Boolean(item.occurrencePayment);
              const plannedTransfer = item.plannedTransferId
                ? plannedTransferById.get(item.plannedTransferId)
                : undefined;
              const isEditingTransfer =
                plannedTransfer?.status === 'planned' && editingTransferId === plannedTransfer._id;
              const amountContent = isEditingTransfer ? (
                <div className="flex items-center justify-end gap-1">
                  <Input
                    className="h-7 w-24 text-right font-mono"
                    defaultValue={moneyAmountInputValue(plannedTransfer.amount)}
                    autoFocus
                    disabled={isPlannedTransferPending(plannedTransfer._id)}
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={() => setEditingTransferId(null)}
                    onChange={(event) => setEditingAmount(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingTransferId(null);
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void saveTransferAmount(plannedTransfer);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={isPlannedTransferPending(plannedTransfer._id)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void saveTransferAmount(plannedTransfer)}
                    aria-label={t('common.save')}
                  >
                    {isPlannedTransferPending(plannedTransfer._id) ? <Spinner /> : <CheckIcon />}
                  </Button>
                </div>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Amount
                        money={item.amount}
                        variant="signed"
                        direction={item.direction === 'inflow' ? 'CRDT' : 'DBIT'}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="flex flex-col gap-1 text-xs">
                      <div>
                        {t('planning.cashflow.table.balanceAfter')}: {balanceAfterLabel(item, intlLocale, t, maskValue)}
                      </div>
                      {hasOverdraft ? (
                        <div>
                          {t('planning.cashflow.table.availableAfter')}:{' '}
                          {availableAfterLabel(item, intlLocale, t, maskValue)}
                        </div>
                      ) : null}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );

              return (
                <TableRow
                  key={item.key}
                  className={cn(
                    'border-l-2',
                    isProjectedNegative ? 'border-l-destructive' : 'border-l-transparent',
                    isPaid ? 'text-muted-foreground' : undefined,
                  )}
                >
                  <TableCell className="font-mono tabular-nums">
                    {formatIsoDateLabel(item.dueDate, intlLocale)}
                  </TableCell>
                  <TableCell>
                    <div className="min-w-48">
                      <div className="font-medium">{item.title}</div>
                      {item.subtitle ? (
                        <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                      ) : null}
                      {item.source === 'creditInstallment' && item.creditPlanCount ? (
                        <div className="text-xs text-muted-foreground">
                          {t('planning.creditRepayments.planCount', { count: item.creditPlanCount })}
                        </div>
                      ) : null}
                      {item.source === 'creditStatement' && item.creditCycleMonth ? (
                        <div className="text-xs text-muted-foreground">
                          {t('planning.creditStatements.cycleMonth', { month: item.creditCycleMonth })}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={badge.variant}>{t(badge.key)}</Badge>
                      {isPaid ? (
                        <Badge variant="outline">{t('planning.cashflow.reconciled')}</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  {(['outflow', 'inflow'] as const).map((direction) => (
                    <TableCell
                      key={direction}
                      className={cn(
                        'text-right font-mono tabular-nums',
                        item.direction === direction && plannedTransfer?.status === 'planned' ? 'cursor-text' : undefined,
                      )}
                      title={
                        item.direction === direction && plannedTransfer?.status === 'planned'
                          ? t('planning.transfers.amountEditHint')
                          : undefined
                      }
                      onDoubleClick={() => {
                        if (item.direction !== direction || plannedTransfer?.status !== 'planned') return;
                        setEditingTransferId(plannedTransfer._id);
                        setEditingAmount(moneyAmountInputValue(plannedTransfer.amount));
                      }}
                    >
                      {item.direction === direction ? amountContent : null}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <PlannedExpenseActionsMenu
                        plannedExpenseId={item.plannedExpenseId}
                        status={item.plannedExpenseStatus}
                        hasMoneyBox={Boolean(item.plannedExpenseMoneyBoxId)}
                        plannedExpense={
                          item.plannedExpenseId ? plannedExpenseById.get(item.plannedExpenseId) : undefined
                        }
                        dueDate={item.dueDate}
                        occurrencePayment={item.occurrencePayment}
                        onCreateMoneyBox={onCreateMoneyBox}
                        onEdit={onEditPlannedExpense}
                      />
                      {item.source === 'creditStatement' ? (
                        <CreditStatementActions
                          usageCycleId={item.creditUsageCycleId}
                          isPending={isCreditStatementPending(item.creditUsageCycleId)}
                          onStatusChange={onCreditStatementStatusChange}
                        />
                      ) : null}
                      {item.source === 'plannedTransfer' ? (
                        <PlannedTransferActions
                          transfer={plannedTransfer}
                          isPending={isPlannedTransferPending(item.plannedTransferId)}
                          onEdit={onEditPlannedTransfer}
                          onDelete={onDeletePlannedTransfer}
                          onStatusChange={onPlannedTransferStatusChange}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/30 font-medium">
              <TableCell className="font-mono tabular-nums">{formatIsoDateLabel(cycleEndDate, intlLocale)}</TableCell>
              <TableCell className="font-medium">{t('planning.cashflow.closingBalance')}</TableCell>
              <TableCell />
              <TableCell colSpan={2} className="text-right font-mono tabular-nums">
                {group.projectionStatus === 'pastCycle' ? (
                  t('planning.cashflow.notProjected')
                ) : group.projectedEndBalance ? (
                  hasOverdraft && group.projectedEndAvailable ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Amount money={group.projectedEndBalance} variant="balance" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('planning.cashflow.table.availableAfter')}:{' '}
                        {maskValue(formatMoney(group.projectedEndAvailable, intlLocale))}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Amount money={group.projectedEndBalance} variant="balance" />
                  )
                ) : (
                  t('planning.cashflow.balanceUnavailable')
                )}
              </TableCell>
              <TableCell />
            </TableRow>
            {fundingRows
              .filter((funding) => funding.monthlyRequiredAmount.amountMinor > 0n)
              .map((funding) => {
                const contributed = funding.cycleContributedAmount.amountMinor;
                const required = funding.monthlyRequiredAmount.amountMinor;
                const covered = contributed >= required;
                const suggestedAmount = {
                  amountMinor: covered ? 0n : required - contributed,
                  currency: funding.monthlyRequiredAmount.currency,
                };
                return (
                  <TableRow key={`money-box-funding:${funding.moneyBoxId}`} className="text-muted-foreground">
                    <TableCell className="font-mono tabular-nums">—</TableCell>
                    <TableCell className="font-medium">
                      {t('planning.moneyBoxes.accrualRow', { name: funding.name })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{t('planning.cashflow.source.moneyBox')}</Badge>
                        {covered ? <Badge variant="secondary">{t('planning.moneyBoxes.accrualDone')}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {contributed > 0n ? (
                        t('planning.moneyBoxes.accrualProgress', {
                          contributed: maskValue(formatMoney(funding.cycleContributedAmount, intlLocale)),
                          required: maskValue(formatMoney(funding.monthlyRequiredAmount, intlLocale)),
                        })
                      ) : (
                        <Amount money={funding.monthlyRequiredAmount} variant="neutral" />
                      )}
                    </TableCell>
                    <TableCell />
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              disabled={covered}
                              aria-label={t('planning.moneyBoxes.registerContribution')}
                              onClick={() => onRegisterContribution(funding.moneyBoxId, 'quick', suggestedAmount)}
                            >
                              <PiggyBankIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('planning.moneyBoxes.registerContribution')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              disabled={covered}
                              aria-label={t('planning.moneyBoxes.registerFromTransaction')}
                              onClick={() => onRegisterContribution(funding.moneyBoxId, 'transaction', suggestedAmount)}
                            >
                              <Link2Icon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('planning.moneyBoxes.registerFromTransaction')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
      {group.account ? (
        <div className="flex justify-end gap-1 border-t bg-muted/30 p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={t('planning.cashflow.addExpense')} onClick={() => onCreate('expense', group.account!._id)}>
                <PlusIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('planning.cashflow.addExpense')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={t('planning.cashflow.addTransfer')} onClick={() => onCreate('transfer', group.account!._id)}>
                <ArrowLeftRightIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('planning.cashflow.addTransfer')}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </section>
  );
}
