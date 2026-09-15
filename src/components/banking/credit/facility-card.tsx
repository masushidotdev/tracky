import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { CreditCardIcon, LandmarkIcon, PencilIcon, WalletCardsIcon } from 'lucide-react';

import { LoanFormFields } from '../loans/loan-form-fields';
import { formatBasisPointsInput } from '../loans/loan-form-utils';
import { isLoanFacilityType } from '../../../../convex/lib/validators';
import { remainingRepaymentAmount } from './helpers';
import { facilityTypeLabel, repaymentTypeLabel } from './options';
import { CreditActionTooltip, StatementTracker } from './statement-tracker';
import type { LoanFormValues } from '../loans/loan-form-fields';
import type {
  CreditFacility,
  CreditInstallmentPlan,
  CreditUsageCycle,
  CreditUsageCyclePaymentCandidate,
  FinancialAccount,
} from './types';
import type { Id } from '../../../../convex/_generated/dataModel';
import { Amount } from '@/components/app/amount';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { accountLabel } from '@/lib/accounts';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney, moneyInputValue } from '@/lib/money';

type InstallmentProgress = {
  elapsedInstallments: number;
  percent: number;
  remainingInstallments: number;
  totalInstallments: number;
};

export type FacilityEditValues = {
  limitAmount: string;
  linkedAccountId: string;
  settlementAccountId: string;
  statementDayOfMonth: string;
  paymentDayOfMonth: string;
};

function editValuesFor(facility: CreditFacility): FacilityEditValues {
  return {
    limitAmount: moneyInputValue(facility.limitAmount),
    linkedAccountId: facility.linkedAccountId ?? 'none',
    settlementAccountId: facility.settlementAccountId ?? 'none',
    statementDayOfMonth: facility.statementDayOfMonth?.toString() ?? '',
    paymentDayOfMonth: facility.paymentDayOfMonth?.toString() ?? '',
  };
}

function loanValuesFor(
  facility: CreditFacility,
  installmentPlan: CreditInstallmentPlan | undefined,
  locale: string,
): LoanFormValues {
  const minimumPaymentAmount = facility.minimumPaymentAmount ?? installmentPlan?.monthlyPaymentAmount;
  return {
    name: facility.name,
    loanType: 'autoLoan',
    currentBalance: '',
    // Blank means "keep what the contract already says": reclassification inherits the instalment
    // plan's principal, so the borrowed amount is not lost and does not have to be retyped.
    originalPrincipal: facility.originalPrincipalAmount
      ? moneyInputValue(facility.originalPrincipalAmount, locale)
      : '',
    annualRate: formatBasisPointsInput(facility.annualNominalRateBps ?? 0, locale),
    minimumPayment: minimumPaymentAmount ? moneyInputValue(minimumPaymentAmount, locale) : '',
    escrow: facility.escrowAmount ? moneyInputValue(facility.escrowAmount, locale) : '',
    finalPayment: facility.finalPaymentAmount ? moneyInputValue(facility.finalPaymentAmount, locale) : '',
    settlementAccountId: facility.settlementAccountId ?? 'none',
    firstPaymentDate: '',
    maturityDate: facility.maturityDate ?? '',
    pairedPlanBucketId: facility.pairedPlanBucketId ?? 'none',
    currency: facility.limitAmount.currency as LoanFormValues['currency'],
  };
}

