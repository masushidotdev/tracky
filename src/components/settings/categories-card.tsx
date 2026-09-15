import * as React from 'react';
import { useMutation, useQuery } from 'convex/react';
import { PencilIcon, PlusIcon, TagsIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';
import type { CategoryEditorValues } from '@/components/categories/category-editor-dialog';
import { CategoryEditorDialog } from '@/components/categories/category-editor-dialog';
import { CategoryIcon } from '@/components/categories/category-icon';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryApplicableKinds, categoryKindDisplayName } from '@/lib/categories';
import { useI18n } from '@/lib/i18n';

export function CategoriesCard() {
  const { t } = useI18n();
  const categories = useQuery(api.banking.categories.listCustomCategories, { limit: 200 });
  const createCategory = useMutation(api.banking.categories.createCategory);
  const updateCategory = useMutation(api.banking.categories.updateCategory);
  const deleteCategory = useMutation(api.banking.categories.deleteCategory);
  const [editorCategory, setEditorCategory] = React.useState<Doc<'categories'> | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const openCreate = () => {
    setEditorCategory(null);
    setEditorOpen(true);
  };

  const openEdit = (category: Doc<'categories'>) => {
    setEditorCategory(category);
    setEditorOpen(true);
  };

  const save = async (values: CategoryEditorValues) => {
    setSaving(true);
    try {
      if (editorCategory) {
        await updateCategory({ categoryId: editorCategory._id, ...values });
        toast.success(t('settings.categories.updated'));
      } else {
        await createCategory(values);
        toast.success(t('settings.categories.created'));
      }
      setEditorOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.categories.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (category: Doc<'categories'>) => {
    setDeletingId(category._id);
    try {
      await deleteCategory({ categoryId: category._id });
      toast.success(t('settings.categories.deleted'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.categories.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.categories.title')}</CardTitle>
          <CardDescription>{t('settings.categories.description')}</CardDescription>
          <CardAction>
            <Button type="button" size="sm" onClick={openCreate}>
              <PlusIcon data-icon="inline-start" />
              {t('settings.categories.add')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {categories === undefined ? (
            <div className="flex flex-col gap-3" aria-label={t('settings.loading')}>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : categories.length === 0 ? (
            <EmptyState
              icon={TagsIcon}
              title={t('settings.categories.empty')}
              hint={t('settings.categories.emptyHint')}
              action={
                <Button type="button" size="sm" onClick={openCreate}>
                  <PlusIcon data-icon="inline-start" />
                  {t('settings.categories.add')}
                </Button>
              }
            />
          ) : (
            <ItemGroup>
              {categories.map((category) => (
                <Item key={category._id} variant="outline" size="sm">
                  <ItemMedia>
                    <CategoryIcon category={category} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{category.name}</ItemTitle>
                    <div className="flex flex-wrap gap-1.5">
                      {categoryApplicableKinds(category).map((kind) => (
                        <Badge key={kind} variant="secondary">
                          {categoryKindDisplayName(kind, t)}
                        </Badge>
                      ))}
                    </div>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => openEdit(category)}
                      aria-label={t('settings.categories.edit')}
                    >
                      <PencilIcon />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={deletingId !== null}
                          aria-label={t('settings.categories.delete')}
                        >
                          <Trash2Icon />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('settings.categories.deleteTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('settings.categories.deleteDescription', { name: category.name })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => void remove(category)}>
                            {t('settings.categories.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>

      {editorOpen ? (
        <CategoryEditorDialog
          key={editorCategory?._id ?? 'new-category'}
          category={editorCategory}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSave={save}
          saving={saving}
        />
      ) : null}
    </>
  );
}
