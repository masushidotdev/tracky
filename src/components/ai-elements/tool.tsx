import * as React from 'react';
import { CheckCircle2Icon, ChevronDownIcon, CircleAlertIcon, WrenchIcon } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export function Tool({ className, ...props }: React.ComponentProps<typeof Collapsible>) {
  return <Collapsible className={cn('rounded-2xl border bg-muted/25', className)} {...props} />;
}

export function ToolHeader({ title, state }: { title: string; state: string }) {
  const Icon =
    state === 'output-error' ? CircleAlertIcon : state === 'output-available' ? CheckCircle2Icon : WrenchIcon;
  return (
    <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <ChevronDownIcon className="size-3.5 text-muted-foreground" />
    </CollapsibleTrigger>
  );
}

export function ToolContent({ className, ...props }: React.ComponentProps<typeof CollapsibleContent>) {
  return <CollapsibleContent className={cn('border-t px-3 py-2 text-xs', className)} {...props} />;
}

export function ToolInput({ input }: { input: unknown }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap text-muted-foreground">{JSON.stringify(input, null, 2)}</pre>
  );
}

export function ToolOutput({ output, errorText }: { output?: unknown; errorText?: string }) {
  return errorText ? (
    <p className="text-destructive">{errorText}</p>
  ) : (
    <pre className="overflow-x-auto whitespace-pre-wrap text-muted-foreground">{JSON.stringify(output, null, 2)}</pre>
  );
}
