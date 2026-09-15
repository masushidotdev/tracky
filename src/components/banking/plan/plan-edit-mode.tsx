import * as React from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EyeIcon, EyeOffIcon, GripVerticalIcon, MoreHorizontalIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { PlanBucket, PlanGroup } from './types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type PlanReorderPayload = {
  groups: Array<{ id: Id<'planGroups'>; sortOrder: number }>;
  buckets: Array<{ id: Id<'planBuckets'>; groupId: Id<'planGroups'>; sortOrder: number }>;
};

export type PlanEditActions = {
  onAdoptCategory?: (groupId: Id<'planGroups'>) => void;
  onCreateBucket: (groupId: Id<'planGroups'>, name: string) => Promise<boolean>;
  onCreateGroup: (name: string) => Promise<boolean>;
  onDeleteBuckets: (bucketIds: Array<Id<'planBuckets'>>) => Promise<boolean>;
  onDeleteGroup: (groupId: Id<'planGroups'>) => Promise<boolean>;
  onHideBuckets: (bucketIds: Array<Id<'planBuckets'>>, hidden: boolean) => Promise<boolean>;
  onRenameBucket: (bucketId: Id<'planBuckets'>, name: string) => Promise<boolean>;
  onRenameGroup: (groupId: Id<'planGroups'>, name: string) => Promise<boolean>;
  onReorder: (payload: PlanReorderPayload) => Promise<boolean>;
};

type EditBucket = { bucketId: Id<'planBuckets'>; name: string; hidden: boolean };
type EditGroup = { groupId: Id<'planGroups'>; name: string; buckets: Array<EditBucket> };
type RenameTarget = { kind: 'group'; id: Id<'planGroups'> } | { kind: 'bucket'; id: Id<'planBuckets'> };

const SORT_ORDER_STEP = 1000;

function toEditGroups(groups: Array<PlanGroup>): Array<EditGroup> {
  return groups.map((group) => ({
    groupId: group.groupId,
    name: group.name,
    buckets: group.buckets.map((bucket: PlanBucket) => ({
      bucketId: bucket.bucketId,
      name: bucket.name,
      hidden: bucket.hidden,
    })),
  }));
}

/** Changes the local mirror only when the server actually changed shape, so a drag is not undone mid-gesture. */
function structureSignature(groups: Array<EditGroup>) {
  return groups
    .map((group) => `${group.groupId}:${group.name}:${group.buckets.map((b) => `${b.bucketId}:${b.name}:${b.hidden}`).join(',')}`)
    .join('|');
}

