import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';

import { api } from '../../../../convex/_generated/api';
import { ConvertMoneyBoxDialog } from './convert-money-box-dialog';
import { GoalSettingsDialog } from './goal-settings-dialog';
import { simulationArgsEqual } from './goals-utils';
import { PayDownTab } from './pay-down-tab';
import { SaveUpTab } from './save-up-tab';
import { WithdrawDialog } from './withdraw-dialog';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import type { ConvertedAccountType } from './convert-money-box-dialog';
import type { PayoffStrategy } from './goals-utils';
import { MoneyBoxActivitySheet } from '@/components/banking/planning/money-box-activity-sheet';
import { MoneyBoxFormDialog } from '@/components/banking/planning/money-box-form-dialog';
import { RegisterContributionDialog } from '@/components/banking/planning/register-contribution-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthedQuery } from '@/hooks/use-authed-query';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';
import { moneyInputValue, parseMoneyMinor } from '@/lib/money';

type SimulationArgs = {
  extraMonthlyMinor: bigint;
  lumpSumMinor: bigint;
  strategy: PayoffStrategy;
};

type GoalTab = 'saveUp' | 'payDown';

export function GoalsView() {
  const navigate = useNavigate();
  const { intlLocale, t } = useI18n();
  const [tab, setTab] = React.useState<GoalTab>('saveUp');
  const [moneyBoxForm, setMoneyBoxForm] = React.useState<Doc<'moneyBoxes'> | 'create' | null>(null);
  const [contributionMoneyBox, setContributionMoneyBox] = React.useState<Doc<'moneyBoxes'> | null>(null);
  const [conversionMoneyBox, setConversionMoneyBox] = React.useState<Doc<'moneyBoxes'> | null>(null);
  const [withdrawMoneyBox, setWithdrawMoneyBox] = React.useState<Doc<'moneyBoxes'> | null>(null);
  const [settingsMoneyBox, setSettingsMoneyBox] = React.useState<Doc<'moneyBoxes'> | null>(null);
  const [activityMoneyBox, setActivityMoneyBox] = React.useState<Doc<'moneyBoxes'> | null>(null);
  const [strategy, setStrategy] = React.useState<PayoffStrategy>('avalanche');
  const [selectedCurrency, setSelectedCurrency] = React.useState('');
  const [extraMonthlyInput, setExtraMonthlyInput] = React.useState('');
  const [lumpSumInput, setLumpSumInput] = React.useState('');
  const [debouncedSimulationArgs, setDebouncedSimulationArgs] = React.useState<SimulationArgs>();

  const activeFundingPlans = useAuthedQuery(api.banking.planning.listMoneyBoxFundingPlans, {
    status: 'active',
    limit: 100,
  });
  const completedFundingPlans = useAuthedQuery(api.banking.planning.listMoneyBoxFundingPlans, {
    status: 'completed',
    limit: 100,
  });
  const accounts = useAuthedQuery(api.banking.accounts.listAccounts, { limit: 100 });
  const payDownOverview = useAuthedQuery(api.banking.payDown.getPayDownOverview, {});
  const convertMoneyBoxToAccount = useMutation(api.banking.planning.convertMoneyBoxToAccount);
  const setMoneyBoxStatus = useMutation(api.banking.planning.setMoneyBoxStatus);
  const setMoneyBoxSettings = useMutation(api.banking.planning.setMoneyBoxSettings);
  const registerMoneyBoxWithdrawal = useMutation(api.banking.planning.registerMoneyBoxWithdrawal);
  const pendingAction = usePendingAction();

  const fundingPlans = React.useMemo(() => {
    if (!activeFundingPlans || !completedFundingPlans) return undefined;
    return [...activeFundingPlans, ...completedFundingPlans].sort(
      (left, right) =>
        left.moneyBox.targetDate.localeCompare(right.moneyBox.targetDate) ||
        left.moneyBox.name.localeCompare(right.moneyBox.name, intlLocale),
    );
  }, [activeFundingPlans, completedFundingPlans, intlLocale]);
  const currencies = React.useMemo(
    () => payDownOverview?.totalsByCurrency.map((total) => total.currency) ?? [],
    [payDownOverview],
  );
  const calculatorCurrency = currencies.includes(selectedCurrency) ? selectedCurrency : (currencies[0] ?? 'EUR');
  const selectedTotal = payDownOverview?.totalsByCurrency.find((total) => total.currency === calculatorCurrency);
  const maxExtraMonthlyMinor = (selectedTotal?.monthlyPaymentMinor ?? 0n) * 2n;
  const parsedCalculator = React.useMemo(() => {
    try {
      const extraMonthlyMinor = parseMoneyMinor(extraMonthlyInput || '0', calculatorCurrency, intlLocale);
      const lumpSumMinor = parseMoneyMinor(lumpSumInput || '0', calculatorCurrency, intlLocale);
      return {
        valid: extraMonthlyMinor >= 0n && lumpSumMinor >= 0n,
        args: { extraMonthlyMinor, lumpSumMinor, strategy },
      };
    } catch {
      return {
        valid: false,
        args: { extraMonthlyMinor: 0n, lumpSumMinor: 0n, strategy },
      };
    }
  }, [calculatorCurrency, extraMonthlyInput, intlLocale, lumpSumInput, strategy]);
  const hasConfiguredFacilities = (payDownOverview?.facilities.length ?? 0) > 0;

  React.useEffect(() => {
    if (!hasConfiguredFacilities || !parsedCalculator.valid) {
      setDebouncedSimulationArgs(undefined);
      return;
    }

    const timeout = window.setTimeout(() => {
      setDebouncedSimulationArgs(parsedCalculator.args);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [hasConfiguredFacilities, parsedCalculator]);

  const simulation = useAuthedQuery(
    api.banking.payDown.simulatePayoff,
    hasConfiguredFacilities && debouncedSimulationArgs ? debouncedSimulationArgs : 'skip',
  );
  const simulationPending =
    hasConfiguredFacilities &&
    parsedCalculator.valid &&
    (!simulationArgsEqual(debouncedSimulationArgs, parsedCalculator.args) || simulation === undefined);
  const displayedSimulation = simulationPending || !parsedCalculator.valid ? undefined : simulation;

  function archiveMoneyBox(moneyBox: Doc<'moneyBoxes'>) {
    const pendingKey = `goal-archive:${moneyBox._id}`;
    void pendingAction.run(
      pendingKey,
      async () => {
        await setMoneyBoxStatus({ moneyBoxId: moneyBox._id, status: 'archived' });
      },
      {
        success: t('planning.moneyBoxes.archived'),
        error: t('planning.moneyBoxes.archiveFailed'),
      },
    );
  }

  async function submitMoneyBoxConversion(values: { accountType: ConvertedAccountType; name?: string }) {
    if (!conversionMoneyBox) return false;
    const pendingKey = `goal-convert:${conversionMoneyBox._id}`;
    let accountId: Id<'financialAccounts'> | undefined;
    const converted = await pendingAction.run(
      pendingKey,
      async () => {
        const result = await convertMoneyBoxToAccount({
          moneyBoxId: conversionMoneyBox._id,
          accountType: values.accountType,
          name: values.name,
        });
        accountId = result.accountId;
      },
      {
        success: t('goals.saveUp.convert.success'),
        error: t('goals.saveUp.convert.failure'),
        getErrorMessage: (error) =>
          error instanceof Error && error.message ? error.message : t('goals.saveUp.convert.failure'),
      },
    );
    if (!converted || !accountId) return false;

    setConversionMoneyBox(null);
    void navigate({ to: '/app/accounts/$accountId', params: { accountId } });
    return true;
  }

  async function saveSettings(values: { growthRatePct: number; spendingReducesProgress: boolean }) {
    if (!settingsMoneyBox) return false;
    const pendingKey = `goal-settings:${settingsMoneyBox._id}`;
    const saved = await pendingAction.run(
      pendingKey,
      async () => {
        await setMoneyBoxSettings({ moneyBoxId: settingsMoneyBox._id, ...values });
      },
      {
        success: t('goals.saveUp.settings.saved'),
        error: t('goals.saveUp.settings.saveFailed'),
      },
    );
    if (saved) setSettingsMoneyBox(null);
    return saved;
  }

  async function registerWithdrawal(values: { amountMinor: bigint; withdrawalDate: string }) {
    if (!withdrawMoneyBox) return false;
    const pendingKey = `goal-withdraw:${withdrawMoneyBox._id}`;
    const saved = await pendingAction.run(
      pendingKey,
      async () => {
        await registerMoneyBoxWithdrawal({
          moneyBoxId: withdrawMoneyBox._id,
          amount: { amountMinor: values.amountMinor, currency: withdrawMoneyBox.savedAmount.currency },
          withdrawalDate: values.withdrawalDate,
        });
      },
      {
        success: t('goals.saveUp.withdraw.recorded'),
        error: t('goals.saveUp.withdraw.failed'),
        getErrorMessage: (error) => {
          const message = error instanceof Error ? error.message : '';
          if (message.includes('enough saved funds')) return t('goals.saveUp.withdraw.errors.over');
          if (message.toLocaleLowerCase().includes('currency')) return t('goals.saveUp.withdraw.errors.currency');
          return t('goals.saveUp.withdraw.failed');
        },
      },
    );
    if (saved) setWithdrawMoneyBox(null);
    return saved;
  }

  return (
    <div className="flex flex-col gap-5">
      <Tabs value={tab} onValueChange={(value) => setTab(value as GoalTab)}>
        <TabsList>
          <TabsTrigger value="saveUp">{t('goals.tabs.saveUp')}</TabsTrigger>
          <TabsTrigger value="payDown">{t('goals.tabs.payDown')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'saveUp' ? (
        <SaveUpTab
          plans={fundingPlans}
          archivePending={(moneyBoxId) => pendingAction.isPending(`goal-archive:${moneyBoxId}`)}
          onArchive={archiveMoneyBox}
          onContribute={setContributionMoneyBox}
          onConvert={setConversionMoneyBox}
          onCreate={() => setMoneyBoxForm('create')}
          onEdit={setMoneyBoxForm}
          onOpenActivity={setActivityMoneyBox}
          onOpenSettings={setSettingsMoneyBox}
          onWithdraw={setWithdrawMoneyBox}
        />
      ) : (
        <PayDownTab
          overview={payDownOverview}
          calculator={{
            currencies,
            extraMonthlyInput,
            extraMonthlyMinor: parsedCalculator.args.extraMonthlyMinor,
            inputsValid: parsedCalculator.valid,
            loading: simulationPending,
            lumpSumInput,
            maxExtraMonthlyMinor,
            onCurrencyChange: (currency) => {
              setSelectedCurrency(currency);
              setExtraMonthlyInput('');
              setLumpSumInput('');
            },
            onExtraMonthlyInputChange: setExtraMonthlyInput,
            onExtraMonthlySliderChange: (valueMinor) =>
              setExtraMonthlyInput(
                moneyInputValue(
                  { amountMinor: BigInt(Math.round(valueMinor)), currency: calculatorCurrency },
                  intlLocale,
                ),
              ),
            onLumpSumInputChange: setLumpSumInput,
            onStrategyChange: setStrategy,
            selectedCurrency: calculatorCurrency,
            simulation: displayedSimulation,
            strategy,
          }}
        />
      )}

      <MoneyBoxFormDialog
        accounts={accounts}
        moneyBox={moneyBoxForm === 'create' ? null : moneyBoxForm}
        open={moneyBoxForm !== null}
        onOpenChange={(open) => !open && setMoneyBoxForm(null)}
      />
      <RegisterContributionDialog
        funding={{}}
        mode="quick"
        moneyBox={contributionMoneyBox}
        open={contributionMoneyBox !== null}
        onOpenChange={(open) => !open && setContributionMoneyBox(null)}
      />
      <ConvertMoneyBoxDialog
        moneyBox={conversionMoneyBox}
        open={conversionMoneyBox !== null}
        pending={
          conversionMoneyBox ? pendingAction.isPending(`goal-convert:${conversionMoneyBox._id}`) : false
        }
        onOpenChange={(open) => !open && setConversionMoneyBox(null)}
        onSubmit={submitMoneyBoxConversion}
      />
      <WithdrawDialog
        moneyBox={withdrawMoneyBox}
        open={withdrawMoneyBox !== null}
        pending={withdrawMoneyBox ? pendingAction.isPending(`goal-withdraw:${withdrawMoneyBox._id}`) : false}
        onOpenChange={(open) => !open && setWithdrawMoneyBox(null)}
        onSubmit={registerWithdrawal}
      />
      <GoalSettingsDialog
        moneyBox={settingsMoneyBox}
        open={settingsMoneyBox !== null}
        pending={settingsMoneyBox ? pendingAction.isPending(`goal-settings:${settingsMoneyBox._id}`) : false}
        onOpenChange={(open) => !open && setSettingsMoneyBox(null)}
        onSave={saveSettings}
      />
      <MoneyBoxActivitySheet
        moneyBox={activityMoneyBox}
        open={activityMoneyBox !== null}
        onOpenChange={(open) => !open && setActivityMoneyBox(null)}
      />
    </div>
  );
}
