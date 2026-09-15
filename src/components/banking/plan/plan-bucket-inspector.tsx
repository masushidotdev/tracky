import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';
import {
  ArrowLeftRightIcon,
  CalendarDaysIcon,
  Layers3Icon,
  LinkIcon,
  TargetIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import { monthLabel } from './plan-month-navigation';
import { planBucketStatusKey } from './plan-status';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanBucket, PlanCategory, PlanGroup, PlanMoneyBox, PlanMonth, PlanTargetValues } from './types';
import { Amount } from '@/components/app/amount';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useBalancePrivacy } from '@/lib/balance-privacy-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney, moneyInputValue, parseMoneyMinor } from '@/lib/money';
import { cn } from '@/lib/utils';

type BucketInspectorProps = {
  bucket: PlanBucket | null;
  buckets: Array<PlanBucket>;
  categories: Array<PlanCategory>;
  currency: string;
  moneyBoxes: Array<PlanMoneyBox>;
  moneyBoxPending: boolean;
  movePending: boolean;
  onClearTarget: (bucket: PlanBucket) => Promise<boolean>;
  onMoveMoney: (values: {
    fromBucketId: Id<'planBuckets'>;
    toBucketId: Id<'planBuckets'>;
    amountMinor: bigint;
  }) => Promise<boolean>;
  onSaveMoneyBox: (bucket: PlanBucket, moneyBoxId?: Id<'moneyBoxes'>) => Promise<boolean>;
  onSaveTarget: (bucket: PlanBucket, values: PlanTargetValues) => Promise<boolean>;
  onSnoozeTarget: (bucket: PlanBucket, snoozed: boolean) => Promise<boolean>;
  period: string;
  planAccountIds: Array<Id<'financialAccounts'>>;
  targetPending: boolean;
};

type PlanBucketInspectorProps = BucketInspectorProps & {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export function PlanBucketInspector({ bucket, onOpenChange, open, ...props }: PlanBucketInspectorProps) {
  const { t } = useI18n();
  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={bucket?.name ?? t('plan.inspector.title')}
      description={t('plan.inspector.description')}
    >
      <PlanBucketInspectorBody key={bucket?.bucketId ?? 'none'} bucket={bucket} {...props} />
    </DetailSheet>
  );
}

