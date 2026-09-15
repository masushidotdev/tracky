import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function PromptInput({ className, ...props }: React.ComponentProps<'form'>) {
  return <form className={cn('rounded-3xl border bg-card p-2 shadow-sm', className)} {...props} />;
}

export function PromptInputTextarea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      rows={2}
      className={cn(
        'max-h-40 min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0',
        className,
      )}
      {...props}
    />
  );
}

export function PromptInputFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex items-center justify-between gap-2 px-1 pb-1', className)} {...props} />;
}

export function PromptInputSubmit(props: React.ComponentProps<typeof Button>) {
  return <Button type="submit" size="sm" {...props} />;
}
