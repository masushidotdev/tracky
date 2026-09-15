import * as React from 'react';
import { useMutation } from 'convex/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { TagBadge } from '@/components/app/tag-badge';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';

const DEFAULT_COLOR = '#64748b';

type TransactionTag = Doc<'transactionTags'>;

function TagEditorRow({
  onDelete,
  onSave,
  pending,
  tag,
}: {
  onDelete: () => void;
  onSave: (values: { color?: string; name: string }) => Promise<void>;
  pending: boolean;
  tag: TransactionTag;
}) {
  const { t } = useI18n();
  const [name, setName] = React.useState(tag.name);
  const [color, setColor] = React.useState(tag.color ?? DEFAULT_COLOR);
  const [useColor, setUseColor] = React.useState(Boolean(tag.color));

  React.useEffect(() => {
    setName(tag.name);
    setColor(tag.color ?? DEFAULT_COLOR);
    setUseColor(Boolean(tag.color));
  }, [tag.color, tag.name]);

  const changed = name.trim() !== tag.name || (useColor ? color : undefined) !== tag.color;

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <TagBadge tag={{ name: name.trim() || tag.name, color: useColor ? color : undefined }} />
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('common.delete')} onClick={onDelete}>
          <Trash2Icon />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Input maxLength={30} value={name} onChange={(event) => setName(event.target.value)} />
        <Input
          type="color"
          value={color}
          disabled={!useColor}
          onChange={(event) => setColor(event.target.value)}
          className="h-9 w-14 cursor-pointer p-1"
          aria-label={t('transactions.tags.color')}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => setUseColor((current) => !current)}>
          {useColor ? t('transactions.tags.useNeutral') : t('transactions.tags.useColor')}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={pending || !changed || !name.trim() || name.trim().length > 30}
          onClick={() => void onSave({ name: name.trim(), color: useColor ? color : undefined })}
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

export function ManageTagsDialog({
  onOpenChange,
  open,
  tags,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  tags: Array<TransactionTag> | undefined;
}) {
  const { t } = useI18n();
  const createTag = useMutation(api.banking.transactionMeta.createTag);
  const renameTag = useMutation(api.banking.transactionMeta.renameTag);
  const setTagColor = useMutation(api.banking.transactionMeta.setTagColor);
  const deleteTag = useMutation(api.banking.transactionMeta.deleteTag);
  const { isPending, run } = usePendingAction();
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState(DEFAULT_COLOR);
  const [useColor, setUseColor] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<TransactionTag | null>(null);

  React.useEffect(() => {
    if (!open) {
      setName('');
      setColor(DEFAULT_COLOR);
      setUseColor(false);
      setDeleteTarget(null);
    }
  }, [open]);

  const create = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const succeeded = await run(
      'manage-tag:create',
      async () => {
        await createTag({ name: trimmedName, color: useColor ? color : undefined });
      },
      { success: t('transactions.tags.created'), error: t('transactions.tags.createFailed') },
    );
    if (succeeded) {
      setName('');
      setUseColor(false);
    }
  };

  const save = async (tag: TransactionTag, values: { color?: string; name: string }) => {
    await run(
      `manage-tag:save:${tag._id}`,
      async () => {
        if (values.name !== tag.name) {
          await renameTag({ tagId: tag._id, name: values.name });
        }
        if (values.color !== tag.color) {
          await setTagColor({ tagId: tag._id, color: values.color });
        }
      },
      { success: t('transactions.tags.updated'), error: t('transactions.tags.updateFailed') },
    );
  };

  const remove = async (tagId: Id<'transactionTags'>) => {
    const succeeded = await run(
      `manage-tag:delete:${tagId}`,
      async () => {
        await deleteTag({ tagId });
      },
      { success: t('transactions.tags.deleted'), error: t('transactions.tags.deleteFailed') },
    );
    if (succeeded) setDeleteTarget(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[min(720px,calc(100vh-2rem))] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('transactions.tags.manageTitle')}</DialogTitle>
            <DialogDescription>{t('transactions.tags.manageDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 rounded-md bg-muted/30 p-3">
            <Field>
              <FieldLabel htmlFor="new-tag-name">{t('transactions.tags.newName')}</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input
                  id="new-tag-name"
                  maxLength={30}
                  value={name}
                  placeholder={t('transactions.tags.namePlaceholder')}
                  onChange={(event) => setName(event.target.value)}
                />
                <Input
                  type="color"
                  value={color}
                  disabled={!useColor}
                  onChange={(event) => setColor(event.target.value)}
                  className="h-9 w-14 cursor-pointer p-1"
                  aria-label={t('transactions.tags.color')}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setUseColor((current) => !current)}>
                  {useColor ? t('transactions.tags.useNeutral') : t('transactions.tags.useColor')}
                </Button>
              </div>
            </Field>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {t('transactions.tags.tagCount', { count: tags?.length ?? 0 })}
              </span>
              <Button
                type="button"
                size="sm"
                disabled={isPending('manage-tag:create') || !name.trim() || name.trim().length > 30 || (tags?.length ?? 0) >= 50}
                onClick={() => void create()}
              >
                {isPending('manage-tag:create') ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
                {t('common.create')}
              </Button>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <div className="grid gap-3">
              {tags === undefined ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
              ) : tags.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t('transactions.tags.empty')}</div>
              ) : (
                tags.map((tag) => (
                  <TagEditorRow
                    key={tag._id}
                    tag={tag}
                    pending={isPending(`manage-tag:save:${tag._id}`)}
                    onDelete={() => setDeleteTarget(tag)}
                    onSave={(values) => save(tag, values)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transactions.tags.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('transactions.tags.deleteDescription', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteTarget ? isPending(`manage-tag:delete:${deleteTarget._id}`) : false}
              onClick={() => deleteTarget && void remove(deleteTarget._id)}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
