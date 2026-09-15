import * as React from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderInputIcon,
  PanelRightOpenIcon,
  PencilIcon,
  ReceiptTextIcon,
} from 'lucide-react';

import { matchesPlanFilter } from './plan-filters';
import { planBucketProgress, planBucketStatusKey } from './plan-status';
import type { PlanBucketProgressMessage } from './plan-status';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanFilter } from './plan-filters';
import type { PlanBucket, PlanCategory, PlanGroup, PlanMonth, PlanOutOfPlanKind } from './types';
import { Amount } from '@/components/app/amount';
import { CategoryIcon } from '@/components/categories/category-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { moneyInputValue, parseMoneyMinor } from '@/lib/money';
import { cn } from '@/lib/utils';

type PlanGridProps = {
  categories: Array<PlanCategory>;
  filter: PlanFilter;
  month: PlanMonth;
  onAddUnplannedCategory?: () => void;
  onAssignedChange: (bucket: PlanBucket, amountMinor: bigint) => Promise<boolean>;
  onEditAssignedMobile: (bucket: PlanBucket) => void;
  onOpenActivity: (bucket: PlanBucket) => void;
  onOpenInspector: (bucket: PlanBucket) => void;
  onOpenOutOfPlan: (kind: PlanOutOfPlanKind) => void;
  onSelectGroup: (group: PlanGroup) => void;
  pendingAssigned: (bucketId: Id<'planBuckets'>) => boolean;
  selectedBucketId: Id<'planBuckets'> | null;
  selectedGroupId: Id<'planGroups'> | null;
};

