import * as React from 'react';
import { CalendarHeartIcon, PencilIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';

import type { ForecastLifeEvent, InvalidForecastLifeEvent, StoredForecastLifeEvent } from './forecast-utils';
import { Amount } from '@/components/app/amount';
import { EmptyState } from '@/components/app/empty-state';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';

function eventTiming(event: StoredForecastLifeEvent, t: ReturnType<typeof useI18n>['t']) {
  switch (event.kind) {
    case 'retirement':
    case 'endOfPlan':
      return t('forecast.events.atAge', { age: event.age });
    case 'pension':
      return t('forecast.events.atAge', { age: event.startAge });
    case 'careerBreak':
      return t('forecast.events.yearRange', { start: event.startYear, end: event.endYear });
    case 'otherIncome':
    case 'otherExpense':
      return event.recurring
        ? t('forecast.events.fromYearRecurring', { year: event.startYear, interval: event.recurring.intervalYears })
        : t('forecast.events.inYear', { year: event.startYear });
    default:
      return t('forecast.events.inYear', { year: event.year });
  }
}

function eventAmount(event: StoredForecastLifeEvent) {
  switch (event.kind) {
    case 'retirement':
      return event.extraYearlyExpenses;
    case 'pension':
      return event.monthlyBenefit;
    case 'buyHome':
      return event.price;
    case 'haveKid':
      return event.monthlyCost;
    case 'newJob':
      return event.newMonthlyIncome;
    case 'otherIncome':
    case 'otherExpense':
      return event.amount;
    default:
      return undefined;
  }
}

export function EventsTab({
  events,
  invalidEvents,
  isPending,
  onAdd,
  onDelete,
  onEdit,
  onToggle,
}: {
  events: Array<ForecastLifeEvent>;
  invalidEvents: Array<InvalidForecastLifeEvent>;
  isPending: (key?: string) => boolean;
  onAdd: () => void;
  onDelete: (event: ForecastLifeEvent) => Promise<boolean>;
  onEdit: (event: ForecastLifeEvent) => void;
  onToggle: (event: ForecastLifeEvent, enabled: boolean) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [deleteTarget, setDeleteTarget] = React.useState<ForecastLifeEvent | null>(null);
  const invalidById = new Map(invalidEvents.map((item) => [item.eventId, item.reason]));

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={onAdd}>
          <PlusIcon data-icon="inline-start" />
          {t('forecast.events.add')}
        </Button>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarHeartIcon}
          title={t('forecast.events.emptyTitle')}
          hint={t('forecast.events.emptyHint')}
          action={
            <Button type="button" variant="outline" size="sm" onClick={onAdd}>
              <PlusIcon data-icon="inline-start" />
              {t('forecast.events.add')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2">
          {events.map((item) => {
            const amount = eventAmount(item.event);
            const invalidReason = invalidById.get(item._id);
            const toggleKey = `event:toggle:${item._id}`;
            return (
              <div key={item._id} className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{t(`forecast.events.kind.${item.event.kind}`)}</p>
                    {!item.enabled ? <Badge variant="outline">{t('forecast.events.disabled')}</Badge> : null}
                    {invalidReason ? (
                      <Badge variant="destructive">
                        <TriangleAlertIcon data-icon="inline-start" />
                        {t('forecast.events.invalid')}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{eventTiming(item.event, t)}</span>
                    {amount ? <Amount money={amount} variant="balance" className="text-xs" /> : null}
                  </div>
                  {invalidReason ? <p className="mt-2 text-xs text-destructive">{invalidReason}</p> : null}
                </div>
                <div className="flex items-center justify-end gap-1">
                  <Switch
                    checked={item.enabled}
                    disabled={isPending(toggleKey)}
                    aria-label={t('forecast.events.toggle', { name: t(`forecast.events.kind.${item.event.kind}`) })}
                    onCheckedChange={(enabled) => void onToggle(item, enabled)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('forecast.events.edit')}
                    onClick={() => onEdit(item)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('forecast.events.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('forecast.events.deleteDescription', {
                name: deleteTarget ? t(`forecast.events.kind.${deleteTarget.event.kind}`) : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTarget ? isPending(`event:delete:${deleteTarget._id}`) : false}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteTarget ? isPending(`event:delete:${deleteTarget._id}`) : false}
              onClick={() => {
                if (!deleteTarget) return;
                void onDelete(deleteTarget).then((ok) => ok && setDeleteTarget(null));
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
