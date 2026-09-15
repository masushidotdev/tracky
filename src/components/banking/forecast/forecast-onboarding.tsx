import * as React from 'react';
import { LandmarkIcon, PiggyBankIcon, PlusIcon, Trash2Icon, WalletCardsIcon } from 'lucide-react';

import type { ForecastSeeds, OnboardingDraft } from './forecast-utils';
import { Amount } from '@/components/app/amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { moneyInputValue } from '@/lib/money';
import { useI18n } from '@/lib/i18n';

const stepKeys = [
  'forecast.onboarding.profile',
  'forecast.onboarding.accounts',
  'forecast.onboarding.income',
  'forecast.onboarding.expenses',
] as const;

type IncomeDraft = OnboardingDraft['incomeSources'][number] & { localId: string };

export function ForecastOnboarding({
  isPending,
  onSubmit,
  seeds,
}: {
  isPending: boolean;
  onSubmit: (draft: OnboardingDraft) => Promise<boolean>;
  seeds: ForecastSeeds;
}) {
  const { intlLocale, t } = useI18n();
  const currentYear = new Date().getUTCFullYear();
  const [step, setStep] = React.useState(0);
  const [birthYear, setBirthYear] = React.useState(currentYear - 35);
  const [retirementAge, setRetirementAge] = React.useState(67);
  const [accounts, setAccounts] = React.useState(() =>
    seeds.accounts.map((account) => ({
      accountId: account.accountId,
      included: account.included,
      growthAnnualPct: account.growthAnnualPct,
    })),
  );
  const nextIncomeId = React.useRef(seeds.incomeSources.length);
  const [incomeSources, setIncomeSources] = React.useState<Array<IncomeDraft>>(() => {
    const detected = seeds.incomeSources.map((source, index) => ({
      localId: `seed-${index}`,
      name: source.name,
      amountMonthly: moneyInputValue(source.amountMonthly, intlLocale),
      changeMode: source.changeMode,
      customPct: source.customPct,
    }));
    return detected.length > 0
      ? detected
      : [{ localId: 'new-0', name: '', amountMonthly: '', changeMode: 'inflation' as const }];
  });
  const [expensesAmount, setExpensesAmount] = React.useState(
    moneyInputValue(seeds.livingExpenses.amountMonthly, intlLocale),
  );
  const currentAge = currentYear - birthYear;
  const profileValid =
    birthYear >= 1900 && birthYear <= currentYear - 18 && retirementAge >= currentAge && retirementAge <= 120;
  const incomeValid =
    incomeSources.length > 0 &&
    incomeSources.every((source) => source.name.trim().length > 0 && source.amountMonthly.trim().length > 0);
  const expensesValid = expensesAmount.trim().length > 0;

  const updateAccount = (index: number, patch: Partial<(typeof accounts)[number]>) => {
    setAccounts((current) =>
      current.map((account, accountIndex) => (accountIndex === index ? { ...account, ...patch } : account)),
    );
  };

  const updateIncome = (localId: string, patch: Partial<IncomeDraft>) => {
    setIncomeSources((current) =>
      current.map((source) => (source.localId === localId ? { ...source, ...patch } : source)),
    );
  };

  const addIncome = () => {
    nextIncomeId.current += 1;
    setIncomeSources((current) => [
      ...current,
      {
        localId: `new-${nextIncomeId.current}`,
        name: '',
        amountMonthly: '',
        changeMode: 'inflation',
      },
    ]);
  };

  const submit = async () => {
    await onSubmit({
      birthYear,
      retirementAge,
      accounts,
      incomeSources: incomeSources.map(({ localId: _localId, ...source }) => source),
      expensesAmount,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" aria-label={t('forecast.onboarding.steps')}>
        {stepKeys.map((key, index) => (
          <Badge key={key} variant={index === step ? 'default' : index < step ? 'secondary' : 'outline'}>
            {index + 1}. {t(key)}
          </Badge>
        ))}
      </div>

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('forecast.onboarding.profileTitle')}</CardTitle>
            <CardDescription>{t('forecast.onboarding.profileDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="forecast-birth-year">{t('forecast.onboarding.birthYear')}</Label>
              <Input
                id="forecast-birth-year"
                type="number"
                min={1900}
                max={currentYear - 18}
                value={birthYear}
                onChange={(event) => setBirthYear(Number(event.target.value))}
              />
              <p className="text-xs text-muted-foreground">{t('forecast.onboarding.currentAge', { age: currentAge })}</p>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="forecast-retirement-age">{t('forecast.onboarding.retirementAge')}</Label>
                <Input
                  id="forecast-retirement-age"
                  type="number"
                  min={Math.max(18, currentAge)}
                  max={120}
                  value={retirementAge}
                  className="w-24"
                  onChange={(event) => setRetirementAge(Number(event.target.value))}
                />
              </div>
              <Slider
                value={[retirementAge]}
                min={Math.max(18, currentAge)}
                max={120}
                step={1}
                aria-label={t('forecast.onboarding.retirementAge')}
                onValueChange={(values) => setRetirementAge(values[0] ?? retirementAge)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('forecast.onboarding.currentAgeShort', { age: currentAge })}</span>
                <span>{t('forecast.onboarding.retirementAgeShort', { age: retirementAge })}</span>
              </div>
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button type="button" disabled={!profileValid} onClick={() => setStep(1)}>
                {t('forecast.onboarding.continue')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('forecast.onboarding.accountsTitle')}</CardTitle>
            <CardDescription>{t('forecast.onboarding.accountsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {seeds.accounts.map((account, index) => (
              <div key={account.accountId} className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-[auto_1fr_9rem] sm:items-center">
                <Checkbox
                  checked={accounts[index].included}
                  aria-label={t('forecast.onboarding.includeAccount', { name: account.name })}
                  onCheckedChange={(checked) => updateAccount(index, { included: checked === true })}
                />
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    {account.kind === 'investment' ? <PiggyBankIcon className="size-4" /> : <LandmarkIcon className="size-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <Amount money={account.balance} variant="balance" className="text-xs text-muted-foreground" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`forecast-growth-${account.accountId}`} className="text-xs">
                    {t('forecast.onboarding.growth')}
                  </Label>
                  <div className="relative">
                    <Input
                      id={`forecast-growth-${account.accountId}`}
                      type="number"
                      min={-99}
                      max={100}
                      step="0.1"
                      value={accounts[index].growthAnnualPct}
                      disabled={!accounts[index]?.included}
                      className="pr-8"
                      onChange={(event) => updateAccount(index, { growthAnnualPct: Number(event.target.value) })}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            ))}
            {seeds.liabilities.map((liability) => (
              <div key={liability.creditFacilityId} className="flex items-center gap-3 rounded-2xl border p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <WalletCardsIcon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{liability.name}</p>
                  <p className="text-xs text-muted-foreground">{t('forecast.onboarding.liabilityIncluded')}</p>
                </div>
                <Amount money={{ ...liability.balance, amountMinor: -liability.balance.amountMinor }} variant="balance" />
              </div>
            ))}
            <div className="flex justify-between gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                {t('forecast.onboarding.back')}
              </Button>
              <Button type="button" onClick={() => setStep(2)}>
                {t('forecast.onboarding.continue')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('forecast.onboarding.incomeTitle')}</CardTitle>
            <CardDescription>{t('forecast.onboarding.incomeDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {incomeSources.map((source, index) => (
              <div key={source.localId} className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor={`forecast-onboarding-income-name-${source.localId}`}>
                    {t('forecast.onboarding.incomeName')}
                  </Label>
                  <Input
                    id={`forecast-onboarding-income-name-${source.localId}`}
                    value={source.name}
                    onChange={(event) => updateIncome(source.localId, { name: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`forecast-onboarding-income-amount-${source.localId}`}>
                    {t('forecast.onboarding.incomeMonthly')}
                  </Label>
                  <Input
                    id={`forecast-onboarding-income-amount-${source.localId}`}
                    inputMode="decimal"
                    value={source.amountMonthly}
                    onChange={(event) => updateIncome(source.localId, { amountMonthly: event.target.value })}
                  />
                  {seeds.incomeSources[index] ? (
                    <p className="text-xs text-muted-foreground">
                      {t('forecast.onboarding.detected')} <Amount money={seeds.incomeSources[index].amountMonthly} />
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={incomeSources.length === 1}
                  aria-label={t('forecast.onboarding.removeIncome')}
                  onClick={() => setIncomeSources((current) => current.filter((item) => item.localId !== source.localId))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" className="justify-self-start" onClick={addIncome}>
              <PlusIcon data-icon="inline-start" />
              {t('forecast.onboarding.addIncome')}
            </Button>
            <div className="flex justify-between gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                {t('forecast.onboarding.back')}
              </Button>
              <Button type="button" disabled={!incomeValid} onClick={() => setStep(3)}>
                {t('forecast.onboarding.continue')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('forecast.onboarding.expensesTitle')}</CardTitle>
            <CardDescription>{t('forecast.onboarding.expensesDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="forecast-expenses-amount">{t('forecast.onboarding.expensesMonthly')}</Label>
              <Input
                id="forecast-expenses-amount"
                inputMode="decimal"
                value={expensesAmount}
                onChange={(event) => setExpensesAmount(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('forecast.onboarding.detected')} <Amount money={seeds.livingExpenses.amountMonthly} />
              </p>
              <p className="text-xs text-muted-foreground">{t('forecast.onboarding.expensesOverrideHint')}</p>
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setStep(2)}>
                {t('forecast.onboarding.back')}
              </Button>
              <Button type="button" disabled={!expensesValid || isPending} onClick={() => void submit()}>
                {isPending ? t('forecast.onboarding.creating') : t('forecast.onboarding.create')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
