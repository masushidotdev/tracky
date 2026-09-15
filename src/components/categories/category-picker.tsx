import * as React from 'react';
import { SearchXIcon, TagIcon } from 'lucide-react';

import { CategoryIcon } from './category-icon';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
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
import { categoryDisplayName, categorySupportsKind } from '@/lib/categories';
import { useI18n } from '@/lib/i18n';

const categoryKinds = ['expense', 'income', 'transfer', 'internal'] as const;

export function CategoryPicker({
  categories,
  category,
  onValueChange,
  triggerLabel,
}: {
  categories: Array<Doc<'categories'>>;
  category: Doc<'categories'> | null;
  onValueChange: (categoryId: Id<'categories'> | null) => void;
  triggerLabel?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const deferredSearch = React.useDeferredValue(search.trim().toLocaleLowerCase());
  const filteredCategories = React.useMemo(
    () =>
      deferredSearch
        ? categories.filter((candidate) =>
            categoryDisplayName(candidate, t).toLocaleLowerCase().includes(deferredSearch),
          )
        : categories,
    [categories, deferredSearch, t],
  );

  const select = (categoryId: Id<'categories'> | null) => {
    onValueChange(categoryId);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full min-w-0 justify-start"
          onClick={(event) => event.stopPropagation()}
        >
          {category ? <CategoryIcon category={category} className="size-6 [&_svg]:size-3" /> : <TagIcon />}
          <span className="truncate">
            {triggerLabel ?? (category ? categoryDisplayName(category, t) : t('transactions.category.none'))}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="h-[min(500px,var(--radix-popover-content-available-height))] w-[min(420px,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <PopoverHeader className="shrink-0 gap-3 border-b p-4">
          <div>
            <PopoverTitle>{t('transactions.category.pickerTitle')}</PopoverTitle>
            <PopoverDescription>{t('transactions.category.pickerDescription')}</PopoverDescription>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('transactions.category.search')}
            aria-label={t('transactions.category.search')}
            autoFocus
          />
        </PopoverHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 p-4">
            {!deferredSearch ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">{t('transactions.category.quickActions')}</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={category === null ? 'secondary' : 'ghost'}
                    className="h-auto min-h-24 flex-col gap-2 whitespace-normal"
                    onClick={() => select(null)}
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                      <TagIcon />
                    </span>
                    <span className="line-clamp-2 text-center text-xs">{t('transactions.category.none')}</span>
                  </Button>
                </div>
              </section>
            ) : null}

            {categoryKinds.map((kind) => {
              const kindCategories = filteredCategories.filter((candidate) => categorySupportsKind(candidate, kind));
              if (kindCategories.length === 0) return null;
              const label =
                kind === 'expense'
                  ? t('transactions.category.expenses')
                  : kind === 'income'
                    ? t('transactions.category.incomes')
                    : kind === 'transfer'
                      ? t('transactions.category.transfers')
                      : t('transactions.category.internal');

              return (
                <section key={kind} className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {kindCategories.map((candidate) => (
                      <Button
                        key={candidate._id}
                        type="button"
                        variant={candidate._id === category?._id ? 'secondary' : 'ghost'}
                        className="h-auto min-h-24 flex-col gap-2 whitespace-normal"
                        onClick={() => select(candidate._id)}
                      >
                        <CategoryIcon category={candidate} className="size-10 [&_svg]:size-5" />
                        <span className="line-clamp-2 text-center text-xs">{categoryDisplayName(candidate, t)}</span>
                      </Button>
                    ))}
                  </div>
                </section>
              );
            })}

            {filteredCategories.length === 0 ? (
              <Empty className="min-h-52 p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchXIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t('transactions.category.noResults')}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : null}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