export function PlanInspectorColumn({
  bucket,
  group,
  month,
  monthExtra,
  onClearSelection,
  ...props
}: BucketInspectorProps & {
  group: PlanGroup | null;
  month: PlanMonth;
  /** Shown with the month summary, where YNAB keeps Cost to Be Me: it belongs to the month, not to
      any selected bucket, and out here it no longer steals height from the grid. */
  monthExtra?: React.ReactNode;
  onClearSelection: () => void;
}) {
  const { intlLocale, t } = useI18n();
  const hasSelection = bucket !== null || group !== null;
  const title = bucket?.name ?? group?.name ?? monthLabel(month.period, intlLocale);
  const description = bucket
    ? t('plan.inspector.description')
    : group
      ? t('plan.inspector.groupDescription')
      : t('plan.inspector.monthDescription');

  return (
    <Card className="h-full min-h-0 min-w-0 gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-4">
        <div className="flex min-w-0 items-center gap-2">
          {bucket ? (
            <TargetIcon className="size-4 shrink-0" />
          ) : group ? (
            <Layers3Icon className="size-4 shrink-0" />
          ) : (
            <CalendarDaysIcon className="size-4 shrink-0" />
          )}
          <CardTitle className="min-w-0 truncate capitalize">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
        {hasSelection ? (
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('plan.inspector.showMonth')}
              onClick={onClearSelection}
            >
              <XIcon />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      {/* Radix gives the viewport's inner wrapper `display: table`, which sizes to its content and
          lets a long description or a wide row push past the column — with no width to respect,
          `truncate` does nothing. This panel only ever scrolls vertically, so the wrapper is forced
          back to a block that fills the width. */}
      <ScrollArea className="min-h-0 flex-1" viewportClassName="overscroll-contain [&>div]:!block">
        <CardContent className="min-w-0 py-4">
          {bucket ? (
            <PlanBucketInspectorBody key={bucket.bucketId} bucket={bucket} compact {...props} />
          ) : group ? (
            <GroupSummary group={group} currency={month.plan.currency} />
          ) : (
            <div className="flex flex-col gap-4">
              <MonthSummary month={month} />
              {monthExtra}
            </div>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

function PlanBucketInspectorBody({
  bucket,
  compact = false,
  buckets,
  categories,
  currency,
  moneyBoxes,
  moneyBoxPending,
  movePending,
  onClearTarget,
  onMoveMoney,
  onSaveMoneyBox,
  onSaveTarget,
  onSnoozeTarget,
  period,
  planAccountIds,
  targetPending,
}: BucketInspectorProps & { compact?: boolean }) {
  const { intlLocale, t } = useI18n();
  const otherBuckets = buckets.filter((candidate) => candidate.bucketId !== bucket?.bucketId);
  // The panel is keyed on the bucket, so these run once per bucket. Filling the form from an effect
  // instead left the two Select triggers blank on first open: Radix reads the trigger label from the
  // matching item, and by the time the effect moved the value the closed list had already settled on
  // the default. Seeding the state means the right value is there on the very first render.
  const [direction, setDirection] = React.useState<'out' | 'in'>('out');
  const [otherBucketId, setOtherBucketId] = React.useState<string>(() => otherBuckets[0]?.bucketId ?? '');
  const [moveAmount, setMoveAmount] = React.useState('');
  const [moveError, setMoveError] = React.useState<string | null>(null);
  const [cadence, setCadence] = React.useState<PlanTargetValues['cadence']>(bucket?.target?.cadence ?? 'monthly');
  const [behaviour, setBehaviour] = React.useState<PlanTargetValues['behaviour']>(
    bucket?.target?.behaviour ?? 'setAside',
  );
  const [targetAmount, setTargetAmount] = React.useState(() =>
    bucket?.target ? moneyInputValue({ amountMinor: bucket.target.amountMinor, currency }, intlLocale) : '',
  );
  const [dueDate, setDueDate] = React.useState(bucket?.target?.dueDate ?? '');
  const [dayOfMonth, setDayOfMonth] = React.useState(
    bucket?.target?.dayOfMonth ? String(bucket.target.dayOfMonth) : '',
  );
  const [dayOfWeek, setDayOfWeek] = React.useState(String(bucket?.target?.dayOfWeek ?? 1));
  const [repeats, setRepeats] = React.useState(bucket?.target?.repeats ?? true);
  const [repeatIntervalCount, setRepeatIntervalCount] = React.useState(
    String(bucket?.target?.repeatIntervalCount ?? 1),
  );
  const [repeatIntervalUnit, setRepeatIntervalUnit] = React.useState<'month' | 'year'>(
    bucket?.target?.repeatIntervalUnit ?? 'year',
  );
  // A legacy custom target deliberately keeps its absent interval until the user edits the new
  // controls. New targets and targets that already store an interval save the explicit values.
  const [repeatIntervalConfigured, setRepeatIntervalConfigured] = React.useState(
    bucket?.target?.cadence !== 'custom' ||
      (bucket.target.repeatIntervalCount !== undefined && bucket.target.repeatIntervalUnit !== undefined),
  );
  const [targetError, setTargetError] = React.useState<string | null>(null);
  const categoryNames = new Map(categories.map((category) => [category._id, category.name]));
  const planAccountIdSet = new Set(planAccountIds);
  const linkedElsewhere = new Set(
    buckets.flatMap((candidate) =>
      candidate.bucketId !== bucket?.bucketId && candidate.moneyBoxId ? [candidate.moneyBoxId] : [],
    ),
  );
  const selectableMoneyBoxes = moneyBoxes.filter(
    (moneyBox) =>
      moneyBox._id === bucket?.moneyBoxId ||
      (moneyBox.status !== 'archived' &&
        moneyBox.accountId !== undefined &&
        planAccountIdSet.has(moneyBox.accountId) &&
        moneyBox.savedAmount.currency === currency &&
        !linkedElsewhere.has(moneyBox._id)),
  );
  const statusKey = bucket ? planBucketStatusKey(bucket) : null;

  function resetTargetForm() {
    setCadence('monthly');
    setBehaviour('setAside');
    setTargetAmount('');
    setDueDate('');
    setDayOfMonth('');
    setDayOfWeek('1');
    setRepeats(true);
    setRepeatIntervalCount('1');
    setRepeatIntervalUnit('year');
    setRepeatIntervalConfigured(true);
    setTargetError(null);
  }

  async function moveMoney(event: React.FormEvent) {
    event.preventDefault();
    if (!bucket || !otherBucketId) return;
    let amountMinor: bigint;
    try {
      amountMinor = parseMoneyMinor(moveAmount, currency, intlLocale);
    } catch {
      setMoveError(t('plan.errors.invalidAmount'));
      return;
    }
    if (amountMinor <= 0n) {
      setMoveError(t('plan.move.amountError'));
      return;
    }
    const otherId = otherBucketId as Id<'planBuckets'>;
    const saved = await onMoveMoney({
      fromBucketId: direction === 'out' ? bucket.bucketId : otherId,
      toBucketId: direction === 'out' ? otherId : bucket.bucketId,
      amountMinor,
    });
    if (saved) {
      setMoveAmount('');
      setMoveError(null);
    }
  }

  async function saveTarget(event: React.FormEvent) {
    event.preventDefault();
    if (!bucket) return;
    let amountMinor: bigint;
    try {
      amountMinor = parseMoneyMinor(targetAmount, currency, intlLocale);
    } catch {
      setTargetError(t('plan.errors.invalidAmount'));
      return;
    }
    if (amountMinor <= 0n) {
      setTargetError(t('plan.target.amountError'));
      return;
    }
    if ((cadence === 'yearly' || cadence === 'custom') && !dueDate) {
      setTargetError(t('plan.target.dueDateError'));
      return;
    }
    const usesCustomRepeatInterval =
      cadence === 'custom' && behaviour !== 'balanceBy' && repeats && repeatIntervalConfigured;
    const parsedRepeatIntervalCount = Number(repeatIntervalCount);
    if (usesCustomRepeatInterval && (!Number.isInteger(parsedRepeatIntervalCount) || parsedRepeatIntervalCount <= 0)) {
      setTargetError(t('plan.target.repeatIntervalError'));
      return;
    }
    const saved = await onSaveTarget(bucket, {
      cadence,
      behaviour: cadence === 'custom' ? behaviour : behaviour === 'balanceBy' ? 'setAside' : behaviour,
      amountMinor,
      dueDate: dueDate || undefined,
      dayOfMonth: cadence === 'monthly' && dayOfMonth ? Number(dayOfMonth) : undefined,
      dayOfWeek: cadence === 'weekly' ? Number(dayOfWeek) : undefined,
      repeats: cadence === 'custom' ? (behaviour === 'balanceBy' ? false : repeats) : true,
      repeatIntervalCount: usesCustomRepeatInterval ? parsedRepeatIntervalCount : undefined,
      repeatIntervalUnit: usesCustomRepeatInterval ? repeatIntervalUnit : undefined,
    });
    if (saved) setTargetError(null);
  }

  if (!bucket) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2">
        <Metric label={t('plan.columns.carryIn')} amountMinor={bucket.carryInMinor} currency={currency} />
        <Metric label={t('plan.columns.assigned')} amountMinor={bucket.assignedMinor} currency={currency} />
        <Metric label={t('plan.columns.activity')} amountMinor={bucket.activityMinor} currency={currency} />
        {bucket.cardAccountId ? (
          <Metric
            label={t('plan.cardPayments.coveredSpend')}
            amountMinor={bucket.coveredCardSpendMinor}
            currency={currency}
          />
        ) : null}
        <Metric
          label={t('plan.columns.available')}
          amountMinor={bucket.availableMinor}
          currency={currency}
          status={statusKey ? t(statusKey) : undefined}
        />
        {bucket.moneyBoxId ? (
          <Metric
            label={t('plan.moneyBox.prefunded')}
            amountMinor={bucket.moneyBoxPrefundedMinor}
            currency={currency}
          />
        ) : null}
        {bucket.cardAccountId ? (
          <Metric label={t('plan.cardPayments.debt')} amountMinor={bucket.cardDebtMinor} currency={currency} />
        ) : null}
        {bucket.cardAccountId && bucket.installmentCoveredDebtMinor > 0n ? (
          <Metric
            label={t('plan.cardPayments.installmentCovered')}
            amountMinor={bucket.installmentCoveredDebtMinor}
            currency={currency}
          />
        ) : null}
      </div>

      {bucket.cardAccountId ? (
        <CardStatementPaymentRegistration cardAccountId={bucket.cardAccountId} currency={currency} period={period} />
      ) : null}

      {!bucket.cardAccountId && !bucket.installmentPlanId ? (
        <section className="flex flex-col gap-3 border-t pt-6">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <LinkIcon className="size-4" />
              {t('plan.moneyBox.title')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('plan.moneyBox.description')}</p>
          </div>
          <Field>
            <FieldLabel htmlFor="plan-money-box">{t('plan.moneyBox.field')}</FieldLabel>
            <Select
              value={bucket.moneyBoxId ?? 'none'}
              disabled={moneyBoxPending}
              onValueChange={(value) =>
                void onSaveMoneyBox(bucket, value === 'none' ? undefined : (value as Id<'moneyBoxes'>))
              }
            >
              <SelectTrigger id="plan-money-box" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">{t('plan.moneyBox.none')}</SelectItem>
                  {selectableMoneyBoxes.map((moneyBox) => (
                    <SelectItem key={moneyBox._id} value={moneyBox._id}>
                      {moneyBox.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {bucket.moneyBoxId
                ? t(
                    bucket.moneyBoxPrefundedMinor > 0n
                      ? 'plan.moneyBox.prefundedHint'
                      : 'plan.moneyBox.unavailableHint',
                  )
                : t('plan.moneyBox.eligibleHint')}
            </FieldDescription>
            {moneyBoxPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                {t('common.loading')}
              </p>
            ) : null}
          </Field>
        </section>
      ) : null}

      <form className="flex flex-col gap-4 border-t pt-6" onSubmit={(event) => void saveTarget(event)}>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <TargetIcon className="size-4" />
            {t('plan.target.title')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('plan.target.description')}</p>
        </div>
        <div className={cn('grid grid-cols-1 gap-4', compact ? undefined : 'sm:grid-cols-2')}>
          <Field>
            <FieldLabel htmlFor="plan-target-cadence">{t('plan.target.cadence')}</FieldLabel>
            <Select
              value={cadence}
              onValueChange={(value) => {
                const nextCadence = value as PlanTargetValues['cadence'];
                setCadence(nextCadence);
                if (nextCadence === 'custom' && bucket.target?.cadence !== 'custom') {
                  setRepeatIntervalConfigured(true);
                }
                if (nextCadence !== 'custom' && behaviour === 'balanceBy') setBehaviour('setAside');
                setTargetError(null);
              }}
            >
              <SelectTrigger id="plan-target-cadence" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="weekly">{t('plan.target.cadence.weekly')}</SelectItem>
                  <SelectItem value="monthly">{t('plan.target.cadence.monthly')}</SelectItem>
                  <SelectItem value="yearly">{t('plan.target.cadence.yearly')}</SelectItem>
                  <SelectItem value="custom">{t('plan.target.cadence.custom')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-target-behaviour">{t('plan.target.behaviour')}</FieldLabel>
            <Select
              value={behaviour}
              onValueChange={(value) => {
                setBehaviour(value as PlanTargetValues['behaviour']);
                setTargetError(null);
              }}
            >
              <SelectTrigger id="plan-target-behaviour" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="setAside">{t('plan.target.behaviour.setAside')}</SelectItem>
                  <SelectItem value="refill">{t('plan.target.behaviour.refill')}</SelectItem>
                  <SelectItem value="balanceBy" disabled={cadence !== 'custom'}>
                    {t('plan.target.behaviour.balanceBy')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {/* A greyed option with no reason is a dead end: say what unlocks it. */}
            {cadence !== 'custom' ? (
              <FieldDescription>{t('plan.target.behaviour.balanceByHint')}</FieldDescription>
            ) : null}
          </Field>
        </div>
        <Field data-invalid={targetError ? true : undefined}>
          <FieldLabel htmlFor="plan-target-amount">{t('plan.target.amount')}</FieldLabel>
          <Input
            id="plan-target-amount"
            value={targetAmount}
            inputMode="decimal"
            aria-invalid={targetError ? true : undefined}
            onChange={(event) => {
              setTargetAmount(event.target.value);
              setTargetError(null);
            }}
          />
          <FieldDescription>{t('plan.move.currencyHint', { currency })}</FieldDescription>
        </Field>
        {cadence === 'weekly' ? (
          <Field>
            <FieldLabel htmlFor="plan-target-weekday">{t('plan.target.weekday')}</FieldLabel>
            <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
              <SelectTrigger id="plan-target-weekday" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Array.from({ length: 7 }, (_, day) => (
                    <SelectItem key={day} value={String(day)}>
                      {t(`plan.target.weekday.${day}` as `plan.target.weekday.${0 | 1 | 2 | 3 | 4 | 5 | 6}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {cadence === 'monthly' ? (
          <Field>
            <FieldLabel htmlFor="plan-target-day">{t('plan.target.dayOfMonth')}</FieldLabel>
            <Input
              id="plan-target-day"
              type="number"
              min="1"
              max="31"
              value={dayOfMonth}
              onChange={(event) => setDayOfMonth(event.target.value)}
            />
            <FieldDescription>{t('plan.target.dayOfMonthHint')}</FieldDescription>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="plan-target-due-date">{t('plan.target.dueDate')}</FieldLabel>
          <Input
            id="plan-target-due-date"
            type="date"
            value={dueDate}
            required={cadence === 'yearly' || cadence === 'custom'}
            onChange={(event) => {
              setDueDate(event.target.value);
              setTargetError(null);
            }}
          />
          <FieldDescription>{t('plan.target.dueDateHint')}</FieldDescription>
        </Field>
        {cadence === 'custom' && behaviour !== 'balanceBy' ? (
          <Field orientation="horizontal">
            <div className="flex flex-1 flex-col gap-1">
              <FieldLabel htmlFor="plan-target-repeats">{t('plan.target.repeats')}</FieldLabel>
              <FieldDescription>{t('plan.target.repeatsHint')}</FieldDescription>
            </div>
            <Checkbox
              id="plan-target-repeats"
              checked={repeats}
              onCheckedChange={(value) => {
                setRepeats(value === true);
                setTargetError(null);
              }}
            />
          </Field>
        ) : null}
        {cadence === 'custom' && behaviour !== 'balanceBy' && repeats ? (
          <FieldGroup className={cn('gap-4', compact ? undefined : 'sm:grid sm:grid-cols-2')}>
            <Field data-invalid={targetError ? true : undefined}>
              <FieldLabel htmlFor="plan-target-repeat-interval-count">
                {t('plan.target.repeatIntervalCount')}
              </FieldLabel>
              <Input
                id="plan-target-repeat-interval-count"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={repeatIntervalCount}
                aria-invalid={targetError ? true : undefined}
                onChange={(event) => {
                  setRepeatIntervalCount(event.target.value);
                  setRepeatIntervalConfigured(true);
                  setTargetError(null);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-target-repeat-interval-unit">{t('plan.target.repeatIntervalUnit')}</FieldLabel>
              <Select
                value={repeatIntervalUnit}
                onValueChange={(value) => {
                  setRepeatIntervalUnit(value as 'month' | 'year');
                  setRepeatIntervalConfigured(true);
                }}
              >
                <SelectTrigger id="plan-target-repeat-interval-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="month">{t('plan.target.repeatIntervalUnit.month')}</SelectItem>
                    <SelectItem value="year">{t('plan.target.repeatIntervalUnit.year')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        ) : null}
        {targetError ? (
          <p role="alert" className="text-sm text-destructive">
            {targetError}
          </p>
        ) : null}
        {bucket.target ? (
          <Field orientation="horizontal">
            <div className="flex flex-1 flex-col gap-1">
              <FieldLabel htmlFor="plan-target-snoozed">{t('plan.target.snooze')}</FieldLabel>
              <FieldDescription>{t('plan.target.snoozeHint', { period })}</FieldDescription>
            </div>
            <Checkbox
              id="plan-target-snoozed"
              checked={bucket.snoozed}
              disabled={targetPending}
              onCheckedChange={(value) => void onSnoozeTarget(bucket, value === true)}
            />
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={targetPending}>
            {targetPending ? <Spinner /> : null}
            {t('common.save')}
          </Button>
          {bucket.target ? (
            <Button
              type="button"
              variant="outline"
              disabled={targetPending}
              onClick={() => {
                void onClearTarget(bucket).then((cleared) => {
                  if (cleared) resetTargetForm();
                });
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              {t('plan.target.clear')}
            </Button>
          ) : null}
        </div>
      </form>

      {!bucket.cardAccountId && !bucket.installmentPlanId ? (
        <section className="flex flex-col gap-2 border-t pt-6">
          <h3 className="text-sm font-medium">{t('plan.inspector.categories')}</h3>
          {bucket.categoryIds.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {bucket.categoryIds.map((categoryId) => (
                <li key={categoryId} className="rounded-full bg-muted px-3 py-1.5 text-xs">
                  {categoryNames.get(categoryId) ?? t('plan.activity.unknownCategory')}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('plan.inspector.noCategories')}</p>
          )}
        </section>
      ) : null}

      {otherBuckets.length > 0 ? (
        <form className="flex flex-col gap-4 border-t pt-6" onSubmit={(event) => void moveMoney(event)}>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <ArrowLeftRightIcon className="size-4" />
              {t('plan.move.title')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('plan.move.description')}</p>
          </div>
          <Field>
            <FieldLabel htmlFor="plan-move-direction">{t('plan.move.direction')}</FieldLabel>
            <Select value={direction} onValueChange={(value) => setDirection(value as 'out' | 'in')}>
              <SelectTrigger id="plan-move-direction" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="out">{t('plan.move.fromBucket', { name: bucket.name })}</SelectItem>
                <SelectItem value="in">{t('plan.move.toBucket', { name: bucket.name })}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-move-other">{t('plan.move.otherBucket')}</FieldLabel>
            <Select value={otherBucketId} onValueChange={setOtherBucketId}>
              <SelectTrigger id="plan-move-other" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {otherBuckets.map((candidate) => (
                  <SelectItem key={candidate.bucketId} value={candidate.bucketId}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={moveError ? true : undefined}>
            <FieldLabel htmlFor="plan-move-amount">{t('common.amount')}</FieldLabel>
            <Input
              id="plan-move-amount"
              value={moveAmount}
              inputMode="decimal"
              aria-invalid={moveError ? true : undefined}
              aria-describedby={moveError ? 'plan-move-error' : undefined}
              onChange={(event) => {
                setMoveAmount(event.target.value);
                setMoveError(null);
              }}
            />
            <FieldDescription>{t('plan.move.currencyHint', { currency })}</FieldDescription>
            {moveError ? (
              <p id="plan-move-error" role="alert" className="text-sm text-destructive">
                {moveError}
              </p>
            ) : null}
          </Field>
          <Button type="submit" disabled={movePending || !otherBucketId}>
            {movePending ? <Spinner /> : null}
            {t('plan.move.action')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function CardStatementPaymentRegistration({
  cardAccountId,
  currency,
  period,
}: {
  cardAccountId: Id<'financialAccounts'>;
  currency: string;
  period: string;
}) {
  const { intlLocale, t } = useI18n();
  const { maskValue } = useBalancePrivacy();
  const candidates = useQuery(api.banking.credit.listCardStatementPaymentCandidates, {
    cardAccountId,
    period,
    limit: 10,
  });
  const registerCardStatementPayment = useMutation(api.banking.credit.registerCardStatementPayment);
  const pendingAction = usePendingAction();

  async function register(transactionId: Id<'transactions'>) {
    await pendingAction.run(
      transactionId,
      async () => {
        await registerCardStatementPayment({ cardAccountId, transactionId });
      },
      {
        success: t('plan.cardPayments.registration.success'),
        getErrorMessage: (error) =>
          error instanceof Error && error.message.includes('would make the card balance positive')
            ? t('plan.cardPayments.registration.positiveBalanceError')
            : t('plan.cardPayments.registration.error'),
      },
    );
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-6">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <LinkIcon className="size-4" />
          {t('plan.cardPayments.registration.title')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('plan.cardPayments.registration.description')}</p>
      </div>
      {candidates === undefined ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {t('plan.cardPayments.registration.loading')}
        </p>
      ) : candidates.candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('plan.cardPayments.registration.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.candidates.map((candidate) => {
            const pending = pendingAction.isPending(candidate.transaction._id);
            return (
              <li key={candidate.transaction._id} className="flex flex-col gap-2 rounded-md border bg-background p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Bank descriptions are long and all-caps; two lines carry enough of one to
                        recognise the payment, where a single truncated line often did not. */}
                    <p className="line-clamp-2 text-sm font-medium break-words">{candidate.transaction.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{candidate.transaction.bookingDate}</p>
                  </div>
                  <Amount money={candidate.transaction.amount} variant="neutral" className="shrink-0" />
                </div>
                {candidate.requiresCycleClose ? (
                  <p className="text-xs text-balance text-muted-foreground">
                    {t('plan.cardPayments.registration.closeCycleHint')}
                  </p>
                ) : null}
                <p className="text-xs text-balance text-muted-foreground">
                  {candidate.balanceEffect.reason === 'applied'
                    ? t('plan.cardPayments.registration.balanceChange', {
                        current: maskValue(formatMoney(candidate.balanceEffect.currentAmount, intlLocale)),
                        resulting: maskValue(formatMoney(candidate.balanceEffect.resultingAmount, intlLocale)),
                      })
                    : candidate.balanceEffect.reason === 'alreadyIncluded'
                      ? t('plan.cardPayments.registration.balanceUnchangedIncluded')
                      : t('plan.cardPayments.registration.balanceUnchangedProvider')}
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={pendingAction.isPending() || candidate.transaction.amount.currency !== currency}
                  onClick={() => void register(candidate.transaction._id)}
                >
                  {pending ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
                  {t('plan.cardPayments.registration.action')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function GroupSummary({ group, currency }: { group: PlanGroup; currency: string }) {
  const { t } = useI18n();
  const totals = group.buckets.reduce(
    (result, bucket) => ({
      assignedMinor: result.assignedMinor + bucket.assignedMinor,
      activityMinor: result.activityMinor + bucket.activityMinor,
      availableMinor: result.availableMinor + bucket.availableMinor,
      underfundedMinor: result.underfundedMinor + bucket.underfundedMinor,
    }),
    { assignedMinor: 0n, activityMinor: 0n, availableMinor: 0n, underfundedMinor: 0n },
  );
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2">
        <Metric label={t('plan.columns.assigned')} amountMinor={totals.assignedMinor} currency={currency} />
        <Metric label={t('plan.columns.activity')} amountMinor={totals.activityMinor} currency={currency} />
        <Metric label={t('plan.columns.available')} amountMinor={totals.availableMinor} currency={currency} />
        <Metric label={t('plan.status.underfunded')} amountMinor={totals.underfundedMinor} currency={currency} />
      </div>
      <section className="border-t pt-5">
        <h3 className="text-sm font-medium">{t('plan.inspector.groupBuckets', { count: group.buckets.length })}</h3>
        <ul className="mt-2 divide-y">
          {group.buckets.map((bucket) => (
            <li key={bucket.bucketId} className="flex min-w-0 items-center justify-between gap-3 py-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">{bucket.name}</span>
              <Amount
                money={{ amountMinor: bucket.availableMinor, currency }}
                variant="balance"
                className="shrink-0 font-medium"
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MonthSummary({ month }: { month: PlanMonth }) {
  const { t } = useI18n();
  const currency = month.plan.currency;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2">
        <Metric label={t('plan.rta.positive')} amountMinor={month.readyToAssignMinor} currency={currency} />
        <Metric label={t('plan.columns.available')} amountMinor={month.totals.availableMinor} currency={currency} />
        <Metric label={t('plan.columns.assigned')} amountMinor={month.totals.assignedMinor} currency={currency} />
        <Metric label={t('plan.columns.activity')} amountMinor={month.totals.activityMinor} currency={currency} />
        <Metric label={t('plan.cost.targets')} amountMinor={month.totals.targetsMinor} currency={currency} />
        <Metric label={t('plan.status.underfunded')} amountMinor={month.totals.underfundedMinor} currency={currency} />
      </div>
      <section className="border-t pt-5">
        {/* Named on purpose: these are the groups' available balances, but the grid alongside shows
            three labelled columns, and an unlabelled column of figures reads as whichever one the
            eye is on. Only a group with an assignment tells them apart, so the coincidence holds
            almost everywhere and then breaks in a single row. */}
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">{t('plan.inspector.monthGroups', { count: month.groups.length })}</h3>
          <span className="shrink-0 text-xs text-muted-foreground">{t('plan.columns.available')}</span>
        </div>
        <ul className="mt-2 divide-y">
          {month.groups.map((group) => {
            const availableMinor = group.buckets.reduce((total, bucket) => total + bucket.availableMinor, 0n);
            return (
              <li key={group.groupId} className="flex min-w-0 items-center justify-between gap-3 py-2 text-xs">
                <span className="min-w-0 truncate text-muted-foreground">{group.name}</span>
                <Amount
                  money={{ amountMinor: availableMinor, currency }}
                  variant="balance"
                  className="shrink-0 font-medium"
                />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Metric({
  amountMinor,
  currency,
  label,
  status,
}: {
  amountMinor: bigint;
  currency: string;
  label: string;
  status?: string;
}) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Amount money={{ amountMinor, currency }} variant="balance" />
      {status ? <p className="mt-1 text-xs text-muted-foreground">{status}</p> : null}
    </div>
  );
}