export function FacilityCard({
  accounts,
  facility,
  installmentPlan,
  installmentPlansLoading,
  installmentProgress,
  isAnyPending,
  isInstallmentCredit,
  onCloseCycle,
  onConfirmUsageCyclePayment,
  onDeleteLoan,
  onReclassifyAsLoan,
  onSetUsageCycleStatus,
  onUpdateFacility,
  onUpdateUsage,
  onUsageDraftChange,
  paymentCandidateByCycleId,
  pendingClose,
  pendingFacilityUpdate,
  pendingDelete,
  pendingReclassification,
  pendingUsage,
  planGroups,
  progress,
  openCycle,
  scheduledCycles,
  usageCycleStatusPending,
  usageDraft,
}: {
  accounts: Array<FinancialAccount> | undefined;
  facility: CreditFacility;
  installmentPlan: CreditInstallmentPlan | undefined;
  installmentPlansLoading: boolean;
  installmentProgress: InstallmentProgress | null;
  isAnyPending: boolean;
  isInstallmentCredit: boolean;
  onCloseCycle: () => void;
  onConfirmUsageCyclePayment: (
    usageCycleId: Id<'creditFacilityUsageCycles'>,
    transactionId: Id<'transactions'>,
  ) => void;
  onDeleteLoan: () => void;
  onReclassifyAsLoan: (values: LoanFormValues) => void;
  onSetUsageCycleStatus: (usageCycleId: Id<'creditFacilityUsageCycles'>, status: 'paid' | 'cancelled') => void;
  onUpdateFacility: (values: FacilityEditValues) => void;
  onUpdateUsage: () => void;
  onUsageDraftChange: (value: string) => void;
  paymentCandidateByCycleId: Map<string, CreditUsageCyclePaymentCandidate>;
  pendingClose: boolean;
  pendingFacilityUpdate: boolean;
  pendingDelete: boolean;
  pendingReclassification: boolean;
  pendingUsage: boolean;
  planGroups: React.ComponentProps<typeof LoanFormFields>['groups'];
  progress: number;
  openCycle: CreditUsageCycle | undefined;
  scheduledCycles: Array<CreditUsageCycle>;
  usageCycleStatusPending: (usageCycleId: Id<'creditFacilityUsageCycles'>) => boolean;
  usageDraft: string;
}) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const [editing, setEditing] = React.useState(false);
  const [reclassificationOpen, setReclassificationOpen] = React.useState(false);
  const [editValues, setEditValues] = React.useState<FacilityEditValues>(() => editValuesFor(facility));
  const [loanValues, setLoanValues] = React.useState<LoanFormValues>(() =>
    loanValuesFor(facility, installmentPlan, intlLocale),
  );
  // Monthly statement close/tracking is only meaningful for primary card credit lines:
  // additional card lines repay via installment plans, overdrafts live in the balance.
  const isLoanFacility = isLoanFacilityType(facility.facilityType);
  // Same source as the loan page and the sidebar, so one loan never shows two debts.
  const loanOutstanding = installmentPlan?.outstandingAmount ?? facility.usedAmount;
  const cardFacility = facility.facilityType === 'cardCreditLine';
  const overdraftFacility = facility.facilityType === 'accountOverdraft';
  const linkedAccountMissing = overdraftFacility && editValues.linkedAccountId === 'none';
  const settlementAccounts = React.useMemo(
    () =>
      accounts?.filter(
        (account) =>
          account.status === 'active' &&
          !['CARD', 'INVS', 'ASST'].includes(account.accountType?.toUpperCase() ?? '') &&
          account.currency === facility.limitAmount.currency,
      ) ?? [],
    [accounts, facility.limitAmount.currency],
  );

  function toggleEditing() {
    if (!editing) {
      setEditValues(editValuesFor(facility));
    }
    setEditing((current) => !current);
  }

  function openReclassification() {
    setLoanValues(loanValuesFor(facility, installmentPlan, intlLocale));
    setReclassificationOpen(true);
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {isInstallmentCredit ? (
            <WalletCardsIcon className="size-4 text-muted-foreground" />
          ) : facility.facilityType === 'accountOverdraft' ? (
            <LandmarkIcon className="size-4 text-muted-foreground" />
          ) : (
            <CreditCardIcon className="size-4 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate">{facility.name}</span>
          <Badge variant={facility.status === 'active' ? 'default' : 'secondary'}>{facility.status}</Badge>
          {facility.summary.isOverLimit && <Badge variant="destructive">{t('credit.overLimit')}</Badge>}
        </CardTitle>
        <CardDescription>
          {facilityTypeLabel(facility.facilityType, t)} - {repaymentTypeLabel(facility.repaymentType, t)}
        </CardDescription>
        <CardAction className="text-right text-sm">
          {isLoanFacility ? (
            // A loan is not a credit line you can draw on: "13.547,82 available, 49.2% used" reads
            // as spending room that does not exist. It owes what it owes.
            <>
              <div>{t('credit.loanOutstanding', { amount: maskValue(formatMoney(loanOutstanding, intlLocale)) })}</div>
              {installmentProgress ? (
                <div className="text-muted-foreground">
                  {t('credit.installmentProgress.remaining', {
                    remainingInstallments: installmentProgress.remainingInstallments,
                  })}
                </div>
              ) : null}
            </>
          ) : isInstallmentCredit ? (
            <>
              <div>
                {installmentProgress
                  ? t('credit.installmentProgress.elapsed', {
                      elapsedInstallments: installmentProgress.elapsedInstallments,
                      totalInstallments: installmentProgress.totalInstallments,
                    })
                  : t(
                      installmentPlan === undefined && installmentPlansLoading
                        ? 'credit.installmentProgress.loading'
                        : 'credit.installmentProgress.noPlan',
                    )}
              </div>
              {installmentProgress ? (
                <div className="text-muted-foreground">
                  {t('credit.installmentProgress.remaining', {
                    remainingInstallments: installmentProgress.remainingInstallments,
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div>
                {t('credit.available', {
                  amount: maskValue(formatMoney(facility.summary.availableAmount, intlLocale)),
                })}
              </div>
              <div className="text-muted-foreground">
                {t('credit.usedPercent', { percent: facility.summary.utilizationPercent.toFixed(1) })}
              </div>
            </>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {editing ? (
          <form
            className="mt-3 grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!linkedAccountMissing) onUpdateFacility(editValues);
            }}
          >
            <Field className="sm:col-span-3">
              <FieldLabel>
                {t('credit.form.linkedAccount')}
                {overdraftFacility ? <span aria-hidden="true">*</span> : null}
              </FieldLabel>
              <Select
                value={editValues.linkedAccountId}
                onValueChange={(linkedAccountId) => setEditValues((current) => ({ ...current, linkedAccountId }))}
              >
                <SelectTrigger aria-required={overdraftFacility}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">{t('credit.form.noLinkedAccount')}</SelectItem>
                    {accounts?.map((account) => (
                      <SelectItem key={account._id} value={account._id}>
                        {accountLabel(account)} · {account.currency}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {cardFacility ? (
              <Field className="sm:col-span-3">
                <FieldLabel>{t('credit.form.settlementAccount')}</FieldLabel>
                <Select
                  value={editValues.settlementAccountId}
                  onValueChange={(settlementAccountId) =>
                    setEditValues((current) => ({ ...current, settlementAccountId }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">{t('credit.form.noSettlementAccount')}</SelectItem>
                      {settlementAccounts.map((account) => (
                        <SelectItem key={account._id} value={account._id}>
                          {accountLabel(account)} · {account.currency}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor={`facility-limit-${facility._id}`}>{t('credit.edit.limit')}</FieldLabel>
              <Input
                id={`facility-limit-${facility._id}`}
                value={editValues.limitAmount}
                onChange={(event) => setEditValues((current) => ({ ...current, limitAmount: event.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`facility-statement-day-${facility._id}`}>
                {t('credit.edit.statementDay')}
              </FieldLabel>
              <Input
                id={`facility-statement-day-${facility._id}`}
                type="number"
                min="1"
                max="31"
                value={editValues.statementDayOfMonth}
                onChange={(event) =>
                  setEditValues((current) => ({ ...current, statementDayOfMonth: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`facility-payment-day-${facility._id}`}>{t('credit.edit.paymentDay')}</FieldLabel>
              <Input
                id={`facility-payment-day-${facility._id}`}
                type="number"
                min="1"
                max="31"
                value={editValues.paymentDayOfMonth}
                onChange={(event) =>
                  setEditValues((current) => ({ ...current, paymentDayOfMonth: event.target.value }))
                }
              />
            </Field>
            <div className="flex gap-2 sm:col-span-3">
              <Button
                type="submit"
                size="sm"
                disabled={isAnyPending || !editValues.limitAmount.trim() || linkedAccountMissing}
              >
                {pendingFacilityUpdate && <Spinner data-icon="inline-start" />}
                {t('credit.edit.save')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isAnyPending}
                onClick={() => setEditing(false)}
              >
                {t('credit.edit.cancel')}
              </Button>
            </div>
          </form>
        ) : null}
        <Progress className="mt-3" value={progress} />
        {isLoanFacility ? (
          // Capacity figures belong to a credit line. A loan's detail - rate, instalment, payoff,
          // schedule - lives on its own page, and repeating a partial copy here only produced a second
          // number for the same debt.
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <div className="text-muted-foreground">{t('credit.financing.principal')}</div>
              <Amount money={facility.limitAmount} variant="neutral" />
            </div>
            <div>
              <div className="text-muted-foreground">{t('credit.financing.monthlyPayment')}</div>
              {installmentPlan ? (
                <Amount money={installmentPlan.monthlyPaymentAmount} variant="neutral" />
              ) : (
                t('credit.financing.notAvailable')
              )}
            </div>
            <div>
              <div className="text-muted-foreground">{t('credit.financing.endDate')}</div>
              <div>{installmentPlan?.endDate ?? t('credit.financing.notAvailable')}</div>
            </div>
          </div>
        ) : isInstallmentCredit ? (
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">{t('credit.financing.principal')}</div>
              <Amount money={facility.limitAmount} variant="neutral" />
            </div>
            <div>
              <div className="text-muted-foreground">{t('credit.financing.monthlyPayment')}</div>
              {installmentPlan ? (
                <Amount money={installmentPlan.monthlyPaymentAmount} variant="neutral" />
              ) : (
                t('credit.financing.notAvailable')
              )}
            </div>
            <div>
              <div className="text-muted-foreground">{t('credit.financing.outstanding')}</div>
              <Amount
                money={
                  installmentPlan ? remainingRepaymentAmount(installmentPlan) : facility.activeInstallmentOutstanding
                }
                variant="balance"
              />
            </div>
            <div>
              <div className="text-muted-foreground">{t('credit.financing.endDate')}</div>
              <div>{installmentPlan?.endDate ?? t('credit.financing.notAvailable')}</div>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <div className="text-muted-foreground">{t('credit.limit')}</div>
                <Amount money={facility.limitAmount} variant="neutral" />
              </div>
              <div>
                <div className="text-muted-foreground">{t('credit.used')}</div>
                <Amount money={facility.usedAmount} variant="balance" />
              </div>
              <div>
                <div className="text-muted-foreground">{t('credit.activePlans')}</div>
                <div className="flex items-center gap-1">
                  <span>{facility.activeInstallmentPlanCount} -</span>
                  <Amount money={facility.activeInstallmentOutstanding} variant="balance" />
                </div>
              </div>
            </div>
            {overdraftFacility ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('credit.overdraftDerivedNote')}</p>
            ) : facility.usageDerived ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{t('credit.cardDerivedNote')}</p>
                {cardFacility ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isAnyPending || facility.currentStatementAmount.amountMinor <= 0n}
                    onClick={onCloseCycle}
                  >
                    {pendingClose && <Spinner data-icon="inline-start" />}
                    {pendingClose ? t('credit.statement.closing') : t('credit.statement.closeCycle')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                <Input
                  value={usageDraft}
                  onChange={(event) => onUsageDraftChange(event.target.value)}
                  placeholder={t('credit.updateUsedPlaceholder')}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isAnyPending || !usageDraft.trim()}
                  onClick={onUpdateUsage}
                >
                  {pendingUsage && <Spinner data-icon="inline-start" />}
                  {pendingUsage ? t('credit.updating') : t('credit.updateUsage')}
                </Button>
                {cardFacility ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isAnyPending || facility.currentStatementAmount.amountMinor <= 0n}
                    onClick={onCloseCycle}
                  >
                    {pendingClose && <Spinner data-icon="inline-start" />}
                    {pendingClose ? t('credit.statement.closing') : t('credit.statement.closeCycle')}
                  </Button>
                ) : null}
                <CreditActionTooltip ariaLabel={t('credit.usageTooltip.aria')}>
                  <div className="flex max-w-80 flex-col gap-1">
                    <p className="font-medium">{t('credit.usageTooltip.title')}</p>
                    <p>{t('credit.usageTooltip.body')}</p>
                    <p>{t('credit.usageTooltip.when')}</p>
                  </div>
                </CreditActionTooltip>
              </div>
            )}
          </>
        )}
        {cardFacility ? (
          <StatementTracker
            facility={facility}
            isAnyPending={isAnyPending}
            onConfirmUsageCyclePayment={onConfirmUsageCyclePayment}
            onSetUsageCycleStatus={onSetUsageCycleStatus}
            paymentCandidateByCycleId={paymentCandidateByCycleId}
            openCycle={openCycle}
            scheduledCycles={scheduledCycles}
            usageCycleStatusPending={usageCycleStatusPending}
          />
        ) : null}
      </CardContent>
      {/* Actions sit in the card's footer: in the header they competed with the figures for the
          same corner and pushed the amounts around as their labels changed. */}
      <CardFooter className="flex-wrap justify-end gap-2 border-t">
        {/* Installment contracts have fixed terms — classification changes through the loan terms flow. */}
        {isInstallmentCredit ? (
          <Button type="button" size="sm" variant="outline" disabled={isAnyPending} onClick={openReclassification}>
            <LandmarkIcon data-icon="inline-start" />
            {t('loans.reclassify.action')}
          </Button>
        ) : isLoanFacility ? (
          <>
            {/* The loan's own page owns the schedule and the payoff; from here you go there
                rather than reading a second, shorter copy of the same figures. */}
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to="/app/loans/$facilityId" params={{ facilityId: facility._id }}>
                <LandmarkIcon data-icon="inline-start" />
                {t('loans.openPage')}
              </Link>
            </Button>
            {/* A closed loan drops out of the sidebar, so its own page is unreachable: without this
                there is no way left to remove one entered by mistake. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isAnyPending || pendingDelete}
              onClick={onDeleteLoan}
            >
              {pendingDelete ? <Spinner data-icon="inline-start" /> : null}
              {t('loans.delete.action')}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={t('credit.edit.aria')}
              onClick={toggleEditing}
            >
              <PencilIcon data-icon="icon" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={t('credit.edit.aria')}
            onClick={toggleEditing}
          >
            <PencilIcon data-icon="icon" />
          </Button>
        )}
      </CardFooter>
      <DetailSheet
        open={reclassificationOpen}
        onOpenChange={setReclassificationOpen}
        size="lg"
        title={t('loans.reclassify.dialogTitle')}
        description={t('loans.reclassify.dialogDescription')}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setReclassificationOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form={`loan-reclassification-form-${facility._id}`}
              disabled={!loanValues.annualRate.trim() || !loanValues.minimumPayment.trim() || pendingReclassification}
            >
              {pendingReclassification ? <Spinner data-icon="inline-start" /> : null}
              {t('loans.reclassify.action')}
            </Button>
          </>
        }
      >
        <form
          id={`loan-reclassification-form-${facility._id}`}
          className="py-4"
          onSubmit={(event) => {
            event.preventDefault();
            onReclassifyAsLoan(loanValues);
          }}
        >
          <LoanFormFields
            accounts={settlementAccounts}
            allowNoSettlementAccount
            groups={planGroups}
            showBalance={false}
            showCurrency={false}
            showFirstPaymentDate={false}
            showName={false}
            values={loanValues}
            onChange={setLoanValues}
          />
        </form>
      </DetailSheet>
    </Card>
  );
}
