import { CopyPlusIcon, PlusIcon, Settings2Icon, SparklesIcon, XIcon } from 'lucide-react';

import type { ForecastScenario } from './forecast-utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const DEFAULT_SCENARIO_COLOR = 'var(--chart-1)';

export function ScenarioBar({
  activeId,
  compareId,
  isPending,
  onCompareChange,
  onCreate,
  onOpenSettings,
  onSelect,
  scenarios,
}: {
  activeId: ForecastScenario['_id'];
  compareId?: ForecastScenario['_id'];
  isPending: boolean;
  onCompareChange: (scenarioId?: ForecastScenario['_id']) => void;
  onCreate: (mode: 'duplicate' | 'fresh') => void;
  onOpenSettings: () => void;
  onSelect: (scenarioId: ForecastScenario['_id']) => void;
  scenarios: Array<ForecastScenario>;
}) {
  const { t } = useI18n();
  const compareScenario = scenarios.find((scenario) => scenario._id === compareId);
  const comparisonOptions = scenarios.filter((scenario) => scenario._id !== activeId);

  return (
    <div className="grid gap-3 rounded-3xl border bg-card p-2.5 shadow-xs">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        {scenarios.map((scenario) => {
          const active = scenario._id === activeId;
          return (
            <button
              key={scenario._id}
              type="button"
              aria-pressed={active}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
              )}
              style={active ? undefined : { borderColor: scenario.color ?? DEFAULT_SCENARIO_COLOR }}
              onClick={() => onSelect(scenario._id)}
            >
              <span aria-hidden>{scenario.icon?.trim() || '◆'}</span>
              <span>{scenario.name}</span>
            </button>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={isPending}>
              <PlusIcon data-icon="inline-start" />
              {t('forecast.scenarios.new')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => onCreate('duplicate')}>
              <CopyPlusIcon />
              {t('forecast.scenarios.duplicateCurrent')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCreate('fresh')}>
              <SparklesIcon />
              {t('forecast.scenarios.fresh')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={t('forecast.scenarios.settings')}
          onClick={onOpenSettings}
        >
          <Settings2Icon />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {comparisonOptions.length > 0 ? (
          <Select
            value={compareId ?? ''}
            onValueChange={(value) => onCompareChange(value as ForecastScenario['_id'])}
          >
            <SelectTrigger className="w-auto min-w-48" size="sm" aria-label={t('forecast.compare.pick')}>
              <SelectValue placeholder={t('forecast.compare.pick')} />
            </SelectTrigger>
            <SelectContent>
              {comparisonOptions.map((scenario) => (
                <SelectItem key={scenario._id} value={scenario._id}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{scenario.icon?.trim() || '◆'}</span>
                    {scenario.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">{t('forecast.compare.needScenario')}</span>
        )}
        {compareScenario ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onCompareChange(undefined)}>
            {t('forecast.compare.vs', { name: compareScenario.name })}
            <XIcon data-icon="inline-end" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
