import { SlidersHorizontalIcon, XIcon } from 'lucide-react';

import type {
  ReportAccountOption,
  ReportCategoryOption,
  ReportDatePreset,
  ReportFiltersState,
  ReportGranularity,
  ReportGroupBy,
  ReportTagOption,
} from './types';
import { TagBadge } from '@/components/app/tag-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';

type Option = { id: string; label: string; color?: string };

function MultiSelectFilter({
  allLabel,
  label,
  loadingLabel,
  onChange,
  options,
  selected,
  selectedLabel,
}: {
  allLabel: string;
  label: string;
  loadingLabel: string;
  options: Array<Option> | undefined;
  selected: Array<string>;
  selectedLabel: string;
  onChange: (selected: Array<string>) => void;
}) {
  return (
    <Field className="w-auto min-w-40 gap-1.5">
      <FieldLabel className="text-xs text-muted-foreground">{label}</FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={!options} className="justify-between">
            {options ? (selected.length === 0 ? allLabel : selectedLabel) : loadingLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {options?.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.id}
              checked={selected.includes(option.id)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))
              }
              onSelect={(event) => event.preventDefault()}
            >
              {option.color ? (
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: option.color }} />
              ) : null}
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Field>
  );
}

export function ReportFiltersBar({
  accounts,
  categories,
  filters,
  onChange,
  showGranularity,
  tags,
}: {
  accounts: Array<ReportAccountOption> | undefined;
  categories: Array<ReportCategoryOption> | undefined;
  filters: ReportFiltersState;
  onChange: (filters: ReportFiltersState) => void;
  showGranularity: boolean;
  tags: Array<ReportTagOption> | undefined;
}) {
  const { t } = useI18n();
  const update = <TKey extends keyof ReportFiltersState>(key: TKey, value: ReportFiltersState[TKey]) =>
    onChange({ ...filters, [key]: value });

  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="mb-1 flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SlidersHorizontalIcon className="size-4" />
          <span className="sr-only">{t('reports.filters.title')}</span>
        </div>
        <Field className="w-auto min-w-44 gap-1.5">
          <FieldLabel className="text-xs text-muted-foreground">{t('reports.filters.date')}</FieldLabel>
          <Select value={filters.datePreset} onValueChange={(value) => update('datePreset', value as ReportDatePreset)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                [
                  'last30Days',
                  'last90Days',
                  'thisMonth',
                  'lastMonth',
                  'thisYear',
                  'lastYear',
                  'last12Months',
                  'allTime',
                  'custom',
                ] as const
              ).map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {t(`reports.date.${preset}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {filters.datePreset === 'custom' ? (
          <>
            <Field className="w-auto gap-1.5">
              <FieldLabel htmlFor="reportDateFrom" className="text-xs text-muted-foreground">
                {t('reports.filters.from')}
              </FieldLabel>
              <Input
                id="reportDateFrom"
                className="h-8 w-40"
                type="date"
                value={filters.dateFrom}
                onChange={(event) => update('dateFrom', event.target.value)}
              />
            </Field>
            <Field className="w-auto gap-1.5">
              <FieldLabel htmlFor="reportDateTo" className="text-xs text-muted-foreground">
                {t('reports.filters.to')}
              </FieldLabel>
              <Input
                id="reportDateTo"
                className="h-8 w-40"
                type="date"
                value={filters.dateTo}
                onChange={(event) => update('dateTo', event.target.value)}
              />
            </Field>
          </>
        ) : null}
        <Field className="w-auto min-w-44 gap-1.5">
          <FieldLabel className="text-xs text-muted-foreground">{t('reports.filters.groupBy')}</FieldLabel>
          <Select value={filters.groupBy} onValueChange={(value) => update('groupBy', value as ReportGroupBy)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['category', 'categoryGroup', 'counterparty', 'account'] as const).map((groupBy) => (
                <SelectItem key={groupBy} value={groupBy}>
                  {t(`reports.groupBy.${groupBy}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {showGranularity ? (
          <Field className="w-auto min-w-36 gap-1.5">
            <FieldLabel className="text-xs text-muted-foreground">{t('reports.filters.granularity')}</FieldLabel>
            <Select
              value={filters.granularity}
              onValueChange={(value) => update('granularity', value as ReportGranularity)}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['month', 'quarter', 'year'] as const).map((granularity) => (
                  <SelectItem key={granularity} value={granularity}>
                    {t(`reports.granularity.${granularity}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <MultiSelectFilter
          label={t('reports.filters.accounts')}
          allLabel={t('reports.filters.allAccounts')}
          selectedLabel={t('reports.filters.selected', { count: filters.accountIds.length })}
          loadingLabel={t('common.loading')}
          options={accounts}
          selected={filters.accountIds}
          onChange={(selected) => update('accountIds', selected as ReportFiltersState['accountIds'])}
        />
        <MultiSelectFilter
          label={t('reports.filters.categories')}
          allLabel={t('reports.filters.allCategories')}
          selectedLabel={t('reports.filters.selected', { count: filters.categoryIds.length })}
          loadingLabel={t('common.loading')}
          options={categories}
          selected={filters.categoryIds}
          onChange={(selected) => update('categoryIds', selected as ReportFiltersState['categoryIds'])}
        />
        <MultiSelectFilter
          label={t('reports.filters.tags')}
          allLabel={t('reports.filters.allTags')}
          selectedLabel={t('reports.filters.selected', { count: filters.tagIds.length })}
          loadingLabel={t('common.loading')}
          options={tags}
          selected={filters.tagIds}
          onChange={(selected) => update('tagIds', selected as ReportFiltersState['tagIds'])}
        />
        <Field className="w-auto gap-1.5">
          <FieldLabel htmlFor="reportAmountMin" className="text-xs text-muted-foreground">
            {t('reports.filters.amountMin')}
          </FieldLabel>
          <Input
            id="reportAmountMin"
            className="h-8 w-32"
            inputMode="decimal"
            placeholder={t('reports.filters.amountPlaceholder')}
            value={filters.amountMin}
            onChange={(event) => update('amountMin', event.target.value)}
          />
        </Field>
        <Field className="w-auto gap-1.5">
          <FieldLabel htmlFor="reportAmountMax" className="text-xs text-muted-foreground">
            {t('reports.filters.amountMax')}
          </FieldLabel>
          <Input
            id="reportAmountMax"
            className="h-8 w-32"
            inputMode="decimal"
            placeholder={t('reports.filters.amountPlaceholder')}
            value={filters.amountMax}
            onChange={(event) => update('amountMax', event.target.value)}
          />
        </Field>
        {filters.tagIds.length > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground">{t('reports.filters.activeTags')}</span>
            {filters.tagIds.map((tagId) => {
              const tag = tags?.find((candidate) => candidate.id === tagId);
              if (!tag) return null;
              return (
                <Button
                  key={tag.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto gap-1 px-1"
                  aria-label={t('reports.filters.removeTag', { name: tag.label })}
                  onClick={() => update('tagIds', filters.tagIds.filter((id) => id !== tag.id))}
                >
                  <TagBadge tag={{ name: tag.label, color: tag.color }} />
                  <XIcon className="size-3.5" />
                </Button>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
