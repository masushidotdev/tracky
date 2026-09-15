import * as React from 'react';
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, SparklesIcon, Trash2Icon } from 'lucide-react';

import type { ForecastScenario } from './forecast-utils';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const SCENARIO_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

export function ScenarioSettingsDialog({
  canMoveDown,
  canMoveUp,
  isPending,
  onCreate,
  onDelete,
  onMove,
  onOpenChange,
  onSave,
  open,
  scenario,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  isPending: boolean;
  onCreate: (mode: 'duplicate' | 'fresh') => void;
  onDelete: () => Promise<boolean>;
  onMove: (direction: 'up' | 'down') => void;
  onOpenChange: (open: boolean) => void;
  onSave: (values: { name: string; icon: string; color: string }) => Promise<boolean>;
  open: boolean;
  scenario: ForecastScenario;
}) {
  const { t } = useI18n();
  const [name, setName] = React.useState(scenario.name);
  const [icon, setIcon] = React.useState(scenario.icon ?? '◆');
  const [color, setColor] = React.useState(scenario.color ?? SCENARIO_COLORS[0]);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(scenario.name);
    setIcon(scenario.icon ?? '◆');
    setColor(scenario.color ?? SCENARIO_COLORS[0]);
  }, [open, scenario]);

  const save = async () => {
    const ok = await onSave({ name, icon, color });
    if (ok) onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('forecast.scenarios.settingsTitle')}</DialogTitle>
            <DialogDescription>{t('forecast.scenarios.settingsDescription')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-scenario-name">{t('forecast.scenarios.name')}</Label>
              <Input
                id="forecast-scenario-name"
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="forecast-scenario-icon">{t('forecast.scenarios.icon')}</Label>
              <Input
                id="forecast-scenario-icon"
                value={icon}
                maxLength={8}
                placeholder="◆"
                onChange={(event) => setIcon(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('forecast.scenarios.color')}</Label>
              <div className="flex flex-wrap gap-2">
                {SCENARIO_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={t('forecast.scenarios.selectColor')}
                    aria-pressed={color === option}
                    className={cn(
                      'size-8 rounded-full border-4 border-card shadow-sm ring-offset-2 transition-transform hover:scale-105',
                      color === option ? 'ring-2 ring-ring' : undefined,
                    )}
                    style={{ backgroundColor: option }}
                    onClick={() => setColor(option)}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-2 rounded-2xl border p-3">
              <p className="text-sm font-medium">{t('forecast.scenarios.order')}</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={!canMoveUp || isPending} onClick={() => onMove('up')}>
                  <ArrowUpIcon data-icon="inline-start" />
                  {t('forecast.scenarios.moveUp')}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={!canMoveDown || isPending} onClick={() => onMove('down')}>
                  <ArrowDownIcon data-icon="inline-start" />
                  {t('forecast.scenarios.moveDown')}
                </Button>
              </div>
            </div>

            <div className="grid gap-2 rounded-2xl border p-3">
              <p className="text-sm font-medium">{t('forecast.scenarios.createAnother')}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => onCreate('duplicate')}>
                  <CopyIcon data-icon="inline-start" />
                  {t('forecast.scenarios.duplicate')}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => onCreate('fresh')}>
                  <SparklesIcon data-icon="inline-start" />
                  {t('forecast.scenarios.fresh')}
                </Button>
              </div>
            </div>

            <Button type="button" variant="destructive" disabled={isPending} onClick={() => setDeleteOpen(true)}>
              <Trash2Icon data-icon="inline-start" />
              {t('forecast.scenarios.delete')}
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={!name.trim() || isPending} onClick={() => void save()}>
              {isPending ? t('forecast.actions.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('forecast.scenarios.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('forecast.scenarios.deleteDescription', { name: scenario.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={() => void onDelete().then((ok) => ok && setDeleteOpen(false))}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
