import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import { CalendarIcon, PencilIcon, RefreshCwIcon, TrendingDownIcon } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts';

import { api } from '../../../../convex/_generated/api';
import { facilityTypeLabel } from '../credit/options';
import { LoanFormFields } from './loan-form-fields';
import { formatBasisPointsInput, parsePercentageToBasisPoints } from './loan-form-utils';
import type { LoanFormValues, LoanType } from './loan-form-fields';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import type { ChartConfig } from '@/components/ui/chart';
import { Amount } from '@/components/app/amount';
import { AppPage } from '@/components/app/app-page';
import { ChartCard } from '@/components/app/chart-card';
import { DetailSheet } from '@/components/app/detail-sheet';
import { EmptyState } from '@/components/app/empty-state';
import { PanelSkeleton, StatRowSkeleton } from '@/components/app/skeletons';
import { StatCard, StatCardGroup } from '@/components/app/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useAuthedQuery } from '@/hooks/use-authed-query';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';
import { moneyInputValue, parseMoneyMinor } from '@/lib/money';

type LoanOverview = FunctionReturnType<typeof api.banking.loans.getLoanOverview>;
type ProjectionDatum = {
  month: string;
  balance: number;
  balanceMinor: bigint;
};

type TooltipPayload = { payload?: ProjectionDatum };

function isCashAccountType(accountType?: string | null) {
  const normalized = accountType?.trim().toUpperCase();
  return normalized !== 'CARD' && normalized !== 'INVS' && normalized !== 'ASST';
}

