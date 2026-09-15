import type { EurosMode } from './forecast-utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useI18n } from '@/lib/i18n';

export function TodaysEurosToggle({ mode, onChange }: { mode: EurosMode; onChange: (mode: EurosMode) => void }) {
  const { t } = useI18n();

  return (
    <ToggleGroup
      type="single"
      value={mode}
      variant="outline"
      spacing={0}
      aria-label={t('forecast.euros.label')}
      onValueChange={(value) => value && onChange(value as EurosMode)}
    >
      <ToggleGroupItem value="today">{t('forecast.euros.today')}</ToggleGroupItem>
      <ToggleGroupItem value="future">{t('forecast.euros.future')}</ToggleGroupItem>
    </ToggleGroup>
  );
}
