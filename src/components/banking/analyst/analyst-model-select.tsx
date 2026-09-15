import { ChevronDownIcon } from 'lucide-react';
import { AnalystModelValue } from './analyst-model-value';
import { analystModels, selectAnalystModel } from './helpers';
import type { SelectableModel } from './helpers';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/lib/i18n';

// DropdownMenu instead of Select: inside the chat composer the Select popup
// fails to open, and the menu must open upward above the prompt input.
export function AnalystModelSelect({
  value,
  onChange,
}: {
  value: SelectableModel;
  onChange: (value: SelectableModel) => void;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t('analyst.model.label')}
          className="max-w-44 bg-input/50"
        >
          <AnalystModelValue value={value} />
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8}>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => selectAnalystModel(next, onChange)}>
          {analystModels.map((model) => (
            <DropdownMenuRadioItem key={model.id} value={model.id}>
              {model.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
