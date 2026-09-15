import { ChevronLeftIcon, ChevronRightIcon, Settings2Icon } from 'lucide-react';
import { clampDayOfMonth, dayOfMonthFromIsoDate } from './helpers';
import type { CycleInterval } from './helpers';
import type * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useI18n } from '@/lib/i18n';

export function CycleHeader({
  cycleOffset,
  cycleWindow,
  isPreferencePending,
  onCurrentCycle,
  onNextCycle,
  onPreferenceAnchorDateChange,
  onPreferenceIntervalChange,
  onPreferenceIntervalCountChange,
  onPreferencesOpenChange,
  onPreviousCycle,
  onSavePreference,
  preferenceAnchorDate,
  preferenceInterval,
  preferenceIntervalCount,
  preferencesOpen,
}: {
  cycleOffset: number;
  cycleWindow: string;
  isPreferencePending: boolean;
  onCurrentCycle: () => void;
  onNextCycle: () => void;
  onPreferenceAnchorDateChange: (value: string) => void;
  onPreferenceIntervalChange: (value: CycleInterval) => void;
  onPreferenceIntervalCountChange: (value: number) => void;
  onPreferencesOpenChange: (open: boolean) => void;
  onPreviousCycle: () => void;
  onSavePreference: (event: React.FormEvent<HTMLFormElement>) => void;
  preferenceAnchorDate: string;
  preferenceInterval: CycleInterval;
  preferenceIntervalCount: number;
  preferencesOpen: boolean;
}) {
  const { t } = useI18n();

  return (
    <>
      <Dialog open={preferencesOpen} onOpenChange={onPreferencesOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('planning.preferences.title')}</DialogTitle>
            <DialogDescription>{t('planning.preferences.description')}</DialogDescription>
          </DialogHeader>
          <form id="planning-preferences-form" onSubmit={onSavePreference}>
            <FieldGroup>
              <Field>
                <FieldLabel>{t('planning.preferences.frequency')}</FieldLabel>
                <ToggleGroup
                  type="single"
                  value={preferenceInterval}
                  onValueChange={(value) => {
                    if (value) {
                      const nextInterval = value as CycleInterval;
                      onPreferenceIntervalChange(nextInterval);
                      onPreferenceIntervalCountChange(
                        nextInterval === 'month' ? dayOfMonthFromIsoDate(preferenceAnchorDate) : 1,
                      );
                    }
                  }}
                  variant="outline"
                  size="sm"
                  spacing={0}
                  className="flex-wrap justify-start"
                >
                  <ToggleGroupItem value="day">{t('planning.form.interval.day')}</ToggleGroupItem>
                  <ToggleGroupItem value="week">{t('planning.form.interval.week')}</ToggleGroupItem>
                  <ToggleGroupItem value="month">{t('planning.form.interval.month')}</ToggleGroupItem>
                  <ToggleGroupItem value="year">{t('planning.form.interval.year')}</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="planningCycleCount">
                  {preferenceInterval === 'month'
                    ? t('planning.preferences.monthDay')
                    : t('planning.preferences.every')}
                </FieldLabel>
                <Input
                  id="planningCycleCount"
                  type="number"
                  min="1"
                  max={preferenceInterval === 'month' ? 31 : undefined}
                  step="1"
                  value={preferenceIntervalCount}
                  onChange={(event) => {
                    const nextValue = event.target.value ? Number(event.target.value) : 1;
                    onPreferenceIntervalCountChange(
                      preferenceInterval === 'month' ? clampDayOfMonth(nextValue) : nextValue,
                    );
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="planningAnchorDate">{t('planning.preferences.startsOn')}</FieldLabel>
                <Input
                  id="planningAnchorDate"
                  type="date"
                  value={preferenceAnchorDate}
                  onChange={(event) => {
                    onPreferenceAnchorDateChange(event.target.value);
                    if (preferenceInterval === 'month') {
                      onPreferenceIntervalCountChange(dayOfMonthFromIsoDate(event.target.value));
                    }
                  }}
                />
              </Field>
            </FieldGroup>
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPreferencePending}
              onClick={() => onPreferencesOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="planning-preferences-form"
              disabled={
                isPreferencePending ||
                !preferenceAnchorDate ||
                preferenceIntervalCount < 1 ||
                (preferenceInterval === 'month' && preferenceIntervalCount > 31)
              }
            >
              {isPreferencePending ? <Spinner data-icon="inline-start" /> : null}
              {t('planning.preferences.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold">{t('planning.cashflow.title')}</h2>
          <p className="text-sm text-muted-foreground">{cycleWindow}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t('planning.cashflow.previousCycle')}
            onClick={onPreviousCycle}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t('planning.cashflow.nextCycle')}
            onClick={onNextCycle}
          >
            <ChevronRightIcon />
          </Button>
          {cycleOffset !== 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={onCurrentCycle}>
              {t('planning.cashflow.currentCycle')}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => onPreferencesOpenChange(true)}>
            <Settings2Icon data-icon="inline-start" />
            {t('planning.preferences.change')}
          </Button>
        </div>
      </div>
    </>
  );
}
