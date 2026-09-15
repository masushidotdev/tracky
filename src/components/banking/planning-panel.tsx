import * as React from 'react';

import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';

import { api } from '../../../convex/_generated/api';

import { CashflowSection } from './planning/cashflow-section';
import { CreatePlannedExpenseDialog } from './planning/create-planned-expense-form';
import { CreatePlannedTransferDialog } from './planning/create-planned-transfer-form';
import { CreditRepaymentsCard } from './planning/credit-repayments-card';
import { EditPlannedExpenseDialog } from './planning/edit-planned-expense-dialog';
import { EditPlannedTransferDialog } from './planning/edit-planned-transfer-dialog';
import { MoneyBoxesSection } from './planning/money-boxes-card';
import { MoneyBoxFormDialog } from './planning/money-box-form-dialog';
import { MoneyBoxActivitySheet } from './planning/money-box-activity-sheet';
import { RegisterContributionDialog } from './planning/register-contribution-dialog';
import { PlannedExpensesCard } from './planning/planned-expenses-card';
import { SuggestionsCard } from './planning/suggestions-card';
import type { PlannedExpense, PlannedTransfer } from './planning/helpers';
import type { MoneyBoxPrefill } from './planning/money-box-form-dialog';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import type { Money } from '@/lib/money';

type CreateDialog = { kind: 'expense' | 'transfer'; accountId?: Id<'financialAccounts'> } | null;
type MoneyBoxFormState = { moneyBox?: Doc<'moneyBoxes'>; prefill?: MoneyBoxPrefill } | null;
type ContributionState = {
  moneyBox: Doc<'moneyBoxes'>;
  mode: 'quick' | 'transaction';
  suggestedAmount?: Money;
} | null;

export function PlanningPanel() {
  const { data: accounts } = useQuery(convexQuery(api.banking.accounts.listAccounts, { limit: 100 }));
  const { data: categories } = useQuery(convexQuery(api.banking.categories.listCategories, { limit: 100 }));
  const { data: plannedExpenses } = useQuery(convexQuery(api.banking.planning.listPlannedExpenses, { limit: 20 }));
  const { data: plannedTransfers } = useQuery(convexQuery(api.banking.planning.listPlannedTransfers, { limit: 100 }));
  const { data: moneyBoxFundingPlans } = useQuery(
    convexQuery(api.banking.planning.listMoneyBoxFundingPlans, { status: 'active', limit: 20 }),
  );
  const [editingPlannedExpense, setEditingPlannedExpense] = React.useState<PlannedExpense | null>(null);
  const [editingPlannedTransfer, setEditingPlannedTransfer] = React.useState<PlannedTransfer | null>(null);
  const [createDialog, setCreateDialog] = React.useState<CreateDialog>(null);
  const [moneyBoxForm, setMoneyBoxForm] = React.useState<MoneyBoxFormState>(null);
  const [contribution, setContribution] = React.useState<ContributionState>(null);
  const [activityMoneyBox, setActivityMoneyBox] = React.useState<Doc<'moneyBoxes'> | null>(null);

  const plannedExpenseById = React.useMemo(() => {
    const byId = new Map<string, PlannedExpense>();
    for (const expense of plannedExpenses ?? []) {
      byId.set(expense._id, expense);
    }
    return byId;
  }, [plannedExpenses]);

  const plannedTransferById = React.useMemo(() => {
    const byId = new Map<string, PlannedTransfer>();
    for (const transfer of plannedTransfers ?? []) {
      byId.set(transfer._id, transfer);
    }
    return byId;
  }, [plannedTransfers]);

  function createMoneyBoxFromExpense(expense: PlannedExpense) {
    setMoneyBoxForm({
      prefill: {
        name: expense.name,
        targetAmount: expense.amount,
        targetDate: expense.dueDate,
        plannedExpenseId: expense._id,
        accountId: expense.accountId ?? undefined,
      },
    });
  }

  function registerContributionFromAccrual(
    moneyBoxId: Id<'moneyBoxes'>,
    mode: 'quick' | 'transaction',
    suggestedAmount: Money,
  ) {
    const moneyBox = moneyBoxFundingPlans?.find((plan) => plan.moneyBox._id === moneyBoxId)?.moneyBox;
    if (moneyBox) setContribution({ moneyBox, mode, suggestedAmount });
  }

  return (
    <div className="flex flex-col gap-4">
      <EditPlannedExpenseDialog
        expense={editingPlannedExpense}
        accounts={accounts}
        categories={categories}
        onClose={() => setEditingPlannedExpense(null)}
      />
      <EditPlannedTransferDialog
        transfer={editingPlannedTransfer}
        accounts={accounts}
        onClose={() => setEditingPlannedTransfer(null)}
      />
      <CreatePlannedExpenseDialog
        accountId={createDialog?.kind === 'expense' ? createDialog.accountId : undefined}
        accounts={accounts}
        open={createDialog?.kind === 'expense'}
        onOpenChange={(open) => {
          if (!open) setCreateDialog(null);
        }}
      />
      <CreatePlannedTransferDialog
        accountId={createDialog?.kind === 'transfer' ? createDialog.accountId : undefined}
        accounts={accounts}
        open={createDialog?.kind === 'transfer'}
        onOpenChange={(open) => {
          if (!open) setCreateDialog(null);
        }}
      />
      <MoneyBoxFormDialog
        open={moneyBoxForm !== null}
        onOpenChange={(open) => {
          if (!open) setMoneyBoxForm(null);
        }}
        accounts={accounts}
        moneyBox={moneyBoxForm?.moneyBox}
        prefill={moneyBoxForm?.prefill}
      />
      <RegisterContributionDialog
        open={contribution !== null}
        onOpenChange={(open) => {
          if (!open) setContribution(null);
        }}
        moneyBox={contribution?.moneyBox ?? null}
        mode={contribution?.mode ?? 'quick'}
        funding={{ suggestedAmount: contribution?.suggestedAmount }}
      />
      <MoneyBoxActivitySheet
        open={activityMoneyBox !== null}
        moneyBox={activityMoneyBox}
        onOpenChange={(open) => {
          if (!open) setActivityMoneyBox(null);
        }}
      />

      <CashflowSection
        plannedExpenseById={plannedExpenseById}
        plannedTransferById={plannedTransferById}
        onEditPlannedExpense={setEditingPlannedExpense}
        onEditPlannedTransfer={setEditingPlannedTransfer}
        onCreate={(kind, accountId) => setCreateDialog({ kind, accountId })}
        onCreateMoneyBox={createMoneyBoxFromExpense}
        onRegisterContribution={registerContributionFromAccrual}
      />

      <MoneyBoxesSection
        fundingPlans={moneyBoxFundingPlans}
        onCreate={() => setMoneyBoxForm({})}
        onEdit={(moneyBox) => setMoneyBoxForm({ moneyBox })}
        onRegisterContribution={(moneyBox) => setContribution({ moneyBox, mode: 'quick' })}
        onViewActivity={setActivityMoneyBox}
      />

      <div className="flex flex-col gap-4">
        <SuggestionsCard />
        <CreditRepaymentsCard />
        <PlannedExpensesCard
          plannedExpenses={plannedExpenses}
          onCreate={() => setCreateDialog({ kind: 'expense' })}
          onCreateMoneyBox={createMoneyBoxFromExpense}
          onEditPlannedExpense={setEditingPlannedExpense}
        />
      </div>
    </div>
  );
}
