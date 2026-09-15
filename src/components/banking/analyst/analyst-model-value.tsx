import { analystModels } from './helpers';
import type { SelectableModel } from './helpers';

export function AnalystModelValue({ value }: { value: SelectableModel }) {
  const label = analystModels.find((model) => model.id === value)?.label ?? value;
  return (
    <span data-slot="analyst-model-value" className="line-clamp-1 flex items-center gap-1.5">
      {label}
    </span>
  );
}
