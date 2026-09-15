import * as React from 'react';
import { PlusIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';

import type { ForecastIncomeSource, ForecastScenario, IncomeSourceDraft, ScenarioDraft } from './forecast-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { moneyInputValue } from '@/lib/money';
import { useI18n } from '@/lib/i18n';

type IncomeEditorProps = {
  currency: string;
  isPending: (key?: string) => boolean;
  onDelete?: () => Promise<boolean>;
  onSave: (draft: IncomeSourceDraft) => Promise<boolean>;
  source?: ForecastIncomeSource;
};

function IncomeEditor({ currency, isPending, onDelete, onSave, source }: IncomeEditorProps) {
  const { intlLocale, t } = useI18n();
  const [name, setName] = React.useState(source?.name ?? '');
  const [amount, setAmount] = React.useState(
    source ? moneyInputValue(source.amountMonthly, intlLocale) : '',
  );
  const [changeMode, setChangeMode] = React.useState<IncomeSourceDraft['changeMode']>(
    source?.changeMode ?? 'inflation',
  );
  const [customPct, setCustomPct] = React.useState(String(source?.customPct ?? 0));
  const pendingKey = source ? `income:${source._id}` : 'income:new';

  React.useEffect(() => {
    setName(source?.name ?? '');
    setAmount(source ? moneyInputValue(source.amountMonthly, intlLocale) : '');
    setChangeMode(source?.changeMode ?? 'inflation');
    setCustomPct(String(source?.customPct ?? 0));
  }, [intlLocale, source]);

  const save = async () => {
    const ok = await onSave({
      incomeSourceId: source?._id,
      name,
      amountMonthly: amount,
      changeMode,
      customPct: changeMode === 'customPct' ? Number(customPct) : undefined,
      sortOrder: source?.sortOrder,
    });
    if (ok && !source) {
      setName('');
      setAmount('');
      setChangeMode('inflation');
      setCustomPct('0');
    }
  };

  return (
    <div className="grid gap-3 rounded-2xl border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`forecast-income-name-${source?._id ?? 'new'}`}>{t('forecast.assumptions.incomeName')}</Label>
          <Input
            id={`forecast-income-name-${source?._id ?? 'new'}`}
            value={name}
            placeholder={t('forecast.assumptions.incomeNamePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`forecast-income-amount-${source?._id ?? 'new'}`}>{t('forecast.assumptions.monthlyAmount')}</Label>
          <Input
            id={`forecast-income-amount-${source?._id ?? 'new'}`}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>{t('forecast.assumptions.changeMode')}</Label>
          <Select value={changeMode} onValueChange={(value) => setChangeMode(value as IncomeSourceDraft['changeMode'])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inflation">{t('forecast.change.inflation')}</SelectItem>
              <SelectItem value="fixed">{t('forecast.change.fixed')}</SelectItem>
              <SelectItem value="customPct">{t('forecast.change.custom')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {changeMode === 'customPct' ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`forecast-income-change-${source?._id ?? 'new'}`}>{t('forecast.assumptions.customChange')}</Label>
            <div className="relative">
              <Input
                id={`forecast-income-change-${source?._id ?? 'new'}`}
                type="number"
                min={-99}
                max={100}
                step="0.1"
                value={customPct}
                className="pr-8"
                onChange={(event) => setCustomPct(event.target.value)}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{currency}</span>
        <div className="flex gap-2">
          {onDelete ? (
            <Button type="button" variant="ghost" size="sm" disabled={isPending()} onClick={() => void onDelete()}>
              <Trash2Icon data-icon="inline-start" />
              {t('common.delete')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!name.trim() || !amount.trim() || isPending()}
            onClick={() => void save()}
          >
            {isPending(pendingKey) ? t('forecast.actions.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AssumptionsSidebar({
  incomeSources,
  isPending,
  onDeleteIncome,
  onOpenChange,
  onReset,
  onSaveIncome,
  onSaveScenario,
  open,
  scenario,
}: {
  incomeSources: Array<ForecastIncomeSource>;
  isPending: (key?: string) => boolean;
  onDeleteIncome: (source: ForecastIncomeSource) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  onReset: () => Promise<boolean>;
  onSaveIncome: (draft: IncomeSourceDraft) => Promise<boolean>;
  onSaveScenario: (draft: ScenarioDraft) => Promise<boolean>;
  open: boolean;
  scenario: ForecastScenario;
}) {
  const { intlLocale, t } = useI18n();
  const [inflation, setInflation] = React.useState(String(scenario.inflationAnnualPct));
  const [endAge, setEndAge] = React.useState(String(scenario.endAge));
  const [livingExpenses, setLivingExpenses] = React.useState(
    moneyInputValue(scenario.livingExpenses.amountMonthly, intlLocale),
  );
  const [livingChangeMode, setLivingChangeMode] = React.useState<ScenarioDraft['livingExpensesChangeMode']>(
    scenario.livingExpenses.changeMode,
  );
  const [livingCustomPct, setLivingCustomPct] = React.useState(String(scenario.livingExpenses.customPct ?? 0));
  const [extraSavingsGrowth, setExtraSavingsGrowth] = React.useState(String(scenario.extraSavings.growthAnnualPct));
  const [capitalGainsTax, setCapitalGainsTax] = React.useState(String(scenario.capitalGainsTaxPct));
  const [resetOpen, setResetOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setInflation(String(scenario.inflationAnnualPct));
    setEndAge(String(scenario.endAge));
    setLivingExpenses(moneyInputValue(scenario.livingExpenses.amountMonthly, intlLocale));
    setLivingChangeMode(scenario.livingExpenses.changeMode);
    setLivingCustomPct(String(scenario.livingExpenses.customPct ?? 0));
    setExtraSavingsGrowth(String(scenario.extraSavings.growthAnnualPct));
    setCapitalGainsTax(String(scenario.capitalGainsTaxPct));
  }, [intlLocale, open, scenario]);

  const saveScenario = async () => {
    await onSaveScenario({
      inflationAnnualPct: Number(inflation),
      endAge: Number(endAge),
      livingExpensesAmount: livingExpenses,
      livingExpensesChangeMode: livingChangeMode,
      livingExpensesCustomPct: livingChangeMode === 'customPct' ? Number(livingCustomPct) : undefined,
      extraSavingsGrowthAnnualPct: Number(extraSavingsGrowth),
      capitalGainsTaxPct: Number(capitalGainsTax),
    });
  };

  return (
    <>
      <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t('forecast.assumptions.title')}
      description={t('forecast.assumptions.description')}
      footer={
        <Button type="button" className="w-full" disabled={isPending()} onClick={() => void saveScenario()}>
          {isPending('scenario') ? t('forecast.actions.saving') : t('forecast.assumptions.save')}
        </Button>
      }
    >
      <div className="grid gap-6 py-4">
        <section className="grid gap-4">
          <div>
            <h3 className="text-sm font-medium">{t('forecast.assumptions.planTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('forecast.assumptions.planHint')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-inflation">{t('forecast.assumptions.inflation')}</Label>
              <div className="relative">
                <Input
                  id="forecast-inflation"
                  type="number"
                  min={-99}
                  max={100}
                  step="0.1"
                  value={inflation}
                  className="pr-8"
                  onChange={(event) => setInflation(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-end-age">{t('forecast.assumptions.endAge')}</Label>
              <Input
                id="forecast-end-age"
                type="number"
                min={18}
                max={120}
                value={endAge}
                onChange={(event) => setEndAge(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-extra-growth">{t('forecast.assumptions.extraSavingsGrowth')}</Label>
              <div className="relative">
                <Input
                  id="forecast-extra-growth"
                  type="number"
                  min={-99}
                  max={100}
                  step="0.1"
                  value={extraSavingsGrowth}
                  className="pr-8"
                  onChange={(event) => setExtraSavingsGrowth(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-capital-gains">{t('forecast.assumptions.capitalGainsTax')}</Label>
              <div className="relative">
                <Input
                  id="forecast-capital-gains"
                  type="number"
                  min={0}
                  max={99}
                  step="0.1"
                  value={capitalGainsTax}
                  className="pr-8"
                  onChange={(event) => setCapitalGainsTax(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        <section className="grid gap-4">
          <div>
            <h3 className="text-sm font-medium">{t('forecast.assumptions.expensesTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('forecast.assumptions.expensesHint')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-living-expenses">{t('forecast.assumptions.monthlyAmount')}</Label>
              <Input
                id="forecast-living-expenses"
                inputMode="decimal"
                value={livingExpenses}
                onChange={(event) => setLivingExpenses(event.target.value)}
              />
              <span className="text-xs text-muted-foreground">{scenario.currency}</span>
            </div>
            <div className="grid gap-1.5">
              <Label>{t('forecast.assumptions.changeMode')}</Label>
              <Select
                value={livingChangeMode}
                onValueChange={(value) => setLivingChangeMode(value as ScenarioDraft['livingExpensesChangeMode'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inflation">{t('forecast.change.inflation')}</SelectItem>
                  <SelectItem value="fixed">{t('forecast.change.fixed')}</SelectItem>
                  <SelectItem value="customPct">{t('forecast.change.custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {livingChangeMode === 'customPct' ? (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="forecast-living-change">{t('forecast.assumptions.customChange')}</Label>
                <div className="relative">
                  <Input
                    id="forecast-living-change"
                    type="number"
                    min={-99}
                    max={100}
                    step="0.1"
                    value={livingCustomPct}
                    className="pr-8"
                    onChange={(event) => setLivingCustomPct(event.target.value)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <Separator />

        <section className="grid gap-3">
          <div>
            <h3 className="text-sm font-medium">{t('forecast.assumptions.incomeTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('forecast.assumptions.incomeHint')}</p>
          </div>
          {incomeSources.map((source) => (
            <IncomeEditor
              key={source._id}
              currency={scenario.currency}
              source={source}
              isPending={isPending}
              onSave={onSaveIncome}
              onDelete={() => onDeleteIncome(source)}
            />
          ))}
          <div className="flex items-center gap-2 text-sm font-medium">
            <PlusIcon className="size-4" />
            {t('forecast.assumptions.addIncome')}
          </div>
          <IncomeEditor currency={scenario.currency} isPending={isPending} onSave={onSaveIncome} />
        </section>

        <Separator />

        <section className="grid gap-3 rounded-2xl border border-destructive/30 p-3">
          <div>
            <h3 className="text-sm font-medium text-destructive">{t('forecast.reset.title')}</h3>
            <p className="text-xs text-muted-foreground">{t('forecast.reset.hint')}</p>
          </div>
          <Button type="button" variant="destructive" disabled={isPending()} onClick={() => setResetOpen(true)}>
            <RotateCcwIcon data-icon="inline-start" />
            {t('forecast.reset.action')}
          </Button>
        </section>
      </div>
      </DetailSheet>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('forecast.reset.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('forecast.reset.confirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending('reset')}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending('reset')}
              onClick={() => void onReset().then((ok) => ok && setResetOpen(false))}
            >
              {isPending('reset') ? t('common.loading') : t('forecast.reset.action')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
