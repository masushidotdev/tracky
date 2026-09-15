import * as React from 'react';
import { useMutation } from 'convex/react';
import { CheckIcon, PlusIcon, Settings2Icon, TagsIcon } from 'lucide-react';

import { api } from '../../../../convex/_generated/api';
import type { Doc, Id } from '../../../../convex/_generated/dataModel';
import { TagBadge } from '@/components/app/tag-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePendingAction } from '@/hooks/use-pending-action';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type TransactionTag = Doc<'transactionTags'>;

type TagPickerProps = {
  allowCreate?: boolean;
  className?: string;
  disabled?: boolean;
  maxSelected?: number;
  onChange: (tagIds: Array<Id<'transactionTags'>>) => void | Promise<void>;
  onManage?: () => void;
  selectedTagIds: Array<Id<'transactionTags'>>;
  tags: Array<TransactionTag> | undefined;
  triggerLabel?: string;
};

function tagErrorMessage(error: unknown, fallback: string, duplicate: string, limit: string, invalid: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('already exists')) return duplicate;
  if (message.includes('At most 50')) return limit;
  if (message.includes('between 1 and 30')) return invalid;
  return fallback;
}

export function TagPicker({
  allowCreate = true,
  className,
  disabled,
  maxSelected = 10,
  onChange,
  onManage,
  selectedTagIds,
  tags,
  triggerLabel,
}: TagPickerProps) {
  const { t } = useI18n();
  const createTag = useMutation(api.banking.transactionMeta.createTag);
  const { isPending, run } = usePendingAction();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredTags = React.useMemo(
    () =>
      tags?.filter((tag) => !normalizedSearch || tag.name.toLocaleLowerCase().includes(normalizedSearch)) ?? [],
    [normalizedSearch, tags],
  );
  const exactMatch = tags?.some((tag) => tag.name.toLocaleLowerCase() === normalizedSearch) ?? false;
  const canCreate =
    allowCreate &&
    Boolean(normalizedSearch) &&
    search.trim().length <= 30 &&
    selectedTagIds.length < maxSelected &&
    !exactMatch &&
    (tags?.length ?? 0) < 50;

  const toggle = (tagId: Id<'transactionTags'>) => {
    setError(null);
    const selected = selectedTagIds.includes(tagId);
    if (!selected && selectedTagIds.length >= maxSelected) {
      setError(t('transactions.tags.selectionLimit', { count: maxSelected }));
      return;
    }
    void onChange(selected ? selectedTagIds.filter((id) => id !== tagId) : [...selectedTagIds, tagId]);
  };

  const create = async () => {
    const name = search.trim();
    if (!name || name.length > 30) {
      setError(t('transactions.tags.nameInvalid'));
      return;
    }

    const result: { tagId?: Id<'transactionTags'> } = {};
    const succeeded = await run(
      'create-tag',
      async () => {
        try {
          result.tagId = await createTag({ name });
        } catch (createError) {
          setError(
            tagErrorMessage(
              createError,
              t('transactions.tags.createFailed'),
              t('transactions.tags.duplicate'),
              t('transactions.tags.tagLimit'),
              t('transactions.tags.nameInvalid'),
            ),
          );
          throw createError;
        }
      },
      {
        success: t('transactions.tags.created'),
        error: t('transactions.tags.createFailed'),
      },
    );
    if (!succeeded || !result.tagId) return;

    setError(null);
    setSearch('');
    await onChange([...selectedTagIds, result.tagId]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearch('');
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className={cn('justify-start', className)}>
          <TagsIcon data-icon="inline-start" />
          {triggerLabel ??
            (selectedTagIds.length > 0
              ? t('transactions.tags.selected', { count: selectedTagIds.length })
              : t('transactions.tags.choose'))}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(360px,calc(100vw-2rem))] gap-0 overflow-hidden p-0">
        <PopoverHeader className="gap-3 border-b p-4">
          <div>
            <PopoverTitle>{t('transactions.tags.pickerTitle')}</PopoverTitle>
            <PopoverDescription>{t('transactions.tags.pickerDescription')}</PopoverDescription>
          </div>
          <Input
            autoFocus
            maxLength={30}
            value={search}
            placeholder={t('transactions.tags.search')}
            aria-label={t('transactions.tags.search')}
            onChange={(event) => {
              setSearch(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canCreate) {
                event.preventDefault();
                void create();
              }
            }}
          />
        </PopoverHeader>
        <ScrollArea className="max-h-64">
          <div className="flex flex-col gap-1 p-2">
            {tags === undefined ? (
              <div className="p-3 text-sm text-muted-foreground">{t('common.loading')}</div>
            ) : filteredTags.length > 0 ? (
              filteredTags.map((tag) => {
                const selected = selectedTagIds.includes(tag._id);
                const selectionDisabled = !selected && selectedTagIds.length >= maxSelected;
                return (
                  <Button
                    key={tag._id}
                    type="button"
                    variant="ghost"
                    className="justify-start"
                    disabled={selectionDisabled}
                    onClick={() => toggle(tag._id)}
                  >
                    <TagBadge tag={tag} className="border-0 bg-transparent px-0" />
                    <CheckIcon className={cn('ml-auto', selected ? 'opacity-100' : 'opacity-0')} />
                  </Button>
                );
              })
            ) : (
              <div className="p-3 text-sm text-muted-foreground">{t('transactions.tags.noResults')}</div>
            )}
          </div>
        </ScrollArea>
        {canCreate ? (
          <div className="border-t p-2">
            <Button type="button" variant="ghost" className="w-full justify-start" disabled={isPending('create-tag')} onClick={() => void create()}>
              <PlusIcon />
              {t('transactions.tags.createNamed', { name: search.trim() })}
            </Button>
          </div>
        ) : null}
        {error ? <div className="border-t px-4 py-2 text-xs text-destructive">{error}</div> : null}
        {onManage ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
            >
              <Settings2Icon />
              {t('transactions.tags.manage')}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
