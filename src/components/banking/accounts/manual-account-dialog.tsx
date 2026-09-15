import * as React from 'react';
import { useMutation } from 'convex/react';
import { CreditCardIcon, LandmarkIcon, WalletCardsIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import { LoanFormFields } from '../loans/loan-form-fields';
import { parsePercentageToBasisPoints } from '../loans/loan-form-utils';
import type { LoanFormValues, LoanType } from '../loans/loan-form-fields';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { TranslationKey } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useAuthedQuery } from '@/hooks/use-authed-query';
import { useI18n } from '@/lib/i18n';
import { parseMoneyMinor } from '@/lib/money';

type ManualAccountType = 'CASH' | 'CARD' | 'CACC' | 'SVGS';
type AccountSelection = ManualAccountType | LoanType;

// Step 2 belongs to whichever type was picked; a generic "Add manual account" there left the user
// with nothing on screen saying they were filling in a mortgage rather than a savings account.
const selectionTitleKeys: Record<AccountSelection, TranslationKey> = {
  CASH: 'accounts.manual.typeCash',
  CACC: 'accounts.manual.typeChecking',
  SVGS: 'accounts.manual.typeSavings',
  CARD: 'accounts.manual.typeCard',
  mortgage: 'credit.facility.mortgage',
  autoLoan: 'credit.facility.autoLoan',
  personalLoan: 'credit.facility.personalLoan',
};

const CASH_TYPES = ['CASH', 'CACC', 'SVGS'] as const;
const CREDIT_TYPES: ReadonlyArray<ManualAccountType> = ['CARD'];
const cashTypeKeys: Record<(typeof CASH_TYPES)[number], { label: TranslationKey; description: TranslationKey }> = {
  CASH: { label: 'accounts.manual.typeCash', description: 'accounts.manual.typeCashDescription' },
  CACC: { label: 'accounts.manual.typeChecking', description: 'accounts.manual.typeCheckingDescription' },
  SVGS: { label: 'accounts.manual.typeSavings', description: 'accounts.manual.typeSavingsDescription' },
};
const LOAN_TYPES: ReadonlyArray<LoanType> = ['mortgage', 'autoLoan', 'personalLoan'];

function isLoanType(value: AccountSelection): value is LoanType {
  return LOAN_TYPES.includes(value as LoanType);
}

function isCashAccountType(accountType?: string | null) {
  const normalized = accountType?.trim().toUpperCase();
  return normalized !== 'CARD' && normalized !== 'INVS' && normalized !== 'ASST';
}

function initialLoanValues(): LoanFormValues {
  return {
    name: '',
    loanType: 'mortgage',
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
  };
}

