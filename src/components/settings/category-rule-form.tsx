import * as React from 'react';
import type { FunctionReturnType } from 'convex/server';

import type { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { TagPicker } from '@/components/banking/transactions/tag-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { categoryDisplayName } from '@/lib/categories';
import { useI18n } from '@/lib/i18n';

type Category = FunctionReturnType<typeof api.banking.categories.listCategories>[number];
type CategoryRule = FunctionReturnType<typeof api.banking.categoryRules.listRules>[number];

export type CategoryRuleFormValues = {
  matchField: 'merchant' | 'description';
  matchType: 'contains' | 'equals' | 'prefix';
  pattern: string;
  categoryId: string;
  addTagIds: Array<Id<'transactionTags'>>;
  hideFromReports: boolean;
};

function initialValues(rule?: CategoryRule | null): CategoryRuleFormValues {
  return {
    matchField: rule?.matchField ?? 'merchant',
    matchType: rule?.matchType ?? 'contains',
    pattern: rule?.pattern ?? '',
    categoryId: rule?.categoryId ?? '',
    addTagIds: rule?.addTagIds ?? [],
    hideFromReports: rule?.hideFromReports ?? false,
  };
}

export function CategoryRuleForm({
  categories,
  onOpenChange,
  onSubmit,
  open,
  pending,
  rule,
  tags,
}: {
  categories: Array<Category> | undefined;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CategoryRuleFormValues) => Promise<boolean>;
  open: boolean;
  pending: boolean;
  rule?: CategoryRule | null;
  tags: Array<Doc<'transactionTags'>> | undefined;
}) {
  const { t } = useI18n();
  const [values, setValues] = React.useState<CategoryRuleFormValues>(() => initialValues(rule));

  React.useEffect(() => {
    setValues(initialValues(open ? rule : null));
  }, [open, rule]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onSubmit(values)) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(rule ? 'settings.categoryRules.editTitle' : 'settings.categoryRules.title')}
          </DialogTitle>
          <DialogDescription>{t('settings.categoryRules.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t('settings.categoryRules.matchField')}</FieldLabel>
                <Select
                  value={values.matchField}
                  onValueChange={(matchField) =>
                    setValues((current) => ({
                      ...current,
                      matchField: matchField as CategoryRuleFormValues['matchField'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="merchant">{t('settings.categoryRules.matchField.merchant')}</SelectItem>
                      <SelectItem value="description">{t('settings.categoryRules.matchField.description')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('settings.categoryRules.matchType')}</FieldLabel>
                <Select
                  value={values.matchType}
                  onValueChange={(matchType) =>
                    setValues((current) => ({
                      ...current,
                      matchType: matchType as CategoryRuleFormValues['matchType'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="contains">{t('settings.categoryRules.matchType.contains')}</SelectItem>
                      <SelectItem value="equals">{t('settings.categoryRules.matchType.equals')}</SelectItem>
                      <SelectItem value="prefix">{t('settings.categoryRules.matchType.prefix')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="rulePattern">{t('settings.categoryRules.pattern')}</FieldLabel>
              <Input
                id="rulePattern"
                value={values.pattern}
                onChange={(event) => setValues((current) => ({ ...current, pattern: event.target.value }))}
                placeholder={t('settings.categoryRules.patternPlaceholder')}
              />
            </Field>
            <Field>
              <FieldLabel>{t('settings.categoryRules.category')}</FieldLabel>
              <Select
                value={values.categoryId}
                onValueChange={(categoryId) => setValues((current) => ({ ...current, categoryId }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.categoryRules.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {categories?.map((category) => (
                      <SelectItem key={category._id} value={category._id}>
                        {categoryDisplayName(category, t)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
              <div>
                <h3 className="text-sm font-medium">{t('settings.categoryRules.alsoApply')}</h3>
                <p className="text-xs text-muted-foreground">{t('settings.categoryRules.alsoApplyDescription')}</p>
              </div>
              <Field>
                <FieldLabel>{t('settings.categoryRules.tags')}</FieldLabel>
                <TagPicker
                  allowCreate={false}
                  tags={tags}
                  selectedTagIds={values.addTagIds}
                  maxSelected={10}
                  onChange={(addTagIds) => setValues((current) => ({ ...current, addTagIds }))}
                />
                <FieldDescription>{t('settings.categoryRules.tagsDescription')}</FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <div className="flex-1">
                  <FieldTitle>{t('settings.categoryRules.hideFromReports')}</FieldTitle>
                  <FieldDescription>{t('settings.categoryRules.hideFromReportsDescription')}</FieldDescription>
                </div>
                <Switch
                  checked={values.hideFromReports}
                  aria-label={t('settings.categoryRules.hideFromReports')}
                  onCheckedChange={(hideFromReports) => setValues((current) => ({ ...current, hideFromReports }))}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || !values.pattern.trim() || !values.categoryId}>
                {pending && <Spinner data-icon="inline-start" />}
                {pending
                  ? t('common.loading')
                  : t(rule ? 'settings.categoryRules.saveChanges' : 'settings.categoryRules.create')}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
