import { CURRENCIES } from '../credit/options';
import type { CurrencyValue } from '../credit/options';
import { accountLabel } from '@/lib/accounts';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';

export type LoanType = 'mortgage' | 'autoLoan' | 'personalLoan';

export type LoanFormValues = {
  name: string;
  loanType: LoanType;
  currentBalance: string;
  originalPrincipal: string;
  annualRate: string;
  minimumPayment: string;
  escrow: string;
  finalPayment: string;
  settlementAccountId: string;
  firstPaymentDate: string;
  maturityDate: string;
  pairedPlanBucketId: string;
  currency: CurrencyValue;
};

type CashAccountOption = {
  _id: string;
  name: string;
  alias?: string | null;
  institutionName?: string | null;
  currency: string;
};

type PlanGroupOption = {
  groupId: string;
  name: string;
  buckets: Array<{ bucketId: string; name: string }>;
};

export function LoanFormFields({
  accounts,
  groups,
  allowNoSettlementAccount = false,
  originalPrincipalError,
  paymentError,
  showRequiredErrors = false,
  showBalance = true,
  showCurrency = true,
  showFirstPaymentDate = true,
  showLoanType = true,
  showName = true,
  values,
  onChange,
}: {
  accounts: Array<CashAccountOption>;
  groups: Array<PlanGroupOption>;
  allowNoSettlementAccount?: boolean;
  originalPrincipalError?: string;
  paymentError?: string;
  showRequiredErrors?: boolean;
  showBalance?: boolean;
  showCurrency?: boolean;
  showFirstPaymentDate?: boolean;
  showLoanType?: boolean;
  showName?: boolean;
  values: LoanFormValues;
  onChange: (values: LoanFormValues) => void;
}) {
  const { t } = useI18n();
  const compatibleAccounts = accounts.filter((account) => account.currency === values.currency);
  const requiredError = t('loans.requiredField');

  return (
    <FieldGroup>
      {showName ? (
        <Field data-invalid={showRequiredErrors && !values.name.trim()}>
          <FieldLabel htmlFor="loanName">{t('common.name')}</FieldLabel>
          <Input
            id="loanName"
            aria-required="true"
            aria-invalid={showRequiredErrors && !values.name.trim()}
            aria-errormessage={showRequiredErrors && !values.name.trim() ? 'loanName-error' : undefined}
            value={values.name}
            onChange={(event) => onChange({ ...values, name: event.target.value })}
          />
          {showRequiredErrors && !values.name.trim() ? (
            <FieldError id="loanName-error">{requiredError}</FieldError>
          ) : null}
        </Field>
      ) : null}
      {showLoanType ? (
        <Field>
          <FieldLabel htmlFor="loanType">{t('accounts.manual.typeLabel')}</FieldLabel>
          <Select
            value={values.loanType}
            onValueChange={(loanType) => onChange({ ...values, loanType: loanType as LoanType })}
          >
            <SelectTrigger id="loanType" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="mortgage">{t('credit.facility.mortgage')}</SelectItem>
                <SelectItem value="autoLoan">{t('credit.facility.autoLoan')}</SelectItem>
                <SelectItem value="personalLoan">{t('credit.facility.personalLoan')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {showBalance ? (
          <Field data-invalid={showRequiredErrors && !values.currentBalance.trim()}>
            <FieldLabel htmlFor="loanCurrentBalance">{t('loans.currentBalance')}</FieldLabel>
            <Input
              id="loanCurrentBalance"
              aria-required="true"
              aria-invalid={showRequiredErrors && !values.currentBalance.trim()}
              aria-errormessage={
                showRequiredErrors && !values.currentBalance.trim() ? 'loanCurrentBalance-error' : undefined
              }
              inputMode="decimal"
              value={values.currentBalance}
              onChange={(event) => onChange({ ...values, currentBalance: event.target.value })}
            />
            {showRequiredErrors && !values.currentBalance.trim() ? (
              <FieldError id="loanCurrentBalance-error">{requiredError}</FieldError>
            ) : null}
          </Field>
        ) : null}
        {showCurrency ? (
          <Field>
            <FieldLabel htmlFor="loanCurrency">{t('common.currency')}</FieldLabel>
            <Select
              value={values.currency}
              onValueChange={(currency) =>
                onChange({
                  ...values,
                  currency: currency as CurrencyValue,
                  settlementAccountId: 'none',
                  pairedPlanBucketId: 'none',
                })
              }
            >
              <SelectTrigger id="loanCurrency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </div>
      <Field data-invalid={Boolean(originalPrincipalError)}>
        <FieldLabel htmlFor="loanOriginalPrincipal">{t('loans.originalPrincipalOptional')}</FieldLabel>
        <Input
          id="loanOriginalPrincipal"
          inputMode="decimal"
          aria-invalid={Boolean(originalPrincipalError)}
          value={values.originalPrincipal}
          onChange={(event) => onChange({ ...values, originalPrincipal: event.target.value })}
        />
        <FieldError>{originalPrincipalError}</FieldError>
        <FieldDescription>{t('loans.originalPrincipalHint')}</FieldDescription>
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field data-invalid={showRequiredErrors && !values.annualRate.trim()}>
          <FieldLabel htmlFor="loanAnnualRate">{t('loans.interestRatePercent')}</FieldLabel>
          <Input
            id="loanAnnualRate"
            aria-required="true"
            aria-invalid={showRequiredErrors && !values.annualRate.trim()}
            aria-errormessage={
              showRequiredErrors && !values.annualRate.trim() ? 'loanAnnualRate-error' : undefined
            }
            inputMode="decimal"
            value={values.annualRate}
            onChange={(event) => onChange({ ...values, annualRate: event.target.value })}
          />
          {showRequiredErrors && !values.annualRate.trim() ? (
            <FieldError id="loanAnnualRate-error">{requiredError}</FieldError>
          ) : null}
        </Field>
        <Field data-invalid={Boolean(paymentError) || (showRequiredErrors && !values.minimumPayment.trim())}>
          <FieldLabel htmlFor="loanMinimumPayment">{t('loans.minimumPaymentRequired')}</FieldLabel>
          <Input
            id="loanMinimumPayment"
            inputMode="decimal"
            aria-required="true"
            aria-invalid={Boolean(paymentError) || (showRequiredErrors && !values.minimumPayment.trim())}
            aria-errormessage={
              paymentError || (showRequiredErrors && !values.minimumPayment.trim())
                ? 'loanMinimumPayment-error'
                : undefined
            }
            value={values.minimumPayment}
            onChange={(event) => onChange({ ...values, minimumPayment: event.target.value })}
          />
          <FieldError id="loanMinimumPayment-error">
            {paymentError || (showRequiredErrors && !values.minimumPayment.trim() ? requiredError : '')}
          </FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="loanEscrow">{t('loans.escrowOptional')}</FieldLabel>
          <Input
            id="loanEscrow"
            inputMode="decimal"
            value={values.escrow}
            onChange={(event) => onChange({ ...values, escrow: event.target.value })}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="loanFinalPayment">{t('loans.finalPaymentOptional')}</FieldLabel>
        <Input
          id="loanFinalPayment"
          inputMode="decimal"
          value={values.finalPayment}
          onChange={(event) => onChange({ ...values, finalPayment: event.target.value })}
        />
        <FieldDescription>{t('loans.finalPaymentHint')}</FieldDescription>
      </Field>
      <Field data-invalid={showRequiredErrors && values.settlementAccountId === 'none'}>
        <FieldLabel htmlFor="loanSettlementAccount">{t('loans.settlementAccount')}</FieldLabel>
        <Select
          value={values.settlementAccountId}
          onValueChange={(settlementAccountId) => onChange({ ...values, settlementAccountId })}
        >
          <SelectTrigger
            id="loanSettlementAccount"
            className="w-full"
            aria-required="true"
            aria-invalid={showRequiredErrors && values.settlementAccountId === 'none'}
            aria-errormessage={
              showRequiredErrors && values.settlementAccountId === 'none'
                ? 'loanSettlementAccount-error'
                : undefined
            }
          >
            <SelectValue placeholder={t('loans.selectSettlementAccount')} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {allowNoSettlementAccount ? (
                <SelectItem value="none">{t('credit.form.noSettlementAccount')}</SelectItem>
              ) : null}
              {compatibleAccounts.map((account) => (
                <SelectItem key={account._id} value={account._id}>
                  {accountLabel(account)} · {account.currency}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {showRequiredErrors && values.settlementAccountId === 'none' ? (
          <FieldError id="loanSettlementAccount-error">{requiredError}</FieldError>
        ) : null}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {showFirstPaymentDate ? (
          <Field data-invalid={showRequiredErrors && !values.firstPaymentDate}>
            <FieldLabel htmlFor="loanFirstPaymentDate">{t('loans.firstPaymentDate')}</FieldLabel>
            <Input
              id="loanFirstPaymentDate"
              aria-required="true"
              aria-invalid={showRequiredErrors && !values.firstPaymentDate}
              aria-errormessage={
                showRequiredErrors && !values.firstPaymentDate ? 'loanFirstPaymentDate-error' : undefined
              }
              type="date"
              value={values.firstPaymentDate}
              onChange={(event) => onChange({ ...values, firstPaymentDate: event.target.value })}
            />
            {showRequiredErrors && !values.firstPaymentDate ? (
              <FieldError id="loanFirstPaymentDate-error">{requiredError}</FieldError>
            ) : null}
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="loanMaturityDate">{t('loans.maturityDateOptional')}</FieldLabel>
          <Input
            id="loanMaturityDate"
            type="date"
            value={values.maturityDate}
            onChange={(event) => onChange({ ...values, maturityDate: event.target.value })}
          />
          <FieldDescription>{t('loans.maturityDateHint')}</FieldDescription>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="loanPairedPlanBucket">{t('loans.pairedPlanCategory')}</FieldLabel>
        <Select
          value={values.pairedPlanBucketId}
          onValueChange={(pairedPlanBucketId) => onChange({ ...values, pairedPlanBucketId })}
        >
          <SelectTrigger id="loanPairedPlanBucket" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('loans.noPairedPlanCategory')}</SelectItem>
            {groups.map((group) => (
              <SelectGroup key={group.groupId}>
                {group.buckets.map((bucket) => (
                  <SelectItem key={bucket.bucketId} value={bucket.bucketId}>
                    {group.name} · {bucket.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}
