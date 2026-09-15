import * as React from 'react';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export function Reasoning({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Collapsible className="text-xs text-muted-foreground">
      <CollapsibleTrigger className="flex items-center gap-2 py-1">
        <BrainIcon className="size-3.5" />
        {label}
        <ChevronDownIcon className="size-3.5" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 border-l pl-3 leading-relaxed">{children}</CollapsibleContent>
    </Collapsible>
  );
}
