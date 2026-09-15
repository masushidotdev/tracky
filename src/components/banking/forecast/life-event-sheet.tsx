import * as React from 'react';

import type { ForecastLifeEvent, StoredForecastLifeEvent } from './forecast-utils';
import { Button } from '@/components/ui/button';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { moneyInputValue, parseMoneyMinor } from '@/lib/money';
import { useI18n } from '@/lib/i18n';

export const LIFE_EVENT_KINDS = [
  'retirement',
  'pension',
  'buyHome',
  'haveKid',
  'careerBreak',
  'newJob',
  'otherIncome',
  'otherExpense',
  'endOfPlan',
] as const satisfies ReadonlyArray<StoredForecastLifeEvent['kind']>;

type LifeEventKind = StoredForecastLifeEvent['kind'];

type FormState = {
  kind: LifeEventKind;
  enabled: boolean;
  age: string;
  expensePct: string;
  extraYearlyExpenses: string;
  incomeReductionPct: string;
  startAge: string;
  monthlyBenefit: string;
  year: string;
  price: string;
  mode: 'cash' | 'finance';
  downPayment: string;
  mortgageYears: string;
  mortgageRatePct: string;
  recurringCostsAnnualPct: string;
  monthlyCost: string;
  untilAge: string;
  startYear: string;
  endYear: string;
  newMonthlyIncome: string;
  amount: string;
  recurring: boolean;
  intervalYears: string;
  recurringEndYear: string;
};

function emptyState(currentAge: number, currentYear: number): FormState {
  return {
    kind: 'retirement',
    enabled: true,
    age: String(Math.max(currentAge, 67)),
    expensePct: '80',
    extraYearlyExpenses: '',
    incomeReductionPct: '100',
    startAge: String(Math.max(currentAge, 67)),
    monthlyBenefit: '',
    year: String(currentYear + 1),
    price: '',
    mode: 'cash',
    downPayment: '',
    mortgageYears: '25',
    mortgageRatePct: '3.5',
    recurringCostsAnnualPct: '1',
    monthlyCost: '',
    untilAge: '18',
    startYear: String(currentYear + 1),
    endYear: String(currentYear + 2),
    newMonthlyIncome: '',
    amount: '',
    recurring: false,
    intervalYears: '1',
    recurringEndYear: '',
  };
}

function stateFromEvent(
  item: ForecastLifeEvent | null,
  currentAge: number,
  currentYear: number,
  intlLocale: string,
): FormState {
  const state = emptyState(currentAge, currentYear);
  if (!item) return state;
  const event = item.event;
  state.kind = event.kind;
  state.enabled = item.enabled;
  switch (event.kind) {
    case 'retirement':
      state.age = String(event.age);
      state.expensePct = String(event.expensePct);
      state.extraYearlyExpenses = event.extraYearlyExpenses
        ? moneyInputValue(event.extraYearlyExpenses, intlLocale)
        : '';
      state.incomeReductionPct = String(event.incomeReductionPct);
      break;
    case 'pension':
      state.startAge = String(event.startAge);
      state.monthlyBenefit = moneyInputValue(event.monthlyBenefit, intlLocale);
      break;
    case 'buyHome':
      state.year = String(event.year);
      state.price = moneyInputValue(event.price, intlLocale);
      state.mode = event.mode;
      state.downPayment = event.downPayment ? moneyInputValue(event.downPayment, intlLocale) : '';
      state.mortgageYears = String(event.mortgageYears ?? 25);
      state.mortgageRatePct = String((event.mortgageRateBps ?? 350) / 100);
      state.recurringCostsAnnualPct = String(event.recurringCostsAnnualPct ?? '');
      break;
    case 'haveKid':
      state.year = String(event.year);
      state.monthlyCost = moneyInputValue(event.monthlyCost, intlLocale);
      state.untilAge = String(event.untilAge);
      break;
    case 'careerBreak':
      state.startYear = String(event.startYear);
      state.endYear = String(event.endYear);
      state.incomeReductionPct = String(event.incomeReductionPct);
      break;
    case 'newJob':
      state.year = String(event.year);
      state.newMonthlyIncome = moneyInputValue(event.newMonthlyIncome, intlLocale);
      break;
    case 'otherIncome':
    case 'otherExpense':
      state.startYear = String(event.startYear);
      state.amount = moneyInputValue(event.amount, intlLocale);
      state.recurring = event.recurring !== undefined;
      state.intervalYears = String(event.recurring?.intervalYears ?? 1);
      state.recurringEndYear = String(event.recurring?.endYear ?? '');
      break;
    case 'endOfPlan':
      state.age = String(event.age);
      break;
  }
  return state;
}

