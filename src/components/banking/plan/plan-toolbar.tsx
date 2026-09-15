import { CheckIcon, PencilRulerIcon, WalletIcon } from 'lucide-react';

import { PLAN_FILTERS, PLAN_FILTER_LABEL_KEYS } from './plan-filters';
import type { PlanFilter } from './plan-filters';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';

export function PlanToolbar({
  editing,
  filter,
  matchCount,
  onEditAccounts,
  onEditingChange,
  onFilterChange,
}: {
  editing: boolean;
  filter: PlanFilter;
  matchCount: number;
  onEditAccounts: () => void;
  onEditingChange: (editing: boolean) => void;
  onFilterChange: (filter: PlanFilter) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Select value={filter} onValueChange={(value) => onFilterChange(value as PlanFilter)} disabled={editing}>
          <SelectTrigger size="sm" className="w-52" aria-label={t('plan.filter.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAN_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(PLAN_FILTER_LABEL_KEYS[value])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filter !== 'all' && !editing ? (
          <span className="text-xs text-muted-foreground">{t('plan.filter.matches', { count: matchCount })}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {/* Changing the plan's perimeter is what a user looks for right after pressing Edit plan. */}
        {editing ? (
          <Button type="button" variant="outline" size="sm" onClick={onEditAccounts}>
            <WalletIcon data-icon="inline-start" />
            {t('plan.accounts.edit.title')}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={editing ? 'default' : 'outline'}
          size="sm"
          aria-pressed={editing}
          onClick={() => onEditingChange(!editing)}
        >
          {editing ? <CheckIcon data-icon="inline-start" /> : <PencilRulerIcon data-icon="inline-start" />}
          {t(editing ? 'plan.edit.done' : 'plan.edit.action')}
        </Button>
      </div>
    </div>
  );
}
