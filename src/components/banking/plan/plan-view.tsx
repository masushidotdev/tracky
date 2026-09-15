import * as React from 'react';
import { useMutation } from 'convex/react';
import { AlertTriangleIcon, WalletCardsIcon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../../convex/_generated/api';
import { AutoAssignDialog } from './auto-assign-dialog';
import { CostToBeMe } from './cost-to-be-me';
import { CreatePlanSheet } from './create-plan-sheet';
import { PlanAccountsSheet } from './plan-accounts-sheet';
import { PlanActivitySheet } from './plan-activity-sheet';
import { PlanAddCategoryDialog } from './plan-add-category-dialog';
import { PlanAssignedSheet } from './plan-assigned-sheet';
import { PlanBucketInspector, PlanInspectorColumn } from './plan-bucket-inspector';
import { PlanEditMode } from './plan-edit-mode';
import { matchesPlanFilter } from './plan-filters';
import { PlanGrid } from './plan-grid';
import { PlanAccountsPopover, PlanHeader } from './plan-header';
import { PlanMonthNavigation } from './plan-month-navigation';
import { PlanSwitcher } from './plan-switcher';
import { PlanToolbar } from './plan-toolbar';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanEditActions, PlanReorderPayload } from './plan-edit-mode';
import type { PlanFilter } from './plan-filters';
import type {
  ActivePlan,
  PlanAccount,
  PlanAutoAssignPreview,
  PlanAutoAssignStrategy,
  PlanBucket,
  PlanMoneyBox,
  PlanOutOfPlanKind,
  PlanTargetValues,
} from './types';
import { EmptyState } from '@/components/app/empty-state';
import { PanelSkeleton, TableSkeleton } from '@/components/app/skeletons';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedQuery } from '@/hooks/use-authed-query';
import { usePendingAction } from '@/hooks/use-pending-action';
import { accountLabel } from '@/lib/accounts';
import { useEntitlements } from '@/lib/entitlements';
import { currentPeriod } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

function addMonths(period: string, months: number) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
}

function isPlanAccountType(account: PlanAccount) {
  const accountType = account.accountType?.toUpperCase();
  return accountType !== 'INVS' && accountType !== 'ASST';
}

function isEligiblePlanAccount(account: PlanAccount) {
  return !account.hidden && account.status === 'active' && isPlanAccountType(account);
}

