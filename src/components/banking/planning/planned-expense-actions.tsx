import * as React from 'react';
import { useMutation } from 'convex/react';
import {
  CheckCircle2Icon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PiggyBankIcon,
  RotateCcwIcon,
  WalletCardsIcon,
  XCircleIcon,
} from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import { LinkPlannedExpenseTransactionDialog } from './link-planned-expense-transaction-dialog';
import type { CashflowItem, PlannedExpense } from './helpers';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlannedExpenseStatus } from '@/lib/planning-i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';

export function PlannedExpenseActionsMenu({
  plannedExpenseId,
  status,
  hasMoneyBox,
  plannedExpense,
  dueDate,
  occurrencePayment,
  onEdit,
  onCreateMoneyBox,
}: {
  plannedExpenseId: Id<'plannedTransactions'> | undefined;
  status: PlannedExpenseStatus | undefined;
  hasMoneyBox: boolean;
  plannedExpense?: PlannedExpense;
  dueDate?: string;
  occurrencePayment?: CashflowItem['occurrencePayment'];
  onEdit: (expense: PlannedExpense) => void;
  onCreateMoneyBox?: (expense: PlannedExpense) => void;
}) {
  const { t } = useI18n();
  const updatePlannedExpenseStatus = useMutation(api.banking.planning.updatePlannedExpenseStatus);
  const markOccurrencePaid = useMutation(api.banking.planning.markPlannedExpenseOccurrencePaid);
  const reopenOccurrence = useMutation(api.banking.planning.reopenPlannedExpenseOccurrence);
  const { isPending, run } = usePendingAction();
  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);

  if (!plannedExpenseId || !status) {
    return null;
  }

  function changeStatus(nextStatus: PlannedExpenseStatus) {
    if (!plannedExpenseId) {
      return;
    }

    void run(
      `planned-expense-status:${plannedExpenseId}`,
      async () => {
        await updatePlannedExpenseStatus({ plannedExpenseId, status: nextStatus });
      },
      {
        success: t('planning.expenses.statusUpdated'),
        error: t('planning.expenses.statusUpdateFailed'),
      },
    );
  }

  function changeOccurrenceStatus(nextStatus: 'paid' | 'reopened') {
    if (!plannedExpenseId || !dueDate) {
      return;
    }

    void run(
      `planned-expense-occurrence:${plannedExpenseId}:${dueDate}`,
      async () => {
        if (nextStatus === 'paid') {
          await markOccurrencePaid({ plannedExpenseId, dueDate });
        } else {
          await reopenOccurrence({ plannedExpenseId, dueDate });
        }
      },
      {
        success: t('planning.expenses.occurrenceUpdated'),
        error: t('planning.expenses.occurrenceUpdateFailed'),
      },
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={isPending()}
            aria-label={t('planning.expenses.actions')}
          >
            {isPending() ? <Spinner /> : <MoreHorizontalIcon />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {plannedExpense ? (
              <DropdownMenuItem onClick={() => onEdit(plannedExpense)}>
                <PencilIcon />
                {t('planning.expenses.edit')}
              </DropdownMenuItem>
            ) : null}
            {plannedExpense && !hasMoneyBox && (plannedExpense.direction ?? 'outflow') === 'outflow' ? (
              <DropdownMenuItem onClick={() => onCreateMoneyBox?.(plannedExpense)}>
                <PiggyBankIcon />
                {t('planning.expenses.createMoneyBox')}
              </DropdownMenuItem>
            ) : null}
            {dueDate ? (
              occurrencePayment ? (
                <DropdownMenuItem disabled={isPending()} onClick={() => changeOccurrenceStatus('reopened')}>
                  <RotateCcwIcon />
                  {t('planning.expenses.reopenOccurrence')}
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem disabled={isPending()} onClick={() => changeOccurrenceStatus('paid')}>
                    <CheckCircle2Icon />
                    {t('planning.expenses.markOccurrencePaid')}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={isPending()} onClick={() => setLinkDialogOpen(true)}>
                    <LinkIcon />
                    {t('planning.expenses.linkTransaction')}
                  </DropdownMenuItem>
                </>
              )
            ) : status !== 'paid' ? (
              <DropdownMenuItem disabled={isPending()} onClick={() => changeStatus('paid')}>
                <CheckCircle2Icon />
                {t('planning.expenses.markPaid')}
              </DropdownMenuItem>
            ) : null}
            {hasMoneyBox && status !== 'funding' ? (
              <DropdownMenuItem disabled={isPending()} onClick={() => changeStatus('funding')}>
                <WalletCardsIcon />
                {t('planning.expenses.markFunding')}
              </DropdownMenuItem>
            ) : null}
            {!dueDate && status !== 'planned' ? (
              <DropdownMenuItem disabled={isPending()} onClick={() => changeStatus('planned')}>
                <RotateCcwIcon />
                {t('planning.expenses.reopen')}
              </DropdownMenuItem>
            ) : null}
            {status !== 'cancelled' ? (
              <DropdownMenuItem disabled={isPending()} variant="destructive" onClick={() => changeStatus('cancelled')}>
                <XCircleIcon />
                {t('planning.expenses.cancel')}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {plannedExpenseId && dueDate ? (
        <LinkPlannedExpenseTransactionDialog
          plannedExpenseId={plannedExpenseId}
          dueDate={dueDate}
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
        />
      ) : null}
    </>
  );
}
