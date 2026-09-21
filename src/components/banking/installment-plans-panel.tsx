import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { PlusIcon, WalletCardsIcon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import { isLoanFacilityType } from '../../../convex/lib/validators';
import { BackfillInstallmentsDialog } from './installments/backfill-installments-dialog';
import { CustomPaymentDialog } from './installments/custom-payment-dialog';
import { InstallmentPlanCard } from './installments/installment-plan-card';
import { InstallmentPlanDialog } from './installments/installment-plan-dialog';
import { parseOptionalNumber } from './installments/helpers';
import { PaymentCandidateCard } from './installments/payment-candidate-card';
import type { Id } from '../../../convex/_generated/dataModel';
import type { CreditFacility, InstallmentPlan, InstallmentPlanFormValues } from './installments/helpers';
import type { PaymentCandidate } from './installments/payment-candidate-card';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { usePendingAction } from '@/hooks/use-pending-action';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

function candidateKey(candidate: PaymentCandidate) {
  if (candidate.kind === 'expected') {
    return `expected:${candidate.facility._id}:${candidate.dueDate}`;
  }

  if (candidate.kind === 'aggregate') {
    return `aggregate:${candidate.transaction._id}:${candidate.facility._id}`;
  }

  return `${candidate.plan._id}:${candidate.transaction._id}`;
}

export function InstallmentPlansPanel({ facilities }: { facilities: Array<CreditFacility> | undefined }) {
  const { t } = useI18n();
  const allActiveInstallmentPlans = useQuery(api.banking.credit.listInstallmentPlans, {
    status: 'active',
    limit: 50,
  });
  const installmentPaymentCandidates = useQuery(api.banking.credit.listInstallmentPaymentCandidates, { limit: 10 });
  const createInstallmentPlanMutation = useMutation(api.banking.credit.createInstallmentPlan);
  const updateInstallmentPlanMutation = useMutation(api.banking.credit.updateInstallmentPlan);
  const recordInstallmentPaymentMutation = useMutation(api.banking.credit.recordInstallmentPayment);
  const recordExpectedInstallmentPaymentMutation = useMutation(api.banking.credit.recordExpectedInstallmentPayment);
  const backfillExpectedInstallmentPaymentsMutation = useMutation(
    api.banking.credit.backfillExpectedInstallmentPayments,
  );
  const confirmInstallmentPaymentTransactionMutation = useMutation(
    api.banking.credit.confirmInstallmentPaymentTransaction,
  );
  const confirmInstallmentPaymentTransactionBatchMutation = useMutation(
    api.banking.credit.confirmInstallmentPaymentTransactionBatch,
  );
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [editingPlan, setEditingPlan] = React.useState<InstallmentPlan | null>(null);
  const [customPaymentPlan, setCustomPaymentPlan] = React.useState<InstallmentPlan | null>(null);
  const [backfillPlan, setBackfillPlan] = React.useState<InstallmentPlan | null>(null);
  const [candidatePrincipalDrafts, setCandidatePrincipalDrafts] = React.useState<Partial<Record<string, string>>>({});
  const [candidateInterestDrafts, setCandidateInterestDrafts] = React.useState<Partial<Record<string, string>>>({});
  const [candidateFeeDrafts, setCandidateFeeDrafts] = React.useState<Partial<Record<string, string>>>({});
  const pendingAction = usePendingAction();
  const facilityById = React.useMemo(() => {
    return new Map((facilities ?? []).map((facility) => [facility._id, facility]));
  }, [facilities]);

  // For a loan the plan IS the amortisation schedule, and the loan's own page already shows it.
  // Listing it here as well repeated the same debt a second time on this page and a third on the
  // loan page. Ordinary instalment contracts, which have no page of their own, stay.
  const activeInstallmentPlans = React.useMemo(() => {
    if (allActiveInstallmentPlans === undefined) return undefined;
    return allActiveInstallmentPlans.filter((plan) => {
      const facility = facilityById.get(plan.creditFacilityId);
      return !facility || !isLoanFacilityType(facility.facilityType);
    });
  }, [allActiveInstallmentPlans, facilityById]);

  async function createInstallmentPlan(values: InstallmentPlanFormValues) {
    const selectedFacility = facilityById.get(values.creditFacilityId as Id<'creditFacilities'>);
    if (!selectedFacility) {
      toast.error(t('credit.installments.selectFacilityFirst'));
      return;
    }

    const ok = await pendingAction.run(
      'createInstallment',
      async () => {
        await createInstallmentPlanMutation({
          creditFacilityId: selectedFacility._id,
          name: values.name,
          principalAmount: {
            amountMinor: parseMoneyMinor(values.principalAmount, selectedFacility.limitAmount.currency),
            currency: selectedFacility.limitAmount.currency,
          },
          monthlyPaymentAmount: values.monthlyPaymentAmount.trim()
            ? {
                amountMinor: parseMoneyMinor(values.monthlyPaymentAmount, selectedFacility.limitAmount.currency),
                currency: selectedFacility.limitAmount.currency,
              }
            : undefined,
          installmentCount: parseOptionalNumber(values.installmentCount),
          startDate: values.startDate,
          nextPaymentDate: values.nextPaymentDate.trim() ? values.nextPaymentDate : undefined,
        });
        setCreateDialogOpen(false);
      },
      { success: t('credit.installments.created'), error: t('credit.installments.createFailed') },
    );
    if (ok) trackEvent(analyticsEvents.installmentPlanCreated, { surface: 'credit' });
  }

  async function updateInstallmentPlan(values: InstallmentPlanFormValues) {
    if (!editingPlan) {
      return;
    }

    const selectedFacility = facilityById.get(values.creditFacilityId as Id<'creditFacilities'>);
    if (!selectedFacility) {
      toast.error(t('credit.installments.selectFacilityFirst'));
      return;
    }

    await pendingAction.run(
      `editInstallment:${editingPlan._id}`,
      async () => {
        await updateInstallmentPlanMutation({
          installmentPlanId: editingPlan._id,
          creditFacilityId: selectedFacility._id,
          name: values.name,
          monthlyPaymentAmount: {
            amountMinor: parseMoneyMinor(values.monthlyPaymentAmount, selectedFacility.limitAmount.currency),
            currency: selectedFacility.limitAmount.currency,
          },
          nextPaymentDate: values.nextPaymentDate,
        });
        setEditingPlan(null);
      },
      { success: t('credit.installments.updated'), error: t('credit.installments.updateFailed') },
    );
  }

  async function markExpectedInstallmentPaymentPaid(installmentPlanId: Id<'creditFacilityInstallmentPlans'>) {
    const operationKey = `expectedPayment:${installmentPlanId}`;
    await pendingAction.run(
      operationKey,
      async () => {
        await recordExpectedInstallmentPaymentMutation({ installmentPlanId });
      },
      { success: t('credit.installments.paymentRecorded'), error: t('credit.installments.paymentRecordFailed') },
    );
  }

  async function recordCustomInstallmentPayment(values: {
    amount: string;
    principal: string;
    interest: string;
    fee: string;
  }) {
    if (!customPaymentPlan) {
      return;
    }

    const operationKey = `payment:${customPaymentPlan._id}`;
    const currencyCode = customPaymentPlan.monthlyPaymentAmount.currency;
    await pendingAction.run(
      operationKey,
      async () => {
        await recordInstallmentPaymentMutation({
          installmentPlanId: customPaymentPlan._id,
          amount: {
            amountMinor: parseMoneyMinor(values.amount, currencyCode),
            currency: currencyCode,
          },
          principalAmount: values.principal.trim()
            ? {
                amountMinor: parseMoneyMinor(values.principal, currencyCode),
                currency: currencyCode,
              }
            : undefined,
          interestAmount: values.interest.trim()
            ? {
                amountMinor: parseMoneyMinor(values.interest, currencyCode),
                currency: currencyCode,
              }
            : undefined,
          feeAmount: values.fee.trim()
            ? {
                amountMinor: parseMoneyMinor(values.fee, currencyCode),
                currency: currencyCode,
              }
            : undefined,
          scheduledDueDate: customPaymentPlan.nextPaymentDate ?? undefined,
        });
        setCustomPaymentPlan(null);
      },
      { success: t('credit.installments.paymentRecorded'), error: t('credit.installments.paymentRecordFailed') },
    );
  }

  async function backfillInstallmentPayments(values: { throughScheduledDueDate: string; notes: string }) {
    if (!backfillPlan) {
      return;
    }

    const operationKey = `backfill:${backfillPlan._id}`;
    await pendingAction.run(
      operationKey,
      async () => {
        const result = await backfillExpectedInstallmentPaymentsMutation({
          installmentPlanId: backfillPlan._id,
          throughScheduledDueDate: values.throughScheduledDueDate,
          notes: values.notes.trim() ? values.notes : undefined,
        });
        setBackfillPlan(null);
        toast.success(
          t('credit.installments.backfillRecorded', {
            count: result.recordedInstallments,
          }),
        );
      },
      { error: t('credit.installments.backfillFailed') },
    );
  }

  async function confirmInstallmentPaymentTransaction(
    installmentPlanId: Id<'creditFacilityInstallmentPlans'>,
    transactionId: Id<'transactions'>,
    currencyCode: string,
    scheduledDueDate?: string,
  ) {
    const operationKey = `confirmPayment:${installmentPlanId}:${transactionId}`;
    await pendingAction.run(
      operationKey,
      async () => {
        const draftKey = `${installmentPlanId}:${transactionId}`;
        const principalDraft = candidatePrincipalDrafts[draftKey];
        const interestDraft = candidateInterestDrafts[draftKey];
        const feeDraft = candidateFeeDrafts[draftKey];
        await confirmInstallmentPaymentTransactionMutation({
          installmentPlanId,
          transactionId,
          principalAmount: principalDraft?.trim()
            ? {
                amountMinor: parseMoneyMinor(principalDraft, currencyCode),
                currency: currencyCode,
              }
            : undefined,
          interestAmount: interestDraft?.trim()
            ? {
                amountMinor: parseMoneyMinor(interestDraft, currencyCode),
                currency: currencyCode,
              }
            : undefined,
          feeAmount: feeDraft?.trim()
            ? {
                amountMinor: parseMoneyMinor(feeDraft, currencyCode),
                currency: currencyCode,
              }
            : undefined,
          scheduledDueDate,
        });
        setCandidatePrincipalDrafts((current) => ({ ...current, [draftKey]: '' }));
        setCandidateInterestDrafts((current) => ({ ...current, [draftKey]: '' }));
        setCandidateFeeDrafts((current) => ({ ...current, [draftKey]: '' }));
      },
      {
        success: t('credit.installments.suggestionConfirmed'),
        error: t('credit.installments.suggestionConfirmFailed'),
      },
    );
  }

  async function confirmInstallmentPaymentTransactionBatch(
    transactionId: Id<'transactions'>,
    allocations: Array<{
      plan: { _id: Id<'creditFacilityInstallmentPlans'> };
      expectedAmount: { amountMinor: bigint; currency: string };
      scheduledDueDate?: string;
    }>,
    currencyCode: string,
  ) {
    const operationKey = `confirmPaymentBatch:${transactionId}`;
    await pendingAction.run(
      operationKey,
      async () => {
        await confirmInstallmentPaymentTransactionBatchMutation({
          transactionId,
          allocations: allocations.map((allocation) => {
            const draftKey = `${allocation.plan._id}:${transactionId}`;
            const principalDraft = candidatePrincipalDrafts[draftKey];
            const interestDraft = candidateInterestDrafts[draftKey];
            const feeDraft = candidateFeeDrafts[draftKey];

            return {
              installmentPlanId: allocation.plan._id,
              amount: allocation.expectedAmount,
              scheduledDueDate: allocation.scheduledDueDate,
              principalAmount: principalDraft?.trim()
                ? {
                    amountMinor: parseMoneyMinor(principalDraft, currencyCode),
                    currency: currencyCode,
                  }
                : undefined,
              interestAmount: interestDraft?.trim()
                ? {
                    amountMinor: parseMoneyMinor(interestDraft, currencyCode),
                    currency: currencyCode,
                  }
                : undefined,
              feeAmount: feeDraft?.trim()
                ? {
                    amountMinor: parseMoneyMinor(feeDraft, currencyCode),
                    currency: currencyCode,
                  }
                : undefined,
            };
          }),
        });
        const draftKeys = new Set(allocations.map((allocation) => `${allocation.plan._id}:${transactionId}`));
        setCandidatePrincipalDrafts((current) =>
          Object.fromEntries(Object.entries(current).map(([key, value]) => [key, draftKeys.has(key) ? '' : value])),
        );
        setCandidateInterestDrafts((current) =>
          Object.fromEntries(Object.entries(current).map(([key, value]) => [key, draftKeys.has(key) ? '' : value])),
        );
        setCandidateFeeDrafts((current) =>
          Object.fromEntries(Object.entries(current).map(([key, value]) => [key, draftKeys.has(key) ? '' : value])),
        );
      },
      {
        success: t('credit.installments.suggestionConfirmed'),
        error: t('credit.installments.suggestionConfirmFailed'),
      },
    );
  }

  const drafts = {
    principal: candidatePrincipalDrafts,
    interest: candidateInterestDrafts,
    fee: candidateFeeDrafts,
    setPrincipal: setCandidatePrincipalDrafts,
    setInterest: setCandidateInterestDrafts,
    setFee: setCandidateFeeDrafts,
  };

  return (
    <section className="flex flex-col gap-6 lg:col-span-2">
      <Card size="sm">
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{t('credit.installments.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('credit.installments.description')}</p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)} type="button">
              <PlusIcon data-icon="inline-start" />
              {t('credit.installments.newPlan')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <WalletCardsIcon className="size-4 text-muted-foreground" />
            <h3 className="font-medium">{t('credit.installments.createdPlansTitle')}</h3>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {activeInstallmentPlans === undefined && <ListSkeleton rows={2} />}
          {activeInstallmentPlans?.length === 0 && (
            <EmptyState
              className="border"
              hint={t('credit.installments.emptyDescription')}
              icon={WalletCardsIcon}
              title={t('credit.installments.empty')}
            />
          )}
          {activeInstallmentPlans?.map((plan) => {
            const expectedPaymentOperationKey = `expectedPayment:${plan._id}`;
            return (
              <InstallmentPlanCard
                facility={facilityById.get(plan.creditFacilityId)}
                key={plan._id}
                onBackfill={() => setBackfillPlan(plan)}
                onEdit={() => setEditingPlan(plan)}
                onMarkPaid={() => markExpectedInstallmentPaymentPaid(plan._id)}
                onRecordCustomPayment={() => setCustomPaymentPlan(plan)}
                pending={pendingAction.isPending(expectedPaymentOperationKey)}
                plan={plan}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <div>
            <h3 className="font-medium">{t('credit.installments.suggestionsTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('credit.installments.suggestionsDescription')}</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {installmentPaymentCandidates === undefined && <ListSkeleton rows={2} />}
          {installmentPaymentCandidates?.length === 0 && (
            <EmptyState className="border" icon={WalletCardsIcon} title={t('credit.installments.suggestionsEmpty')} />
          )}
          {installmentPaymentCandidates?.map((candidate) => (
            <PaymentCandidateCard
              candidate={candidate}
              drafts={drafts}
              key={candidateKey(candidate)}
              onConfirmBatch={confirmInstallmentPaymentTransactionBatch}
              onConfirmSingle={confirmInstallmentPaymentTransaction}
              pendingKey={pendingAction.pendingKey}
            />
          ))}
        </CardContent>
      </Card>

      <InstallmentPlanDialog
        facilities={facilities}
        mode="create"
        onOpenChange={setCreateDialogOpen}
        onSubmit={createInstallmentPlan}
        open={createDialogOpen}
        pending={pendingAction.isPending('createInstallment')}
      />
      <InstallmentPlanDialog
        facilities={facilities}
        mode="edit"
        onOpenChange={(open) => {
          if (!open) {
            setEditingPlan(null);
          }
        }}
        onSubmit={updateInstallmentPlan}
        open={editingPlan !== null}
        pending={editingPlan !== null && pendingAction.isPending(`editInstallment:${editingPlan._id}`)}
        plan={editingPlan}
      />
      <CustomPaymentDialog
        onOpenChange={(open) => {
          if (!open) {
            setCustomPaymentPlan(null);
          }
        }}
        onSubmit={recordCustomInstallmentPayment}
        open={customPaymentPlan !== null}
        pending={customPaymentPlan !== null && pendingAction.isPending(`payment:${customPaymentPlan._id}`)}
        plan={customPaymentPlan}
      />
      <BackfillInstallmentsDialog
        onOpenChange={(open) => {
          if (!open) {
            setBackfillPlan(null);
          }
        }}
        onSubmit={backfillInstallmentPayments}
        open={backfillPlan !== null}
        pending={backfillPlan !== null && pendingAction.isPending(`backfill:${backfillPlan._id}`)}
        plan={backfillPlan}
      />
    </section>
  );
}
