import * as React from 'react';

import { repaymentCandidateStatusKey } from './helpers';
import type { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import { Amount } from '@/components/app/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

export type PaymentCandidate = FunctionReturnType<typeof api.banking.credit.listInstallmentPaymentCandidates>[number];

export type CandidateDrafts = {
  principal: Partial<Record<string, string>>;
  interest: Partial<Record<string, string>>;
  fee: Partial<Record<string, string>>;
  setPrincipal: React.Dispatch<React.SetStateAction<Partial<Record<string, string>>>>;
  setInterest: React.Dispatch<React.SetStateAction<Partial<Record<string, string>>>>;
  setFee: React.Dispatch<React.SetStateAction<Partial<Record<string, string>>>>;
};

function CandidateSplitInputs({ draftKey, drafts }: { draftKey: string; drafts: CandidateDrafts }) {
  const { t } = useI18n();

  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-3">
      <Input
        onChange={(event) => drafts.setPrincipal((current) => ({ ...current, [draftKey]: event.target.value }))}
        placeholder={t('credit.installments.principalOptional')}
        value={drafts.principal[draftKey] ?? ''}
      />
      <Input
        onChange={(event) => drafts.setInterest((current) => ({ ...current, [draftKey]: event.target.value }))}
        placeholder={t('credit.installments.interestOptional')}
        value={drafts.interest[draftKey] ?? ''}
      />
      <Input
        onChange={(event) => drafts.setFee((current) => ({ ...current, [draftKey]: event.target.value }))}
        placeholder={t('credit.installments.feeOptional')}
        value={drafts.fee[draftKey] ?? ''}
      />
    </div>
  );
}

