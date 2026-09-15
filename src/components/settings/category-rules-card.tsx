import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ListChecksIcon, ListPlusIcon, PencilIcon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import { CategoryRuleForm } from './category-rule-form';
import type { Id } from '../../../convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';
import type { CategoryRuleFormValues } from './category-rule-form';
import type { TranslationKey } from '@/lib/i18n';
import { EmptyState } from '@/components/app/empty-state';
import { ListSkeleton } from '@/components/app/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { categoryDisplayName } from '@/lib/categories';
import { useI18n } from '@/lib/i18n';

type CategoryRule = FunctionReturnType<typeof api.banking.categoryRules.listRules>[number];

function ruleMatchFieldKey(value: 'merchant' | 'description'): TranslationKey {
  return `settings.categoryRules.matchField.${value}`;
}

function ruleMatchTypeKey(value: 'contains' | 'equals' | 'prefix'): TranslationKey {
  return `settings.categoryRules.matchType.${value}`;
}

export function CategoryRulesCard() {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<CategoryRule | null>(null);
  const categories = useQuery(api.banking.categories.listCategories, { kind: 'expense', limit: 200 });
  const categoryRules = useQuery(api.banking.categoryRules.listRules, { limit: 100 });
  const tags = useQuery(api.banking.transactionMeta.listTags, {});
  const createRule = useMutation(api.banking.categoryRules.createRule);
  const updateRule = useMutation(api.banking.categoryRules.updateRule);
  const setRuleEnabled = useMutation(api.banking.categoryRules.setRuleEnabled);
  const updateRulePriority = useMutation(api.banking.categoryRules.updateRulePriority);
  const deleteRule = useMutation(api.banking.categoryRules.deleteRule);
  const applyRuleToExisting = useMutation(api.banking.categoryRules.applyRuleToExisting);
  const pendingAction = usePendingAction();

  async function saveRule(values: CategoryRuleFormValues) {
    if (!values.categoryId) return false;

    const pendingKey = editingRule ? `update:${editingRule._id}` : 'create';
    return pendingAction.run(
      pendingKey,
      async () => {
        const input = {
          matchField: values.matchField,
          matchType: values.matchType,
          pattern: values.pattern,
          categoryId: values.categoryId as Id<'categories'>,
        };
        if (editingRule) {
          await updateRule({
            ruleId: editingRule._id,
            ...input,
            addTagIds: values.addTagIds,
            hideFromReports: values.hideFromReports,
          });
        } else {
          await createRule({
            ...input,
            addTagIds: values.addTagIds.length > 0 ? values.addTagIds : undefined,
            hideFromReports: values.hideFromReports ? true : undefined,
          });
        }
      },
      {
        success: editingRule ? t('settings.categoryRules.updated') : t('settings.categoryRules.created'),
        error: editingRule ? t('settings.categoryRules.updateFailed') : t('settings.categoryRules.createFailed'),
      },
    );
  }

  async function applyRule(ruleId: Id<'categoryRules'>) {
    await pendingAction.run(
      `apply:${ruleId}`,
      async () => {
        const result = await applyRuleToExisting({ ruleId, limit: 100 });
        toast.success(t('settings.categoryRules.applied', { count: result.applied }));
      },
      { error: t('settings.categoryRules.applyFailed') },
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.categoryRules.title')}</CardTitle>
          <CardDescription>{t('settings.categoryRules.description')}</CardDescription>
          <CardAction>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditingRule(null);
                setDialogOpen(true);
              }}
            >
              <ListPlusIcon data-icon="inline-start" />
              {t('settings.categoryRules.create')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {categoryRules === undefined && <ListSkeleton rows={3} />}
          {categoryRules?.length === 0 && (
            <EmptyState className="border" icon={ListChecksIcon} title={t('settings.categoryRules.empty')} />
          )}
          {categoryRules && categoryRules.length > 0 ? (
            <div className="divide-y divide-border/60 rounded-md border">
              {categoryRules.map((rule) => (
                <div key={rule._id} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {/* flex-1 with a basis lets the summary truncate instead of sizing to its own
                        content: without it a long merchant pushed the controls onto a second line
                        and left the row misaligned with its neighbours. */}
                    <label className="flex min-w-0 flex-1 basis-64 items-start gap-2 text-sm">
                      <Checkbox
                        checked={rule.enabled}
                        disabled={pendingAction.isPending(`toggle:${rule._id}`)}
                        onCheckedChange={(checked) => {
                          void pendingAction.run(
                            `toggle:${rule._id}`,
                            async () => {
                              await setRuleEnabled({ ruleId: rule._id, enabled: Boolean(checked) });
                            },
                            { error: t('settings.categoryRules.updateFailed') },
                          );
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {t('settings.categoryRules.ruleSummary', {
                            field: t(ruleMatchFieldKey(rule.matchField)),
                            type: t(ruleMatchTypeKey(rule.matchType)),
                            pattern: rule.pattern,
                          })}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {rule.category
                            ? categoryDisplayName(rule.category, t)
                            : t('settings.categoryRules.missingCategory')}
                        </span>
                      </span>
                    </label>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Input
                        className="h-8 w-24"
                        type="number"
                        defaultValue={rule.priority}
                        disabled={pendingAction.isPending(`priority:${rule._id}`)}
                        aria-label={t('settings.categoryRules.priority')}
                        onBlur={(event) => {
                          const priority = Number(event.target.value);
                          if (Number.isFinite(priority) && priority !== rule.priority) {
                            void pendingAction.run(
                              `priority:${rule._id}`,
                              async () => {
                                await updateRulePriority({ ruleId: rule._id, priority });
                              },
                              { error: t('settings.categoryRules.updateFailed') },
                            );
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingRule(rule);
                          setDialogOpen(true);
                        }}
                      >
                        <PencilIcon data-icon="inline-start" />
                        {t('settings.categoryRules.edit')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pendingAction.isPending(`apply:${rule._id}`)}
                        onClick={() => void applyRule(rule._id)}
                      >
                        {pendingAction.isPending(`apply:${rule._id}`) && <Spinner data-icon="inline-start" />}
                        {t('settings.categoryRules.apply')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pendingAction.isPending(`delete:${rule._id}`)}
                        onClick={() => {
                          void pendingAction.run(
                            `delete:${rule._id}`,
                            async () => {
                              await deleteRule({ ruleId: rule._id });
                            },
                            {
                              success: t('settings.categoryRules.deleted'),
                              error: t('settings.categoryRules.deleteFailed'),
                            },
                          );
                        }}
                      >
                        {pendingAction.isPending(`delete:${rule._id}`) && <Spinner data-icon="inline-start" />}
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <CategoryRuleForm
        categories={categories}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingRule(null);
        }}
        onSubmit={saveRule}
        open={dialogOpen}
        pending={pendingAction.isPending(editingRule ? `update:${editingRule._id}` : 'create')}
        rule={editingRule}
        tags={tags}
      />
    </>
  );
}
