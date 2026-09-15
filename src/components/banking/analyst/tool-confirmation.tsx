import { isRecord } from './helpers';
import type * as React from 'react';

import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
import { Spinner } from '@/components/ui/spinner';
import { Amount } from '@/components/app/amount';
import { formatIsoDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { moneyFromMajor } from '@/lib/money';

function MoneyValue({ value }: { value: unknown }) {
  if (!isRecord(value) || typeof value.amount !== 'number' || typeof value.currency !== 'string') return <>—</>;
  return <Amount money={moneyFromMajor(value.amount, value.currency)} />;
}

function SummaryLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-3 border-b py-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export function ToolConfirmation({
  toolName,
  input,
  disabled,
  onRespond,
}: {
  toolName: string;
  input: unknown;
  disabled: boolean;
  onRespond: (approve: boolean) => void;
}) {
  const { intlLocale, t } = useI18n();
  const values = isRecord(input) ? input : {};
  const description =
    toolName === 'rememberFact'
      ? t('analyst.approval.rememberFact')
      : toolName === 'bulkRecategorize'
        ? t('analyst.approval.bulkRecategorize')
        : toolName === 'createMoneyBox'
      ? t('analyst.approval.createMoneyBox')
      : toolName === 'createPlannedExpense'
        ? t('analyst.approval.createPlannedExpense')
        : toolName === 'setPlanTarget'
          ? t('analyst.approval.setPlanTarget')
          : t('analyst.approval.setPlanAssigned');
  const recurrenceInterval =
    values.recurrenceInterval === 'day'
      ? t('analyst.approval.interval.day')
      : values.recurrenceInterval === 'week'
        ? t('analyst.approval.interval.week')
        : values.recurrenceInterval === 'year'
          ? t('analyst.approval.interval.year')
          : t('analyst.approval.interval.month');
  const memoryKind =
    values.kind === 'fact'
      ? t('analyst.approval.memoryKind.fact')
      : values.kind === 'preference'
        ? t('analyst.approval.memoryKind.preference')
        : values.kind === 'goal'
          ? t('analyst.approval.memoryKind.goal')
          : '—';
  const targetCadence =
    values.cadence === 'weekly'
      ? t('analyst.approval.cadence.weekly')
      : values.cadence === 'monthly'
        ? t('analyst.approval.cadence.monthly')
        : values.cadence === 'yearly'
          ? t('analyst.approval.cadence.yearly')
          : values.cadence === 'custom'
            ? t('analyst.approval.cadence.custom')
            : '—';
  const targetBehaviour =
    values.behaviour === 'setAside'
      ? t('analyst.approval.behaviour.setAside')
      : values.behaviour === 'refill'
        ? t('analyst.approval.behaviour.refill')
        : values.behaviour === 'balanceBy'
          ? t('analyst.approval.behaviour.balanceBy')
          : '—';
  return (
    <Confirmation>
      <ConfirmationTitle>{t('analyst.approval.title')}</ConfirmationTitle>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <dl className="mt-3 rounded-2xl bg-background/70 px-3 text-sm">
        {toolName === 'rememberFact' ? (
          <>
            <SummaryLine label={t('analyst.approval.memoryKind')}>
              {memoryKind}
            </SummaryLine>
            <SummaryLine label={t('analyst.approval.memoryContent')}>
              <span className="break-words text-left">{String(values.content ?? '—')}</span>
            </SummaryLine>
          </>
        ) : toolName === 'bulkRecategorize' ? (
          <>
            <SummaryLine label={t('analyst.approval.changeCount')}>
              {Array.isArray(values.changes) ? values.changes.length : 0}
            </SummaryLine>
            <div className="py-2">
              <dt className="mb-1 text-muted-foreground">{t('analyst.approval.preview')}</dt>
              <dd className="space-y-1 text-xs">
                {(Array.isArray(values.changes) ? values.changes : []).slice(0, 5).map((change, index) => {
                  const row = isRecord(change) ? change : {};
                  return (
                    <div key={`${String(row.transactionId)}-${index}`} className="rounded-lg border px-2 py-1">
                      {String(row.transactionId ?? '—').slice(-8)} · {String(row.classificationKind ?? '—')}
                      {row.categoryName ? ` · ${String(row.categoryName)}` : ''}
                    </div>
                  );
                })}
                {Array.isArray(values.changes) && values.changes.length > 5 ? (
                  <p className="text-muted-foreground">{t('analyst.approval.moreChanges', { count: values.changes.length - 5 })}</p>
                ) : null}
              </dd>
            </div>
          </>
        ) : toolName === 'setPlanAssigned' ? (
          <>
            <SummaryLine label={t('analyst.approval.bucket')}>{String(values.bucketName ?? '—')}</SummaryLine>
            <SummaryLine label={t('common.month')}>
              {String(values.period ?? t('analyst.approval.currentMonth'))}
            </SummaryLine>
            <SummaryLine label={t('common.amount')}>
              <MoneyValue value={values.amount} />
            </SummaryLine>
          </>
        ) : toolName === 'setPlanTarget' ? (
          <>
            <SummaryLine label={t('analyst.approval.bucket')}>{String(values.bucketName ?? '—')}</SummaryLine>
            <SummaryLine label={t('analyst.approval.target')}>
              <MoneyValue value={values.amount} />
            </SummaryLine>
            <SummaryLine label={t('analyst.approval.cadence')}>{targetCadence}</SummaryLine>
            <SummaryLine label={t('analyst.approval.behaviour')}>{targetBehaviour}</SummaryLine>
            {values.dueDate ? (
              <SummaryLine label={t('analyst.approval.dueDate')}>
                {typeof values.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(values.dueDate)
                  ? formatIsoDate(values.dueDate, intlLocale)
                  : '—'}
              </SummaryLine>
            ) : null}
            <SummaryLine label={t('analyst.approval.repeats')}>
              {values.repeats ? t('analyst.approval.yes') : t('analyst.approval.no')}
            </SummaryLine>
          </>
        ) : toolName === 'createMoneyBox' ? (
          <>
            <SummaryLine label={t('common.name')}>{String(values.name ?? '—')}</SummaryLine>
            <SummaryLine label={t('analyst.approval.target')}>
              <MoneyValue value={values.targetAmount} />
            </SummaryLine>
            {values.savedAmount ? (
              <SummaryLine label={t('analyst.approval.saved')}>
                <MoneyValue value={values.savedAmount} />
              </SummaryLine>
            ) : null}
            <SummaryLine label={t('analyst.approval.dueDate')}>
              {typeof values.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(values.targetDate)
                ? formatIsoDate(values.targetDate, intlLocale)
                : '—'}
            </SummaryLine>
            <SummaryLine label={t('analyst.approval.account')}>
              {String(values.accountName ?? t('analyst.approval.unassigned'))}
            </SummaryLine>
          </>
        ) : toolName === 'createPlannedExpense' ? (
          <>
            <SummaryLine label={t('common.name')}>{String(values.name ?? '—')}</SummaryLine>
            <SummaryLine label={t('common.amount')}>
              <MoneyValue value={values.amount} />
            </SummaryLine>
            <SummaryLine label={t('analyst.approval.dueDate')}>
              {typeof values.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(values.dueDate)
                ? formatIsoDate(values.dueDate, intlLocale)
                : '—'}
            </SummaryLine>
            <SummaryLine label={t('analyst.approval.direction')}>
              {values.direction === 'inflow' ? t('analyst.approval.inflow') : t('analyst.approval.outflow')}
            </SummaryLine>
            <SummaryLine label={t('analyst.approval.category')}>
              {String(values.categoryName ?? t('analyst.approval.unassigned'))}
            </SummaryLine>
            <SummaryLine label={t('analyst.approval.createLinkedMoneyBox')}>
              {values.createMoneyBox ? t('analyst.approval.yes') : t('analyst.approval.no')}
            </SummaryLine>
            {values.recurrenceInterval ? (
              <SummaryLine label={t('analyst.approval.recurrence')}>
                {t('analyst.approval.every', {
                  count: typeof values.recurrenceIntervalCount === 'number' ? values.recurrenceIntervalCount : 1,
                  interval: recurrenceInterval,
                })}
              </SummaryLine>
            ) : null}
            <SummaryLine label={t('analyst.approval.account')}>
              {String(values.accountName ?? t('analyst.approval.unassigned'))}
            </SummaryLine>
          </>
        ) : null}
      </dl>
      <ConfirmationActions>
        <ConfirmationAction disabled={disabled} onClick={() => onRespond(true)}>
          {disabled ? <Spinner /> : null}
          {t('analyst.approval.approve')}
        </ConfirmationAction>
        <ConfirmationAction disabled={disabled} variant="outline" onClick={() => onRespond(false)}>
          {t('analyst.approval.deny')}
        </ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  );
}