function mostCommonCurrency(accounts: Array<PlanAccount>) {
  const counts = new Map<string, number>();
  for (const account of accounts) {
    const currency = account.currency.toUpperCase();
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'EUR';
}

type ActivitySelection =
  | { type: 'bucket'; bucketId: Id<'planBuckets'> }
  | { type: 'outOfPlan'; kind: PlanOutOfPlanKind };

type InspectorSelection =
  | { type: 'bucket'; bucketId: Id<'planBuckets'> }
  | { type: 'group'; groupId: Id<'planGroups'> };

function useLargePlanLayout() {
  const [isLarge, setIsLarge] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsLarge(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);

  return isLarge;
}

export function PlanView() {
  const { t } = useI18n();
  const [period, setPeriod] = React.useState(currentPeriod());
  const [createOpen, setCreateOpen] = React.useState(false);
  const [accountsOpen, setAccountsOpen] = React.useState(false);
  const [autoAssignOpen, setAutoAssignOpen] = React.useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = React.useState(false);
  const [addCategoryGroupId, setAddCategoryGroupId] = React.useState<Id<'planGroups'> | undefined>();
  const [inspectorSelection, setInspectorSelection] = React.useState<InspectorSelection | null>(null);
  const [activitySelection, setActivitySelection] = React.useState<ActivitySelection | null>(null);
  const [filter, setFilter] = React.useState<PlanFilter>('all');
  const [editing, setEditing] = React.useState(false);
  const isLargePlanLayout = useLargePlanLayout();
  const [assignedBucketId, setAssignedBucketId] = React.useState<Id<'planBuckets'> | null>(null);
  const activityBucketId = activitySelection?.type === 'bucket' ? activitySelection.bucketId : null;
  const outOfPlanKind = activitySelection?.type === 'outOfPlan' ? activitySelection.kind : null;
  const activePlan = useAuthedQuery(api.banking.planRead.getActivePlan, {});
  const plans = useAuthedQuery(api.banking.planRead.listPlans, {});
  const entitlements = useEntitlements();
  const accounts = useAuthedQuery(api.banking.accounts.listAccounts, {
    status: 'active',
    limit: 200,
    includeIds: activePlan?.accounts.map((account) => account.id) ?? [],
  });
  const outsidePlanAccounts = useAuthedQuery(api.banking.accounts.listEligibleAccountsOutsidePlans, {});
  const categories = useAuthedQuery(api.banking.categories.listCategories, { limit: 200, includeArchived: true });
  const moneyBoxes = useAuthedQuery(api.banking.planning.listMoneyBoxes, { limit: 200 });
  const month = useAuthedQuery(api.banking.planRead.getPlanMonth, activePlan ? { planId: activePlan.id, period } : 'skip');
  const activityResult = useAuthedQuery(
    api.banking.planRead.listPlanBucketTransactions,
    activePlan && activityBucketId ? { planId: activePlan.id, bucketId: activityBucketId, period, limit: 200 } : 'skip',
  );
  const outOfPlanResult = useAuthedQuery(
    api.banking.planRead.listPlanOutOfPlanTransactions,
    activePlan && outOfPlanKind ? { planId: activePlan.id, period, kind: outOfPlanKind, limit: 200 } : 'skip',
  );
  const createPlan = useMutation(api.banking.plan.createPlan);
  const updatePlanAccounts = useMutation(api.banking.plan.updatePlanAccounts);
  const setAssigned = useMutation(api.banking.plan.setAssigned);
  const moveMoney = useMutation(api.banking.plan.moveMoney);
  const setTarget = useMutation(api.banking.plan.setTarget);
  const clearTarget = useMutation(api.banking.plan.clearTarget);
  const snoozeTarget = useMutation(api.banking.plan.snoozeTarget);
  const setBucketMoneyBox = useMutation(api.banking.plan.setBucketMoneyBox);
  const setExpectedIncome = useMutation(api.banking.plan.setExpectedIncome);
  const setOverdraftTargetDate = useMutation(api.banking.plan.setOverdraftTargetDate);
  const autoAssign = useMutation(api.banking.plan.autoAssign);
  const recalculatePlan = useMutation(api.banking.planRead.recalculatePlan);
  const restartPlanFromToday = useMutation(api.banking.plan.restartPlanFromToday);
  const createGroup = useMutation(api.banking.plan.createGroup);
  const renameGroup = useMutation(api.banking.plan.renameGroup);
  const deleteGroup = useMutation(api.banking.plan.deleteGroup);
  const createBucket = useMutation(api.banking.plan.createBucket);
  const renameBucket = useMutation(api.banking.plan.renameBucket);
  const hideBucket = useMutation(api.banking.plan.hideBucket);
  const deleteBucket = useMutation(api.banking.plan.deleteBucket);
  const reorderPlan = useMutation(api.banking.plan.reorderPlan);
  const setActivePlan = useMutation(api.banking.plan.setActivePlan);
  const renamePlan = useMutation(api.banking.plan.renamePlan);
  const deletePlan = useMutation(api.banking.plan.deletePlan);
  const pendingAction = usePendingAction();

  const eligibleAccounts = React.useMemo(() => (accounts ?? []).filter(isEligiblePlanAccount), [accounts]);
  const planAccountOptions = React.useMemo(() => (accounts ?? []).filter(isPlanAccountType), [accounts]);
  const accountById = React.useMemo(
    () => new Map((accounts ?? []).map((account) => [account._id, account])),
    [accounts],
  );
  const displayedPlanAccounts = React.useMemo(
    () =>
      (activePlan?.accounts ?? []).map((account) => {
        const labels: Array<string> = [];
        if (accountById.get(account.id)?.hidden) labels.push(t('plan.accounts.status.hidden'));
        if (account.status === 'paused') labels.push(t('plan.accounts.status.paused'));
        if (account.status === 'reauthorizationRequired') {
          labels.push(t('plan.accounts.status.reauthorizationRequired'));
        }
        if (account.status === 'pending') labels.push(t('plan.accounts.status.pending'));
        if (account.status === 'error') labels.push(t('plan.accounts.status.error'));
        return {
          ...account,
          accountType: [account.accountType, ...labels].filter(Boolean).join(' · ') || undefined,
        };
      }),
    [accountById, activePlan?.accounts, t],
  );
  const defaultCurrency = React.useMemo(() => mostCommonCurrency(eligibleAccounts), [eligibleAccounts]);
  const allBuckets = React.useMemo(
    () =>
      month
        ? [...month.groups.flatMap((group) => group.buckets), { ...month.unplanned, name: t('plan.unplanned') }]
        : [],
    [month, t],
  );
  const unplannedCategories = React.useMemo(() => {
    if (!month || !categories) return [];
    const categoryIds = new Set(month.unplanned.categoryIds);
    // Same rule the automatic path applies: income and archived categories have no place in a
    // spending bucket, and offering Salary here would let the manual route create what
    // ensurePlanBucketForCategory refuses to.
    return categories.filter(
      (category) => categoryIds.has(category._id) && category.budgetEligible && !category.archived,
    );
  }, [categories, month]);
  const inspectorBucketId = inspectorSelection?.type === 'bucket' ? inspectorSelection.bucketId : null;
  const inspectorGroupId = inspectorSelection?.type === 'group' ? inspectorSelection.groupId : null;
  const inspectorBucket = allBuckets.find((bucket) => bucket.bucketId === inspectorBucketId) ?? null;
  const inspectorGroup = month?.groups.find((group) => group.groupId === inspectorGroupId) ?? null;
  const activityBucket = allBuckets.find((bucket) => bucket.bucketId === activityBucketId) ?? null;
  const assignedBucket = allBuckets.find((bucket) => bucket.bucketId === assignedBucketId) ?? null;
  const activitySheetSelection = activityBucket
    ? ({ type: 'bucket', bucket: activityBucket } as const)
    : outOfPlanKind && month
      ? ({
          type: 'outOfPlan',
          label: outOfPlanKind === 'internal' ? t('plan.outOfPlan.internal') : t('plan.outOfPlan.transfers'),
          totalMinor: outOfPlanKind === 'internal' ? month.breakdown.internalMinor : month.breakdown.transferNetMinor,
        } as const)
      : null;

  /** Both the create and the accounts flows drop the same kinds of account for the same reasons. */
  function describeDroppedAccounts(
    dropped: Array<{
      accountId: Id<'financialAccounts'>;
      reason: 'hidden' | 'inactive' | 'currencyMismatch' | 'ineligibleType';
    }>,
  ) {
    const droppedAccountById = new Map((accounts ?? []).map((account) => [account._id, account]));
    return dropped
      .map(({ accountId, reason }) => {
        const account = droppedAccountById.get(accountId);
        const name = account ? accountLabel(account) : accountId;
        const reasonLabel =
          reason === 'hidden'
            ? t('plan.create.dropped.hidden')
            : reason === 'inactive'
              ? t('plan.create.dropped.inactive')
              : reason === 'currencyMismatch'
                ? t('plan.create.dropped.currencyMismatch')
                : t('plan.create.dropped.ineligibleType');
        return `${name} (${reasonLabel})`;
      })
      .join(', ');
  }

  async function create(values: { name: string; currency: string; accountIds: Array<Id<'financialAccounts'>> }) {
    return pendingAction.run(
      'createPlan',
      async () => {
        const result = await createPlan(values);
        // A new plan is not the default one, and landing on the old plan after creating a new one
        // reads as "nothing happened".
        await setActivePlan({ planId: result.planId });
        if (result.droppedAccounts.length === 0) {
          toast.success(t('plan.create.success'));
          return;
        }
        toast.warning(t('plan.create.droppedWarning', { accounts: describeDroppedAccounts(result.droppedAccounts) }));
      },
      { error: t('plan.create.failed') },
    );
  }

  async function saveAccounts(accountIds: Array<Id<'financialAccounts'>>) {
    if (!activePlan) return false;
    return pendingAction.run(
      'planAccounts',
      async () => {
        const result = await updatePlanAccounts({ planId: activePlan.id, accountIds });
        if (result.droppedAccounts.length === 0) {
          toast.success(t('plan.accounts.edit.success'));
          return;
        }
        toast.warning(t('plan.create.droppedWarning', { accounts: describeDroppedAccounts(result.droppedAccounts) }));
      },
      { error: t('plan.accounts.edit.failed') },
    );
  }

  async function saveAssigned(bucket: PlanBucket, amountMinor: bigint) {
    if (!activePlan) return false;
    return pendingAction.run(
      `assigned:${bucket.bucketId}`,
      async () => {
        await setAssigned({
          planId: activePlan.id,
          bucketId: bucket.bucketId,
          period,
          amountMinor,
        });
      },
      { error: t('plan.assigned.saveFailed') },
    );
  }

  async function move(values: { fromBucketId: Id<'planBuckets'>; toBucketId: Id<'planBuckets'>; amountMinor: bigint }) {
    if (!activePlan) return false;
    return pendingAction.run(
      'moveMoney',
      async () => {
        await moveMoney({ planId: activePlan.id, period, ...values });
      },
      { success: t('plan.move.success'), error: t('plan.move.failed') },
    );
  }

  async function saveTarget(bucket: PlanBucket, values: PlanTargetValues) {
    return pendingAction.run(
      `target:${bucket.bucketId}`,
      async () => {
        await setTarget({ bucketId: bucket.bucketId, ...values });
      },
      { success: t('plan.target.saved'), error: t('plan.target.saveFailed') },
    );
  }

  async function removeTarget(bucket: PlanBucket) {
    return pendingAction.run(
      `target:${bucket.bucketId}`,
      async () => {
        await clearTarget({ bucketId: bucket.bucketId });
      },
      { success: t('plan.target.cleared'), error: t('plan.target.clearFailed') },
    );
  }

  async function snooze(bucket: PlanBucket, snoozed: boolean) {
    return pendingAction.run(
      `target:${bucket.bucketId}`,
      async () => {
        await snoozeTarget({ bucketId: bucket.bucketId, period, snoozed });
      },
      { success: t(snoozed ? 'plan.target.snoozed' : 'plan.target.unsnoozed'), error: t('plan.target.snoozeFailed') },
    );
  }

  async function saveMoneyBoxLink(bucket: PlanBucket, moneyBoxId?: PlanMoneyBox['_id']) {
    return pendingAction.run(
      `moneyBox:${bucket.bucketId}`,
      async () => {
        await setBucketMoneyBox({ bucketId: bucket.bucketId, moneyBoxId });
      },
      { success: t('plan.moneyBox.saved'), error: t('plan.moneyBox.saveFailed') },
    );
  }

  async function saveExpectedIncome(amountMinor: bigint) {
    if (!activePlan) return false;
    return pendingAction.run(
      'expectedIncome',
      async () => {
        await setExpectedIncome({ planId: activePlan.id, expectedIncomeMinor: amountMinor });
      },
      { success: t('plan.cost.saved'), error: t('plan.cost.saveFailed') },
    );
  }

  async function saveOverdraftTargetDate(targetDate?: string) {
    if (!activePlan) return;
    await pendingAction.run(
      'overdraftTargetDate',
      async () => {
        await setOverdraftTargetDate({ planId: activePlan.id, targetDate });
      },
      {
        success: t('plan.overdraft.targetSaved'),
        error: t('plan.overdraft.targetSaveFailed'),
      },
    );
  }

  async function previewAutoAssign(
    strategy: PlanAutoAssignStrategy,
    bucketIds?: Array<Id<'planBuckets'>>,
  ): Promise<PlanAutoAssignPreview | null> {
    if (!activePlan) return null;
    let result: PlanAutoAssignPreview | null = null;
    const succeeded = await pendingAction.run(
      'autoAssign',
      async () => {
        result = await autoAssign({ planId: activePlan.id, period, strategy, bucketIds, dryRun: true });
      },
      { error: t('plan.autoAssign.failed') },
    );
    return succeeded ? result : null;
  }

  async function applyAutoAssign(strategy: PlanAutoAssignStrategy, bucketIds?: Array<Id<'planBuckets'>>) {
    if (!activePlan) return false;
    return pendingAction.run(
      'autoAssign',
      async () => {
        await autoAssign({ planId: activePlan.id, period, strategy, bucketIds, dryRun: false });
      },
      { success: t('plan.autoAssign.applied'), error: t('plan.autoAssign.failed') },
    );
  }

  async function recalculate() {
    if (!activePlan) return;
    await pendingAction.run(
      'recalculatePlan',
      async () => {
        await recalculatePlan({ planId: activePlan.id });
      },
      { success: t('plan.recalculate.started'), error: t('plan.recalculate.failed') },
    );
  }

  async function restart(startDate: string) {
    if (!activePlan) return false;
    const succeeded = await pendingAction.run(
      'restartPlan',
      async () => {
        await restartPlanFromToday({ planId: activePlan.id, startDate });
        setPeriod(currentPeriod());
        setInspectorSelection(null);
        setActivitySelection(null);
        setEditing(false);
      },
      { success: t('plan.restart.started'), error: t('plan.restart.failed') },
    );
    return succeeded;
  }

  if (activePlan === undefined) {
    return <TableSkeleton rows={8} />;
  }

  if (activePlan === null) {
    if (accounts === undefined) return <TableSkeleton rows={6} />;
    return (
      <>
        <EmptyState
          className="min-h-[28rem]"
          icon={WalletCardsIcon}
          title={t('plan.empty.title')}
          hint={t('plan.empty.description')}
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {t('plan.create.action')}
            </Button>
          }
        />
        <CreatePlanSheet
          accounts={eligibleAccounts}
          defaultCurrency={defaultCurrency}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSubmit={create}
          pending={pendingAction.isPending('createPlan')}
        />
      </>
    );
  }

  if (month === undefined || categories === undefined || moneyBoxes === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <PanelSkeleton rows={2} />
        <TableSkeleton rows={8} />
      </div>
    );
  }

  const goPrevious = () => setPeriod((current) => addMonths(current, -1));
  const goNext = () => setPeriod((current) => addMonths(current, 1));
  const goCurrent = () => setPeriod(currentPeriod());

  if (month.truncated) {
    return (
      <div className="flex flex-col gap-4">
        <MonthNavigation
          accounts={displayedPlanAccounts}
          canGoPrevious={period > activePlan.startPeriod}
          name={activePlan.name}
          period={period}
          onCurrent={goCurrent}
          onNext={goNext}
          onPrevious={goPrevious}
        />
        <Alert className="border-warning/40 bg-warning/5 py-5">
          <AlertTriangleIcon className="text-warning" />
          <AlertTitle>{t('plan.truncated.title')}</AlertTitle>
          <AlertDescription>{t('plan.truncated.description')}</AlertDescription>
          <AlertAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pendingAction.isPending('recalculatePlan')}
              onClick={() => void recalculate()}
            >
              {pendingAction.isPending('recalculatePlan') ? t('common.loading') : t('plan.recalculate.action')}
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  }

  const planId = activePlan.id;
  const structurePending = pendingAction.isPending('planStructure');
  const runStructure = (action: () => Promise<unknown>, success?: string) =>
    pendingAction.run(
      'planStructure',
      async () => {
        await action();
      },
      { success, error: t('plan.edit.failed') },
    );

  const editActions: PlanEditActions = {
    onCreateGroup: (name) => runStructure(() => createGroup({ planId, name })),
    onRenameGroup: (groupId, name) => runStructure(() => renameGroup({ groupId, name })),
    onDeleteGroup: (groupId) => runStructure(() => deleteGroup({ groupId }), t('plan.edit.groupDeleted')),
    onCreateBucket: (groupId, name) => runStructure(() => createBucket({ planId, groupId, name })),
    onAdoptCategory:
      unplannedCategories.length > 0
        ? (groupId) => {
            setAddCategoryGroupId(groupId);
            setAddCategoryOpen(true);
          }
        : undefined,
    onRenameBucket: (bucketId, name) => runStructure(() => renameBucket({ bucketId, name })),
    onHideBuckets: (bucketIds, hidden) =>
      runStructure(() => Promise.all(bucketIds.map((bucketId) => hideBucket({ bucketId, hidden })))),
    onDeleteBuckets: (bucketIds) =>
      runStructure(
        () => Promise.all(bucketIds.map((bucketId) => deleteBucket({ bucketId }))),
        t('plan.edit.bucketsDeleted'),
      ),
    onReorder: (payload: PlanReorderPayload) => runStructure(() => reorderPlan(payload)),
  };

  const matchCount = month.groups.reduce(
    (count, group) => count + group.buckets.filter((bucket) => matchesPlanFilter(bucket, filter)).length,
    0,
  );
  const canCreatePlan = entitlements?.features['plan.multiplePlans'] ?? false;

  return (
    // Two independently scrolling panes, like YNAB: the header stays put, the grid and the
    // inspector each own their scroll. Every ancestor needs min-h-0, otherwise a flex item refuses
    // to shrink below its content and nothing scrolls.
    <div className="flex min-w-0 flex-1 flex-col gap-4 lg:min-h-0">
      <PlanHeader
        accounts={displayedPlanAccounts}
        month={month}
        canGoPrevious={period > activePlan.startPeriod}
        isRecalculating={pendingAction.isPending('recalculatePlan')}
        onAutoAssign={() => setAutoAssignOpen(true)}
        onCurrentMonth={goCurrent}
        onNextMonth={goNext}
        onOverdraftTargetDateChange={(targetDate) => void saveOverdraftTargetDate(targetDate)}
        onPreviousMonth={goPrevious}
        onRecalculate={() => void recalculate()}
        overdraftTargetDatePending={pendingAction.isPending('overdraftTargetDate')}
        switcher={
          <PlanSwitcher
            activePlanId={planId}
            canCreatePlan={canCreatePlan}
            name={month.plan.name}
            pending={structurePending}
            restartPending={pendingAction.isPending('restartPlan')}
            plans={plans ?? []}
            onCreatePlan={() => {
              if (!canCreatePlan) {
                toast.info(t('plan.switcher.createProOnly'));
                return;
              }
              setCreateOpen(true);
            }}
            onDeletePlan={(target) => runStructure(() => deletePlan({ planId: target }), t('plan.switcher.deleted'))}
            onEditAccounts={() => setAccountsOpen(true)}
            onRenamePlan={(target, name) => runStructure(() => renamePlan({ planId: target, name }))}
            onRestartPlan={restart}
            onSelectPlan={(target) => {
              if (target === planId) return;
              setInspectorSelection(null);
              void runStructure(() => setActivePlan({ planId: target }));
            }}
          />
        }
      />
      <div className="grid min-w-0 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)]">
        <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
          {/* The inspector column is hidden below lg, so the panel keeps its own place there. */}
          <div className="lg:hidden">
            <CostToBeMe
              month={month}
              onSaveExpectedIncome={saveExpectedIncome}
              pending={pendingAction.isPending('expectedIncome')}
            />
          </div>
          <PlanToolbar
            editing={editing}
            filter={filter}
            matchCount={matchCount}
            onEditAccounts={() => setAccountsOpen(true)}
            onEditingChange={setEditing}
            onFilterChange={setFilter}
          />
          {editing ? (
            <PlanEditMode actions={editActions} groups={month.groups} pending={structurePending} />
          ) : (
            <PlanGrid
              categories={categories}
              filter={filter}
              month={month}
              onAddUnplannedCategory={
                unplannedCategories.length > 0
                  ? () => {
                      setAddCategoryGroupId(undefined);
                      setAddCategoryOpen(true);
                    }
                  : undefined
              }
              onAssignedChange={saveAssigned}
              onEditAssignedMobile={(bucket) => setAssignedBucketId(bucket.bucketId)}
              onOpenActivity={(bucket) => setActivitySelection({ type: 'bucket', bucketId: bucket.bucketId })}
              onOpenInspector={(bucket) => setInspectorSelection({ type: 'bucket', bucketId: bucket.bucketId })}
              onOpenOutOfPlan={(kind) => setActivitySelection({ type: 'outOfPlan', kind })}
              onSelectGroup={(group) => setInspectorSelection({ type: 'group', groupId: group.groupId })}
              pendingAssigned={(bucketId) => pendingAction.isPending(`assigned:${bucketId}`)}
              selectedBucketId={inspectorBucketId}
              selectedGroupId={inspectorGroupId}
            />
          )}
        </div>
        {/* The column is only a bounded flex host. PlanInspectorColumn owns the one inspector
            scrollport, avoiding nested scroll containers and keeping the card flush with the grid. */}
        <div className="hidden min-w-0 lg:min-h-0 lg:flex lg:pe-1">
          <PlanInspectorColumn
            bucket={isLargePlanLayout ? inspectorBucket : null}
            buckets={allBuckets}
            categories={categories}
            currency={month.plan.currency}
            group={isLargePlanLayout ? inspectorGroup : null}
            month={month}
            moneyBoxes={moneyBoxes}
            planAccountIds={activePlan.accounts.map((account) => account.id)}
            monthExtra={
              <CostToBeMe
                compact
                month={month}
                onSaveExpectedIncome={saveExpectedIncome}
                pending={pendingAction.isPending('expectedIncome')}
              />
            }
            movePending={pendingAction.isPending('moveMoney')}
            moneyBoxPending={inspectorBucket ? pendingAction.isPending(`moneyBox:${inspectorBucket.bucketId}`) : false}
            period={period}
            targetPending={inspectorBucket ? pendingAction.isPending(`target:${inspectorBucket.bucketId}`) : false}
            onClearSelection={() => setInspectorSelection(null)}
            onClearTarget={removeTarget}
            onMoveMoney={move}
            onSaveMoneyBox={saveMoneyBoxLink}
            onSaveTarget={saveTarget}
            onSnoozeTarget={snooze}
          />
        </div>
      </div>
      {!isLargePlanLayout ? (
        <PlanBucketInspector
          bucket={inspectorBucket}
          buckets={allBuckets}
          categories={categories}
          currency={month.plan.currency}
          moneyBoxes={moneyBoxes}
          moneyBoxPending={inspectorBucket ? pendingAction.isPending(`moneyBox:${inspectorBucket.bucketId}`) : false}
          movePending={pendingAction.isPending('moveMoney')}
          open={inspectorBucket !== null}
          period={period}
          planAccountIds={activePlan.accounts.map((account) => account.id)}
          targetPending={inspectorBucket ? pendingAction.isPending(`target:${inspectorBucket.bucketId}`) : false}
          onClearTarget={removeTarget}
          onOpenChange={(open) => {
            if (!open) setInspectorSelection(null);
          }}
          onMoveMoney={move}
          onSaveMoneyBox={saveMoneyBoxLink}
          onSaveTarget={saveTarget}
          onSnoozeTarget={snooze}
        />
      ) : null}
      <PlanAddCategoryDialog
        categories={unplannedCategories}
        groups={month.groups}
        initialGroupId={addCategoryGroupId}
        open={addCategoryOpen}
        planId={planId}
        onOpenChange={setAddCategoryOpen}
      />
      <AutoAssignDialog
        buckets={month.groups.flatMap((group) => group.buckets)}
        currency={month.plan.currency}
        open={autoAssignOpen}
        pending={pendingAction.isPending('autoAssign')}
        onApply={applyAutoAssign}
        onOpenChange={setAutoAssignOpen}
        onPreview={previewAutoAssign}
      />
      <PlanActivitySheet
        bucketResult={activityBucket ? activityResult : undefined}
        categories={categories}
        currency={month.plan.currency}
        open={activitySheetSelection !== null}
        onOpenChange={(open) => {
          if (!open) setActivitySelection(null);
        }}
        outOfPlanResult={outOfPlanKind ? outOfPlanResult : undefined}
        selection={activitySheetSelection}
      />
      <CreatePlanSheet
        accounts={eligibleAccounts}
        defaultCurrency={defaultCurrency}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={create}
        pending={pendingAction.isPending('createPlan')}
      />
      <PlanAccountsSheet
        accounts={planAccountOptions}
        currency={month.plan.currency}
        open={accountsOpen}
        onOpenChange={setAccountsOpen}
        onSubmit={saveAccounts}
        outsideAccounts={outsidePlanAccounts ?? []}
        pending={pendingAction.isPending('planAccounts')}
        selectedIds={activePlan.accounts.map((account) => account.id)}
      />
      <PlanAssignedSheet
        bucket={assignedBucket}
        currency={month.plan.currency}
        open={assignedBucket !== null}
        onOpenChange={(open) => {
          if (!open) setAssignedBucketId(null);
        }}
        onSave={saveAssigned}
        pending={assignedBucket ? pendingAction.isPending(`assigned:${assignedBucket.bucketId}`) : false}
      />
    </div>
  );
}

function MonthNavigation({
  accounts,
  canGoPrevious,
  name,
  onCurrent,
  onNext,
  onPrevious,
  period,
}: {
  accounts: ActivePlan['accounts'];
  canGoPrevious: boolean;
  name: string;
  onCurrent: () => void;
  onNext: () => void;
  onPrevious: () => void;
  period: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-heading text-lg font-medium">{name}</p>
          <PlanAccountsPopover accounts={accounts} />
        </div>
        <PlanMonthNavigation
          canGoPrevious={canGoPrevious}
          period={period}
          onCurrent={onCurrent}
          onNext={onNext}
          onPrevious={onPrevious}
        />
      </CardContent>
    </Card>
  );
}