export function PlanEditMode({
  actions,
  groups,
  pending,
}: {
  actions: PlanEditActions;
  groups: Array<PlanGroup>;
  pending: boolean;
}) {
  const { t } = useI18n();
  const serverGroups = React.useMemo(() => toEditGroups(groups), [groups]);
  const [local, setLocal] = React.useState(serverGroups);
  const serverSignature = structureSignature(serverGroups);
  const lastServerSignature = React.useRef(serverSignature);
  const [selected, setSelected] = React.useState<Set<Id<'planBuckets'>>>(new Set());
  const [renaming, setRenaming] = React.useState<RenameTarget | null>(null);
  const [addingBucketIn, setAddingBucketIn] = React.useState<Id<'planGroups'> | null>(null);
  const [addingGroup, setAddingGroup] = React.useState(false);

  if (lastServerSignature.current !== serverSignature) {
    lastServerSignature.current = serverSignature;
    setLocal(serverGroups);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const groupById = new Map(local.map((group) => [group.groupId, group]));
  const selectedIds = [...selected];

  function locate(bucketId: Id<'planBuckets'>) {
    for (const group of local) {
      const index = group.buckets.findIndex((bucket) => bucket.bucketId === bucketId);
      if (index >= 0) return { group, index };
    }
    return null;
  }

  function commit(next: Array<EditGroup>) {
    setLocal(next);
    void actions.onReorder({
      groups: next.map((group, index) => ({ id: group.groupId, sortOrder: (index + 1) * SORT_ORDER_STEP })),
      buckets: next.flatMap((group) =>
        group.buckets.map((bucket, index) => ({
          id: bucket.bucketId,
          groupId: group.groupId,
          sortOrder: (index + 1) * SORT_ORDER_STEP,
        })),
      ),
    });
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.data.current?.type !== 'bucket') return;
    const overType = over.data.current?.type;
    const targetGroupId =
      overType === 'bucket' ? (over.data.current?.groupId as Id<'planGroups'>) : (over.id as Id<'planGroups'>);

    setLocal((current) => {
      // Positions are recomputed from `current`, never from the render snapshot: dnd-kit fires
      // drag-over many times between renders, so a stale index would move the wrong bucket.
      const next = current.map((group) => ({ ...group, buckets: [...group.buckets] }));
      const from = next.find((group) => group.buckets.some((bucket) => bucket.bucketId === active.id));
      const to = next.find((group) => group.groupId === targetGroupId);
      if (!from || !to || from.groupId === to.groupId) return current;
      const [moved] = from.buckets.splice(
        from.buckets.findIndex((bucket) => bucket.bucketId === active.id),
        1,
      );
      const overIndex =
        overType === 'bucket' ? to.buckets.findIndex((bucket) => bucket.bucketId === over.id) : to.buckets.length;
      to.buckets.splice(overIndex, 0, moved);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    if (active.data.current?.type === 'group') {
      const from = local.findIndex((group) => group.groupId === active.id);
      const to = local.findIndex((group) => group.groupId === over.id);
      if (from < 0 || to < 0 || from === to) return;
      commit(arrayMove(local, from, to));
      return;
    }
    const source = locate(active.id as Id<'planBuckets'>);
    if (!source) return;
    const overIndex = source.group.buckets.findIndex((bucket) => bucket.bucketId === over.id);
    const next =
      overIndex >= 0 && overIndex !== source.index
        ? local.map((group) =>
            group.groupId === source.group.groupId
              ? { ...group, buckets: arrayMove(group.buckets, source.index, overIndex) }
              : group,
          )
        : local;
    commit(next);
  }

  function toggleSelected(bucketId: Id<'planBuckets'>, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(bucketId);
      else next.delete(bucketId);
      return next;
    });
  }

  async function runBulk(action: () => Promise<boolean>) {
    const ok = await action();
    if (ok) setSelected(new Set());
  }

  function moveSelectedTo(groupId: Id<'planGroups'>) {
    const target = groupById.get(groupId);
    if (!target) return;
    const moving = selectedIds.map(locate).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const movingIds = new Set(moving.map((entry) => entry.group.buckets[entry.index].bucketId));
    const next = local.map((group) => ({
      ...group,
      buckets: group.buckets.filter((bucket) => !movingIds.has(bucket.bucketId)),
    }));
    const targetGroup = next.find((group) => group.groupId === groupId);
    if (!targetGroup) return;
    targetGroup.buckets = [...targetGroup.buckets, ...moving.map((entry) => entry.group.buckets[entry.index])];
    commit(next);
    setSelected(new Set());
  }

  return (
    <Card className="min-w-0 lg:min-h-0 lg:flex-1">
      <CardContent className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
        <p className="text-sm text-muted-foreground">{t('plan.edit.hint')}</p>

        {selectedIds.length > 0 ? (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-accent px-3 py-2">
            <span className="text-sm font-medium">{t('plan.edit.selected', { count: selectedIds.length })}</span>
            <Select value="" onValueChange={(value) => moveSelectedTo(value as Id<'planGroups'>)}>
              <SelectTrigger size="sm" className="w-48 bg-background" aria-label={t('plan.edit.moveToGroup')}>
                <SelectValue placeholder={t('plan.edit.moveToGroup')} />
              </SelectTrigger>
              <SelectContent>
                {local.map((group) => (
                  <SelectItem key={group.groupId} value={group.groupId}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void runBulk(() => actions.onHideBuckets(selectedIds, true))}
            >
              <EyeOffIcon data-icon="inline-start" />
              {t('plan.edit.hide')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void runBulk(() => actions.onHideBuckets(selectedIds, false))}
            >
              <EyeIcon data-icon="inline-start" />
              {t('plan.edit.unhide')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void runBulk(() => actions.onDeleteBuckets(selectedIds))}
            >
              <Trash2Icon data-icon="inline-start" />
              {t('plan.edit.delete')}
            </Button>
          </div>
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={local.map((group) => group.groupId)}>
            <ul className="flex flex-col gap-3">
              {local.map((group) => (
                <SortableGroup
                  key={group.groupId}
                  actions={actions}
                  addingBucket={addingBucketIn === group.groupId}
                  group={group}
                  pending={pending}
                  renaming={renaming}
                  selected={selected}
                  onAddBucket={(open) => setAddingBucketIn(open ? group.groupId : null)}
                  onRenaming={setRenaming}
                  onToggleSelected={toggleSelected}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {addingGroup ? (
          <InlineNameForm
            label={t('plan.edit.newGroupName')}
            submitLabel={t('plan.edit.addGroup')}
            pending={pending}
            onCancel={() => setAddingGroup(false)}
            onSubmit={async (name) => {
              const ok = await actions.onCreateGroup(name);
              if (ok) setAddingGroup(false);
              return ok;
            }}
          />
        ) : (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setAddingGroup(true)}>
            <PlusIcon data-icon="inline-start" />
            {t('plan.edit.addGroup')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SortableGroup({
  actions,
  addingBucket,
  group,
  onAddBucket,
  onRenaming,
  onToggleSelected,
  pending,
  renaming,
  selected,
}: {
  actions: PlanEditActions;
  addingBucket: boolean;
  group: EditGroup;
  onAddBucket: (open: boolean) => void;
  onRenaming: (target: RenameTarget | null) => void;
  onToggleSelected: (bucketId: Id<'planBuckets'>, checked: boolean) => void;
  pending: boolean;
  renaming: RenameTarget | null;
  selected: Set<Id<'planBuckets'>>;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.groupId,
    data: { type: 'group' },
  });
  const isRenaming = renaming?.kind === 'group' && renaming.id === group.groupId;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('rounded-2xl border bg-card', isDragging ? 'z-10 opacity-80 shadow-lg' : undefined)}
    >
      <div className="flex min-w-0 items-center gap-2 border-b bg-muted/50 px-2 py-2">
        <DragHandle attributes={attributes} label={t('plan.edit.dragGroup', { name: group.name })} listeners={listeners} />
        {isRenaming ? (
          <InlineNameForm
            defaultValue={group.name}
            label={t('plan.edit.groupName')}
            submitLabel={t('common.save')}
            pending={pending}
            onCancel={() => onRenaming(null)}
            onSubmit={async (name) => {
              const ok = await actions.onRenameGroup(group.groupId, name);
              if (ok) onRenaming(null);
              return ok;
            }}
          />
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {t('plan.inspector.groupBuckets', { count: group.buckets.length })}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t('plan.edit.groupActions')}>
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onRenaming({ kind: 'group', id: group.groupId })}>
                  {t('plan.edit.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddBucket(true)}>{t('plan.edit.createCategory')}</DropdownMenuItem>
                {actions.onAdoptCategory ? (
                  <DropdownMenuItem onSelect={() => actions.onAdoptCategory?.(group.groupId)}>
                    {t('plan.edit.addExistingCategory')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => void actions.onDeleteGroup(group.groupId)}
                >
                  {t('plan.edit.deleteGroup')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <SortableContext items={group.buckets.map((bucket) => bucket.bucketId)}>
        <ul className="flex min-h-10 flex-col">
          {group.buckets.map((bucket) => (
            <SortableBucket
              key={bucket.bucketId}
              actions={actions}
              bucket={bucket}
              groupId={group.groupId}
              pending={pending}
              renaming={renaming?.kind === 'bucket' && renaming.id === bucket.bucketId}
              selected={selected.has(bucket.bucketId)}
              onRenaming={onRenaming}
              onToggleSelected={onToggleSelected}
            />
          ))}
          {group.buckets.length === 0 && !addingBucket ? (
            <li className="px-3 py-3 text-xs text-muted-foreground">{t('plan.edit.emptyGroup')}</li>
          ) : null}
        </ul>
      </SortableContext>

      <div className="border-t px-2 py-2">
        {addingBucket ? (
          <InlineNameForm
            label={t('plan.edit.newBucketName')}
            submitLabel={t('plan.edit.addBucket')}
            pending={pending}
            onCancel={() => onAddBucket(false)}
            onSubmit={async (name) => {
              const ok = await actions.onCreateBucket(group.groupId, name);
              if (ok) onAddBucket(false);
              return ok;
            }}
          />
        ) : actions.onAdoptCategory ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                <PlusIcon data-icon="inline-start" />
                {t('plan.edit.addBucket')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onAddBucket(true)}>{t('plan.edit.createCategory')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.onAdoptCategory?.(group.groupId)}>
                {t('plan.edit.addExistingCategory')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => onAddBucket(true)}>
            <PlusIcon data-icon="inline-start" />
            {t('plan.edit.addBucket')}
          </Button>
        )}
      </div>
    </li>
  );
}

function SortableBucket({
  actions,
  bucket,
  groupId,
  onRenaming,
  onToggleSelected,
  pending,
  renaming,
  selected,
}: {
  actions: PlanEditActions;
  bucket: EditBucket;
  groupId: Id<'planGroups'>;
  onRenaming: (target: RenameTarget | null) => void;
  onToggleSelected: (bucketId: Id<'planBuckets'>, checked: boolean) => void;
  pending: boolean;
  renaming: boolean;
  selected: boolean;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bucket.bucketId,
    data: { type: 'bucket', groupId },
  });
  const checkboxId = `plan-edit-${bucket.bucketId}`;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex min-w-0 items-center gap-2 border-b px-2 py-1.5 last:border-b-0',
        isDragging ? 'z-10 bg-accent shadow-md' : undefined,
      )}
    >
      <DragHandle attributes={attributes} label={t('plan.edit.dragBucket', { name: bucket.name })} listeners={listeners} />
      <Checkbox
        id={checkboxId}
        checked={selected}
        aria-label={t('plan.edit.select', { name: bucket.name })}
        onCheckedChange={(value) => onToggleSelected(bucket.bucketId, value === true)}
      />
      {renaming ? (
        <InlineNameForm
          defaultValue={bucket.name}
          label={t('plan.edit.bucketName')}
          submitLabel={t('common.save')}
          pending={pending}
          onCancel={() => onRenaming(null)}
          onSubmit={async (name) => {
            const ok = await actions.onRenameBucket(bucket.bucketId, name);
            if (ok) onRenaming(null);
            return ok;
          }}
        />
      ) : (
        <>
          <label htmlFor={checkboxId} className="min-w-0 flex-1 truncate text-sm">
            {bucket.name}
          </label>
          {bucket.hidden ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {t('plan.edit.hidden')}
            </span>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t('plan.edit.bucketActions')}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onRenaming({ kind: 'bucket', id: bucket.bucketId })}>
                {t('plan.edit.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void actions.onHideBuckets([bucket.bucketId], !bucket.hidden)}>
                {t(bucket.hidden ? 'plan.edit.unhide' : 'plan.edit.hide')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void actions.onDeleteBuckets([bucket.bucketId])}>
                {t('plan.edit.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  );
}

function DragHandle({
  attributes,
  label,
  listeners,
}: {
  attributes: ReturnType<typeof useSortable>['attributes'];
  label: string;
  listeners: ReturnType<typeof useSortable>['listeners'];
}) {
  return (
    <button
      type="button"
      className="shrink-0 cursor-grab touch-none rounded-lg p-1 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      <GripVerticalIcon className="size-4" />
    </button>
  );
}

function InlineNameForm({
  defaultValue,
  label,
  onCancel,
  onSubmit,
  pending,
  submitLabel,
}: {
  defaultValue?: string;
  label: string;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<boolean>;
  pending: boolean;
  submitLabel: string;
}) {
  const { t } = useI18n();
  const [value, setValue] = React.useState(defaultValue ?? '');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const name = value.trim();
        if (!name) return;
        void onSubmit(name);
      }}
    >
      <Input
        ref={inputRef}
        value={value}
        className="h-8"
        aria-label={label}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <Button type="submit" size="sm" disabled={pending || value.trim().length === 0}>
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </form>
  );
}