function formatIsoDate(value: string | null | undefined, locale: string, fallback: string) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function formatPercent(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function formatMonth(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}-01T00:00:00.000Z`),
  );
}

function ProjectionTooltip({
  active,
  currency,
  payload,
}: {
  active: boolean;
  currency: string;
  payload?: ReadonlyArray<TooltipPayload>;
}) {
  const { intlLocale, t } = useI18n();
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="grid min-w-44 gap-1.5 rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
      <span className="font-medium">{formatMonth(datum.month, intlLocale)}</span>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">{t('loans.remainingBalance')}</span>
        <Amount money={{ amountMinor: datum.balanceMinor, currency }} className="font-medium" />
      </div>
    </div>
  );
}

function LoanProgressChart({ overview }: { overview: LoanOverview }) {
  const { t } = useI18n();
  const currency = overview.facility.limitAmount.currency;
  const data: Array<ProjectionDatum> =
    overview.payoffProjection?.series.map((point) => ({
      month: point.month,
      balance: Number(point.balanceMinor),
      balanceMinor: point.balanceMinor,
    })) ?? [];
  const config = {
    balance: { label: t('loans.remainingBalance'), color: 'var(--chart-1)' },
  } satisfies ChartConfig;

  return (
    <ChartCard
      title={t('loans.progress.title')}
      description={t('loans.progress.description')}
      data={data}
      height={340}
      empty={{ icon: TrendingDownIcon, title: t('loans.progress.empty') }}
    >
      {(rows) => (
        <ChartContainer config={config} className="h-full w-full">
          <LineChart accessibilityLayer data={rows} margin={{ top: 16, right: 12, bottom: 4, left: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} minTickGap={36} />
            <ChartTooltip
              cursor={{ stroke: 'var(--border)' }}
              content={({ active, payload }) => (
                <ProjectionTooltip active={Boolean(active)} currency={currency} payload={payload} />
              )}
            />
            <Line
              type="monotone"
              dataKey="balance"
              name="balance"
              stroke="var(--color-balance)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
            />
          </LineChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}

function PairedPlanCategory({
  overview,
  planMonth,
  onEdit,
  onUnpair,
  unpairing,
}: {
  overview: LoanOverview;
  planMonth: FunctionReturnType<typeof api.banking.planRead.getPlanMonth> | undefined;
  onEdit: () => void;
  onUnpair: () => void;
  unpairing: boolean;
}) {
  const { intlLocale, t } = useI18n();
  const paired = overview.pairedPlanBucket;
  const state = planMonth?.groups.flatMap((group) => group.buckets).find((bucket) => bucket.bucketId === paired?._id);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t('loans.pairedPlanCategory')}</CardTitle>
        <CardDescription>{t('loans.pairedPlanCategory.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {paired ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="grid gap-2">
              <div className="font-medium">{paired.name}</div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('loans.planTarget')}: </span>
                  {state?.target ? (
                    <Amount money={{ amountMinor: state.target.amountMinor, currency: state.target.currency }} />
                  ) : (
                    t('common.notScheduled')
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">{t('loans.planDue')}: </span>
                  {formatIsoDate(state?.dueDate ?? state?.target?.dueDate, intlLocale, t('common.notScheduled'))}
                </div>
              </div>
            </div>
            <Button type="button" variant="outline" disabled={unpairing} onClick={onUnpair}>
              {unpairing ? <Spinner data-icon="inline-start" /> : null}
              {t('loans.unpairPlanCategory')}
            </Button>
          </div>
        ) : (
          <EmptyState
            className="min-h-0 border-0 p-0"
            icon={CalendarIcon}
            title={t('loans.noPairedPlanCategory')}
            hint={t('loans.noPairedPlanCategory.hint')}
            action={
              <Button type="button" variant="outline" onClick={onEdit}>
                {t('loans.pairPlanCategory')}
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function LoanActivity({ overview }: { overview: LoanOverview }) {
  const { intlLocale, t } = useI18n();
  const groups = [...overview.paymentsByMonth].reverse();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t('loans.activity.title')}</CardTitle>
        <CardDescription>{t('loans.activity.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <EmptyState className="min-h-0 border-0 p-0" title={t('loans.activity.empty')} />
        ) : (
          <div className="divide-y divide-border/60 rounded-md border">
            {groups.map((group) => (
              <section key={group.month} className="grid gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium capitalize">{formatMonth(group.month, intlLocale)}</h3>
                  <Amount money={group.amount} className="font-medium" />
                </div>
                <div className="grid gap-2">
                  {group.payments.map((payment) => (
                    <div
                      key={payment._id}
                      className="grid gap-1 text-sm sm:grid-cols-[minmax(8rem,1fr)_repeat(4,minmax(5rem,auto))] sm:items-center sm:gap-4"
                    >
                      <div>
                        <div>{formatIsoDate(payment.paymentDate, intlLocale, payment.paymentDate)}</div>
                        {payment.notes ? <div className="text-xs text-muted-foreground">{payment.notes}</div> : null}
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t('loans.activity.payment')}</div>
                        <Amount money={payment.amount} />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t('loans.activity.principal')}</div>
                        <Amount money={payment.principalAmount ?? payment.amount} />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t('loans.activity.interest')}</div>
                        <Amount
                          money={
                            payment.interestAmount ?? {
                              amountMinor: 0n,
                              currency: overview.facility.limitAmount.currency,
                            }
                          }
                        />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t('loans.activity.fees')}</div>
                        <Amount
                          money={
                            payment.feeAmount ?? {
                              amountMinor: 0n,
                              currency: overview.facility.limitAmount.currency,
                            }
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LoanDetailView({
  facilityId,
  fallbackName,
}: {
  facilityId: Id<'creditFacilities'>;
  fallbackName: string;
}) {
  const { intlLocale, t } = useI18n();
  const overview = useAuthedQuery(api.banking.loans.getLoanOverview, { creditFacilityId: facilityId });
  const accounts = useAuthedQuery(api.banking.accounts.listAccounts, { status: 'active', limit: 200 });
  const activePlan = useAuthedQuery(api.banking.planRead.getActivePlan, {});
  const planMonth = useAuthedQuery(api.banking.planRead.getPlanMonth, activePlan ? { planId: activePlan.id } : 'skip');
  const updateLoanTerms = useMutation(api.banking.loans.updateLoanTerms);
  const closeLoan = useMutation(api.banking.loans.closeLoan);
  const deleteLoan = useMutation(api.banking.loans.deleteLoan);
  const navigate = useNavigate();
  const updateLoanBalance = useMutation(api.banking.loans.updateLoanBalance);
  const pending = usePendingAction();
  const [balanceOpen, setBalanceOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [balanceValue, setBalanceValue] = React.useState('');
  const [adjustmentDate, setAdjustmentDate] = React.useState('');
  const [balanceNotes, setBalanceNotes] = React.useState('');
  const [paymentError, setPaymentError] = React.useState('');
  const [originalPrincipalError, setOriginalPrincipalError] = React.useState('');
  const [editValues, setEditValues] = React.useState<LoanFormValues>({
    name: '',
    loanType: 'personalLoan',
    currentBalance: '',
    originalPrincipal: '',
    annualRate: '',
    minimumPayment: '',
    escrow: '',
    finalPayment: '',
    settlementAccountId: 'none',
    firstPaymentDate: '',
    maturityDate: '',
    pairedPlanBucketId: 'none',
    currency: 'EUR',
  });

  React.useEffect(() => {
    if (!overview || !balanceOpen) return;
    const outstanding = overview.activePlan?.outstandingAmount ?? overview.facility.usedAmount;
    setBalanceValue(moneyInputValue(outstanding, intlLocale));
    setAdjustmentDate(new Date().toISOString().slice(0, 10));
    setBalanceNotes('');
  }, [balanceOpen, intlLocale, overview]);

  React.useEffect(() => {
    if (!overview || !editOpen) return;
    const minimumPayment = overview.facility.minimumPaymentAmount ?? overview.activePlan?.monthlyPaymentAmount;
    setEditValues({
      name: overview.facility.name,
      loanType: overview.facility.facilityType as LoanType,
      currentBalance: '',
      originalPrincipal: overview.facility.originalPrincipalAmount
        ? moneyInputValue(overview.facility.originalPrincipalAmount, intlLocale)
        : '',
      annualRate: formatBasisPointsInput(overview.facility.annualNominalRateBps ?? 0, intlLocale),
      minimumPayment: minimumPayment ? moneyInputValue(minimumPayment, intlLocale) : '',
      escrow: overview.facility.escrowAmount ? moneyInputValue(overview.facility.escrowAmount, intlLocale) : '',
      finalPayment: overview.facility.finalPaymentAmount
        ? moneyInputValue(overview.facility.finalPaymentAmount, intlLocale)
        : '',
      settlementAccountId: overview.facility.settlementAccountId ?? 'none',
      firstPaymentDate: overview.facility.firstPaymentDate ?? '',
      maturityDate: overview.facility.maturityDate ?? '',
      pairedPlanBucketId: overview.facility.pairedPlanBucketId ?? 'none',
      currency: overview.facility.limitAmount.currency as LoanFormValues['currency'],
    });
    setPaymentError('');
    setOriginalPrincipalError('');
  }, [editOpen, intlLocale, overview]);

  if (overview === undefined) {
    return (
      <AppPage title={fallbackName}>
        <StatRowSkeleton />
        <PanelSkeleton rows={4} />
        <PanelSkeleton rows={3} />
      </AppPage>
    );
  }

  const facility = overview.facility;
  const outstanding = overview.activePlan?.outstandingAmount ?? facility.usedAmount;
  const minimumPayment = facility.minimumPaymentAmount ?? overview.activePlan?.monthlyPaymentAmount;
  const cashAccounts =
    accounts?.filter((account) => account.status === 'active' && isCashAccountType(account.accountType)) ?? [];
  const planGroups =
    activePlan?.currency === facility.limitAmount.currency
      ? (planMonth?.groups
          .filter((group) => !group.hidden)
          .map((group) => ({
            groupId: group.groupId,
            name: group.name,
            buckets: group.buckets
              .filter((bucket) => !bucket.hidden)
              .map((bucket) => ({ bucketId: bucket.bucketId, name: bucket.name })),
          })) ?? [])
      : [];

  async function saveBalance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await pending.run(
      `loan-balance:${facilityId}`,
      async () => {
        await updateLoanBalance({
          creditFacilityId: facilityId,
          currentBalance: {
            amountMinor: parseMoneyMinor(balanceValue, facility.limitAmount.currency, intlLocale),
            currency: facility.limitAmount.currency,
          },
          adjustmentDate,
          notes: balanceNotes.trim() || undefined,
        });
      },
      { success: t('loans.balance.updated'), error: t('loans.balance.updateFailed') },
    );
    if (saved) setBalanceOpen(false);
  }

  async function deleteThisLoan() {
    const deleted = await pending.run(
      `loan-delete:${facilityId}`,
      async () => {
        await deleteLoan({ creditFacilityId: facilityId });
      },
      { success: t('loans.delete.deleted'), error: t('loans.delete.failed') },
    );
    if (deleted) {
      trackEvent(analyticsEvents.loanDeleted, { surface: 'loans' });
      setEditOpen(false);
      await navigate({ to: '/app/transactions' });
    }
  }

  async function closeThisLoan() {
    const closed = await pending.run(
      `loan-close:${facilityId}`,
      async () => {
        await closeLoan({ creditFacilityId: facilityId });
      },
      { success: t('loans.close.closed'), error: t('loans.close.failed') },
    );
    if (closed) {
      setEditOpen(false);
      await navigate({ to: '/app/transactions' });
    }
  }

  async function saveTerms(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError('');
    setOriginalPrincipalError('');
    const saved = await pending.run(
      `loan-terms:${facilityId}`,
      async () => {
        await updateLoanTerms({
          creditFacilityId: facilityId,
          name: editValues.name.trim(),
          originalPrincipalAmount: editValues.originalPrincipal.trim()
            ? {
                amountMinor: parseMoneyMinor(editValues.originalPrincipal, facility.limitAmount.currency, intlLocale),
                currency: facility.limitAmount.currency,
              }
            : null,
          annualNominalRateBps: parsePercentageToBasisPoints(editValues.annualRate),
          minimumPaymentAmount: {
            amountMinor: parseMoneyMinor(editValues.minimumPayment, facility.limitAmount.currency, intlLocale),
            currency: facility.limitAmount.currency,
          },
          escrowAmount: editValues.escrow.trim()
            ? {
                amountMinor: parseMoneyMinor(editValues.escrow, facility.limitAmount.currency, intlLocale),
                currency: facility.limitAmount.currency,
              }
            : null,
          finalPaymentAmount: editValues.finalPayment.trim()
            ? {
                amountMinor: parseMoneyMinor(editValues.finalPayment, facility.limitAmount.currency, intlLocale),
                currency: facility.limitAmount.currency,
              }
            : null,
          settlementAccountId:
            editValues.settlementAccountId === 'none'
              ? null
              : (editValues.settlementAccountId as Id<'financialAccounts'>),
          maturityDate: editValues.maturityDate.trim() || null,
          pairedPlanBucketId:
            editValues.pairedPlanBucketId === 'none' ? null : (editValues.pairedPlanBucketId as Id<'planBuckets'>),
        });
      },
      {
        success: t('loans.terms.updated'),
        error: t('loans.terms.updateFailed'),
        getErrorMessage: (error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('does not amortise')) {
            setPaymentError(t('loans.errors.nonAmortising'));
            return t('loans.errors.nonAmortising');
          }
          if (message.includes('Original principal amount')) {
            setOriginalPrincipalError(t('loans.errors.originalPrincipalTooLow'));
            return t('loans.errors.originalPrincipalTooLow');
          }
          return t('loans.terms.updateFailed');
        },
      },
    );
    if (saved) setEditOpen(false);
  }

  async function unpairPlanCategory() {
    await pending.run(
      `loan-unpair:${facilityId}`,
      async () => {
        await updateLoanTerms({ creditFacilityId: facilityId, pairedPlanBucketId: null });
      },
      { success: t('loans.planCategory.unpaired'), error: t('loans.terms.updateFailed') },
    );
  }

  return (
    <AppPage
      title={facility.name}
      description={facilityTypeLabel(facility.facilityType, t)}
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => setBalanceOpen(true)}>
            <RefreshCwIcon data-icon="inline-start" />
            {t('loans.updateBalance')}
          </Button>
          <Button type="button" onClick={() => setEditOpen(true)}>
            <PencilIcon data-icon="inline-start" />
            {t('loans.edit')}
          </Button>
        </>
      }
    >
      <StatCardGroup>
        <StatCard label={t('loans.remainingBalance')} value={<Amount money={outstanding} />} />
        {overview.repaymentProgress ? (
          <StatCard
            label={t('loans.repaid')}
            value={<Amount money={overview.repaymentProgress.repaidAmount} />}
            hint={t('loans.repaidOfPrincipal', {
              percent: formatPercent(overview.repaymentProgress.percent, intlLocale),
            })}
          />
        ) : null}
        {overview.repaymentProgress ? (
          <StatCard
            label={t('loans.originalPrincipal')}
            value={<Amount money={overview.repaymentProgress.originalPrincipalAmount} />}
          />
        ) : null}
        <StatCard
          label={t('loans.interestRate')}
          value={`${formatBasisPointsInput(facility.annualNominalRateBps ?? 0, intlLocale)}%`}
        />
        <StatCard
          label={t('loans.minimumPayment')}
          value={minimumPayment ? <Amount money={minimumPayment} /> : t('common.notScheduled')}
        />
        {facility.finalPaymentAmount ? (
          <StatCard label={t('loans.finalPaymentOptional')} value={<Amount money={facility.finalPaymentAmount} />} />
        ) : null}
        <StatCard
          label={t('loans.payoffDate')}
          value={formatIsoDate(overview.payoffProjection?.payoffDate, intlLocale, t('common.notScheduled'))}
        />
      </StatCardGroup>
      <LoanProgressChart overview={overview} />
      <PairedPlanCategory
        overview={overview}
        planMonth={planMonth}
        onEdit={() => setEditOpen(true)}
        onUnpair={() => void unpairPlanCategory()}
        unpairing={pending.isPending(`loan-unpair:${facilityId}`)}
      />
      <LoanActivity overview={overview} />

      <DetailSheet
        open={balanceOpen}
        onOpenChange={setBalanceOpen}
        title={t('loans.balance.dialogTitle')}
        description={t('loans.balance.dialogDescription')}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setBalanceOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="loan-balance-form"
              disabled={!balanceValue.trim() || !adjustmentDate || pending.isPending(`loan-balance:${facilityId}`)}
            >
              {pending.isPending(`loan-balance:${facilityId}`) ? <Spinner data-icon="inline-start" /> : null}
              {t('common.update')}
            </Button>
          </>
        }
      >
        <form id="loan-balance-form" className="py-4" onSubmit={saveBalance}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="loanBalanceValue">{t('loans.currentBalance')}</FieldLabel>
              <Input
                id="loanBalanceValue"
                inputMode="decimal"
                value={balanceValue}
                onChange={(event) => setBalanceValue(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="loanBalanceDate">{t('loans.balance.adjustmentDate')}</FieldLabel>
              <Input
                id="loanBalanceDate"
                type="date"
                value={adjustmentDate}
                onChange={(event) => setAdjustmentDate(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="loanBalanceNotes">{t('loans.balance.notes')}</FieldLabel>
              <Textarea
                id="loanBalanceNotes"
                value={balanceNotes}
                onChange={(event) => setBalanceNotes(event.target.value)}
              />
            </Field>
          </FieldGroup>
        </form>
      </DetailSheet>

      <DetailSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        size="lg"
        title={t('loans.terms.dialogTitle')}
        description={t('loans.terms.dialogDescription')}
        footer={
          <>
            {/* Without this a loan entered by mistake could never be removed. */}
            <div className="mr-auto flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                disabled={pending.isPending(`loan-close:${facilityId}`)}
                onClick={() => void closeThisLoan()}
              >
                {pending.isPending(`loan-close:${facilityId}`) ? <Spinner data-icon="inline-start" /> : null}
                {t('loans.close.action')}
              </Button>
              {/* Closing keeps the row and its history; deleting is the way out for something
                  entered by mistake, so both are offered rather than one standing for the other. */}
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending.isPending(`loan-delete:${facilityId}`)}
                onClick={() => void deleteThisLoan()}
              >
                {pending.isPending(`loan-delete:${facilityId}`) ? <Spinner data-icon="inline-start" /> : null}
                {t('loans.delete.action')}
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="loan-terms-form"
              disabled={
                !editValues.name.trim() ||
                !editValues.annualRate.trim() ||
                !editValues.minimumPayment.trim() ||
                editValues.settlementAccountId === 'none' ||
                pending.isPending(`loan-terms:${facilityId}`)
              }
            >
              {pending.isPending(`loan-terms:${facilityId}`) ? <Spinner data-icon="inline-start" /> : null}
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="loan-terms-form" className="py-4" onSubmit={saveTerms}>
          <LoanFormFields
            accounts={cashAccounts}
            groups={planGroups}
            originalPrincipalError={originalPrincipalError}
            paymentError={paymentError}
            showBalance={false}
            showCurrency={false}
            showFirstPaymentDate={false}
            showLoanType={false}
            values={editValues}
            onChange={(values) => {
              setEditValues(values);
              if (values.minimumPayment !== editValues.minimumPayment) setPaymentError('');
              if (values.originalPrincipal !== editValues.originalPrincipal) setOriginalPrincipalError('');
            }}
          />
        </form>
      </DetailSheet>
    </AppPage>
  );
}