function PercentInput({
  id,
  label,
  onChange,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={value}
          className="pr-8"
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}

function MoneyInput({
  currency,
  id,
  label,
  onChange,
  required = true,
  value,
}: {
  currency: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="text-xs text-muted-foreground">{currency}</span>
    </div>
  );
}

export function LifeEventSheet({
  currency,
  currentAge,
  event,
  isPending,
  onOpenChange,
  onSave,
  open,
}: {
  currency: string;
  currentAge: number;
  event: ForecastLifeEvent | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (event: StoredForecastLifeEvent, enabled: boolean, eventId?: ForecastLifeEvent['_id']) => Promise<boolean>;
  open: boolean;
}) {
  const { intlLocale, t } = useI18n();
  const currentYear = new Date().getUTCFullYear();
  const [state, setState] = React.useState(() => stateFromEvent(event, currentAge, currentYear, intlLocale));

  React.useEffect(() => {
    if (open) setState(stateFromEvent(event, currentAge, currentYear, intlLocale));
  }, [currentAge, currentYear, event, intlLocale, open]);

  const patch = (next: Partial<FormState>) => setState((current) => ({ ...current, ...next }));
  const money = (value: string) => ({ amountMinor: parseMoneyMinor(value, currency, intlLocale), currency });

  const buildEvent = (): StoredForecastLifeEvent => {
    switch (state.kind) {
      case 'retirement':
        return {
          kind: state.kind,
          age: Number(state.age),
          expensePct: Number(state.expensePct),
          ...(state.extraYearlyExpenses.trim() ? { extraYearlyExpenses: money(state.extraYearlyExpenses) } : {}),
          incomeReductionPct: Number(state.incomeReductionPct),
        };
      case 'pension':
        return { kind: state.kind, startAge: Number(state.startAge), monthlyBenefit: money(state.monthlyBenefit) };
      case 'buyHome':
        return {
          kind: state.kind,
          year: Number(state.year),
          price: money(state.price),
          mode: state.mode,
          ...(state.mode === 'finance'
            ? {
                downPayment: money(state.downPayment),
                mortgageYears: Number(state.mortgageYears),
                mortgageRateBps: Math.round(Number(state.mortgageRatePct) * 100),
              }
            : {}),
          ...(state.recurringCostsAnnualPct.trim()
            ? { recurringCostsAnnualPct: Number(state.recurringCostsAnnualPct) }
            : {}),
        };
      case 'haveKid':
        return {
          kind: state.kind,
          year: Number(state.year),
          monthlyCost: money(state.monthlyCost),
          untilAge: Number(state.untilAge),
        };
      case 'careerBreak':
        return {
          kind: state.kind,
          startYear: Number(state.startYear),
          endYear: Number(state.endYear),
          incomeReductionPct: Number(state.incomeReductionPct),
        };
      case 'newJob':
        return { kind: state.kind, year: Number(state.year), newMonthlyIncome: money(state.newMonthlyIncome) };
      case 'otherIncome':
      case 'otherExpense':
        return {
          kind: state.kind,
          startYear: Number(state.startYear),
          amount: money(state.amount),
          ...(state.recurring
            ? {
                recurring: {
                  intervalYears: Number(state.intervalYears),
                  ...(state.recurringEndYear.trim() ? { endYear: Number(state.recurringEndYear) } : {}),
                },
              }
            : {}),
        };
      case 'endOfPlan':
        return { kind: state.kind, age: Number(state.age) };
    }
  };

  const requiredValues = (() => {
    switch (state.kind) {
      case 'retirement':
        return [state.age, state.expensePct, state.incomeReductionPct];
      case 'pension':
        return [state.startAge, state.monthlyBenefit];
      case 'buyHome':
        return state.mode === 'finance'
          ? [state.year, state.price, state.downPayment, state.mortgageYears, state.mortgageRatePct]
          : [state.year, state.price];
      case 'haveKid':
        return [state.year, state.monthlyCost, state.untilAge];
      case 'careerBreak':
        return [state.startYear, state.endYear, state.incomeReductionPct];
      case 'newJob':
        return [state.year, state.newMonthlyIncome];
      case 'otherIncome':
      case 'otherExpense':
        return state.recurring ? [state.startYear, state.amount, state.intervalYears] : [state.startYear, state.amount];
      case 'endOfPlan':
        return [state.age];
    }
  })();
  const valid = requiredValues.every((value) => value.trim().length > 0);

  const save = async () => {
    const ok = await onSave(buildEvent(), state.enabled, event?._id);
    if (ok) onOpenChange(false);
  };

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t(event ? 'forecast.events.editTitle' : 'forecast.events.addTitle')}
      description={t('forecast.events.editorDescription')}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={!valid || isPending} onClick={() => void save()}>
            {isPending ? t('forecast.actions.saving') : t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 py-4">
        <div className="grid gap-1.5">
          <Label>{t('forecast.events.kind')}</Label>
          <Select value={state.kind} onValueChange={(value) => patch({ kind: value as LifeEventKind })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LIFE_EVENT_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>{t(`forecast.events.kind.${kind}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-2xl border p-3">
          <div>
            <Label htmlFor="forecast-event-enabled">{t('forecast.events.enabled')}</Label>
            <p className="text-xs text-muted-foreground">{t('forecast.events.enabledHint')}</p>
          </div>
          <Switch id="forecast-event-enabled" checked={state.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
        </div>

        {state.kind === 'retirement' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-event-age">{t('forecast.events.age')}</Label>
              <Input id="forecast-event-age" type="number" min={currentAge} max={120} value={state.age} onChange={(e) => patch({ age: e.target.value })} />
            </div>
            <PercentInput id="forecast-event-expense-pct" label={t('forecast.events.retirementExpensePct')} value={state.expensePct} onChange={(expensePct) => patch({ expensePct })} />
            <MoneyInput currency={currency} id="forecast-event-extra-expenses" label={t('forecast.events.extraYearlyExpenses')} value={state.extraYearlyExpenses} required={false} onChange={(extraYearlyExpenses) => patch({ extraYearlyExpenses })} />
            <PercentInput id="forecast-event-income-reduction" label={t('forecast.events.incomeReductionPct')} value={state.incomeReductionPct} onChange={(incomeReductionPct) => patch({ incomeReductionPct })} />
          </div>
        ) : null}

        {state.kind === 'pension' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-event-start-age">{t('forecast.events.startAge')}</Label>
              <Input id="forecast-event-start-age" type="number" min={currentAge} max={120} value={state.startAge} onChange={(e) => patch({ startAge: e.target.value })} />
            </div>
            <MoneyInput currency={currency} id="forecast-event-pension-benefit" label={t('forecast.events.monthlyBenefit')} value={state.monthlyBenefit} onChange={(monthlyBenefit) => patch({ monthlyBenefit })} />
          </div>
        ) : null}

        {state.kind === 'buyHome' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-event-year">{t('forecast.events.year')}</Label>
              <Input id="forecast-event-year" type="number" min={currentYear} max={currentYear + 120} value={state.year} onChange={(e) => patch({ year: e.target.value })} />
            </div>
            <MoneyInput currency={currency} id="forecast-event-home-price" label={t('forecast.events.homePrice')} value={state.price} onChange={(price) => patch({ price })} />
            <div className="grid gap-1.5">
              <Label>{t('forecast.events.purchaseMode')}</Label>
              <Select value={state.mode} onValueChange={(value) => patch({ mode: value as FormState['mode'] })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('forecast.events.cash')}</SelectItem>
                  <SelectItem value="finance">{t('forecast.events.finance')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <PercentInput id="forecast-event-home-costs" label={t('forecast.events.recurringHomeCosts')} value={state.recurringCostsAnnualPct} onChange={(recurringCostsAnnualPct) => patch({ recurringCostsAnnualPct })} />
            {state.mode === 'finance' ? (
              <>
                <MoneyInput currency={currency} id="forecast-event-down-payment" label={t('forecast.events.downPayment')} value={state.downPayment} onChange={(downPayment) => patch({ downPayment })} />
                <div className="grid gap-1.5">
                  <Label htmlFor="forecast-event-mortgage-years">{t('forecast.events.mortgageYears')}</Label>
                  <Input id="forecast-event-mortgage-years" type="number" min={1} max={50} value={state.mortgageYears} onChange={(e) => patch({ mortgageYears: e.target.value })} />
                </div>
                <PercentInput id="forecast-event-mortgage-rate" label={t('forecast.events.mortgageRate')} value={state.mortgageRatePct} onChange={(mortgageRatePct) => patch({ mortgageRatePct })} />
              </>
            ) : null}
          </div>
        ) : null}

        {state.kind === 'haveKid' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-event-kid-year">{t('forecast.events.year')}</Label>
              <Input id="forecast-event-kid-year" type="number" min={currentYear} max={currentYear + 120} value={state.year} onChange={(e) => patch({ year: e.target.value })} />
            </div>
            <MoneyInput currency={currency} id="forecast-event-kid-cost" label={t('forecast.events.monthlyCost')} value={state.monthlyCost} onChange={(monthlyCost) => patch({ monthlyCost })} />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="forecast-event-until-age">{t('forecast.events.untilAge')}</Label>
              <Input id="forecast-event-until-age" type="number" min={0} max={40} value={state.untilAge} onChange={(e) => patch({ untilAge: e.target.value })} />
            </div>
          </div>
        ) : null}

        {state.kind === 'careerBreak' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-event-break-start">{t('forecast.events.startYear')}</Label>
              <Input id="forecast-event-break-start" type="number" min={currentYear} max={currentYear + 120} value={state.startYear} onChange={(e) => patch({ startYear: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-event-break-end">{t('forecast.events.endYear')}</Label>
              <Input id="forecast-event-break-end" type="number" min={(Number(state.startYear) || currentYear) + 1} max={currentYear + 120} value={state.endYear} onChange={(e) => patch({ endYear: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <PercentInput id="forecast-event-break-reduction" label={t('forecast.events.incomeReductionPct')} value={state.incomeReductionPct} onChange={(incomeReductionPct) => patch({ incomeReductionPct })} />
            </div>
          </div>
        ) : null}

        {state.kind === 'newJob' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-event-job-year">{t('forecast.events.year')}</Label>
              <Input id="forecast-event-job-year" type="number" min={currentYear} max={currentYear + 120} value={state.year} onChange={(e) => patch({ year: e.target.value })} />
            </div>
            <MoneyInput currency={currency} id="forecast-event-job-income" label={t('forecast.events.newMonthlyIncome')} value={state.newMonthlyIncome} onChange={(newMonthlyIncome) => patch({ newMonthlyIncome })} />
          </div>
        ) : null}

        {state.kind === 'otherIncome' || state.kind === 'otherExpense' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-event-other-year">{t('forecast.events.startYear')}</Label>
              <Input id="forecast-event-other-year" type="number" min={currentYear} max={currentYear + 120} value={state.startYear} onChange={(e) => patch({ startYear: e.target.value })} />
            </div>
            <MoneyInput currency={currency} id="forecast-event-other-amount" label={t('forecast.events.amount')} value={state.amount} onChange={(amount) => patch({ amount })} />
            <div className="flex items-center justify-between gap-4 rounded-2xl border p-3 sm:col-span-2">
              <div>
                <Label htmlFor="forecast-event-recurring">{t('forecast.events.recurring')}</Label>
                <p className="text-xs text-muted-foreground">{t('forecast.events.recurringHint')}</p>
              </div>
              <Switch id="forecast-event-recurring" checked={state.recurring} onCheckedChange={(recurring) => patch({ recurring })} />
            </div>
            {state.recurring ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="forecast-event-interval">{t('forecast.events.intervalYears')}</Label>
                  <Input id="forecast-event-interval" type="number" min={1} max={120} value={state.intervalYears} onChange={(e) => patch({ intervalYears: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="forecast-event-recurring-end">{t('forecast.events.recurringEndYear')}</Label>
                  <Input id="forecast-event-recurring-end" type="number" min={Number(state.startYear) || currentYear} max={currentYear + 120} value={state.recurringEndYear} onChange={(e) => patch({ recurringEndYear: e.target.value })} />
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {state.kind === 'endOfPlan' ? (
          <div className="grid gap-1.5">
            <Label htmlFor="forecast-event-end-age">{t('forecast.events.age')}</Label>
            <Input id="forecast-event-end-age" type="number" min={currentAge + 1} max={120} value={state.age} onChange={(e) => patch({ age: e.target.value })} />
          </div>
        ) : null}
      </div>
    </DetailSheet>
  );
}
