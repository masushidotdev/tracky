import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import { CreditCardIcon, WalletCardsIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import { InstallmentPlansPanel } from '../installment-plans-panel';
import { parsePercentageToBasisPoints } from '../loans/loan-form-utils';
import { CreateContractDialog } from './create-contract-dialog';
import { CreateFacilityDialog } from './create-facility-dialog';
import { installmentFacilityProgress, isInstallmentFacility, parseOptionalNumber } from './helpers';
import { FacilityList } from './facility-list';
import type { LoanFormValues } from '../loans/loan-form-fields';
import type { FacilityEditValues } from './facility-card';
import type { CreateFacilityValues } from './create-facility-dialog';
import type { CreateContractValues } from './create-contract-dialog';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { FacilityListItem } from './facility-list';
import type { CreditFacility, CreditInstallmentPlan, CreditUsageCycle } from './types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedQuery } from '@/hooks/use-authed-query';
import { usePendingAction } from '@/hooks/use-pending-action';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

export function CreditFacilitiesView() {
  const { intlLocale, t } = useI18n();
  const navigate = useNavigate();
  const facilities = useAuthedQuery(api.banking.credit.listCreditFacilities, { limit: 50 });
  const usageCycles = useAuthedQuery(api.banking.credit.listCreditFacilityUsageCycles, { limit: 100 });
  const usageCyclePaymentCandidates = useAuthedQuery(api.banking.credit.listUsageCyclePaymentCandidates, {});
  const installmentPlans = useAuthedQuery(api.banking.credit.listInstallmentPlans, { status: 'active', limit: 100 });
  const accounts = useAuthedQuery(api.banking.accounts.listAccounts, { limit: 100 });
  const activePlan = useAuthedQuery(api.banking.planRead.getActivePlan, {});
  const planMonth = useAuthedQuery(api.banking.planRead.getPlanMonth, activePlan ? { planId: activePlan.id } : 'skip');
  const createCreditFacility = useMutation(api.banking.credit.createCreditFacility);
  const createInstallmentCreditContract = useMutation(api.banking.credit.createInstallmentCreditContract);
  const reclassifyFacilityAsLoan = useMutation(api.banking.loans.reclassifyFacilityAsLoan);
  const deleteLoan = useMutation(api.banking.loans.deleteLoan);
  const updateCreditFacilityUsage = useMutation(api.banking.credit.updateCreditFacilityUsage);
  const updateCreditFacility = useMutation(api.banking.credit.updateCreditFacility);
  const closeCreditFacilityUsageCycle = useMutation(api.banking.credit.closeCreditFacilityUsageCycle);
  const setCreditFacilityUsageCycleStatus = useMutation(api.banking.credit.setCreditFacilityUsageCycleStatus);
  const confirmUsageCyclePaymentTransaction = useMutation(api.banking.credit.confirmUsageCyclePaymentTransaction);
  const [createFacilityDialogOpen, setCreateFacilityDialogOpen] = React.useState(false);
  const [createContractDialogOpen, setCreateContractDialogOpen] = React.useState(false);
  const [usageDrafts, setUsageDrafts] = React.useState<Partial<Record<string, string>>>({});
  const pendingAction = usePendingAction();

  const paymentCandidateByCycleId = React.useMemo(
    () => new Map((usageCyclePaymentCandidates ?? []).map((candidate) => [candidate.usageCycleId, candidate])),
    [usageCyclePaymentCandidates],
  );

  const scheduledCyclesByFacilityId = React.useMemo(() => {
    const byFacility = new Map<string, Array<CreditUsageCycle>>();
    for (const cycle of usageCycles ?? []) {
      if (cycle.status !== 'scheduled') {
        continue;
      }
      const cycles = byFacility.get(cycle.creditFacilityId) ?? [];
      cycles.push(cycle);
      byFacility.set(cycle.creditFacilityId, cycles);
    }
    return byFacility;
  }, [usageCycles]);

  const openCycleByFacilityId = React.useMemo(() => {
    const byFacility = new Map<string, CreditUsageCycle>();
    for (const cycle of usageCycles ?? []) {
      if (cycle.status !== 'open') continue;
      const existing = byFacility.get(cycle.creditFacilityId);
      if (!existing || cycle.cycleMonth < existing.cycleMonth) {
        byFacility.set(cycle.creditFacilityId, cycle);
      }
    }
    return byFacility;
  }, [usageCycles]);

  const activeInstallmentPlanByFacilityId = React.useMemo(() => {
    const byFacility = new Map<string, CreditInstallmentPlan>();
    for (const plan of installmentPlans ?? []) {
      if (!byFacility.has(plan.creditFacilityId)) {
        byFacility.set(plan.creditFacilityId, plan);
      }
    }
    return byFacility;
  }, [installmentPlans]);
  const planGroups =
    planMonth?.groups
      .filter((group) => !group.hidden)
      .map((group) => ({
        groupId: group.groupId,
        name: group.name,
        buckets: group.buckets
          .filter((bucket) => !bucket.hidden)
          .map((bucket) => ({ bucketId: bucket.bucketId, name: bucket.name })),
      })) ?? [];

  const todayIsoDate = new Date().toISOString().slice(0, 10);
  const facilityItems = React.useMemo<Array<FacilityListItem>>(() => {
    return (facilities ?? []).map((facility) => {
      const isInstallmentCredit = isInstallmentFacility(facility);
      const installmentPlan = activeInstallmentPlanByFacilityId.get(facility._id);
      const installmentProgress = installmentPlan ? installmentFacilityProgress(installmentPlan, todayIsoDate) : null;
      const progress = isInstallmentCredit
        ? (installmentProgress?.percent ?? 0)
        : Math.max(0, Math.min(facility.summary.utilizationPercent, 100));

      return {
        facility,
        installmentPlan,
        installmentProgress,
        isInstallmentCredit,
        progress,
        openCycle: openCycleByFacilityId.get(facility._id),
        scheduledCycles: scheduledCyclesByFacilityId.get(facility._id) ?? [],
        usageDraft: usageDrafts[facility._id] ?? '',
      };
    });
  }, [
    activeInstallmentPlanByFacilityId,
    facilities,
    openCycleByFacilityId,
    scheduledCyclesByFacilityId,
    todayIsoDate,
    usageDrafts,
  ]);

  async function createFacility(values: CreateFacilityValues) {
    const ok = await pendingAction.run(
      'create',
      async () => {
        const tanBps = values.annualNominalRateBps.trim()
          ? Math.round(Number(values.annualNominalRateBps.replace(',', '.')) * 100)
          : undefined;

        await createCreditFacility({
          name: values.name,
          facilityType: values.facilityType,
          repaymentType: values.repaymentType,
          linkedAccountId:
            values.linkedAccountId === 'none' ? undefined : (values.linkedAccountId as Id<'financialAccounts'>),
          limitAmount: {
            amountMinor: parseMoneyMinor(values.limitAmount, values.currency),
            currency: values.currency,
          },
          usedAmount:
            values.facilityType !== 'accountOverdraft' && values.usedAmount.trim()
              ? {
                  amountMinor: parseMoneyMinor(values.usedAmount, values.currency),
                  currency: values.currency,
                }
              : undefined,
          minimumPurchaseAmount: values.minimumPurchaseAmount.trim()
            ? {
                amountMinor: parseMoneyMinor(values.minimumPurchaseAmount, values.currency),
                currency: values.currency,
              }
            : undefined,
          annualNominalRateBps: tanBps,
          standardInstallmentMonths: parseOptionalNumber(values.standardInstallmentMonths),
        });
      },
      { success: t('credit.form.created'), error: t('credit.form.createFailed') },
    );
    // facilityType enum only — no names, limits, or balances.
    if (ok) trackEvent(analyticsEvents.creditFacilityCreated, { facility_type: values.facilityType });
    return ok;
  }

  async function updateUsage(facility: CreditFacility) {
    if (facility.facilityType === 'accountOverdraft') {
      return;
    }

    const draft = usageDrafts[facility._id];
    if (!draft?.trim()) {
      return;
    }

    const operationKey = `usage:${facility._id}`;
    await pendingAction.run(
      operationKey,
      async () => {
        await updateCreditFacilityUsage({
          creditFacilityId: facility._id,
          usedAmount: {
            amountMinor: parseMoneyMinor(draft, facility.limitAmount.currency),
            currency: facility.limitAmount.currency,
          },
        });
        setUsageDrafts((current) => ({ ...current, [facility._id]: '' }));
      },
      { success: t('credit.usageUpdated'), error: t('credit.usageUpdateFailed') },
    );
  }

  async function createContract(values: CreateContractValues) {
    return pendingAction.run(
      'createContract',
      async () => {
        await createInstallmentCreditContract({
          name: values.name,
          linkedAccountId: values.accountId === 'none' ? undefined : (values.accountId as Id<'financialAccounts'>),
          principalAmount: {
            amountMinor: parseMoneyMinor(values.principalAmount, values.currency),
            currency: values.currency,
          },
          monthlyPaymentAmount: {
            amountMinor: parseMoneyMinor(values.monthlyPaymentAmount, values.currency),
            currency: values.currency,
          },
          installmentCount: Number(values.installmentCount),
          startDate: values.startDate,
          nextPaymentDate: values.nextPaymentDate.trim() ? values.nextPaymentDate : undefined,
        });
      },
      { success: t('credit.contract.created'), error: t('credit.contract.createFailed') },
    );
  }

  async function removeLoan(facility: CreditFacility) {
    await pendingAction.run(
      `loanDelete:${facility._id}`,
      async () => {
        await deleteLoan({ creditFacilityId: facility._id });
      },
      { success: t('loans.delete.deleted'), error: t('loans.delete.failed') },
    );
  }

  async function reclassifyAsLoan(facility: CreditFacility, values: LoanFormValues) {
    const operationKey = `loanReclassification:${facility._id}`;
    const saved = await pendingAction.run(
      operationKey,
      async () => {
        await reclassifyFacilityAsLoan({
          creditFacilityId: facility._id,
          loanType: values.loanType,
          originalPrincipalAmount: values.originalPrincipal.trim()
            ? {
                amountMinor: parseMoneyMinor(values.originalPrincipal, facility.limitAmount.currency, intlLocale),
                currency: facility.limitAmount.currency,
              }
            : undefined,
          annualNominalRateBps: parsePercentageToBasisPoints(values.annualRate),
          minimumPaymentAmount: {
            amountMinor: parseMoneyMinor(values.minimumPayment, facility.limitAmount.currency, intlLocale),
            currency: facility.limitAmount.currency,
          },
          escrowAmount: values.escrow.trim()
            ? {
                amountMinor: parseMoneyMinor(values.escrow, facility.limitAmount.currency, intlLocale),
                currency: facility.limitAmount.currency,
              }
            : null,
          finalPaymentAmount: values.finalPayment.trim()
            ? {
                amountMinor: parseMoneyMinor(values.finalPayment, facility.limitAmount.currency, intlLocale),
                currency: facility.limitAmount.currency,
              }
            : null,
          settlementAccountId:
            values.settlementAccountId === 'none' ? null : (values.settlementAccountId as Id<'financialAccounts'>),
          pairedPlanBucketId:
            values.pairedPlanBucketId === 'none' ? null : (values.pairedPlanBucketId as Id<'planBuckets'>),
          maturityDate: values.maturityDate.trim() || null,
        });
      },
      { success: t('loans.reclassify.success'), error: t('loans.reclassify.failed') },
    );
    if (saved) {
      await navigate({ to: '/app/loans/$facilityId', params: { facilityId: facility._id } });
    }
  }

  async function closeCardCycle(facility: CreditFacility, cycleMonth?: string) {
    const operationKey = `cycleClose:${facility._id}`;
    const ok = await pendingAction.run(
      operationKey,
      async () => {
        await closeCreditFacilityUsageCycle({
          creditFacilityId: facility._id,
          cycleMonth,
        });
      },
      { success: t('credit.statement.closed'), error: t('credit.statement.closeFailed') },
    );
    if (ok) trackEvent(analyticsEvents.statementCycleClosed, { surface: 'credit' });
  }

  async function updateFacility(facility: CreditFacility, values: FacilityEditValues) {
    const operationKey = `facilityUpdate:${facility._id}`;
    await pendingAction.run(
      operationKey,
      async () => {
        await updateCreditFacility({
          creditFacilityId: facility._id,
          linkedAccountId:
            values.linkedAccountId === 'none' ? null : (values.linkedAccountId as Id<'financialAccounts'>),
          settlementAccountId:
            values.settlementAccountId === 'none' ? null : (values.settlementAccountId as Id<'financialAccounts'>),
          limitAmount: {
            amountMinor: parseMoneyMinor(values.limitAmount, facility.limitAmount.currency),
            currency: facility.limitAmount.currency,
          },
          statementDayOfMonth: parseOptionalNumber(values.statementDayOfMonth),
          paymentDayOfMonth: parseOptionalNumber(values.paymentDayOfMonth),
        });
      },
      { success: t('credit.edit.updated'), error: t('credit.edit.updateFailed') },
    );
  }

  async function setUsageCycleStatus(usageCycleId: Id<'creditFacilityUsageCycles'>, status: 'paid' | 'cancelled') {
    const operationKey = `cycleStatus:${usageCycleId}`;
    await pendingAction.run(
      operationKey,
      async () => {
        await setCreditFacilityUsageCycleStatus({ usageCycleId, status });
      },
      { success: t('credit.statement.statusUpdated'), error: t('credit.statement.statusUpdateFailed') },
    );
  }

  async function confirmUsageCyclePayment(
    usageCycleId: Id<'creditFacilityUsageCycles'>,
    transactionId: Id<'transactions'>,
  ) {
    const operationKey = `cycleStatus:${usageCycleId}`;
    await pendingAction.run(
      operationKey,
      async () => {
        await confirmUsageCyclePaymentTransaction({ usageCycleId, transactionId });
      },
      { success: t('credit.statement.paymentLinked'), error: t('credit.statement.paymentLinkFailed') },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t('credit.title')}</CardTitle>
          <CardDescription>{t('credit.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setCreateFacilityDialogOpen(true)}>
            <CreditCardIcon data-icon="inline-start" />
            {t('credit.form.createFacility')}
          </Button>
          <Button type="button" variant="outline" onClick={() => setCreateContractDialogOpen(true)}>
            <WalletCardsIcon data-icon="inline-start" />
            {t('credit.contract.create')}
          </Button>
        </CardContent>
      </Card>

      <FacilityList
        accounts={accounts}
        facilities={facilities}
        installmentPlansLoading={installmentPlans === undefined}
        isAnyPending={pendingAction.isPending()}
        items={facilityItems}
        onCloseCycle={(facility, cycleMonth) => void closeCardCycle(facility, cycleMonth)}
        onConfirmUsageCyclePayment={(usageCycleId, transactionId) =>
          void confirmUsageCyclePayment(usageCycleId, transactionId)
        }
        onDeleteLoan={(facility) => void removeLoan(facility)}
        onReclassifyAsLoan={(facility, values) => void reclassifyAsLoan(facility, values)}
        onSetUsageCycleStatus={(usageCycleId, status) => void setUsageCycleStatus(usageCycleId, status)}
        paymentCandidateByCycleId={paymentCandidateByCycleId}
        onUpdateFacility={(facility, values) => void updateFacility(facility, values)}
        onUpdateUsage={(facility) => void updateUsage(facility)}
        onUsageDraftChange={(facilityId, value) => setUsageDrafts((current) => ({ ...current, [facilityId]: value }))}
        pendingClose={(facilityId) => pendingAction.isPending(`cycleClose:${facilityId}`)}
        pendingFacilityUpdate={(facilityId) => pendingAction.isPending(`facilityUpdate:${facilityId}`)}
        pendingDelete={(facilityId) => pendingAction.isPending(`loanDelete:${facilityId}`)}
        pendingReclassification={(facilityId) => pendingAction.isPending(`loanReclassification:${facilityId}`)}
        pendingUsage={(facilityId) => pendingAction.isPending(`usage:${facilityId}`)}
        planCurrency={activePlan?.currency}
        planGroups={planGroups}
        usageCycleStatusPending={(usageCycleId) => pendingAction.isPending(`cycleStatus:${usageCycleId}`)}
      />

      <InstallmentPlansPanel facilities={facilities} />

      <CreateFacilityDialog
        accounts={accounts}
        onOpenChange={setCreateFacilityDialogOpen}
        onSubmit={createFacility}
        open={createFacilityDialogOpen}
        pending={pendingAction.isPending('create')}
      />
      <CreateContractDialog
        accounts={accounts}
        onOpenChange={setCreateContractDialogOpen}
        onSubmit={createContract}
        open={createContractDialogOpen}
        pending={pendingAction.isPending('createContract')}
      />
    </div>
  );
}