export function PaymentCandidateCard({
  candidate,
  drafts,
  pendingKey,
  onConfirmSingle,
  onConfirmBatch,
}: {
  candidate: PaymentCandidate;
  drafts: CandidateDrafts;
  pendingKey: string | null;
  onConfirmSingle: (
    installmentPlanId: Id<'creditFacilityInstallmentPlans'>,
    transactionId: Id<'transactions'>,
    currencyCode: string,
    scheduledDueDate?: string,
  ) => void;
  onConfirmBatch: (
    transactionId: Id<'transactions'>,
    allocations: Array<{
      plan: { _id: Id<'creditFacilityInstallmentPlans'> };
      expectedAmount: { amountMinor: bigint; currency: string };
      scheduledDueDate?: string;
    }>,
    currencyCode: string,
  ) => void;
}) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();

  if (candidate.kind === 'expected') {
    return (
      <Card size="sm">
        <CardContent>
          <div className="flex flex-col justify-between gap-3 sm:flex-row">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{candidate.facility.name}</span>
                <Badge variant="secondary">{t('credit.installments.statusExpected')}</Badge>
                <Badge variant="secondary">
                  {t('planning.creditRepayments.planCount', { count: candidate.allocations.length })}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('credit.installments.expectedMeta', { date: candidate.dueDate })}
              </p>
              <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
                {candidate.allocations.map((allocation) => (
                  <div key={allocation.plan._id} className="flex items-center gap-1">
                    <span>{allocation.plan.name}:</span>
                    <Amount money={allocation.expectedAmount} variant="neutral" />
                  </div>
                ))}
              </div>
            </div>
            <div className="font-mono text-lg font-semibold tabular-nums sm:text-right">
              <Amount money={candidate.expectedAmount} variant="neutral" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (candidate.kind === 'aggregate') {
    const operationKey = `confirmPaymentBatch:${candidate.transaction._id}`;
    return (
      <Card size="sm">
        <CardContent>
          <div className="flex flex-col justify-between gap-3 sm:flex-row">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{candidate.facility.name}</span>
                <Badge variant="secondary">
                  {t('planning.creditRepayments.planCount', { count: candidate.allocations.length })}
                </Badge>
                <Badge variant={candidate.confidence >= 0.85 ? 'default' : 'secondary'}>
                  {Math.round(candidate.confidence * 100)}%
                </Badge>
                <Badge variant={candidate.confirmable ? 'default' : 'secondary'}>
                  {t(repaymentCandidateStatusKey(candidate.reviewStatus))}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{candidate.transaction.description}</p>
              <p className="text-sm text-muted-foreground">
                {t('credit.installments.suggestionMeta', {
                  date: candidate.transaction.bookingDate,
                  account: candidate.transaction.account?.name ?? t('common.notAvailableYet', { item: 'Account' }),
                })}
              </p>
            </div>
            <div className="text-left text-sm sm:text-right">
              <div className="font-mono text-lg font-semibold tabular-nums">
                <Amount money={candidate.transaction.amount} variant="neutral" />
              </div>
              <div className="text-muted-foreground">
                {t('credit.installments.suggestionExpected', {
                  amount: maskValue(formatMoney(candidate.expectedAmount, intlLocale)),
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {candidate.allocations.map((allocation) => {
              const draftKey = `${allocation.plan._id}:${candidate.transaction._id}`;
              return (
                <div className="rounded-lg bg-muted/40 p-3" key={allocation.plan._id}>
                  <div className="flex flex-col justify-between gap-1 text-sm sm:flex-row">
                    <span className="font-medium">{allocation.plan.name}</span>
                    <Amount money={allocation.expectedAmount} variant="neutral" />
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      {t('credit.installments.advancedDetails')}
                    </summary>
                    <CandidateSplitInputs draftKey={draftKey} drafts={drafts} />
                  </details>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t('credit.installments.splitHint')}</p>
          <div className="mt-4 flex justify-end">
            <Button
              disabled={pendingKey !== null || !candidate.confirmable}
              onClick={() =>
                onConfirmBatch(candidate.transaction._id, candidate.allocations, candidate.transaction.amount.currency)
              }
              type="button"
              variant="outline"
            >
              {pendingKey === operationKey && <Spinner data-icon="inline-start" />}
              {pendingKey === operationKey
                ? t('credit.installments.confirmingSuggestion')
                : t('credit.installments.confirmSuggestion')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const operationKey = `confirmPayment:${candidate.plan._id}:${candidate.transaction._id}`;
  const draftKey = `${candidate.plan._id}:${candidate.transaction._id}`;
  return (
    <Card size="sm">
      <CardContent>
        <div className="flex flex-col justify-between gap-3 sm:flex-row">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{candidate.plan.name}</span>
              <Badge variant="secondary">{candidate.facility.name}</Badge>
              <Badge variant={candidate.confidence >= 0.85 ? 'default' : 'secondary'}>
                {Math.round(candidate.confidence * 100)}%
              </Badge>
              <Badge variant={candidate.confirmable ? 'default' : 'secondary'}>
                {t(repaymentCandidateStatusKey(candidate.reviewStatus))}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{candidate.transaction.description}</p>
            <p className="text-sm text-muted-foreground">
              {t('credit.installments.suggestionMeta', {
                date: candidate.transaction.bookingDate,
                account: candidate.transaction.account?.name ?? t('common.notAvailableYet', { item: 'Account' }),
              })}
            </p>
          </div>
          <div className="text-left text-sm sm:text-right">
            <div className="font-mono text-lg font-semibold tabular-nums">
              <Amount money={candidate.transaction.amount} variant="neutral" />
            </div>
            <div className="text-muted-foreground">
              {t('credit.installments.suggestionExpected', {
                amount: maskValue(formatMoney(candidate.expectedAmount, intlLocale)),
              })}
            </div>
            {candidate.amountDelta.amountMinor > 0n && (
              <div className="text-muted-foreground">
                {t('credit.installments.suggestionDelta', {
                  amount: maskValue(formatMoney(candidate.amountDelta, intlLocale)),
                })}
              </div>
            )}
          </div>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t('credit.installments.advancedDetails')}
          </summary>
          <CandidateSplitInputs draftKey={draftKey} drafts={drafts} />
          <p className="mt-2 text-xs text-muted-foreground">{t('credit.installments.splitHint')}</p>
        </details>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={pendingKey !== null || !candidate.confirmable}
            onClick={() =>
              onConfirmSingle(
                candidate.plan._id,
                candidate.transaction._id,
                candidate.transaction.amount.currency,
                candidate.scheduledDueDate,
              )
            }
            type="button"
            variant="outline"
          >
            {pendingKey === operationKey && <Spinner data-icon="inline-start" />}
            {pendingKey === operationKey
              ? t('credit.installments.confirmingSuggestion')
              : t('credit.installments.confirmSuggestion')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
