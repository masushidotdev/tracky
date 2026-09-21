import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { SaveIcon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { useI18n } from '@/lib/i18n';

const LEAD_DAY_OPTIONS = [0, 1, 3, 7, 14, 30] as const;

type NotificationPreferences = {
  billReminderLeadDays: Array<number>;
  emailEnabled: boolean;
  telegramEnabled: boolean;
};

export function NotificationPreferencesCard() {
  const { t } = useI18n();
  const settings = useQuery(api.userSettings.getMySettings, {});

  if (settings === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.notifications.title')}</CardTitle>
          <CardDescription>{t('settings.notifications.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3" aria-label={t('settings.loading')}>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const key = `${settings.updatedAtMs ?? 'default'}:${settings.notifications.billReminderLeadDays.join(',')}`;
  return <NotificationPreferencesEditor key={key} initial={settings.notifications} />;
}

function NotificationPreferencesEditor({ initial }: { initial: NotificationPreferences }) {
  const { t } = useI18n();
  const updatePreferences = useMutation(api.userSettings.updateNotificationPreferences).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.userSettings.getMySettings, {});
      if (current) {
        localStore.setQuery(api.userSettings.getMySettings, {}, {
          ...current,
          notifications: {
            billReminderLeadDays: args.billReminderLeadDays,
            emailEnabled: args.emailEnabled,
            telegramEnabled: args.telegramEnabled,
          },
        });
      }
    },
  );
  const [leadDays, setLeadDays] = React.useState<Array<number>>(() => initial.billReminderLeadDays);
  const [emailEnabled, setEmailEnabled] = React.useState(initial.emailEnabled);
  const [telegramEnabled, setTelegramEnabled] = React.useState(initial.telegramEnabled);
  const [customLeadDay, setCustomLeadDay] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const parsedCustomLeadDay = Number(customLeadDay);
  const customLeadDayIsValid =
    customLeadDay !== '' &&
    Number.isInteger(parsedCustomLeadDay) &&
    parsedCustomLeadDay >= 0 &&
    parsedCustomLeadDay <= 30 &&
    !leadDays.includes(parsedCustomLeadDay) &&
    leadDays.length < 4;
  const visibleLeadDayOptions = [...new Set([...LEAD_DAY_OPTIONS, ...leadDays])].sort((left, right) => left - right);

  const save = async () => {
    setSaving(true);
    try {
      await updatePreferences({ billReminderLeadDays: leadDays, emailEnabled, telegramEnabled });
      // Channel toggles only — no addresses or chat ids.
      trackEvent(analyticsEvents.notificationPrefsUpdated, { email: emailEnabled, telegram: telegramEnabled });
      toast.success(t('settings.notifications.saved'));
    } catch {
      toast.error(t('settings.notifications.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.notifications.title')}</CardTitle>
        <CardDescription>{t('settings.notifications.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldTitle>{t('settings.notifications.leadDays')}</FieldTitle>
            <FieldDescription>{t('settings.notifications.leadDaysHint')}</FieldDescription>
            <ToggleGroup
              type="multiple"
              variant="outline"
              value={leadDays.map(String)}
              onValueChange={(values) => {
                if (values.length <= 4) setLeadDays(values.map(Number).sort((left, right) => left - right));
              }}
              aria-label={t('settings.notifications.leadDays')}
              className="flex-wrap"
            >
              {visibleLeadDayOptions.map((day) => {
                const selected = leadDays.includes(day);
                return (
                  <ToggleGroupItem key={day} value={String(day)} disabled={!selected && leadDays.length >= 4}>
                    {day === 0 ? t('settings.notifications.sameDay') : t('settings.notifications.daysBefore', { count: day })}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={0}
                max={30}
                step={1}
                value={customLeadDay}
                onChange={(event) => setCustomLeadDay(event.target.value)}
                className="w-28"
                aria-label={t('settings.notifications.customDay')}
                placeholder={t('settings.notifications.customDay')}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!customLeadDayIsValid}
                onClick={() => {
                  setLeadDays((current) => [...current, parsedCustomLeadDay].sort((left, right) => left - right));
                  setCustomLeadDay('');
                }}
              >
                {t('settings.notifications.addDay')}
              </Button>
            </div>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="settings-email-notifications">{t('settings.notifications.email')}</FieldLabel>
              <FieldDescription>{t('settings.notifications.emailHint')}</FieldDescription>
            </FieldContent>
            <Switch
              id="settings-email-notifications"
              checked={emailEnabled}
              onCheckedChange={setEmailEnabled}
              disabled={saving}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="settings-telegram-notifications">{t('settings.notifications.telegram')}</FieldLabel>
              <FieldDescription>{t('settings.notifications.telegramHint')}</FieldDescription>
            </FieldContent>
            <Switch
              id="settings-telegram-notifications"
              checked={telegramEnabled}
              onCheckedChange={setTelegramEnabled}
              disabled={saving}
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end border-t">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : <SaveIcon data-icon="inline-start" />}
          {saving ? t('settings.notifications.saving') : t('settings.notifications.save')}
        </Button>
      </CardFooter>
    </Card>
  );
}
