import * as React from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import * as z from 'zod';

import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import type { TranslationKey } from '@/lib/i18n';
import { ButtonGroup } from '@/components/ui/button-group';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePickerInput } from '@/components/date-picker-input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupText, InputGroupTextarea } from '@/components/ui/input-group';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { accountLabel } from '@/lib/accounts';
import { analyticsEvents, trackEvent } from '@/lib/analytics/events';
import { todayIso } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

const currencies = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
] as const;

const intervals = [
  { value: 'day', labelKey: 'subscriptions.form.interval.day' },
  { value: 'week', labelKey: 'subscriptions.form.interval.week' },
  { value: 'month', labelKey: 'subscriptions.form.interval.month' },
  { value: 'year', labelKey: 'subscriptions.form.interval.year' },
] as const;

type SubscriptionInterval = (typeof intervals)[number]['value'];

const formSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  accountId: z.string(),
  price: z.number().min(0),
  currency: z.string().min(1),
  interval: z.union([z.literal('day'), z.literal('week'), z.literal('month'), z.literal('year')]),
  intervalCount: z.number().min(1),
  startDate: z.string(),
  trialPeriodDays: z.number().min(0),
});

type Account = Doc<'financialAccounts'>;

export function CreateSubForm() {
  const { intlLocale, t } = useI18n();
  const createSubscription = useMutation(api.subscriptions.createSubscription);
  const accounts = useQuery(api.banking.accounts.listAccounts, { limit: 100 });

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      accountId: 'none',
      price: 0,
      currency: 'EUR',
      interval: 'month' as SubscriptionInterval,
      intervalCount: 1,
      startDate: todayIso(),
      trialPeriodDays: 0,
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const subscriptionId = await createSubscription({
          ...value,
          accountId: value.accountId === 'none' ? null : (value.accountId as Id<'financialAccounts'>),
        });
        if (subscriptionId) {
          toast.success(t('subscriptions.form.created'));
          trackEvent(analyticsEvents.subscriptionCreated, { interval: value.interval, surface: 'subscriptions' });
          form.reset();
        } else {
          toast.error(t('subscriptions.form.createFailed'));
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('subscriptions.form.createFailed'));
      }
    },
  });

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('subscriptions.form.title')}</CardTitle>
        <CardDescription>{t('subscriptions.form.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="create-subscription-form"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field
              name="name"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>{t('common.name')}</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
                      placeholder={t('subscriptions.form.namePlaceholder')}
                      autoComplete="off"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            />
            <form.Field
              name="description"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>{t('subscriptions.form.descriptionLabel')}</FieldLabel>
                    <InputGroup>
                      <InputGroupTextarea
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder={t('subscriptions.form.descriptionPlaceholder')}
                        rows={5}
                        className="min-h-24 resize-none"
                        aria-invalid={isInvalid}
                      />
                      <InputGroupAddon align="block-end">
                        <InputGroupText className="tabular-nums">
                          {t('subscriptions.form.characters', { count: field.state.value.length, max: 100 })}
                        </InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldDescription>{t('subscriptions.form.descriptionHelp')}</FieldDescription>
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            />
            <form.Field
              name="accountId"
              children={(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>{t('subscriptions.account.label')}</FieldLabel>
                  <Select value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue placeholder={t('subscriptions.account.placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">{t('subscriptions.noDebitAccount')}</SelectItem>
                        {(accounts ?? []).map((account) => (
                          <SelectItem key={account._id} value={account._id}>
                            {accountLabel(account)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>{t('subscriptions.account.help')}</FieldDescription>
                </Field>
              )}
            />
            <Field>
              <FieldLabel htmlFor="price">{t('subscriptions.form.price')}</FieldLabel>
              <ButtonGroup>
                <form.Field
                  name="currency"
                  children={(field) => (
                    <Select value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
                      <SelectTrigger className="font-mono">
                        <SelectValue>{field.state.value}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="min-w-24">
                        <SelectGroup>
                          {currencies.map((currency) => (
                            <SelectItem key={currency.value} value={currency.value}>
                              {currency.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
                <form.Field
                  name="price"
                  children={(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid}>
                        <Input
                          type="number"
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value ? Number(event.target.value) : 0)}
                          aria-invalid={isInvalid}
                          placeholder="9.99"
                          autoComplete="off"
                          step="0.01"
                          className="rounded-s-none"
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    );
                  }}
                />
              </ButtonGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="intervalCount">{t('subscriptions.form.interval')}</FieldLabel>
              <ButtonGroup>
                <form.Field
                  name="intervalCount"
                  children={(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid}>
                        <Input
                          type="number"
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value ? Number(event.target.value) : 1)}
                          aria-invalid={isInvalid}
                          placeholder="1"
                          autoComplete="off"
                          className="rounded-e-none"
                          step="1"
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    );
                  }}
                />
                <form.Field
                  name="interval"
                  children={(field) => (
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => field.handleChange(value as SubscriptionInterval)}
                    >
                      <SelectTrigger className="font-mono">
                        <SelectValue>
                          {t(
                            intervals.find((interval) => interval.value === field.state.value)
                              ?.labelKey as TranslationKey,
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="min-w-24">
                        <SelectGroup>
                          {intervals.map((interval) => (
                            <SelectItem key={interval.value} value={interval.value}>
                              {t(interval.labelKey as TranslationKey)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
              </ButtonGroup>
            </Field>
            <form.Field
              name="startDate"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <DatePickerInput
                    isInvalid={isInvalid}
                    errors={field.state.meta.errors}
                    id={field.name}
                    label={t('subscriptions.form.startDate')}
                    locale={intlLocale}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(date) => {
                      if (date) {
                        field.handleChange(date.toISOString().slice(0, 10));
                      }
                    }}
                    aria-invalid={isInvalid}
                    placeholder={t('subscriptions.form.startDatePlaceholder')}
                    selectDateLabel={t('subscriptions.form.selectDate')}
                    autoComplete="off"
                  />
                );
              }}
            />
            <form.Field
              name="trialPeriodDays"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>{t('subscriptions.form.trialDays')}</FieldLabel>
                    <Input
                      type="number"
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value ? Number(event.target.value) : 0)}
                      aria-invalid={isInvalid}
                      placeholder="0"
                      autoComplete="off"
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Field orientation="horizontal">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            {t('subscriptions.form.reset')}
          </Button>
          <Button type="submit" form="create-subscription-form">
            {t('subscriptions.form.submit')}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  );
}