export function PlanGrid({
  categories,
  filter,
  month,
  onAddUnplannedCategory,
  onAssignedChange,
  onEditAssignedMobile,
  onOpenActivity,
  onOpenInspector,
  onOpenOutOfPlan,
  onSelectGroup,
  pendingAssigned,
  selectedBucketId,
  selectedGroupId,
}: PlanGridProps) {
  const { t } = useI18n();
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<Id<'planGroups'>>>(new Set());
  const assignedButtonRefs = React.useRef(new Map<Id<'planBuckets'>, HTMLButtonElement>());
  const categoryById = React.useMemo(
    () => new Map(categories.map((category) => [category._id, category])),
    [categories],
  );
  // A focused view answers one question, so the sections that are always true of the whole month —
  // out of plan and plan totals — only belong to the unfiltered grid.
  const unfiltered = filter === 'all';
  const displayGroups = month.groups
    .map((group) => ({ group, buckets: group.buckets.filter((bucket) => matchesPlanFilter(bucket, filter)) }))
    .filter((entry) => unfiltered || entry.buckets.length > 0);
  const showUnplanned = unfiltered && month.unplanned.activityMinor !== 0n;
  const showInternal = unfiltered && month.breakdown.internalMinor !== 0n;
  const showTransfers = unfiltered && month.breakdown.transferNetMinor !== 0n;
  const showOutOfPlan = showUnplanned || showInternal || showTransfers;
  const visibleBuckets = displayGroups.flatMap((entry) =>
    collapsedGroups.has(entry.group.groupId) ? [] : entry.buckets,
  );
  if (showUnplanned) visibleBuckets.push(month.unplanned);

  function toggleGroup(groupId: Id<'planGroups'>) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function focusAdjacent(bucketId: Id<'planBuckets'>, direction: 1 | -1) {
    const index = visibleBuckets.findIndex((bucket) => bucket.bucketId === bucketId);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= visibleBuckets.length) return;
    const nextBucket = visibleBuckets[targetIndex];
    requestAnimationFrame(() => assignedButtonRefs.current.get(nextBucket.bucketId)?.focus());
  }

  return (
    <>
      <Card className="hidden min-w-0 md:flex lg:min-h-0 lg:flex-1">
        {/* This box is the scroll container on large screens, so the sticky header below resolves
            against it. An ancestor with overflow-x alone would capture the sticky positioning while
            never scrolling vertically, which is what made the header overlap the first row. */}
        <CardContent className="min-w-0 flex-1 overflow-x-auto px-0 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
          <table className="w-full min-w-[38rem] table-fixed border-collapse xl:min-w-0">
            <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="w-[46%] px-5 py-2.5 font-medium">
                  {t('plan.columns.category')}
                </th>
                <th scope="col" className="w-[18%] px-3 py-2.5 text-right font-medium">
                  {t('plan.columns.assigned')}
                </th>
                <th scope="col" className="w-[18%] px-3 py-2.5 text-right font-medium">
                  {t('plan.columns.activity')}
                </th>
                <th scope="col" className="w-[18%] px-5 py-2.5 text-right font-medium">
                  {t('plan.columns.available')}
                </th>
              </tr>
            </thead>
            {displayGroups.map(({ group, buckets }) => {
              const collapsed = collapsedGroups.has(group.groupId);
              const totals = groupTotals(group);
              return (
                <tbody key={group.groupId}>
                  <tr
                    className={cn(
                      'border-y bg-muted/55 font-semibold',
                      selectedGroupId === group.groupId ? 'bg-accent' : undefined,
                    )}
                  >
                    <th scope="rowgroup" className="px-3 py-1.5 text-left">
                      <div className="flex min-w-0 items-center gap-1">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
                          aria-expanded={!collapsed}
                          onClick={() => toggleGroup(group.groupId)}
                        >
                          {collapsed ? (
                            <ChevronRightIcon className="size-4 shrink-0" />
                          ) : (
                            <ChevronDownIcon className="size-4 shrink-0" />
                          )}
                          <span className="truncate">{group.name}</span>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="hidden lg:inline-flex"
                          aria-label={t('plan.inspector.openGroup', { name: group.name })}
                          aria-pressed={selectedGroupId === group.groupId}
                          onClick={() => onSelectGroup(group)}
                        >
                          <PanelRightOpenIcon />
                        </Button>
                      </div>
                    </th>
                    <Subtotal amountMinor={totals.assignedMinor} currency={month.plan.currency} />
                    <Subtotal amountMinor={totals.activityMinor} currency={month.plan.currency} />
                    <Subtotal amountMinor={totals.availableMinor} currency={month.plan.currency} available />
                  </tr>
                  {!collapsed
                    ? buckets.map((bucket) => (
                        <BucketRow
                          key={bucket.bucketId}
                          bucket={bucket}
                          category={
                            bucket.categoryIds.length === 1 ? categoryById.get(bucket.categoryIds[0]) : undefined
                          }
                          currency={month.plan.currency}
                          onAssignedChange={onAssignedChange}
                          onFocusAdjacent={focusAdjacent}
                          onOpenActivity={onOpenActivity}
                          onOpenInspector={onOpenInspector}
                          pending={pendingAssigned(bucket.bucketId)}
                          selected={selectedBucketId === bucket.bucketId}
                          registerAssignedButton={(node) => {
                            if (node) assignedButtonRefs.current.set(bucket.bucketId, node);
                            else assignedButtonRefs.current.delete(bucket.bucketId);
                          }}
                        />
                      ))
                    : null}
                </tbody>
              );
            })}
            {showOutOfPlan ? (
              <tbody>
                <tr className="border-t-2 border-warning/40 bg-warning/5">
                  <th scope="rowgroup" colSpan={4} className="px-6 py-2 text-left font-medium">
                    {t('plan.outOfPlan.title')}
                  </th>
                </tr>
                {showUnplanned ? (
                  <tr
                    className={cn(
                      'border-b bg-warning/5',
                      selectedBucketId === month.unplanned.bucketId ? 'bg-accent/70' : undefined,
                    )}
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex min-w-0 items-start gap-2">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                          aria-pressed={selectedBucketId === month.unplanned.bucketId}
                          onClick={() => onOpenInspector(month.unplanned)}
                        >
                          <CategoryIcon
                            category={{ color: undefined, icon: undefined }}
                            className="mt-0.5 size-7 [&_svg]:size-3.5"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium hover:underline">{t('plan.unplanned')}</span>
                            <span className="mt-0.5 block text-xs text-warning">{t('plan.unplannedHint')}</span>
                          </span>
                        </button>
                        {onAddUnplannedCategory ? (
                          <Button type="button" variant="outline" size="sm" onClick={onAddUnplannedCategory}>
                            <FolderInputIcon data-icon="inline-start" />
                            {t('plan.unplanned.assign')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Amount money={{ amountMinor: month.unplanned.assignedMinor, currency: month.plan.currency }} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <ActivityButton bucket={month.unplanned} currency={month.plan.currency} onOpen={onOpenActivity} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <AvailableValue bucket={month.unplanned} currency={month.plan.currency} />
                    </td>
                  </tr>
                ) : null}
                {showInternal ? (
                  <SystemActivityRow
                    amountMinor={month.breakdown.internalMinor}
                    currency={month.plan.currency}
                    hint={t('plan.outOfPlan.internalHint')}
                    label={t('plan.outOfPlan.internal')}
                    onOpen={() => onOpenOutOfPlan('internal')}
                  />
                ) : null}
                {showTransfers ? (
                  <SystemActivityRow
                    amountMinor={month.breakdown.transferNetMinor}
                    currency={month.plan.currency}
                    hint={t('plan.outOfPlan.transfersHint')}
                    label={t('plan.outOfPlan.transfers')}
                    onOpen={() => onOpenOutOfPlan('transfer')}
                  />
                ) : null}
              </tbody>
            ) : null}
            {displayGroups.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-muted-foreground">
                    {t('plan.filter.empty')}
                  </td>
                </tr>
              </tbody>
            ) : null}
            {unfiltered ? (
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <th scope="row" className="px-6 py-3 text-left">
                    {t('plan.total')}
                  </th>
                  <Subtotal amountMinor={month.totals.assignedMinor} currency={month.plan.currency} />
                  <Subtotal amountMinor={month.totals.activityMinor} currency={month.plan.currency} />
                  <Subtotal amountMinor={month.totals.availableMinor} currency={month.plan.currency} available />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 md:hidden">
        {displayGroups.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">{t('plan.filter.empty')}</p>
        ) : null}
        {displayGroups.map(({ group, buckets }) => {
          const collapsed = collapsedGroups.has(group.groupId);
          const totals = groupTotals(group);
          return (
            <section key={group.groupId} className="flex flex-col gap-2">
              <button
                type="button"
                className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                aria-expanded={!collapsed}
                onClick={() => toggleGroup(group.groupId)}
              >
                {collapsed ? <ChevronRightIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
                <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
                <Amount
                  money={{ amountMinor: totals.availableMinor, currency: month.plan.currency }}
                  variant="balance"
                />
              </button>
              {!collapsed
                ? buckets.map((bucket) => (
                    <MobileBucketCard
                      key={bucket.bucketId}
                      bucket={bucket}
                      category={bucket.categoryIds.length === 1 ? categoryById.get(bucket.categoryIds[0]) : undefined}
                      currency={month.plan.currency}
                      onEditAssigned={onEditAssignedMobile}
                      onOpenActivity={onOpenActivity}
                      onOpenInspector={onOpenInspector}
                    />
                  ))
                : null}
            </section>
          );
        })}
        {showOutOfPlan ? (
          <section className="flex flex-col gap-2">
            <p className="px-1 text-sm font-medium text-warning">{t('plan.outOfPlan.title')}</p>
            {showUnplanned ? (
              <MobileBucketCard
                bucket={month.unplanned}
                currency={month.plan.currency}
                onAddUnplannedCategory={onAddUnplannedCategory}
                onEditAssigned={onEditAssignedMobile}
                onOpenActivity={onOpenActivity}
                onOpenInspector={onOpenInspector}
                unplanned
              />
            ) : null}
            {showInternal ? (
              <SystemActivityCard
                amountMinor={month.breakdown.internalMinor}
                currency={month.plan.currency}
                hint={t('plan.outOfPlan.internalHint')}
                label={t('plan.outOfPlan.internal')}
                onOpen={() => onOpenOutOfPlan('internal')}
              />
            ) : null}
            {showTransfers ? (
              <SystemActivityCard
                amountMinor={month.breakdown.transferNetMinor}
                currency={month.plan.currency}
                hint={t('plan.outOfPlan.transfersHint')}
                label={t('plan.outOfPlan.transfers')}
                onOpen={() => onOpenOutOfPlan('transfer')}
              />
            ) : null}
          </section>
        ) : null}
        {unfiltered ? (
          <Card size="sm">
            <CardContent className="grid grid-cols-3 gap-2">
              <MobileMetric
                label={t('plan.columns.assigned')}
                amountMinor={month.totals.assignedMinor}
                currency={month.plan.currency}
              />
              <MobileMetric
                label={t('plan.columns.activity')}
                amountMinor={month.totals.activityMinor}
                currency={month.plan.currency}
              />
              <MobileMetric
                label={t('plan.columns.available')}
                amountMinor={month.totals.availableMinor}
                currency={month.plan.currency}
                available
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function SystemActivityRow({
  amountMinor,
  currency,
  hint,
  label,
  onOpen,
}: {
  amountMinor: bigint;
  currency: string;
  hint: string;
  label: string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <tr className="border-b bg-warning/5 last:border-b-0">
      <td className="px-6 py-3">
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </td>
      <td className="px-3 py-3 text-right text-muted-foreground">—</td>
      <td className="px-3 py-3 text-right">
        <button
          type="button"
          className="inline-flex min-h-8 min-w-20 items-center justify-end rounded-xl px-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
          aria-label={t('plan.outOfPlan.openLabel', { name: label })}
          onClick={onOpen}
        >
          <Amount money={{ amountMinor, currency }} className={amountMinor > 0n ? 'text-positive' : undefined} />
        </button>
      </td>
      <td className="px-6 py-3 text-right text-muted-foreground" aria-label="Not applicable">
        —
      </td>
    </tr>
  );
}

function SystemActivityCard({
  amountMinor,
  currency,
  hint,
  label,
  onOpen,
}: {
  amountMinor: bigint;
  currency: string;
  hint: string;
  label: string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card size="sm" className="ring-warning/40">
      <CardContent>
        <button
          type="button"
          className="flex w-full items-start justify-between gap-4 rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          aria-label={t('plan.outOfPlan.openLabel', { name: label })}
          onClick={onOpen}
        >
          <div className="min-w-0">
            <p className="font-medium">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] text-muted-foreground">{t('plan.columns.activity')}</p>
            <Amount
              money={{ amountMinor, currency }}
              className={cn('text-xs', amountMinor > 0n ? 'text-positive' : undefined)}
            />
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

function BucketRow({
  bucket,
  category,
  currency,
  onAssignedChange,
  onFocusAdjacent,
  onOpenActivity,
  onOpenInspector,
  pending,
  registerAssignedButton,
  selected,
}: {
  bucket: PlanBucket;
  category?: PlanCategory;
  currency: string;
  onAssignedChange: (bucket: PlanBucket, amountMinor: bigint) => Promise<boolean>;
  onFocusAdjacent: (bucketId: Id<'planBuckets'>, direction: 1 | -1) => void;
  onOpenActivity: (bucket: PlanBucket) => void;
  onOpenInspector: (bucket: PlanBucket) => void;
  pending: boolean;
  registerAssignedButton: (node: HTMLButtonElement | null) => void;
  selected: boolean;
}) {
  return (
    <tr className={cn('border-b last:border-b-0 hover:bg-muted/25', selected ? 'bg-accent/70' : undefined)}>
      <td className="px-5 py-2">
        <button
          type="button"
          className="flex w-full min-w-0 items-start gap-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          aria-pressed={selected}
          onClick={() => onOpenInspector(bucket)}
        >
          <CategoryIcon
            category={category ?? { color: undefined, icon: undefined }}
            className="mt-0.5 size-7 [&_svg]:size-3.5"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate leading-6 hover:underline">{bucket.name}</span>
            {bucket.dueDate && (bucket.cardAccountId || bucket.installmentPlanId) ? (
              <SystemPaymentDueDate dueDate={bucket.dueDate} installment={Boolean(bucket.installmentPlanId)} />
            ) : null}
            <BucketProgress bucket={bucket} currency={currency} />
          </span>
        </button>
      </td>
      <td className="px-3 py-2 text-right">
        <AssignedCell
          bucket={bucket}
          currency={currency}
          onCommit={onAssignedChange}
          onFocusAdjacent={onFocusAdjacent}
          pending={pending}
          registerButton={registerAssignedButton}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <ActivityButton bucket={bucket} currency={currency} onOpen={onOpenActivity} />
      </td>
      <td className="px-5 py-2 text-right">
        <AvailableValue bucket={bucket} currency={currency} />
      </td>
    </tr>
  );
}

function AssignedCell({
  bucket,
  currency,
  onCommit,
  onFocusAdjacent,
  pending,
  registerButton,
}: {
  bucket: PlanBucket;
  currency: string;
  onCommit: (bucket: PlanBucket, amountMinor: bigint) => Promise<boolean>;
  onFocusAdjacent: (bucketId: Id<'planBuckets'>, direction: 1 | -1) => void;
  pending: boolean;
  registerButton: (node: HTMLButtonElement | null) => void;
}) {
  const { intlLocale, t } = useI18n();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function beginEditing() {
    if (pending || editing) return;
    setValue(moneyInputValue({ amountMinor: bucket.assignedMinor, currency }, intlLocale));
    setError(null);
    setEditing(true);
  }

  async function commit() {
    let amountMinor: bigint;
    try {
      amountMinor = parseMoneyMinor(value, currency, intlLocale);
    } catch {
      setError(t('plan.errors.invalidAmount'));
      return false;
    }
    const saved = await onCommit(bucket, amountMinor);
    if (saved) setEditing(false);
    return saved;
  }

  if (!editing) {
    return (
      <button
        ref={registerButton}
        type="button"
        className="inline-flex min-h-8 min-w-24 items-center justify-end rounded-xl px-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
        aria-label={t('plan.assigned.editLabel', { name: bucket.name })}
        disabled={pending}
        onClick={beginEditing}
        onFocus={beginEditing}
      >
        {pending ? <Spinner /> : <Amount money={{ amountMinor: bucket.assignedMinor, currency }} />}
      </button>
    );
  }

  const errorId = `plan-assigned-error-${bucket.bucketId}`;
  return (
    <div className="ml-auto flex w-full max-w-36 flex-col items-end gap-1">
      <Input
        ref={inputRef}
        value={value}
        inputMode="decimal"
        className="h-8 text-right tabular-nums"
        aria-label={t('plan.assigned.editLabel', { name: bucket.name })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setEditing(false);
            setError(null);
          } else if (event.key === 'Tab') {
            event.preventDefault();
            void commit().then((saved) => {
              if (saved) onFocusAdjacent(bucket.bucketId, event.shiftKey ? -1 : 1);
            });
          }
        }}
      />
      {error ? (
        <span id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function SystemPaymentDueDate({ dueDate, installment }: { dueDate: string; installment: boolean }) {
  const { intlLocale, t } = useI18n();
  return (
    <span className="mt-0.5 block text-xs text-muted-foreground">
      {t(installment ? 'plan.installments.dueDate' : 'plan.cardPayments.dueDate', {
        date: formatIsoDate(dueDate, intlLocale),
      })}
    </span>
  );
}

function ActivityButton({
  bucket,
  currency,
  onOpen,
}: {
  bucket: PlanBucket;
  currency: string;
  onOpen: (bucket: PlanBucket) => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="inline-flex min-h-8 min-w-20 flex-col items-end justify-center rounded-xl px-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
      aria-label={t('plan.activity.openLabel', { name: bucket.name })}
      onClick={() => onOpen(bucket)}
    >
      <Amount
        money={{ amountMinor: bucket.activityMinor, currency }}
        className={bucket.activityMinor > 0n ? 'text-positive' : undefined}
      />
      {bucket.cardAccountId ? (
        <span className="text-[11px] text-muted-foreground">
          {t('plan.cardPayments.coveredSpend')}:{' '}
          <Amount money={{ amountMinor: bucket.coveredCardSpendMinor, currency }} className="text-[11px]" />
        </span>
      ) : null}
    </button>
  );
}

function BucketProgress({ bucket, currency }: { bucket: PlanBucket; currency: string }) {
  const { t } = useI18n();
  const progress = planBucketProgress(bucket);
  return (
    <span className="mt-1 flex min-w-0 items-center gap-2">
      <span className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span
          className={cn('block h-full rounded-full', progressToneClassName(progress.snoozed ? 'muted' : progress.tone))}
          style={{ width: `${progress.percent}%` }}
        />
      </span>
      <span className="min-w-0 max-w-[80%] text-right text-[11px] leading-4 text-muted-foreground">
        <ProgressMessage bucket={bucket} currency={currency} />
        {progress.snoozed ? (
          <span className="text-muted-foreground">
            {' · '}
            {t('plan.progress.snoozed')}
          </span>
        ) : null}
        <span className="sr-only"> {t('plan.progress.percent', { percent: Math.round(progress.percent) })}</span>
      </span>
    </span>
  );
}

function ProgressMessage({ bucket, currency }: { bucket: PlanBucket; currency: string }) {
  const { intlLocale, t } = useI18n();
  const { message } = planBucketProgress(bucket);
  if (message.kind === 'overspent') {
    return <PlanOverspendingBreakdown message={message} currency={currency} />;
  }
  if (message.kind === 'underfunded') {
    const prefix = t('plan.progress.underfundedPrefix');
    const suffix = t('plan.progress.underfundedSuffix');
    return (
      <>
        {prefix ? `${prefix} ` : null}
        <Amount money={{ amountMinor: message.amountMinor, currency }} className="text-[11px]" />
        {suffix ? ` ${suffix}` : null}
        {message.dueDay ? ` ${t('plan.progress.dueDay', { day: ordinalDay(message.dueDay, intlLocale) })}` : null}
      </>
    );
  }
  return t(message.kind === 'fullySpent' ? 'plan.progress.fullySpent' : 'plan.progress.funded');
}

export function PlanOverspendingBreakdown({
  currency,
  message,
}: {
  currency: string;
  message: Extract<PlanBucketProgressMessage, { kind: 'overspent' }>;
}) {
  const { t } = useI18n();
  return (
    <span className="flex flex-wrap justify-end gap-x-2 gap-y-0.5">
      {message.cashAmountMinor > 0n ? (
        <span data-overspend-kind="cash" className="text-destructive">
          {t('plan.progress.cashOverspending')}{' '}
          <Amount money={{ amountMinor: message.cashAmountMinor, currency }} className="text-[11px]" />
        </span>
      ) : null}
      {message.creditAmountMinor > 0n ? (
        <span data-overspend-kind="credit" className="text-warning">
          {t('plan.progress.creditOverspending')}{' '}
          <Amount money={{ amountMinor: message.creditAmountMinor, currency }} className="text-[11px]" />
        </span>
      ) : null}
    </span>
  );
}

function ordinalDay(day: number, locale: string) {
  if (!locale.toLowerCase().startsWith('en')) return String(day);
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function AvailableValue({ bucket, currency }: { bucket: PlanBucket; currency: string }) {
  const { t } = useI18n();
  const labelId = React.useId();
  const amountId = React.useId();
  const statusId = React.useId();
  const statusKey = planBucketStatusKey(bucket);
  const progress = planBucketProgress(bucket);
  return (
    <div className="flex flex-col items-end gap-1" role="group" aria-labelledby={`${labelId} ${amountId} ${statusId}`}>
      <span id={labelId} className="sr-only">
        {t('plan.columns.available')}
      </span>
      <span
        className={cn(
          'inline-flex min-w-20 justify-end rounded-full px-2.5 py-1 font-medium',
          pillToneClassName(progress.tone),
        )}
      >
        <span id={amountId}>
          <Amount money={{ amountMinor: bucket.availableMinor, currency }} variant="balance" />
        </span>
      </span>
      <span id={statusId} className="text-[11px] text-muted-foreground">
        {t(statusKey)}
      </span>
    </div>
  );
}

function pillToneClassName(tone: ReturnType<typeof planBucketProgress>['tone']) {
  switch (tone) {
    case 'destructive':
      return 'bg-destructive/10 text-destructive';
    case 'warning':
      return 'bg-warning/10 text-warning';
    case 'muted':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-positive/10 text-positive';
  }
}

function progressToneClassName(tone: ReturnType<typeof planBucketProgress>['tone']) {
  switch (tone) {
    case 'destructive':
      return 'bg-destructive';
    case 'warning':
      return 'bg-warning';
    case 'muted':
      return 'bg-muted-foreground/55';
    default:
      return 'bg-positive';
  }
}

function Subtotal({
  amountMinor,
  available,
  currency,
}: {
  amountMinor: bigint;
  available?: boolean;
  currency: string;
}) {
  return (
    <td className="px-3 py-2 text-right text-xs font-semibold last:px-5">
      <Amount money={{ amountMinor, currency }} variant={available ? 'balance' : 'neutral'} />
    </td>
  );
}

function MobileBucketCard({
  bucket,
  category,
  currency,
  onAddUnplannedCategory,
  onEditAssigned,
  onOpenActivity,
  onOpenInspector,
  unplanned,
}: {
  bucket: PlanBucket;
  category?: PlanCategory;
  currency: string;
  onAddUnplannedCategory?: () => void;
  onEditAssigned: (bucket: PlanBucket) => void;
  onOpenActivity: (bucket: PlanBucket) => void;
  onOpenInspector: (bucket: PlanBucket) => void;
  unplanned?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Card size="sm" className={cn(unplanned ? 'ring-warning/40' : undefined)}>
      <CardContent className="flex flex-col gap-3">
        <button
          type="button"
          className="flex min-w-0 items-start gap-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          onClick={() => onOpenInspector(bucket)}
        >
          <CategoryIcon
            category={category ?? { color: undefined, icon: undefined }}
            className="size-8 [&_svg]:size-4"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium hover:underline">
              {unplanned ? t('plan.unplanned') : bucket.name}
            </span>
            {unplanned ? (
              <span className="mt-0.5 block text-xs text-warning">{t('plan.unplannedHint')}</span>
            ) : (
              <>
                {bucket.dueDate && (bucket.cardAccountId || bucket.installmentPlanId) ? (
                  <SystemPaymentDueDate dueDate={bucket.dueDate} installment={Boolean(bucket.installmentPlanId)} />
                ) : null}
                <BucketProgress bucket={bucket} currency={currency} />
              </>
            )}
          </span>
        </button>
        {unplanned && onAddUnplannedCategory ? (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={onAddUnplannedCategory}>
            <FolderInputIcon data-icon="inline-start" />
            {t('plan.unplanned.assign')}
          </Button>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className="rounded-2xl bg-muted/60 p-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            aria-label={t('plan.assigned.editLabel', { name: bucket.name })}
            onClick={() => onEditAssigned(bucket)}
          >
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <PencilIcon className="size-3" />
              {t('plan.columns.assigned')}
            </span>
            <Amount money={{ amountMinor: bucket.assignedMinor, currency }} className="text-xs" />
          </button>
          <button
            type="button"
            className="rounded-2xl bg-muted/60 p-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            aria-label={t('plan.activity.openLabel', { name: bucket.name })}
            onClick={() => onOpenActivity(bucket)}
          >
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ReceiptTextIcon className="size-3" />
              {t('plan.columns.activity')}
            </span>
            <Amount
              money={{ amountMinor: bucket.activityMinor, currency }}
              className={cn('text-xs', bucket.activityMinor > 0n ? 'text-positive' : undefined)}
            />
            {bucket.cardAccountId ? (
              <span className="mt-1 block text-[10px] text-muted-foreground">
                {t('plan.cardPayments.coveredSpend')}:{' '}
                <Amount money={{ amountMinor: bucket.coveredCardSpendMinor, currency }} className="text-[10px]" />
              </span>
            ) : null}
          </button>
          <div className="rounded-2xl bg-muted/35 p-2">
            <span className="text-[11px] text-muted-foreground">{t('plan.columns.available')}</span>
            <AvailableValue bucket={bucket} currency={currency} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MobileMetric({
  amountMinor,
  available,
  currency,
  label,
}: {
  amountMinor: bigint;
  available?: boolean;
  currency: string;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <Amount
        money={{ amountMinor, currency }}
        variant={available ? 'balance' : 'neutral'}
        className="block truncate text-xs"
      />
    </div>
  );
}

function groupTotals(group: PlanGroup) {
  return group.buckets.reduce(
    (totals, bucket) => ({
      assignedMinor: totals.assignedMinor + bucket.assignedMinor,
      activityMinor: totals.activityMinor + bucket.activityMinor,
      availableMinor: totals.availableMinor + bucket.availableMinor,
    }),
    { assignedMinor: 0n, activityMinor: 0n, availableMinor: 0n },
  );
}
