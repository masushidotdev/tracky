import * as React from 'react';
import { Streamdown } from 'streamdown';

import { cn } from '@/lib/utils';

export function Message({ from, className, ...props }: React.ComponentProps<'article'> & { from: string }) {
  return (
    <article
      data-from={from}
      className={cn('flex w-full data-[from=user]:justify-end data-[from=assistant]:justify-start', className)}
      {...props}
    />
  );
}

export function MessageContent({ from, className, ...props }: React.ComponentProps<'div'> & { from: string }) {
  return (
    <div
      className={cn(
        'max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-relaxed data-[from=user]:bg-primary data-[from=user]:text-primary-foreground',
        className,
      )}
      data-from={from}
      {...props}
    />
  );
}

export function MessageResponse({ children, className }: { children: string; className?: string }) {
  return (
    <Streamdown
      className={cn(
        'prose prose-sm max-w-none text-current [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto',
        className,
      )}
      controls={false}
    >
      {children}
    </Streamdown>
  );
}