function TypeOption({
  description,
  icon: Icon,
  label,
  onClick,
}: {
  description: string;
  icon: typeof LandmarkIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={onClick}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

export function ManualAccountDialog({ onOpenChange, open }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { intlLocale, t } = useI18n();
  const createManualAccount = useMutation(api.banking.manualAccounts.createManualAccount);
  const createLoanAccount = useMutation(api.banking.loans.createLoanAccount);
  const accounts = useAuthedQuery(api.banking.accounts.listAccounts, { status: 'active', limit: 200 });
  const activePlan = useAuthedQuery(api.banking.planRead.getActivePlan, {});
  const planMonth = useAuthedQuery(api.banking.planRead.getPlanMonth, activePlan ? { planId: activePlan.id } : 'skip');
  const { isPending, run } = usePendingAction();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [selection, setSelection] = React.useState<AccountSelection>('CARD');
  const [name, setName] = React.useState('');
  const [currency, setCurrency] = React.useState('EUR');
  const [alias, setAlias] = React.useState('');
  const [loanValues, setLoanValues] = React.useState<LoanFormValues>(() => initialLoanValues());
  const [paymentError, setPaymentError] = React.useState('');
  const [originalPrincipalError, setOriginalPrincipalError] = React.useState('');
  const pendingKey = isLoanType(selection) ? 'loan-account-create' : 'manual-account-create';

  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelection('CARD');
    setName('');
    setCurrency('EUR');
    setAlias('');
    setLoanValues(initialLoanValues());
    setPaymentError('');
    setOriginalPrincipalError('');
  }, [open]);

  const cashAccounts = accounts?.filter((account) => isCashAccountType(account.accountType)) ?? [];
  const planGroups =
    activePlan?.currency === loanValues.currency
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
  const manualCanSubmit = Boolean(name.trim() && /^[A-Za-z]{3}$/.test(currency.trim())) && !isPending(pendingKey);
  const loanCanSubmit =
    Boolean(
      loanValues.name.trim() &&
      loanValues.currentBalance.trim() &&
      loanValues.annualRate.trim() &&
      loanValues.minimumPayment.trim() &&
      loanValues.settlementAccountId !== 'none' &&
      loanValues.firstPaymentDate,
    ) && !isPending(pendingKey);

  function choose(value: AccountSelection) {
    setSelection(value);
    if (isLoanType(value)) {
      setLoanValues({ ...initialLoanValues(), loanType: value });
    }
    setStep(2);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError('');
    setOriginalPrincipalError('');
    const saved = await run(
      pendingKey,
      async () => {
        if (!isLoanType(selection)) {
          await createManualAccount({
            name: name.trim(),
            accountType: selection,
            currency: currency.trim().toUpperCase(),
            alias: alias.trim() || undefined,
          });
          return;
        }

        await createLoanAccount({
          name: loanValues.name.trim(),
          loanType: selection,
          currentBalance: {
            amountMinor: parseMoneyMinor(loanValues.currentBalance, loanValues.currency, intlLocale),
            currency: loanValues.currency,
          },
          originalPrincipalAmount: loanValues.originalPrincipal.trim()
            ? {
                amountMinor: parseMoneyMinor(loanValues.originalPrincipal, loanValues.currency, intlLocale),
                currency: loanValues.currency,
              }
            : undefined,
          annualNominalRateBps: parsePercentageToBasisPoints(loanValues.annualRate),
          minimumPaymentAmount: {
            amountMinor: parseMoneyMinor(loanValues.minimumPayment, loanValues.currency, intlLocale),
            currency: loanValues.currency,
          },
          escrowAmount: loanValues.escrow.trim()
            ? {
                amountMinor: parseMoneyMinor(loanValues.escrow, loanValues.currency, intlLocale),
                currency: loanValues.currency,
              }
            : undefined,
          finalPaymentAmount: loanValues.finalPayment.trim()
            ? {
                amountMinor: parseMoneyMinor(loanValues.finalPayment, loanValues.currency, intlLocale),
                currency: loanValues.currency,
              }
            : undefined,
          settlementAccountId: loanValues.settlementAccountId as Id<'financialAccounts'>,
          firstPaymentDate: loanValues.firstPaymentDate,
          maturityDate: loanValues.maturityDate.trim() || undefined,
          pairedPlanBucketId:
            loanValues.pairedPlanBucketId === 'none' ? undefined : (loanValues.pairedPlanBucketId as Id<'planBuckets'>),
        });
      },
      {
        success: t(isLoanType(selection) ? 'loans.created' : 'accounts.manual.created'),
        error: t(isLoanType(selection) ? 'loans.createFailed' : 'accounts.manual.createFailed'),
        getErrorMessage: (error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (isLoanType(selection) && message.includes('does not amortise')) {
            setPaymentError(t('loans.errors.nonAmortising'));
            return t('loans.errors.nonAmortising');
          }
          if (isLoanType(selection) && message.includes('Original principal amount')) {
            setOriginalPrincipalError(t('loans.errors.originalPrincipalTooLow'));
            return t('loans.errors.originalPrincipalTooLow');
          }
          return t(isLoanType(selection) ? 'loans.createFailed' : 'accounts.manual.createFailed');
        },
      },
    );
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? t('accounts.manual.selectTypeTitle') : t(selectionTitleKeys[selection])}
          </DialogTitle>
          <DialogDescription>
            {step === 1 ? t('accounts.manual.selectTypeDescription') : t('accounts.manual.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid max-h-[65vh] gap-5 overflow-y-auto pr-1">
            <section className="grid gap-2">
              <div>
                <h3 className="font-medium">{t('accounts.manual.group.cash')}</h3>
                <p className="text-sm text-muted-foreground">{t('accounts.manual.group.cashDescription')}</p>
              </div>
              {CASH_TYPES.map((type) => (
                <TypeOption
                  key={type}
                  icon={LandmarkIcon}
                  label={t(cashTypeKeys[type].label)}
                  description={t(cashTypeKeys[type].description)}
                  onClick={() => choose(type)}
                />
              ))}
            </section>
            <section className="grid gap-2">
              <div>
                <h3 className="font-medium">{t('accounts.manual.group.credit')}</h3>
                <p className="text-sm text-muted-foreground">{t('accounts.manual.group.creditDescription')}</p>
              </div>
              {CREDIT_TYPES.map((type) => (
                <TypeOption
                  key={type}
                  icon={CreditCardIcon}
                  label={t('accounts.manual.typeCard')}
                  description={t('accounts.manual.typeCardDescription')}
                  onClick={() => choose(type)}
                />
              ))}
            </section>
            <section className="grid gap-2">
              <div>
                <h3 className="font-medium">{t('accounts.manual.group.loans')}</h3>
                <p className="text-sm text-muted-foreground">{t('accounts.manual.group.loansDescription')}</p>
              </div>
              {LOAN_TYPES.map((type) => (
                <TypeOption
                  key={type}
                  icon={WalletCardsIcon}
                  label={t(`credit.facility.${type}`)}
                  description={t(`loans.type.${type}.description`)}
                  onClick={() => choose(type)}
                />
              ))}
            </section>
          </div>
        ) : (
          <form id="manual-account-form" onSubmit={submit} className="max-h-[65vh] overflow-y-auto pr-1">
            {isLoanType(selection) ? (
              <LoanFormFields
                accounts={cashAccounts}
                groups={planGroups}
                originalPrincipalError={originalPrincipalError}
                paymentError={paymentError}
                showLoanType={false}
                values={loanValues}
                onChange={(values) => {
                  setLoanValues(values);
                  if (values.minimumPayment !== loanValues.minimumPayment) setPaymentError('');
                  if (values.originalPrincipal !== loanValues.originalPrincipal) setOriginalPrincipalError('');
                }}
              />
            ) : (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="manualAccountName">{t('common.name')}</FieldLabel>
                  <Input id="manualAccountName" value={name} onChange={(event) => setName(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="manualAccountCurrency">{t('accounts.manual.currencyLabel')}</FieldLabel>
                  <Input
                    id="manualAccountCurrency"
                    value={currency}
                    maxLength={3}
                    onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="manualAccountAlias">{t('accounts.manage.aliasLabel')}</FieldLabel>
                  <Input
                    id="manualAccountAlias"
                    value={alias}
                    placeholder={t('accounts.manage.aliasPlaceholder')}
                    onChange={(event) => setAlias(event.target.value)}
                  />
                  <FieldDescription>{t('accounts.manual.aliasDescription')}</FieldDescription>
                </Field>
              </FieldGroup>
            )}
          </form>
        )}

        <DialogFooter>
          {step === 2 ? (
            <Button type="button" variant="outline" disabled={isPending(pendingKey)} onClick={() => setStep(1)}>
              {t('import.back')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {step === 2 ? (
            <Button
              type="submit"
              form="manual-account-form"
              disabled={isLoanType(selection) ? !loanCanSubmit : !manualCanSubmit}
            >
              {isPending(pendingKey) ? <Spinner data-icon="inline-start" /> : null}
              {t('common.save')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
