import * as React from 'react';
import { useMutation } from 'convex/react';
import { FolderInputIcon, PlusIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanCategory, PlanGroup } from './types';
import { EmptyState } from '@/components/app/empty-state';
import { CategoryIcon } from '@/components/categories/category-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';

type Destination = 'existing' | 'new';

export function PlanAddCategoryDialog({
  categories,
  groups,
  initialGroupId,
  onOpenChange,
  open,
  planId,
}: {
  categories: Array<PlanCategory>;
  groups: Array<PlanGroup>;
  initialGroupId?: Id<'planGroups'>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  planId: Id<'plans'>;
}) {
  const { t } = useI18n();
  const mapCategoriesToBucket = useMutation(api.banking.plan.mapCategoriesToBucket);
  const createBucket = useMutation(api.banking.plan.createBucket);
  const pendingAction = usePendingAction();
  const buckets = React.useMemo(() => groups.flatMap((group) => group.buckets), [groups]);
  const [categoryId, setCategoryId] = React.useState<Id<'categories'> | null>(null);
  const [destination, setDestination] = React.useState<Destination>('existing');
  const [bucketId, setBucketId] = React.useState<Id<'planBuckets'> | null>(null);
  const [groupId, setGroupId] = React.useState<Id<'planGroups'> | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setCategoryId(categories[0]?._id ?? null);
    setDestination(buckets.length > 0 ? 'existing' : 'new');
    setBucketId(buckets.at(0)?.bucketId ?? null);
    const initialGroup = groups.find((group) => group.groupId === initialGroupId) ?? groups.at(0);
    setGroupId(initialGroup?.groupId ?? null);
  }, [buckets, categories, groups, initialGroupId, open]);

  const selectedCategory = categories.find((category) => category._id === categoryId) ?? null;
  const selectedBucket = buckets.find((bucket) => bucket.bucketId === bucketId) ?? null;
  const pending = pendingAction.isPending('addCategory');
  const canSubmit =
    selectedCategory !== null &&
    (destination === 'existing' ? selectedBucket !== null : groupId !== null);

  async function submit() {
    if (!selectedCategory || !canSubmit) return;
    const succeeded = await pendingAction.run(
      'addCategory',
      async () => {
        if (destination === 'existing') {
          if (!selectedBucket) return;
          await mapCategoriesToBucket({
            bucketId: selectedBucket.bucketId,
            categoryIds: [...new Set([...selectedBucket.categoryIds, selectedCategory._id])],
          });
          return;
        }
        if (!groupId) return;
        await createBucket({ planId, groupId, categoryId: selectedCategory._id });
      },
      { success: t('plan.addCategory.success'), error: t('plan.addCategory.failed') },
    );
    if (succeeded) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('plan.addCategory.title')}</DialogTitle>
          <DialogDescription>{t('plan.addCategory.description')}</DialogDescription>
        </DialogHeader>
        {categories.length === 0 ? (
          <EmptyState
            className="min-h-52"
            icon={FolderInputIcon}
            title={t('plan.addCategory.empty')}
            hint={t('plan.addCategory.emptyHint')}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <label htmlFor="plan-add-category-category" className="text-sm font-medium">
                {t('plan.addCategory.category')}
              </label>
              <Select value={categoryId ?? ''} onValueChange={(value) => setCategoryId(value as Id<'categories'>)}>
                <SelectTrigger id="plan-add-category-category" className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category._id} value={category._id} textValue={category.name}>
                      <CategoryIcon category={category} className="size-6 [&_svg]:size-3" />
                      <span className="truncate">{category.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="plan-add-category-destination" className="text-sm font-medium">
                {t('plan.addCategory.destination')}
              </label>
              <Select value={destination} onValueChange={(value) => setDestination(value as Destination)}>
                <SelectTrigger id="plan-add-category-destination" className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {buckets.length > 0 ? (
                    <SelectItem value="existing">{t('plan.addCategory.destination.existing')}</SelectItem>
                  ) : null}
                  <SelectItem value="new">{t('plan.addCategory.destination.new')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {destination === 'existing' ? (
              <div>
                <label htmlFor="plan-add-category-bucket" className="text-sm font-medium">
                  {t('plan.addCategory.bucket')}
                </label>
                <Select value={bucketId ?? ''} onValueChange={(value) => setBucketId(value as Id<'planBuckets'>)}>
                  <SelectTrigger id="plan-add-category-bucket" className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.flatMap((group) =>
                      group.buckets.map((bucket) => (
                        <SelectItem key={bucket.bucketId} value={bucket.bucketId}>
                          {group.name} · {bucket.name}
                        </SelectItem>
                      )),
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <label htmlFor="plan-add-category-group" className="text-sm font-medium">
                  {t('plan.addCategory.group')}
                </label>
                <Select value={groupId ?? ''} onValueChange={(value) => setGroupId(value as Id<'planGroups'>)}>
                  <SelectTrigger id="plan-add-category-group" className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.groupId} value={group.groupId}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {categories.length > 0 ? (
            <Button type="button" disabled={pending || !canSubmit} onClick={() => void submit()}>
              {pending ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
              {t('plan.addCategory.confirm')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
